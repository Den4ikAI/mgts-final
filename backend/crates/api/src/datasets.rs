//! The organizers' dataset in, the jury's table out.
//!
//! * `POST /api/datasets` — zip archive(s) of photos (+ xlsx/csv annotation in
//!   the folders). Every photo goes the normal way (S3 → Kafka → model); the
//!   whole import is one batch.
//! * `GET /api/datasets`, `GET /api/datasets/{id}` — progress and, when the
//!   import had annotation, quality against it.
//! * `GET /api/frames/export?batch=&format=xlsx|csv` — objects, verdict,
//!   recommendation: the deliverable the case asks for.

use std::{
    collections::HashMap,
    io::{Cursor, Read, Seek, Write},
    path::Path as FsPath,
};

use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use domain::GroundTruth;

use crate::{
    auth::{AuthUser, Perm},
    error::{ApiError, ApiResult, ErrorBody},
    frames::{self, FrameMeta, FrameRow},
    AppState,
};

const MAX_ARCHIVE: usize = 2 * 1024 * 1024 * 1024;
const MAX_IMAGE: u64 = 40 * 1024 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/datasets", get(list).post(import).layer(DefaultBodyLimit::max(MAX_ARCHIVE)))
        .route("/api/datasets/{id}", get(get_one))
        .route("/api/frames/export", get(export))
}

// ---------------------------------------------------------------- import

#[derive(ToSchema)]
#[allow(dead_code)]
struct ImportForm {
    /// Один или несколько zip-архивов: фото (JPEG/PNG/WebP) и таблицы разметки (xlsx/csv) в папках
    #[schema(value_type = Vec<String>, format = Binary)]
    archive: Vec<Vec<u8>>,
    /// Или папка как есть: файлы по одному, имя файла = относительный путь (`МП.РЩ/123.jpg`, `МП.РЩ/разметка.xlsx`)
    #[schema(value_type = Vec<String>, format = Binary)]
    files: Vec<Vec<u8>>,
    /// Название прогона (по умолчанию — имя архива)
    name: Option<String>,
}

#[derive(Serialize, ToSchema)]
struct Imported {
    batch_id: Uuid,
    name: String,
    images: usize,
    /// Фото, для которых нашлась строка разметки
    labeled: usize,
    /// Что не сопоставилось и что пропущено
    #[schema(value_type = Object)]
    notes: Value,
}

struct LabelRow {
    dir: String,
    stem: String,
    status: Option<String>,
    description: Option<String>,
    class_col: Option<String>,
}

struct Unpacked {
    images: Vec<(String, Vec<u8>)>,
    labels: Vec<LabelRow>,
    skipped: Vec<String>,
}

/// Zip entry names: UTF-8 when flagged/valid, otherwise CP866 (Russian Windows zips).
fn entry_name(raw: &[u8]) -> String {
    match std::str::from_utf8(raw) {
        Ok(s) => s.to_string(),
        Err(_) => encoding_rs::IBM866.decode(raw).0.into_owned(),
    }
    .replace('\\', "/")
}

fn split(path: &str) -> (String, String, String) {
    let p = FsPath::new(path);
    let dir = p.parent().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default();
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
    let ext = p.extension().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
    (dir, stem, ext)
}

fn unpack<R: Read + Seek>(reader: R, out: &mut Unpacked) -> anyhow::Result<()> {
    let mut zip = zip::ZipArchive::new(reader)?;
    for i in 0..zip.len() {
        let mut f = zip.by_index(i)?;
        if f.is_dir() {
            continue;
        }
        let name = entry_name(f.name_raw());
        if f.size() > MAX_IMAGE {
            out.skipped.push(format!("{name}: больше 40 МБ"));
            continue;
        }
        let mut buf = Vec::with_capacity(f.size() as usize);
        f.read_to_end(&mut buf)?;
        add_entry(out, name, buf);
    }
    Ok(())
}

/// One file of an archive or of a folder upload: photo, annotation table, or skipped.
fn add_entry(out: &mut Unpacked, name: String, buf: Vec<u8>) {
    if name.starts_with("__MACOSX/") || name.split('/').any(|c| c == ".." || c.starts_with('.')) {
        return;
    }
    let (dir, _, ext) = split(&name);
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "webp" => {
            if buf.len() as u64 > MAX_IMAGE {
                out.skipped.push(format!("{name}: больше 40 МБ"));
            } else {
                out.images.push((name, buf));
            }
        }
        "xlsx" | "xls" | "csv" | "tsv" => match read_table(&buf, &ext) {
            Ok(rows) => out.labels.extend(rows.into_iter().map(|mut r| {
                r.dir = dir.clone();
                r
            })),
            Err(e) => out.skipped.push(format!("{name}: таблица не прочитана ({e})")),
        },
        _ => out.skipped.push(format!("{name}: не фото и не таблица")),
    }
}

