use std::convert::Infallible;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use futures::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use domain::{
    topics, BBox, DetectionCreated, Envelope, GeoPoint, ObjectEvent, ObjectKind, RejectReason,
    ReviewDecision, Severity,
};

use crate::{
    auth::{AuthUser, Perm, TokenKind},
    error::{ApiError, ApiResult, ErrorBody},
    AppState,
};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/objects", get(list_objects))
        .route("/api/objects/{id}", get(get_object))
        .route("/api/objects/{id}/history", get(object_history))
        .route("/api/objects/{id}/reviews", post(post_review))
        .route("/api/queue", get(review_queue))
        .route("/api/stats", get(stats))
        .route("/api/stream", get(stream))
        .route("/api/dev/detections", post(dev_inject_detection))
        .merge(crate::auth::routes::router())
        .merge(crate::files::router())
        .merge(crate::openapi::router())
        .with_state(state)
}


/// Liveness probe.
#[utoipa::path(get, path = "/health", tag = "system", responses((status = 200, description = "Сервис жив", body = String, example = "ok")))]
pub async fn health() -> &'static str {
    "ok"
}

/// Объект инфраструктуры (ТКШ, РЩ, …) и его текущий статус — read model из Kafka.
#[derive(Serialize, sqlx::FromRow, ToSchema)]
pub struct ObjectRow {
    #[schema(example = "ТКШ-26224137")]
    id: String,
    /// Тип объекта, ключ из таксономии: tksh | rsh | …
    #[schema(example = "tksh")]
    kind: String,
    lat: Option<f64>,
    lon: Option<f64>,
    address: Option<String>,
    /// ok | suspected | defect | not_observed
    #[schema(example = "suspected")]
    status: String,
    /// Ключ класса из таксономии, например `deformation`
    last_defect_type: Option<String>,
    /// low | medium | high | critical
    max_severity: Option<String>,
    last_seen_at: Option<DateTime<Utc>>,
    updated_at: DateTime<Utc>,
}

/// Одно срабатывание модели по кадру.
#[derive(Serialize, sqlx::FromRow, ToSchema)]
pub struct DetectionRow {
    id: Uuid,
    frame_id: Uuid,
    object_id: Option<String>,
    object_kind: String,
    defect_type: Option<String>,
    severity: Option<String>,
    confidence: f32,
    #[schema(value_type = domain::BBox)]
    bbox: Value,
    /// Ссылка на фото: `/api/media/<путь>`
    crop_uri: Option<String>,
    /// Пояснение модели для карточки
    rationale: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    /// pending | confirmed | rejected | need_recapture | auto
    review_state: String,
    created_at: DateTime<Utc>,
}

/// Событие из истории объекта (топик `object.events`).
#[derive(Serialize, sqlx::FromRow, ToSchema)]
pub struct EventRow {
    event_id: Uuid,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    #[schema(example = "observed")]
    kind: String,
    #[schema(value_type = Object)]
    payload: Value,
    source: String,
    occurred_at: DateTime<Utc>,
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
struct ObjectFilter {
    /// ok | suspected | defect | not_observed
    status: Option<String>,
    /// tksh | rsh | …
    kind: Option<String>,
}

/// Реестр объектов, свежие сверху.
#[utoipa::path(get, path = "/api/objects", tag = "objects", params(ObjectFilter),
    security(("bearer" = [])),
    responses((status = 200, body = Vec<ObjectRow>), (status = 401, body = ErrorBody), (status = 403, body = ErrorBody)))]
async fn list_objects(
    State(s): State<AppState>,
    user: AuthUser,
    Query(f): Query<ObjectFilter>,
) -> ApiResult<Vec<ObjectRow>> {
    user.require(Perm::ObjectsRead)?;
    let rows = sqlx::query_as::<_, ObjectRow>(
        "SELECT * FROM objects
         WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR kind = $2)
         ORDER BY updated_at DESC LIMIT 5000",
    )
    .bind(f.status)
    .bind(f.kind)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Serialize, ToSchema)]
