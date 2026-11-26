//! Domain model and the Kafka event contract.
//!
//! Every message on a Kafka topic is an [`Envelope`] serialized as JSON.
//! Topic names live in [`topics`]; see `docs/events.md` for the full contract.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub mod topics {
    /// Photos stored in S3, waiting for the model (api -> ML). Key: frame_id.
    pub const FRAMES: &str = "frames.ingested";
    /// The model's verdict for every frame, including "fine" and "not observed" (ML -> api). Key: frame_id.
    pub const FRAMES_ANALYZED: &str = "frames.analyzed";
    /// Every cabinet / board in the frame with its own box and condition (ML -> api). Key: frame_id.
    pub const FRAMES_OBJECTS: &str = "frames.objects";
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

/// A photo stored in object storage and waiting for the model.
/// Uploaded by a person (`source = "upload"`) or, later, by a vehicle camera.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct FrameIngested {
    pub frame_id: Uuid,
    /// upload | vehicle | dataset
    pub source: String,
    /// Where the bytes are: `s3://bucket/key` or `file:///abs/path`.
    pub image_uri: String,
    /// Same photo through the API (auth required): `/api/media/store/<key>`.
    pub media_uri: String,
    pub sha256: String,
    pub content_type: String,
    pub size_bytes: u64,
    pub file_name: Option<String>,
    pub uploaded_by: Option<String>,
    /// Registry object the photo is about, if the uploader knows it.
    pub object_id: Option<String>,
    pub position: Option<GeoPoint>,
    pub captured_at: Option<DateTime<Utc>>,
    pub vehicle_id: Option<String>,
    /// Vehicle heading, degrees from north.
    pub heading: Option<f32>,
    /// Dataset import (`POST /api/datasets`) this photo came from.
    pub batch_id: Option<Uuid>,
    /// Organizers' annotation, when the import had one.
    pub truth: Option<GroundTruth>,
}

/// Every cabinet / board the second-stage model found in a frame. Arrives a few
/// seconds after `FrameAnalyzed`; the verdict does not wait for it.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct FrameObjects {
    pub frame_id: Uuid,
    pub objects: Vec<DetectedObject>,
    pub model: String,
    pub latency_ms: Option<u32>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct DetectedObject {
    /// Normalized to the frame: x, y = top-left corner, all in 0..1.
    pub bbox: BBox,
    /// tksh | rsh
    pub kind: Option<String>,
    /// Taxonomy class key: ok | paint | deformation | mount_failure
    pub condition: String,
    pub confidence: f32,
    /// Short Russian note for the evidence card.
    pub note: Option<String>,
}

/// One row of the organizers' annotation, matched to a photo.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct GroundTruth {
    /// Taxonomy class key mapped from the status text; `None` = not recognized.
    pub class: Option<String>,
    /// tksh | rsh, from the folder name
    pub kind: Option<String>,
    pub status: Option<String>,
    pub description: Option<String>,
}

/// The model's verdict for one frame. Published for every frame, so an upload
/// always gets an answer, even "fine" or "nothing to assess".
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct FrameAnalyzed {
    pub frame_id: Uuid,
    /// not_observed | auto_ok | review | critical | error
    pub route: String,
    pub object_kind: Option<ObjectKind>,
    /// Taxonomy class key; `None` = looks fine.
    pub defect_type: Option<String>,
    pub severity: Option<Severity>,
    pub confidence: f32,
    /// The model's most likely class (also "ok" / "none") and its probability.
    pub top_class: Option<String>,
    pub top_p: Option<f32>,
    pub rationale: Option<String>,
    /// Set when a detection was also published to `detections.created`.
    pub detection_id: Option<Uuid>,
    pub object_id: Option<String>,
    /// From the request, EXIF GPS or text burned into the photo.
    pub position: Option<GeoPoint>,
    pub model: String,
    pub latency_ms: Option<u32>,
    pub error: Option<String>,
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
