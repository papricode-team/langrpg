# Placed scenery and character depth

The three regions combine clean terrain plates with 276 independently placed transparent objects: 96 in Lindenhafen, 88 in Waldruh and 92 in Nebelstadt. Each region has 32 authored silhouettes, each with separate calm day and night sets of six painted frames. `web/src/placed-<region>.ts` defines physical roles, selected silhouettes, foot anchors and widths.

Characters sort by their feet. Props use their fixed ground anchor and default to `y+10.5`, just above the character depth at the same foot line. A character behind a tree, lamp or building draws beneath its transparent artwork; walking in front of the base brings the character forward. Natural sprite alpha preserves gaps between branches, under benches and through arches in every animation frame.

Solid objects derive collision bases from those same definitions through `placedSceneryFootprints`: building foundations, market counters, fountain rims, trunks, lamps, planters, benches and signs. Arches have two solid posts and an open passage. Boats do not block land routes. Animated crowns, flags and steam do not enlarge the ground footprint. Continuous segment checks prevent small bases being crossed between movement frames.

`WorldScenery` uses ordinary upright Phaser sprites. Each sequence has common bounds and a shared pivot; animation changes the painted atlas frame while position, scale and orientation remain fixed. No mesh can reverse the texture's vertical coordinates. Whole-object bounds govern culling, including roof and canopy margins. Travel and time changes replace instances. Desktop caches loaded pages, while small screens release inactive region and period textures and reload them on revisit.

The export scripts preserve native alpha and use rectangular crops. They do not cut scenery out of terrain at runtime or reconstruct occlusion masks. Navigation checks cover small-base detours, story-character and object approaches, continuous movement and all resident routes. Renderer tests cover upright transforms, frame dimensions, animation, culling, reduced motion and cleanup.
