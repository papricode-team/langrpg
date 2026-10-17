# Editing the world from tools and agents

The live world (towns, terrain, residents, story anchors, prefabs and admin story line
changes) lives in PostgreSQL on the server. The repository holds only the seed world,
`content/world-seed.json`, which fills an empty database and brings the story anchors a
release adds. Edits made in the game, the admin map editor, the CLI or an agent all go
through the same server checks and reach players at once.

## API tokens

Create a token under **Admin › API tokens**. It is shown once. A token acts with your
administrator access while your email stays on `ADMIN_EMAILS`; it cannot create or revoke
tokens. Revoke it there when you no longer use it. Every change lands in the edit log with
its source (`editor`, `agent`, `seed`, `release`).

```sh
export GLOTWORLD_ADMIN_TOKEN=gwa_…
export GLOTWORLD_URL=https://glotworld.com   # the default; use http://127.0.0.1:8097 for a local server
```

## Command line

| Command | Does |
|---|---|
| `npm run world:pull` | Saves the world to `.world/world.json` (git-ignored). |
| `npm run world:pull -- --seed` | Also writes `content/world-seed.json`, so new databases and tests start from it. Commit it when you want that. |
| `npm run world:push` | Publishes `.world/world.json` if nobody changed the world since the pull. |
| `npm run world:push -- --check` | Validates it without publishing. |
| `npm run world:preview -- <town> out.png [--file .world/world.json] [--region x,y,w,h]` | Draws a labelled plan of a town. |
| `npm run world:view -- <town> out.png [--file .world/world.json] [--region x,y,w,h] [--scale 1] [--period night]` | Screenshots a town as players see it, drawn by the game's renderer in headless Chrome (`web/world-view.html`). Uses the installed Chrome, or Playwright's after `npx playwright install chromium`. |

## MCP server

`.mcp.json` registers `tools/world-mcp/server.mjs` as `glotworld-world`. It reads
`GLOTWORLD_URL` and `GLOTWORLD_ADMIN_TOKEN` from the environment. Tools:

| Tool | Use |
|---|---|
| `list_buildings` | All enterable buildings, including implicit default interiors, with room/floor counts and fingerprints. |
| `list_room_catalogue` | Room templates, furniture, games, component fields and coordinate conventions. |
| `get_building` | Editable layouts and the room/floor connection graph; optional `room` limits the component data. |
| `edit_building` | Atomic component, shell, room and floor actions with paired doors/stairs and stale-edit protection. |
| `copy_building_layout` | Duplicate a room/floor within a building or copy between buildings and towns. |
| `audit_building` | Floor polygons, paired connections, collisions and walking routes for one building. |
| `render_room`, `view_room` | A labelled component plan or the game’s actual room renderer. |
| `world_status` | Towns, their contents, the revision and current edit locks. |
| `get_town` | One town as JSON, by section and region. |
| `render_town` | A labelled plan of a town or region, with a legend of the ground colours. For finding things. |
| `view_town` | A screenshot of the town as players see it: ground with kerbs and canal walls, bridges, buildings and props. For judging how it looks. |
| `audit_town` | Everything a release checks for one town: reachability, residents' walks, artwork scale, composition per screenful. |
| `shape_ground` | Lays out a town's ground from shapes (streets, squares, rivers) with crisp edges, into a draft. |
| `list_catalogue` | Placeable objects with their typical width. |
| `apply_edits` | Up to 50 edit operations, validated and published together, or applied to a draft with the same checks. |
| `list_edits` | The edit log. |
| `pull_world`, `push_world` | Whole-world files, as the CLI. |

Work on a draft for anything larger than a touch-up: `pull_world` to `.world/draft.json`, change it with
`shape_ground` and `apply_edits` (with `draft`), look at it with `view_town`, check it with `audit_town`,
then `push_world` the file. `get_town`, `render_town`, `view_town` and `audit_town` all read a draft when
given one. Without `draft`, `apply_edits` publishes straight to players.

## Rooms and floors

The MCP room tools use the same `roomLayout` data and save validation as the visual room editor.
There is no separate MCP layout or clipboard. All read/preview tools accept `draft`; mutations
without it publish immediately through the existing API, locks and edit history. Reconnect an
already-running MCP client after updating the server to discover the new tool definitions.

1. `list_buildings({town, draft})` finds owner IDs, even for buildings still using default interiors.
2. `get_building({town, building, draft})` expands the layout and returns a `fingerprint`. Use the
   scenery **building owner ID**, not an interior ID. `main` is the entrance room.
3. `list_room_catalogue({})` provides public game IDs, furniture sources and exact component fields.
4. `edit_building({town, building, draft, expected: fingerprint, actions: [...]})` applies an entire
   batch or nothing. The response contains the new fingerprint and room graph. Actions are:
   `add_room`, `add_floor`, `update_room`, `move_floor`, `remove_room`, `remove_floor`, `set_shell`,
   `put_component`, `remove_component`, `connect_rooms`, and `disconnect_rooms`.
