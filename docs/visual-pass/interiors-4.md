# Interiors — fourth visual pass

2026-10-17. Read `AGENTS.md`, the art direction and earlier visual-pass handovers, especially `world-presentation.md` and `camera-2.md`. Viewed the target painting, the painted café room and the room-kit furniture atlas. Worked only in the assigned interior files. No git commands/state changes, dependency installs, repository generators, servers or browsers were used.

## Diagnosis

The first pass's lighting **was instantiated in the room-kit branch**. Painted rooms correctly bypass it. `createAtmosphereTextures` provides `atmo-pool` / `atmo-glow`; neither a missing texture nor a quality-tier switch disabled the old lights. Floor depth was correct: background −1000, pools −999. Visibility restores on the next update after `setVisible(true)`; ordinary gameplay does not enable terrain-only mode. The camera's restrained indoor grade finishes the scene but cannot supply missing local illumination.

The actual problems were:

- **Wrong lamp geometry and depth.** Inn fixture height 45 describes its footprint, while its 120-wide atlas image is about 199 units tall. The old halo was at `(810,376.25)`, far below the actual lamp shade, and sorted at depth 1507, **behind its own lamp furniture at depth 1641**. The source now follows the atlas shade at `(822,252.60)` and sits above upright furniture.
- **Wrong window geometry.** The inn's painted window is centred at x=1000; the old generic wall-midpoint pool was centred at x=817. Painting and lighting now share one window placement function, including the legacy inn exception and edited floors.
- **Too little contrast.** Normal-blended lamp alpha was only .07 by day / .105 at night. Window light was a faint generic oval. There was no room exposure change or floor-corner shading. Bright repeated floor materials overwhelmed these small washes.
- **Uniform character lighting.** `interiorPeopleTint` returned one fixed room colour; characters never sampled emitters or the room's visual clock.

## Changes and expected player view

`room-kit.ts` compiles one emitter/window plan from actual fixtures, floor/wall geometry and authored flame details. Each lamp has a broad elliptical floor pool, and the café candle receives its own pool/core/halo. Any authored sconce using the existing flame-detail contract participates too; the current room-kit catalogue has no separate sconce fixture. Rooms without a long window wall now receive the existing small painted lamp against a back wall instead of silently getting none.

Three transparent canvas overlays are baked once per room: olive corner shade, cream window shafts, and amber lamp pools. Their floor clip keeps light off the void and disconnected wall faces. Light overlays use SCREEN to retain material grain; shade uses NORMAL. Shafts extend down/right from the window sill in the upper-left light direction and include a softened mullion gap. Baked Canvas shadow blur feathers them. Furniture/props keep their existing positions and foot sorting.

At noon in the inn, the lamp shade should have a small cream core and amber halo, a warm oval should sit just forward of its table, and the window beside the desk should cast a cream shaft diagonally onto the boards. Corners are gently quieter than the centre. In the café, expect a shaft from each actual window, a small wall-side lamp pool and a second warm pool beside the candle/tea seating. This is lighting on the existing modular art, rather than a replacement of the room's materials with the full painted café background.

At 22:00, room surfaces and furniture become cooler and dimmer, daylight shafts fall to a faint cool residual, and warm lamps become the focus. The same visual clock controls local, remote and story character tint: away from lamps they cool at night; moving into a lamp's softly extended bounce region warms them. A newly baked/replaced avatar receives that positional tint immediately. Labels retain their own colours.

Medium/High retain small halos and 2% sine modulation. Reduced motion holds lights steady while clock changes still work. Low retains all baked floor effects and steady small cores, omitting broad halos/flicker. Quality switches restore the optional halos without rebuilding the lighting. Three 768×512 RGBA overlays cost about **4.5 MiB** for a standard 1536×1024 room, independent of the higher-resolution background canvas. Overlays respect the GPU maximum dimension, require no runtime blur/particle system or per-frame texture/array allocation, and are released on room destruction. Character base tint is cached per scene init; colour interpolation uses numeric arithmetic.

The **painted prologue branch is unchanged**: no new overlays, exposure tint or positional character tint; existing night/dawn paintings, ticket restoration, tea visibility and dawn transition remain intact.

## Files

- `web/src/world-interior.ts`: compiled emitters, baked overlays, corrected halo depth/position, exposure, flicker/quality/visibility/disposal, positional tint sampler.
- `web/src/room-kit.ts`: shared window geometry, emitter plan, floor-clipped light painting and no-window lamp fallback.
- `web/src/interior-scene.ts`: cache room base tint; apply positional/time tint to local, story and remote figures, including avatar replacement; preserve painted rooms.
- `web/src/world-lighting.ts`: allocation-free colour mixing, interior exposure and proximity tint helpers.
- `web/src/world-interior.test.ts`, `room-kit.test.ts`, new `interior-scene.test.ts`: regression coverage.
- `docs/audits/visual-style/interiors-after.jpg`: offline comparison.
- This handover.

