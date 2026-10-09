# Painted scenery and character depth

Each region keeps its original background painting. Street-edge trees, lamps, planters and other raised objects also have tightly traced foreground silhouettes. The renderer copies the original painted pixels inside each silhouette into a transparent atlas and places that foreground at the object's physical ground depth.

Character roots use their feet position for depth. A character behind an object draws below its silhouette; after walking in front of its base, the character draws above it. This applies to the local player, other connected players, story characters and wandering residents. It preserves the existing painted art rather than approximating trees or lamps with new drawings. Polygon holes retain open gaps in scenery.

Small physical footprints block feet inside solid pots, trunks and lamp bases. Canopies do not become oversized collision barriers: characters can still walk on pavement beneath an overhanging crown. Navigation and foreground geometry share the authored definitions in `web/src/scenery-lindenhafen.ts` and `web/src/scenery-regions.ts`. Continuous segment collision prevents narrow bases being crossed between two keyboard or joystick frames.

`web/src/world-scenery.ts` creates one tightly packed atlas for the active region. Texture drawing and upload happen once on map entry. Movement only changes character depth and culls foreground sprites outside the viewport; there is no per-character pixel mask or per-frame texture upload. Travel destroys foreground sprites before releasing their atlas, so visiting all three towns does not retain three extra GPU atlases. The same foreground sprites work with Phaser's WebGL and Canvas rendering paths.

The outlines describe static occlusion. Moving a whole painted tree or door would additionally require a clean background plate and separate authored moving artwork, as described in [World animation](world-animation.md).

## Verification

The three maps have 87 foreground pieces: 35 in Lindenhafen, 23 in Waldruh and 29 in Nebelstadt. Long inclined bridge rails are split into short pieces with local depth anchors. Atlas tests keep each active region within 1024 × 2048 pixels, check that crops do not overlap, and verify one texture upload, whole-silhouette culling and texture release after sprite destruction.

All 120 frontend tests, TypeScript and the production build pass. Navigation regressions check the screenshot's lamp and cypress bases, clear pavement behind the canopies, regional lamp detours, narrow-base movement between frames, every story-character/object approach and all nine resident loops.

Browser checks covered the screenshot area behind scenery and after walking around its base, all three maps, 390 × 844 portrait and 844 × 390 landscape. The phone layouts had no horizontal overflow; visible exploration controls met the 44-pixel touch target. Map travel produced no console warnings or errors. Captures show [behind the foliage](screenshots/world-occlusion-desktop.jpg), [in front of the base](screenshots/world-occlusion-front.jpg), [phone portrait](screenshots/world-occlusion-mobile.jpg) and [phone landscape](screenshots/world-occlusion-landscape.jpg).
