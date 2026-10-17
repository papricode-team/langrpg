# A0: the night train

The optional train prologue introduces German through seven supported conversations before `a1-arrival`. A0 is a story label, not a CEFR level; course vocabulary retains its A1/A2/B1 classification.

New players who choose **No, none** skip placement and enter the sounds board, then the ticket scene. Two missed placement answers also offer this route. The journal opens it for existing players. Completed scenes can be replayed without another completion reward.

The compartment and dining car share the existing greenhouse train's setting. The conductor is Otto's colleague. There is no additional town or new explanation of the train's mystery. Name practice darkens the ticket; the final scene warms the compartment to dawn. Window fog respects reduced motion, and the dialogue, sounds board and practice games support silent mode.

## Content and support

`content/source.json` owns the seven quests, graphs, conductor, interiors, supported replies and translations. Each scene has seven exercises, an examinable object and a 20 XP completion reward. Six story gates offer translated replies. The name gate accepts the account's display name and records supported story practice without a lexical attempt. Meanings start visible and slow echo is available throughout A0.

`scripts/dialogue-level-audit.mjs` enforces explicit allowed words, four-word turns, six new teaching units, 25 total lexemes, supported gates and recorded lines. Numbers one through seven are one teaching unit for that audit; they remain seven distinct lexemes in the intake budget. Placeholder lines containing the player's name are deliberately unvoiced.

Practice offers reuse the existing games and their restored-word pools. The first Night Train prompt practises the player's name without grading a lexeme. The train's Fog Window uses picture choices and Numbered Apples uses a carriage. Lantern Pairs currently matches individual restored words and meanings; phrase matching is not added in this implementation. If a requested game's pool is too small, the offer selects an available supported game instead.

The sounds board presents twelve sound patterns and can be skipped or reopened. Its silent route shows letters. It teaches recognition, not pronunciation, and does not record microphone input.

New paintings, furniture, window frames, conductor portraits, sounds-board art and voice references have adjacent provenance. `scripts/prepare-prologue-art.mjs` exports the train atlases. Dialogue uses the existing Qwen pipeline; train foley uses deterministic synthesis. The optional passing-landscape strip is omitted.

## Measured limits relative to the design

The generated reports retain the existing intake definitions rather than counting supported choices as vocabulary mastery:

| Measure | Result |
| --- | --- |
| Strict A0 dialogue errors | 0 |
| A0 scenes above their new-word budget | 0 |
| Prologue vocabulary coverage | 42 distinct lexemes |
| `a0-morgen` vocabulary readiness | 3.8 hours (syllabus position 48) |
| `a1-arrival` required path | 38 lexemes |
| `a1-arrival`, including optional topics | 69 lexemes, 45 above budget |

The design's under-three-hour estimate omits some function words and treats seven numbers as one batch. Intake still introduces ten individual lexemes per hour, starts with ten, reserves two slots per block for core vocabulary and applies the existing practice brakes. Completing the story quickly therefore does **not** restore every prologue word. Story access remains independent of intake, as required by `docs/pacing.md`.

Arrival now has six opening lines and a two-line slow Voss repetition. The lantern monologue moves to an optional topic; existing choices, effects and identities remain intact. `requiredPathLexemes` exposes the shorter mandatory path without excluding optional topics from the established full-scene audit. The full-scene 40-lexeme and ten-above-budget targets remain unmet while that lore is retained.

Some proposed phrases exceed the design's own four-word or six-new-word limits. The location scene splits the question into “Wo ist …?” and “Die Toilette.” Morning omits “Es ist früh.” A later teaching review can revisit these choices together with the pacing targets. The next A1 scenes remain the follow-up worklist in `docs/pacing.md`.

## Verification

Run `npm ci` and `npm run verify`. For the two new UI surfaces:

```sh
ATLAS_UI_SURFACES=prologue,sounds npm run verify -- --ui
```

Set `ATLAS_CHROMIUM_PATH` if Chromium is not installed in Playwright's cache. Screenshots are written to `output/ui-screenshots` at 390×844 and 1280×720.

For the actual onboarding, seven gates and arrival handoff, start an isolated local API/Vite server and run `ATLAS_UI_URL=http://127.0.0.1:5173 node scripts/check-prologue-flow.mjs`. This creates a guest account, checks the six recognition submissions and rejects content rate-limit failures. It is deliberately outside the unit suites.

The live new-account check completes all seven scenes for 140 XP, with six recognition submissions, one local name practice and no browser runtime errors. Unit and server coverage includes the optional progression chain, name-practice idempotency, gate-specific supported reply visibility, content redaction, silent picture choices, train effects and reduced motion. Native review of the teaching content remains a separate release gate.

Verified on 2026-10-17: the full suite with UI checks passed in 149 seconds, including PostgreSQL integration tests, the race pass, 1,253 frontend tests and all four screenshots. The saved live check also passed through Otto's arrival conversation without content rate-limit failures.
