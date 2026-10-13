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

During a geometry content pass, `--preserve-house-geometry` leaves existing inn,
bakery and grocery manifest entries untouched while refreshing the other assets.
This prevents a parallel art export from replacing reviewed doorway metadata.
