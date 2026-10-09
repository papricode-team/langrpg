# Painted sprite animation

The live worlds use terrain plates and **276 individually placed sprites**: 96 in Lindenhafen, 88 in Waldruh and 92 in Nebelstadt. Every object has two separately painted six-frame raster animation sets, calm day and quiet night, authored with the built-in ImageGen tool. The 96 regional asset families contain **1,152 scenery frames** across both periods.

Buildings use a **static base sprite** and **separate animated detail sprites**. Each of the 11 architectural families per region and period keeps the first painting for its walls, roof, foundation and silhouette. Small registered overlays animate window interiors, clock faces, forge flames and attached details; whole-building paintings never cycle. The 66 fixed bases and 732 detail frames are packed separately, so variations in the source paintings cannot make the architecture flicker. Each detail has its own deterministic phase and mirrors with its base, including off-center pivots.

Other scenery plays its authored raster sequences. Night paintings use silver-blue moonlight, warm occupied windows and lamps, settled cloth and quieter foliage. The renderer uses ordinary upright sprites with fixed scale and pivots; it does not repaint textures each tick.

Each region's original 16 roles has 16 additional house, tree, market and garden silhouettes. Placements explicitly select each silhouette; navigation uses the physical role and foot anchor. Waldruh's western workshop is distinct from its clockmill.

## Time of day

The world clock automatically selects day from 07:00 to 19:00 and night otherwise. A foreground day lasts twelve minutes in the default slow cycle. Menus and hidden pages pause that cycle. Settings → Time of day offers the slow cycle, real local time or a chosen hour. Moving the hour slider selects manual time. The clock button opens these controls, and the preference persists.

Each period changes every object's sprite sheet and selects its painted terrain. Lindenhafen and Waldruh use their original clean ground plates for day; Nebelstadt has a daylight edit. All three have separately painted night ground plates. Time changes wait for the requested artwork to load before replacing sprites together. Rapid changes discard stale callbacks.

## Files and export

- `art/source/<region>-day-animation-0.png` through `-7.png`, and matching `-night-animation-0..7.png`: selected ImageGen masters, 1536 × 1024, four asset rows and six time columns. Exact `*-prompt.txt` files accompany each master. The [prompt index](../art/source/world-animation-prompts.md) lists every selected generation.
- `art/source/<region>-night-terrain.png` and `nebelstadt-day-terrain.png`: painted ground variants.
- `art/animation-references/<region>.json`: row identities and registered reference geometry. `scripts/prepare-world-animation-references.mjs` rebuilds reference grids from transparent static assets.
- `scripts/prepare-world-time-art.mjs`: optimizes the painted terrain variants.
- `scripts/prepare-world-animations.mjs --set day` and `--set night`: rectangular export and common sequence bounds. Eight 1024-wide atlases per region and period preserve native alpha.
- `scripts/prepare-building-layers.mjs [--set day|night] [region...]`: extracts the fixed first painting and small, softly bounded detail regions from the existing atlases. Full period and batch exports invoke this automatically. Run it directly after a partial export once all 32 sequences are present.
- `web/public/assets/<region>-<period>-animation-0..7.{webp,json}` and `-animations.json`: runtime frames, speed, pivots and terrain metadata.
- `web/public/assets/<region>-<period>-building-bases.{webp,json}` and `-building-details.{webp,json}`: static architecture and separate detail sheets. Version 2 manifests include `base` and `overlays` on architectural entries; the original sequences remain available for reproducible extraction.
- `web/src/world-clock.ts`: clock modes and period selection.
- `web/src/scenery-animation.ts`: deterministic per-instance phase and frame sampling.
- `web/src/world-scenery.ts`: sprite creation, frame selection, reduced motion and culling.

The world exporter crops, packs and encodes generated artwork without warping it. The building-layer exporter copies base RGBA losslessly and applies fixed soft masks only to the small detail crops, locking them to the base alpha. Six frames of each detail share dimensions and offsets. Historical stronger-wind masters remain in source for reference and are not selected by the world clock.

An optional source-specific `*-registration.json` can provide row boundaries when an authored sheet needs more room for an asset. The exporter keeps the original global foot baseline when a boundary moves, so rectangular crops preserve both the complete artwork and its ground contact.

The initial region loads only its current period. Loading, cache checks and releases include every base and overlay sheet, skipping whole-building sequence pages when no other objects need them. Other regions and periods load on demand. Desktop retains loaded pages for revisits; small screens release pages from the previous region or period, and cached manifests can reload released textures. Resizing to a small screen releases inactive pages. Ordinary frame selection avoids repainting canvases or uploading textures each tick.

## Watching and accessibility

Three background residents per region follow navigation-tested routes with painted directional walking frames. Seven story residents use six-frame painted idle sequences; their fixed foot pivots preserve contact with the ground. The **Watch the world** control hides the HUD and follows a slow camera tour. Escape returns to exploration. Camera motion and decorative animation obey the configured reduced-motion preference.

Settings → World motion offers Follow device preference, Full world animation and Calm, still scenery. The choice persists. Still scenery freezes the current painted frame and resident routines. Player movement remains available. The world sleeps behind menus and when the page is hidden.

## Verification

`placed-scenery.test.ts` checks every placement against both complete six-frame sets, varied tree silhouettes, registered dimensions, distinct period atlases and valid pivots. It also checks fixed architectural frames, separately animated details, mirrored offsets with off-center pivots, complete texture lifecycles, independent phases, freeze/resume, culling and destruction. Legacy manifests without detail layers freeze their first architectural frame. Clock tests check day/night boundaries, gradual progression, midnight wrap and manual/local modes. Navigation tests cover all story-character and discovery approaches and every resident loop.

`node scripts/check-world-animations.mjs` verifies 192 source sequences and 1,152 frames, native transparency, distinct painted phases, separate day/night artwork and the 2048-pixel texture budget. It also verifies that all 66 bases match their first painting pixel-for-pixel, and every detail sequence has distinct phases, registered bounds, a transparent perimeter and a crop smaller than 5% of the base area.

The development fixture at `/qa/world-assets.html` uses the actual game renderer and residents. It selects all three regions and both times, hides raised objects, freezes animation or enables the camera tour. Its animation count reports placements with loaded authored frames.
