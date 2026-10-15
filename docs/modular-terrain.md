# Modular terrain and scenery kit

Terrain can now be built from reusable materials and editable shapes instead of one painted map. This work includes the map editor redesign (`d19866ef`) and is rebased onto `main` at `628bf490`.

## Use it

Run the web development server, then open `/qa/terrain-kit.html` for the assembled, animated construction-kit preview and downloadable pieces. `/qa/terrain-materials.html` shows every repeating material and its denser repeats.

In **Admin → Map editor → Terrain**, choose **Preview editable terrain**. Existing roads and water collision outlines provide an approximate starting point. Edits in this conversion preview remain local until **Publish conversion**; **Discard preview** restores the original painting. Existing towns retain their original art until a conversion is published. The historic outline conversion is a starting point for reauthoring, not a finished reconstruction of the paintings.

Choose **Piece**, a material family and a shape, then click the map. Pieces snap to a 256-unit grid, with 96-unit openings and 12-unit borders. Select and drag a piece to move its border and interior together; Delete and Bring to front act on the whole piece. Finished shapes and pieces on an already converted map publish immediately through the existing lock, validation and undo workflow. Water blocks walking; later road or bridge surfaces cut a walkable crossing. Borders remain walkable.

The **Edit** tab’s object palette contains all 16 new details in every town. They use the existing move, resize, flip, collision and undo controls. Native-resolution art loads only when placed in a game region; the admin editor loads the complete detail library. New art introduced by a live edit loads without requiring a map reload.

## Assets

| Set | Coverage | Resolution and location |
| --- | --- | --- |
| 20 repeating materials | Meadow, dry grass, forest floor, moss, earth, mud, gravel, sand, cobble, limestone, slate, brick, timber, rock, shallow water, deep water, marsh, snow, ice, farmland | 1152 × 1152 lossless WebP, `web/public/assets/terrain-materials/` |
| 144 construction pieces | 18 shapes × 8 families: cobble, brick, slate, earth, gravel, timber bridge/boardwalk, limestone-edged canal, rock-edged stream | 1152 × 1152 transparent lossless WebP, `web/public/assets/terrain-pieces/` |
| 16 independent details | Reeds, fern, wildflowers, mushrooms, grass tuft, river rocks, driftwood, barrels, crates, lily pads, duck, lantern, watering can, fire pit, bunting, birdbath | 1254 × 1254 native transparent lossless WebP, `web/public/assets/terrain-objects/` |

Shapes include two straights, four quarter-circle bends, four T-junctions, a cross, four end caps, a round plaza/pond, a square plaza/pool and a basin/plaza with four openings. Rotations are explicit pieces, so texture orientation remains aligned with the world. Different material families meet at intentional material boundaries; matching connectors within a family have identical visible pixels and alpha.

Nine details use gentle procedural motion: five sway, two bob, one lantern shimmers and one fire pit flickers. This is runtime motion of native cutouts, not separately generated animation frames. Reduced motion disables it; offscreen details stop updating.

The **built-in image_gen tool** generated 36 independent paintings: 20 material masters and 16 transparent object masters. Original 1254 × 1254 PNGs are in `art/source/terrain-materials/` and `art/source/terrain-objects/`, tracked with Git LFS. Exact prompts are in `docs/prompts/terrain-materials/` and `docs/prompts/terrain-objects/`. Generation requests and native export metadata are retained alongside the sources and in `web/src/data/terrain-*.json`.

Material repeats use a periodic overlap blend from the native source, followed by matching boundary texels. They are neither mirrored nor enlarged. The 1152-pixel cell provides 4.5 source pixels per world unit. Construction pieces are compiled from these same generated materials using deterministic masks; they are not 144 independently generated paintings. Their exact geometry also drives rendering, collision and editor stamps. Runtime composition uses the 20 shared material textures rather than loading 144 full-resolution piece images.

## Architecture and regeneration

`WorldScene.modularTerrain` contains a base material and ordered polygon surfaces. Each surface has an ID, material, optional collision override and optional construction group. Later surfaces win visually and physically. Polygon boolean operations subtract bridges and islands from water, preserving holes. The game and map editor share `paintModularTerrain`; patterns have one world-space origin. Visible composed chunks have sampling guards and a 32-megapixel cache budget.

Terrain operations use the redesigned edit session, a map-wide terrain lock and an expected fingerprint. Stale changes fail instead of overwriting another admin. Export/import and Tiled roundtrips retain surface geometry, materials, blocked state and construction groups. Legacy terrain remains available for rollback.

```sh
# Requires the native PNG masters (git lfs pull for a fresh checkout).
npm run terrain:prepare
npm run terrain:check

# Optional bulk conversion of canonical scenes; review the resulting appearance first.
node scripts/migrate-modular-terrain.mjs
npm run scenes:compile
```

`terrain:check` decodes the distributed files and checks every opposite material edge, every matching construction connector, actual native dimensions and usable object alpha. Fully transparent RGB is ignored because WebP may discard it; visible color and alpha must match exactly. Curved connectors have straight guard sections to prevent antialiasing differences at joins.

## Verification

- All 20 materials and 144 pieces pass decoded seam checks; all 16 objects pass native-resolution and alpha checks.
- Browser checks exercise the actual map editor and real local publication worker: conversion preview/discard/publication/undo, material changes, shape placement, grouped construction placement/deletion/undo, and scenery placement/undo.
- A separate Phaser browser check renders all 16 objects, verifies nine animated objects, reduced motion and loading a new asset after initial scene creation.
- The web suite passes 1,167 tests excluding `avatar-baker.test.ts`; four additional focused construction/object tests pass. The excluded suite has six failures caused by existing `art/proofs/character-kit-hd/*.webp` files being Git LFS pointers rather than hydrated images in this checkout.
- Type checking, lint and production build pass. Tiled legacy/modular roundtrip coverage and scene compiler checks are included. Evidence is saved under `docs/audits/modular-terrain/` and `docs/audits/terrain-*.json`.

Browser audit commands require Vite at `http://127.0.0.1:4178`; both use local fixtures and make no production changes:

```sh
node scripts/audit-terrain-kit.mjs
node scripts/audit-modular-terrain.mjs
```
