//! Kafka -> Postgres projection.
//!
//! * `detections.created`: store the detection, attach it to a registry object
//!   and append an `observed` event to the object's history.
//! * `object.events`: append to `object_events`, apply status rules, fan out to
//!   SSE subscribers.
//!
//! Handlers are idempotent on `event_id` / `detection_id`, so replaying a topic
//! from the beginning rebuilds the read model.

use anyhow::Context;
use futures::StreamExt;
use rdkafka::{consumer::StreamConsumer, Message};
use sqlx::PgPool;
use tokio::sync::broadcast;

use domain::{
    topics, DetectionCreated, Envelope, FrameAnalyzed, FrameIngested, FrameObjects, ObjectEvent, ObjectStatus,
    ReviewDecision, Severity,
};

use crate::kafka::Producer;

const SOURCE: &str = "api.projection";

#[derive(Clone)]
pub struct Projection {
    pub db: PgPool,
    pub producer: Producer,
    pub live: broadcast::Sender<String>,
}

impl Projection {
    pub async fn run(self, consumer: StreamConsumer) {
        let mut stream = consumer.stream();
        while let Some(msg) = stream.next().await {
            let msg = match msg {
                Ok(m) => m,
                Err(e) => {
                    tracing::warn!("kafka error: {e}");
                    continue;
                }
            };
            let Some(body) = msg.payload() else { continue };
            let res = match msg.topic() {
                topics::DETECTIONS => self.on_detection(body).await,
                topics::OBJECT_EVENTS => self.on_object_event(body).await,
                topics::FRAMES => self.on_frame(body).await,
                topics::FRAMES_ANALYZED => self.on_frame_analyzed(body).await,
                topics::FRAMES_OBJECTS => self.on_frame_objects(body).await,
                other => {
                    tracing::debug!("ignoring topic {other}");
                    Ok(())
                }
            };
            if let Err(e) = res {
                // Don't stall the partition on one bad message during the hackathon.
                tracing::error!(topic = msg.topic(), offset = msg.offset(), "projection failed: {e:#}");
            }
        }
    }

    async fn on_detection(&self, body: &[u8]) -> anyhow::Result<()> {
        let env: Envelope<DetectionCreated> =
            serde_json::from_slice(body).context("decode detection")?;
        let d = env.payload;

        if let Some(object_id) = &d.object_id {
            sqlx::query(
                "INSERT INTO objects (id, kind, lat, lon) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (id) DO NOTHING",
            )
            .bind(object_id)
            .bind(enum_str(&d.object_kind))
            .bind(d.position.map(|p| p.lat))
            .bind(d.position.map(|p| p.lon))
            .execute(&self.db)
            .await?;
        }

        let inserted = sqlx::query(
            "INSERT INTO detections
               (id, frame_id, object_id, object_kind, defect_type, severity, confidence,
                bbox, crop_uri, rationale, lat, lon, review_state)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                     CASE WHEN $5::text IS NULL THEN 'confirmed' ELSE 'pending' END)
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(d.detection_id)
        .bind(d.frame_id)
        .bind(&d.object_id)
        .bind(enum_str(&d.object_kind))
        .bind(&d.defect_type)
        .bind(d.severity.as_ref().map(enum_str))
        .bind(d.confidence)
        .bind(serde_json::to_value(d.bbox)?)
        .bind(&d.crop_uri)
        .bind(&d.rationale)
        .bind(d.position.map(|p| p.lat))
        .bind(d.position.map(|p| p.lon))
        .execute(&self.db)
        .await?
        .rows_affected()
            == 1;

        let Some(object_id) = d.object_id.clone() else {
            // Unmatched detection: candidate for registry inventory, no history yet.
            return Ok(());
        };
        if !inserted {
            return Ok(());
        }

        self.emit(
            &object_id,
            ObjectEvent::Observed {
                detection_id: d.detection_id,
                frame_id: d.frame_id,
                defect_type: d.defect_type.clone(),
                severity: d.severity,
                confidence: d.confidence,
            },
        )
        .await?;

        if d.severity == Some(Severity::Critical) {
            self.emit(
                &object_id,
                ObjectEvent::CriticalAlertRaised {
                    detection_id: d.detection_id,
                    defect_type: d.defect_type.unwrap_or_default(),
                },
            )
            .await?;
        }
        Ok(())
    }

