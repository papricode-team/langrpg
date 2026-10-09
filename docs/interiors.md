# Enterable learning spaces

The café, bakery, and supermarket use their own painted room architecture, animated indoor furniture, collision geometry, people, and learning encounters. Outdoor scenery is hidden immediately on entry. Leaving restores the outdoor position.

## Rooms

- **Marta’s café:** an L-shaped floor with a window seating nook, marble coffee bar, pastry display, tables, and quiet reading furniture.
- **The bakery:** a front retail room and a rear kitchen joined through a doorway in a low brick partition. The oven, mixer, preparation bench, and bread display have separate footprints.
- **The supermarket:** a larger tiled shop with a wooden stockroom, doorway, grocery aisles, refrigerated goods, checkout, and entry vestibule.

The floor polygons and partition barriers follow the exported paintings. Furniture has solid footprints independent of steam, reflections, and tall silhouettes. Each room has two residents and four reachable learning stations.

## Playing

Use the atlas or places guide to walk to a building door, or approach a door and press **E**. Inside, click a highlighted object or person, or approach and press **E**. The location chip’s **Leave** button and the floor exit return to town. Arrow keys/WASD and click-to-walk remain available.

Each station offers vocabulary with German articles and plurals, optional speech playback, and a focused three-question session. Answers use the existing server grading and XP flow. A café order game is available at the café counter; the bakery hosts a hot-drink order while the bread bakes; the supermarket hosts basket, payment, and change practice. Indoor practice does not skip story objectives.

Rooms currently run locally for each player. Outdoor multiplayer state is retained, movement broadcasts pause indoors, and the latest outdoor snapshot is applied when the player leaves.

## Art and reproduction

All new paintings and sprite sheets were generated with the **built-in ImageGen tool**. Source PNGs and the exact companion `*-prompt.txt` prompt set are saved in [`art/source/interiors`](../art/source/interiors/). The selected room paintings are the `interior-*-room-v2.png` files; earlier rectangular paintings are retained as unused source variants.

Five sheets contain **30 indoor object types and 120 authored animation frames**: café equipment, bakery equipment, supermarket goods, decor, and indoor furniture. Rooms contain 45 furniture/object placements in total. Frames animate at a quiet 2–2.5 fps with independently phased loops; reduced motion freezes the authored frames.

From the repository root, run:

```sh
node scripts/prepare-interior-art.mjs
```

The exporter preserves native alpha, uses inspected transparent row boundaries, and shares each animation’s crop and pivot across all four frames. It writes five WebP atlases and their JSON metadata, `interior-animations.json`, and three room WebPs to [`web/public/assets`](../web/public/assets/).

## Implementation and verification

- `web/src/interiors.ts`: room architecture, furniture, entrances, navigation, vocabulary, and encounters.
- `web/src/world-interior.ts`: independently animated, foot-sorted furniture renderer.
- `web/src/world.ts`: entry/exit, indoor navigation, residents, interactions, outdoor visibility, and multiplayer suspension.
- `web/src/main.ts`, `interiors.css`, and `activities.ts`: room HUD, learning panels, and venue-specific games.
- `web/src/interiors.test.ts`: doorway/furniture geometry, station/resident/exit reachability, exercise references, transparent atlases, and distinct animation frames.
- `web/qa/world-assets.html`: development-only room selection and walk/interact controls for visual inspection.

Check types and build with `npm run build --workspace web`. Run the room checks with `npm test --workspace web -- src/interiors.test.ts`.

The production build and all 143 web tests passed during implementation. Browser checks covered all three painted rooms and door entries, café object selection, a complete three-expression session with server grading, a served café game order, room exit, the supermarket checkout encounter, and a 390 × 844 bakery interaction panel. Visual records are saved under [`docs/screenshots/interiors`](screenshots/interiors/).
