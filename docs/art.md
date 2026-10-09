# Art and audio provenance

Created for the Lantern Atlas concept on 2026-10-08, with separate world terrain and props generated on **2026-10-09**. The original world paintings, new terrain plates, prop and variation sheets, six-frame object animations, portraits, full-body NPCs and directional player walk and grounded idle sheets were generated with **Codex's built-in ImageGen tool**. Runtime images are optimized WebP derivatives. The world and characters use painterly artwork with genuine transparent sprite atlases.

## Runtime images

| Asset | Size | Use |
| --- | --- | --- |
| `web/public/assets/<region>-terrain.webp` | 1536 × 1024 each | Ground, roads and water for live exploration |
| `web/public/assets/lindenhafen-props.webp` | 1024 × 1598 | 16 reusable transparent Lindenhafen prop frames |
| `web/public/assets/waldruh-props.webp` | 1024 × 1582 | 16 reusable transparent Waldruh prop frames |
| `web/public/assets/nebelstadt-props.webp` | 1024 × 1646 | 16 reusable transparent Nebelstadt prop frames |
| `web/public/assets/<region>-preview.webp` | 1536 × 1024 each | Composed scene exports for cards and minimap |
| `web/public/assets/portraits.webp` | 1774 × 887 | Four-column, two-row portrait atlas |
| `web/public/assets/characters.webp` | 1024 × 768 | Four-column, two-row full-body NPC atlas; 256 × 384 cells |
| `web/public/assets/player-walk.webp` | 1536 × 1440 | Eight-column, five-row player atlas; 192 × 288 cells, 36 valid frames |

The portrait order is fixed: top row Marta, Otto, Lina, Emil; bottom row Ada, Fritz, Greta, wanderer. It must match `npcs` order and the portrait CSS indexing. The full-body NPC atlas uses the same order. The wanderer portrait represents the player in interface panels. The first four player rows face down, right, up and left, in that order; each row contains eight walking frames. The fifth row contains four grounded standing views in its first four cells: down, right, up and left, at frame indices 32–35. Its last four cells are transparent and unused. Idle views come from their own generated turnaround rather than replacing a walking pose.

Lossless source masters are included in `art/source/lindenhafen.png`, `art/source/portraits.png`, `art/source/characters-painted.png`, `art/source/player-walk-painted.png` and `art/source/player-idle-painted.png`. The NPC and walk sheets are 1448 × 1086 PNGs; the two-column, two-row idle sheet is 1237 × 1271. All three use genuine transparency. These repository copies preserve the selected generated artwork without requiring access to the original machine's image cache.

The game requests the WebP assets. Original PNGs need not be copied into the public production directory. The source masters are excluded from Docker build contexts; publishing serves the optimized runtime images.

## Separate world terrain and props

The three terrain plates and transparent prop sheets were generated with the built-in ImageGen tool on 2026-10-09 using each region's original painting as its visual reference. Terrain edits removed buildings, trees, lamps, stalls, boats and other raised scenery while retaining the road, water and land layout. Prop sheets matched the reference camera, palette and painterly materials. The original `lindenhafen.png`, `waldruh.png` and `nebelstadt.png` paintings remain historical references, and their original WebP exports are no longer the live world's base layer.

Selected generated masters are saved as `art/source/<region>-terrain.png` and `art/source/<region>-props.png`, where `<region>` is `lindenhafen`, `waldruh` or `nebelstadt`. Authored `art/source/<region>-props-crops.json` files identify each sprite's padded rectangular bounds; generated sheet spacing is not assumed to be a perfect grid. The exact selected Lindenhafen generation prompts are preserved in [lindenhafen-prompts.txt](../art/source/lindenhafen-prompts.txt).

Every region contains 16 reusable asset roles: archive, café, station, workshop, house, tree, cypress, lamp, stall, fountain, arch, greenhouse, boat, bench, planter and sign. Regional artwork gives these roles the local building and landscape style. Each region also has 16 distinct house, tree, stall and garden silhouettes in `<region>-variations.webp`. These 96 authored asset families supply 276 scene instances: 96 in Lindenhafen, 88 in Waldruh and 92 in Nebelstadt. Every family has a calm day sequence and a separately painted night sequence, with six ImageGen-authored frames each, for 1,152 painted scenery frames. The three `web/src/placed-<region>.ts` files author the instances and their motion rather than baking them into a map image.

