# Terrain-only review

Reviewed on 2026-10-13: **21 active terrain chunks in both day and night
(42 paintings), plus all nine map/manifest loading fallback plates, including the two
harbour bridge plates.** None
contains baked buildings, tree silhouettes, benches, lamps, stalls or other
scenery. Ground texture, water, bridges, stairs, embankments and retaining walls
remain terrain. Map cards and previews intentionally show the separately
rendered scenery; they are compositions, not gameplay terrain textures.

The review used contact sheets from the actual registered runtime crops and
overviews, not the source prompts alone. Crop dimensions confirm four runtime
texture pixels per world unit. Nebelstadt's two new harbour chunks additionally
have four native source pixels per world unit, with 16 registered day/night
source quadrants and matching overviews. Detailed textures retain GPU-safe
guard crops and stay below 2 MiB each.

The final bridge join follows existing painted paving. Its short visible stone
spur opens into the harbour street; the former rectangle across open water was
removed. The replacement connector reaches every walkable sample from spawn
and keeps the sea sample `(1260,350)` blocked.

Machine-readable evidence is in [terrain-only-review.json](terrain-only-review.json).
The nine durable contact sheets are mechanically encoded from the reviewed PNGs,
with their original dimensions and no changes to the source paintings:

- Lindenhafen: [day](map-quality/terrain-lindenhafen-day-sheet.jpg), [night](map-quality/terrain-lindenhafen-night-sheet.jpg).
- Waldruh: [day](map-quality/terrain-waldruh-day-sheet.jpg), [night](map-quality/terrain-waldruh-night-sheet.jpg).
- Nebelstadt: [day](map-quality/terrain-nebelstadt-day-sheet.jpg), [night](map-quality/terrain-nebelstadt-night-sheet.jpg).
- [Map and manifest fallback plates](map-quality/terrain-legacy-and-manifest-terrain-sheet.jpg).
- [Native harbour chunks](map-quality/terrain-nebelstadt-harbour-final-sheet.jpg).
- [Final harbour bridge](map-quality/terrain-nebelstadt-harbour-bridge-final-sheet.jpg).

Every proof is below 2 MiB. Original contact sheets remain in `output/terrain-review/`.
Native harbour source dimensions, exact generation prompts and selected source
paths are preserved under `art/source/terrain-expansion/nebelstadt/`; both
exporters are reproducible.
