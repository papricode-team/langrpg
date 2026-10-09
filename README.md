# The Lantern Atlas

A German-learning multiplayer RPG across three painted regions. Investigate a vanishing railway in Lindenhafen, a missing hour in Waldruh, and a lighthouse erasing names in Nebelstadt. Help residents with everyday problems, uncover the Brass Office’s altered records and restore a promise the whole route can trust.

The game includes **3,283 lexical targets, 405 learning routes, 39 grammar guides and 10,266 course tasks**, alongside the original **18 quests and 126 story expressions**. Four actual mini-game systems contain **48 authored scenes across A1, A2 and B1**. Reading, listening and constrained written practice are included; speaking is excluded. Reference coverage and assessment limits are documented in [Curriculum](docs/curriculum.md).

## Playable features

- Three distinct painted 2D maps for A1, A2 and B1, with connected paths, animated currents/fountains/smoke, regional waterfall/mill/fog/lighthouse effects, seven recurring story residents, nine strolling locals and 15 interactive objects. Decorative motion respects reduced motion and uses smaller mobile budgets.
- Painted adult characters with four-direction player animation, live hair/skin/coat previews, visible players and shared town chat. Painted foreground silhouettes sort characters behind street-edge trees, lamps and planters. Shared material atlases keep character texture memory independent of player palettes.
- Café tray/preparation games, market budgets/change/trades, connected evidence investigations and delivery route boards. Missions save in-progress actions and resume after leaving; each level adds more complex German.
- Recognition, German listening, sentence tiles and hidden-answer typing with hints and corrective explanations. Object encounters offer brief contextual practice for new or due expressions; familiar expressions can rest.
- First-visit story scenes, 18 earned discoveries, a mystery journal and clear next leads connecting all three regions. Regions stay freely explorable; completing each act recommends the next destination.
- Server-graded attempts, exact course completion and validated current-run activity rewards. Independent word memory separates exposure from recognition/listening/recall and uses FSRS; new or due words return in short sessions while strong words rest.
- Original grammar explanations, connected reading/listening passages, guided writing and unseen practical checkpoints. The Word atlas makes every lexical target searchable, with articles, plurals, forms and source attribution.
- Full-viewport desktop and mobile game interface with a compact objective chip, contextual interactions and one adventure menu. The region atlas and learning tools open as game panels. The canvas world uses Phaser; accessible interface controls use HTML.
- Players and chat are separated by region. Server-confirmed travel restores map positions and keeps movement and messages in the correct region.

## Run locally

Requirements: **Go 1.26+** and **Node.js 22.12+**. Node 20.19+ is also supported by the frontend tooling.

From the repository root:

```sh
npm install
npm run dev
```

