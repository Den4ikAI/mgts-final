//! Dataset photos and ML quality reports, read straight from disk.
//!
//! * `GET /api/media/{*path}` — a file under `MEDIA_ROOT` (the dataset folder the
//!   ML worker ran on; it writes `crop_uri = /api/media/<relative path>`).
//! * `GET /api/quality?run=` — `report.json` written by `ml/evaluate.py` under
//!   `RUNS_DIR/<run_id>/`; the newest one by default, plus the list of runs.

use std::path::{Component, Path, PathBuf};

use axum::{
    body::Body,
    extract::{Path as UrlPath, Query, State},
    http::{header, HeaderValue},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::{IntoParams, ToSchema};

use crate::{
    auth::{AuthUser, Perm},
    error::{ApiError, ErrorBody},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/media/{*path}", get(media))
        .route("/api/quality", get(quality))
        .route("/api/taxonomy", get(taxonomy))
}

#[derive(Clone)]
pub struct FileDirs {
    pub media_root: Option<PathBuf>,
    pub runs_dir: PathBuf,
    pub taxonomy: PathBuf,
}

impl FileDirs {
    pub fn from_env() -> Self {
        let media_root = std::env::var("MEDIA_ROOT").ok().filter(|s| !s.is_empty()).map(PathBuf::from);
        let runs_dir = PathBuf::from(std::env::var("RUNS_DIR").unwrap_or_else(|_| "../ml/runs".into()));
        if media_root.is_none() {
            tracing::warn!("MEDIA_ROOT not set: /api/media disabled, photos will not show");
        }
        let taxonomy = PathBuf::from(std::env::var("TAXONOMY_PATH").unwrap_or_else(|_| "../ml/taxonomy.json".into()));
        Self { media_root, runs_dir, taxonomy }
    }
}

/// Rejects `..`, absolute paths and anything that is not a plain relative path.
fn safe_join(root: &Path, rel: &str) -> Option<PathBuf> {
    let rel = Path::new(rel);
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return None;
    }
    Some(root.join(rel))
}

fn content_type(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("gif") => "image/gif",
        _ => "application/octet-stream",
    }
}

/// Фото из датасета (`MEDIA_ROOT`). Путь — как в `crop_uri` после `/api/media/`.
#[utoipa::path(get, path = "/api/media/{path}", tag = "files", params(("path" = String, Path, example = "МП. ТКШ/26224137.jpg")), security(("bearer" = [])),
    responses((status = 200, description = "Картинка", content_type = "image/*", body = Vec<u8>),
              (status = 400, body = ErrorBody), (status = 401, body = ErrorBody), (status = 404, body = ErrorBody)))]
async fn media(
    State(s): State<AppState>,
    user: AuthUser,
    UrlPath(rel): UrlPath<String>,
) -> Result<Response, ApiError> {
    user.require(Perm::ObjectsRead)?;
    let root = s.files.media_root.as_ref().ok_or_else(|| ApiError::not_found("MEDIA_ROOT not configured"))?;
    let path = safe_join(root, &rel).ok_or_else(|| ApiError::bad_request("bad path"))?;
    // Symlinks inside the dataset must not lead outside it either.
    let path_c = match (tokio::fs::canonicalize(root).await, tokio::fs::canonicalize(&path).await) {
        (Ok(r), Ok(p)) if p.starts_with(&r) => p,
        _ => return Err(ApiError::not_found("no such file")),
    };
    let bytes = tokio::fs::read(&path_c).await.map_err(|_| ApiError::not_found("no such file"))?;
    let mut res = Body::from(bytes).into_response();
    let h = res.headers_mut();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type(&path_c)));
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("private, max-age=3600"));
    Ok(res)
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
struct QualityQuery {
    /// id прогона; по умолчанию самый свежий
    run: Option<String>,
}

#[derive(Serialize, ToSchema)]
struct RunInfo {
    run_id: String,
    modified: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, ToSchema)]
struct Quality {
    runs: Vec<RunInfo>,
    /// report.json из ml/evaluate.py
    #[schema(value_type = Option<Object>)]
    report: Option<Value>,
}

/// Отчёт о качестве модели против разметки организаторов.
#[utoipa::path(get, path = "/api/quality", tag = "stats", params(QualityQuery), security(("bearer" = [])),
    responses((status = 200, body = Quality), (status = 401, body = ErrorBody), (status = 403, body = ErrorBody)))]
async fn quality(
    State(s): State<AppState>,
    user: AuthUser,
    Query(q): Query<QualityQuery>,
) -> Result<Json<Quality>, ApiError> {
    user.require(Perm::StatsRead)?;
    let mut runs = Vec::new();
    if let Ok(mut dir) = tokio::fs::read_dir(&s.files.runs_dir).await {
        while let Ok(Some(e)) = dir.next_entry().await {
            let report = e.path().join("report.json");
            if let Ok(meta) = tokio::fs::metadata(&report).await {
                if let Ok(m) = meta.modified() {
                    runs.push(RunInfo { run_id: e.file_name().to_string_lossy().into_owned(), modified: m.into() });
                }
            }
        }
    }
    runs.sort_by(|a, b| b.modified.cmp(&a.modified));
    let pick = match &q.run {
        Some(r) => runs.iter().find(|x| &x.run_id == r).map(|x| x.run_id.clone()),
        None => runs.first().map(|x| x.run_id.clone()),
    };
    let report = match pick {
        Some(id) => {
            let text = tokio::fs::read_to_string(s.files.runs_dir.join(&id).join("report.json")).await?;
            Some(serde_json::from_str(&text)?)
        }
        None => None,
    };
    Ok(Json(Quality { runs, report }))
}

/// Class keys → Russian labels etc., straight from ml/taxonomy.json (single source).
#[utoipa::path(get, summary = "Классы дефектов и типы объектов (ml/taxonomy.json)", path = "/api/taxonomy", tag = "stats", security(("bearer" = [])),
    responses((status = 200, description = "ml/taxonomy.json как есть", body = Object), (status = 401, body = ErrorBody)))]
async fn taxonomy(State(s): State<AppState>, user: AuthUser) -> Result<Json<Value>, ApiError> {
    user.require(Perm::ObjectsRead)?;
    let text = tokio::fs::read_to_string(&s.files.taxonomy)
        .await
        .map_err(|_| ApiError::not_found("taxonomy.json not found (TAXONOMY_PATH)"))?;
    Ok(Json(serde_json::from_str(&text)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal() {
        let root = Path::new("/data");
        assert_eq!(safe_join(root, "a/b.jpg"), Some(PathBuf::from("/data/a/b.jpg")));
        assert!(safe_join(root, "../etc/passwd").is_none());
        assert!(safe_join(root, "a/../../x").is_none());
        assert!(safe_join(root, "/etc/passwd").is_none());
    }
}
