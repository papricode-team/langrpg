# World storage, terrain and agent editing redesign

Status: done (2026-10-16). Phases A–C are on main; `world_content` can be dropped after one release. The current model is described in `scene-authoring.md` and `world-agents.md`.

## Goal

A clean, fast scene system: PostgreSQL is the only home of anything the map editor can
edit, one terrain model that paints like Unity terrain, and an MCP server so agents (and
admins) can pull a town, edit it and push it back.

## What the audit found

- The live world is one JSONB row (`world_content`, `id='main'`). The repository holds a
  second, stale copy (`web/src/data/world-scenes.json`) plus generated copies
  (`server/world_maps.json`, story positions in `server/story_rules.json`,
  `world-scene-version.json`, `docs/maps/*.tmj`).
- Admin edits never reach git; git changes never reach an existing DB except new anchors
  (`reconcileWorldContent`). Production already differs: Lindenhafen has 155 objects
  (git: 209), a fully painted modular terrain and 9 prefabs.
- Door/spawn validation reads the binary's embedded `world_maps.json`, not the live world.
- Hash and story-anchor logic exist twice (JS and Go) and already disagree.
- Every placed object stores a scaled copy of its asset's collision polygon.
- Three terrain models: painted image plates, `navigation.terrainCollision` polygons, and
  polygon `modularTerrain` drawn with Canvas 2D patterns.
- Dead or legacy: `/__authoring/*` dev service, Tiled exchange, `world-navigation.json`,
  `walkable`/`obstacles`/`legacyOffset`, `generationZones`, the Lindenhafen terrain draft.

## Decisions

1. **PostgreSQL is the source of truth for editable world data.** The repository keeps
   code, art assets, asset geometry (`scenery-geometry.json`, material catalogue) and one
   seed world, `content/world-seed.json`. The seed only fills an empty database (local
   development, tests) and brings the story anchors a release adds; the server never reads
   it once the database holds a world, and the browser never bundles it.
2. **Tables, one migration.** One row per town (`world_maps`, the scene as JSONB), one for
   the shared fields and compiled publication (`world_publication`), one per admin story
   line change (`world_story_lines`), an append-only `world_edits` log and `admin_tokens`.
   The publication revision is a counter. Towns stay JSONB rather than a row per object:
   the scene schema in `web/src/scene-schema.ts` stays the only schema, every edit is
   validated against the whole town anyway, and a save writes only the towns it changed.
3. **Derived data is computed, never stored in git.** Spawn/entrance registry and story
   positions are compiled from the live tables by the TypeScript worker (one
   implementation). The Go copies (`compileStoryAuthority`, `worldRevision` hashing,
   embedded `world_maps.json`) are removed.
4. **Collision comes from asset geometry.** Objects store only an override an admin drew; the boot
   reconcile drops stored colliders that repeat the artwork's footprint.
5. **One terrain: painted ground.** Per town a grid of samples (8 world units, 4 for converted vector
   towns) holds a weight per material layer, at most six, run-length encoded. A shader quad blends the tiled
   materials through two RGB control textures; a paint edit carries its brush path. Samples where blocked
   materials (water, `cliff`) hold at least 60% stop walkers; shores are traced between samples and bridge decks
   apply exactly. Image plates, `terrainCollision`, polygon `modularTerrain`, curbs and masonry baked into
   Canvas chunks, `foundation-terrain.json` and the legacy navigation document are removed.
6. **Export/import instead of files in git.** `GET /api/admin/world/export` and
   `PUT /api/admin/world/import` move a versioned bundle. `npm run world:pull` writes it to
   the git-ignored `.world/` directory; `world:push` uploads; `world:seed` loads it into a
   local database.
7. **Admin API tokens.** A revocable token table (hash only, name, creator, last use),
   created from the admin page, accepted by `requireAdmin` for world endpoints.
8. **MCP server** (`tools/world-mcp`, stdio, `GLOTWORLD_URL` + `GLOTWORLD_ADMIN_TOKEN`):
   list/get maps, pull/push, apply edit ops, paint terrain, validate, list assets and
   materials, and render a map preview image.

## Migration of the live world

- Migration `0007_world_tables.sql` creates the tables and copies the current
  `world_content` document into them in SQL (`jsonb_*` functions), so production upgrades
  in place at boot. It was rehearsed on a copy of production's world
  (`TestPostgresWorldContentMovesIntoWorldTables` with `WORLD_MIGRATION_DOCUMENT`).
- Terrain converts on the first boot after phase C: Lindenhafen's vector terrain is sampled exactly; Waldruh
  and Nebelstadt, unchanged from the seed, take the seed's ground, which was classified offline from their
  plate art with every water, wall and cliff outline enforced. The plate art does not survive; those towns look
  plainer until repainted. Navigation was checked against the old geometry with the terrain fixtures and the
  old routes, including the 21-unit-wide harbour bridge.
- Production's inn door in Lindenhafen was already unreachable before this work (`door-blocked`); a
  whole-world push is refused until it is fixed in the editor.
- `world_content` is kept read-only for one release as a rollback copy, then dropped.

## Phases

| Phase | Content |
|---|---|
| A. Storage | tables + data migration, store layer, ops write rows, edit log revision, story overrides table, admin tokens, export/import, remove repo world files and Go duplicates |
| B. Agents | token page, `world:pull/push` CLI, MCP server, preview rendering (see `world-agents.md`) |
| C. Terrain | painted ground, shader renderer, brush editor, navigation from the ground, conversion, removal of plates and vector terrain |
| D. Cleanup | colliders from asset geometry, ground tools for agents, docs |

Each phase deploys separately. The migration and the terrain conversion were rehearsed on a copy of
production's world before release.
