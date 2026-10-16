# glotworld

Website: [glotworld.com](https://glotworld.com).

A German-learning story adventure across three painted towns, with multiplayer presence. Investigate a vanishing railway in Lindenhafen, a missing hour in Waldruh, and a lighthouse erasing names in Nebelstadt. Meet the Brass Office inspector, follow Elise’s letter and decide who should care for the restored Atlas. Ten optional coastal expeditions open after the three-act story.

The game includes **3,283 lexical targets, 405 learning routes, 39 grammar guides and 10,266 course tasks**, alongside **18 story investigations and 126 optional story expressions**. Four mini-game systems contain **48 authored scenes across A1, A2 and B1**. Reading, listening and constrained written practice are included; no microphone is required. Reference coverage and assessment limits are documented in [Curriculum](docs/curriculum.md). See [Roadmap implementation](docs/roadmap-implementation.md) for delivered work and remaining production scope.

## Playable features

- Eighteen authored dialogue graphs replace the mandatory quest quiz queue. Approach the character, hear one German line at a time, read physical evidence, return with your discoveries, write a scene-specific German reply and choose a consequence. The server checks quest order, location, evidence and the saved production receipt before awarding the discovery.
- The story follows one idea: **the Atlas forgets whatever nobody says aloud**, so every German sentence you say restores a name, an address or a route. [docs/story-bible.md](docs/story-bible.md) holds the reveal map, voices, du/Sie rules and scene beats; `npm run test` enforces them with a narrative lint (reveals appear once and in order, NPCs never give tutorial instructions, every scene has its own dilemma, Voss says Sie, server contract preserved). On the last intro line you can **ask optional questions** (Who? What? Where? Why?) that deepen the world and teach question words. Each completed quest unlocks a short **note from Elise** whose German grows with the act, and four reveals (the recording, the vanishing house number, Ada's confession, Voss's ledger) play as short cinematics. Residents comment on your earlier choices, and a choice names which group will remember it. Language mistakes never advance the bell.
- **English or Turkish support.** Onboarding starts with a mother tongue (*English* or *Türkçe*) and learning language (*German*, currently the only option). A confirmation question verifies the pair before step two opens the player name and character builder. Players can return to language selection without losing their character draft, and change support language later in Settings. The Turkish route shows Turkish meanings, glosses, hints, grammar explanations and menus for the whole story and the A1 basics; other course text still falls back to English. German, audio and grading are identical. The Turkish is machine-authored and awaits native review — see [docs/turkish-route.md](docs/turkish-route.md).
- German appears first. Tap unfamiliar words to reveal the full English sentence with the selected word highlighted in context, or use **What did they say?** to toggle the meaning; each new line starts with the meaning hidden, and help counts as assistance. Short A1 turns grow from at most 8 words in the first two quests to 10, then 12. Authored simpler variants are selected using retained-word evidence. Each production scene offers a contextual grammar explanation linked to an existing guide. Measured coverage selects support; it does not guarantee that every line is 95% familiar to every learner.
- The player’s name appears on the ticket and in dialogue. The inspector and Elise have visible characters and portraits. Choices change three factions’ trust, later greetings, the people who offer help and one of three endings. A visible bell counter follows story beats, with the seventh bell reserved for the finale.
- Routes are earned: restore Lindenhafen to reach Waldruh, obtain the archive confession to reach Nebelstadt, then complete Act III to reveal the ten expeditions. Existing earned discoveries remain accessible. Optional drills live in the journal, NPC side offers and the inn.
- **Vocabulary is paced.** For optional learning, the server restores course words at about ten per hour of visible play (ten at the start, never more than fifteen banked). Intake pauses while twelve restored words are still unrecognised or twenty are due for review. Story conversations always open in clue order, regardless of restored vocabulary or play time. Learning routes, word drills, resident barks, interior sessions and the Word atlas follow the restored-word list; **Today's words** in the journal practises the newest ones. See [docs/pacing.md](docs/pacing.md) for the optional practice budget, story vocabulary measurements and `npm run pacing`.
- Server-held letters, keys and evidence appear in a case board. Three named story save slots restore narrative state while preserving XP, language evidence and previously earned rewards. Saved progress grants Echo slow playback, Wordlight highlighting, lantern crests and titles acknowledged by residents.
- Crisp, device-resolution rendering uses Original artwork by default. A camera follows the player and frames conversations. Continuous daylight tint, day/night art transitions, lamp lights, mist, rain and story storm effects bring the painted towns to life. Character facing, resident routines, German barks, a train and short skippable cinematics support the story. Towns still use their existing painted plates; larger multi-plate districts remain production work.
- Chickens, dogs, cats and sheep roam the three story towns, with three coat and body variants per species. Click an animal or use the nearby action button / E to feed chickens or pet the others. Cats sometimes refuse and move away; animals forage, rest at night, and pause when approached. These ambient interactions are local to your visit and award no currency.
- The three story towns have regional music, quieter night stems, ambience, surface footsteps, doors and bells, with narration ducking, mute and reduced-motion preferences. Dialogue clips use consistent installed macOS German voice sketches with recorded provenance. They are not neural or human performances; personalized names use browser speech when a German voice is available, with recorded name-free fallbacks.
- Café, bakery and supermarket interiors offer contextual practice and scripted conversations when no practice is ready; the inn adds a home room, evening review, evidence access and sleep. A shared twelve-minute world clock drives world time. Sleeping advances the player’s own story day without changing everybody else’s clock. A three-answer daily promise can light a lantern streak; resting early carries no penalty.
- Café tray/preparation games, market budgets/change/trades, evidence investigations and delivery boards use server-checked solutions and rewards. Mission drafts resume on this device. Ten post-game neighborhood planning games and 180 expedition encounters save their authoritative results and completed plans on the server, with A1/A2/B1 language support.
- Server-graded recognition, German listening, sentence tiles with distractors and typed answers with conservative typo and umlaut fallback support. Feedback names the error before showing a model answer. Independent word memory separates passive exposure from recognition/listening/recall and uses FSRS, explicit Hard/Good/Easy ratings and response time. Due course words can return as world barks and in the inn’s review; strong words rest.
- An optional short conversational placement sample recommends a practice level without bypassing story routes. The course supplies attributed vocabulary, grammar, connected passages and practical checkpoints; the Word atlas includes articles, plurals, forms and sources.
- Desktop and mobile controls include keyboard, click-to-walk, touch joystick and standard gamepad movement/interact. Players are separated by region and interior. Server-confirmed travel keeps indoor and outdoor positions separate and reconnects to the current room. Multiplayer currently provides presence; cooperative quests and evidence trading remain future work.

The UI content budget and screenshot checks are documented in [UI guidelines](docs/ui-content-budget.md). Painted animals can be reviewed in the actual game world at `/qa/animals.html` on the local development server. With the API and Vite running, `node scripts/check-animals.mjs` checks all animation cells and animal placements in Chrome (`ATLAS_CHROMIUM_PATH` can select another Chromium binary); screenshots stay in `output/ui-screenshots`.

## Run locally

Requirements: **Go 1.26+** and **Node.js 24+**. The world editors use a Node worker to check edits; Docker includes the runtime and its dependencies.

From the repository root:

```sh
npm install
npm run dev
```

Open [http://localhost:5187](http://localhost:5187). The development command starts Go on **8097** and Vite on **5187**, with REST and WebSocket proxying. Stop both with Ctrl+C.

Follow the objective chip or choose **Continue the story** in the menu to walk to your next witness. Read the marked evidence in the world, return to the character and type the requested German reply. Your choice saves the discovery and its consequences. **Story quests**, **Discoveries** and the **Region atlas** follow the main journey; **Side activities**, **Learning routes** and journal practice are optional. Use **What did they say?**, word glosses, **A little help** or **Why this phrase?** when needed.

At the inn, use the evidence desk, review familiar words or sleep to begin a new personal day. **Menu → You** contains three story save slots and the optional placement sample. Routes in the atlas open through the clue chain. After the finale, meet the expedition cast and build neighborhood agreements; their results and completed plans return with the same account on another device. To test two distinct players, use separate browser profiles or a private window. Tabs sharing the same session represent the same player.

New players begin at A1 with short sentences and two complete replies for story requests. Support-language meanings start hidden on every line, including evidence and plot quotations. **What did they say?** toggles them on and off; tapping a word also reveals its meaning in context. Guided support follows learning evidence: it stays through the first three quests and until the last 24 unassisted practice answers show at least 80% success across 12 different successfully answered items, including four written items. Supported choices, XP and time spent exploring cannot remove it; recent difficulty brings it back. Meanings stay available on entering later towns, and an open conversation keeps its format. Optional writing, sentence-building practice and the level sample open after ten minutes of visible, connected play; that timer is saved per player on this device and pauses while hidden or disconnected.

Before a first adventure, choose one of four suggested player names (one is selected) or type your own. Without Creem credentials, or with `FREE_TO_PLAY=true`, play is free and unlimited, and signup is optional for saving progress across devices. With Creem configured, the first ten minutes are free with no signup. A countdown beside **Login** appears during the final minute of guest play. At ten minutes, sign up to keep your character and progress and unlock another 1 hour 50 minutes, or log into an existing account. Choosing to restart as a guest clears all progress and returns the same character to the beginning. At two hours of total free play, continue with a monthly, yearly or lifetime plan through Creem; the paywall shows the prices set in Creem. The server persists and enforces the trial across reloads and devices. On another device, select **Already played? Log in with email** to restore your account. See [Creem billing setup](docs/billing.md) before enabling production checkout.

Without `DATABASE_URL`, the server saves development data to `server/.data/state.json`. The browser's session token restores that profile and progress. Linked players can also log in with email and password after clearing browser storage. Unlinked guests lose access if they lose that token. Email verification and forgotten-password recovery are not implemented.

Set the server-only `ADMIN_EMAILS` environment variable to a comma-separated list of registered account emails, for example `ADMIN_EMAILS=editor@example.com,owner@example.com`. Addresses are trimmed and compared without case; an empty list disables admin access and an invalid address stops server startup. Register the intended accounts before adding their addresses to the allowlist, because signup currently has no email verification. Compose passes this variable from `.env`; for local development, run `ADMIN_EMAILS=editor@example.com npm run dev`. Restart the server after changing the list.

Admins edit the world in two places. Both publish each change immediately, and players see it without reloading:

- **Edit mode in the game.** Press **Edit** while playing. The town keeps running and you keep walking with the keyboard. Click an object, story character or evidence marker to select it, and drag to move it. The inspector flips, resizes within the artwork's limits, chooses the room a building with a painted door hosts, and deletes. **Add** places new objects. A building's door comes from its painting, so a room never needs a separate entrance. While editing, a conversation shows **Hide this line for everyone** on monologue lines. **Undo** reverts your own last edits. Another admin's selected object is outlined with their name and cannot be changed until they let go. Edit mode is hidden on phones.
- **Admin › Map editor.** The **Admin** link opens analytics and the map editor. The map editor shows a whole town with the same tools, plus a **Town** check, **Terrain** painting with a soft brush over up to six blended materials, the **Residents** schedule editor, **Story** mode, and **Import** and **Export** of the complete world (up to **2 MiB**).
- **Admin › Map editor › Story.** The whole story as a script in play order: acts and scenes on the left, each with the number of words players first meet there against the pace of about ten; the scene in the middle with its task, decision and branches; and the selected line's words on the right. Lines that depend on an earlier decision say which reply they follow. Pick replies to follow one playthrough through later scenes, and search every line in either language. Any line can be rewritten in German and its translations, hidden or restored. The editor checks a rewrite as you type: words above the scene's level, words new to the story, the pace, sentence length, placeholders such as `{name}`, and translations left unchanged. An edited line plays without its recorded voice, simpler version and word-by-word highlights until the source is updated; every change is listed and can be undone. Keys: ↑/↓ line, [ and ] scene, Enter edit, H hide, / search.

Edits are checked where they are made. Objects stay inside the town, off water and walls, and out of other objects' bases; players must still reach every story character, door and resident spot. Refusals name the object in one sentence and highlight it. The world lives in PostgreSQL, one row per town with an edit log; the repository keeps only `content/world-seed.json`, which fills an empty database. Tools and agents edit the same world through API tokens, `npm run world:pull`/`world:push` and the MCP server in `tools/world-mcp` ([guide](docs/world-agents.md)). See [scene authoring](docs/scene-authoring.md) for the document and ground model.

## Controls

The world fills the browser window. Open the four-section menu: **Map**, **Story**, **Learn** and **You**. Select a word to open its meaning, forms, example and practice in a detail pane or phone sheet. Choose **Map** to open the region atlas.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Walk along the town's paths |
| Click / tap a destination | Follow a route to that point |
| E | Talk, inspect, feed a nearby chicken or pet an animal |
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
| Escape | Open the menu, or leave dialogue, menus or encounters |
| Gamepad left stick / D-pad, A | Walk and interact |
| E / Enter / click during a cinematic | Advance the cinematic; Escape skips it |
| Settings → Time of day | Choose a time, a slow cycle or real local time |
| Settings → Watch the world | Hide controls and watch a slow camera tour |

On phones in portrait or landscape, drag the lower-left joystick to walk and release it to stop. The contextual action changes between **Talk** and **Inspect** near residents and objects. One adventure menu keeps the exploration screen clear; the objective chip opens the next lead. Atlas pins walk to the corresponding resident or object. **Settings** contains listening pace, interface sounds, scenery motion, time of day, **Watch the world** and region selection.

The world uses **Original** artwork by default. Open **Settings → Screen filters** or press **F** to experiment with Original, Soft paint, CRT and Pixel CRT while viewing the world. Adjust softness, scanlines, texture, warmth, edge shade and pixel size; hold **Compare original** to compare the unfiltered artwork. Choices save on this device and take precedence over the default. The shared screen filter affects the world and its labels, while HTML menus and HUD stay clear. Filters require WebGL; the Canvas fallback keeps the original artwork.

Enable **Silent mode** in Settings or an exercise to mute audio and skip optional listening practice. The choice saves on this device. Story investigations use evidence, written German and choices, so they remain playable silently. Skipped listening tasks stay available later and are not recorded as answered; course routes still require their assigned tasks.

## Checks

There is no hosted CI. Run every check locally before pushing:

```sh
npm run verify
```

It runs the Go formatting, vet and race suite (against `TEST_DATABASE_URL`, or a disposable PostgreSQL it starts when `initdb` is installed), lint, `npm run check`, Vitest, the tooling tests, asset regeneration with a drift check, the dialogue and i18n audits, the production build and the distribution budgets, then prints a summary. Add `-- --ui` for the UI font and screenshot check and `-- --docker` to build the runtime image. Individual commands:

```sh
npm test
npm run test:tooling
npm run check
npm run lint
npm run maps:check
npm run build
npm run budgets
npm run pacing
cd server
go test -race ./...
go vet ./...
```

`npm run check` validates word-map structure only. `npm run release:check` additionally requires every sentence to carry a native reviewer and is a release gate, not part of `npm run verify`. Frontend tests cover dialogue graph reachability, scene receipts and retries, earned progression, preview recovery, learning behavior, complete vocabulary/course/server parity, legal solutions for all 48 activity scenes, saved-board and retry behavior, bounded review selection, navigation and map-aware connection recovery. World regressions check independent scenery, fixed building foundations, registered sprite frames, complete day/night sets, reduced-motion freeze, culling and revisit cleanup. The development fixture at [http://localhost:5187/qa/world-assets.html](http://localhost:5187/qa/world-assets.html) offers region and time selection, Terrain only, Still scenery and camera-tour views. [Character motion](http://localhost:5187/qa/character-motion.html) enlarges all sixteen regional identities with fixed ground pivots, pose selection, walking speeds and pauses. Go tests cover grading, persistence, idempotency, scheduling, story proximity and ordering, save/load reward safety, expedition solutions, days, region isolation, travel and reconnects. Optional PostgreSQL integration checks are described in the [server guide](server/README.md).

Content and asset tooling has one entry point:

```sh
npm run assets                  # Validate and regenerate content/server manifests
npm run assets -- --art          # Also run the active art exporters
npm run assets -- --audio        # Also regenerate world sound and dialogue sketches
```

Audio generation requires macOS with the manifest’s installed German voices and `ffmpeg`. Existing exported clips are supplied for normal local play. The [map editor guide](docs/map-editor.md) describes exporting the three towns to Tiled, editing collision and interaction positions, and importing only validated, reachable maps. New story-cast source paintings use Git LFS; existing art history has not been migrated.

Generated expedition originals and all generation prompts are in `art/source/expeditions/`. Export their transparent atlases and assembled previews from the repository root:

```sh
node scripts/prepare-expedition-art.mjs
# Export one region, or permit missing sources during art production:
node scripts/prepare-expedition-art.mjs riverweave
node scripts/prepare-expedition-art.mjs --partial
```

The exporter preserves generated alpha, crops and registers sprite rows, and assembles previews from the same placements used in the game. It does not generate replacement artwork. See [Expeditions](docs/expeditions.md) for the asset contract and checks.

## Docker Compose and Dokploy

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD in .env.
docker compose -f compose.yaml -f compose.local.yaml up --build -d --wait
```

Edit `.env` for your environment, especially `POSTGRES_PASSWORD` and `ALLOWED_ORIGINS`. Local Compose serves the game at [http://localhost:8088](http://localhost:8088). Go serves the built frontend, API and WebSockets directly, with PostgreSQL in a private named volume.

For Dokploy, create a Docker Compose service using **only `compose.yaml`**. Set `POSTGRES_PASSWORD` and `ALLOWED_ORIGINS` in Environment, then add the public domain to the **server service, internal port 8080, upstream HTTP** with public HTTPS. `TRAEFIK_NETWORK` defaults to `dokploy-network`; set it to the generated ingress network name for isolated deployments. The default file publishes no host ports. PostgreSQL stores profiles, sessions, progress and learning receipts in a persistent named volume. See the [Dokploy deployment guide](docs/deployment.md) for setup, verification, backups and recovery, and the [API guide](server/README.md) for the data contract.

## Temporary TryCloudflare preview

The Cloudflare Pages project and its deployments were removed on 2026-10-08. Preview the game through a temporary [TryCloudflare tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) instead.

Quick tunnels print a temporary HTTPS URL when started. No live tunnel URL is maintained in this README. A preview serves the built frontend and proxies `/api/*`, including WebSockets, to the local Go server; it works only while those processes remain running.

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

Keep all three processes running. Check `/api/health` with the tunnel URL as the `Origin ` header and confirm the game shows connected players. Do not run multiple Go processes against the same JSON development store.

## Project map

| Location | Purpose |
| --- | --- |
| `web/src/main.ts`, `game-state.ts`, `game-mode.ts` | Application wiring, revision-guarded state, panels, character and the current game mode |
| `web/src/access-session.ts`, `speech.ts`, `dialog-session.ts` | Trial, paywall, billing and account dialog; German speech; one cancellation token for every encounter dialog that loads before it opens |
| `web/src/dialogue.ts`, `quest-controller.ts`, `dialogue-view.ts`, `data/dialogue-graphs.json` | Validated story graphs, scene lifecycle, German dialogue and production gates |
| `web/src/story-panels.ts`, `quest-objectives.ts`, `contextual-grammar.ts`, `lantern-rewards.ts` | Evidence, objectives, contextual explanations and earned progression |
| `web/src/world.ts`, `maps.ts`, `navigation.ts` | Phaser game facade, thirteen region definitions, movement and routing |
| `web/src/explore-scene.ts`, `world-scene.ts`, `interior-scene.ts`, `travel-scene.ts`, `boot-scene.ts` | One Phaser scene per mode: shared walking and camera, town, rooms, travel curtain and boot |
| `web/src/world-edit-mode.ts`, `world-edit-*.ts`, `world-patch.ts`, `admin-map-editor.ts` | In-game edit mode, placement rules, published world patches and the admin map editor |
| `web/src/expeditions.ts`, `expedition-games.ts` | Ten local casts, encounter catalog, terrain geometry and neighborhood planning games |
| `web/src/placed-scenery.ts`, `world-scenery.ts` | Reusable transparent objects, placement, motion and foot depth |
| `web/src/ground.ts`, `ground-terrain.ts`, `ground-convert.ts` | Painted ground: material weights, brush, navigation barriers, the blending shader and conversion of older terrain |
| `scripts/world-sync.mjs`, `world-preview.mjs`, `tools/world-mcp/` | Pull and push the world, draw a town as a plan, and the MCP server for agents |
| `web/src/scenery-animation.ts`, `world-life.ts`, `world-atmosphere.ts`, `world-audio.ts`, `cutscene.ts` | Animation, resident routines, weather, sound and cinematic scene |
| `scripts/prepare-world-art.mjs` | Alpha-preserving prop atlases and composed interface previews |
| `scripts/prepare-expedition-art.mjs`, `art/source/expeditions/` | Generated expedition source sheets, prompts and alpha-preserving exports |
| `web/src/content.ts`, `story.ts`, `content-runtime.ts` | Legacy authoring NPCs and quests, story discoveries, and the runtime registry the production build loads from the server by UUID |
| `web/src/course.ts`, `data/course*.json` | Attributed lexicon, original lessons and canonical course tasks |
| `web/src/activities.ts`, `activity-engine.ts` | Stateful mission controls and pure gameplay rules |
| `scripts/build-course.mjs`, `build-story-curriculum.mjs`, `export-world-content.mjs` | Generate matching frontend/Go content, story rules and interaction registries |
| `scripts/assets.mjs`, `map-editor.mjs`, `check-budgets.mjs` | Asset orchestration, Tiled roundtrips and distribution budgets |
| `web/src/review.ts` | Short reviews across word skills, course sentences and story expressions |
| `web/src/api.ts` | REST sessions, map acknowledgements and multiplayer reconnects |
| `server/curriculum.json`, `server/course.json` | Canonical grading, word links and exact completion requirements |
| `scripts/syllabus.mjs`, `build-syllabus.mjs`, `audit-pacing.mjs`, `server/intake.go`, `web/src/intake.ts` | Vocabulary syllabus, intake budget, heartbeats, gates and the pacing audit |
| `server/` | Go REST/WebSocket service, persistence and FSRS scheduling |
| `compose.yaml` | Go application and PostgreSQL deployment |
| [Curriculum](docs/curriculum.md) | Coverage, content contract and assessment limits |
| [Pacing](docs/pacing.md) | Ten words an hour: syllabus, intake budget, gates and per-scene unlock hours |
| [Roadmap implementation](docs/roadmap-implementation.md) | Delivered changes, validation and remaining production scope |
| [Implementation plan](docs/implementation-plan.md) | Original scope and parallel ownership |
| [Activities](docs/activities.md) | Gameplay contracts, recovery and mobile verification |
| [Expeditions](docs/expeditions.md) | Ten cultural inspirations, local games, sprite counts and original art contracts |
| [Research](docs/research.md) | Evidence behind the learning design |
| [Art and audio](docs/art.md) | Asset provenance and production directions |
| [World animation](docs/world-animation.md) | Object motion, local routines, performance and regression checks |
| [Scenery depth](docs/world-occlusion.md) | Transparent object depth, placement-derived collision bases and atlas lifecycle |

One Go process hosts all thirteen regions, with separate players in each region. `MAX_ZONE_PLAYERS` defaults to **128 connected players per map**; this is a configured capacity limit, not a measured concurrency guarantee. The server remembers each player's map positions for up to ten minutes after disconnect, subject to its bounded in-memory cache. Positions reset on server restart; profiles, learning progress, quest rewards and review schedules remain saved in PostgreSQL or the local development JSON store. Story state, faction choices, evidence, save slots, completed expedition plans and encounter records are also persisted. Browser storage keeps interface preferences and unfinished board drafts.

Account recovery, educator-reviewed curriculum validation, speaking assessment, full cooperative quests, larger multi-plate towns, neural/human VO and horizontal zone scaling remain future work. See [Roadmap implementation](docs/roadmap-implementation.md) for the detailed boundary between implemented systems and production milestones.

Players choose a name and build a character together before their first adventure. The character editor combines independent face, hair/headwear, jacket and trouser pieces, with separate colours and a live four-direction walking preview. See [the art pipeline](docs/art.md#modular-player-characters) for source assets and rebuilding the shared pieces.
