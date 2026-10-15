# Painted terrain and editable ground

The terrain keeps the game's elevated, three-quarter camera. Roads, quays and bridges are independently painted, substantial shapes with visible masonry faces, individual paving, curbs and worn steps. The previous 144 flat procedural tiles have been replaced by 15 authored pieces. Ground and water remain independently editable, seamless materials underneath.

This work includes the map editor redesign (`d19866ef`) and is rebased onto `main` at `77a57488`, including building foundations and the latest terrain blending for trees and props.

## Preview and authoring

Run the web development server and open `/qa/terrain-kit.html`. Select any of the 15 paintings to inspect it against water, forest ground, meadow or transparency. Toggle walking boundaries to see the deck separately from the masonry. The preview uses the game's compositor and detail motion functions. `/qa/terrain-materials.html` shows the 25 material variants.

In **Admin → Map editor → Terrain**, choose **Preview editable terrain**. Historic path and collision outlines provide an approximate starting point; existing towns need their streets and banks reauthored with the painted pieces. Conversion preview changes remain local until **Publish conversion**. **Discard preview** restores the original painting. Canonical towns retain their original appearance until a conversion is published.

Choose **Painted piece**, select the artwork and its width, then click anywhere to place. The cursor previews the actual art and walking boundaries. Pieces do not snap to a tile grid. **Select** moves them freely; **Piece width** resizes them while preserving the painted aspect ratio. Delete and Bring to front operate on the entire piece. Rotation and mirroring are intentionally unavailable because they would change the camera or lighting. Pieces have irregular ends for deliberate overlap and composition, not interchangeable connectors.

Draw polygon, rectangle or ellipse ground and water surfaces separately. Ground surfaces render first, then painted pieces in their own order. The traced walkable decks open crossings over water; retaining walls and raised faces block walking. These are painted elevations on the existing single navigation plane: bridges support walking over them, not simultaneous travel underneath. The editor outlines show these boundaries. Low road curbs remain traversable.

Finished edits on an already converted map publish through the redesigned editor's lock, validation and undo workflow. The **Edit** tab's scenery palette contains all 16 independent details in every town, with existing move, resize, collision and undo controls. They load on demand in the game, including after live edits.

## Terrain-only comparison

Open `/qa/terrain-compare.html` for original Lindenhafen beside the revised editable reconstruction in matching world coordinates. No scenery images, detail objects, characters or editor markers are rendered or loaded. The original uses its registered native terrain plates and crop rectangles. Whole-map and bridge-detail views share a world scale and synchronized pan/zoom; the original can switch between day and night. Ground, water with banks, and roads with bridges can be toggled independently. The page lists deliberate layout corrections and links to the local map editor.

Run `node scripts/audit-terrain-comparison.mjs` with Vite on port 4178 to verify the cameras, controls, both lighting sets and absence of scenery image requests. Screenshots are saved beside the other terrain audits.

## Connected district draft

Open `/qa/terrain-district.html` to walk through Bridgewater courtyard: six independently placed terrain paintings, a bakery and two houses, stone bridge, market landing, garden path and 22 separate scenery placements. The cool undergrowth and dark canal water were generated directly from the user's reference. The route marker uses the game's `NavigationGrid` with the normal 10-unit player radius. Three crossing routes, building approaches and story markers are checked against terrain and object footprints.

**Edit this draft** opens the existing redesigned map editor with an isolated local transport. Terrain and scenery edits, undo, reload persistence and export work without contacting backend APIs. The draft is saved under `glotworld-bridgewater-draft-v1` in browser local storage. **Restore original layout** clears that saved study; **Export** saves a world-format JSON. Local validation checks the canonical schema; publication still requires the full server story/navigation compiler. This is a layout study, not a complete replacement for Lindenhafen's story locations and resident schedules. The published towns have not been converted by opening or editing it.

`web/src/data/terrain-district.json` is the editable layout source. `terrain-district.ts` combines it with the canonical document for the draft editor, retaining other towns. The preview and actual editor share the terrain compositor and collision geometry. Bridge deck openings extend through the body outline at both road ends, preventing invisible collision strips at overlapping landings.

## Artwork

