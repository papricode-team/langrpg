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

## MCP server

`.mcp.json` registers `tools/world-mcp/server.mjs` as `glotworld-world`. It reads
`GLOTWORLD_URL` and `GLOTWORLD_ADMIN_TOKEN` from the environment. Tools:

| Tool | Use |
|---|---|
| `world_status` | Towns, their contents, the revision and current edit locks. |
| `get_town` | One town as JSON, by section and region. |
| `render_town` | A labelled plan image of a town or region. |
| `list_catalogue` | Placeable objects with their typical width. |
| `apply_edits` | Up to 50 edit operations, validated and published together. |
| `list_edits` | The edit log. |
| `pull_world`, `push_world` | Whole-world files, as the CLI. |

Edit operations are the in-game editor's (`web/src/world-edit-ops.ts`): `move`,
`moveAnchor`, `place`, `update`, `remove` and `residents`. Coordinates are world units
with the origin at the top left; positions are foot points.

## Local development

A fresh local database seeds itself from `content/world-seed.json`. To play production's
world locally, run `npm run world:pull -- --seed` against production and start the server
on an empty database.
