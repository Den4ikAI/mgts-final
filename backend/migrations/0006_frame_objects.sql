-- Second-stage result: every cabinet / board in the frame with a box (topic frames.objects).
CREATE TABLE frame_objects (
    frame_id    UUID PRIMARY KEY,
    objects     JSONB NOT NULL,                  -- [DetectedObject]
    model       TEXT NOT NULL,
    error       TEXT,
    analyzed_at TIMESTAMPTZ NOT NULL
);