struct ObjectDetails {
    object: ObjectRow,
    detections: Vec<DetectionRow>,
}

/// Объект и его последние 50 срабатываний.
#[utoipa::path(get, path = "/api/objects/{id}", tag = "objects", params(("id" = String, Path, example = "ТКШ-26224137")),
    security(("bearer" = [])),
    responses((status = 200, body = ObjectDetails), (status = 401, body = ErrorBody), (status = 404, body = ErrorBody)))]
async fn get_object(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ObjectDetails>, ApiError> {
    user.require(Perm::ObjectsRead)?;
    let object = sqlx::query_as::<_, ObjectRow>("SELECT * FROM objects WHERE id = $1")
        .bind(&id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(|| ApiError::not_found(format!("object {id} not found")))?;
    let detections = sqlx::query_as::<_, DetectionRow>(
        "SELECT * FROM detections WHERE object_id = $1 ORDER BY created_at DESC LIMIT 50",
    )
    .bind(&id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(ObjectDetails { object, detections }))
}

/// Полная история объекта — event log из Kafka.
#[utoipa::path(get, path = "/api/objects/{id}/history", tag = "objects", params(("id" = String, Path)),
    security(("bearer" = [])),
    responses((status = 200, body = Vec<EventRow>), (status = 401, body = ErrorBody)))]
async fn object_history(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Vec<EventRow>> {
    user.require(Perm::ObjectsRead)?;
    let rows = sqlx::query_as::<_, EventRow>(
        "SELECT event_id, type, payload, source, occurred_at
         FROM object_events WHERE object_id = $1 ORDER BY occurred_at",
    )
    .bind(&id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

/// Очередь разбора: ожидающие срабатывания, критичные первыми.
#[utoipa::path(get, path = "/api/queue", tag = "review",
    security(("bearer" = [])),
    responses((status = 200, body = Vec<DetectionRow>), (status = 401, body = ErrorBody)))]
async fn review_queue(State(s): State<AppState>, user: AuthUser) -> ApiResult<Vec<DetectionRow>> {
    user.require(Perm::ObjectsRead)?;
    let rows = sqlx::query_as::<_, DetectionRow>(
        "SELECT * FROM detections WHERE review_state = 'pending'
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                                WHEN 'medium' THEN 2 ELSE 3 END,
                  created_at
         LIMIT 500",
    )
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Serialize, sqlx::FromRow, ToSchema)]
struct StatusCount {
    status: String,
    count: i64,
}

/// Сколько объектов в каждом статусе.
#[utoipa::path(get, path = "/api/stats", tag = "stats",
    security(("bearer" = [])),
    responses((status = 200, body = Vec<StatusCount>), (status = 401, body = ErrorBody), (status = 403, body = ErrorBody)))]
async fn stats(State(s): State<AppState>, user: AuthUser) -> ApiResult<Vec<StatusCount>> {
    user.require(Perm::StatsRead)?;
    let rows = sqlx::query_as::<_, StatusCount>(
        "SELECT status, count(*) AS count FROM objects GROUP BY status",
    )
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize, ToSchema)]
struct ReviewRequest {
    detection_id: Option<Uuid>,
    decision: ReviewDecision,
    reject_reason: Option<RejectReason>,
    comment: Option<String>,
}

/// Reviews are written to Kafka, not the DB: the projection applies them, so
/// the event log stays the single source of truth.
/// The reviewer is taken from the token, never from the body.
#[utoipa::path(post, summary = "Решение диспетчера по срабатыванию: подтвердить, ложное, нужен кадр", path = "/api/objects/{id}/reviews", tag = "review", params(("id" = String, Path)),
    request_body = ReviewRequest,
    security(("bearer" = [])),
    responses((status = 202, description = "Решение записано в Kafka, проекция применит его"),
               (status = 401, body = ErrorBody), (status = 403, body = ErrorBody)))]
