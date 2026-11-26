//! Domain model and the Kafka event contract.
//!
//! Every message on a Kafka topic is an [`Envelope`] serialized as JSON.
//! Topic names live in [`topics`]; see `docs/events.md` for the full contract.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub mod topics {
    /// Frames uploaded from vehicles (ingest -> ML). Key: vehicle_id.
    pub const FRAMES: &str = "frames.ingested";
    /// Raw model output (ML -> backend). Key: frame_id.
    pub const DETECTIONS: &str = "detections.created";
    /// Domain event log, the history of every infrastructure object. Key: object_id.
    pub const OBJECT_EVENTS: &str = "object.events";
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ObjectKind {
    /// Телекоммуникационный климатический шкаф
    Tksh,
    /// Распределительный щит
    Rsh,
    /// Кабельный колодец
    CableWell,
    /// Опора двойного назначения
    DualPole,
}

/// Three states, not two: "not observed" is an honest answer when a well
/// is under snow or blocked by a parked car.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ObjectStatus {
    Ok,
    Suspected,
    Defect,
    NotObserved,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Low,
    Medium,
    High,
    /// Threat to life (open manhole on a roadway): bypasses the review queue.
    Critical,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, utoipa::ToSchema)]
pub struct GeoPoint {
    pub lat: f64,
    pub lon: f64,
}

/// Normalized bbox in [0, 1] frame coordinates.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, utoipa::ToSchema)]
pub struct BBox {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReviewDecision {
    Confirm,
    Reject,
    NeedRecapture,
}

/// Why a reviewer rejected a detection. Doubles as labels for retraining.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RejectReason {
    Shadow,
    Puddle,
    ForeignOwner,
    BadFrame,
    NotADefect,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameIngested {
    pub frame_id: Uuid,
    pub vehicle_id: String,
    pub pass_id: Uuid,
    pub captured_at: DateTime<Utc>,
    pub position: GeoPoint,
    /// Vehicle heading, degrees from north.
    pub heading: f32,
    pub image_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionCreated {
    pub detection_id: Uuid,
    pub frame_id: Uuid,
    /// Matched registry object, if the ML side could resolve one.
    pub object_id: Option<String>,
    pub object_kind: ObjectKind,
    pub position: Option<GeoPoint>,
    /// `None` means the object was seen and looks fine.
    pub defect_type: Option<String>,
    pub severity: Option<Severity>,
    pub confidence: f32,
    pub bbox: BBox,
    pub crop_uri: Option<String>,
    /// One-line human-readable explanation shown on the evidence card.
    pub rationale: Option<String>,
}

/// Domain events about one infrastructure object. Partitioned by object_id,
/// so per-object ordering is preserved and the topic is the object's history.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ObjectEvent {
    Observed {
        detection_id: Uuid,
        frame_id: Uuid,
        defect_type: Option<String>,
        severity: Option<Severity>,
        confidence: f32,
    },
    StatusChanged {
        from: ObjectStatus,
        to: ObjectStatus,
        reason: String,
    },
    Reviewed {
        detection_id: Option<Uuid>,
        decision: ReviewDecision,
        reject_reason: Option<RejectReason>,
        reviewer: String,
        comment: Option<String>,
    },
    CriticalAlertRaised {
        detection_id: Uuid,
        defect_type: String,
    },
    WorkOrderOpened {
        work_order_id: Uuid,
        assignee: Option<String>,
    },
    WorkOrderClosed {
        work_order_id: Uuid,
        after_photo_uri: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope<T> {
    pub event_id: Uuid,
    pub occurred_at: DateTime<Utc>,
    /// Partition key: object_id for object events, frame_id/vehicle_id otherwise.
    pub key: String,
    pub source: String,
    pub payload: T,
}

impl<T> Envelope<T> {
    pub fn new(key: impl Into<String>, source: impl Into<String>, payload: T) -> Self {
        Self {
            event_id: Uuid::now_v7(),
            occurred_at: Utc::now(),
            key: key.into(),
            source: source.into(),
            payload,
        }
    }
}

impl ObjectEvent {
    pub fn type_name(&self) -> &'static str {
        match self {
            ObjectEvent::Observed { .. } => "observed",
            ObjectEvent::StatusChanged { .. } => "status_changed",
            ObjectEvent::Reviewed { .. } => "reviewed",
            ObjectEvent::CriticalAlertRaised { .. } => "critical_alert_raised",
            ObjectEvent::WorkOrderOpened { .. } => "work_order_opened",
            ObjectEvent::WorkOrderClosed { .. } => "work_order_closed",
        }
    }
}

impl ObjectStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ObjectStatus::Ok => "ok",
            ObjectStatus::Suspected => "suspected",
            ObjectStatus::Defect => "defect",
            ObjectStatus::NotObserved => "not_observed",
        }
    }
}