/// Header-driven: finds the file / status / description / class columns by name.
fn read_table(bytes: &[u8], ext: &str) -> anyhow::Result<Vec<LabelRow>> {
    let grid: Vec<Vec<String>> = if ext == "csv" || ext == "tsv" {
        let text = String::from_utf8_lossy(bytes).trim_start_matches('\u{feff}').to_string();
        let first = text.lines().next().unwrap_or_default();
        let sep = [';', '\t', ','].into_iter().max_by_key(|c| first.matches(*c).count()).unwrap_or(',');
        text.lines().map(|l| l.split(sep).map(|c| c.trim().trim_matches('"').to_string()).collect()).collect()
    } else {
        use calamine::Reader;
        let mut wb = calamine::open_workbook_auto_from_rs(Cursor::new(bytes.to_vec()))?;
        let range = wb.worksheet_range_at(0).ok_or_else(|| anyhow::anyhow!("no sheets"))??;
        range
            .rows()
            .map(|r| {
                r.iter()
                    .map(|c| match c {
                        calamine::Data::Float(f) if f.fract() == 0.0 => format!("{}", *f as i64),
                        calamine::Data::Empty => String::new(),
                        other => other.to_string().trim().to_string(),
                    })
                    .collect()
            })
            .collect()
    };
    let Some(header_at) = grid.iter().position(|r| r.iter().any(|c| is_file_col(c))) else {
        anyhow::bail!("нет колонки с именем файла");
    };
    let header: Vec<String> = grid[header_at].iter().map(|c| c.to_lowercase()).collect();
    let col = |pred: &dyn Fn(&str) -> bool| header.iter().position(|h| pred(h));
    let file = col(&|h| is_file_col(h)).unwrap();
    let status = col(&|h| h.contains("статус") || h.contains("status") || h.contains("состояни"));
    let desc = col(&|h| h.contains("описан") || h.contains("descr") || h.contains("коммент"));
    let class = col(&|h| h == "class" || h.contains("класс") || h.contains("дефект") || h.contains("label"));
    let cell = |r: &Vec<String>, i: Option<usize>| i.and_then(|i| r.get(i)).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    Ok(grid[header_at + 1..]
        .iter()
        .filter_map(|r| {
            let f = cell(r, Some(file))?;
            Some(LabelRow {
                dir: String::new(),
                stem: split(&f).1,
                status: cell(r, status),
                description: cell(r, desc),
                class_col: cell(r, class),
            })
        })
        .collect())
}

fn is_file_col(h: &str) -> bool {
    let h = h.to_lowercase();
    h.contains("имя файла") || h == "файл" || h == "file" || h == "filename" || h == "file_name" || h.contains("фото")
}

fn kind_of(dir: &str) -> Option<&'static str> {
    let d = dir.to_uppercase();
    if d.contains("ТКШ") {
        Some("tksh")
    } else if d.contains("РЩ") {
        Some("rsh")
    } else {
        None
    }
}

/// Status text → taxonomy class: exact key / label / alias first, then keyword rules
/// worked out on the organizers' «Датасет-ДСС».
fn class_of(text: &str, aliases: &HashMap<String, String>) -> Option<String> {
    let t = norm(text);
    if let Some(c) = aliases.get(&t) {
        return Some(c.clone());
    }
    let rules: [(&[&str], &str); 4] = [
        (&["креплен", "отрыв", "падени", "удерживается на"], "mount_failure"),
        (&["деформац", "мех", "вмятин", "разруш"], "deformation"),
        (&["лкп", "коррози", "ржав", "краск"], "paint"),
        (&["удовлет", "норм", "исправ"], "ok"),
    ];
    rules.iter().find(|(keys, _)| keys.iter().any(|k| t.contains(k))).map(|(_, c)| c.to_string())
}

fn norm(s: &str) -> String {
    s.to_lowercase().replace('ё', "е").trim_end_matches('.').split_whitespace().collect::<Vec<_>>().join(" ")
}

async fn taxonomy(s: &AppState) -> Value {
    tokio::fs::read_to_string(&s.files.taxonomy)
        .await
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| json!({ "classes": {} }))
}

