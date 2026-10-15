-- Catalog tables published before multi-course IDs had no course_id and a
-- global slug key. The importer used to convert them on every run; this does
-- it once. Rows without a course are replaced by the next import, and account
-- references stay recoverable through the published identifier map.

DELETE FROM content_sentences WHERE course_id IS NULL;
ALTER TABLE content_sentences DROP CONSTRAINT IF EXISTS content_sentences_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS content_sentences_course_id_slug_key ON content_sentences(course_id,slug);
ALTER TABLE content_sentences ALTER COLUMN course_id SET NOT NULL;

DELETE FROM content_lexemes WHERE course_id IS NULL;
ALTER TABLE content_lexemes DROP CONSTRAINT IF EXISTS content_lexemes_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS content_lexemes_course_id_slug_key ON content_lexemes(course_id,slug);
ALTER TABLE content_lexemes ALTER COLUMN course_id SET NOT NULL;

DELETE FROM content_exercises WHERE course_id IS NULL;
ALTER TABLE content_exercises DROP CONSTRAINT IF EXISTS content_exercises_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS content_exercises_course_id_slug_key ON content_exercises(course_id,slug);
ALTER TABLE content_exercises ALTER COLUMN course_id SET NOT NULL;

DELETE FROM content_units WHERE course_id IS NULL;
ALTER TABLE content_units DROP CONSTRAINT IF EXISTS content_units_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS content_units_course_id_slug_key ON content_units(course_id,slug);
ALTER TABLE content_units ALTER COLUMN course_id SET NOT NULL;

DELETE FROM content_graphs WHERE course_id IS NULL;
ALTER TABLE content_graphs DROP CONSTRAINT IF EXISTS content_graphs_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS content_graphs_course_id_slug_key ON content_graphs(course_id,slug);
ALTER TABLE content_graphs ALTER COLUMN course_id SET NOT NULL;

DELETE FROM content_expeditions WHERE course_id IS NULL;
ALTER TABLE content_expeditions DROP CONSTRAINT IF EXISTS content_expeditions_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS content_expeditions_course_id_slug_key ON content_expeditions(course_id,slug);
ALTER TABLE content_expeditions ALTER COLUMN course_id SET NOT NULL;

DELETE FROM content_minigames WHERE course_id IS NULL;
ALTER TABLE content_minigames DROP CONSTRAINT IF EXISTS content_minigames_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS content_minigames_course_id_slug_key ON content_minigames(course_id,slug);
ALTER TABLE content_minigames ALTER COLUMN course_id SET NOT NULL;
