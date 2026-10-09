# Painted sprite animation

The live worlds use terrain plates and **276 individually placed sprites**: 96 in Lindenhafen, 88 in Waldruh and 92 in Nebelstadt. Every object has two separately painted six-frame raster animation sets, calm day and quiet night, authored with the built-in ImageGen tool. The 96 regional asset families contain **1,152 scenery frames** across both periods.

Roofs, walls, trunks, full tree crowns, lamp housings and ground contacts stay fixed. Movement stays local: small leaf tips, flowers, cloth hems, curtains, flames, water and mechanical details. Night paintings use silver-blue moonlight, warm occupied windows and lamps, settled cloth and quieter foliage. The renderer selects actual raster frames with ordinary upright sprites, fixed scale and common pivots. It has no environmental meshes, light masks or procedural overlays.

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
- `web/public/assets/<region>-<period>-animation-0..7.{webp,json}` and `-animations.json`: runtime frames, speed, pivots and terrain metadata.
- `web/src/world-clock.ts`: clock modes and period selection.
- `web/src/scenery-animation.ts`: deterministic per-instance phase and frame sampling.
- `web/src/world-scenery.ts`: sprite creation, frame selection, reduced motion and culling.

The exporter crops, packs and encodes generated artwork; it does not draw animation frames, mask pixels or warp images. Six frames share dimensions and pivots. Native source alpha remains intact. Historical stronger-wind masters remain in source for reference and are not selected by the world clock.

An optional source-specific `*-registration.json` can provide row boundaries when an authored sheet needs more room for an asset. The exporter keeps the original global foot baseline when a boundary moves, so rectangular crops preserve both the complete artwork and its ground contact.

The initial region loads only its current period. Other regions and periods load on demand. Desktop retains loaded pages for revisits; small screens release pages from the previous region or period, and cached manifests can reload released textures. Resizing to a small screen releases inactive pages. Ordinary frame selection avoids repainting canvases or uploading textures each tick.

## Watching and accessibility

Three background residents per region follow navigation-tested routes with painted directional walking frames. Seven story residents use six-frame painted idle sequences; their fixed foot pivots preserve contact with the ground. The **Watch the world** control hides the HUD and follows a slow camera tour. Escape returns to exploration. Camera motion and decorative animation obey the configured reduced-motion preference.

Settings → World motion offers Follow device preference, Full world animation and Calm, still scenery. The choice persists. Still scenery freezes the current painted frame and resident routines. Player movement remains available. The world sleeps behind menus and when the page is hidden.

## Verification

`placed-scenery.test.ts` checks every placement against both complete six-frame sets, varied tree silhouettes, registered dimensions, distinct period atlases and valid pivots. It also checks independent phases, frame changes, fixed upright transforms, freeze/resume, culling and destruction. Clock tests check day/night boundaries, gradual progression, midnight wrap and manual/local modes. Navigation tests cover all story-character and discovery approaches and every resident loop.

`node scripts/check-world-animations.mjs` verifies 192 sequences and 1,152 frames, native transparency, distinct painted phases, separate day/night artwork and the 2048-pixel texture budget.

The development fixture at `/qa/world-assets.html` uses the actual game renderer and residents. It selects all three regions and both times, hides raised objects, freezes animation or enables the camera tour. Its animation count reports placements with loaded authored frames.