fn alias_map(tax: &Value) -> HashMap<String, String> {
    let mut m = HashMap::new();
    if let Some(classes) = tax["classes"].as_object() {
        for (k, c) in classes {
            m.insert(norm(k), k.clone());
            if let Some(l) = c["label"].as_str() {
                m.insert(norm(l), k.clone());
            }
            for a in c["aliases"].as_array().into_iter().flatten().filter_map(Value::as_str) {
                m.insert(norm(a), k.clone());
            }
        }
    }
    m
}

/// Загрузить датасет организаторов: zip с фото и таблицами разметки. Все фото идут
/// обычным путём (S3 → Kafka → модель), прогресс и качество — `GET /api/datasets/{id}`.
#[utoipa::path(post, path = "/api/datasets", tag = "datasets", summary = "Загрузить датасет (zip с фото и разметкой)",
    request_body(content = ImportForm, content_type = "multipart/form-data"),
    security(("bearer" = [])),
    responses((status = 202, body = Imported), (status = 400, body = ErrorBody), (status = 401, body = ErrorBody), (status = 403, body = ErrorBody)))]
async fn import(State(s): State<AppState>, user: AuthUser, mut form: Multipart) -> Result<(StatusCode, Json<Imported>), ApiError> {
    user.require(Perm::FramesUpload)?;
    let bad = |m: String| ApiError::bad_request(m);
    let mut archives = Vec::new();
    let mut loose: Vec<(String, Vec<u8>)> = Vec::new();
    let mut name = None;
    while let Some(mut field) = form.next_field().await.map_err(|e| bad(format!("multipart: {e}")))? {
        let is_zip = field.file_name().is_some_and(|n| n.to_lowercase().ends_with(".zip"));
        if let (Some(file_name), false) = (field.file_name().map(str::to_string), is_zip) {
            // A folder sent file by file: the file name carries the relative path.
            let bytes = field.bytes().await.map_err(|e| bad(format!("{file_name}: {e}")))?;
            loose.push((file_name.replace('\\', "/"), bytes.to_vec()));
            continue;
        }
        if let Some(file_name) = field.file_name().map(str::to_string) {
            // Stream to a temp file: archives can be bigger than we want in memory.
            let mut tmp = tempfile::tempfile().map_err(|e| ApiError::Internal(e.into()))?;
            while let Some(chunk) = field.chunk().await.map_err(|e| bad(format!("{file_name}: {e}")))? {
                tmp.write_all(&chunk).map_err(|e| ApiError::Internal(e.into()))?;
            }
            archives.push((file_name, tmp));
        } else if field.name() == Some("name") {
            name = Some(field.text().await.map_err(|e| bad(e.to_string()))?.trim().to_string()).filter(|n| !n.is_empty());
        }
    }
    if archives.is_empty() && loose.is_empty() {
        return Err(bad("no files: send zip archives in field `archive` or a folder's files in field `files`".into()));
    }
    let name = name.unwrap_or_else(|| {
        let mut parts: Vec<String> = archives.iter().map(|(n, _)| n.clone()).collect();
        if let Some(top) = loose.first().map(|(p, _)| p.split('/').next().unwrap_or("файлы").to_string()) {
            parts.push(if loose.len() > 1 { format!("{top} ({} файлов)", loose.len()) } else { top });
        }
        parts.join(" + ")
    });

    let unpacked = tokio::task::spawn_blocking(move || -> anyhow::Result<Unpacked> {
        let mut out = Unpacked { images: Vec::new(), labels: Vec::new(), skipped: Vec::new() };
        for (file_name, mut tmp) in archives {
            tmp.rewind()?;
            unpack(tmp, &mut out).map_err(|e| anyhow::anyhow!("{file_name}: не zip или повреждён ({e})"))?;
        }
        for (path, bytes) in loose {
            add_entry(&mut out, path, bytes);
        }
        Ok(out)
    })
    .await
    .map_err(|e| ApiError::Internal(e.into()))?
    .map_err(|e| bad(e.to_string()))?;
    if unpacked.images.is_empty() {
        return Err(bad("в архиве нет фото (JPEG/PNG/WebP)".into()));
    }

    // Match annotation rows: same folder first, then a file name unique across the archive.
    let aliases = alias_map(&taxonomy(&s).await);
    let mut by_dir: HashMap<(String, String), &LabelRow> = HashMap::new();
    let mut by_stem: HashMap<String, Vec<&LabelRow>> = HashMap::new();
    for r in &unpacked.labels {
        by_dir.insert((r.dir.clone(), r.stem.clone()), r);
        by_stem.entry(r.stem.clone()).or_default().push(r);
    }
    let mut used = std::collections::HashSet::new();
    let batch_id = Uuid::now_v7();
    let (mut labeled, mut unlabeled, mut unmapped) = (0usize, Vec::new(), Vec::new());
    let mut prepared = Vec::new();
    for (path, bytes) in &unpacked.images {
        let (dir, stem, _) = split(path);
        let row = by_dir.get(&(dir.clone(), stem.clone())).copied().or_else(|| match by_stem.get(&stem) {
            Some(v) if v.len() == 1 => Some(v[0]),
            _ => None,
        });
        let kind = kind_of(&dir);
        let truth = row.map(|r| {
            used.insert((r.dir.clone(), r.stem.clone()));
            labeled += 1;
            let class = r.class_col.as_deref().and_then(|c| class_of(c, &aliases))
                .or_else(|| r.status.as_deref().and_then(|t| class_of(t, &aliases)))
                .or_else(|| r.description.as_deref().and_then(|t| class_of(t, &aliases)));
            if class.is_none() {
                unmapped.push(format!("{path}: «{}»", r.status.clone().or(r.class_col.clone()).unwrap_or_default()));
            }
            GroundTruth { class, kind: kind.map(str::to_string), status: r.status.clone(), description: r.description.clone() }
        });
        if truth.is_none() && !unpacked.labels.is_empty() {
            unlabeled.push(path.clone());
        }
        let object_id = match kind {
            Some("tksh") => format!("ТКШ-{stem}"),
            Some("rsh") => format!("РЩ-{stem}"),
            _ => stem.clone(),
        };
        let Some((content_type, ext)) = frames::sniff(bytes) else {
            continue;
        };
        prepared.push((path.clone(), content_type, ext, object_id, truth));
    }
    let unused_rows: Vec<String> = unpacked.labels.iter()
        .filter(|r| !used.contains(&(r.dir.clone(), r.stem.clone())))
        .map(|r| format!("{}/{}", r.dir, r.stem))
        .collect();
    let notes = json!({
        "skipped": unpacked.skipped,
        "photos_without_annotation": unlabeled,
        "annotation_without_photo": unused_rows,
        "unrecognized_status": unmapped,
    });
    sqlx::query("INSERT INTO batches (id, name, uploaded_by, images, labeled, notes) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(batch_id)
        .bind(&name)
        .bind(&user.0.login)
        .bind(prepared.len() as i32)
        .bind(labeled as i32)
        .bind(&notes)
        .execute(&s.db)
        .await?;

    let images: HashMap<&str, &Vec<u8>> = unpacked.images.iter().map(|(p, b)| (p.as_str(), b)).collect();
    for (path, content_type, ext, object_id, truth) in &prepared {
        let meta = FrameMeta {
            source: "dataset",
            file_name: Some(path.clone()),
            uploaded_by: Some(user.0.login.clone()),
            object_id: Some(object_id.clone()),
            position: None,
            batch_id: Some(batch_id),
            truth: truth.clone(),
        };
        frames::ingest(&s, images[path.as_str()], content_type, ext, meta).await?;
    }
    tracing::info!(by = %user.0.login, %batch_id, images = prepared.len(), labeled, "dataset imported");
    Ok((StatusCode::ACCEPTED, Json(Imported { batch_id, name, images: prepared.len(), labeled, notes })))
}

// ---------------------------------------------------------------- progress & quality

#[derive(Serialize, sqlx::FromRow, ToSchema)]
struct BatchRow {
    id: Uuid,
    name: String,
    uploaded_by: Option<String>,
    images: i32,
    labeled: i32,
    created_at: DateTime<Utc>,
    /// Сколько фото уже получили вердикт
    analyzed: i64,
    errors: i64,
    #[schema(value_type = Object)]
    notes: Value,
}

const BATCH_SELECT: &str = "SELECT b.id, b.name, b.uploaded_by, b.images, b.labeled, b.created_at, b.notes,
        count(v.frame_id) AS analyzed, count(*) FILTER (WHERE v.status = 'error') AS errors
    FROM batches b LEFT JOIN frames f ON f.batch_id = b.id LEFT JOIN frame_verdicts v ON v.frame_id = f.id";

#[utoipa::path(get, path = "/api/datasets", tag = "datasets", summary = "Прогоны импорта и их прогресс",
    security(("bearer" = [])), responses((status = 200, body = Vec<BatchRow>), (status = 401, body = ErrorBody)))]