Run `node scripts/prepare-world-art.mjs` from the repository root after replacing a prop master, crop metadata or placements. Pass a region ID to export only that region. Sharp performs rectangular extraction, proportional resizing to a maximum frame side of 360 pixels, transparent compositing and quality-90 WebP encoding with alpha quality 100. It preserves source alpha and does not generate artwork or remove backgrounds. Each output atlas is 1024 pixels wide, has 16 named frames in its companion `*-props.json`, and stays below 2048 pixels high.

The same script exports quality-85 `*-preview.webp` images by composing terrain and the authored placements in depth order. Interface cards and the minimap use those previews. Live Phaser exploration loads the clean terrain and transparent animation atlases, then places each object and plays its authored frame sequence. See [painted sprite animation](world-animation.md) for master sheets, exact prompts, export and verification. The development fixture `/qa/world-assets.html` exposes terrain-only and still-scenery views for visual review.

## Painted character derivatives

Run `node scripts/prepare-character-art.mjs` from the repository root after replacing a painted source master. Optional `--npc-source <path>`, `--player-source <path>` and `--idle-source <path>` flags support alternate inputs. The script uses Sharp only for rectangular crops, proportional resizing, transparent compositing and WebP encoding. It does not generate artwork, remove backgrounds, draw masks or alter source alpha. Alpha measurements locate crop bounds and the upper head centre; output pixels retain their original transparency through resizing.

Generated spacing is approximate, so the script searches for the least opaque row and column dividers around the expected grid. This prevents boots crossing a nominal column boundary and hair near a nominal row boundary from bleeding into neighbouring frames. A padded rectangular crop retains painted edges. It rejects opaque sheets and blank cells, and reports source-edge contact or dividers crossing visible artwork for manual inspection.

All figures in each row share one scale. The target median body height is 338 pixels for NPCs and 246 pixels for the player; a particularly wide stride can reduce the whole row slightly to fit without clipping. Each row aligns the upper-head centre to the cell's horizontal centre and the head top to a common height. The nominal foot pivot is `(0.5, 0.9)` of the cell, with the median sole position at that baseline. Small differences in foot height remain in the painted poses. Scale, dividers and actual body-height ranges are printed on every run. The four idle views are prepared in memory and appended to the existing player atlas; no extra runtime texture is created and no walking frame is overwritten. The alpha WebP outputs use quality 90 and alpha quality 100, and are replaced atomically after encoding.

Exact full-body generation, gait revision and grounded idle prompts are saved in [character-npcs.txt](prompts/character-npcs.txt), [character-walk.txt](prompts/character-walk.txt) and [character-idle.txt](prompts/character-idle.txt). Character art and revisions were generated on 2026-10-08 using the built-in ImageGen tool.

At scene startup, `web/src/character-art.ts` separates the painted player into shared detail, coat, hair and skin atlases. GPU tinting changes each material independently while keeping cloth shading and neutral leather, shirt and boots. The four RGBA textures use approximately 34 MiB regardless of player palettes; the source GPU texture is released after preparation. Movement uses actual travelled distance to advance directional frames, grounded pivots, shared contact shadows and subtle idle breathing. The character editor paints the same layers into a canvas for live previews without creating avatar-specific GPU textures.

## Additional painted regions

The A2 and B1 maps were generated with the built-in ImageGen tool on 2026-10-08. The selected lossless masters are included at `art/source/waldruh.png` and `art/source/nebelstadt.png`.

Exact original prompt sets are saved in [map-waldruh.txt](prompts/map-waldruh.txt) and [map-nebelstadt.txt](prompts/map-nebelstadt.txt). Both are opaque reference paintings without characters, text or interface. Their original WebP derivatives preserve the region-specific geometry and art direction. The separate terrain and prop pipeline above supplies the current live maps; navigation and interactive landmarks retain the original coordinate layout.

## Final generation prompt sets

These preserve the final art direction and character specification. They are reconstructed prompt sets, not a byte-for-byte transcript of the tool requests.

### Lindenhafen world

Create a production-quality 1536 × 1024 landscape world painting for a 2D browser RPG. Show Lindenhafen, a German canal town with cozy contemporary fantasy, from a near-orthographic overhead view around 45 degrees. Use detailed hand painting, terracotta roofs, ivory townhouses, forest-green foliage, jade and turquoise canal water, and amber evening sunlight. Build wide, connected cream cobblestone streets and clear walkable spaces.

