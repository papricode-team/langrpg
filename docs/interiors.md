# Enterable learning spaces

The café, bakery, and supermarket use their own painted room architecture, stable indoor furniture, animated detail layers, collision geometry, people, and learning encounters. Outdoor scenery is hidden immediately on entry. Leaving restores the outdoor position.

## Rooms

- **Marta’s café:** an L-shaped floor with a window seating nook, marble coffee bar, pastry display, tables, and quiet reading furniture.
- **The bakery:** a front retail room and a rear kitchen joined through a doorway in a low brick partition. The oven, mixer, preparation bench, and bread display have separate footprints.
- **The supermarket:** a larger tiled shop with a wooden stockroom, doorway, grocery aisles, refrigerated goods, checkout, and entry vestibule.

The floor polygons and partition barriers follow the exported paintings. Furniture has solid footprints independent of steam, reflections, and tall silhouettes. Each room has two residents and four reachable learning stations.

Indoor adults use a common **132-pixel visible body height**. Player/NPC atlas padding is excluded from the scale calculation; entering and leaving restores the appropriate indoor/outdoor size and label position. This makes people fit the architectural windows, partition, and doorways. Cups, kitchen tools, trays, bread racks, and the coat stand are sized against that same adult reference. Smaller rack/stand footprints follow their new floor contact areas.

## Playing

Use the atlas or places guide to walk to a building door, or approach a door and press **E**. Inside, click a highlighted object or person, or approach and press **E**. The location chip’s **Leave** button and the floor exit return to town. Arrow keys/WASD and click-to-walk remain available.

Each station offers vocabulary with German articles and plurals, optional speech playback, and a focused three-question session. Answers use the existing server grading and XP flow. A café order game is available at the café counter; the bakery hosts a hot-drink order while the bread bakes; the supermarket hosts basket, payment, and change practice. Indoor practice does not skip story objectives.

Players in the same building and region can see one another and move together. Indoor movement uses room coordinates, while each player's outdoor return position stays separate. Players outside, in another building, or in another region stay out of the room view. Reconnecting restores the current building and indoor position; leaving restores the saved outdoor position. Town chat remains shared across the region.

## Art and reproduction

All new paintings and sprite sheets were generated with the **built-in ImageGen tool**. Source PNGs and the exact companion `*-prompt.txt` prompt set are saved in [`art/source/interiors`](../art/source/interiors/). The selected room paintings are the `interior-*-room-v2.png` files; earlier rectangular paintings are retained as unused source variants.

Five original sheets contain **30 indoor object types and 120 authored poses**: café equipment, bakery equipment, supermarket goods, decor, and indoor furniture. Rooms contain 45 furniture/object placements in total. Their generated poses vary slightly in rigid geometry, so the renderer always uses the first pose for furniture and indoor residents. This keeps counters, goods, silhouettes, and floor contact points steady.

The ImageGen source `interior-effects.png` adds **eight transparent detail frames**: four steam curls and four flame states. These overlays attach to fixed emitter points above the espresso machine, kettle, candle, bread racks, pastry tray, and oven. Neighboring frames blend at 2.5 fps, with independent phases. Reduced motion freezes the frames and their blend. The floor exit caption sits below its marker, clear of the player's feet.

`interior-proportioned.png` provides six new ImageGen stills: bakery counter, café table/chairs, pastry display, supermarket checkout, oven, and weighing station. Their broad, low fixtures and smaller goods replace the exaggerated original poses. `interior-stills.json` selects these overrides in both rendering and prop hit targets. Legacy poses remain available as fallback assets. The pastry tray and café cups sit on the corrected tabletop surfaces.

From the repository root, run:

```sh
node scripts/prepare-interior-art.mjs
```

The exporter preserves native alpha, uses inspected transparent row boundaries, and shares each animation’s crop and pivot across all four frames. It writes five furniture WebP atlases and their JSON metadata, `interior-animations.json`, and three room WebPs to [`web/public/assets`](../web/public/assets/). It also runs `scripts/prepare-interior-effects.mjs` (detail atlas and animation metadata) and `scripts/prepare-interior-stills.mjs` (corrected fixture atlas and override metadata). Either exporter can run directly when only reproducing the new assets.

## Implementation and verification

- `web/src/interiors.ts`: room architecture, furniture, entrances, navigation, vocabulary, and encounters.
- `web/src/world-interior.ts`: fixed furniture and blended detail renderer, with shared culling and cleanup.
- `web/src/world.ts`: entry/exit, indoor navigation, residents, interactions, and room-scoped multiplayer rendering.
- `web/src/api.ts`, `server/world_interiors.go`: confirmed building transitions, tagged movement, outdoor return positions, and reconnect recovery.
- `web/src/main.ts`, `interiors.css`, and `activities.ts`: room HUD, learning panels, and venue-specific games.
- `web/src/interiors.test.ts`: doorway/furniture geometry, station/resident/exit reachability, exercise references, and transparent furniture/detail atlases.
- `web/src/world-interior.test.ts`: unchanged furniture pixels/anchors across animation cycles, smooth detail blending, reduced motion, culling, and cleanup.
- `web/qa/world-assets.html`: development-only room selection and walk/interact controls for visual inspection.

Check types and build with `npm run build --workspace web`. Run the room checks with `npm test --workspace web -- src/interiors.test.ts`.

The production build and all 143 web tests passed during implementation. Browser checks covered all three painted rooms and door entries, café object selection, a complete three-expression session with server grading, a served café game order, room exit, the supermarket checkout encounter, and a 390 × 844 bakery interaction panel. Visual records are saved under [`docs/screenshots/interiors`](screenshots/interiors/).

The rendering/proportion repair passed type checking, all **154 web tests**, and the production build. Browser inspection covered all three rooms, walking beside the bakery counter, leaving through the floor portal, and restored outdoor character sizing. Two idle screenshots taken well apart had identical pixels in the checkout cabinet and resident body regions. Updated room captures are `rendering-repair-bakery.jpg`, `rendering-repair-cafe.jpg`, and `rendering-repair-supermarket.jpg` in the same screenshot directory.