async fn list(State(s): State<AppState>, user: AuthUser) -> ApiResult<Vec<BatchRow>> {
    user.require(Perm::ObjectsRead)?;
    let rows = sqlx::query_as::<_, BatchRow>(&format!("{BATCH_SELECT} GROUP BY b.id ORDER BY b.created_at DESC LIMIT 100"))
        .fetch_all(&s.db)
        .await?;
    Ok(Json(rows))
}

#[derive(Serialize, ToSchema)]
struct BatchReport {
    batch: BatchRow,
    /// Сколько фото в каком маршруте: auto_ok, review, critical, not_observed, error, queued
    #[schema(value_type = Object)]
    routes: HashMap<String, usize>,
    /// Только если была разметка
    quality: Option<Quality>,
}

#[derive(Serialize, ToSchema)]
struct Quality {
    /// Фото с разметкой и вердиктом
    evaluated: usize,
    /// Главный класс модели совпал с разметкой
    accuracy: f64,
    defects_total: usize,
    /// Дефекты, ушедшие человеку (review/critical)
    defects_caught: usize,
    defect_recall: Option<f64>,
    /// Доля кадров, закрытых без людей
    auto_share: f64,
    /// Из закрытых без людей — действительно норма
    auto_precision: Option<f64>,
    /// «разметка → модель»: число
    #[schema(value_type = Object)]
    confusion: HashMap<String, usize>,
}

