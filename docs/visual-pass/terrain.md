# Terrain handover — 2026-10-17

Repainted **15 terrain features, all 24 distinct material masters (26 catalogue entries), and the existing grass-tuft/wildflower dressing** with built-in `image_gen`. The café and approved warm quay were the generation references. Every selected master is saved in its original terrain-family directory, with an exact sibling `*-style-prompt.txt`; `style-review.json` and README files record provenance and export details.

The shared default is cream sandstone, muted terracotta repairs, olive moss and warm upper-left light. Timber is honeyed oak; canal/deep water is jade/teal rather than navy. The dedicated slate material remains muted coastal grey-green for Nebelstadt. Local material strokes carry lighting and joint occlusion without a repeating whole-tile illumination gradient. Paving features now include moss, chipped kerbs and irregular worn edges. Existing botanical IDs were repainted rather than adding redundant unregistered objects.

## Files

- `art/source/terrain-features/**`: 15 selected replacement masters and prompts, provenance, request provenance pointer. Existing traced geometry is retained.
- `art/source/terrain-materials/**`: 24 selected replacement masters and prompts, provenance, manifest provenance pointer. Historical runtime filenames remain stable, including `town-cobble-bridge-blue.webp`, which now contains warm stone.
- `art/source/terrain-objects/**`: two repainted botanical masters/prompts and provenance; explicit original pivots/visual registration in their requests.
- `web/public/assets/terrain-{features,materials,objects}/**`: family-script exports and thumbnails.
- `web/src/terrain-materials.ts`: pure catalogue palette/name overrides for plan previews and ground sampling. No scene files were edited.
- `scripts/prepare-terrain-{features,materials,objects}.mjs`: `--art-only` avoids writing shared JSON catalogues; object preparation supports an authored root pivot, with the previous automatic pivot as the default.
- `scripts/check-terrain-{features,materials,objects}.mjs`: enforce the existing 2 MB limit. `scripts/check-terrain-style.mjs`: offline evidence compositor, runtime size audit and optional before/after silhouette registration check.
- `docs/audits/terrain-{features,material-seams,objects,style-budget,style-registration}.json`: checked results.

## Before/after evidence

All comparison JPGs were inspected after export. Each has labelled before/after panels using actual source paintings at identical scale:

- [Representative café/canal patch](../audits/visual-style/terrain-after-lindenhafen-patch.jpg).
- [All terrain features](../audits/visual-style/terrain-after-features.jpg).
- [All distinct materials](../audits/visual-style/terrain-after-materials.jpg).
- [Dressing](../audits/visual-style/terrain-after-dressing.jpg).
- [Actual runtime 2 × 2 repeats](../audits/visual-style/terrain-after-repeat.jpg).

The existing review baselines remain `docs/audits/visual-style/terrain-features.jpg` and `lindenhafen-preview.jpg`. The new patch is explicitly a representative offline composite, **not a live-town screenshot**. `world-preview.mjs` successfully renders `content/world-seed.json`, but it draws a labelled plan and feature rectangles, so it cannot prove painted joins. Its output was kept in `/tmp/terrain-lindenhafen-plan.png`.

The source snapshots used for the side-by-side images are at `/tmp/terrain-style-before` for this session. To regenerate while those remain available: `node scripts/check-terrain-style.mjs --before /tmp/terrain-style-before`. Without `--before`, the script updates the runtime budget audit and repeat proof. The committed comparisons are durable evidence and do not depend on the temporary snapshots for viewing.

## Checks

- All three family prepares ran with `--art-only`: **26 materials, 15 features, 22 objects exported**. No shared generated JSON catalogue was edited.
- `node scripts/check-terrain-materials.mjs`: **PASS**, all 26 decoded material entries match opposite outer edges exactly in both directions; periodic-overlap code and seam tolerance unchanged.
- `node scripts/check-terrain-features.mjs`: **PASS**, 15 native HD alpha paintings with valid traced decks/walls.
- `node scripts/check-terrain-objects.mjs`: **PASS**, 22 native HD alpha objects, nine with procedural motion.
- `node scripts/check-terrain-style.mjs --before /tmp/terrain-style-before`: **PASS**, all 126 runtime WebPs/thumbnails below 2,000,000 bytes. Feature silhouette overlap is 97.5–99.6%, with unchanged 1254 × 1254 canvases and retained navigation traces.
- `npm run check --workspace web`: **PASS**, TypeScript and UI budgets.
- From `web/`, `npx vitest run src/terrain-features.test.ts src/terrain-objects.test.ts src/ground-terrain.test.ts`: **3 files / 11 tests PASS**. No tests or tolerances were loosened and no test expectations changed.
- New/edited script syntax checks passed. No repo-wide generator, full verify, world edit, commit, stash, reset, checkout or push was performed by this agent.

## Remaining integration work

1. **Town variants:** materials/features are selected by explicit IDs in authored ground; there is no automatic per-town feature palette. The shared warm default is intentional. Nebelstadt coastal feature variants need new IDs plus town-aware selection or authorised world placements. The renderer's single `MASONRY='canal-masonry'` in `web/src/ground-terrain.ts` also needs a per-town/material choice to keep coastal canal walls slate while Lindenhafen stays sandstone. That renderer is outside this task's writable area.
2. **Kerb contour wear:** the warm masonry now reaches the renderer's kerbs, copings and walls, but their contour thickness and regular shape still come from `ground-terrain.ts`. Further geometric edge breakup belongs to the renderer owner; texture wear alone cannot change that contour.
3. **Lawn composition:** repainted grasses/flowers, existing ferns/reeds/mossy rocks, and richer ground cover are ready. Actual lawn clusters and district composition require a separate authorised world-authoring pass. No seed or live-world data was changed here.
