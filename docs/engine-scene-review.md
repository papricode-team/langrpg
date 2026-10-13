# Engine and scene architecture review (2026-10-13)

Code-only review of how the Lantern Atlas client boots, builds scenes, switches modes and runs the living world. The question was why the game feels janky despite the volume of content. Short answer: the content pipeline is solid, but the runtime that presents it has no single owner for "what mode are we in", "what is on screen", or "what time is it", and most visible glitches fall out of that.

All paths are under `web/src/` unless noted.

## Status after moving to Phaser's machinery

The engine now uses Phaser's scenes, loader, registry, events, camera, tweens, clock, particles and input plugins; see [engine-architecture.md](engine-architecture.md). Against the findings below:

| Finding | Status |
|---|---|
| Closing a dialog resizes the canvas and snaps the camera | Fixed. Dialogs pause or hide the scene; nothing resizes. |
| World input set from many places | Fixed. `syncWorldMode` in `main.ts` is the only caller. The mode is still derived from page flags. |
| Travel paints a flat field, then pops scenery in twice | Fixed. Each map's art loads in `preload` behind a curtain; scenery is built once. |
| Terrain thrown away on entering a room | Fixed. Rooms are their own scene; the town sleeps intact. |
| Re-entrant room enter and leave | Fixed. Room changes are queued scene operations. |
| Monolithic boot preload | Fixed. Shared art loads with progress; rooms load on first visit. |
| Separate frame loops for the delivery run and per-round mini-game games | Fixed. Both run on Phaser's loop; mini-games share one game. |
| Per-frame weather tessellation and avatar recipe rebuilds | Fixed. Particles, a mist tile and tweened lamps; recipes cached. |
| Document-level key listener racing Phaser's keyboard | Fixed. Phaser key events and the gamepad plugin. |
| Camera shimmer from whole-pixel snapping | Reduced. Pixel rounding is off and Phaser's follow camera frames the view. |
| Activity loads not cancelled by a newer dialog; travel dropped silently on disconnect; cinematic marked seen before playing; `onRegionReady` re-entry | Open. These are page logic, not engine machinery. |
| Section C, interaction and state | Open. |
| Bark director spin, story characters sliding, peers never settling, night tint pop, weather drawn under buildings | Open. Behaviour was kept as it was. |
| Geometry sources, interiors outside the scene compiler, building strips, seams | Open. |

## Five root causes

1. **Mode is derived, not declared.** `worldCanInteract()` (`main.ts:502`) recomputes the game mode from twelve booleans and DOM queries (`#dialog.open`, `#chat-body.hidden`, `questController.isOpen`, `cinematicActive`, `pendingMap`, `watchingWorld`, ...). Every opener and closer re-derives it independently, so transitions are a race between whoever last called `world.setInputEnabled(...)`. `main.ts` carries about 60 module-level mutable variables and 197 DOM queries; `interiorId` alone lives in four places (`main.ts:101`, `World.pendingInterior`, `HarborScene.interiorSpec`, `api.interiorId`).
2. **Scene load has no "ready" gate.** `switchMap` paints a flat colour (`world.ts:864`), `api.onMap` re-enables input immediately (`main.ts:1750`), scenery is built once from the low-res atlas and rebuilt from the painted manifest with no fade (`world.ts:875`, then `applyPeriod` `world.ts:717-721`), and `mapReady` never waits for terrain (`world.ts:888-893`). The player sees green rectangle, blurry overview, props popping, props swapping, then detail.
3. **Four clocks and four character systems.** Phaser delta (clamped to 50 ms), real-time shared clock, cycle-mode fallback, and `this.elapsed` drive different actors, so residents and the player disagree at low frame rates and after tab suspension. Characters are drawn by a modular layered rig, a story-cast sheet with no walk cycle, a regional walker atlas with a different stride and 11% different height, and a swapped-in action figure, each with its own facing and tint rules.
4. **Per-frame work that should be cached.** Occlusion sorts a `sortLine` and allocates Maps per visible prop per character per frame; the atmosphere layer re-tessellates 36 fog ellipses, 130 rain lines and lamp halos every frame; `characterLayers()` rebuilds the avatar recipe per character per frame only to read a width that is always 1; the bark director re-filters and re-sorts the whole lexicon every frame when a line is suppressed.
5. **Geometry has nine sources of truth.** Canonical JSON, `scenery-geometry.json`, the per-period animation manifest, `maps.ts` (still 1536x1024), dead `placed-*.ts`, `world-navigation.json`, compiled server copies, the TypeScript interiors catalog, and hard-coded 1536/1024 constants still used at runtime (`world.ts:1630`, `navigation.ts:26`, `world-camera.ts:7`).

