# Painted map to narrative RPG — implementation status

Updated in the 2026-10-10 workspace from the revised review of `e409bc7`.
This is a substantial implementation of the single-player systems in the roadmap.
The full multi-phase production roadmap is **not complete**. The distinctions below
are acceptance boundaries, not claims that untested production targets were met.

## Revised roadmap: regression and depth pass

Phase 0 is implemented: audible regenerated ambience, uninterrupted walking near
the cast, reveal-gated Elise interaction, opaque crossfade underlays, calendar-bound
unaided promises, varied listening distractors, weather beneath labels, a
Nebelstadt-only story storm, one night definition and HiDPI label resolution.
The person-scale camera is restored and interiors reframe on entry. Residents
finish their route home at closing instead of freezing in the street.

The Act I depth pass adds a server-graded greeting with Otto's in-character
correction. Optional practice cannot satisfy that scene reply; corrections remain
assisted after closing/reopening. Every Act I choice now records specific effects:
the receipt, Frau Berg's address, the station register, the lamp and Elise's letter.
Reporting the platform brings Voss back at the market; keeping it quiet earns
Otto's key. The key and Voss's ledger enable distinct archive routes, checked by
the server. A witnessed fallback preserves migrated saves. The ledger can later
be published before the council. Dialogue speaks in the first person.

Reporting the platform and three failed production replies add bounded bell
pressure that survives later milestones. A scene can warn once; at most two
warnings accumulate. The seventh bell is reserved for the finale, so a learner
can recover and finish. The three earned endings have different conversations,
camera staging, speakers and voice clips.

Act I now has a failing content gate for unapproved vocabulary and grammar across
lines, alternatives, corrections, choices and physical evidence. Explicit new
story words have English glosses and carry forward in quest order, with at most
two introductions per quest. Raw dictionary findings remain in the audit beside
the adjusted findings; this is an editorial quality check, not CEFR certification
or a measurement of an individual learner's known-token coverage. Additional
shorter alternatives support Acts II and III; their full level pass remains open.

The inn has a daytime host, a tea table and animated kettle steam using existing
art. All three towns have Tiled exports with parity checks. Larger districts,
new plates, cast walk/talk cycles, unique interior paintings, neural voice
production and the learner study remain the next production work.

Learning fixes include ß/ss support, accepted capitalization slips with gentle
guidance, shared TypeScript/Go grading fixtures and conservative use of response
time. Formal Sie and grammatical distinctions remain meaningful. Reviews ask for
Hard/Good/Easy after answering, through an authenticated read-only preview;
the saved reply creates one SRS event. Placement uses the same preview and cannot
create cards or XP. Placement still recommends practice locally; server-persisted
placement and story entry at later acts remain open. Expedition recall remains
open until its encounters have reviewable lexeme mappings.

## What is playable

The eighteen quests now use authored dialogue graphs rather than compulsory
seven-card exercise queues. The player approaches a witness, reads physical
evidence, returns to the witness, produces the required German, and chooses a
consequence. Objectives, inventory, faction reputation, discoveries, route gates
and the seven-bell story clock are persistent. Inspector Voss appears in each act;
Elise appears late in Act III. The letter, name on the ticket, succession and
erasure hooks have dialogue payoffs. The ending follows the earned choices.

The server checks quest order, physical location, evidence, current dialogue stage
and an owned successful scene attempt before accepting a consequence. A correct
answer in optional practice cannot open the narrative gate. Route checks apply to
initial connections, travel and reconnects. Waldruh opens after Lina's letter,
Nebelstadt after the archive revelation, and expeditions after the final Atlas
promise. Their encounters and planning outcomes now persist on the server.

Three narrative save slots preserve a point in the investigation. Language memory,
XP and the permanent reward ledger remain account-wide, so loading a slot cannot
farm rewards or manufacture forgotten vocabulary. A new painted inn room contains
evening review, the evidence board and sleep. Sleep advances the player's day;
the shared world clock remains shared. Three distinct unaided item/mode recalls
fulfil a promise on the server's UTC calendar date. The calendar ledger lives
outside narrative save slots; sleep and loading a slot cannot farm or rewind it.
Missed promises do not remove learning progress.