    async fn on_frame(&self, body: &[u8]) -> anyhow::Result<()> {
        let env: Envelope<FrameIngested> = serde_json::from_slice(body).context("decode frame")?;
        crate::frames::insert_frame(&self.db, &env.payload).await?;
        Ok(())
    }

    /// The model's verdict for an uploaded frame; pushed to live subscribers so
    /// the upload page updates without polling.
    async fn on_frame_analyzed(&self, body: &[u8]) -> anyhow::Result<()> {
        let env: Envelope<FrameAnalyzed> = serde_json::from_slice(body).context("decode frame verdict")?;
        let a = &env.payload;
        // Own table, no FK: on a replay the verdict may come before the frame row.
        sqlx::query(
            "INSERT INTO frame_verdicts (frame_id, status, result, analyzed_at) VALUES ($1, $2, $3, $4)
             ON CONFLICT (frame_id) DO UPDATE
               SET status = EXCLUDED.status, result = EXCLUDED.result, analyzed_at = EXCLUDED.analyzed_at
               WHERE frame_verdicts.analyzed_at <= EXCLUDED.analyzed_at",
        )
        .bind(a.frame_id)
        .bind(if a.route == "error" { "error" } else { "done" })
        .bind(serde_json::to_value(a)?)
        .bind(env.occurred_at)
        .execute(&self.db)
        .await?;
        let mut payload = serde_json::to_value(a)?;
        payload["type"] = "frame_analyzed".into();
        let msg = serde_json::json!({ "key": env.key, "payload": payload });
        let _ = self.live.send(msg.to_string());
        Ok(())
    }

    /// Boxes for every object in the frame; pushed live so the card can draw them.
    async fn on_frame_objects(&self, body: &[u8]) -> anyhow::Result<()> {
        let env: Envelope<FrameObjects> = serde_json::from_slice(body).context("decode frame objects")?;
        let o = &env.payload;
        sqlx::query(
            "INSERT INTO frame_objects (frame_id, objects, model, error, analyzed_at) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (frame_id) DO UPDATE
               SET objects = EXCLUDED.objects, model = EXCLUDED.model, error = EXCLUDED.error,
                   analyzed_at = EXCLUDED.analyzed_at
               WHERE frame_objects.analyzed_at <= EXCLUDED.analyzed_at",
        )
        .bind(o.frame_id)
        .bind(serde_json::to_value(&o.objects)?)
        .bind(&o.model)
        .bind(&o.error)
        .bind(env.occurred_at)
        .execute(&self.db)
        .await?;
        let mut payload = serde_json::to_value(o)?;
        payload["type"] = "frame_objects".into();
        let _ = self.live.send(serde_json::json!({ "key": env.key, "payload": payload }).to_string());
        Ok(())
    }

