-- Schema produced by commit 51946b10: NewPGStore's boot DDL followed by the
-- content importer (EnsureSchema plus its per-import conversion), verbatim.
-- Used only to prove that existing databases adopt the versioned migrations.
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, data JSONB NOT NULL);
	CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
	CREATE TABLE IF NOT EXISTS learning_events (account_id TEXT NOT NULL REFERENCES accounts(id), event_key TEXT NOT NULL, request JSONB NOT NULL, receipt JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (account_id,event_key));
	CREATE TABLE IF NOT EXISTS world_state (id TEXT PRIMARY KEY CHECK (id = 'main'), data JSONB NOT NULL);
	CREATE TABLE IF NOT EXISTS world_content (id TEXT PRIMARY KEY CHECK (id = 'main'), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS analytics_events (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, account_id TEXT NOT NULL DEFAULT '',
 visitor TEXT NOT NULL DEFAULT '', session_id TEXT NOT NULL DEFAULT '',
 source TEXT NOT NULL DEFAULT '', campaign TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '',
 detail TEXT NOT NULL DEFAULT '', correct INTEGER NOT NULL DEFAULT 0, at TIMESTAMPTZ NOT NULL);
 CREATE INDEX IF NOT EXISTS analytics_events_at ON analytics_events(at);
 CREATE INDEX IF NOT EXISTS analytics_events_account_at ON analytics_events(account_id, at);
 CREATE TABLE IF NOT EXISTS analytics_maintenance (id INTEGER PRIMARY KEY CHECK (id=1), pruned_at TIMESTAMPTZ NOT NULL);
 INSERT INTO analytics_maintenance VALUES(1, '1970-01-01') ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_unique ON accounts ((data->>'email')) WHERE data->>'email' IS NOT NULL;
CREATE TABLE IF NOT EXISTS content_courses(id UUID PRIMARY KEY,slug TEXT NOT NULL UNIQUE,body JSONB NOT NULL);
	CREATE TABLE IF NOT EXISTS content_metadata(id TEXT PRIMARY KEY CHECK(id='main'),version INTEGER NOT NULL,ids JSONB NOT NULL,published_ids JSONB NOT NULL DEFAULT '{}');
	ALTER TABLE content_metadata ADD COLUMN IF NOT EXISTS published_ids JSONB NOT NULL DEFAULT '{}';
	CREATE TABLE IF NOT EXISTS content_manifests(id UUID PRIMARY KEY,course_id UUID NOT NULL REFERENCES content_courses(id),slug TEXT NOT NULL,kind TEXT NOT NULL,version INTEGER NOT NULL,body JSONB NOT NULL,UNIQUE(course_id,kind,slug));
CREATE TABLE IF NOT EXISTS content_exercises(id UUID PRIMARY KEY,course_id UUID NOT NULL REFERENCES content_courses(id),slug TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),body JSONB NOT NULL,UNIQUE(course_id,slug));
		ALTER TABLE content_exercises ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES content_courses(id);
		CREATE INDEX IF NOT EXISTS content_exercises_course ON content_exercises(course_id);
DELETE FROM content_exercises WHERE course_id IS NULL;
		ALTER TABLE content_exercises DROP CONSTRAINT IF EXISTS content_exercises_slug_key;
		CREATE UNIQUE INDEX IF NOT EXISTS content_exercises_course_id_slug_key ON content_exercises(course_id,slug);
ALTER TABLE content_exercises ALTER COLUMN course_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS content_expeditions(id UUID PRIMARY KEY,course_id UUID NOT NULL REFERENCES content_courses(id),slug TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),body JSONB NOT NULL,UNIQUE(course_id,slug));
		ALTER TABLE content_expeditions ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES content_courses(id);
		CREATE INDEX IF NOT EXISTS content_expeditions_course ON content_expeditions(course_id);
DELETE FROM content_expeditions WHERE course_id IS NULL;
		ALTER TABLE content_expeditions DROP CONSTRAINT IF EXISTS content_expeditions_slug_key;
		CREATE UNIQUE INDEX IF NOT EXISTS content_expeditions_course_id_slug_key ON content_expeditions(course_id,slug);
