-- Additional boot DDL run by commit ad2ebb22 (before versioned migrations).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
	CREATE INDEX IF NOT EXISTS sessions_account_id ON sessions(account_id);
	CREATE INDEX IF NOT EXISTS sessions_last_used_at ON sessions(last_used_at);
	CREATE INDEX IF NOT EXISTS accounts_billing_purchases ON accounts USING GIN ((data->'billing'->'purchases') jsonb_path_ops);
CREATE TABLE IF NOT EXISTS content_imports(id TEXT PRIMARY KEY CHECK(id='main'),fingerprint TEXT NOT NULL,imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