| Set | Coverage | Actual distributed resolution |
| --- | --- | --- |
| 15 independently painted terrain pieces | Sweeping old-town bend, long opposite diagonal lane, asymmetric market junction, mosaic market square, winding garden flagstones, arched canal bridge, straight quay, projecting curved quay, recessed quay corner, watergate steps, hillside stair street, angled timber landing, broad bridgehead terrace, compass market landing, flush compass inlay | 1254 × 1254 native transparent lossless WebP in `web/public/assets/terrain-features/` |
| 25 seamless material variants | Meadow, dry grass, forest floor, moss, earth, mud, gravel, sand, cobble, limestone, slate, brick, timber, rock, shallow water, deep water, marsh, snow, ice, farmland, dark canal water, cool canal undergrowth, blue town cobbles, canal masonry, stone-edged water variant | 1152 × 1152 lossless WebP in `web/public/assets/terrain-materials/` |
| 16 independent details | Reeds, fern, wildflowers, mushrooms, grass tuft, river rocks, driftwood, barrels, crates, lily pads, duck, lantern, watering can, fire pit, bunting, birdbath | 1254 × 1254 native transparent lossless WebP in `web/public/assets/terrain-objects/` |

The **built-in image_gen tool** generated the paintings. Terrain pieces use the user-supplied game screenshot as their camera, palette and masonry reference. Native PNGs live in `art/source/terrain-features/`, `art/source/terrain-materials/` and `art/source/terrain-objects/`, tracked with Git LFS. Exact prompts are in the corresponding directories under `docs/prompts/`. Requests and generation records are preserved alongside the sources. The tool returned 1254-pixel images; these are exported without enlargement, not described as 2K despite the requested prompt resolution.

Nine details use gentle procedural motion: five sway, two bob, the lantern shimmers and the fire pit flickers. This animates the cutouts; it is not frame-by-frame sprite animation. Reduced motion disables it and offscreen details stop updating.

Repeating materials use a periodic overlap blend from native sources, followed by matching boundary texels. They are neither mirrored nor enlarged. Every decoded opposite edge is identical. Most materials repeat every 256 world units (4.5 native pixels per unit); the canal grass repeats every 384 (3 pixels/unit) and water every 512 (2.25 pixels/unit), keeping blades and ripples at the reference’s visual scale without enlarging the source files. Painted streets and banks do not repeat; their native transparency and authored detail are preserved without this blending.

## Data and regeneration

`WorldScene.modularTerrain` holds the base material, ordered polygon `surfaces`, and optional ordered `features`. A feature stores its ID, art ID, world position and width. The catalogue supplies native dimensions, silhouette and separately traced deck/body polygons. `art/source/terrain-features/geometry.json` stores the traces in percentages of the original image; position and scale affect both art and walking boundaries.

The game and editor share `paintModularTerrain`. Ground patterns have one world-space origin. Visible composed chunks have sampling guards and a 32-megapixel cache budget. Native painting textures share the existing reference-counted terrain residency system and load only near the view. Terrain publication uses a map-wide lock and expected fingerprint; stale edits fail rather than overwriting another admin. Undo restores the full previous layer. Tiled interchange exposes painted pieces as image objects and retains proportional placement and art identity, rejecting rotations and distorted aspect ratios.

Building foundations sample the edited surface, including painted decks over water. Foundations refresh during conversion preview and after publication; unchanged scenery keeps its animation phase.

```sh
# Requires native PNG masters (git lfs pull on a fresh checkout).
npm run terrain:prepare
npm run terrain:check

# Local browser audits, with Vite at http://127.0.0.1:4178.
node scripts/audit-terrain-kit.mjs
node scripts/audit-modular-terrain.mjs
node scripts/audit-terrain-district.mjs --editor
```

The asset checks validate exact material seams, actual native dimensions and alpha, and traced polygons using the publication schema. Focused tests cover bridge deck versus wall collision, proportional movement, publication/undo, source validation, renderer culling and Tiled roundtrips. Browser audits exercise the actual map editor against the real local publication worker and native Phaser scenery animation. Evidence is under `docs/audits/modular-terrain/` and `docs/audits/terrain-*.json`.

The existing `avatar-baker.test.ts` suite requires hydrated `art/proofs/character-kit-hd/*.webp` assets; six fixtures are Git LFS pointers in this checkout, so that unrelated suite is excluded from the web verification run.

Verified after the rebase: 1,213 web tests passed with the avatar fixture suite excluded; all 37 targeted publication/compiler/Tiled tests passed; type checking, lint and production build passed. Both browser audits passed with no browser errors, including painted-piece publication, free movement, proportional resize, delete/undo, detail publication, all nine animated details, reduced motion and live asset loading.

The connected-district pass adds two native 1254-square terrain paintings and two 1152-square periodic materials. Its 36 focused tests pass, including all three routes, three building approaches, 18 story markers, schema validation and isolated edit transport. The browser audit verifies click-to-walk, water rejection, local editing/undo, persistence after reload and world export, with zero backend API requests. All 22 material seams have zero decoded edge difference, all 14 feature sources retain native alpha, and the production build and lint pass. The wider regression run passed 1,219 tests; the new approach test exposed the terrace opening defect, fixed and covered by the subsequent focused run.

