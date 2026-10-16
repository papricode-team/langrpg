-- World and content parts are opaque to the server, which reads and writes
-- them whole. json keeps the bytes the compiler and importer wrote; jsonb
-- reorders object keys. Values already stored keep jsonb's order until they
-- are next written.
ALTER TABLE world_maps ALTER COLUMN scene TYPE json USING scene::json;
ALTER TABLE world_publication ALTER COLUMN shared TYPE json USING shared::json,
  ALTER COLUMN world_maps TYPE json USING world_maps::json,
  ALTER COLUMN investigations TYPE json USING investigations::json,
  ALTER COLUMN diagnostics DROP DEFAULT,
  ALTER COLUMN diagnostics TYPE json USING diagnostics::json,
  ALTER COLUMN diagnostics SET DEFAULT '[]';
ALTER TABLE world_story_lines ALTER COLUMN hidden TYPE json USING hidden::json,
  ALTER COLUMN edited TYPE json USING edited::json;
ALTER TABLE world_edits ALTER COLUMN ops TYPE json USING ops::json;
ALTER TABLE world_state ALTER COLUMN data TYPE json USING data::json;
ALTER TABLE content_courses ALTER COLUMN body TYPE json USING body::json;
ALTER TABLE content_manifests ALTER COLUMN body TYPE json USING body::json;
ALTER TABLE content_sentences ALTER COLUMN body TYPE json USING body::json;
ALTER TABLE content_lexemes ALTER COLUMN body TYPE json USING body::json;
ALTER TABLE content_exercises ALTER COLUMN body TYPE json USING body::json;
ALTER TABLE content_units ALTER COLUMN body TYPE json USING body::json;
ALTER TABLE content_graphs ALTER COLUMN body TYPE json USING body::json;
ALTER TABLE content_expeditions ALTER COLUMN body TYPE json USING body::json;
ALTER TABLE content_minigames ALTER COLUMN body TYPE json USING body::json;
ALTER TABLE content_metadata ALTER COLUMN ids TYPE json USING ids::json,
  ALTER COLUMN published_ids DROP DEFAULT,
  ALTER COLUMN published_ids TYPE json USING published_ids::json,
  ALTER COLUMN published_ids SET DEFAULT '{}';
