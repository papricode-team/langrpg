# Minigames visual pass

Implemented finding 5 with eight new painted 16:9 stages, generated with the built-in imagegen tool using the existing workbench as the attached reference. All selected masters and exact prompts are saved together under `art/source/minigames/scenes/`. The runtime paintings are 1920×1080 WebP. All 30 catalogue games have a family assignment in `web/src/minigames/stages.ts`.

| Stage | Games |
| --- | --- |
| Station | Departure Board, 17:59, Delivery Run, Fog Window, Night Train |
| Market/café | Tray Rush, Numbered Apples, Kettle Forecast, Market Baskets |
| Archive/sorting | Re-ink, Sorting Office, Ada’s Alphabet, Lantern Pairs, Honest Mirror, Letter Loom |
| Garden | Seed Packets, Falling Leaves |
| Clockmill | Lost Hour |
| Workshop | Lantern Lighting, Word Chain, Workbench, Lamp Walk, Hold the Signal, Scrambled Sign, Lantern Fuse |
| Council | Brass Stamp, Seven Chairs, Neighborhood Boards |
| Listening | Looping Tape, Echo Bells |

The Phaser scene now uses the family painting, a subtle painted-light pulse, painted dust sprites and painted approval/retry seals. Reduced motion removes ambient motion. Scene startup waits for Fraunces and DM Sans; Phaser no longer draws any text. The DOM word games and authored story boards use the same family paintings, painted bells, listening horn and seal feedback. Basket crates, the fuse lamp/spark and the night-train engine/cargo crate also use existing painted sprites. Word-game lantern progress uses painted lantern sprites. Native DOM inputs and server grading are preserved.

Two new native-alpha item sheets add all 18 previously unpainted nouns required by the three authored stories, plus approval seal, retry seal, listening horn and a neutral linen-pouch placeholder. The item pipeline now exports 199 nouns and 31 props, including a fourth 256px atlas page. Text games attach painted noun art without restricting the restored-word pool. Nouns outside the explicit art plan retain their text and use the neutral pouch: 1,557 A1–B1 course nouns still lack individual paintings. Abstract story nouns use documented motifs alongside their authored sentences, rather than pretending the motif is a literal depiction. Picture-only pools require a planned, pictureable noun sprite; abstract story motifs are explicitly excluded from picture-only questions.

## Files

- `web/src/minigames/scene.ts`, `stages.ts`, `painted-ui.ts`, `painted-ui.test.ts`, `sprite-library.ts`, `engine.ts`, `word-games.ts`, `scripted-stories.ts`, `item-manifest.ts`, `pool.ts`, `pool.test.ts`, `host.test.ts` and the three corresponding minigame CSS files.
- `web/src/minigames/item-data.json`, `scene-art-data.json` and generated item/scene manifests, atlas JSON, WebP pages and sprite derivatives in `web/public/assets/minigames/`.
- `art/source/minigames/items-14.png`, `items-15.png`, their exact `.txt` prompts, `plan.json`, new extracted masters and the eight stage PNG/prompt pairs.
- `scripts/prepare-minigame-scenes.mjs` (including `--stages-only`), `prepare-item-art.mjs`, `item-art-plan.mjs`, `check-item-art.mjs`.

## Visual evidence

- Before style baseline: `art/source/minigames/scenes/before-workbench-reference.png` (a reduced copy of the original workbench; no committed screenshot of the old primitive minigame scene was available).
- After stage contact sheet: `art/source/minigames/scenes/stage-proof.png`. Rows, left to right: station/market, archive/garden, clock/council, listening/workshop.
- After item masters: `art/source/minigames/items-14.png`, `items-15.png`.
- After feedback sprites: `web/public/assets/minigames/items-4.webp`.

All selected generated masters and the exported stage/item proofs were inspected with the image viewing tool. Native alpha and frame coverage pass the item audit. The largest minigame runtime file is `items-128.webp`, 1,060,314 bytes; the new stages and all sprite derivatives are below 2 MiB. No live gameplay screenshot was captured.

## Checks

- `node scripts/prepare-minigame-scenes.mjs --stages-only`: passed, eight stages.
- `node scripts/prepare-item-art.mjs`: passed, 199/199 nouns, 31/31 props, zero missing frames.
- `node scripts/check-item-art.mjs`: passed, including new stage size/provenance checks.
- `npx vitest run src/minigames/*.test.ts` from `web/`: 14 files, 131 tests passed. Five new tests cover family coverage, all required story noun identities, safe painted feedback, missing/failed-image fallback and exclusion of abstract motifs from picture-only questions. Pool/host mocks now include the pictureability predicate; existing assertions were not loosened.
- `node --test scripts/minigame-stories.test.mjs`: six passed.
- `node scripts/author-minigame-stories.mjs --check`: passed, 32 exercises and 31 speech clips.
- `npm run check --workspace web`: blocked outside this area: `src/character-cast.ts(2,18): error TS2307: Cannot find module '../../art/source/character-kit/cast/runtime-manifest.json' or its corresponding type declarations.` (An earlier run reported the same missing import at its former public-assets path.) No minigame TypeScript errors were reported.
- Additional relevant tooling test: `node --test scripts/item-art.test.mjs`: two passed, one failed because its old count is hardcoded: `AssertionError: 199 !== 181` at line 11.

## Integration work outside this agent’s ownership

1. Update `scripts/item-art.test.mjs`, which is outside my allowed files: expected unique nouns 181 → 199, total frames 208 → 230, and accept the final six-frame sheet instead of requiring every sheet to contain exactly 16 frames. Keep duplicate identity and semantic checks. This is an intentional art-plan expansion, not a relaxed coverage requirement.
2. Restore/regenerate `art/source/character-kit/cast/runtime-manifest.json` in the character agent’s area, then rerun the web type check.
3. Add an LFS rule for `art/source/minigames/**/*.png` in `.gitattributes` before committing these masters. This file is outside my allowed area, and the existing attributes do not cover minigame PNGs.
4. Full individual art coverage for the remaining 1,557 broad-course nouns remains outstanding; they now have a graceful painted fallback. Review live game composition at desktop and phone sizes when the shared application is runnable.

No git state was modified, no repository-wide install/build/art/verify generator was run, and no files outside the assigned area were edited.