ALTER TABLE content_expeditions ALTER COLUMN course_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS content_graphs(id UUID PRIMARY KEY,course_id UUID NOT NULL REFERENCES content_courses(id),slug TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),body JSONB NOT NULL,UNIQUE(course_id,slug));
		ALTER TABLE content_graphs ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES content_courses(id);
		CREATE INDEX IF NOT EXISTS content_graphs_course ON content_graphs(course_id);
DELETE FROM content_graphs WHERE course_id IS NULL;
		ALTER TABLE content_graphs DROP CONSTRAINT IF EXISTS content_graphs_slug_key;
		CREATE UNIQUE INDEX IF NOT EXISTS content_graphs_course_id_slug_key ON content_graphs(course_id,slug);
ALTER TABLE content_graphs ALTER COLUMN course_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS content_lexemes(id UUID PRIMARY KEY,course_id UUID NOT NULL REFERENCES content_courses(id),slug TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),body JSONB NOT NULL,UNIQUE(course_id,slug));
		ALTER TABLE content_lexemes ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES content_courses(id);
		CREATE INDEX IF NOT EXISTS content_lexemes_course ON content_lexemes(course_id);
DELETE FROM content_lexemes WHERE course_id IS NULL;
		ALTER TABLE content_lexemes DROP CONSTRAINT IF EXISTS content_lexemes_slug_key;
		CREATE UNIQUE INDEX IF NOT EXISTS content_lexemes_course_id_slug_key ON content_lexemes(course_id,slug);
ALTER TABLE content_lexemes ALTER COLUMN course_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS content_minigames(id UUID PRIMARY KEY,course_id UUID NOT NULL REFERENCES content_courses(id),slug TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),body JSONB NOT NULL,UNIQUE(course_id,slug));
		ALTER TABLE content_minigames ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES content_courses(id);
		CREATE INDEX IF NOT EXISTS content_minigames_course ON content_minigames(course_id);
DELETE FROM content_minigames WHERE course_id IS NULL;
		ALTER TABLE content_minigames DROP CONSTRAINT IF EXISTS content_minigames_slug_key;
		CREATE UNIQUE INDEX IF NOT EXISTS content_minigames_course_id_slug_key ON content_minigames(course_id,slug);
ALTER TABLE content_minigames ALTER COLUMN course_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS content_sentences(id UUID PRIMARY KEY,course_id UUID NOT NULL REFERENCES content_courses(id),slug TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),body JSONB NOT NULL,UNIQUE(course_id,slug));
		ALTER TABLE content_sentences ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES content_courses(id);
		CREATE INDEX IF NOT EXISTS content_sentences_course ON content_sentences(course_id);
DELETE FROM content_sentences WHERE course_id IS NULL;
		ALTER TABLE content_sentences DROP CONSTRAINT IF EXISTS content_sentences_slug_key;
		CREATE UNIQUE INDEX IF NOT EXISTS content_sentences_course_id_slug_key ON content_sentences(course_id,slug);
ALTER TABLE content_sentences ALTER COLUMN course_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS content_units(id UUID PRIMARY KEY,course_id UUID NOT NULL REFERENCES content_courses(id),slug TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),body JSONB NOT NULL,UNIQUE(course_id,slug));
		ALTER TABLE content_units ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES content_courses(id);
		CREATE INDEX IF NOT EXISTS content_units_course ON content_units(course_id);
DELETE FROM content_units WHERE course_id IS NULL;
		ALTER TABLE content_units DROP CONSTRAINT IF EXISTS content_units_slug_key;
		CREATE UNIQUE INDEX IF NOT EXISTS content_units_course_id_slug_key ON content_units(course_id,slug);
ALTER TABLE content_units ALTER COLUMN course_id SET NOT NULL;
ALTER TABLE content_manifests ALTER COLUMN course_id SET NOT NULL;
