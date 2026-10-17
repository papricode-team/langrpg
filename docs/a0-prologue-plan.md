# A0 prologue: a start for players who know no German

Written 2026-10-16. A design, not an implementation. It builds on `docs/pacing.md` (the ten-words-an-hour budget), `docs/story-bible.md` (the one rule) and `docs/curriculum.md` (beginner story support). "A0" is a product label for pre-A1; the CEFR has no such level and nothing here certifies one.

## 1. Where a zero-German player hits the wall today

The game assumes A1 from the first second. Measured against the current content:

| Surface | What a zero-German player meets |
| --- | --- |
| `a1-arrival`, the first scene | Fifteen Otto lines before the player does anything; 99 lexemes in one conversation (`docs/audits/pacing.json`) |
| First production gate | Type `Noch einmal, bitte.` in German, umlaut rules and noun capitalisation included, after a 60-word Voss speech |
| Meanings | Hidden by default; the player must find **What did they say?** or tap a word |
| First ten syllabus words | `ich, sein, der, sie, nicht, haben, ein, es, und, zu` (`web/src/data/syllabus.json`). Frequency order gives ten function words that cannot form a single sentence |
| Sound and script | Nothing teaches ä, ö, ü, ß, `ei`/`ie`, `ch`, `sch`, `w`, `z`, or that every line has audio |
| Practice games | Pools need restored words, so the first games are empty or explain a prerequisite |
| Placement | Optional eight-item sample; a player who cannot read any of it gets no "start from zero" path |

The beginner support controller (`web/src/beginner-dialogue.ts`) already softens the first three quests with complete German replies, but it still presents them as typed input and still hides meanings. The pacing doc already names the fix for the vocabulary side: "The first scene must work with the 10 opening words, which means a first conversation of greetings, the player's name and one request." This plan is that first conversation, widened to a short prologue.

## 2. Principles

1. **Ear before eye, chunk before word, choice before typing.** Every German line is heard before it is read, taught as a usable phrase (`Einen Tee, bitte.`) not as a lemma list, and answered by tapping before it is ever typed.
2. **Meanings on by default.** At A0 the mother-tongue line sits under the German until the player hides it. Support fades later by the existing evidence rule, never by a timer.
3. **The player's own name is the first German they produce.** It is the one typed answer in the prologue, it cannot be wrong, and it is the one rule of the story: say your name aloud and it stays.
4. **Nothing new in the engine that the story does not already have.** Dialogue graphs, choice gates, simpler line variants, interiors, lantern rounds, word games, TTS clips and the intake budget all exist. The prologue is content plus one new level tag and a stricter audit.
5. **No new town.** Three story towns was a deliberate limit (`docs/map-scaling-handover.md`). The prologue happens on the train, in one interior.
6. **Fix the cliff, do not move it.** A prologue that ends in front of a 99-lexeme `a1-arrival` has only moved the wall. The prologue pre-teaches the opening of `a1-arrival` and `a1-arrival` is trimmed to meet it.

## 3. The prologue: the night train to Lindenhafen