## Findings by area

### A. Core loop and mode lifecycle (`main.ts`, `world.ts`)

- One `Phaser.Game`, two scenes: `HarborScene` (`world.ts:486`, 1580 lines, 89 fields) handles outdoors and interiors by swapping its own maps in place; `CutsceneScene` overlays it. Everything interactive except walking is DOM. Communication is `World` facade methods down, `WorldOptions` callbacks up, plus a custom `atlas-controls-reset` DOM event used as a bus.
- Timing sources besides the Phaser loop: `game.loop.sleep()/wake()` on every dialog open/close (`world.ts:405-417`), a separate `requestAnimationFrame` loop inside `minigames/delivery.ts:83,162`, a 1 s `setInterval` for heartbeat, assorted 40 to 350 ms timeouts, tweens, camera fades and CSS transitions.
- **Dialog close snaps the camera and re-lays out the canvas.** Closing any `#dialog` calls `world.setVisible(true)` which calls `resize()` unconditionally; `fitCamera` then re-sets label resolution and calls `frameCamera(1)` (`world.ts:419-431`, `1270-1292`). `setView('world')` adds another `requestAnimationFrame(world.resize)`. The frozen frame is visible behind the blurred menu because the loop is asleep.
- **Async opener cancellation is incomplete.** `openDialog` bumps `miniGameLoading` but not `activityLoading` (`main.ts:1087-1088`); a slow activity import can overwrite a newer dialog's `innerHTML` (`main.ts:832`) and leak its controller.
- **Interior enter is re-entrant.** `openInterior` calls `owner.interiorChanged` which, on a failed `api.joinInterior`, calls `scene.leaveInterior()` synchronously inside `openInterior` after the door sound and fade already played (`world.ts:928-979`, `main.ts:384-399`, `api.ts:245-257`).
- **Travel drops state silently.** `api.onStatus` clears `pendingMap` and `pendingDestination` with no toast (`main.ts:1764`).
- **Cinematic marked seen before it can play.** `playPendingCinematic` POSTs `/story/cinematic` and sets the flag before `world.playCutscene`, which resolves immediately under reduced motion (`main.ts:552`, `world.ts:287`).
- **Two input stacks.** Phaser keyboard plugin, a capture-phase `document` keydown in `World` (`world.ts:180`), the global keydown in `main.ts:1424`, `DialogueView`'s own Escape handler and `MiniGameInput`. The comment at `world.ts:1544` admits the `JustDown` race.
- `onRegionReady` has eight early-return guards and six callers (`main.ts:562-569`); a cinematic interrupted by a dialog is only retried by an unrelated event.

### B. Scene construction (`world-scenes.json` to screen)

