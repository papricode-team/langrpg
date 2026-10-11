# Expansion terrain sources

New ground uses the high-resolution contract from `origin/main` at `b9170fb`: four texture pixels per world unit, GPU-safe chunks, registered day/night geometry, and native close-up paintings rather than an enlarged layout image. Raised buildings, furniture, plants and residents remain editable scene objects.

The integrated source sets are `lindenhafen/station-yard`, `lindenhafen/parcel-yard`, `lindenhafen/garden-court` and `lindenhafen/canal-walk`, placed at (1536, 0), (2304, 0), (2304, 512) and (1536, 512). Their thirty-two native day/night paintings produce four runtime chunks, each with registered day/night detail and overview files under `web/public/assets/world-expansions/lindenhafen/`. The scene adds connecting paths, forty-one editable props and eighteen reachable activity definitions. The community garden has a navigable loop around a planted island, a reusable greenhouse corner and Mila's four daily visits. The canal has a bridge, reading corner and Anne's afternoon visit. Connected land reaches 2.568× baseline. The southern half of the required 3072 × 2048 footprint remains to be authored.

## Source and export geometry

- One runtime chunk covers 768 × 512 world units.
- Four overlapping source paintings each cover 432 × 304 units. Columns start at 0 and 336; rows at 0 and 208. The overlap is 96 world units.
- Each native detail painting must be at least 1450 × 1000 pixels and within 0.03 of the 432:304 aspect ratio. Accepted parcel-yard paintings are 1494–1495 × 1052 pixels, matching the native detail density on main.
- Normalize each close-up section to 1728 × 1216 texture pixels. The existing seam stitcher combines them with a 384-pixel overlap into 3072 × 2048 pixels.
- The runtime export adds a one-pixel copied guard on every edge: 3074 × 2050 pixels, with the visible crop `{x:1,y:1,width:3072,height:2048}`. A copied guard prevents GPU sampling outside the image; it does **not** repair mismatched neighboring terrain geometry. Review adjoining roads and banks when placing chunks.
- WebP quality is selected between 76 and 94 while enforcing ≤2 MiB per detailed file. A 768 × 512 overview supports zoomed-out display and loading transitions.

Regenerate exports from the repository root (repeat with `station-yard`, `garden-court` or `canal-walk`):

```sh
node scripts/prepare-terrain-expansion.mjs lindenhafen parcel-yard --references
node scripts/prepare-terrain-expansion.mjs lindenhafen parcel-yard day
node scripts/prepare-terrain-expansion.mjs lindenhafen parcel-yard night
```

Outputs go to `output/terrain-expansion/lindenhafen/`; source manifests record dimensions, crop, quality and bytes. Promote reviewed assets to `web/public/assets` and record their asset paths, crops, previews and `pixelDensity:4` in the scene only when the district is ready. The scene compiler validates these declarations against the actual files.

## Provenance and review

The built-in ImageGen tool produced the layout and all native day/night sections. Exact prompts are in `parcel-yard-prompts.json`, `parcel-yard-night-prompts.json`, and the upper-right night revision record. The initial whole-chunk generation was 1536 × 1024, so it is retained only as `parcel-yard-layout.png`; it is not final high-resolution terrain. Reference crops are reproducible from that layout and ignored by Git. Native source paintings and the layout use Git LFS.

The first upper-right night section failed the aspect-ratio check at 1515 × 1038. A replacement was generated from the registered daytime source; the rejected tool result remains in the original generation output location and is not used by the exporter. Do not relax the source checks to accept a misregistered section.

The stitched day and night exports were visually reviewed for continuous curbs and surface detail. The station-yard layout was revised twice to align the existing bridge and ramp, then rebuilt from native close-up paintings. The assembled day/night boundaries and placed objects have been reviewed in World Studio; screenshots are in `output/qa/lindenhafen-east-editor-{day,night}.png`. Exact station prompts and revisions are retained in `station-yard-prompts.json` and `station-yard-night-prompts.json`. Export manifests keep `review-export` as the exporter stage; runtime placement is recorded by the canonical scene, not inferred from that status.

Garden provenance is recorded in `garden-court-prompts.json`, `garden-court-day-revisions.json` and `garden-court-night-prompts.json`. The layout entrance was widened to align with the parcel courtyard. Two upper daylight sections were regenerated because their first outputs exceeded the accepted aspect tolerance; the exporter rules were retained. Accepted masters are 1494–1496 × 1051–1052 pixels. Day and night exports were inspected in the game; guard crops and the north path connection were validated. `--references` recreates the four geometry inputs from each district's selected layout, without generating or substituting final terrain.

Canal provenance is recorded in `canal-walk-prompts.json`, `canal-walk-layout-revisions.json`, `canal-walk-day-revisions.json` and `canal-walk-night-prompts.json`. The selected planning board preserves neighbor strips; the layout revision adds the bridge crossing. All four first daylight sections exceeded the aspect tolerance and were replaced, keeping the exporter checks unchanged. The accepted eight native day/night paintings are 1494–1496 × 1051–1052 pixels. Each night section uses the corresponding day painting as its geometry target and the adjacent garden only as a lighting reference. Final source PNGs and manifests live beside these prompts. The registered day and night detail files are 1.96 and 1.68 MiB; overviews retain 768 × 512 pixels. Reviewed boundary composites are `output/terrain-expansion/lindenhafen/canal-walk-{day,night}-joins.png`; browser evidence is `output/qa/canal-walk-editor-night.png` and `output/qa/canal-walk-reading-day.png`. Source manifest stage `review-export` does not replace canonical registration or scene validation.
