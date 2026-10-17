# Painted material style pass — 2026-10-17

All 24 distinct PNG masters were repainted with built-in `image_gen`; the manifest exports 26 material entries because cliff/rock and banked/canal water share masters. `style-review.json` identifies the selected generations and exact sibling `*-style-prompt.txt` files. Original prompts in `manifest.json` describe the earlier sources; the style-review prompts describe the current replacements.

Lindenhafen uses sandstone/cream paving, restrained terracotta repairs, sage ground cover and jade/teal water. Slate retains Nebelstadt's muted coastal grey-green. Snow and ice retain their own identities. Local stones, blades and ripples carry upper-left highlights and small lower-right crevice shadows; a tile-wide lighting gradient would repeat across the town and is explicitly excluded.

The exporter keeps its periodic-overlap algorithm, including exact decoded boundary pixels. No seam tolerance was relaxed. The current sources are 1254 × 1254 and their periodic runtime derivatives are 1152 × 1152. Asset URLs remain stable, including the historical `town-cobble-bridge-blue.webp` filename, which now contains warm stone. The pure catalogue module `web/src/terrain-materials.ts` overrides legacy average colors and the old blue-cobble name for plan previews and ground sampling without changing shared generated JSON.

Export: `node scripts/prepare-terrain-materials.mjs --art-only`. Check: `node scripts/check-terrain-materials.mjs`. Without the flag the normal catalogue-writing behaviour remains. All decoded outer edges still match exactly. Comparisons: `docs/audits/visual-style/terrain-after-materials.jpg`; actual runtime repeats: `terrain-after-repeat.jpg` in the same directory.

The renderer samples one global `canal-masonry` for kerbs, copings and canal walls. The repaint warms those joins, but per-town wall materials and further contour wear need a renderer change outside this asset pass.

## Town planting pass 2 — 2026-10-17

Only `meadow.png` and `canal-grass.png` were repainted in this pass, using built-in
ImageGen to replace yellow highlights with deeper leaf greens around `#5f7d4a`.
Their exact sibling `*-style-prompt.txt` files and the manifest/style-review
selection entries describe the replacements. All other material masters are retained.
Native resolution stays 1254 × 1254; the periodic export stays 1152 × 1152.

For an isolated repaint, `node scripts/prepare-terrain-materials.mjs
--only=meadow,canal-grass --art-only` exports just those two runtime textures and
thumbnails. Without `--art-only`, a filtered export updates only the selected
catalogue entries. `check-terrain-materials.mjs --report=<path>` can write a
pass-specific seam report. Neither filtering nor report selection changes the
zero-difference seam requirement or the 2 MB runtime budget.

## Lindenhafen variety pass (2026-10-17)

`town-fan-cobble` and `town-herringbone` are native 1254 × 1254 built-in
ImageGen paintings with exact sibling `*-prompt.txt` files. `variety-pass-4.json`
records selected generations and attached references. Both use a 144-world-unit
repeat, with individual stones at walking scale. Export only these IDs with:

```sh
node scripts/prepare-terrain-materials.mjs --only=town-fan-cobble,town-herringbone
```

`variety-layout.json` retains the paving-zone shapes. The associated
`scripts/prepare-terrain-variety.mjs --before <original-seed.json>` applies those
shapes with `shapeGround`, then redistributes only the old paving total. It
preserves every meadow, moss and canal sample and every feature. The two old
Lindenhafen slots `cobble` and `town-cobble` are replaced, keeping the six-layer
limit. Their shared catalogue entries and assets remain available to other towns.
