//! Photo upload: bytes go to object storage, a `frames.ingested` event to Kafka;
//! the ML worker answers with `frames.analyzed` (see projection.rs).
//!
//! * `POST /api/frames` — multipart, one or many photos
//! * `GET  /api/frames` — recent uploads with the model's verdict
//! * `GET  /api/frames/{id}`

use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use domain::{topics, Envelope, FrameIngested, GeoPoint};

use crate::{
    auth::{AuthUser, Perm},
    error::{ApiError, ApiResult, ErrorBody},
    AppState,
};

const MAX_FILE: usize = 20 * 1024 * 1024;
const MAX_FILES: usize = 100;
/// Whole request; the form is read into memory before anything is stored.
const MAX_BODY: usize = 256 * 1024 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/frames",
            get(list_frames)
                .post(upload)
                        .layer(DefaultBodyLimit::max(MAX_BODY)),
        )
        .route("/api/frames/{id}", get(get_frame))
}

/// Photo and the model's verdict.
#[derive(Serialize, sqlx::FromRow, ToSchema)]
pub struct FrameRow {
    id: Uuid,
    /// upload | vehicle | dataset
    source: String,
    /// Фото через API: `/api/media/store/<key>`
    media_uri: String,
    file_name: Option<String>,
    uploaded_by: Option<String>,
    object_id: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    /// queued | done | error
    #[schema(example = "done")]
    status: String,
    /// FrameAnalyzed: route, defect_type, severity, confidence, rationale…
    #[schema(value_type = Option<domain::FrameAnalyzed>)]
    result: Option<Value>,
    size_bytes: i64,
    created_at: DateTime<Utc>,
    analyzed_at: Option<DateTime<Utc>>,
}

/// Frame + its verdict (if any). The verdict may fill in what the uploader did not
/// know: object id (from the model run) and position (from EXIF).
const SELECT: &str = "SELECT f.id, f.source, f.media_uri, f.file_name, f.uploaded_by,
        COALESCE(f.object_id, v.result->>'object_id') AS object_id,
        COALESCE(f.lat, (v.result->'position'->>'lat')::float8) AS lat,
        COALESCE(f.lon, (v.result->'position'->>'lon')::float8) AS lon,
        COALESCE(v.status, 'queued') AS status, v.result, f.size_bytes, f.created_at, v.analyzed_at
    FROM frames f LEFT JOIN frame_verdicts v ON v.frame_id = f.id";

#[derive(Serialize, ToSchema)]
struct Accepted {
    frame_id: Uuid,
    file_name: Option<String>,
    media_uri: String,
    /// Повторная загрузка того же файла: байты в хранилище уже есть
    duplicate: bool,
}

/// Multipart form for `POST /api/frames` (for the docs only).
#[derive(ToSchema)]
#[allow(dead_code)]
struct UploadForm {
    /// Одно или несколько фото: JPEG, PNG, WebP, до 20 МБ каждое
    #[schema(value_type = Vec<String>, format = Binary)]
    files: Vec<Vec<u8>>,
    /// id объекта из реестра, если известен (иначе IMG-<id кадра>)
    object_id: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
}

fn sniff(b: &[u8]) -> Option<(&'static str, &'static str)> {
    match b {
        [0xFF, 0xD8, 0xFF, ..] => Some(("image/jpeg", "jpg")),
        [0x89, b'P', b'N', b'G', ..] => Some(("image/png", "png")),
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => Some(("image/webp", "webp")),
        _ => None,
    }
}

/// Загрузить фото на анализ. Ответ сразу (202); вердикт модели приходит
/// в live-поток (`frame_analyzed`) и в `GET /api/frames/{id}` за 1–3 с.
#[utoipa::path(post, path = "/api/frames", tag = "frames", summary = "Загрузить фото на анализ",
    request_body(content = UploadForm, content_type = "multipart/form-data"),
    security(("bearer" = [])),
    responses((status = 202, body = Vec<Accepted>), (status = 400, body = ErrorBody), (status = 401, body = ErrorBody),
              (status = 403, body = ErrorBody), (status = 413, description = "Файл больше 20 МБ", body = ErrorBody),
              (status = 415, description = "Не JPEG/PNG/WebP", body = ErrorBody)))]
