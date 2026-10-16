-- Attempt lookups read generated columns instead of reaching into the request
-- and receipt JSONB. The request is the immutable record of what the client
-- sent, so the columns stay derived from it and inserts do not name them.
ALTER TABLE learning_events
  ADD COLUMN IF NOT EXISTS activity_id TEXT GENERATED ALWAYS AS (request->>'activityId') STORED,
  ADD COLUMN IF NOT EXISTS run_id TEXT GENERATED ALWAYS AS (request->>'runId') STORED,
  ADD COLUMN IF NOT EXISTS exercise_id TEXT GENERATED ALWAYS AS (request->>'exerciseId') STORED,
  ADD COLUMN IF NOT EXISTS answered BOOLEAN GENERATED ALWAYS AS (COALESCE(request->>'answer', '') <> '' AND COALESCE(request->>'preview', 'false') <> 'true') STORED,
  ADD COLUMN IF NOT EXISTS correct BOOLEAN GENERATED ALWAYS AS ((receipt->>'correct')::boolean) STORED;
CREATE INDEX IF NOT EXISTS learning_events_corrections ON learning_events(account_id, activity_id, run_id) WHERE correct = false;
