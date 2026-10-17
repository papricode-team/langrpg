# Enterable learning spaces

Every building in the three towns has an inside: 42 entrances in the current seed world. Existing café, bakery, supermarket and inn entrances retain their saved identities. Houses, archives, workshops, stations and greenhouses gain their own room instances automatically. Scenery such as trees, stalls, arches and boats does not become a room.

## Room components

Rooms are assembled from repeatable terrain materials, wall sections, window fittings and independent furniture. `web/src/room-kit.ts` uses the same floor polygons as navigation. Joined floor sections share an outside wall; partition gaps remain open doorways. Furniture keeps its own collision footprint and interaction target. Whole-room paintings are retained as activity backdrops, but are no longer loaded to render walkable rooms.

The existing shop layouts retain their furniture, residents, vocabulary and conversations. The inn uses separate bed, writing-desk and bedside-lamp components. Five additional layouts compose shared furniture and game stations:

- Reading rooms: Honest Mirror, Re-ink and Lantern Pairs.
- Workshops: Scrambled Sign, Workbench and Letter Loom.
- Station waiting rooms: Night Train, Departure Board and Sorting Office.
- Greenhouses: Falling Leaves, Seed Packets and Market Baskets.
- Homes: Lantern Pairs, Echo Bells and Re-ink.

Every new layout includes an all-level word game. Existing word, writing and story prerequisites still apply. Game stations use the normal authenticated game-content and grading flow. They do not bypass story progression or include answers in the browser bundle.

`web/src/building-interiors.ts` defines the additional room recipes. `gameStation` places the furniture, footprint, interaction point and game together. The structural recipes contain no learning answers or dialogue. Existing authored learning content remains in `content/source.json` and is hydrated by room type.

## Editing a building’s layout

Select a building in **Admin → Map editor** or the in-world editor, then choose **Edit room layout**. The canvas uses the same floor, wall and furniture artwork as the game. Choose Floor, Wall, Door, Furniture or Game and click to place it; Select / move drags components. The inspector edits positions and dimensions, rotates walls and removes components. Doors attach to walls and cut actual collision openings. Furniture and games have independent placements. Existing story stations and characters can move but cannot be deleted.

Use **Add room** to create and name another room (up to 16 rooms per building). The room picker switches between independent floor shapes, entrances/exits, walls, furniture and games. A new room starts empty and is connected to the current room by a pair of doors. Choose **Room door**, select its destination, and click the canvas to add another connection. Move either endpoint independently, or select a door and choose **Edit destination room** to position its other side. Removing a door removes its matching endpoint; removing a room removes its connections. Saving requires all rooms to connect back to the main room, both ends of every door to be reachable, and at least one game or story station in the building. Connected hallways can stay empty.

Use **Add floor above** or **Add floor below** to create an upstairs or basement landing with paired stairs to the current room. **Building floor** switches levels; the room picker groups all rooms by floor, and **Add room** extends the current level. Each room keeps independent floor shapes, walls, furnishings and games. **Room floor** moves an existing room (the main entrance stays on the ground floor); its connections change together to stairs across floors or doors on the same floor. Choose **Stairs** and a room on another floor to place more connections, then drag either landing independently. The stair artwork and labels show up/down, and travel arrives at the matching landing. Removing the last room on a level removes that level. Existing layouts without a level stay on the ground floor. Buildings retain the 16-room limit across all levels, with floor numbers from −15 to 15.

Use **Duplicate room** to add an independent copy on the current floor, or **Duplicate floor** to copy every room on that level onto a new floor. **Copy room** and **Copy floor** keep a snapshot in this browser; open another building and choose **Paste copied layout** to reuse it there. Room copies join the current floor; floor copies use the next available floor and connect by stairs. Internal doors stay paired within a floor copy, external connections are replaced with connections to the destination, and every component gets a new identity. Shapes, entrance/exit positions, partitions, furniture collision footprints and public games transfer between building types. Story dialogue and characters stay at their original building; copied game stations use the usual authenticated game content. Copying alone does not change the draft; duplication and paste each undo in one step and still require **Save layout**. The 16-room building limit applies before pasting.