## Lindenhafen reconstruction (2026-10-15)

`/qa/terrain-compare.html` now compares the original town to a **2304 × 1536 reconstruction in the same coordinates**, rather than the unrelated Bridgewater study. It deliberately revises the street network: the original market, northern station approach, southwestern harbor court and southeastern library court are retained, with broad connected roads, two directly traversable bridge approaches and continuous stone canal edges. The view contains terrain only. Canonical story marker IDs are retained for editor initialization, but only terrain is rendered in the comparison. Existing buildings informed frontage paths but are not rendered; full scenery/story migration is still separate from this terrain draft.

The authored centerlines and widths live in `scripts/build-lindenhafen-terrain.mjs`, which writes `web/src/data/lindenhafen-terrain-rebuild.json`. Its 40 editable polygons and five painted placements can be opened in the real map editor at `/qa/terrain-compare.html?edit`. Edits save only to `glotworld-lindenhafen-terrain-rebuild-v1` in local storage and are reflected by the comparison; exporting produces a normal scene document. This does not replace the canonical towns. The earlier Bridgewater study retains its own storage key.

Two new native 1254 × 1254 generated sources provide blue cobbles and canal masonry. The existing periodic exporter produces 1152 × 1152 lossless repeating materials without enlargement. `banked-water` reuses the existing water source and adds projected masonry along its editable perimeter. The material catalog now has 25 entries (24 unique source materials and one banked-water variant). Native bridge art is composited above those banks; a new native transparent compass inlay lies flush with the paving, bringing the painted feature catalog to 15. Exact built-in ImageGen prompts and generation provenance are checked in under `docs/prompts/` and `art/source/`.

The paving-only navigation checks exclude grass shortcuts and verify seven destinations from the market plus direct crossings of both bridges at the normal actor radius. The comparison audit checks original-coordinate cameras, day/night source loading, independent layers and no scenery requests. The editor audit checks isolated local saves, undo, reload and export. Publication still requires the complete story/navigation compiler with the final scenery placements.

New built-in ImageGen sources: `art/source/terrain-materials/town-cobble.png`, `art/source/terrain-materials/canal-masonry.png`, and `art/source/terrain-features/compass-inlay.png`. Exact prompts: `docs/prompts/terrain-materials/town-cobble.txt`, `docs/prompts/terrain-materials/canal-masonry.txt`, and `docs/prompts/terrain-features/compass-inlay.txt` (including its camera correction). This reconstruction pass passed 36 focused tests, both browser audits, all 25 material seam checks, all 15 feature validations, type checking, lint and production build. The final junction refinement was rechecked with all 11 reconstruction tests and both browser audits.

The blue-paving follow-up replaces the muted street texture with a fresh bridge-referenced stone material: richer blue midtones/highlights, crisp mortar and flatter three-quarter paving courses. The native source remains `art/source/terrain-materials/town-cobble.png`; the active lossless asset is now `web/public/assets/terrain-materials/town-cobble-bridge-blue.webp`, with a distinct URL to invalidate old browser copies. Built-in ImageGen prompt: `docs/prompts/terrain-materials/town-cobble-bridge-blue.txt`. All 25 material seam checks and the browser comparison audit pass. `docs/audits/modular-terrain/bridge-paving-match.png` captures the actual road/bridge joins at matching scale.

The road-border pass restores raised individual edging stones in `web/src/terrain-curbs.ts`. Borders follow the union of visible streets, subtract later garden/water surfaces, preserve garden holes and remain clear across intersections. Each block uses a detailed face sampled from the existing high-resolution canal masonry painting, with camera foreshortening, chamfered edges, directional bevels, raised side faces and contact shadows. Ground layers render before the stones so garden fills cannot bury their borders. Geometry and stone variants are stable in world coordinates and cached across chunks; road-only maps also load the stone material. No new raster generation or texture changes were needed.

The comparison has a **Road borders** close-up at a shared scale; evidence is `docs/audits/modular-terrain/road-borders-detail.png` and `road-borders-comparison.png`. All 16 focused border/navigation tests, type checking, lint and the comparison browser audit pass. The browser audit additionally compares the game’s padded 256-unit chunk composition with a single canvas at 2× resolution: 47 of 10,215 seam-strip pixels differ by more than three channel levels, maximum ten (minor Canvas rasterization variation; acceptance limits are 0.5% and sixteen). Material repeat assets are unchanged.