- Pipeline: `parseWorldSceneDocument` → `getWorldScene` → `switchMap` → `StreamedWorldTerrain` at depth -1000 → `WorldScenery` → NPCs/objects/portals/residents → `WorldAtmosphere`, then `applyPeriod` builds a second `WorldScenery` and destroys the first.
- Depth is `floor(footY)*4 + band` (`world-depth.ts:4`). **Weather is a constant depth 2** (`world-atmosphere.ts:9,24`), so rain, fog and dust draw under every building and character. Lamp halos sit above name labels. The walk marker is depth 1, under all props. Object discovery markers use the shadow band so props on the same row cover them.
- **Terrain is evicted when entering a shop.** `StreamedWorldTerrain.setVisible(false)` destroys every image and releases every lease (`streamed-world-terrain.ts:114-117`); leaving re-streams from the network.
- Sprite scale uses the manifest's `referenceWidth` while depth uses `scenery-geometry.json`'s (`world-scenery.ts:58,60`); two numbers that can silently disagree.
- Buildings are split into 8-unit strips (`world-scenery.ts:106`): a 430-wide station is 54+ sprites, each a draw.
- Terrain uses `LINEAR_MIPMAP_LINEAR` with 1 px guard bands and mixed crop origins (core tiles at (0,0)/(1,0)/(0,1)/(1,1), expansions at (1,1)) at non-integer zoom: seams at mip levels.
- The compiler builds nav footprints from the animation manifest; the runtime builds them from `scenery-geometry.json` (`scripts/scene-compiler.mjs:100` vs `placed-scenery.ts:47`). Only a validator keeps them aligned.
- Interiors are a parallel pipeline: TypeScript catalog, no schema or compiler, stretched single background (`world-interior.ts:41`), rect collision, 132 px person height vs 72 outdoors, no ambient tint or atmosphere.
- `preload` loads every interior room, five interior atlases, effects, resident pages, cast and modular layers before `create` (`world.ts:643-666`).

### C. Interaction and state (`quest-controller.ts`, `activities.ts`, `minigames/`, `expedition-*.ts`, `api.ts`)

- The server is correctly authoritative for grading, quest gating, proximity and XP (`server/story_state.go:300-427`). Every mutation returns a full `Progress`, accepted through `acceptProgress` with a revision guard. This part is sound.
- **Three exercise runners with different result contracts**: `main.ts run`/`submitAnswer`, `activities.ts`, `minigames/engine.ts`, plus expeditions. Attempt bodies are built in six places; result shapes differ (`api.ts:50`, `review-attempt.ts:15`, `activities.ts:19-20`, `minigames/types.ts:21-34`, `expedition-encounter.ts:6`).
- **Hint status is device-local and its server branch is dead**: `wasHinted` reads `flags['hint:<quest>']` which no Go file ever writes (`main.ts:319`).
- **`openDialog` kills any running mini-game or delivery with no summary** (`main.ts:1087-1088`); `RetrievalGame.destroy` never emits `end()` (`minigames/engine.ts:405`).
- `showNpc` opens dialogue offline; the first transition fails and leaves the scene mid-gate (`quest-controller.ts:227`).
- Interaction ids are string-prefix sniffed (`building:`, `interior:`, `exit:`, `object:`) in `main.ts:354-358` and `world.ts:1480-1497`; expedition and story NPC ids share one namespace.
- Hard-coded cross-content maps with no lint: `questCinematics` (`main.ts:123`), NPC→drill (`main.ts:326`), `activityForObject` substring heuristics (`main.ts:637`). `quests.find(...)!` crashes on a bad id.
- `level` has three writers; `progress` exists as a bare variable, a store, and a captured copy in `mountActivity`. `content.ts` NPC x/y are dead (overridden by scene data).
- Localization stops at the HUD and dialogue: `activities.ts`, `minigames/engine.ts`, `expedition-games.ts`, `expedition-encounter.ts` contain no `t()` calls, so Turkish players get English mini-games.

### D. Living world and characters (`world.ts:1527-1932`, `world-routines.ts`, `resident-*.ts`, `world-atmosphere.ts`)

