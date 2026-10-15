-- The importer records the bundle it imported and skips an unchanged bundle.
CREATE TABLE IF NOT EXISTS content_imports(id TEXT PRIMARY KEY CHECK(id='main'),fingerprint TEXT NOT NULL,imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
