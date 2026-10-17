# town — visual pass 2

Completed 2026-10-17 against the fixed [art direction](../style/art-direction.md).
The target image was inspected at native size and enlarged around the café,
fountain, market and botanist garden. Character proportions, the brass/leather
UI kit and camera decisions were retained; no scene, camera, CSS, HUD or
character file was edited.

## Result

Lindenhafen's seed now contains **241 scenery placements / 27 buildings**, up
from 153 / 16. Paving covers **94.0% of dry land**, up from 23.1%, measured from
the actual ground weights. Grass and moss remain in small defined beds and
courts. Existing warm limestone fronts meet a broad rounded sandstone cobble
square, with a separate radial inlay beneath the fountain. All six ground
material slots are used.

The archive and café stand closer together; extra houses close frontage gaps.
The existing café painting supplies its parasols and terrace furniture, dressed
with box topiary, flower pots and ivy. Three stalls form the market cluster.
The botanist garden has rose-covered masonry/hedge walls, the existing rose
arch, benches, cypress, flowers, birdbath and a new stone statue. Emil's actual
wheel workshop now stands beside the canal rather than far south of his story
spot. Small groups of trees, benches, lamps and planters dress the remaining
courts, including the station, east canal, library and harbor.

**Story coordinates changed deliberately:** `emil` moves from `(250,1015)` to
`(580,1140)` and `lindenhafen-workbench` from `(330,1010)` to `(655,1140)`, in
front of `harbor-workshop` at `(635,1100)`. Every other story NPC/evidence foot
position is retained. No existing NPC, evidence, scenery, resident, activity,
quest location or building-owner ID was renamed or removed. Door/interior IDs
continue to derive from their existing owners. Resident schedules and homes
are retained. Canal weights and all three bridge placements are byte-for-byte
unchanged; Waldruh and Nebelstadt data are unchanged.

## Art and files

- `content/world-seed.json`: Lindenhafen data only.
- `art/source/terrain-objects/town-{linden,plane,boxwood,hedge,ivy,garden-statue,radial-cobble}.png`:
  seven selected **1254 × 1254** built-in ImageGen paintings, each with its exact
  sibling `*-prompt.txt`. `town-pass-2.json` records selected generation filenames
  and all references. All generations attached the target, café, Lindenhafen
  prop sheet and café interior. The first ivy result had a clipped top leaf and
  was rejected and regenerated; the retained version has clear gutters.
- `art/source/terrain-objects/requests.json`, `README.md`: catalogue requests,
  trunk-only tree footprints, authored hedge wall collision, physical pivots,
  source/provenance and export instructions. Existing cypress, rose arch and
  flower planters are reused, with no redundant replacement IDs.
- `web/public/assets/terrain-objects/town-*.webp` and thumbnails,
  `web/src/data/terrain-objects.json`: seven new placeable catalogue entries.
  New runtime images are **608,712–1,853,902 bytes**, all below 2,000,000 bytes.
- `art/source/terrain-materials/{meadow,canal-grass}.png` and their exact
  `*-style-prompt.txt`, manifest, style-review selection entries and README:
  replaced yellow grass highlights with deeper greens around `#5f7d4a`.
  Only these two material masters/runtime textures/thumbnails were repainted.
  Native 1254 × 1254 source and periodic 1152 × 1152 export sizes are retained.
- `web/src/terrain-materials.ts`: meadow/canal-grass plan/sampling palette
  changed from `#7d9360` to `#5f7d4a`. The two corresponding generated entries
  in `web/src/data/terrain-materials.json` also carry the updated manifest colours.
- `scripts/prepare-terrain-objects.mjs`: uses authored pivot consistently for
  visual bounds (including the centred ground inlay); accepts sibling prompt
  paths from requests. Existing default standing pivots remain unchanged.
- `scripts/prepare-terrain-materials.mjs`: `--only=meadow,canal-grass` limits
  isolated exports and optional catalogue updates to selected material IDs.
- `scripts/check-terrain-{objects,materials}.mjs`: optional `--report=<path>`
  keeps this pass's reports in its assigned evidence paths. Existing alpha,
  resolution, seam and 2 MB checks are unchanged.
- `scripts/check-town-style.mjs`: offline seed compositor, plan capture,
  new-art alpha-boundary/budget checks and optional before/after identity,
  other-town, canal-weight and bridge invariants.
- Deliberately updated tests: `web/src/terrain-objects.test.ts` expects 29
  objects and verifies the new tree bases and walkable centred paving;
  `world-edit.test.ts` includes the two new tree choices while retaining legacy
  atlas-swap assertions; `navigation.test.ts` checks the moved café/stall
  obstacles at their new positions. No check, timeout or budget was loosened.

Existing `.gitattributes` lines already cover every new PNG in
`art/source/terrain-objects/*.png`; no new pattern or shared-file edit was needed.

## Evidence

Every selected generation and every comparison below was inspected with the
image viewer. Plans were also rendered directly with `world-preview.mjs`.