No changes to `world-atmosphere.ts` were needed: its existing lamp textures are reused. No new art masters or runtime WebPs were created, so no image-generation prompt/export or 2 MB runtime-image exception is required.

## Evidence

[Inn and café before/after](../audits/visual-style/interiors-after.jpg) — **2304×1164 JPEG, 561,585 bytes**. Each row shows baseline noon, revised noon and revised 22:00. Viewed the final composite with the image viewer.

The render executes the captured pre-edit and current `WorldInterior` constructor/update paths, including `paintRoomKit`, current runtime materials/furniture atlases, corrected stills, light textures, sprite depths, alpha, tint and blending. Backgrounds render at the High-tier density; light canvases render at their actual half density. The output then downsamples each full 1536×1024 room to a 768×512 panel. Props/camera framing are identical across columns.

There is no installed native Canvas package (`@napi-rs/canvas` / `canvas`), so a temporary Canvas-to-SVG recording shim plus Sharp rasterizes the actual drawing calls. Embedded WebPs are decoded to PNG before SVG rendering. SCREEN composition was checked against the premultiplied blend equation. **This is an offline composite, not a game screenshot**: the shim omits Canvas shadow-blur feathering/contact shadows; it excludes characters, camera postprocessing, HUD and motion. The live shafts should have softer edge glow. Character behaviour is covered by scene-method tests without booting a Phaser game.

Temporary reproduction files remain in `/tmp/interiors-build.mjs` and `/tmp/interiors-evidence.mjs`; run them, in that order, from the worktree root. Rolldown bundles source into `/tmp/interiors-{before,after}-bundle.mjs` without starting Vite. The baseline source snapshots are `/tmp/interiors-before-{world-interior,room-kit,world-lighting}.ts`; raw panels and selected generated canvas PNGs are also in `/tmp`. These are session-local helpers; the durable evidence is the linked JPEG. An initial shim output omitted WebP materials/windows and was rejected, then corrected before accepting the final composite.

## Tests and commands

- `cd web && npx vitest run src/world-interior.test.ts src/room-kit*.test.ts src/interior*.test.ts`: **5 files / 40 tests PASS**. Covers missing atmosphere-texture creation, all three floor layers above the background with adequate alpha/blending, correct inn halo anchor/depth, window alignment, all room-template lamps, candle emitters, night exposure, low/high switching, reduced-motion stability, hide/cull/restore/disposal, positional character tint and the painted branch's old behaviour. Existing furniture/still/detail/tea/ticket/dawn assertions remain.
- `npm run check --workspace web`: **PASS**, TypeScript, UI type/layout budget (48 stylesheets), template budget (0 legacy allowances).
- `cd web && npx eslint src/world-interior.ts src/room-kit.ts src/interior-scene.ts src/world-lighting.ts src/world-interior.test.ts src/room-kit.test.ts src/interior-scene.test.ts`: **PASS**.
- `node /tmp/interiors-build.mjs` and `node /tmp/interiors-evidence.mjs`: **PASS**, final composite inspected.
- `cd web && npx vitest run`: the first run passed **155 files / 1,397 tests**. After adding the two scene-method regressions, later runs hit the concurrent terrain/editor issue below. **Final: 155 files / 1,398 tests PASS; 1 file / 1 test FAIL**, solely `world-edit-transport.test.ts` (13.54 s). The final targeted rerun remains 5 files / 40 tests PASS (3.88 s).

The previous fixed `.105` lamp-alpha expectation was deliberately replaced: brighter SCREEN-blended baked pools/halos are the intended change. New tests assert the exposure/blend/geometry behaviour instead. No test, timeout or budget was loosened. An intermediate quality-switch test failed because its sprite fake lacked the existing `setTexture` API; the fake was completed and the test passes. Node prints its existing experimental localStorage warning.

## Open integration issue

The full suite now fails outside this ownership area:

```text
FAIL src/world-edit-transport.test.ts
routes edits, undo, reads, validation and whole-world imports through the supplied transport
Error: A town can use 6 ground materials. Paint over one of meadow, moss, deep-water,
town-fan-cobble, town-herringbone, limestone completely to free it.
  at paintGround src/ground.ts:97
  at inverseEditOps src/world-edit-ops.ts:310
  at WorldEditSession.commit src/world-edit-session.ts:63
  at src/world-edit-transport.test.ts:17
```

The test's `material:'cobble'` stroke attempts to add a seventh material to the concurrently revised six-material seed. The terrain/editor owner must make this transport fixture independent of the seed's changing palette (or intentionally use an existing material); retain the six-material budget. No terrain, seed or editor files were edited here.

Live desktop/mobile checks of WebGL blending, postprocessing, perceived flicker, character warmth while walking, and real-device fill rate remain with integration because browser/server execution is excluded. No other interior source work remains.
