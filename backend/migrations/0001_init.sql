-- Read-side projection of the Kafka event log. Kafka (`object.events`) is the
-- source of truth; these tables can be rebuilt by replaying the topic.

CREATE TABLE objects (
    id               TEXT PRIMARY KEY,           -- registry id (e.g. МГТС колодец №)
    kind             TEXT NOT NULL,              -- cable_well | dual_pole
    lat              DOUBLE PRECISION,
    lon              DOUBLE PRECISION,
    address          TEXT,
    status           TEXT NOT NULL DEFAULT 'not_observed',
    last_defect_type TEXT,
    max_severity     TEXT,
    last_seen_at     TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX objects_status_idx ON objects (status);

CREATE TABLE detections (
    id           UUID PRIMARY KEY,
    frame_id     UUID NOT NULL,
    object_id    TEXT REFERENCES objects (id),
    object_kind  TEXT NOT NULL,
    defect_type  TEXT,
    severity     TEXT,
    confidence   REAL NOT NULL,
    bbox         JSONB NOT NULL,
    crop_uri     TEXT,
    rationale    TEXT,
    lat          DOUBLE PRECISION,
    lon          DOUBLE PRECISION,
    review_state TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | rejected | need_recapture
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX detections_object_idx ON detections (object_id, created_at DESC);
CREATE INDEX detections_pending_idx ON detections (review_state) WHERE review_state = 'pending';

CREATE TABLE object_events (
    event_id    UUID PRIMARY KEY,                -- idempotency key from the envelope
    object_id   TEXT NOT NULL,
    type        TEXT NOT NULL,
    payload     JSONB NOT NULL,
    source      TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX object_events_object_idx ON object_events (object_id, occurred_at);
