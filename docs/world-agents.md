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

## Ground design

Paving materials (cobble, limestone, slate, brick, town cobble) are drawn with a row of kerb stones on
their outline, and built water (deep water, canal water, the stone-edged canal) with a coping and wall.
Their outline is the half-weight contour, so shapes give crisp, designed edges while brush strokes give
soft ones. Streams and ponds (shallow water) keep a natural bank; give natural shapes (streams, forest floor, worn earth paths) `soft` and `wobble` so their outline fades and wanders instead of following the drawn line. The `canal-arch-bridge` deck runs from
the north-west to the south-east, so a bridge crosses water that runs from the south-west to the
north-east; check that walking around is clearly longer than the deck. Give each house a different style
where you can; there are five family houses besides the shops, the café, the archive and the station. Some small-sheet paintings (Waldruh's archive, house-3 and house-4, Nebelstadt's house-2) cannot meet both the height canon and the 2.5 pixels-per-unit floor that `scene-compiler check` enforces, so they cannot be placed.

Edit operations are the in-game editor's (`web/src/world-edit-ops.ts`): `move`,
`moveAnchor`, `place`, `update`, `remove` and `residents`. Coordinates are world units
with the origin at the top left; positions are foot points.

## Local development

A fresh local database seeds itself from `content/world-seed.json`. To play production's
world locally, run `npm run world:pull -- --seed` against production and start the server
on an empty database.