Open [http://localhost:5187](http://localhost:5187). The development command starts Go on **8097** and Vite on **5187**, with REST and WebSocket proxying. Stop both with Ctrl+C.

Open the menu and choose **Continue the story** for your next conversation. **Story quests**, **Discoveries** and the **Region atlas** follow the main journey. **Side activities** contains optional café, market, detective and delivery missions; **Learning routes** offers vocabulary, grammar and connected practice. You can also follow the objective chip or meet a resident. Inspect a glowing object for a clue and a short language encounter. Use **A little help** whenever needed; return to **Your words** for due practice and **Discoveries** for collected evidence. Travel through the **Region atlas**. To test two distinct players, use separate browser profiles or a private window. Tabs sharing the same session represent the same player.

Without `DATABASE_URL`, the server saves development data to `server/.data/state.json`. The browser's session token restores that profile and progress. Account recovery is not implemented, so clearing browser storage loses access to that demo identity.

## Controls

The world fills the browser window. Open the adventure menu for the quest log, story journal, region atlas, learning journal, character editor and settings. The compass opens the region atlas directly. Local chat connects players exploring the same region.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Walk along the town's paths |
| Click / tap a destination | Follow a route to that point |
| E | Talk to a nearby resident or inspect an object |
| Click / tap a character | Walk over and start a conversation |
| Click / tap an interactive object | Approach it and investigate |
| P | Open or close playable missions |
| L | Open or close the Course |
| Q | Open or close Quests |
| J | Open or close the Word journal |
| C | Open or close your character editor |
| O | Open or close Settings |
| F | Open or close the live screen filter panel |
| M | Open the region atlas while exploring |
| Escape | Close menus or encounters; collapse open town chat |
| Mouse wheel | Zoom the world |

On phones in portrait or landscape, drag the lower-left joystick to walk and release it to stop. The contextual action changes between **Talk** and **Inspect** near residents and objects. One adventure menu keeps the exploration screen clear; the objective chip opens the next lead. Atlas pins walk to the corresponding resident or object. **Settings** contains listening pace, interface sounds and region selection.

Use **Filters** or **F** to experiment with Original, Soft paint, CRT and Pixel CRT while viewing the world. Adjust softness, scanlines, texture, warmth, edge shade and pixel size; hold **Compare original** to compare the unfiltered artwork. Choices save on this device. The shared screen filter affects the world and its labels, while HTML menus and HUD stay clear. Filters require WebGL; the Canvas fallback keeps the original artwork.

## Checks

```sh
npm test
npm run check
npm run build
cd server
go test -race ./...
go vet ./...
```

Frontend tests cover learning behavior, complete vocabulary/course/server parity, legal solutions for all 48 activity scenes, saved-board and retry behavior, bounded review selection, navigation and map-aware connection recovery. Go tests cover grading, persistence, idempotency, scheduling, region isolation, travel and reconnects. Optional PostgreSQL integration checks are described in the [server guide](server/README.md).

## Docker Compose and Dokploy

```sh
cp .env.example .env
docker compose up --build -d
```

Edit `.env` for your environment, especially `POSTGRES_PASSWORD` and `ALLOWED_ORIGINS`. Local Compose serves the game at [http://localhost:8088](http://localhost:8088), with PostgreSQL in a named volume and the Go service private.

For Dokploy, create a Docker Compose service using `compose.yaml`. Add the public domain to the **web service, internal port 80**, and set `ALLOWED_ORIGINS` to that HTTPS origin. Keep the database and backend private; remove the local web port mapping through a production override when Dokploy handles ingress. See the [deployment and API guide](server/README.md) for configuration, persistence and backups.

## Temporary TryCloudflare preview

The Cloudflare Pages project and its deployments were removed on 2026-10-08. Preview the game through a temporary [TryCloudflare tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) instead.

The current preview is [https://features-targeted-executed-engineer.trycloudflare.com](https://features-targeted-executed-engineer.trycloudflare.com). It serves the built frontend and proxies `/api/*`, including multiplayer WebSocket connections, to the local Go server. Progress uses the existing local development data store. This URL only works while the local servers and `cloudflared` are running; restarting the tunnel creates a new URL.

To start another preview, build the frontend from the repository root:

```sh
npm run build
```

In a separate terminal, serve the build. Vite preview inherits the existing `/api` HTTP and WebSocket proxy to port 8097:

```sh
npm exec --workspace web -- vite preview --host 127.0.0.1 --port 5188 --strictPort
```

Start the temporary tunnel in another terminal:

```sh
cloudflared tunnel --url http://127.0.0.1:5188 --http-host-header localhost:5188 --no-autoupdate
```

Copy its printed HTTPS URL, stop any existing `npm run dev` process for this project, then start the local Go server and development frontend with that exact URL added to the origin allowlist. Replace the example tunnel hostname below:

```sh
ALLOWED_ORIGINS=http://localhost:5187,http://127.0.0.1:5187,http://127.240.77.9:5187,http://127.0.0.1:5188,https://YOUR-TUNNEL.trycloudflare.com npm run dev
```

Keep all three processes running. Check `/api/health` with the tunnel URL as the `Origin` header and confirm the game shows connected players. Do not run multiple Go processes against the same JSON development store.

## Project map

| Location | Purpose |
| --- | --- |
| `web/src/main.ts` | Interface, quest sessions, journal, character and chat |
| `web/src/world.ts`, `maps.ts`, `navigation.ts` | Phaser world, three region definitions, movement and routing |
| `web/src/content.ts`, `story.ts` | NPCs, quests, learning content and connected story discoveries |
| `web/src/course.ts`, `data/course.json` | Attributed lexicon, original lessons and canonical course tasks |
| `web/src/activities.ts`, `activity-engine.ts` | Stateful mission controls and pure gameplay rules |
| `scripts/build-course.mjs` | Generates matching frontend and Go course manifests |
| `web/src/review.ts` | Short reviews across word skills, course sentences and story expressions |
| `web/src/api.ts` | REST sessions, map acknowledgements and multiplayer reconnects |
| `server/curriculum.json`, `server/course.json` | Canonical grading, word links and exact completion requirements |
| `server/` | Go REST/WebSocket service, persistence and FSRS scheduling |
| `compose.yaml` | Web, Go and PostgreSQL deployment |
| [Curriculum](docs/curriculum.md) | Coverage, content contract and assessment limits |
| [Implementation plan](docs/implementation-plan.md) | Complete scope and parallel ownership |
| [Activities](docs/activities.md) | Gameplay contracts, recovery and mobile verification |
| [Research](docs/research.md) | Evidence behind the learning design |
| [Art and audio](docs/art.md) | Asset provenance and production directions |
| [World animation](docs/world-animation.md) | Regional motion, local routines, performance and browser verification |
| [Scenery depth](docs/world-occlusion.md) | Painted foreground silhouettes, shared collision footprints and atlas lifecycle |

One Go process hosts Lindenhafen, Waldruh and Nebelstadt, with separate players and chat in each region. `MAX_ZONE_PLAYERS` defaults to **128 connected players per map**; this is a configured capacity limit, not a measured concurrency guarantee. The server remembers each player's map positions for up to ten minutes after disconnect, subject to its bounded in-memory cache. Each region retains its last 50 chat messages while the process runs. Positions and chat reset on server restart; profiles, learning progress, quest rewards and review schedules remain saved in PostgreSQL or the local development JSON store.

Account recovery, moderation and durable chat history, educator-reviewed curriculum validation, speaking assessment, shared server collision geometry and horizontal zone scaling remain future work.
