-- The importer records how long the catalog write took, exported by the
-- server as glotworld_content_import_duration_seconds.
ALTER TABLE content_imports ADD COLUMN IF NOT EXISTS duration_ms BIGINT;