- **Bark director spin**: when `lineAllowed` rejects a routine line the function returns before `lastGlobal` is stamped (`world-routines.ts:213`), so every frame for every NPC within 230 px re-filters and re-sorts the lexicon.
- **Story NPCs slide**: they glide at 36 px/s with cast sprites that have no walk frames, and `routine.facing` is computed (`world-routines.ts:87`) but never read in `world.ts`.
- **Peers moonwalk**: exponential lerp never settles (`world.ts:1662-1668`), so the gait keeps ticking at sub-pixel speeds.
- **Night tint pops on authored residents**: the action figure gets `timeAmbient().people` (`world.ts:1908`) but the modular walking layers never do, so each pose↔walk swap flashes brightness at night.
- **Camera shimmer**: fractional scroll, non-integer zoom (`world-camera.ts:12`) and `roundPixels: true` (`world.ts:219`) on painted, linear-filtered art.
- `canWalkSegment` scans all polygons per NPC per frame even when already at target (`world.ts:1631`, `navigation.ts:146`). `clock.advance(0)` runs four times per frame allocating a state object and a label string. `rainForDay` FNV-hashes three strings per frame.
- First shared-clock packet replaces `routineElapsed` (`world.ts:1863`): a one-time teleport. `parseSharedWorldTime` rejects any day length other than 720 s and silently falls back to a local fake seed (`shared-world-time.ts:32,38`, `world.ts:1891`), so "deterministic reconstruction" degrades without a log. `createResidents` returns early with zero residents if modular sheets failed to load, with no log (`world.ts:1103`).
- `docs/world-animation.md` claims no per-tick repainting; the atmosphere layer repaints every tick.

## Recommended order of work

Each step is independently shippable and attacks a root cause rather than a symptom.

1. **Declare the mode.** Introduce one `GameMode` enum owned by a small `ModeController` (`world | menu | encounter | dialogue | activity | minigame | delivery | cutscene | travelling | interior-transition`). All openers request a transition; the controller is the only caller of `world.setInputEnabled`, `loop.sleep/wake`, and `#game-shell` class toggles. Replace `worldCanInteract()` with `mode === 'world'`. Give every async opener a single `dialogToken` checked after each await. Collapse `interiorId` to one owner with a request/ack flow. This removes most of section A.
2. **Gate scene readiness.** Keep input disabled and a travel curtain up until terrain previews, the period manifest and scenery are all built; build `WorldScenery` once from the manifest; fade the period swap even when the period is unchanged; make `setVisible(false)` on terrain hide without releasing leases. Removes the arrival pop sequence and the shop re-stream.
3. **One clock, settled motion.** Derive everything from the shared simulation clock with the Phaser delta used only for interpolation; snap peers when within 1 px; apply `routine.facing` and give the cast a two-frame step or discrete beats; apply the `people` tint to modular layers. Normalise regional walker height to 72.
4. **Cache the hot paths.** Stamp `lastGlobal` before the early return in the bark director; cache the avatar recipe per character; pre-sort `sortLine` at compile time and bbox-reject before `depthAt`; move rain and fog to tile sprites or particles with a camera-fixed overlay at a proper depth band; widen terrain guard bands to 4 to 8 px with consistent origins, or disable terrain mips and quantise camera scroll.
5. **Collapse geometry sources.** Delete `placed-*.ts` and `world-navigation.json`; route all 1536/1024 constants through `getWorldScene(id)`; make the runtime and compiler read footprints from the same file; add interiors to `world-scenes.json` using the existing `kind: 'interior'` and run them through the compiler.
6. **One attempt client and one result contract.** A single `AttemptClient` (id, frozen body, retry, revision merge) and a single `ActivityResult` consumed by quest practice, activities, mini-games and expeditions. Have the server write `hint:` flags so assisted status survives devices. Run `t()` through activities, mini-games and expeditions.
7. **Lint the string maps.** Move `questCinematics`, the NPC drill map and the object→activity heuristic into content and assert them in `story-lint.test.ts`.

## Test environment note

In this worktree `npx vitest run` passes 625 tests, but 18 DOM-based test files (quest controller, mini-game engine, and others) never execute because `happy-dom` is not installed in the worktree's `node_modules`, and `resident-exchanges.test.ts` times out at 5 s. Install web dev dependencies before trusting a green run.