5. Inspect `render_room` (IDs and collision footprints), `view_room` (artwork), and `audit_building`.
   Publish the completed draft through `push_world` as usual.

Example action batch for a building (wrap it with its town, building, draft and current fingerprint):

```json
[
  {"action":"add_floor","id":"upper","name":"Upstairs landing","level":1},
  {"action":"add_room","id":"study","name":"Study","from":"upper"},
  {"action":"set_shell","room":"study","floors":[{"id":"study-floor","points":[[160,300],[1376,300],[1376,900],[160,900]]}],"spawn":{"x":700,"y":750},"exit":{"x":700,"y":820}},
  {"action":"put_component","room":"study","group":"walls","component":{"id":"partition","x":300,"y":350,"width":400,"height":24}},
  {"action":"put_component","room":"study","group":"doors","component":{"id":"opening","wallId":"partition","offset":100,"width":96}},
  {"action":"put_component","room":"study","group":"furniture","component":{"id":"table","source":"cafe-table","x":500,"y":600,"width":140}},
  {"action":"put_component","room":"study","group":"games","component":{"id":"writing","game":"re-ink","x":1100,"y":400}}
]
```

Room coordinates are pixels on a 1536 × 1024 canvas. Floor polygons, entrance (`spawn`) and town
exit can all be customized with `set_shell`. `put_component` merges a patch into an existing
component by ID or adds a complete new one. Move existing NPC/story markers with the `npcs` and
`encounters` groups; required story actors cannot be removed. Walls own their doorway openings;
removing a wall removes its openings. Copied games attached to furniture follow that furniture
when it moves and are removed with it.

`add_room` connects to `from` (default `main`) on the same level unless `level` is supplied.
`add_floor` requires an unused level. `at` and `backAt` optionally position the two endpoints;
omitting them chooses walkable positions. `connect_rooms` accepts `from`, `to`, optional endpoint
IDs `id`/`backId`, and those same positions. A level difference creates stairs automatically.
`update_room` changes a secondary room's name/level; `move_floor` changes all rooms on a level.
Both update connection types at both ends. Removal refuses a disconnected remaining building.
The main room stays on level 0; there are at most 16 rooms, on levels −15 through 15.

For duplication, call `copy_building_layout` with `sourceTown`, `sourceBuilding`, `sourceRoom`,
`scope: "room" | "floor"`, `sourceExpected` from the source read, and destination `town`, `building`,
`expected`, optional `destinationRoom` (default `main`), and `draft`. Set source and destination to
the same building to duplicate there. Room copies join the selected destination room’s level;
floor copies use a new available level. Internal doors remain paired, external links are replaced
with destination connections, and every copied component gets an independent identity. Shapes,
furniture collision footprints and games transfer between building types. Story dialogue and
characters remain at source. The response includes `addedRooms` and `firstRoom` for further edits.

For a whole-layout restore/reset, `apply_edits` also accepts
`{kind:"room", map:town, id:building, expected:fingerprint, layout:savedLayout}` (`layout:null`
restores the template). Saving a pre-edit layout and using the latest fingerprint provides an
explicit undo. Draft writes are serialized so concurrent stale edits cannot overwrite each other.

## Ground design

Paving materials (cobble, limestone, slate, brick, town cobble) are drawn with a row of kerb stones on
their outline, and built water (deep water, canal water, the stone-edged canal) with a coping and wall.
Their outline is the half-weight contour, so shapes give crisp, designed edges while brush strokes give
soft ones. Streams and ponds (shallow water) keep a natural bank; give natural shapes (streams, forest floor, worn earth paths) `soft` and `wobble` so their outline fades and wanders instead of following the drawn line. The `canal-arch-bridge` deck runs from
the north-west to the south-east, so a bridge crosses water that runs from the south-west to the
north-east; check that walking around is clearly longer than the deck. Give each house a different style
where you can; there are five family houses besides the shops, the café, the archive and the station. Some small-sheet paintings cannot be placed at a valid size: Waldruh's archive, house-3 and house-4 and Nebelstadt's house-2 cannot meet both the height canon and the 2.5 pixels-per-unit floor that `scene-compiler check` enforces, and Waldruh's house would be 200 units wide, where a building needs a standalone high-resolution painting. A room's door also sets a minimum width, so Waldruh's café stands about 334 wide.

Edit operations are the in-game editor's (`web/src/world-edit-ops.ts`): `move`,
`moveAnchor`, `place`, `update`, `remove`, `residents`, `room`, `paint` and `ground`. Coordinates are world units
with the origin at the top left; positions are foot points.

## Local development

A fresh local database seeds itself from `content/world-seed.json`. To play production's
world locally, run `npm run world:pull -- --seed` against production and start the server
on an empty database.
