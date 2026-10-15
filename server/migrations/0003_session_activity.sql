-- Idle expiry for sessions of linked accounts (SESSION_IDLE_DAYS). Existing
-- sessions start their idle clock when this runs.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS sessions_account_id ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_last_used_at ON sessions(last_used_at);
