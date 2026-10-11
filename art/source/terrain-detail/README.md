# Close-up story terrain

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