    async fn on_object_event(&self, body: &[u8]) -> anyhow::Result<()> {
        let env: Envelope<ObjectEvent> =
            serde_json::from_slice(body).context("decode object event")?;
        let object_id = env.key.clone();

        let fresh = sqlx::query(
            "INSERT INTO object_events (event_id, object_id, type, payload, source, occurred_at)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (event_id) DO NOTHING",
        )
        .bind(env.event_id)
        .bind(&object_id)
        .bind(env.payload.type_name())
        .bind(serde_json::to_value(&env.payload)?)
        .bind(&env.source)
        .bind(env.occurred_at)
        .execute(&self.db)
        .await?
        .rows_affected()
            == 1;
        if !fresh {
            return Ok(());
        }

        let current = self.status(&object_id).await?;
        match &env.payload {
            ObjectEvent::Observed { defect_type, severity, .. } => {
                sqlx::query(
                    "UPDATE objects SET last_seen_at = $2, updated_at = now(),
                       last_defect_type = COALESCE($3, last_defect_type),
                       max_severity = CASE WHEN $3::text IS NULL THEN max_severity ELSE $4 END
                     WHERE id = $1",
                )
                .bind(&object_id)
                .bind(env.occurred_at)
                .bind(defect_type)
                .bind(severity.as_ref().map(enum_str))
                .execute(&self.db)
                .await?;

                // Status rules (simple for now; k-of-n voting across passes goes here).
                let next = match (current, defect_type.is_some()) {
                    (ObjectStatus::Defect, _) => ObjectStatus::Defect,
                    (_, true) => ObjectStatus::Suspected,
                    (ObjectStatus::Suspected, false) => ObjectStatus::Suspected,
                    (_, false) => ObjectStatus::Ok,
                };
                self.change_status(&object_id, current, next, "observation").await?;
            }
            ObjectEvent::Reviewed { detection_id, decision, .. } => {
                if let Some(det) = detection_id {
                    sqlx::query("UPDATE detections SET review_state = $2 WHERE id = $1")
                        .bind(det)
                        .bind(enum_str(decision))
                        .execute(&self.db)
                        .await?;
                }
                let next = match decision {
                    ReviewDecision::Confirm => ObjectStatus::Defect,
                    ReviewDecision::Reject => {
                        let pending: i64 = sqlx::query_scalar(
                            "SELECT count(*) FROM detections
                             WHERE object_id = $1 AND review_state = 'pending'",
                        )
                        .bind(&object_id)
                        .fetch_one(&self.db)
                        .await?;
                        if pending > 0 { current } else { ObjectStatus::Ok }
                    }
                    ReviewDecision::NeedRecapture => current,
                };
                self.change_status(&object_id, current, next, "review").await?;
            }
            ObjectEvent::StatusChanged { to, .. } => {
                sqlx::query("UPDATE objects SET status = $2, updated_at = now() WHERE id = $1")
                    .bind(&object_id)
                    .bind(to.as_str())
                    .execute(&self.db)
                    .await?;
            }
            ObjectEvent::WorkOrderClosed { .. } => {
                self.change_status(&object_id, current, ObjectStatus::Ok, "work order closed")
                    .await?;
            }
            ObjectEvent::CriticalAlertRaised { .. } | ObjectEvent::WorkOrderOpened { .. } => {}
        }

        // Receivers may be gone; that's fine.
        let _ = self.live.send(String::from_utf8_lossy(body).into_owned());
        Ok(())
    }

    async fn status(&self, object_id: &str) -> anyhow::Result<ObjectStatus> {
        let s: Option<String> = sqlx::query_scalar("SELECT status FROM objects WHERE id = $1")
            .bind(object_id)
            .fetch_optional(&self.db)
            .await?;
        Ok(s.and_then(|s| serde_json::from_value(serde_json::Value::String(s)).ok())
            .unwrap_or(ObjectStatus::NotObserved))
    }

    async fn change_status(
        &self,
        object_id: &str,
        from: ObjectStatus,
        to: ObjectStatus,
        reason: &str,
    ) -> anyhow::Result<()> {
        if from == to {
            return Ok(());
        }
        // Write through immediately so the next event in this partition sees the
        // new status; the StatusChanged event records it in the history.
        sqlx::query("UPDATE objects SET status = $2, updated_at = now() WHERE id = $1")
            .bind(object_id)
            .bind(to.as_str())
            .execute(&self.db)
            .await?;
        self.emit(object_id, ObjectEvent::StatusChanged { from, to, reason: reason.into() })
            .await
    }

    async fn emit(&self, object_id: &str, ev: ObjectEvent) -> anyhow::Result<()> {
        self.producer
            .send(topics::OBJECT_EVENTS, &Envelope::new(object_id, SOURCE, ev))
            .await
    }
}

/// snake_case string of a serde unit enum variant.
pub fn enum_str<T: serde::Serialize>(v: &T) -> String {
    match serde_json::to_value(v) {
        Ok(serde_json::Value::String(s)) => s,
        _ => String::new(),
    }
}
