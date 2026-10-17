# variety — Lindenhafen visual pass 4

2026-10-17. Read the repository instructions, fixed art direction and target
painting, and the town-2 / terrain handovers before authoring. There is no
`terrain-2.md` in this checkout; `terrain.md` is the available terrain handover.
The seed is the source of truth. No live-world operation, git command, dependency
install, repository-wide generator, browser or server launch was performed.

## Result and preservation

Added **two paving materials and three native HD tree species**. Lindenhafen
retains all **241 placements / 27 buildings** and every original placement ID.
Fan cobble fills streets/lanes; herringbone marks frontages and courts. Limestone
remains around the fountain, archive, station arrival and library formal courts.
The fountain's radial inlay remains exactly as authored.

The six layers are now `meadow`, `moss`, `deep-water`, `town-fan-cobble`,
`town-herringbone`, `limestone`. The old `cobble` (5.31% of the town) and
`town-cobble` (15.32%) slots were replaced to respect `MAX_GROUND_LAYERS=6`.
Their shared catalogue entries/assets remain available to other towns.

| Material | Before town coverage | After town coverage |
| --- | ---: | ---: |
| Limestone | 66.16% | 5.76% |
| Fan cobble | — | 50.91% |
| Herringbone | — | 30.12% |
| Meadow | 4.79% | 4.79% |
| Moss | 0.78% | 0.78% |
| Canal | 7.64% | 7.64% |

Paving remains **93.97% of dry land**, exactly the previous total. The retained
zone recipe uses `shapeGround` to produce a three-way paving mask, then
redistributes only the sum of the old three paving layers. Integer remainders
go to the strongest mask so every sample still sums to 255. Every meadow, moss
and canal weight byte is unchanged; all ground features/bridges are unchanged.

All 43 existing tree locations and widths are retained: **10 linden, 10 plane,
9 horse chestnut, 10 silver birch, 4 copper beech**. Four spaced beeches provide
warm accents. A proximity-aware assignment balances the greens; every tree's
nearest neighbour differs in species. All seed trees explicitly use
`motion: 'still'`; the three new catalogue requests also use `still`.

The before/after audit confirms every non-ground/non-scenery scene field,
every non-tree scenery object, and every tree field except frame/motion is
unchanged. Thus NPC/story feet, evidence, doors, interior links/layouts, resident
homes/schedules/routes, activities, quest anchors and building owners remain
intact. Other towns are unchanged. The MCP-equivalent offline town audit returns
`problems: []`; the compiler also validates resident routines and full-footprint
interaction reachability.

## Art, provenance and files

Built-in ImageGen created five selected **1254 × 1254** masters. Each generation
attached `docs/style/references/target-art-direction.webp` plus the existing
limestone/cobble or linden/plane paintings. The material references govern the
straight-down repeat plane; upright trees use the matching 60-degree overhead
three-quarter view. All retain fine painted surfaces and upper-left local light.
Every result, runtime repeat sheet and offline comparison was inspected with
the image viewer. All five were selected; no off-style candidate was retained.
No generated source pixels were resampled or repainted in export.

- `art/source/terrain-materials/town-{fan-cobble,herringbone}.png` and sibling
  `*-prompt.txt`: selected native masters and exact tool prompts.
- `art/source/terrain-materials/{manifest.json,variety-pass-4.json,variety-layout.json,README.md}`:
  catalogue requests, generation/reference provenance and retained zone shapes.
  Both new materials repeat over **144 world units**, against a 72-unit adult;
  individual small stones/bricks read at walking scale. Their periodic runtime
  exports are 1152 × 1152.
- `art/source/terrain-objects/town-{chestnut,birch,beech}.png` and sibling
  `*-prompt.txt`, `requests.json`, `variety-pass-4.json`, `README.md`: selected
  cutouts, exact prompts, provenance and authored physical bases. Each uses the
  linden's **158.72 world width**, the exact same eight-point trunk-only footprint,
  and the existing root-bottom pivot convention. All have clear alpha boundaries.
- `web/public/assets/terrain-{materials,objects}/town-*` additions: five runtime
  textures plus five thumbnails. New material textures are **1,572,928 /
  1,374,942 bytes**; chestnut/birch/beech are **1,848,420 / 1,899,244 /
  1,745,628 bytes**. All below the unchanged 2,000,000-byte limit.
- `web/src/data/terrain-{materials,objects}.json`: isolated generated additions;
  existing catalogue rows retained. `web/src/terrain-materials.ts`: plan palette
  entries for the two new paving materials. No terrain-objects runtime API change
  was necessary.
- `scripts/prepare-terrain-materials.mjs`: selected `--only` exports now append
  newly introduced IDs as well as replacing existing selected rows.
- `scripts/prepare-terrain-objects.mjs`: equivalent `--only` support, retaining
  unselected catalogue rows and avoiding regeneration of unrelated runtime art.
- `scripts/prepare-terrain-variety.mjs`: reproducible Lindenhafen-only zoning and
  species assignment from an explicit original seed supplied with `--before`.
  Refuses baselines without the original paving IDs. It reproduced the reviewed
  seed byte-for-byte in a SHA-256 comparison.
- `scripts/check-terrain-variety.mjs`: offline plans/composites, repeats/species
  sheet, alpha/budget checks, MCP `audit_town` checks and optional baseline
  preservation audit. No live MCP/backend connection is required.
- `content/world-seed.json`: Lindenhafen ground and tree frame/motion only.
- Tests: `web/src/{terrain-objects,placed-scenery,world-edit,world-edit-overlay,world-edit-transport}.test.ts`.
  Count/set/order expectations deliberately reflect the expanded catalogue.
  New species retain exact trunk footprints and still placement motion; nearest
  tree neighbours differ. The transport test paints `town-fan-cobble` instead of
  the removed seed layer `cobble`, preserving its transport/undo assertions.
