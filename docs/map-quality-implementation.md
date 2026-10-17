# Map quality implementation

The playable world now contains three authored towns. Lindenhafen is 2304 ×
1536 units across nine chunks; Waldruh and Nebelstadt are each 2304 × 1024 across
six chunks. Compact Lindenhafen preserves all 43 original activities and adds
four core activities. Retired scenes and unused terrain remain in the
[archive](archive/README.md); expedition games and encounters remain available
through Activities.

Native transparent [source artwork](../art/source/map-quality/README.md) replaces
soft props and cottage variations, with distinct inn, bakery and grocery façades.
[Exact generation prompts](../art/source/map-quality/generation-prompts.json) and
the three [town style bibles](style/) record the design. Exports retain source
pixels, crop provenance and power-of-two atlases where supported. Shared daylight
bases receive a night tint. Door, footprint and sort-line metadata follow the
painted foundations; entrances use door sills and reachable return positions.

Navigation uses an eight-unit grid, four-unit border and exact segment collision.
Authored one-pixel-per-unit ground masks under `art/source/terrain-detail/`
record painted paving, stairs and bridges while excluding water and cliff faces;
their exports preserve exact pixels and vector authoring remains in scene data.
The compiler enforces scale, native resolution, chunk density, door ownership
and sampled reachability. Scenery and characters use integer depth bands;
occluding scenery lightens as a whole under a shimmering player silhouette. The navigation
overlay exposes polygons, footprints, nodes and routes for review.

Gameplay terrain contains ground, water, bridges, stairs and retaining walls;
upright scenery is rendered separately. Cards intentionally compose both layers.
The [terrain review](audits/terrain-only-review.md) documents that contract.
Review images cover [foundations](audits/map-quality/foundations.jpg),
[entrances](audits/map-quality/entrances.jpg),
[navigation](audits/map-quality/navigation.jpg) and
[cutouts](audits/map-quality/cutout.jpg). Current
[map-quality](audits/map-quality-current.json) and
[living-world](audits/living-world-current.json) audits retain measured evidence.

Final validation for scene version `908d52eb1074fdc3` found **zero unreachable
samples across 111,292 walkable points**. All 824 web tests, 86 tooling tests,
server tests, Tiled checks, type checks, lint, production build and distribution
budgets passed.

Run these checks from the repository root; the latter two include exact runtime
navigation sampling:

```sh
node scripts/scene-compiler.mjs check
node scripts/prepare-terrain-detail.mjs --walkable-masks
npm run maps:check
node docs/audits/map-scale-audit.mjs .
node docs/audits/measure-living-world-baseline.mjs . /tmp/current-area.json --check-expansion
```
