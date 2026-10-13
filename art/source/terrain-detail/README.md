# Close-up story terrain

All runtime terrain, overview images and loading fallback plates contain only
ground surfaces, water, bridges, stairs, retaining walls, embankments and cliffs.
Buildings, tree silhouettes, plants, furniture, lamps, stalls and people belong
to independently editable scenery layers. Terrain generation and regeneration
must preserve that separation and avoid shadows of absent scenery. Low grass,
fine moss and small surface flowers remain part of ground texture.

The active day/night pieces and all seven legacy/manifest loading plates were
visually reviewed on 2026-10-13. See `docs/audits/terrain-only-review.json` and
the contact sheets under `output/terrain-review/`.

The selected 96 PNG masters were generated with Codex's built-in ImageGen tool
on 2026-10-11: sixteen overlapping sections for each of three story towns in
both daylight and moonlight. [prompts.json](prompts.json) records the exact
prompts and selected files. Original reference paintings remain in `art/source/`.

Each section covers only 432 × 304 world pixels, rather than the previous
832 × 576. The generated rasters are approximately 1495 × 1053, providing over
3.35 native painting pixels per world unit. Every exported JSON records actual
source dimensions. This adds newly painted stone edges, mortar, grass blades,
soil grains and water detail at close camera distance.

The 4 × 4 grid starts at `(column × 368, row × 240)` in the original
1536 × 1024 world and overlaps by 64 pixels. Sections are normalized to
1728 × 1216 and stitched at four pixels per world unit with continuous
minimum-difference seams and a narrow eight-pixel feather. The final painting
covers 6144 × 4096 pixels. Day sections use original geometry references;
night edits preserve the selected day section and use the old night crop
only as a lighting reference.

Runtime uses four 3073 × 2049 WebP pieces per lighting state. The visible
frames cover 3072 × 2048 pixels each; a one-pixel guard band at the internal
edges makes bilinear sampling continuous without overlapping world geometry.
Every GPU texture fits within 4096 pixels and every download is at most 2 MiB.
The scene places them at `(0,0)`, `(768,0)`, `(0,512)` and `(768,512)` with
768 × 512 world footprints. Group fading, tinting, visibility and texture
reclamation apply to the complete painting. The lower-resolution base plate
is a downsample of the same painting and remains visible until all four
detail pieces are ready.

```sh
# Recreate ignored reference crops, without calling ImageGen:
node scripts/prepare-terrain-detail.mjs --references
# Export all selected masters:
node scripts/prepare-terrain-detail.mjs
# Or a single town and lighting state:
node scripts/prepare-terrain-detail.mjs waldruh --night
# Refresh cards and minimaps:
node scripts/prepare-scenery-previews.mjs lindenhafen waldruh nebelstadt
```

`npm run assets -- --art` exports this set. The old terrain and period
exporters also prefer these selected masters. Animation manifest rebuilds
retain the four piece references. Sources use Git LFS and are excluded from
deployment; reproducible `*-reference.png` crops are ignored.

Build-versioned world artwork URLs bypass copies cached by older deployments.
The server revalidates named art and JSON manifests. Distribution limits
reserve 36 MiB per story town and 160 MiB of total art, while retaining the
2 MiB individual file cap and streaming one destination at a time.

The `/qa/world-assets.html` preview reports the loaded painting dimensions
and the number of physical screen pixels per terrain pixel. Inspect day and
night, walk the map and check both source stitching and runtime piece edges.

Authored navigation masks are independent of the painted lighting. Every active
story terrain chunk requires a registered mask; the compiler rejects routes
outside it. Core street traces can be rasterized with
`node scripts/prepare-core-ground-masks.mjs` before re-exporting all masks.
Save `<town>-walkable.png` at exactly the canonical scene's world dimensions, or
`<town>-<terrain-id>-walkable.png` at the tile's exact world dimensions. White
means walkable and black means blocked; use one native pixel per world unit.
A transparent background is treated as blocked. Mask export never resizes or
infers navigation from paved-looking colours.

```sh
node scripts/prepare-terrain-detail.mjs --walkable-masks
```

This writes bounded mask PNGs to `web/public/assets/walkable-masks` and an exact
rectangle partition of their white pixels to `<town>-walkable-masks.json` beside
the sources. The JSON includes world offsets, provenance and the polygons for
a reviewed scene content pass or conversion to editor polygons. It does not overwrite authored
scene geometry. Normal terrain export also refreshes masks when sources exist.