Seven scenes in one interior, the train compartment, with a corridor and a dining car as two more rooms. One new speaker, the conductor (*der Schaffner*; "Schaffner" is not in the lexicon, so it is one of the scene's two glossed story words, or the character is simply "Otto's colleague" and never named by role). Conductors speak in formulas, which is exactly A0 material. The train is the same mysterious train that arrives on platform seven, so the prologue needs a continuity check against `docs/story-bible.md` §10 before any lore is added; the scenes below add none beyond "the player rode it".

Every scene: at most **6 new lexemes**, at most **25 lexemes in total**, turns of at most **4 words**, meanings visible, a **choice** gate (never typed, except scene 2), one object to examine, one lantern round or word game offered afterwards. Numbers one to seven count as one batch, as the pacing audit already treats digits.

| # | Scene | What happens | New phrases (lexemes) | Gate |
| --- | --- | --- | --- | --- |
| 0 | *Sounds board* (not a scene) | Two-minute board: hear a sound, tap the letters. ä ö ü ß, `ei`/`ie`, `ch`, `sch`, `w`, `z`, `v`, final `-en`. Silent mode shows mouth/letter cards instead | none (letters only) | none |
| 1 | `a0-ticket` A ticket in your hand | *Guten Abend. Fahrkarte, bitte. Danke. Bitte.* The player hands over the ticket | Abend, Fahrkarte, bitte, danke, ja (5) | choose *Bitte.* |
| 2 | `a0-name` Your name on the ticket | *Wie heißen Sie?* The name on the ticket is pale. *Ich heiße …* The ink darkens when the player says it | wie, heißen, ich, Name (4) | type only the name into *Ich heiße ___.* |
| 3 | `a0-wagen` Carriage seven | Counting carriages past the window: *eins … sieben. Wagen sieben.* | eins–sieben (1 batch), Wagen (2) | choose *sieben* when asked which carriage |
| 4 | `a0-tee` Tea in the dining car | *Tee oder Kaffee? Einen Tee, bitte. Mit Milch? Nein, danke.* | Tee, Kaffee, oder, mit, Milch, nein (6) | choose *Einen Tee, bitte.* |
| 5 | `a0-wo` Where is …? | *Wo ist die Toilette? Hier. Da. Der Ausgang ist da.* | wo, sein (ist), hier, da, Toilette, Ausgang (6) | choose *Wo ist die Toilette?* |
| 6 | `a0-langsam` Slower, please | The conductor rattles an announcement. *Ich verstehe nicht. Langsam, bitte. Noch einmal, bitte. Wie bitte?* | verstehen, nicht, langsam, noch, einmal (5) | choose *Noch einmal, bitte.* |
| 7 | `a0-morgen` Morning | Dawn. *Guten Morgen. Es ist früh. Der Zug kommt. Lindenhafen! Auf Wiedersehen.* The train slows into platform seven | Morgen, früh, Zug, kommen, Wiedersehen, es (6) | choose *Auf Wiedersehen.* |

About 35 lexemes and the numbers, over roughly two to three hours of play with the games between scenes. At ten words an hour plus the ten opening words, intake covers each scene when the player reaches it; the pacing audit confirms this mechanically once the scenes exist (section 6).

Scene 6 pre-teaches the exact `a1-arrival` gate (*Noch einmal, bitte.*) and scene 7 its first line (*Guten Morgen! Willkommen in Lindenhafen.*) and the first placement item (*Willkommen! Es ist früh.*). The player arrives in Lindenhafen already able to greet, thank, ask where, ask for a repeat, count to seven and say their name. That is the pre-A1 outcome, and it is enough to make Otto's opening feel like a conversation rather than a wall.

### Practice between scenes

No new games. Each prologue scene names one round from the existing roster whose pool it can fill:

| After scene | Round | Why it fits at A0 |
| --- | --- | --- |
| 1, 4 | Echo Bells | Hear a word, ring its meaning; silent mode shows the word briefly |
| 2 | The Night Train | Type the word before the train leaves; first use is the player's own name, then *danke*, *bitte* |
| 3 | Fritz's Numbered Apples | Numbers one to seven, spoken, caught in lanes |
| 4, 5 | The Fog Window | Name a painted object as the fog clears; picture choices carry no text |
| 5, 6 | Lantern Pairs | Tie the phrase to its meaning on one board |
| 7 | The Scrambled Sign | Rebuild *Morgen*, *Zug*, *Abend* from letter tiles |

The journal's **Today's words** card already rotates word games; at A0 it should prefer the picture and sound games over typed ones.

## 4. What changes in the engine

### 4.1 A fourth level tag

`Level` is `'A1' | 'A2' | 'B1'` in `web/src/content.ts` and the same set is hard-coded in about fifteen web files, five scripts and eight Go sites (`validLevel` in `server/curriculum.go`, `levelVisible` in `server/content_api.go`, the level check in `server/app.go`, rewards in `server/course_progress.go`, expedition levels, the syllabus level buckets, the dialogue audit's `levels` array). Add `'A0'` as a **story level only**:

- Lexicon entries keep their A1/A2/B1 tags. There are no A0 lexemes; imported tags are too noisy to carry a pre-A1 band (the lexicon has *früh* at A2, *Fenster* at A2 and *Nacht* at B1).
- `levelVisible('A0')` is true. A fourth chapter, *Prologue: the night train*, precedes *The missing platform*. Quest ids `a0-*` go first in `content/source.json` so the progression chain and the syllabus see them first.
- Completion reward below A1's 40 XP, say 20.
- The HUD level label shows *Prologue* at A0.

The alternative, marking A0 scenes by id prefix inside A1, avoids the plumbing but leaks `startsWith('a0-')` into audits, HUD and server checks. The explicit tag is a day of mechanical edits that `npm run verify` checks end to end.

### 4.2 A stricter A0 audit

`scripts/dialogue-level-audit.mjs` resolves words against the lexicon at or below the scene's level. For A0 that lookup must not apply, because any A1 word would pass. Instead each A0 graph carries an explicit `allowedWords` list, and the audit fails on:

- any token outside `allowedWords`, proper names, the player's `{name}` and the two glossed story words;
- more than 6 new lexemes or 25 total lexemes per scene (the pacing audit's `newWordsAboveBudget` already computes the first);
- a turn over 4 words (`beginnerTurnWordLimits` gets `a0-*` entries);
- a gate without a `beginnerGateTranslations` entry, except `a0-name`;
- any line without a clip.

### 4.3 Meanings and audio defaults

`needsBeginnerStorySupport` already returns true until the foundations are done. Add an A0 tier to the same controller: while any `a0-*` quest is incomplete,

- the mother-tongue line is **visible by default** and the toggle hides it;
- the line's clip plays on open and **Echo · slower** is available without the power;
- gates render as `beginnerGateChoices` (choice ids are canonical German, so the server grades them unchanged);
- a tapped word shows its gloss on its own line, as the Turkish route already does, because A0 players cannot yet find the word inside the English sentence.

### 4.4 The player's name as a gate

`a0-name` needs one new gate kind: a sentence with a single blank that accepts the account's display name. It is graded on the client for ink restoration and recorded as supported practice, not as a lexical attempt, because it teaches no lexeme. This is the only typing in the prologue.

### 4.5 First run and placement

The onboarding language step (`web/src/onboarding.ts`) gets one more question after the language pair: **Have you learned any German before?** *No, none* starts the prologue and skips placement. *A little* and *Yes* keep today's optional placement; a player who misses the first two placement items is offered the prologue too. Players who skip it can still open the prologue from the journal; completing it later is optional and awards nothing twice.

### 4.6 Syllabus order

No code change. `scripts/build-syllabus.mjs` fills each block of ten with up to eight words from the earliest story scene that still has unintroduced vocabulary. Put the `a0-*` scenes first in quest order and the syllabus fronts *Abend, Fahrkarte, bitte, danke* instead of *der, sie, nicht*. Regenerate with `node scripts/build-syllabus.mjs` and the drift tests catch anything stale.

## 5. Trim the first A1 scene

Without this the prologue only moves the wall. `a1-arrival` goes from 99 lexemes to at most 40, with every line at or under the 8-word turn limit it already has:

- Otto's fifteen-line opening becomes six lines. The rule exposition (*Hier in Lindenhafen gehen Namen weg. Sag deinen Namen laut.*) stays; the twelve-years-of-lantern monologue moves to Otto's optional topic *Why do you light the lantern?*, which already exists.
- Voss's fast speech stays as the joke, but its slow repetition (`choice` node) shrinks to the two lines the gate is about.
- The choice (*Bitte, Herr Voss* / *Die Fahrkarte bleibt bei mir*) and its ids, effects, items and flags stay untouched, as the expansion plan requires.
- `a1-timetable`, `a1-cafe` and `a1-room` (35, 36 and 26 new lexemes) get the same pass later; the audit table in `docs/pacing.md` is the worklist.

## 6. Acceptance

- `npm run verify` passes with the A0 gate on: `docs/audits/dialogue-levels.json` reports zero A0 errors, `docs/audits/pacing.json` reports `newWordsAboveBudget` of 0 for every `a0-*` scene and a `vocabularyReadyHour` under 3 for `a0-morgen`.
- `a1-arrival` reports at most 40 lexemes and at most 10 above budget.
- Every A0 line has a clip; the sounds board and every A0 round work in silent mode.
- A new account that answers *No, none* reaches `a0-ticket` without seeing placement or a typed German field, and reaches `a1-arrival` with all prologue words restored.
- The Turkish overlay has every A0 unit (`npm run i18n` fails otherwise).
- UI check at 390×844 and 1280×720 for the compartment interior and the sounds board.

## 7. Order of work

| Phase | Work | Size |
| --- | --- | --- |
| 1 | `'A0'` level tag through web, scripts and Go; fourth chapter; A0 audit rule with `allowedWords`; `a0-*` turn limits; tests | about a day |
| 2 | Seven graphs, quest intros, evidence, glosses, Turkish overlay, TTS clips for the conductor; compartment, corridor and dining-car interior | two to three days |
| 3 | A0 support tier (meanings on, autoplay, choice gates, gloss line), the name gate, onboarding question and placement hand-off | a day |
| 4 | Sounds board as a lantern round; round recommendations per scene; Today's words preference | a day |
| 5 | `a1-arrival` trim; rerun pacing; then `a1-timetable`, `a1-cafe`, `a1-room` | a day, then ongoing |

Phases 1, 2 and 4 are independent. Phase 3 needs 1. Phase 5 needs nothing but should land with 2 so the join is tested once.

## 8. Limits

A prologue written by the team and voiced by TTS is not reviewed pre-A1 teaching. The sound board teaches recognition of letters and sounds, not pronunciation; there is still no microphone. The conductor is a new speaker and a new voice, and the train's lore must stay consistent with the bible. Whether two to three hours is the right length is a learner question the intake telemetry (`GET /api/retrievals`, the intake brake counts) can answer after release, not before.

## 9. New assets

Checked against the repository on 2026-10-16. "Reuse" means the asset exists and needs no new art; "new" means a new master in `art/source`, its prompt file beside it (the provenance rule in `docs/art.md`), and a runtime export. Everything new is generated with the same ImageGen and Qwen3-TTS pipelines as the rest of the game.

### 9.1 Paintings and interiors

The train already exists as an exterior: `art/source/story-cast/greenhouse-train.png`, a teal locomotive pulling one green glass greenhouse carriage, used by the arrival and travel cutscenes. The prologue happens inside that carriage, so the rooms are glass-walled and the night sky and the passing forest are visible through them.

| Asset | Status | Format and pipeline |
| --- | --- | --- |
| Compartment room painting, night | new | 1536 × 1024 PNG master, WebP export, floor polygon, spawn and exit points like `interior-inn-room`; `scripts/prepare-interior-art.mjs` |
| Compartment room painting, dawn | new | Same geometry, repainted light for `a0-morgen`; or one painting plus a dawn tint overlay if the renderer gains a room tint (code, not art) |
| Dining-car room painting | new | 1536 × 1024, counter, three tables, samovar; hosts `a0-tee` and `a0-wo` |
| Corridor is part of the compartment painting | reuse of the room concept | No third room; the corridor door, toilet door and `Ausgang` sign sit in the compartment painting as examinable objects |
| Train furniture sheet | new | One transparent sheet, about twelve objects: bench seats (two), luggage rack, suitcase, folding table, compartment door, toilet door, exit sign, samovar, tea glass in holder, menu card, conductor's ticket punch. Exported as a furniture atlas plus JSON like `interior-cafe-objects` |
| Window detail frames | new | Four to six transparent frames of fog drifting over the glass and, for dawn, light creeping in; attaches to fixed emitter points like `interior-effects`. Reduced motion freezes them |
| Passing-landscape strip | new, optional | A wide transparent silhouette strip (trees, a bridge, a lamp) scrolled behind the glass for the counting scene. Can be cut; the window frames alone work |
| Compartment, dining car and station arrival cutscene art | reuse | The `arrival` cinematic and the train sprite already slide the train into platform seven for `a1-arrival` |

### 9.2 Characters

| Asset | Status | Notes |
| --- | --- | --- |
| The conductor, world sprite | new | A component recipe in `web/src/data/character-cast.json` baked by `scripts/character-cast.mjs` into `web/public/assets/character-cast/<id>.webp` like `kessler` and `pip`; needs a cap and dark coat component if the kit lacks them |
| The conductor, portraits | new | Three expressions (neutral, smile, worried) in `web/public/assets/character-portraits/`, same sizes as the existing cast |
| Conductor's indoor pose | reuse | Indoor residents use the first pose of the baked sheet at the 132 px indoor height |
| Player | reuse | The player's own recipe |
| A second passenger | none | Not in the plan; it would be a second voice and sprite for little pedagogical gain |

### 9.3 Item and prop sprites

The 181-noun item library already covers most prologue nouns: *Tee, Kaffee, Milch, Fahrkarte, Zug, Toilette, Fenster, Koffer, Uhr, Tasse, Glas, Bahnsteig, Gleis, Fahrplan, Ticket* all have frames in `web/public/assets/minigames/items*.webp`. Needed:

| Sprite | Status | Why |
| --- | --- | --- |
| `item-wagen-noun` (a railway carriage) | new | `a0-wagen` and Numbered Apples with carriage numbers; the lexicon gloss is "wheeled vehicle", so the painting shows a carriage |
| `item-ausgang-noun` (exit sign) | new | `a0-wo`; Fog Window picture naming |
| Ticket with a fading name | new prop | The examinable ticket in `a0-ticket` and `a0-name`: three states, dark ink, pale ink, blank, matching the existing three lantern states pattern |
| Letter and sound tiles for the sounds board | reuse | The Scrambled Sign's lower-case tile style; ä ö ü ß tiles need adding if the tile set is glyph-limited (check `word-games.ts`) |
| Numbers one to seven | reuse | Numbered Apples already renders spoken numbers; the carriage variant swaps the apple frame for `item-wagen-noun` |

### 9.4 Audio

| Asset | Status | Notes |
| --- | --- | --- |
| Conductor voice | new | One entry in `scripts/tts/voices.json`: English description (man around 50, calm, formulaic announcer's cadence, very clear), a German `referenceText`, and the committed reference `art/source/voices/schaffner.wav` plus transcript |
| Dialogue clips | new | About 60 lines across seven graphs, plus simpler variants and the two glossed story words, rendered to `web/public/audio/dialogue/<clipId>.ogg` by `qwen_tts.py`; every A0 line needs a clip (the audit requires it). Lines containing `{name}` stay silent, as today |
| Slow variants | none | Echo · slower is a playback rate, not a separate clip |
| Word clips | reuse | The course manifest already has 4,328 Anna-voice clips covering the prologue lexemes and numbers |
| Train foley | new | Four to six UI clips in `web/public/audio/ui/` with provenance entries: wheels on rails loop, a whistle, a compartment door, brakes into the station, a cup set down. Deterministic synthesis like the existing twelve clips, or short recorded samples with a licence note |
| Sounds-board cues | new | One clip per taught sound (about 14): a single syllable such as *ä*, *ei*, *ie*, *ch*, *sch*, spoken by the narrator voice. Qwen renders them like any job |
| Music | reuse | The existing world music; the prologue can duck it to the wheel loop |

### 9.5 Mini-game and board art

| Asset | Status | Notes |
| --- | --- | --- |
| Sounds board backdrop | new | One 1536 × 1024 painting of the fogged compartment window, where letters appear in the condensation; registered in `web/src/minigames/scene-art-data.json` like the workbench |
| Round backdrops for Echo Bells, Fog Window, Lantern Pairs, Scrambled Sign, Night Train, Numbered Apples | reuse | The lantern-round host supplies them |
| Carriage lane props for Numbered Apples | reuse plus one frame | The crate and lanes exist; the falling item is `item-wagen-noun` |

### 9.6 Content and data (authored, not painted)

| Asset | Where |
| --- | --- |
| Seven dialogue graphs with `allowedWords`, two glossed words each at most, investigations, topics | `content/source.json` → `graphs` |
| Seven quests with intro sentences, objectives, rewards, exercises (seven each, by the existing id scheme) | `content/source.json` → `quests`, `server/curriculum.json` |
| Fourth chapter *Prologue: the night train* | `content/source.json` → `chapters` |
| Choice-gate replies for six scenes | `beginnerGateTranslations` in both `content/source.json` and `web/src/beginner-dialogue.ts` |
| Two interiors (compartment, dining car) with floor polygons, objects and encounters | `content/source.json` → `interiors`, `web/src/interiors.ts` |
| Conductor NPC entry, greeting sentences, routine | `npcs`, `greetings`, `npcRoutines` |
| Ink registry entries for the ticket name | `content/story-mechanics.json` |
| Content identities for every new sentence and quest | `content_ids.json`, `content/published-content-ids.json` |
| Turkish overlay for every new unit and UI string | `web/src/data/i18n/tr-story.json`, `tr-ui.json` (the i18n audit fails without them) |
| Syllabus and audits regenerated | `node scripts/build-syllabus.mjs`, `npm run assets` |
| Prompt files and a README for the new masters | `art/source/interiors/train-*-prompt.txt`, `art/source/minigames/`, `docs/prompts/` |

### 9.7 Counts

| Kind | New masters |
| --- | --- |
| Room paintings | 3 (compartment night, compartment dawn, dining car) |
| Sprite sheets | 2 (train furniture, window frames) plus 1 optional landscape strip |
| Item and prop sprites | 2 nouns, 1 three-state ticket prop |
| Character | 1 recipe, 3 portraits |
| Voice | 1 reference, about 60 dialogue clips, about 14 sound cues |
| Foley | 4 to 6 clips |
| Board backdrop | 1 |

Everything else the prologue needs is already in the repository.

## 10. Review of `codex/a0-prologue` (2026-10-17)

The branch (two commits, `5cb29e9c` and `cc2dd9f6`) implements all five phases at once and `npm run verify` passes on it. The engine work is sound. The content and the art are not, and the audits were adjusted so that the thin content passes. Checked from the code and the exported assets, not by playing.

### What holds up

- Level plumbing: `'A0'` through web, scripts and Go; fourth chapter; server-enforced prologue order; prologue scenes gated to the interior rather than town proximity; optional for existing accounts.
- Onboarding question and the placement hand-off after two misses; meanings on by default; slow echo without the power; the name gate recorded as supported practice; silent mode and Turkish entries for every new unit; clips for every line; foley synthesised with provenance.
- The sounds board exists and is skippable.

### What is wrong

1. **The scenes are not conversations.** Each graph is three to five fragments and the conductor speaks the player's lines: *Ich heiße {name}*, *Einen Tee, bitte*, *Ich verstehe nicht*, *Noch einmal, bitte* and *Wo ist …?* are all conductor lines. Every gate prompt is "Choose the reply you have just heard", so the player echoes the last line and comprehends nothing. *Name?* / *Name.* and *Wo ist …?* with an ellipsis are not utterances anyone says. The examinable objects repeat a line already spoken. Nothing happens in any scene; the one rule appears only as a flag that swaps a ticket sprite. The plan's scene table had the same word counts with real exchanges; the branch kept the counts and dropped the exchange.
2. **`a1-arrival` was gutted, not trimmed.** Fifteen lines became six telegraphic ones, the Otto and Voss standoff is gone, the completion line is *Marta ist hier.*, and the optional topics read *Voss: Messingamt. Namen, Namen, Namen.* The cliff did not disappear: `a1-cafe` now shows 75 new lexemes (36 before) because arrival no longer pre-teaches anything.
3. **The audits were bent to the content.** `openingPacingViolations` fails `verify` if arrival exceeds 40 lexemes, which now locks the gutted scene in. The A0 audit counts the seven numbers as one unit while intake counts nine lexemes for `a0-wagen`. A four-word turn limit with no minimum rewarded fragments. `requiredPathLexemes` is a second, softer number beside the real one.
4. **The rooms do not match the game.** Every other interior is a top-down orthographic plan (compare `interior-cafe-room`); the two train rooms are deep one-point perspective paintings. The branch added `perspectiveBodyHeight`, a per-row body-scaling rule used only by these rooms, and top-down walking sprites will still look pasted onto a vanishing-point floor. The paintings themselves are attractive and worth keeping as backdrops, not as walkable floors. All seven "scenes" are hotspots in the two rooms, two of them at identical coordinates, so nothing in the prologue needs walking.
5. **The conductor does not match the cast.** The portrait is a dark realist oil study; the cast portraits are bright storybook illustration with a scene behind the figure (compare `otto-neutral`). The walking sprite comes from the kit without a uniform or cap component and reads as a man in a blazer and skullcap. The NPC is literally named "Otto's colleague" in the dialogue header, and the pipeline generated A1, A2 and B1 greetings and two title clips for a character who exists only in the prologue.
6. **Smaller:** the furniture sheet has colour fringe pixels around several objects; dawn is a flat 18 percent orange rectangle over the whole room; `verify` ran 183 s against the 180 s target, as the branch's own doc states.

### Recommended path

Keep the branch's engine, onboarding, server and audio work. Replace the content and the presentation:

- Rewrite the seven graphs to the scene table in section 3: the conductor asks, the player answers, each scene has one thing that happens (a ticket handed over, a name darkening, a count out of the window, a tea ordered, a door found, a request to slow down, an arrival). Gate prompts ask for the reply that fits, with the heard line as a distractor, never the answer.
- Restore `a1-arrival` from `main` and trim it by moving Otto's lantern monologue into the existing topic, keeping the standoff, the choice and its ids. Replace the hard 40-lexeme gate with the plan's acceptance numbers as a report, and fix the number-batch rule so the dialogue audit and intake count the same thing.
- Present the prologue as seated conversations over the painted backdrops, with the hotspots as objects on screen, and remove `perspectiveBodyHeight`. If walkable rooms are wanted later, repaint them top-down like the café.
- Repaint the conductor's portraits in the cast style, give the recipe a cap and uniform coat component or accept a repainted sheet, name him (*Herr Brandt* costs no lexeme), and prune the unused greeting and title clips.

## 11. Re-implementation (2026-10-17)

The recommended path above was taken one step further: the prologue is now the game's tutorial level, documented in `docs/a0-prologue.md`. The two perspective backdrops, the static conductor art and every `backdrop` code path were removed. A new top-down carriage (night and a pixel-aligned dawn edit, generated with Codex image generation) is a walkable painted room with one floor polygon; Brandt walks to a station per beat; story objects are scoped to the beats that use them; a coach names the next action and drives the world beacon. The seven graphs were rewritten as exchanges in which the player answers, with reply meanings faded from beat 4, one typed answer (the name), and a phrase card after each beat. Engine, server, onboarding and audit work from the branch is kept, with two server-side fixes: A0 reply exercises are now exported into the story rules, and evidence requested after the reply is readable at the choice stage.

