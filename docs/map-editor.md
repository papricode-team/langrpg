The three story towns use `web/src/data/world-navigation.json` for their foot-level walkable polygons, solid obstacles, spawn and existing NPC/object positions. The browser navigation grid reads this file directly. Painted object footprints remain additional collision; roofs and canopies are visual scenery.

Run `node scripts/map-editor.mjs export lindenhafen docs/maps/lindenhafen.tmj` and open the result in Tiled. The painting is a reference image. Edit polygons in **Walkable**, solid polygons/rectangles/ellipses in **Obstacles**, and foot positions in **Spawn**, **NPCs** and **Objects**. Keep the existing point's `key` property: it links to authored dialogue or object content. New characters and object text still need authored content before they can be placed.

Run `node scripts/map-editor.mjs import docs/maps/lindenhafen.tmj` to apply the edited data. Import checks the schema, bounds, polygon area, crossings, registered content IDs and an actual path from the spawn to every interaction approach. An invalid or unreachable edit leaves the source untouched. `node scripts/map-editor.mjs check` validates all three towns without changing them.

The current painting size is 1536 × 1024 pixels. Expanding a town into multiple plates requires extending the runtime grid and camera bounds first. Door, story and timetable conditions remain in the dialogue/world systems; the current editor authors physical routes and placements.

`npm run assets` validates the canonical maps before exporting server interaction positions. `npm run maps:check` runs that geometry check on its own; `npm run test:tooling` checks Tiled roundtrips and verifies that invalid imports leave the source file unchanged.