#[utoipa::path(get, path = "/api/datasets/{id}", tag = "datasets", summary = "Прогресс прогона и качество против разметки",
    params(("id" = Uuid, Path)), security(("bearer" = [])),
    responses((status = 200, body = BatchReport), (status = 401, body = ErrorBody), (status = 404, body = ErrorBody)))]
async fn get_one(State(s): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> ApiResult<BatchReport> {
    user.require(Perm::ObjectsRead)?;
    let batch = sqlx::query_as::<_, BatchRow>(&format!("{BATCH_SELECT} WHERE b.id = $1 GROUP BY b.id"))
        .bind(id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(|| ApiError::not_found("batch not found"))?;
    let rows = batch_frames(&s, Some(id)).await?;
    let tax = taxonomy(&s).await;
    let is_ok = |c: &str| tax["classes"][c]["ok"].as_bool().unwrap_or(false);

    let mut routes: HashMap<String, usize> = HashMap::new();
    for f in &rows {
        *routes.entry(route(f).to_string()).or_default() += 1;
    }
    let pairs: Vec<(&str, &Value)> = rows.iter()
        .filter_map(|f| Some((f.truth.as_ref()?["class"].as_str()?, f.result.as_ref()?)))
        .filter(|(_, r)| r["route"] != "error")
        .collect();
    let quality = (!pairs.is_empty()).then(|| {
        let n = pairs.len();
        let top = |r: &Value| r["top_class"].as_str().unwrap_or("").to_string();
        let flagged = |r: &Value| matches!(r["route"].as_str(), Some("review" | "critical"));
        let defects: Vec<_> = pairs.iter().filter(|(t, _)| !is_ok(t)).collect();
        let caught = defects.iter().filter(|(_, r)| flagged(r)).count();
        let auto: Vec<_> = pairs.iter().filter(|(_, r)| r["route"] == "auto_ok").collect();
        let mut confusion = HashMap::new();
        for (t, r) in &pairs {
            *confusion.entry(format!("{t}→{}", top(r))).or_default() += 1;
        }
        Quality {
            evaluated: n,
            accuracy: pairs.iter().filter(|(t, r)| *t == top(r)).count() as f64 / n as f64,
            defects_total: defects.len(),
            defects_caught: caught,
            defect_recall: (!defects.is_empty()).then(|| caught as f64 / defects.len() as f64),
            auto_share: auto.len() as f64 / n as f64,
            auto_precision: (!auto.is_empty()).then(|| auto.iter().filter(|(t, _)| is_ok(t)).count() as f64 / auto.len() as f64),
            confusion,
        }
    });
    Ok(Json(BatchReport { batch, routes, quality }))
}

async fn batch_frames(s: &AppState, batch: Option<Uuid>) -> Result<Vec<FrameRow>, ApiError> {
    Ok(sqlx::query_as::<_, FrameRow>(&format!(
        "{} WHERE ($1::uuid IS NULL OR f.batch_id = $1) ORDER BY f.created_at LIMIT 20000",
        frames::SELECT
    ))
    .bind(batch)
    .fetch_all(&s.db)
    .await?)
}

fn route(f: &FrameRow) -> &str {
    f.result.as_ref().and_then(|r| r["route"].as_str()).unwrap_or(if f.status == "queued" { "queued" } else { "error" })
}

// ---------------------------------------------------------------- export

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
struct ExportQuery {
    /// Прогон импорта; без него — все загруженные фото
    batch: Option<Uuid>,
    /// xlsx (по умолчанию) | csv
    format: Option<String>,
}

const SEVERITY: [(&str, &str); 4] = [("low", "Низкая"), ("medium", "Средняя"), ("high", "Высокая"), ("critical", "Угроза жизни")];

/// One row of the jury table.
struct Line {
    file: String,
    object: String,
    kind: String,
    verdict: &'static str,
    defect: String,
    severity: String,
    confidence: Option<f64>,
    action: String,
    lat: Option<f64>,
    lon: Option<f64>,
    why: String,
    /// "ТКШ — норма; РЩ — механическое повреждение"
    objects: String,
    photo: String,
    truth: Option<(String, bool)>,
    order: u8,
}

fn lines(rows: &[FrameRow], tax: &Value) -> Vec<Line> {
    let label = |k: &str| tax["classes"][k]["label"].as_str().unwrap_or(k).to_string();
    let action = |k: &str| tax["classes"][k]["action"].as_str().unwrap_or("").to_string();
    let is_ok = |k: &str| tax["classes"][k]["ok"].as_bool().unwrap_or(false);
    let kind = |k: &str| tax["kind_question"]["labels"][k].as_str().unwrap_or(k).to_string();
    let mut out: Vec<Line> = rows.iter().map(|f| {
        let r = f.result.as_ref();
        let get = |k: &str| r.and_then(|r| r[k].as_str()).map(str::to_string);
        let top = get("top_class");
        let defect = get("defect_type");
        let (verdict, order) = match route(f) {
            "critical" => ("Повреждён, срочно", 0),
            "review" if top.as_deref().is_some_and(|t| !is_ok(t)) => ("Повреждён", 1),
            "review" => ("Требует проверки", 2),
            "auto_ok" => ("В норме", 4),
            "not_observed" => ("Объект не найден", 3),
            "queued" => ("В обработке", 5),
            _ => ("Ошибка анализа", 5),
        };
        let shown = match route(f) {
            "auto_ok" => Some("ok".to_string()),
            "not_observed" => Some("none".to_string()),
            _ => defect.clone(),
        };
        Line {
            file: f.file_name.clone().unwrap_or_default(),
            object: f.object_id.clone().unwrap_or_default(),
            kind: get("object_kind").or_else(|| f.truth.as_ref().and_then(|t| t["kind"].as_str()).map(str::to_string)).map(|k| kind(&k)).unwrap_or_default(),
            verdict,
            defect: match (route(f), &defect) {
                ("auto_ok", _) => "—".into(),
                (_, Some(d)) => label(d),
                _ => "—".into(),
            },
            severity: get("severity").map(|s| SEVERITY.iter().find(|(k, _)| *k == s).map(|(_, v)| v.to_string()).unwrap_or(s)).unwrap_or_default(),
            confidence: r.and_then(|r| r["confidence"].as_f64()).map(|c| (c * 100.0).round() / 100.0),
            action: shown.as_deref().map(action).unwrap_or_default(),
            lat: f.lat,
            lon: f.lon,
            why: get("rationale").unwrap_or_default(),
            objects: f.objects.as_ref().and_then(Value::as_array).map(|xs| xs.iter().map(|o| {
                let k = o["kind"].as_str().map(kind).unwrap_or_else(|| "объект".into());
                let c = o["condition"].as_str().map(|c| label(c).to_lowercase()).unwrap_or_default();
                format!("{k} — {c}")
            }).collect::<Vec<_>>().join("; ")).unwrap_or_default(),
            photo: f.media_uri.clone(),
            truth: f.truth.as_ref().map(|t| {
                let class = t["class"].as_str().unwrap_or("");
                let text = [t["status"].as_str(), t["description"].as_str()].into_iter().flatten().collect::<Vec<_>>().join(" · ");
                (if text.is_empty() { label(class) } else { text }, Some(class) == top.as_deref())
            }),
            order,
        }
    }).collect();
    out.sort_by(|a, b| a.order.cmp(&b.order).then_with(|| a.file.cmp(&b.file)));
    out
}

const HEAD: [&str; 14] = ["№", "Файл", "Объект", "Тип", "Вывод", "Вид повреждения", "Опасность", "Уверенность",
    "Рекомендация", "Широта", "Долгота", "Обоснование модели", "Объекты в кадре", "Фото в системе"];

#[utoipa::path(get, path = "/api/frames/export", tag = "datasets", summary = "Таблица результатов: объект, вывод, рекомендация (XLSX/CSV)",
    params(ExportQuery), security(("bearer" = [])),
    responses((status = 200, description = "Файл таблицы", content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body = Vec<u8>),
              (status = 401, body = ErrorBody)))]
