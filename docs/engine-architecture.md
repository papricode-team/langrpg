# Engine architecture

The game world runs on Phaser 4's own machinery: its scene manager for every mode the world can be in, its loader for readiness, its registry and event emitters for shared state, its camera for following and framing, its tweens and clock for timed motion, and its particles for weather. The HTML layers (HUD, menus, dialogue, typed answers) stay HTML and decide only what the game should do behind them.

This replaced a single scene that swapped maps and rooms in place, a facade that replayed buffered state into it, and per-frame hand-rolled camera, timing and weather code. The motivating review is [engine-scene-review.md](engine-scene-review.md).

## Scenes

One `Phaser.Game` holds five scenes, in render order:

| Scene | File | Role |
|---|---|---|
| `boot` | `web/src/boot-scene.ts` | Loads art and sound every map shares, with progress, then starts `world`. |
| `world` | `web/src/world-scene.ts` | One outdoor map. Travel restarts it; rooms put it to sleep. |
| `interior` | `web/src/interior-scene.ts` | One room. Launched over the sleeping town, stopped on the way out. |
| `travel` | `web/src/travel-scene.ts` | A curtain with load progress. Lifts when the map reports its first painted view. |
| `cinematic` | `web/src/cutscene.ts` | Story beats over the live map, steering its camera. |

`world` and `interior` share `ExploreScene` (`web/src/explore-scene.ts`): the player, peers, story characters, objects, portals, interaction, input and camera. Each subclass adds only what differs: terrain, scenery, residents, weather and day/night outdoors; the room painting, prop targets and visiting hours indoors.

**Travel.** `World.setMap` raises the curtain and calls `scene.restart({ mapId })`. Phaser stops the old run, including one still loading, and the new run's `preload` fetches the destination's sheets and period manifest before `create` builds anything. Scenery is built once with its final art. The map announces itself ready when the visible terrain has painted, or after four seconds.

**Rooms.** Entering a doorway walks the player in on a tween, then launches `interior`. The room loads its own painting on first visit while the town stays on screen, and sleeps the town once it can draw. A sleeping scene keeps everything, so terrain stays resident and outdoor peers stay current. Leaving wakes the town at the door.

**Restart hygiene.** A scene's `init` resets its state, because the constructor runs once. Listeners on a scene's own emitter are removed at shutdown; registry listeners are added through `followWorld`, which removes them for you. A file requested by an abandoned map run can still complete after travel. The town scene drops any such file and releases the old map's sheets, keeping those the destination also lists.

## State, events and commands

**Registry.** Shared state lives in `game.registry` under the keys in `WorldRegistry` (`web/src/world-state.ts`): map, room, players, avatar, objective, story state, conversation target, cinematic beat, input permission, reduced motion and so on. Scenes read it in `create` and follow its change events, so a value set before a scene exists is simply there when it starts.

**Events.** Scenes report to the page by emitting on `game.events` with the names in `WorldEvents`: movement, interactions, nearby target, map ready, room change, time, load progress. The `World` facade (`web/src/world.ts`) forwards them to its options callbacks.

**Commands.** `focusNpc`, `focusObject` and similar go to the active explore scene. If that scene is still loading or asleep, the command waits until it emits `ExploreReady`.

## What the page decides

`main.ts` has one function, `syncWorldMode`, that decides two things from the page's state and is the only caller that sets them:

- **Input** (`World.setInputEnabled`): whether the player can walk and interact.
- **Presentation** (`World.setPresentation`): `live` for normal play, `paused` behind the menu (still drawn, nothing advances), `hidden` under a full-screen activity. These map to the scene manager's pause and resume and the scene's visibility, so closing a dialog never resizes the canvas or snaps the camera.

Every place that opens or closes a dialog, menu, cinematic, delivery run or account screen calls `syncWorldMode` instead of toggling the world directly. Phaser already pauses its loop when the tab is hidden.

## Time, motion and the camera

- **Camera.** Phaser's follow camera tracks a focus point with a dead zone, bounds and lerp. Each mode only moves that point and sets the zoom: play, conversation, observed resident, cinematic beat or the watch-mode tour.
- **Tweens.** Doorway walk-ins, period crossfades, marker bobs, portal pulses, lamp flicker and the travel curtain fade.
- **Clock.** Scene timers for the cinematic typewriter and beat advance, the arrival timeout, and the world clock's period changes. Timers and tweens pause with their scene.
- **Input.** Phaser's keyboard plugin, including key events so a short tap is never lost between frames, its gamepad plugin, and pointer input. Keys reset on blur, pause and sleep.
- **Delivery run.** Driven by the game's frame events through `World.onFrame`, so it pauses with the town.

## Weather and light

`web/src/world-atmosphere.ts` uses a scrolling tile sprite for mist, particle emitters for rain and dust or leaves, and images with tweened flicker for lamp halos and ground pools. Emitters spawn over the camera view at the same density per map area as before. Textures are drawn once into canvas textures shared by every scene.

## Mini-games

All rounds share one persistent mini-game `Phaser.Game` whose canvas moves into each round's slot (`web/src/minigames/scene.ts`), instead of a new game and WebGL context per round. Its scene restarts per round and pauses with the round. The workbench lamp walks with Phaser's animation manager.

## Deliberately custom

Some machinery stays bespoke because Phaser has no equivalent, or its equivalent would change behaviour:

- **Navigation.** Polygon walkable areas with A* routes. Arcade physics only has boxes and circles, and Matter would be a heavy replacement for a solved problem.
- **Gait.** Walk frames follow distance travelled, not time, so feet never slide and shared residents look the same on every client. Phaser animations are time-based.
- **Scenery motion.** Painted frames crossfade and trees sway on one painting. Phaser animations swap frames without blending.
- **Depth.** Strip-split buildings with authored sort lines, so characters sort correctly on both sides of a wall.
- **HTML interface.** Dialogue, typed answers, menus and the mini-game rounds stay HTML for text input, screen readers and the Turkish overlay. The mini-game round timers stay in that layer for the same reason.
- **High-density canvas.** The canvas is sized in physical pixels and zoomed back down, which Phaser 4's scale modes do not provide.

## Testing

`web/src/test-support/` runs real Phaser under happy-dom: `phaser-dom.ts` installs a no-op 2D canvas (import it first), `phaser-harness.ts` steps games by hand, controls the clock tweens use, keeps the loader off the network and seeds textures and JSON. `world-atmosphere.test.ts` covers weather. The full-world scene and behaviour suites were removed to keep `npm run verify` under three minutes; check those flows with `npm run verify -- --ui` or in the browser.

In development builds, `window.atlasGame` and `window.atlasWorld` expose the game and facade for inspection.