- Reports: `docs/audits/terrain-variety-{material-seams,objects,features,town}.json`
  and `docs/audits/visual-style/variety-after-{art-check,seed-audit}.json`.

Existing `.gitattributes` patterns already cover both families' new PNG masters;
no shared-file change was required. No interior, scene renderer, CSS or character
file was edited.

## Offline visual evidence

- [Before/after composition](../audits/visual-style/variety-after-comparison.jpg)
- [Before painted quarter](../audits/visual-style/variety-after-before-painted.jpg)
- [After painted quarter](../audits/visual-style/variety-after-painted.jpg)
- [Before plan](../audits/visual-style/variety-after-before-plan.jpg)
- [After plan](../audits/visual-style/variety-after-plan.jpg)
- [Full-town after plan](../audits/visual-style/variety-after-full-plan.jpg)
- [Actual 2 × 2 material repeats](../audits/visual-style/variety-after-repeats.jpg)
- [All five species](../audits/visual-style/variety-after-species.jpg)

These are offline seed composites using actual runtime art, world scales,
placements and bilinearly sampled ground weights. They approximate GPU blending
and foot sorting, and omit live lighting/shadows, generated kerb/canal-wall
geometry, characters, labels and HUD. They are **not live screenshots**.

Reproduce with `node scripts/check-terrain-variety.mjs`; add
`--before /tmp/variety-seed-before.json` for comparisons/preservation checks while
that session baseline exists. Durable JPGs and JSON evidence do not depend on
that temporary file for viewing. The same baseline can be passed to
`node scripts/prepare-terrain-variety.mjs --before /tmp/variety-seed-before.json`
to reproduce the reviewed seed. That authoring command writes Lindenhafen only.

## Commands and results

| Command | Result |
| --- | --- |
| `node scripts/prepare-terrain-materials.mjs --only=town-fan-cobble,town-herringbone` | PASS, 2 exports and new catalogue rows. |
| `node scripts/prepare-terrain-objects.mjs --only=town-chestnut,town-birch,town-beech` | PASS, 3 native alpha exports and catalogue rows. |
| `node scripts/prepare-terrain-variety.mjs --before /tmp/variety-seed-before.json` | PASS, six layers and 43 balanced trees; reproduces reviewed seed byte-for-byte. |
| `node scripts/check-terrain-materials.mjs --report=docs/audits/terrain-variety-material-seams.json` | PASS, all 28 decoded entries have zero opposite-edge difference on both axes. |
| `node scripts/check-terrain-objects.mjs --report=docs/audits/terrain-variety-objects.json` | PASS, 32 native HD transparent objects under 2 MB. |
| `node scripts/check-terrain-features.mjs --report=docs/audits/terrain-variety-features.json` | PASS, 15 native HD features with valid traced decks/walls. |
| `node scripts/check-terrain-variety.mjs --before /tmp/variety-seed-before.json` | PASS, 10 town HD cutouts, clean alpha edges/budgets, preserved seed invariants, zero town-audit problems, offline evidence exported. |
| `cd web && npx vitest run` | Final PASS, **156 files / 1,399 tests**, 14.31 s. |
| `npm run check --workspace web` | PASS, TypeScript and UI type/layout/template budgets; final rerun also passed. |
| `node scripts/scene-compiler.mjs check` | PASS, 3 scenes, version `6957411efd0e79b6`, no warnings. |
| `cd server && go test ./... -run 'World\|Seed\|Registry'` | PASS across all packages. `TEST_DATABASE_URL` is unset, so PostgreSQL-backed tests skip; no database/server was started. |
| `node --test scripts/ground-shapes.test.mjs scripts/scene-compiler.test.mjs scripts/scene-quality.test.mjs` | PASS, 11 tests. |
| `node --check` on the four changed/new prepare/check scripts | PASS. |

The first full Vitest run intentionally caught the old seed-dependent transport
fixture: **155 files / 1,398 tests passed, 1 failed**. Its output was:

```text
FAIL src/world-edit-transport.test.ts > isolated authoring transport
Error: A town can use 6 ground materials. Paint over one of meadow, moss,
deep-water, town-fan-cobble, town-herringbone, limestone completely to free it.
  at paintGround (src/ground.ts:97)
  at inverseEditOps (src/world-edit-ops.ts:310)
  at WorldEditSession.commit (src/world-edit-session.ts:63)
```

The fixture now paints the intentionally selected replacement layer, as described
above. No test, timeout, seam tolerance, alpha requirement or budget was loosened.
Vitest printed the existing experimental localStorage warning without test impact.

## Open integration issues

**Strict no-sway is still a renderer issue outside this agent's files.**
`web/src/world-scenery.ts:118,119,391` applies `sampleTreeSway` to every `tree` or
`cypress` role regardless of `spec.motion === 'still'`; `scenery-animation.ts:52`
limits it to 0.14 degrees. The existing placed-scenery renderer test explicitly
expects that breeze even for still objects. This pass adds no sway/detail motion
and marks all Lindenhafen trees still, but cannot truthfully claim the running
renderer obeys those flags. The renderer owner should gate both initial and
per-frame tree sway on the authored motion and deliberately update its existing
renderer assertions to require zero rotation for still trees. Those production
files are outside the allowed ownership list and were left untouched.

Live rendering review remains with integration: inspect material joins at the
approved camera scale and tree/cast-shadow occlusion on desktop/phone. No seed
content was pushed to a live database. Merge the seed changes with live edits
using the normal guarded world workflow when publishing is authorized elsewhere.