async fn export(State(s): State<AppState>, user: AuthUser, Query(q): Query<ExportQuery>) -> Result<Response, ApiError> {
    user.require(Perm::ObjectsRead)?;
    let rows = batch_frames(&s, q.batch).await?;
    let tax = taxonomy(&s).await;
    let lines = lines(&rows, &tax);
    let with_truth = lines.iter().any(|l| l.truth.is_some());
    let stamp = Utc::now().format("%Y%m%d-%H%M");
    let (body, ctype, ext) = if q.format.as_deref() == Some("csv") {
        (csv(&lines, with_truth).into_bytes(), "text/csv; charset=utf-8", "csv")
    } else {
        let lines_ref = &lines;
        let summary = summary(lines_ref);
        let bytes = xlsx(lines_ref, with_truth, &summary).map_err(|e| ApiError::Internal(anyhow::anyhow!("xlsx: {e}")))?;
        (bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx")
    };
    let mut res = Body::from(body).into_response();
    let h = res.headers_mut();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static(ctype));
    h.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"mgts-result-{stamp}.{ext}\"")).unwrap(),
    );
    Ok(res)
}

fn summary(lines: &[Line]) -> Vec<(String, usize)> {
    let mut counts: Vec<(String, usize)> = Vec::new();
    for l in lines {
        match counts.iter_mut().find(|(k, _)| k == l.verdict) {
            Some((_, n)) => *n += 1,
            None => counts.push((l.verdict.to_string(), 1)),
        }
    }
    counts
}