async fn post_review(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(r): Json<ReviewRequest>,
) -> Result<StatusCode, ApiError> {
    user.require(Perm::Review)?;
    let ev = ObjectEvent::Reviewed {
        detection_id: r.detection_id,
        decision: r.decision,
        reject_reason: r.reject_reason,
        reviewer: user.0.login.clone(),
        comment: r.comment,
    };
    s.producer
        .send(topics::OBJECT_EVENTS, &Envelope::new(id, "api.review", ev))
        .await?;
    Ok(StatusCode::ACCEPTED)
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
struct StreamQuery {
    /// Из `POST /api/auth/stream-ticket`
    ticket: String,
}

/// Live object events as Server-Sent Events. Auth: `?ticket=` from
/// `POST /api/auth/stream-ticket`, since EventSource cannot send headers.
#[utoipa::path(get, summary = "Live-поток событий объектов (SSE), авторизация через ?ticket=", path = "/api/stream", tag = "objects", params(StreamQuery),
    responses((status = 200, description = "text/event-stream: JSON событий объектов", content_type = "text/event-stream", body = String),
              (status = 401, body = ErrorBody)))]
async fn stream(
    State(s): State<AppState>,
    Query(q): Query<StreamQuery>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, ApiError> {
    let claims = s.auth.verify(&q.ticket, TokenKind::Stream)?;
    if !claims.role.can(Perm::ObjectsRead) {
        return Err(ApiError::forbidden());
    }
    let rx = BroadcastStream::new(s.live.subscribe());
    let events = rx.filter_map(|m| m.ok().map(|json| Ok(Event::default().data(json))));
    Ok(Sse::new(events).keep_alive(KeepAlive::default()))
}

#[derive(Deserialize, ToSchema)]
struct DevDetection {
    object_id: String,
    #[serde(default = "default_kind")]
    object_kind: ObjectKind,
    lat: f64,
    lon: f64,
    defect_type: Option<String>,
    severity: Option<Severity>,
    #[serde(default = "default_conf")]
    confidence: f32,
    crop_uri: Option<String>,
    rationale: Option<String>,
}
fn default_kind() -> ObjectKind {
    ObjectKind::Tksh
}
fn default_conf() -> f32 {
    0.9
}

/// Dev/demo only: publish a synthetic detection so the UI can be built and
/// demoed without the ML worker. Disable with DEV_ENDPOINTS=0.
#[utoipa::path(post, summary = "Демо: синтетическое срабатывание в Kafka (DEV_ENDPOINTS=0 отключает)", path = "/api/dev/detections", tag = "dev", request_body = DevDetection,
    security(("bearer" = [])),
    responses((status = 200, description = "id срабатывания", body = Uuid), (status = 403, body = ErrorBody), (status = 404, body = ErrorBody)))]
async fn dev_inject_detection(
    State(s): State<AppState>,
    user: AuthUser,
    Json(d): Json<DevDetection>,
) -> Result<Json<Uuid>, ApiError> {
    if !s.dev_endpoints {
        return Err(ApiError::not_found("dev endpoints disabled"));
    }
    user.require(Perm::DevTools)?;
    let det = DetectionCreated {
        detection_id: Uuid::now_v7(),
        frame_id: Uuid::now_v7(),
        object_id: Some(d.object_id),
        object_kind: d.object_kind,
        position: Some(GeoPoint { lat: d.lat, lon: d.lon }),
        defect_type: d.defect_type,
        severity: d.severity,
        confidence: d.confidence,
        bbox: BBox { x: 0.4, y: 0.6, w: 0.2, h: 0.15 },
        crop_uri: d.crop_uri,
        rationale: d.rationale,
    };
    let id = det.detection_id;
    s.producer
        .send(
            topics::DETECTIONS,
            &Envelope::new(det.frame_id.to_string(), "api.dev", det),
        )
        .await?;
    Ok(Json(id))
}
