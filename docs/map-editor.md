# Map editor

## Admin → Map editor

The admin map editor edits the published world. Every change shows on the canvas at once and is saved in the background; the status beside Undo and Redo says **Saving…** while edits are on their way. The server still checks every edit, including routes from the arrival point. If it refuses one, the edit is taken back out, a message explains why, and **Show** selects the objects involved.

Layout:

- **Top bar**: town, mode (**Objects**, **Terrain**, **Residents**, **Story**), Undo and Redo, save status, **View** (story-marker names, object footprints, walking areas and walls, grid, snapping) and **File** (export or import a world file).
- **Left**: **Add** lists every object the town can use, with a search box and group filters. Click one, then click in the town to place it; Shift-click places another. **Layers** lists everything in the town by group; click to select and zoom to it, Shift-click to add to the selection.
- **Canvas**: click to select, Shift-click to add, drag on empty ground to select everything in a box. Drag any selected object to move the whole selection. Two-finger scroll pans, pinch or Ctrl/⌘-scroll zooms, a mouse wheel zooms, and Space-drag or right-drag pans.
- **Right**: the inspector for the selection (position, size, flip, solid, room, version, duplicate, remove), or a town overview with **Check now** when nothing is selected.

Press **?** in the editor for every keyboard shortcut. The most used: arrows nudge (Shift for 10), ⌘/Ctrl+D duplicates, ⌘/Ctrl+C and V copy and paste at the pointer, Delete removes, X flips, [ and ] resize, F zooms to the selection, 0 fits the town, G turns grid snapping on and off, ⌘/Ctrl+Z and ⌘/Ctrl+Shift+Z undo and redo.

Undo and Redo are per admin and cover the last 100 edits, including terrain and resident schedules. An object stays locked to the admin who has it selected (up to 12 objects at a time); other admins see it outlined in red with that admin's name.

To try the editor without a server or an admin account, run `npx vite web` and open `/qa/map-editor.html`. It edits the checked-in world in memory; add `?latency=300` to simulate a slow connection.

## In-game edit mode

The in-game admin edit mode has an **Add objects** catalogue. Choose an object group (for example, house or tree), choose a pictured version, then click in the town to place it. **Cancel placement** or Escape cancels. Admin → Map editor has its own layout, described below.

Select a placed scenery object to change its **Version** in the inspector. Compatible versions are grouped together; buildings with rooms only offer versions that can keep the room. A swap preserves the object ID, position, flip, room and resident activity links, updates the artwork and footprint, and adjusts width only when needed to fit the new artwork's size limits. Existing placement and route checks still apply. **Undo** restores the prior artwork and collision data. Changes publish immediately, like other map edits.

The three story towns use `web/src/data/world-navigation.json` for their foot-level walkable polygons, solid obstacles, spawn and existing NPC/object positions. The browser navigation grid reads this file directly. Painted object footprints remain additional collision; roofs and canopies are visual scenery.

Run `node scripts/map-editor.mjs export lindenhafen docs/maps/lindenhafen.tmj` and open the result in Tiled. The painting is a reference image. Edit polygons in **Walkable**, solid polygons/rectangles/ellipses in **Obstacles**, and foot positions in **Spawn**, **NPCs** and **Objects**. Keep the existing point's `key` property: it links to authored dialogue or object content. New characters and object text still need authored content before they can be placed.

Run `node scripts/map-editor.mjs import docs/maps/lindenhafen.tmj` to apply the edited data. Import checks the schema, bounds, polygon area, crossings, registered content IDs and an actual path from the spawn to every interaction approach. An invalid or unreachable edit leaves the source untouched. `node scripts/map-editor.mjs check` validates all three towns without changing them.

The current painting size is 1536 × 1024 pixels. Expanding a town into multiple plates requires extending the runtime grid and camera bounds first. Door, story and timetable conditions remain in the dialogue/world systems; the current editor authors physical routes and placements.

`npm run assets` validates the canonical maps before exporting server interaction positions. `npm run maps:check` runs that geometry check on its own; `npm run test:tooling` checks Tiled roundtrips and verifies that invalid imports leave the source file unchanged.
