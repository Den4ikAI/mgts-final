-- Dataset imports (POST /api/datasets): a zip of photos + the organizers' tables.
CREATE TABLE batches (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL,
    uploaded_by TEXT,
    images      INT NOT NULL,
    labeled     INT NOT NULL,
    notes       JSONB NOT NULL DEFAULT '{}',     -- unmatched rows, skipped files
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE frames ADD COLUMN batch_id UUID, ADD COLUMN truth JSONB;
CREATE INDEX frames_batch_idx ON frames (batch_id, created_at);
