# Characters — visual pass handover

Implemented a shared material/identity pass: clothing uses the native 180-grey
reference; the browser and offline compositor add warm pigment, deterministic
brush/tooth variation and directional edges. Alpha and frame registration stay
intact. Player texture keys invalidate earlier bakes. All **200 current walking
identities and four Wave sheets** were rebuilt (7,344 frames), including eight
expansion characters beyond the review's original count.

Nine requested story recipes now follow `art/source/character-kit/identities.md`,
which also records player defaults and the eight expansion identities. Marta's
finish-only pilot was too subtle; the selected version adds cream linen, dark
curls and olive/earth pigments. Emil's initial long waves were rejected in favour
of a short crop. Voss/Elise have bright illustrated native repaints from built-in
image_gen, with unmodified masters and exact prompts beside the story-cast sources.
Explicit native head/shoulder crops export to 724 × 724 WebP for centered CSS cover.

Changed files/families: `web/src/{character-compositor.mjs,character-recipe.mjs,character-cast.ts}`;
`scripts/{character-cast.mjs,refresh-character-cast.mjs,prepare-story-cast.mjs,character-cast.test.mjs}`;
new `scripts/character-{paint.test,story-portraits.test,style-review}.mjs`;
`art/source/character-kit/{README.md,identities.md,cast/*,recipes/player-default-*-painted.json}`;
`art/source/story-cast/*-portrait-painted.{png,txt}`;
`web/public/assets/{character-cast,story-cast}/`; new proofs only in
`art/proofs/{character-cast-painted,character-style-review}/`. Original proofs remain intact.

Evidence under `art/proofs/character-style-review/`:

- `marta-portrait-old-new.png`: portrait, original painted sprite, previous kit, selected pilot.
- `marta-cafe-context.png`: selected pilot beside the painted building.
- `portraits-before-after.png` and `portraits-family.png`: Voss/Elise style and crop comparison.
- `main-cast-lineup.png`, nine `<id>-all-frames.png`, `cast-board-00.png`–`cast-board-24.png`, `wave-all-frames.png`.
- `player-default-{regular,slim,broad}.png`: all player builds.
- `registration-audit.json`, `runtime-budget.json`, `review.json`, `checks.json`: bound evidence/results.

Checks pass: **85 Node tests, 101 Vitest tests**, and
`npm run check --workspace web` (TypeScript and UI template/layout budgets).
The guarded manifest build approves 200/200 identities with no missing/candidate
entries. Every unchanged recipe/action sheet (195 sheets) retains byte-identical
alpha; nine identity revisions intentionally select different components. All
25 cast boards, actions, detailed story sheets and player builds were viewed.
All 1,083 runtime files checked are below 2 MiB (largest 2,040,524 bytes).
New tests cover fabric normalization, alpha/temporal invariants and native
portrait provenance; cast test paths changed deliberately. No thresholds were loosened.

Limitations: this improves materials/colour rather than repainting bespoke face
anatomy. Marta's hoops/curly updo, Emil's goggles, Greta's lavender sprigs/sash,
Otto's peaked railway cap and Fritz's broad build still need registered kit art.
No scene/CSS/shadow code changed. Live world QA, production build and full verify
remain with the integrating agent; no repository-wide generator or git mutation ran.

Integration: the owned generated manifest is now
`art/source/character-kit/cast/runtime-manifest.json`; the builder, loader and tests
use it. The integrator may remove unused `web/src/data/character-cast.json`.
Outside this agent's ownership, `web/src/character-compositor.d.mts` should document
optional `material?: string` and `luminanceReference?: number` for `combineMaterials`.

Resolved intermediate checks: an array assertion reported `Expected values to be
strictly deep-equal` for Uint8ClampedArray versus Uint8Array; it now compares channel
values. Initial checking before manifest creation reported `TS2307: Cannot find
module '../public/assets/character-cast/manifest.json'`; the final source manifest
and import pass. An audit started before the final worker and correctly stopped
with `Paint bake pending: falk`; the complete post-bake audit passes.