German dialogue uses tracked sentence help, per-word glosses, contextual grammar
and simpler authored variants chosen from measured word evidence. Strong known
words rest. Due, directly practised course headwords can return in bounded German
world barks and parcel labels. XP and discoveries unlock slower Echo audio,
Wordlight glosses, cosmetics and titles used in character greetings.

## Roadmap coverage

| Workstream | Implemented | Remaining acceptance work |
| --- | --- | --- |
| A1–A2 rendering/camera | DPR-aware canvas, Original default, optional Soft/CRT, larger player art, person-scale follow, direction look-ahead, conversation framing, cinematic pans and bell shake | Broader device/GPU performance testing; label and occlusion polish |
| A3 structured maps | Tiled export/import for canonical walkable polygons, obstacles, spawn and NPC/object positions; schema, crossing and reachability checks; runtime and server consume authored placements | Towns still use the existing 1536 × 1024 plates. New districts and multi-plate bounds are not implemented |
| A4 light | Continuous dawn/dusk tint, crossfaded day/night sprites, culled native point lights with a Canvas glow fallback | Normal-map lighting, bloom pass and authored long building shadows |
| A5 atmosphere | Bounded dust/firefly/leaf particles, Nebelstadt fog, Rain Arcade rain and Act III storm rain | Canal water shader, cloud shadows, smoke/pigeon choreography |
| A6–A7 life | Four directional views for the nine main cast members, turn-to-face, scenery-frame blending, time-based routine offsets and resident pace, shared clock, graded barks | Full walk/talk/sit/work pose sets, expedition cast revision, crowd avoidance, opening-hour interactions, boats and hourly trains |
| A8–A10 places/transitions | Painted inn home base in every story town; painted greenhouse train arrival/travel scenes; indoor transitions and audio; expeditions gated until post-game | Unique interior art per building per town, full parallax staging and iris discovery transitions |
| B dialogue/interaction | Graph validator and reachability tests, in-world portrait dialogue, German choices, production gates, tracked help, evidence inspection, optional practice, keyboard/HUD/walk fixes and gamepad movement | General inventory pick/give/use verbs; all dialogue remains accessible HTML over the live world |
| C story | Eighteen investigations, antagonist and Elise, named faction allies, graded opening greeting, item-dependent archive/council routes, specific Act I consequences, bounded bell pressure, route locks and three distinct endings | Learner/editor review of dramatic pacing; inspector stamping animation |
| D learning | Server production gates, contextual grammar, retained-word gloss policy, simpler variants, eight-question placement, specific feedback, German listening options, distractors, conservative typo/umlaut support, four review ratings, clean exposure mapping, server-checked boards and daily promises | Placement recommends practice rather than skipping story acts; educator verification of level/coverage, speaking extension and neural/human voices |
| E progression | Durable evidence/items/reputation, earned lantern features/titles, shared clock, personal days, three save slots, immutable reward receipts | Clock-gated events and party instances |
| F audio | Enabled Phaser audio, three day and three night music sketches, audible regenerated regional ambience, footstep/door/bell sounds, dialogue ducking, 373 stable dialogue/evidence/grammar/cinematic clips | Composer refinement, adaptive arrangement and professional cast recording |
| G architecture/tooling | Dialogue/quest/state/event modules, separate cutscene scene, JSON graph content, generated server rules and grading manifests, Tiled tools, unified active asset exporters, CI/lint/tests/budgets, bounded local FPS statistics, dead Pages code removed | Further `main.ts` extraction; dedicated Dialogue/UI/MiniGame Phaser scenes; normalized persistence; lazy course loading and source deduplication; historical art-source LFS migration |
| H multiplayer | Existing regional presence/chat/interior sharing preserved, shared clock and route authority | Cooperative quests, evidence trading, emotes and glossed chat bubbles |

The exact counts are useful for validating coverage, not for assessing game quality.
The next acceptance milestone is a learner playtest of the opening investigation,
followed by the new district art and full animation/lighting work.

## Learning claims and limits

The generated line audit at `docs/audits/dialogue-levels.json` measures matches to
the project's dictionary. It flags unknown surface forms; it does not certify
CEFR, handle every inflection, or establish 95–98% comprehensible input. Raw A1 findings distinguish introduced story words and bounded grammatical/name
resolutions from unsupported vocabulary; Act I must pass the stricter adjusted
gate. Many A2 lines still have flags. Shorter variants reduce difficulty but do not
guarantee an i+1 lesson for every learner. See `docs/curriculum.md` for placement,
grading and retention definitions.

