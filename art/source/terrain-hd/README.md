# High-resolution story terrain

Generated on 2026-10-11 with Codex's built-in ImageGen tool. The selected
24 opaque PNG masters cover Lindenhafen, Waldruh and Nebelstadt, with four
overlapping sections per town for both daytime and nighttime. Exact generation
prompts and reference roles are recorded in [prompts.json](prompts.json).

Each original 1536 × 1024 terrain is divided into 832 × 576 source crops:
NW `(0, 0)`, NE `(704, 0)`, SW `(0, 448)` and SE `(704, 448)`. Adjacent sections
overlap by 128 source pixels. ImageGen restores surface detail separately in
each section; night edits use the selected day section as the geometry/detail
target and the corresponding old night crop as their lighting reference.

The selected section masters are approximately 1508 × 1043; each export JSON
records its actual native size. Export normalizes them to 1664 × 1152 and
stitches their 256-pixel overlaps into a 3072 × 2048 runtime plate. A continuous
minimum-difference seam with a narrow 8-pixel blend retains sharp section
interiors. This is a larger terrain texture over the same 1536 × 1024 world;
movement coordinates, object anchors and camera proportions retain that world
footprint. Hand-painted surface details can differ from the original stones.

Runtime exports, all under 2 MiB per file:

| Town | Day | Night |
| --- | --- | --- |
| Lindenhafen | `web/public/assets/lindenhafen-terrain.webp` | `web/public/assets/lindenhafen-night-terrain.webp` |
| Waldruh | `web/public/assets/waldruh-terrain.webp` | `web/public/assets/waldruh-night-terrain.webp` |
| Nebelstadt | `web/public/assets/nebelstadt-day-terrain.webp` | `web/public/assets/nebelstadt-night-terrain.webp` |

Nebelstadt's initial `nebelstadt-terrain.webp` also exports the selected day
plate. Source masters use Git LFS; source PNGs are excluded from deployment.
The `*-reference.png` crops are reproducible and ignored by Git. Original
terrain masters remain in `art/source/` as layout and lighting references.

```sh
# Recreate reference crops, without calling ImageGen:
node scripts/prepare-terrain-hd.mjs --references
# Re-export all selected day/night masters:
node scripts/prepare-terrain-hd.mjs
# Or export a single town/period:
node scripts/prepare-terrain-hd.mjs waldruh --night
# Rebuild fixed-size interface previews from the new runtime terrain:
node scripts/prepare-scenery-previews.mjs lindenhafen waldruh nebelstadt
```

`npm run assets -- --art` runs the high-resolution terrain exporter before
the scene preview exporters. `prepare-world-time-art.mjs` also prefers these
approved sections to the old small plates. Cards and minimaps stay at
1536 × 1024 and place scenery after downsizing the terrain.

The art budget keeps the 2 MiB individual-file limit and reserves an additional
4 MiB per story town: 20 MiB per town and 112 MiB across the distribution.
Region streaming and texture reclamation still load one destination at a time.
Use `/qa/world-assets.html` to inspect each town, toggle Terrain only, switch
day/night, and walk or run the camera tour.