Place a café with a green awning at centre-left, a clock railway station at upper-right, a covered market at centre-right, an archive at upper-left, a workshop at lower-left and a garden at lower-centre. Include restrained whimsical details: a curious mailbox, a steaming espresso machine and bicycles. Buildings should feel inviting and distinct, with cohesive materials and lighting. No characters, labels, text, interface elements, pixel art or 3D rendering.

### Character portrait atlas

Create exactly eight expressive adult head-and-shoulder portraits in eight equal squares, four columns by two rows, with no gutters. The overall image is 2:1. Use a consistent premium painterly style with warm cream backgrounds, natural faces and coordinated lighting.

Top row, left to right: Marta, olive complexion, in her forties, dark bun, moss-green apron; Otto, older, silver moustache, teal conductor cap and spectacles; Lina, brown complexion, about twenty-five, copper curls, mustard scarf and blue jacket; Emil, about thirty, brown stubble, mechanic goggles and a burgundy shirt.

Bottom row: Ada, about fifty, silver bob, glasses and plum cardigan; Fritz, about forty, auburn moustache and green waistcoat; Greta, about thirty, black curls, freckles, sage shirt and lavender accents; an androgynous wanderer, about twenty-five, light-brown complexion, short dark hair and teal jacket. No text, borders or interface elements.

## Painted object animation masters

The built-in ImageGen tool edited registered reference grids into six successive painted poses per asset. Active masters are `art/source/<region>-day-animation-0.png` through `-7.png` and the matching `-night-animation-0..7.png`, each 1536 × 1024 with four asset rows and six columns of time. Exact prompts accompany every selected master. The [prompt index](../art/source/world-animation-prompts.md) lists the selected calm day/night, terrain and resident generations.

Day and night keep architecture, trunks, crowns and foot anchors fixed. Local leaf tips, flowers, water, lamp flames, curtains and mechanical details provide subtle motion. Night artwork is painted with moonlight, warmer occupied windows and quieter vegetation. All three regions have ImageGen-painted night terrain; Nebelstadt also has a daylight terrain edit. Terrain remains a single ground image per period.

Run `node scripts/prepare-world-variations.mjs` for the diverse static silhouettes and `node scripts/prepare-world-animation-references.mjs` to rebuild reference grids. After generating masters, export terrain with `node scripts/prepare-world-time-art.mjs`, then frames with `node scripts/prepare-world-animations.mjs --set day` and `--set night`. The frame exporter uses common rectangular bounds per sequence and preserves native alpha. Active scenery uses 48 WebP atlas pages and six manifests. Original stronger-wind masters remain historical source references. Static atlases supply previews and loading fallback.

Eight resident idle families have six painted frames each in `residents-animation-0.png` and `-1.png`, with fixed foot registration. The story characters use these gentle idle sequences. Strolling locals use the directional walking atlas.

## German voice clips

German examples and NPC greetings use machine-generated speech from the native macOS **Anna** German voice. The production method is `say -v Anna -r 145` to AIFF, followed by FFmpeg conversion using `libmp3lame` at 64 kbit/s. This is operating-system speech synthesis, not a human voice recording or a cloned performer.

The asset naming contract is `web/public/audio/<exercise-id>.mp3` for authored instructional text, `word-<lexeme-id>.mp3` for dictionary pronunciation, `guide-<grammar-id>-<number>.mp3` for grammar examples, activity-specific IDs for orders/directions, and `npc-<npc-id>.mp3` for greetings. The generator deduplicates identical German text; the current manifest records the exact text, file and voice for every bundled clip. Static MP3 delivery makes the bundled clips independent of installed device voices. Transcripts remain available for accessibility and supported practice. Listen credit should require successful audio playback; revealing a transcript must not establish unaided listening mastery.

Original longer listening passages and mission instructions are included. Varied speakers and educator-reviewed recordings remain useful future improvements. Regenerate the complete inventory with `AUDIO_WORKERS=6 node scripts/generate-audio.mjs --course --activities` (Node 24+, macOS Anna and FFmpeg); unchanged clips are reused. Article-form corrections are reflected in the spoken dictionary entry rather than pronouncing an ungrammatical article/lemma combination.
