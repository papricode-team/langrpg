# A0: the night train (tutorial level)

The prologue is the game's tutorial and the default starting point of every new German story. After choosing languages and a character, the player wakes in a night-train carriage on the way to Lindenhafen. Saved story progress resumes an unfinished train journey across devices; existing adventures already in town keep their place. Over seven short beats players learn how the game is played and say their first German sentences. Everything happens in one walkable room, so the controls taught here are the controls used everywhere afterwards. A0 is a story label, not a CEFR level.

This replaces the first implementation in PR 20, in which the seven scenes were dialogue boxes over two static perspective paintings: the player never walked, the conductor said the player's lines and each gate asked the player to repeat what they had just heard (see the review in `docs/a0-prologue-plan.md` §10).

## Design rules

1. **One game verb and one phrase family per beat.** Each beat introduces exactly one new way of playing (walk, talk, look, answer, follow directions, ask for a repeat, leave) together with the German that needs it.
2. **The player answers; the conductor never speaks the player's lines.** Every gate is a reply to a question. Wrong options are other phrases already taught, so a correct answer requires understanding, not echoing the last line.
3. **Support fades on a schedule the player can see.** Brandt's lines always show their meaning in A0. Reply options show English in the first three beats only; from the tea beat on they show German alone, and a tap on any word still shows its meaning.
4. **Every new phrase comes back.** *Bitte* and *Danke* appear in every beat, *Guten …* opens three beats, *Ja/Nein* return after the tea, and *Ich verstehe nicht / Noch einmal, bitte* prepares the first gate of `a1-arrival`.
5. **The story rule is felt, not explained.** The name on the ticket is fading. Saying it aloud darkens the ink. Otto explains the rule in Lindenhafen; on the train the player simply experiences it.
6. **The coach teaches by pointing, then lets go.** A small painted card names the next action and the golden beacon marks where to go. In the direction beat the beacon is withheld on purpose: the player has to go where Brandt says *Da!*.

## The carriage

`art/source/interiors/train-carriage-night.png` is a single 1536 × 1024 top-down painting in the same camera as the café: compartment nook on the west, washroom door and fern in the middle, dining counter with samovar in the east, and the carriage door in the south-east corner. `train-carriage-dawn.png` is the same frame relit for morning (an image edit of the night frame, pixel-aligned), and the room crossfades to it in the last beat. Both were generated with Codex image generation; the exact prompts are beside the PNGs.

The room uses `presentation: 'painted'`: the painting replaces the room-kit floor, and the floor polygon drives the normal navigation grid. Brandt walks to a station per beat (`prologueStations` on the NPC). Interactive objects carry the beats in which they are available (`prologueBeats`), so nothing is clickable before the story needs it.

| Object | Beat | What it does |
| --- | --- | --- |
| Ticket on the compartment table | 1, 2 | Required in beat 1 (the name is fading); optional in beat 2 (the ink is dark again) |
| Window by the bench | 3, 6, 7 | Required in beat 3 (count the seven carriages as the track curves); optional later (*Lindenhafen? Nein, noch nicht.* at night, *Guten Morgen, Lindenhafen!* at dawn) |
| Washroom door | 5 | Follow Brandt's *Da!* — *Toilette: besetzt.* Brandt then finishes the scene from where he stands |
| Fogged compartment window | any | Optional: Letters and sounds board |
| Samovar | 4 | Optional: *Tee. Kaffee.* |
| Carriage door | 7 | Leave the train for platform seven |

## Beats

| # | Quest | Verb taught | German | Gate (the player's reply) |
| --- | --- | --- | --- | --- |
| 1 | `a0-ticket` | Walk; talk; tap a word; look at an object | *Hallo! Guten Abend! Die Fahrkarte, bitte. Bitte. Danke.* | Hand over the ticket: **Bitte.** |
| 2 | `a0-name` | Write your own name; the ink rule | *Ich heiße Brandt. Und Sie? Wie heißen Sie? Der Name bleibt.* | **Ich heiße …** (own name) |
| 3 | `a0-wagen` | Look out of the window; listen again | *Eins … sieben. Wagen sieben. Hier!* | Which carriage? **Sieben.** |
| 4 | `a0-tee` | Replies without English; a real choice | *Kaffee? Nein, danke. Tee? Ja, bitte!* | Refuse politely: **Nein, danke.** |
| 5 | `a0-wo` | Follow directions without a beacon | *Wo ist die Toilette? Da! Besetzt!* | **Wo ist die Toilette?** |
| 6 | `a0-langsam` | Echo · slower; asking for a repeat | *Verstehen Sie? Ich verstehe nicht. Langsam. Noch einmal, bitte.* | **Ich verstehe nicht.** |
| 7 | `a0-morgen` | Time passes; leave through a door | *Guten Morgen! Bahnsteig sieben. Auf Wiedersehen!* | **Auf Wiedersehen!** |

Beats 1, 3 and 5 require walking to an object between talking and answering, so the walk–talk–look loop that the whole game uses is practised three times before Lindenhafen. Each beat ends with a phrase card that lists what the player can now say, with audio, and offers one practice round from the existing roster (Echo Bells, The Night Train with the player's name, Numbered Apples, The Fog Window, Lantern Pairs, The Scrambled Sign).

The complete script is in `docs/screenplay.md` under *Prologue — the night train*; `content/source.json` is the only copy of the data.

## Coach

`web/src/tutorial-coach.ts` decides the coach step from story progress and a few local facts (has the player walked, opened a conversation, tapped a word). It is a pure function with unit tests; `main.ts` renders the result into the painted objective plaque. The coach only runs while an A0 quest is incomplete and the player is in the carriage. Steps:

- *Walk*: WASD, the arrow keys, or tap the floor.
- *Talk*: walk up to Brandt and press E, or tap him.
- *Tap a word* (inside the first conversation): every German word shows its meaning.
- *Look*: walk to the glowing object and press E, or tap it.
- *Your turn*: choose what you would say.
- *Without English* (beat 4): the replies now show German only; tap a word to peek.
- *Go where he points* (beat 5): no beacon.
- *Too fast?* (beat 6): Echo · slower.
- *Leave the train* (beat 7): walk to the carriage door.

## Content and support

The engine work from PR 20 is unchanged: the A0 level tag, the fourth chapter, server-enforced prologue order, the supported reply gates, the name gate recorded as supported practice, the onboarding question, Turkish overlay and the dialogue-level audit with `allowedWords`. The Letters and sounds board no longer interrupts the first scene; it opens from the fogged window and from the prologue controls.

## Verification

```sh
npm ci
npm run verify
ATLAS_UI_SURFACES=prologue,prologue-dawn,sounds npm run verify -- --ui
ATLAS_UI_URL=http://127.0.0.1:5173 node scripts/check-prologue-flow.mjs
```

The last command needs an isolated local API/Vite server. It creates a guest, follows the coach through all seven beats into the arrival scene, and fails unless the coach taught walking, talking, looking, answering, following directions and leaving, exactly one answer was typed (the name), and every reply was submitted as supported recognition.