fn csv(lines: &[Line], with_truth: bool) -> String {
    let q = |s: &str| format!("\"{}\"", s.replace('"', "\"\""));
    let num = |v: Option<f64>| v.map(|v| v.to_string().replace('.', ",")).unwrap_or_default();
    let mut head: Vec<&str> = HEAD.to_vec();
    if with_truth {
        head.extend(["Разметка организаторов", "Совпало"]);
    }
    // BOM + `;`: opens correctly in Russian Excel.
    let mut out = String::from("\u{feff}");
    out += &head.iter().map(|h| q(h)).collect::<Vec<_>>().join(";");
    out += "\r\n";
    for (i, l) in lines.iter().enumerate() {
        let mut cells = vec![
            (i + 1).to_string(), q(&l.file), q(&l.object), q(&l.kind), q(l.verdict), q(&l.defect), q(&l.severity),
            num(l.confidence), q(&l.action), num(l.lat), num(l.lon), q(&l.why), q(&l.objects), q(&l.photo),
        ];
        if with_truth {
            let (t, ok) = l.truth.clone().unwrap_or_default();
            cells.extend([q(&t), q(if l.truth.is_none() { "" } else if ok { "да" } else { "нет" })]);
        }
        out += &cells.join(";");
        out += "\r\n";
    }
    out
}

