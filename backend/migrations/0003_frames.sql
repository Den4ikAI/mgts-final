-- Photos in object storage and the model's verdict for each (topics frames.ingested
-- and frames.analyzed). Rebuildable by replaying both topics.
CREATE TABLE frames (
    id           UUID PRIMARY KEY,
    source       TEXT NOT NULL,                  -- upload | vehicle | dataset
    image_uri    TEXT NOT NULL,                  -- s3://bucket/key | file:///…
    media_uri    TEXT NOT NULL,                  -- /api/media/store/<key>
    sha256       TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    file_name    TEXT,
    uploaded_by  TEXT,
    object_id    TEXT,
    lat          DOUBLE PRECISION,
    lon          DOUBLE PRECISION,
    status       TEXT NOT NULL DEFAULT 'queued', -- queued | done | error
    result       JSONB,                          -- FrameAnalyzed
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    analyzed_at  TIMESTAMPTZ
);
CREATE INDEX frames_created_idx ON frames (created_at DESC);
CREATE INDEX frames_uploader_idx ON frames (uploaded_by, created_at DESC);