Per-character dialogue audio currently uses distinct **installed macOS de-DE
voices**, encoded at 112 kbps. These are offline voice sketches, not neural or
human VO. A chosen name stays in the displayed text; the browser reads the name
when a German speech voice is available, otherwise a recorded name-free line
plays. Static clips have stable IDs and the build verifies their current texts.

Optional speaking remains absent. No microphone or speech assessment is required.
The ten-learner study, next-day return rate, antagonist recall, canvas-time share
and seven-day delayed retention targets have not been measured. Local FPS
statistics are diagnostic only; they send no analytics.

## Assets and reproducibility

New source images and provenance are under `art/source/story-cast/`: main-cast
directions, Inspector/Elise, the inn room and greenhouse train. Image generation
used the built-in ImageGen tool. Exact main-cast/train prompts are retained;
Inspector/Elise and inn files explicitly identify their retained generation briefs
as reconstructions. Transparent atlas exports and foot registration are produced
by `scripts/prepare-story-cast.mjs`. New story-cast PNG sources are LFS-managed;
existing historical source history has not been rewritten.

```sh
npm run assets                  # canonical content, map validation and server export
npm run assets -- --art         # active painting exporters in dependency order
npm run assets -- --audio       # audio sketches; macOS voices and ffmpeg required
npm run maps:check
npm run test:tooling
npm run lint
npm run check
npm test
npm run build
npm run budgets
```

Music and sound effects are original procedural sketches generated by
`scripts/generate-world-audio.mjs`, with provenance in `web/public/audio/world/`.
The complete course remains canonical in `course.json`; four derived runtime
files preserve exact exercise order and have a deep parity check. Build budgets
cap individual JavaScript chunks at 4 MiB and total JavaScript, including the whole
offline curriculum, at 12 MiB. Painting caps are 2 MiB per file, 16 MiB per story
town and 100 MiB in total. Audio is capped at 1 MiB per clip and 80 MiB overall.
Splitting the course bounds individual parsing units;
it does not make the complete course payload smaller.

## Validation

The revised pass checked 473 frontend tests across 48 files and 24 tooling tests.
Lint, type checking, generated geometry/content validation, the production build
and asset/audio budgets pass locally. Go vet and the
complete race-enabled server suite cover grading, idempotency, ordering, owned
gate receipts, bell pacing, save replay rewards, route membership, daily promises
and server expedition/board state. Tests use the development JSON store; a live
PostgreSQL deployment and production rollout were not exercised in this chat.

Earlier implementation browser acceptance used an isolated guest and development store: Otto's lines,
two physical evidence items, incorrect formal `sie` feedback, the corrected
production gate, a consequential choice, XP/title reward and platform cinematic.
The saved investigation survives reload; the atlas shows later towns locked.
The inn's keyboard interaction and sleep advance the personal day, and the named
story slot restores day 2 with 48 XP and the earned title intact. The game and
dialogue were checked at 390 × 844 and the default Retina viewport, including
resizing between them. A canvas CSS resize defect and short-tap interaction defect
found during this check were corrected. There were no new console errors after
the final audio assets were installed. Screenshots are saved in
`docs/screenshots/roadmap-dialogue.png` and `docs/screenshots/roadmap-mobile.png`.

The revised pass uses a separate temporary guest store and local preview. It
verifies the authored wrong-greeting correction, successful greeting, simpler
opening lines, both physical evidence records, formal-Sie feedback, the production
gate and Otto's key consequence. Screenshots are
`docs/screenshots/roadmap-greeting.png` and
`docs/screenshots/roadmap-depth-choice.png`. Tests additionally cover exact retry
payloads after a lost response, assisted replies, stale conversation responses,
item-gated choices, ending staging, calendar/save isolation and read-only
placement/review previews. This browser pass does not constitute the planned
learner study.

The revised mobile check at 390 × 844 follows the next objective to Marta and
checks readable labels, person scale and touch controls. Its screenshot is
`docs/screenshots/roadmap-depth-mobile.png`. The default viewport is restored and
the local preview remains open. No browser warnings or errors were recorded.
Rebuilding canonical content leaves all eleven generated manifests byte stable.