- [Before plan](../audits/visual-style/town-after-before-plan.jpg)
- [After plan](../audits/visual-style/town-after-plan.jpg)
- [Full-town after plan](../audits/visual-style/town-after-full-plan.jpg)
- [Painted central quarter](../audits/visual-style/town-after-painted.jpg)
- [Before/after composition](../audits/visual-style/town-after-comparison.jpg)
- [New planting and actual 2 × 2 material repeats](../audits/visual-style/town-after-planting.jpg)
- [Grass before/after](../audits/visual-style/town-after-grass-comparison.jpg)
- [Seed invariants and coverage](../audits/visual-style/town-after-seed-audit.json)
- [New art alpha/budget report](../audits/visual-style/town-after-art-check.json)
- [All object checks](../audits/visual-style/town-after-object-check.json)
- [All material seams](../audits/visual-style/town-after-material-seams.json)

The painted evidence uses the seed's actual placements, runtime sprites and
material world scales. It is **an offline composite**, not a live screenshot:
it approximates GPU material blending and foot-depth sorting, and omits game
lighting, generated kerb/canal-wall geometry, character labels and HUD. The
composition comparison uses the same current material library on both sides,
so it isolates layout/planting changes. The separate grass comparison uses the
actual pre-pass source snapshots.

Regenerate current plans/painted evidence and new-art checks with
`node scripts/check-town-style.mjs`. This session's optional baseline is
`/tmp/town-seed-before.json`; add `--before /tmp/town-seed-before.json` while it
exists to regenerate the comparison and preservation audit. The durable JPGs
do not require that temporary file for viewing. Raw CLI plans were rendered to
`/tmp/town-{before,after,after-full}-plan.png`. The planting/grass contact sheets
were assembled by `/tmp/town-evidence.mjs` from retained masters/runtime assets
and `/tmp/town-{meadow,canal-grass}-before.png`.

## Checks

- `node scripts/prepare-terrain-objects.mjs`: **29/29 exported**, catalogue included.
- `node scripts/prepare-terrain-materials.mjs --only=meadow,canal-grass`:
  **2 exported**, selected catalogue entries updated; no unrelated material output
  regenerated. An earlier iteration used `--art-only`.
- `node scripts/check-terrain-objects.mjs --report=docs/audits/visual-style/town-after-object-check.json`:
  **PASS**, 29 native HD transparent objects.
- `node scripts/check-terrain-materials.mjs --report=docs/audits/visual-style/town-after-material-seams.json`:
  **PASS**, all 26 material entries have **zero** decoded seam difference on both axes.
- `node scripts/check-town-style.mjs --before /tmp/town-seed-before.json`:
  **PASS**, seven new paintings below 2 MB with zero painted boundary pixels;
  existing identities, other towns, bridges and canal weights preserved.
- `node scripts/scene-compiler.mjs check`: **PASS**, three scenes, content version
  `f07267f931590917`, **no warnings**. This checks story targets, entrances,
  full-player-footprint reachability, resident activities/routes and scene quality.
- `npm run check --workspace web`: **PASS**, TypeScript and UI budgets.
- Focused Vitest: **9 files / 92 tests PASS**: `ground`, `ground-terrain`,
  `navigation`, `clear-land-navigation`, `scene-data`, `scene-schema`,
  `terrain-objects`, `world-edit`, `world-routines`. Node printed its existing
  experimental localStorage warning; it did not fail a test.
- `node --test scripts/ground-shapes.test.mjs scripts/scene-compiler.test.mjs scripts/scene-quality.test.mjs`:
  **10 tests PASS**.
- From `server/`, focused `go test . -run 'Test(CompiledWorldMapRegistryValidation|WorldIdentitySurvivesJSONAndApplicationRestart|MapRegistryContainsThreeUniqueDestinations|AdminWorldPersistsAndRestartsWithoutRepositorySource)$' -count=1`:
  **PASS**, including seed-backed world initialization/persistence. These focused
  tests use the JSON store/fixtures; no PostgreSQL integration suite was run.
- Syntax checks for the three edited/new prepare/compositor scripts: **PASS**.

Initial placement validation caught an added harbor house blocking resident
homes, then its door/nearby ferry bench. Representative output was
`Felix's home must be on ground connected to the town` and
`People could no longer reach the bench. Leave room in front of it.` That new
house was removed; no pre-existing object was removed and no resident home or
schedule was changed. Initial focused tests also caught their old fixed stall
coordinates and old tree catalogue count/order; those deliberate expectations
were updated as described above, then all focused checks passed.

No git mutation, full verify, repo-wide generator, dependency install, art-cache
command, browser/server launch or live-world write was performed.

## Remaining integration work

**Publishing needs a human with an admin token to pull, merge and push.** The
live world is in PostgreSQL and may contain edits absent from this seed. Do not
blindly replace it: pull the latest live document, merge the Lindenhafen layout
while preserving live edits and these IDs, validate, preview and push with the
revision guard described in [world-agents](../world-agents.md). Include Emil's
moved story feet and the workbench when merging, and deploy the seven catalogue
entries/runtime assets first.

The coordinator should capture an actual town viewport at the approved camera
framing after merging the concurrent scene/HUD work, including a walk from the
station across the market bridge into the garden and workshop area. Live
occlusion, cast shadows, day/night lighting, mobile framing and HUD fit remain
visual integration checks; browser/server execution was explicitly excluded
from this agent's task. No additional source edit outside the assigned town
area is required for the seed/catalogue work to compile.
