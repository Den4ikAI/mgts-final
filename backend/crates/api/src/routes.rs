use std::convert::Infallible;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use futures::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
use uuid::Uuid;

use domain::{
    topics, BBox, DetectionCreated, Envelope, GeoPoint, ObjectEvent, ObjectKind, RejectReason,
    ReviewDecision, Severity,
};

use crate::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/api/objects", get(list_objects))
        .route("/api/objects/{id}", get(get_object))
        .route("/api/objects/{id}/history", get(object_history))
        .route("/api/objects/{id}/reviews", post(post_review))
        .route("/api/queue", get(review_queue))
        .route("/api/stats", get(stats))
        .route("/api/stream", get(stream))
        .route("/api/dev/detections", post(dev_inject_detection))
        .with_state(state)
}

pub struct ApiError(anyhow::Error);

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self {
        Self(e.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        tracing::error!("{:#}", self.0);
        (StatusCode::INTERNAL_SERVER_ERROR, self.0.to_string()).into_response()
    }
}

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Serialize, sqlx::FromRow)]
pub struct ObjectRow {
    id: String,
    kind: String,
    lat: Option<f64>,
    lon: Option<f64>,
    address: Option<String>,
    status: String,
    last_defect_type: Option<String>,
    max_severity: Option<String>,
    last_seen_at: Option<DateTime<Utc>>,
    updated_at: DateTime<Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct DetectionRow {
    id: Uuid,
    frame_id: Uuid,
    object_id: Option<String>,
    object_kind: String,
    defect_type: Option<String>,
    severity: Option<String>,
    confidence: f32,
    bbox: Value,
    crop_uri: Option<String>,
    rationale: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    review_state: String,
    created_at: DateTime<Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct EventRow {
    event_id: Uuid,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    kind: String,
    payload: Value,
    source: String,
    occurred_at: DateTime<Utc>,
}

#[derive(Deserialize)]
struct ObjectFilter {
    status: Option<String>,
    kind: Option<String>,
}

async fn list_objects(
    State(s): State<AppState>,
    Query(f): Query<ObjectFilter>,
) -> ApiResult<Vec<ObjectRow>> {
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

#[derive(Serialize)]
struct ObjectDetails {
    object: ObjectRow,
    detections: Vec<DetectionRow>,
}

async fn get_object(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ObjectDetails>, ApiError> {
    let object = sqlx::query_as::<_, ObjectRow>("SELECT * FROM objects WHERE id = $1")
        .bind(&id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(|| anyhow::anyhow!("object {id} not found"))?;
    let detections = sqlx::query_as::<_, DetectionRow>(
        "SELECT * FROM detections WHERE object_id = $1 ORDER BY created_at DESC LIMIT 50",
    )
    .bind(&id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(ObjectDetails { object, detections }))
}

async fn object_history(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Vec<EventRow>> {
    let rows = sqlx::query_as::<_, EventRow>(
        "SELECT event_id, type, payload, source, occurred_at
         FROM object_events WHERE object_id = $1 ORDER BY occurred_at",
    )
    .bind(&id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

/// Pending detections, critical first. One row per detection; the UI groups by object.
async fn review_queue(State(s): State<AppState>) -> ApiResult<Vec<DetectionRow>> {
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

#[derive(Serialize, sqlx::FromRow)]
struct StatusCount {
    status: String,
    count: i64,
}

async fn stats(State(s): State<AppState>) -> ApiResult<Vec<StatusCount>> {
    let rows = sqlx::query_as::<_, StatusCount>(
        "SELECT status, count(*) AS count FROM objects GROUP BY status",
    )
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct ReviewRequest {
    detection_id: Option<Uuid>,
    decision: ReviewDecision,
    reject_reason: Option<RejectReason>,
    reviewer: String,
    comment: Option<String>,
}

/// Reviews are written to Kafka, not the DB: the projection applies them, so
/// the event log stays the single source of truth.
async fn post_review(
    State(s): State<AppState>,
    Path(id): Path<String>,
    Json(r): Json<ReviewRequest>,
) -> Result<StatusCode, ApiError> {
    let ev = ObjectEvent::Reviewed {
        detection_id: r.detection_id,
        decision: r.decision,
        reject_reason: r.reject_reason,
        reviewer: r.reviewer,
        comment: r.comment,
    };
    s.producer
        .send(topics::OBJECT_EVENTS, &Envelope::new(id, "api.review", ev))
        .await?;
    Ok(StatusCode::ACCEPTED)
}

/// Live object events as Server-Sent Events.
async fn stream(
    State(s): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = BroadcastStream::new(s.live.subscribe());
    let events = rx.filter_map(|m| m.ok().map(|json| Ok(Event::default().data(json))));
    Sse::new(events).keep_alive(KeepAlive::default())
}

#[derive(Deserialize)]
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
    ObjectKind::CableWell
}
fn default_conf() -> f32 {
    0.9
}

/// Dev/demo only: publish a synthetic detection so the UI can be built and
/// demoed without the ML worker. Disable with DEV_ENDPOINTS=0.
async fn dev_inject_detection(
    State(s): State<AppState>,
    Json(d): Json<DevDetection>,
) -> Result<Json<Uuid>, ApiError> {
    if !s.dev_endpoints {
        return Err(anyhow::anyhow!("dev endpoints disabled").into());
    }
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
