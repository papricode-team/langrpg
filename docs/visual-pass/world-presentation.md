# world-presentation handover

Implemented review findings 4 and 7 within the assigned files. No git mutations or repository-wide generators were run.

## Changes

- Phaser uses Fraunces and DM Sans. Boot waits for explicit face loads and `document.fonts.ready`; independently opened overlays refresh text metrics after loading. Conversation hints, roles and exit tags now meet the 12 CSS px floor.
- Added painted brass/wood interaction plates, parchment story tags, soft thresholds and ground rings. Held parcel/book/tool art comes from `items-2.webp`; the tool is the atlas's painted scissors. All selected masters and exact built-in imagegen prompts are retained. Rejected the first floor-painted threshold and heavy ring and generated replacements.
- The world camera always receives subtle shadow lift, warm highlights and a vignette, varying by town and time. The player's Original/Soft/CRT/Pixel settings remain on top; DOM UI is outside the pass. Default grading uses one texture sample, skips inactive grain/scanline work, and Low skips optional blur.
- Shadows are feathered, skewed and offset lower right. Rooms have painted lamps, window pools, warm halos and room-aware character tint. Room canvases use 2× at Medium/High where allocation limits allow, 1× at Low, rebuild when the tier changes, and release their GPU texture on room destruction.
- Doors fade out before switching, with immediate reduced-motion/authoritative transitions. Travel uses town preview art, parchment, Fraunces and a brass loading line, including a fix for MapReady arriving before its preview loads. Cutscene bars ease in, text crossfades between beats, the continuation prompt is painted, and the train never exceeds the decoded image's backing-pixel dimensions.
- World/room previews and the admin editor now use antialiasing, fractional pixels and trilinear mipmaps. World/room previews also receive the camera grade.

## Files

Runtime: `web/src/{boot-scene,explore-scene,world-scene,interior-scene,world-interior,room-kit,world-story-marks,world-lighting,character-art,cutscene,travel-scene,screen-filters,screen-filter-settings,world-view,room-view}.ts`; only the render config line in `admin-map-editor.ts`.

New helpers: `web/src/world-{fonts,ui,grade}.ts`. Tests: new `world-{fonts,ui,grade}.test.ts`, `travel-scene.test.ts`, and updated `world-interior.test.ts` for lighting, texture signatures and texture disposal. No existing assertion was loosened.

Art: `art/ui/world-{ui,ring,threshold}.png` and adjacent prompt `.txt` files; `art/ui/README-world-ui.md`; `art/ui/world-ui-proof.png`; four `web/public/assets/ui/world-{prompt,ink,ring,threshold}.webp` files. One added LFS pattern in `.gitattributes` covers `art/ui/world-*.png`.

## Evidence and checks

Before: `docs/audits/visual-style/in-world-cast.jpg`, `docs/audits/visual-style/lindenhafen-preview.jpg`, and `docs/screenshots/interiors/rendering-repair-cafe.jpg`.

After: `art/ui/world-ui-proof.png` shows the actual runtime assets composited on the town shadow colour, with atlas props. This is an asset contact sheet, not a live screenshot. Selected masters and all derivatives were viewed. All four WebPs retain alpha and are 12–46 KB, comfortably below 2 MB.

Final targeted Vitest run: **6 suites / 22 tests passed** (`world-fonts`, `travel-scene`, `world-grade`, `world-ui`, `world-interior`, `room-kit`). Three additional existing suites (`world-camera`, `world-lighting`, `explore-scene-restart`) fail during import because the character manifest is currently absent. `npm run check --workspace web` reports the same external dependency, with no other TypeScript errors:

```text
src/character-cast.ts(2,18): error TS2307: Cannot find module
'../../art/source/character-kit/cast/runtime-manifest.json'
or its corresponding type declarations.
```

The earlier import pointed at `web/public/assets/character-cast/manifest.json`; another agent changed it during this pass. The character agent must supply the current runtime manifest, then the coordinator should rerun those three suites and the web check.

Live screenshots and shader/transition visual QA remain outstanding: starting a local preview server failed with `listen EPERM: operation not permitted 127.0.0.1:5199`; launching Playwright Chromium failed at macOS `bootstrap_check_in ... Permission denied (1100)`. No approval or permission workaround was attempted. Please capture a town interaction, a day/night interior, travel and a cutscene when browser execution is available. Canvas fallback retains ambient art/tints but has no WebGL camera grade.