async fn upload(
    State(s): State<AppState>,
    user: AuthUser,
    mut form: Multipart,
) -> Result<(StatusCode, Json<Vec<Accepted>>), ApiError> {
    user.require(Perm::FramesUpload)?;
    let bad = |m: String| ApiError::bad_request(m);
    let (mut files, mut object_id, mut lat, mut lon) = (Vec::new(), None, None, None);
    while let Some(field) = form.next_field().await.map_err(|e| bad(format!("multipart: {e}")))? {
        let name = field.name().unwrap_or_default().to_string();
        if let Some(file_name) = field.file_name().map(str::to_string) {
            if files.len() == MAX_FILES {
                return Err(bad(format!("at most {MAX_FILES} files per request")));
            }
            let bytes = field.bytes().await.map_err(|e| bad(format!("{file_name}: {e}")))?;
            if bytes.len() > MAX_FILE {
                return Err(ApiError::Status(StatusCode::PAYLOAD_TOO_LARGE, format!("{file_name}: larger than 20 MB")));
            }
            files.push((file_name, bytes));
            continue;
        }
        let text = field.text().await.map_err(|e| bad(format!("{name}: {e}")))?;
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        let num = |v: &str| v.replace(',', ".").parse::<f64>().map_err(|_| bad(format!("{name}: not a number")));
        match name.as_str() {
            "object_id" => object_id = Some(text.chars().take(100).collect::<String>()),
            "lat" => lat = Some(num(text)?).filter(|v| (-90.0..=90.0).contains(v)),
            "lon" => lon = Some(num(text)?).filter(|v| (-180.0..=180.0).contains(v)),
            _ => {}
        }
    }
    if files.is_empty() {
        return Err(bad("no files: send photos in multipart field `files`".into()));
    }
    let position = lat.zip(lon).map(|(lat, lon)| GeoPoint { lat, lon });

    // Check every file first: a bad one rejects the whole request before anything is stored.
    let mut checked = Vec::with_capacity(files.len());
    for (file_name, bytes) in files {
        let (content_type, ext) = sniff(&bytes).ok_or_else(|| {
            ApiError::Status(StatusCode::UNSUPPORTED_MEDIA_TYPE, format!("{file_name}: not a JPEG, PNG or WebP image"))
        })?;
        checked.push((file_name, bytes, content_type, ext));
    }

    let mut out = Vec::with_capacity(checked.len());
    for (file_name, bytes, content_type, ext) in checked {
        let sha = hex(&Sha256::digest(&bytes));
        let key = format!("frames/{}/{sha}.{ext}", Utc::now().format("%Y/%m/%d"));
        let duplicate: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM frames WHERE sha256 = $1)")
            .bind(&sha)
            .fetch_one(&s.db)
            .await?;
        s.storage.put(&key, &bytes, content_type).await.map_err(ApiError::Internal)?;

        let ev = FrameIngested {
            frame_id: Uuid::now_v7(),
            source: "upload".into(),
            image_uri: s.storage.uri(&key),
            media_uri: format!("/api/media/store/{key}"),
            sha256: sha,
            content_type: content_type.into(),
            size_bytes: bytes.len() as u64,
            file_name: Some(file_name.chars().take(200).collect()),
            uploaded_by: Some(user.0.login.clone()),
            object_id: object_id.clone(),
            position,
            captured_at: None,
            vehicle_id: None,
            heading: None,
        };
        // Write the row now so the uploader sees "queued" at once; the
        // projection inserts the same row on replay (idempotent).
        insert_frame(&s.db, &ev).await?;
        s.producer
            .send(topics::FRAMES, &Envelope::new(ev.frame_id.to_string(), "api.upload", &ev))
            .await?;
        out.push(Accepted { frame_id: ev.frame_id, file_name: ev.file_name, media_uri: ev.media_uri, duplicate });
    }
    tracing::info!(by = %user.0.login, n = out.len(), "frames uploaded");
    Ok((StatusCode::ACCEPTED, Json(out)))
}

pub async fn insert_frame(db: &sqlx::PgPool, f: &FrameIngested) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO frames (id, source, image_uri, media_uri, sha256, content_type, size_bytes,
                             file_name, uploaded_by, object_id, lat, lon)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING",
    )
    .bind(f.frame_id)
    .bind(&f.source)
    .bind(&f.image_uri)
    .bind(&f.media_uri)
    .bind(&f.sha256)
    .bind(&f.content_type)
    .bind(f.size_bytes as i64)
    .bind(&f.file_name)
    .bind(&f.uploaded_by)
    .bind(&f.object_id)
    .bind(f.position.map(|p| p.lat))
    .bind(f.position.map(|p| p.lon))
    .execute(db)
    .await?;
    Ok(())
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
struct FrameQuery {
    /// Только мои загрузки
    #[serde(default)]
    mine: bool,
    /// queued | done | error
    status: Option<String>,
    /// По умолчанию 100, максимум 1000
    limit: Option<i64>,
}

#[utoipa::path(get, path = "/api/frames", tag = "frames", summary = "Загруженные фото и вердикт модели, свежие сверху",
    params(FrameQuery), security(("bearer" = [])),
    responses((status = 200, body = Vec<FrameRow>), (status = 401, body = ErrorBody)))]
async fn list_frames(
    State(s): State<AppState>,
    user: AuthUser,
    Query(q): Query<FrameQuery>,
) -> ApiResult<Vec<FrameRow>> {
    user.require(Perm::ObjectsRead)?;
    let rows = sqlx::query_as::<_, FrameRow>(&format!(
        "{SELECT}
         WHERE ($1::text IS NULL OR f.uploaded_by = $1) AND ($2::text IS NULL OR COALESCE(v.status, 'queued') = $2)
         ORDER BY f.created_at DESC LIMIT $3"
    ))
    .bind(q.mine.then(|| user.0.login.clone()))
    .bind(q.status)
    .bind(q.limit.unwrap_or(100).clamp(1, 1000))
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[utoipa::path(get, path = "/api/frames/{id}", tag = "frames", summary = "Одно фото и вердикт модели",
    params(("id" = Uuid, Path)), security(("bearer" = [])),
    responses((status = 200, body = FrameRow), (status = 401, body = ErrorBody), (status = 404, body = ErrorBody)))]
async fn get_frame(State(s): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> ApiResult<FrameRow> {
    user.require(Perm::ObjectsRead)?;
    let row = sqlx::query_as::<_, FrameRow>(&format!("{SELECT} WHERE f.id = $1"))
        .bind(id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(|| ApiError::not_found("frame not found"))?;
    Ok(Json(row))
}

#[cfg(test)]
mod tests {
    #[test]
    fn sniffs_images() {
        assert_eq!(super::sniff(&[0xFF, 0xD8, 0xFF, 0xE0]).unwrap().1, "jpg");
        assert_eq!(super::sniff(b"\x89PNG\r\n").unwrap().1, "png");
        assert_eq!(super::sniff(b"RIFF\0\0\0\0WEBPVP8 ").unwrap().1, "webp");
        assert!(super::sniff(b"<html>").is_none());
        assert!(super::sniff(b"").is_none());
    }
}
