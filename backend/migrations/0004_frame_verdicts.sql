-- Verdicts in their own table: frames.ingested and frames.analyzed are different
-- topics, so on a replay a verdict may arrive before its frame row exists.
CREATE TABLE frame_verdicts (
    frame_id    UUID PRIMARY KEY,
    status      TEXT NOT NULL,                   -- done | error
    result      JSONB NOT NULL,                  -- FrameAnalyzed
    analyzed_at TIMESTAMPTZ NOT NULL
);
INSERT INTO frame_verdicts (frame_id, status, result, analyzed_at)
SELECT id, status, result, COALESCE(analyzed_at, now()) FROM frames WHERE result IS NOT NULL;
ALTER TABLE frames DROP COLUMN status, DROP COLUMN result, DROP COLUMN analyzed_at;
