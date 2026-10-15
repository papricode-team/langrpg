# Shared native map-quality paintings

These sources provide one consistent perspective, light direction and material
palette for Lindenhafen, Waldruh and Nebelstadt. The design references are the
three bibles in `docs/style`. Exact generation prompts, when available, are saved
beside each selected PNG as `<name>-prompt.txt`.

`props.png` is a transparent 1254 × 1254 source with four registered cells:
tree `(0,0)–(715,704)`, cypress `(715,0)–(1254,704)`, market stall
`(0,704)–(715,1254)` and fountain `(715,704)–(1254,1254)`. The asymmetric
boundaries lie between complete paintings; they are not a resampling grid.

`inn.png`, `bakery.png` and `grocery.png` are individual transparent paintings.
Each shop has a visible human-sized doorway on its front façade. A sidecar JSON
may contain `referenceWidth`, `footprint`, `sortLine`, `door`, `originX` and
`originY`; geometry coordinates are relative to the cropped painting's foot
anchor. A sheet sidecar may use an `assets` dictionary keyed by the exported
frame names.

```sh
node scripts/prepare-map-quality-art.mjs
```

The exporter crops native pixels into shared power-of-two atlases (at most
2048 × 2048, so Phaser can generate mipmaps) and records
actual source dimensions and crop rectangles. It never upscales, warps or
removes a source background. All three towns' day and night manifests reference
the same native bases; a `nightTint` value cools only these daylight paintings in
the night renderer. Old tree and stall variant names remain manifest aliases, so
scenery placements keep stable IDs. Tree sway remains a runtime transform.

Run this exporter after the legacy art exporters (`npm run assets -- --art`
does so). The original static-building exporter also copies optional geometry
sidecars from `art/source/buildings/<source>.json`, preserving authored door and
footprint metadata when a source is rebuilt. Scene collision metadata is reviewed
separately in `web/src/data/scenery-geometry.json`.

`misc.png` contains the shared lamp, bench, hanging sign and planter. Its source
objects have different bounding boxes, so the export uses explicit registrations.
The lamp's base and the sign's cap overlap vertically but occupy separate native
pixels. The sign is assembled from two rectangular source windows at their
original positions; the recorded `windows` metadata makes this registration
reproducible. No sign pixels are rescaled or redrawn.

The native boat comes from the original available `art/source/waldruh-props.png`.
Its complete lantern extends beyond the nominal fourth-row first-column grid;
the exporter uses the verified `(0,950)–(350,1254)` cell and records the exact
303 × 178 crop. A 50.4-unit painted height provides at least 3.5 source pixels per
world unit without inventing detail.

Arch bases share the native Lindenhafen 644 × 566 export, and greenhouses share
Waldruh's 1211 × 1228 base. The manifest aliases reference the existing encoded
textures directly, preserving source detail and avoiding historical LFS fetches.
They reuse the daylight base with the same runtime night tint as the new props.

Building ground contact is rendered separately by `web/src/world-foundations.ts`.
It traces the lower opaque edge of each actual building frame for the feathered
multiply contact shadow and soil/moss wear. Placed footprints guide the trace to
exclude roofs and other raised details; they are also the fallback when a frame
cannot be sampled. Collision polygons often sit inside the painted stones and
must not be treated as their visible contact edge. A narrow material band is
masked to the building's alpha and uses the exact wall-strip depths, darkening
the lowest stones without covering people standing in front. Ground marks stay
below characters and architecture. Matching frames with identical dressing share
textures; they follow ambient light and fades and release with the last instance.
The regional daylight bounce colours come from `docs/style`, rather than sampling
terrain tiles that may not yet be resident. Use **Ground contact** on
`/qa/world-assets.html` for an in-place comparison in each region and period.
The **Inspect scenery ground contact** selector visits every placed object in the
selected town, grouped by buildings, trees and prop types.
Use `?map=waldruh&building=waldruh-clockmill` to open a particular base directly. The same
renderer applies contact to every building asset, including custom frame names,
mirrored instances and non-collidable decorative placements.

`web/src/foundation-dressing.ts` adds irregular earth washes, moss flecks and a
few curved grass tufts to each traced base. Ground colour and vegetation density
come from compact daylight samples of the actual terrain under each contact
point, not the building palette. Paving gets fewer tufts than planted ground;
water and authored door approaches suppress growth. Arrangement is seeded by
placement ID, so repeated houses differ without flickering. Soil stays on the
ground; moss and grass use normal blending at each wall strip's depth, allowing
them to cross the stone edge while characters in front remain unobscured.

After repainting terrain, run `node scripts/foundation-terrain.mjs` to refresh
`web/src/data/foundation-terrain.json`. It samples the registered daytime terrain
overviews (or the day crop when no overview exists), so dressing stays consistent
when GPU tiles stream out or the night art loads. Unknown terrain assets use a
restrained neutral fallback until sampled. A four-frame atlas per dressed base
is bounded to 512 pixels per frame dimension; the current largest town uses about
30 MiB for all 34 building contact atlases together.

Other scenery uses `web/src/world-scenery-contact.ts`, with alpha contours that
locate trunks, separate bench feet, post plinths, planter bottoms and boat hulls.
Broadleaf trees get a soft broken canopy shadow, a tighter root shadow, soil and
fallen leaves. Conifers use a narrower shadow and needle litter. Moss and a few
grass blades cross the root edge where the sampled terrain supports vegetation.
Posts, benches and stalls use close contact shadows and restrained dust; planters
spill a little soil, while fountains have damp staining and moss around the base.
Boats use a hull shadow and incomplete waterline ripples only on sampled water.
Organic dressing is suppressed on water, and all colours follow ambient light.

Root marks remain anchored while trees sway. Foreground collars use the same
depth as the object, and all contacts follow editor drags, rebuild after edits,
cull, fade and release with their owning scenery. Seeded material variants share
bounded atlases (at most 192 × 96 pixels per layer); the 175 non-building objects
in Lindenhafen currently add about 18.5 MiB of texture memory. Use
`?map=lindenhafen&scenery=rose-garden-south-tree` to inspect a tree base.

Future building repaints may include a thin, neutral contact band at the lowest
foundation stones: crevice occlusion, a few grass blades or soil crumbs fading
to transparent. Keep the reviewed crop, pivot, footprint and doorway unchanged;
do not add a floor plane, opaque apron or detached cast shadow. Review the source
sidecar and export registration if any visible bounds change. Runtime shadows
already supply broad contact, so the painted band should stay restrained.

During a geometry content pass, `--preserve-house-geometry` leaves existing inn,
bakery and grocery manifest entries untouched while refreshing the other assets.
This prevents a parallel art export from replacing reviewed doorway metadata.
