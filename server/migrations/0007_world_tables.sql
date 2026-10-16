-- The world moves out of the single world_content document into rows: one per
-- town, one for the fields every town shares and the publication compiled from
-- them, one per admin change to a story line, an append-only edit log and the
-- API tokens agents use to edit. world_content is copied and kept unchanged as
-- a rollback copy for one release.

CREATE TABLE IF NOT EXISTS world_publication (
 id TEXT PRIMARY KEY CHECK (id = 'main'),
 revision BIGINT NOT NULL CHECK (revision > 0),
 -- Document fields beside "maps", such as the prefab library.
 shared JSONB NOT NULL,
 content_version TEXT NOT NULL,
 world_maps JSONB NOT NULL,
 investigations JSONB NOT NULL,
 diagnostics JSONB NOT NULL DEFAULT '[]',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS world_maps (
 id TEXT PRIMARY KEY,
 scene JSONB NOT NULL,
 -- The publication revision that last changed this town.
 revision BIGINT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS world_story_lines (
 line_key TEXT PRIMARY KEY,
 graph_id TEXT NOT NULL,
 hidden JSONB,
 edited JSONB,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK (hidden IS NOT NULL OR edited IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS world_edits (
 seq BIGSERIAL PRIMARY KEY,
 revision BIGINT NOT NULL,
 actor TEXT NOT NULL,
 source TEXT NOT NULL,
 maps TEXT[] NOT NULL,
 ops JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS world_edits_revision ON world_edits(revision);

CREATE TABLE IF NOT EXISTS admin_tokens (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_used_at TIMESTAMPTZ,
 revoked_at TIMESTAMPTZ
);

INSERT INTO world_publication(id, revision, shared, content_version, world_maps, investigations, diagnostics)
SELECT 'main', 1, (data->'document') - 'maps', data->>'contentVersion', data->'worldMaps', data->'investigations', COALESCE(data->'diagnostics', '[]')
FROM world_content WHERE id = 'main' AND jsonb_typeof(data->'document'->'maps') = 'object'
ON CONFLICT (id) DO NOTHING;

INSERT INTO world_maps(id, scene, revision)
SELECT town.key, town.value, 1
FROM world_content, jsonb_each(data->'document'->'maps') AS town
WHERE world_content.id = 'main' AND jsonb_typeof(data->'document'->'maps') = 'object'
ON CONFLICT (id) DO NOTHING;

INSERT INTO world_story_lines(line_key, graph_id, hidden, edited)
SELECT COALESCE(h.key, e.key), COALESCE(h.value->>'graphId', e.value->>'graphId'), h.value, e.value
FROM (SELECT line.key, line.value FROM world_content, jsonb_each(COALESCE(data->'story'->'hiddenLines', '{}')) AS line WHERE world_content.id = 'main') AS h
FULL JOIN (SELECT line.key, line.value FROM world_content, jsonb_each(COALESCE(data->'story'->'editedLines', '{}')) AS line WHERE world_content.id = 'main') AS e
ON h.key = e.key
ON CONFLICT (line_key) DO NOTHING;

INSERT INTO world_edits(revision, actor, source, maps)
SELECT 1, 'migration', 'migration', COALESCE(ARRAY(SELECT jsonb_object_keys(data->'document'->'maps') ORDER BY 1), '{}')
FROM world_content WHERE id = 'main' AND jsonb_typeof(data->'document'->'maps') = 'object';
