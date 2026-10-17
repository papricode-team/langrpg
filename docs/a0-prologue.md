# A0: the night train

The optional train prologue introduces German through seven supported conversations before `a1-arrival`. A0 is a story label, not a CEFR level; course vocabulary retains its A1/A2/B1 classification.

New players who choose **No, none** skip placement and enter the sounds board, then the ticket scene. Two missed placement answers also offer this route. The journal opens it for existing players. Completed scenes can be replayed without another completion reward.

The compartment and dining car share the existing greenhouse train's setting. The conductor is Otto's colleague. There is no additional town or new explanation of the train's mystery. Name practice darkens the ticket; the final scene warms the compartment to dawn. Window fog respects reduced motion, and the dialogue, sounds board and practice games support silent mode.

## Content and support

`content/source.json` owns the seven quests, graphs, conductor, interiors, supported replies and translations. Each scene has seven exercises, an examinable object and a 20 XP completion reward. Six story gates offer translated replies. The name gate accepts the account's display name and records supported story practice without a lexical attempt. Meanings start visible and slow echo is available throughout A0.

`scripts/dialogue-level-audit.mjs` enforces explicit allowed words, four-word turns, six new teaching units, 25 total lexemes, supported gates and recorded lines. Numbers one through seven are one teaching unit for that audit; they remain seven distinct lexemes in the intake budget. Placeholder lines containing the player's name are deliberately unvoiced.

Practice offers reuse the existing games and their restored-word pools. The first Night Train prompt practises the player's name without grading a lexeme. The train's Fog Window uses picture choices and Numbered Apples uses a carriage. After the location and repeat scenes, Lantern Pairs matches taught phrases to their meanings. It loads authenticated recognition exercises from completed A0 scenes, keeps only phrases whose every word is restored, and saves each match as supported recognition. Turkish meanings and silent mode use the same board. It never substitutes individual words when fewer than two phrases are ready; the practice link explains how to restore more. Other games may offer an available supported alternative when their pool is too small.

The sounds board presents twelve sound patterns and can be skipped or reopened. Its silent route shows letters. It teaches recognition, not pronunciation, and does not record microphone input.

New paintings, furniture, window frames, conductor portraits, sounds-board art and voice references have adjacent provenance. `scripts/prepare-prologue-art.mjs` exports the train atlases. Dialogue uses the existing Qwen pipeline; train foley uses deterministic synthesis. The optional passing-landscape strip is omitted.

## Pacing and arrival

The generated reports retain the existing intake definitions rather than counting supported choices as vocabulary mastery:

| Measure | Result |
| --- | --- |
| Strict A0 dialogue errors | 0 |
| A0 scenes above their new-word budget | 0 |
| Prologue vocabulary coverage | 33 distinct lexemes |
| `a0-morgen` vocabulary readiness | 2.7 hours (syllabus position 37) |
| `a1-arrival` required path | 28 lexemes |
| `a1-arrival`, including optional topics | 36 lexemes, 9 above budget |

The conversations meet these targets by using fewer words. The name prompt is “Name?”, the dining-car exchange concentrates on ordering tea, the location exchange on the toilet and “hier”, and the repeat scene retains “Ich verstehe nicht”, “Langsam, bitte” and “Noch einmal, bitte”. Morning identifies the train with “Der Zug.” Each of the seven numbers remains an individual intake lexeme.

Arrival has six opening lines and a two-line slow Voss repetition. Optional questions retain the Brass Office, the platform closed for twelve years, Otto's lantern and E.'s connection to the name on the ticket. The existing report/protect choices, IDs, effects, items and flags remain unchanged. Optional topics count toward the full-scene budget; `requiredPathLexemes` is supplementary. `audit-pacing.mjs` now fails verification if the opening exceeds any of the shipping targets.

Intake still introduces ten individual lexemes per hour, starts with ten, reserves two slots per block for core vocabulary and applies the existing practice brakes. The 2.7-hour figure assumes intake does not pause; it is vocabulary availability, not a promise of mastery or play duration. Story access remains independent of intake. At the user's explicit choice, players may reach arrival immediately, while the train controls and journal show how many words are still returning and link to ordinary practice. Supported dialogue and phrase matching do not manufacture unaided learning evidence.

The next A1 scenes remain the follow-up worklist in `docs/pacing.md`.

## Verification

Run `npm ci` and `npm run verify`. For the train rooms and sounds board:

```sh
ATLAS_UI_SURFACES=prologue,prologue-dining,sounds npm run verify -- --ui
```

Set `ATLAS_CHROMIUM_PATH` if Chromium is not installed in Playwright's cache. Screenshots are written to `output/ui-screenshots` at 390×844 and 1280×720.

For the actual onboarding, seven gates and arrival handoff, start an isolated local API/Vite server and run `ATLAS_UI_URL=http://127.0.0.1:5173 node scripts/check-prologue-flow.mjs`. This creates a guest account, checks the six story recognition submissions, saves a real supported Lantern Pairs phrase match, and rejects content rate-limit failures. It is deliberately outside the unit suites.

The live new-account check completes all seven scenes for 140 XP, with six recognition submissions, one local name practice and no browser runtime errors. Unit and server coverage includes the optional progression chain, name-practice idempotency, gate-specific supported reply visibility, content redaction, silent picture choices, train effects and reduced motion. Native review of the teaching content remains a separate release gate.

Regression coverage checks completed-scene and intake filtering, localized phrase matching, supported grading, the opening budget limits, and character perspective. Both train interiors and the sounds board have desktop and phone screenshot coverage; the preview waits for the player avatar to finish loading before capture.

The train rooms calibrate adult height against the painted floor horizon. People scale with aisle depth, and their initial positions sit on the aisle. Other interiors retain their existing fixed scale.

The final full verification passed on 2026-10-17 in 183 seconds, including PostgreSQL and race tests (three seconds over the repository runtime target). The separate UI run passed all six train/sounds screenshots, and the live seven-scene flow saved a supported phrase match and reached arrival with no browser errors. No audits, intake settings, timeouts or build budgets were relaxed.
