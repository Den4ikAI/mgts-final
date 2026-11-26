"""Kafka event payloads the ML side publishes (contract: backend/crates/domain/src/lib.rs)."""
from __future__ import annotations

import datetime as dt
import json
import uuid

NS = uuid.UUID("6f1c2a52-3a8e-4f39-9d0a-6d2b1d0b7a11")  # namespace for deterministic ids


def envelope(key: str, payload: dict, source: str = "ml.decision-worker") -> bytes:
    return json.dumps({
        "event_id": str(uuid.uuid4()),
        "occurred_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "key": key,
        "source": source,
        "payload": payload,
    }, ensure_ascii=False).encode()


def detection_payload(rec: dict, *, detection_id: str, frame_id: str, object_id: str, kinds: dict,
                      position: dict | None, crop_uri: str | None) -> dict:
    """`DetectionCreated` from a decision record (decision.as_dict + routing)."""
    conf = rec["probs"].get(rec["defect_type"], rec["top_p"]) if rec["defect_type"] else rec["top_p"]
    return {
        "detection_id": detection_id,
        "frame_id": frame_id,
        "object_id": object_id,
        "object_kind": rec["kind"] if rec["kind"] in kinds else next(iter(kinds)),
        "position": position,
        "defect_type": rec["defect_type"],
        "severity": rec["severity"],
        "confidence": round(float(conf), 4),
        "bbox": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
        "crop_uri": crop_uri,
        "rationale": rec["rationale"],
    }