Undo/redo works across the whole building draft, including room additions, floor changes, removals and paired doors or stairs. **Save layout** publishes through the existing world editor, with building locks, stale-layout checks, and the editor’s publication history. Cancel discards the draft. Each building stores its own `roomLayout`; other buildings using the same template remain unchanged. Floors are editable polygons: drag a whole floor or its numbered corners, and add or remove corners in the inspector. Multiple overlapping floor shapes join into one continuous floor, with outer walls following their union. Entrance and Exit tools place the travel points; both markers can also be dragged or positioned numerically. The server uses the building’s saved entrance when players enter. The outdoor return remains attached to the owning building. Saving rejects empty, self-crossing or out-of-bounds floor shapes and checks that the entrance and exit stand on clear connected floor, with routes to characters and game/story stations, and requires at least one playable station. Saved layouts also update players already inside; positions trapped by a new wall move to reachable floor.

`room-layout.ts` defines the versioned component data, validates floor polygons and subtracts door gaps from walls. Older saved layouts without floor or travel-point fields retain their template geometry; opening them in the editor creates an editable draft without modifying the published layout. `room-layout-runtime.ts` resolves furniture references and public game IDs into renderable props and interaction targets. No learning text or answers are stored in world layouts. `room-layout-validation.ts` uses the gameplay navigation grid for route checks. A `room` world-edit operation replaces only the owning building’s layout and fingerprints the previous layout to prevent overwriting another admin’s work.

## Building identity and travel

Room type and building identity are separate. A generated instance such as `home--high-street-house` reuses the home layout but has its own multiplayer location and outdoor return point. IDs remain stable when scenery is reordered. Named legacy rooms retain `cafe`, `bakery`, `supermarket` and `inn` for saved-game compatibility.

The scene schema derives entrances for both the browser and the compiled server registry. Registered doors follow the artwork transform. Older buildings without registered door geometry use a step just beyond the front of their footprint. Automatic rooms return to that step, which avoids placing a player farther forward into a canal or another obstacle. The existing world reconciliation recompiles the registry on server startup, including for already saved towns.

Use the places guide, click a building marker or approach and press **E**. Inside, click a station or approach and press **E**. The exit and **Leave** button return to the owning building. Secondary rooms use building-scoped IDs such as `home--high-street-house::study`. Room doors and stairs transfer players to their matching doorway, with the server checking the source door and destination. Each room has separate multiplayer presence. Reconnects and indoor movement preserve the complete room identity; a town exit in any room returns to the owning building.

## Art and reproduction

The furniture sheet was generated with the built-in ImageGen tool. Its native transparent source and exact prompt are `art/source/interiors/room-kit-furniture.png` and `room-kit-furniture-prompt.txt`.

Run `node scripts/prepare-room-kit.mjs` to reproduce the compact WebP and frame metadata. This exporter also runs in `npm run assets -- --art`. It preserves native alpha and exports cell bounds for the bed, desk, lamp and window. Existing furniture and animated steam/flames continue to use their current atlases.

## Verification

- `web/src/room-layout.test.ts`: floor assignments, stair validation and direction, paired room graphs, independent nested layouts, custom floor geometry, movable travel points, legacy-layout compatibility, door collision, placement validation, story preservation, building isolation, game resolution, stale edits and undo.
- `web/src/room-kit.test.ts`: joined components, moving floor/wall geometry, stable building identities and game references.
- `web/src/interiors.test.ts`: entrance and return reachability for every building; room station, resident and exit navigation.
- `web/src/world-interior.test.ts`: stable furniture, detail animation, reduced motion, culling and cleanup.
- `server/internal/world/world_test.go`: paired-door and stair travel, floor validation and invalid-connection rejection, separate building instances, custom arrival points and restore fallbacks, correct return points and rejection of unpublished rooms.
- `web/qa/room-editor.html`: local room editing, save and reopen without changing the published world.
- `web/qa/room-kit.html`: all nine room layouts in the real Phaser renderer. Local screenshots belong in `output/ui-screenshots`.

Run `npm run verify` for the complete repository checks.

The same room, floor, component, copy and connection operations are available through the world MCP server: `list_buildings`, `get_building`, `list_room_catalogue`, `edit_building`, `copy_building_layout`, `audit_building`, `render_room` and `view_room`. See [MCP room authoring](world-agents.md#rooms-and-floors) for the draft workflow and action examples.