fn xlsx(lines: &[Line], with_truth: bool, summary: &[(String, usize)]) -> Result<Vec<u8>, rust_xlsxwriter::XlsxError> {
    use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook};
    let mut wb = Workbook::new();
    let head = Format::new().set_bold().set_background_color(Color::RGB(0x0B2545)).set_font_color(Color::White)
        .set_border(FormatBorder::Thin).set_text_wrap().set_align(FormatAlign::VerticalCenter);
    let wrap = Format::new().set_text_wrap().set_align(FormatAlign::Top);
    let pct = Format::new().set_num_format("0%").set_align(FormatAlign::Top);
    let coord = Format::new().set_num_format("0.00000").set_align(FormatAlign::Top);
    let fill = |c: u32| Format::new().set_bold().set_background_color(Color::RGB(c)).set_align(FormatAlign::Top).set_text_wrap();
    let verdict_fmt = |v: &str| match v {
        "Повреждён, срочно" => fill(0xF8B4B4),
        "Повреждён" => fill(0xFCD9A8),
        "Требует проверки" => fill(0xFFF0B3),
        "В норме" => fill(0xC6EFCE),
        _ => fill(0xE5E7EB),
    };

    let ws = wb.add_worksheet().set_name("Результат")?;
    let mut cols: Vec<(&str, f64)> = HEAD.iter().copied().zip([5.0, 34.0, 16.0, 7.0, 18.0, 24.0, 13.0, 11.0, 44.0, 10.0, 10.0, 60.0, 36.0, 30.0]).collect();
    if with_truth {
        cols.extend([("Разметка организаторов", 44.0), ("Совпало", 9.0)]);
    }
    for (c, (h, w)) in cols.iter().enumerate() {
        ws.write_string_with_format(0, c as u16, *h, &head)?;
        ws.set_column_width(c as u16, *w)?;
    }
    for (i, l) in lines.iter().enumerate() {
        let r = (i + 1) as u32;
        ws.write_number_with_format(r, 0, (i + 1) as f64, &wrap)?;
        ws.write_string_with_format(r, 1, &l.file, &wrap)?;
        ws.write_string_with_format(r, 2, &l.object, &wrap)?;
        ws.write_string_with_format(r, 3, &l.kind, &wrap)?;
        ws.write_string_with_format(r, 4, l.verdict, &verdict_fmt(l.verdict))?;
        ws.write_string_with_format(r, 5, &l.defect, &wrap)?;
        ws.write_string_with_format(r, 6, &l.severity, &wrap)?;
        if let Some(c) = l.confidence {
            ws.write_number_with_format(r, 7, c, &pct)?;
        }
        ws.write_string_with_format(r, 8, &l.action, &wrap)?;
        if let (Some(la), Some(lo)) = (l.lat, l.lon) {
            ws.write_number_with_format(r, 9, la, &coord)?;
            ws.write_number_with_format(r, 10, lo, &coord)?;
        }
        ws.write_string_with_format(r, 11, &l.why, &wrap)?;
        ws.write_string_with_format(r, 12, &l.objects, &wrap)?;
        ws.write_string_with_format(r, 13, &l.photo, &wrap)?;
        if let Some((t, ok)) = &l.truth {
            ws.write_string_with_format(r, 14, t, &wrap)?;
            ws.write_string_with_format(r, 15, if *ok { "да" } else { "нет" }, &wrap)?;
        }
    }
    ws.set_freeze_panes(1, 0)?;
    ws.autofilter(0, 0, lines.len() as u32, (cols.len() - 1) as u16)?;

    let ws = wb.add_worksheet().set_name("Сводка")?;
    ws.write_string_with_format(0, 0, "Вывод", &head)?;
    ws.write_string_with_format(0, 1, "Фото", &head)?;
    ws.set_column_width(0, 26)?;
    for (i, (k, n)) in summary.iter().enumerate() {
        ws.write_string_with_format((i + 1) as u32, 0, k, &verdict_fmt(k))?;
        ws.write_number((i + 1) as u32, 1, *n as f64)?;
    }
    let total_row = (summary.len() + 1) as u32;
    ws.write_string(total_row, 0, "Всего")?;
    ws.write_number(total_row, 1, lines.len() as f64)?;
    wb.save_to_buffer()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_organizer_statuses() {
        let a = HashMap::new();
        assert_eq!(class_of("Деформация , без повреждения ЛКП.", &a).as_deref(), Some("deformation"));
        assert_eq!(class_of("Нарушение целостности узлов крепления ТКШ.", &a).as_deref(), Some("mount_failure"));
        assert_eq!(class_of("Повреждение ЛКП.", &a).as_deref(), Some("paint"));
        assert_eq!(class_of("Удовлетврорительно.", &a).as_deref(), Some("ok"));
        assert_eq!(class_of("что-то непонятное", &a), None);
    }

    #[test]
    fn kinds_and_names() {
        assert_eq!(kind_of("Датасет-ДСС/МП. ТКШ"), Some("tksh"));
        assert_eq!(kind_of("Датасет-ДСС/МП.РЩ"), Some("rsh"));
        assert_eq!(entry_name("Папка/фото.jpg".as_bytes()), "Папка/фото.jpg");
        // "Папка" in CP866
        assert_eq!(entry_name(&[0x8F, 0xA0, 0xAF, 0xAA, 0xA0]), "Папка");
        assert_eq!(split("a/b/23349371.JPG"), ("a/b".into(), "23349371".into(), "jpg".into()));
    }

    #[test]
    fn reads_csv_with_header() {
        let rows = read_table("Имя файла;Статус;Описание\n123;Повреждение ЛКП.;Коррозия\n".as_bytes(), "csv").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].stem, "123");
        assert_eq!(rows[0].status.as_deref(), Some("Повреждение ЛКП."));
    }
}
