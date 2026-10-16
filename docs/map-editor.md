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

To try the editor without a server or an admin account, run `npx vite web` and open `/qa/map-editor.html`. It edits the seed world in memory; add `?latency=300` to simulate a slow connection.

## Modular railway station

The **Add** catalogue offers separate pieces in every town:

- **Station**: ticket hall, office and waiting room, and open platform canopy.
- **Train**: steam locomotive and passenger carriage.
- **Rails**: straight railway track, with transparent gaps between sleepers.

Duplicate canopy and track pieces to extend a station; duplicate carriages to lengthen a train. All pieces support the usual position, width, flip and duplicate controls. Flip an entire selection together for the opposite diagonal. Track pieces draw on the ground below trains and walkers, and are walkable. The open canopy is walkable; the two buildings and the rolling stock have authored solid bases. The ticket hall and office can host rooms.

At the default track width of 310, place the next track approximately 266 units right and 188 units up, then nudge the join if needed. For another width, multiply both offsets by width / 310. Canopies at width 310 extend approximately 192 units right and 143 units up. These are manual painted-piece joins, not automatic rail snapping. Both diagonals are available by flipping.

The existing combined station remains available. Adding this kit does not resize, replace or move any published scenery. Art sources and exact built-in ImageGen prompts are in `art/source/terrain-objects/requests.json` and `docs/prompts/terrain-objects/`; export them with `node scripts/prepare-terrain-objects.mjs`.

## In-game edit mode

The in-game admin edit mode has an **Add objects** catalogue. Choose an object group (for example, house or tree), choose a pictured version, then click in the town to place it. **Cancel placement** or Escape cancels. Admin → Map editor has its own layout, described below.

Select a placed scenery object to change its **Version** in the inspector. Compatible versions are grouped together; buildings with rooms only offer versions that can keep the room. A swap preserves the object ID, position, flip, room and resident activity links, updates the artwork and footprint, and adjusts width only when needed to fit the new artwork's size limits. Existing placement and route checks still apply. **Undo** restores the prior artwork and collision data. Changes publish immediately, like other map edits.

## Ground

The **Terrain** mode paints the ground. Choose a material and drag: the soft brush blends it into what is
there, and going over a spot again covers it fully. **Erase** paints the town's first material back. The size
and strength sliders and the [ and ] keys set the brush. Water and cliff stop walkers where they cover most of
the ground. A town uses at most six materials; the panel lists them, and painting one over completely frees its
place. Each stroke publishes as one edit, which Undo takes back.

Bridges and compass inlays are **pieces**: pick one and click to place it, select a placed piece to move, resize,
reorder or delete it. A bridge's deck opens a crossing over water; its masonry stays solid.

**Preview ground file** loads a town's ground from a file (a ground object, a scene or a pulled world) for review
before **Publish ground**. Buildings, objects and residents keep their positions. See
[scene authoring](scene-authoring.md#ground) for the model.
