# Scene authoring

The world is a version 4 scene document: `{version: 4, maps: {<town>: WorldScene}, prefabs?}`. The schema
and its validation live in `web/src/scene-schema.ts`. The server stores one row per town in PostgreSQL
(`world_maps`) and serves the whole document from `GET /api/world-content`; nothing in the browser bundle
carries a world. See [world storage](world-storage-redesign.md) and [editing from tools](world-agents.md).

## Where the world comes from

- **PostgreSQL** holds the live world. Every edit, from the game, the admin map editor, the CLI or an agent,
  goes through `POST /api/admin/world/ops` or a whole-world import, is checked by the Node worker
  (`scripts/admin-world-worker.mjs`) and lands in the edit log.
- **`content/world-seed.json`** fills an empty database and brings the story characters and evidence a
  release adds: at boot the worker adds any missing `npcs` and `objects` at the seed's position and
  recompiles story positions. Tests and Node tooling read the seed through `web/src/test-support/world-seed.ts`
  and `scene-data.ts`. Refresh it from production with `npm run world:pull -- --seed`.
- Older documents upgrade when parsed: version 3 vector terrain converts to painted ground exactly; towns that
  had image plates take the seed's ground at boot.

## Coordinates

Coordinates are **world units** with the origin at the top left; x grows east and y grows south. A town is
`width × height` units (the three towns are 2304 × 1536 and 2304 × 1024). Scenery, characters and evidence are
placed by their **foot point**, where they meet the ground. The server stores player positions normalized to the
town's coordinate frame; changing a town's size or `legacyOffset` needs a higher `coordinateVersion`.

## Ground

`scene.ground` is painted like Unity terrain (`web/src/ground.ts`):

- A grid of samples every `cell` world units (8 for painted towns, 4 for towns converted from vector terrain)
  holds one weight per material **layer**, at most six. Layer weights are run-length encoded per layer.
- The renderer (`web/src/ground-terrain.ts`) is one shader quad over the town. It samples two small control
  textures for the weights and up to six tiled materials from `web/src/data/terrain-materials.json`, blending
  them with a height-aware mix. Painting re-uploads only the control textures.
- Painting is the edit operation `{kind: 'paint', map, material, radius, strength, points}`: a soft round
  brush adds `strength` of the material along the path and removes the same share from the other layers. A
  material joins as a new layer; a town reuses a layer nothing shows any more.
- **Walking**: blocked materials (the waters and `cliff`) stop walkers where they hold at least 60% of the
  weight. Shores are traced between samples (marching squares) and cut into 256-unit tiles for navigation.
- **Features** (`ground.features`) are painted pieces such as bridges and compass inlays, placed by position and
  width. Their traced surfaces apply in order on top of the ground: masonry blocks, a deck opens a crossing.

## Scenery and anchors

`scenery[]` items are reusable transparent artwork: `asset` (the physical role), optional `frame` and
`variant`, `width`, `flipX`, `collidable`, `motion` and an optional `interior` room. Their footprint comes from
the artwork's geometry in `web/src/data/scenery-geometry.json`, or the shape rules in `placed-scenery.ts` for
artwork without one; an item stores `collision` only when an admin drew its own. `sortLine` overrides the depth
contour. `activities[]` are resident spots owned by a scenery item; `residents[]` carry daily schedules over them.

`npcs[]` and `objects[]` are story anchors. Their ids belong to the story content (`web/src/maps.ts`); the
compiler refuses a town missing one or holding one with no content.

## Validation

`parseWorldSceneDocument` checks structure. The worker checks each edit against what it changed: refusals
(`invalid`, `missing`, `locked`, `stale`, `occupied`, `in-use`, `room-taken`, `no-door`, `out-of-bounds`) and
warnings (overlaps, blocked routes, story anchors). `node scripts/scene-compiler.mjs check [document.json]`
validates a whole document, by default the seed, including artwork, routes from the spawn to every story
target, door and resident spot, and the composition rules in `scripts/scene-quality.mjs`.
