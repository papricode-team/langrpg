# Native player portraits

Completed 2026-10-13 for the entire published customizable player catalogue.
Portraits now compose directly at 256×256 from separately painted component
layers. The renderer does not load or enlarge walking/editor head crops.

Coverage: 100 customizable components plus two authored expressions. Eighty
entries have visible native portrait artwork; 22 pants, skirts, shoes, belt-pouch
and held-lantern entries are explicitly outside the head-and-shoulder crop.
Regular, slim and broad builds retain their supported wardrobes. Existing
recipes, tint colors, occupancy, hair hiding and hairstyle exclusions are reused.
A full native face supplies its own skin silhouette rather than overlaying the
old blurry face. Unsupported expressions retain that character's neutral face.

Artwork was produced with built-in ImageGen. Exact prompts are in `prompts/`,
original generated PNGs in `candidates/`, and enlarged layout-only guides in
`references/`. Guides are never publication artwork. `accessories-0.png` was
rejected because it added full bags; `accessories-0-v2.png` correctly contains
only visible straps. Every published source is named and hashed in
`web/src/data/player-portraits.json`.

The exporter extracts each painted component, removes isolated adjacent-cell
slivers, registers its complete layer to the portrait layout, separates tint
materials and downsamples to 256×256 lossless WebP. It refuses native enlargement.
It does not resample old walking pixels into the publication. Detailed facial
features, hair, fabric, seams and accessory detail come from the new paintings.
The beauty mark is a four-pixel mark in the final portrait, not an enlarged spot.

Commands from the repository root:

- `npm run characters:portraits` rebuilds the 183 material images (~1 MB total).
- `npm run characters:portrait-proofs` rebuilds the 83 composition fixtures.
- `node --test scripts/player-portraits.test.mjs` verifies coverage, hashes,
  native dimensions, every option, expressions, tinting, 112 hair/hat pairs,
  recipe immutability and absence of walking-sheet loads.

Runtime entry point: `web/src/avatar-portrait.ts`. Shared composition:
`web/src/player-portrait-compositor.mjs`. The decoded portrait-sheet cache is
bounded to 12 MiB and layers load sequentially. Final portrait cache keys include
the portrait asset version and the full existing recipe/expression identity.

Visual review: `art/proofs/player-portraits/page-0.png` through `page-6.png`
contain every visible component at native 256px plus actual 80/56/46/25px sizes.
`browser-desktop.png` verifies 256px source images at 2× display density and
46/25/56/80 CSS pixels. Narrow browser proofs verify 42/25/44/80 CSS pixels;
the viewport override exposes 1× density. A 256px source also covers the largest
80px portrait at 3× density without enlargement (240 physical pixels).

`web/qa/character-portraits.html` uses the production renderer and game styles.
Its controls exercise builds, every visible option, skin/hair/clothing colors
and supported expressions without modifying the saved profile. Native-size
inspection is optional; the default samples use actual game sizes.

The NPC portrait pipeline and world/editor sprites are outside this change.
