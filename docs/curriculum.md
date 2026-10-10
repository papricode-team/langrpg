# Lantern Atlas curriculum

German for English speakers. Course edition: `de-en-a1-b1-2026-10-09`. Implementation reviewed 2026-10-10.

The playable content contains **18 quests, 126 contextual learning targets and nine authored characters**, including the seven original town residents, the inspector and Elise. A1, A2 and B1 identify the intended practice band. They do not certify proficiency. This release has reading, listening with bundled German MP3 audio, sentence construction and constrained written production. It has no microphone or speaking assessment, and it is not a complete A1–B1 course.

## A world worth understanding

The Lantern Atlas draws railway routes from honest agreements between people. In Lindenhafen, an unmapped platform appears, tomorrow's café receipt loses a customer's name, and a numbered brass seal links apparently ordinary errands to the Brass Office. A blank parcel page carries a message from an erased village: “Before you erase us again, come.”

The A2 region, Waldruh, is an autumn village caught in a missing hour. Each repetition erases another resident's name. Its Unwritten Circle wants to restore the railway while keeping a say in how it returns; the Lamplighters want to reopen every route immediately. Ada helped file the former keeper Elise Sander's protective closure order. The Brass Office later edited its conditions and treated silence as consent. The clockmill's missing brass hand leads to Nebelstadt.

The B1 region, Nebelstadt, contains a harbor, council archive, observatory and lighthouse. Its dark beam records silence as consent, and the seventh great bell threatens another erasure. Players compare conflicting testimony, distinguish motives from excuses, negotiate practical alternatives and coordinate help during a storm. The final truthful agreement restores the railway without hiding what happened. A fourth coastline appearing in the Atlas leaves the adventure open for later languages and regions.

The three regions have separate painted environments and connected paths. Existing quest identities and German exercises remain stable. Story discoveries follow completed quests, so clues build across the journey instead of revealing the final answer on arrival. The recurring residents travel with the investigation; the café kettle and opinionated onions provide humor alongside the mystery.

German remains useful outside the fiction: ordering, travel, housing, work, plans, explanations and clarification. Magical details motivate encounters; unusual fantasy nouns are not the core vocabulary.

| Character | Place | Story function |
| --- | --- | --- |
| Marta | Café and apartments | Everyday hospitality, housing and unexplained letters |
| Otto | Station | Timetables, practical journeys and a concealed route |
| Lina | Post office | Deliveries, witnesses and an impossible sender |
| Emil | Workshop | Tools, repairs, work and a clock with conflicting records |
| Ada | Archive | Comparing evidence, collective memory and the final agreement |
| Fritz | Market | Shopping, food, plans and the lantern festival |
| Greta | Garden | Community care, advice, weather and environmental choices |

## Progression

Each quest retains seven exercises for optional practice. Its narrative path requires authored investigation evidence and a saved German response from the current in-world conversation; these eighteen production gates replace a mandatory seven-exercise queue. The server checks the active quest, evidence, character proximity and owned answer receipt before applying the story choice. The clue chain unlocks Waldruh after `a1-lost-parcel`, Nebelstadt after `a2-archive`, and the coastline after `b1-atlas`. Learning practice remains available separately. Completing a narrative quest demonstrates its constrained response, not mastery of a whole language level.

| Quest ID | Title | Communicative focus |
| --- | --- | --- |
| `a1-arrival` | A rather unusual arrival | Greetings, introduction, help and repetition |
| `a1-cafe` | Coffee with a side of prophecy | Ordering, prices, requesting the bill |
| `a1-market` | The runaway shopping list | Groceries, quantities, payment and prices |
| `a1-station` | Platform two and a half | Location, departure, platforms and delay |
| `a1-workshop` | Emil's extremely normal lamp | Objects, location, simple requests and problems |
| `a1-lost-parcel` | A parcel for yesterday | Addresses, directions, delivery and apology |
| `a2-apartment` | The room with a travelling view | Housing, ongoing situations and repair requests |
| `a2-evening-plans` | Dinner before the moon falls | Arrangements, preferences, reasons and rescheduling |
| `a2-rail-trip` | The express to almost somewhere | Connections, disruptions, comparison and cancellation |
| `a2-broken-clock` | Yesterday's repairs, tomorrow's trouble | Past actions, sequence, instructions and explanation |
| `a2-clinic` | A mild case of lantern fever | Symptoms, appointments, advice and documents |
| `a2-archive` | The librarian remembers differently | Past experience, change, comparison and clarification |
| `b1-witness` | The witness who arrived before herself | Connected accounts, uncertainty and contradictions |
| `b1-new-route` | A town worth reconnecting | Conditions, alternatives, proposals and trade-offs |
| `b1-work` | The job description has escaped | Experience, responsibilities and working conditions |
| `b1-council` | The council of inconvenient opinions | Opinions, reasons, respectful disagreement and compromise |
| `b1-storm` | The weather has read the timetable | Disruption, advice, consequences and collective action |
| `b1-atlas` | The page nobody wanted to write | Summary, motives, clarification and agreements |

The first chapter introduces simple main clauses, questions and useful request chunks. A2 adds perfect-tense accounts, comparison, sequence, ongoing situations with `seit`, reasons and polite requests. B1 adds connected clauses, relative clauses, conditions, reported evidence and qualified opinions. Complex forms receive explicit scaffolding rather than being used as a proficiency test. Grammar coverage alone does not define a CEFR level.

## Learning interactions

The release uses four reusable mechanics:

- `choice`: recognize the phrase that meets a concrete conversational goal. Answer options need to be shuffled.
- `listen`: understand a detail or main point in a German announcement or account. Bundled German audio supplies the listening source. A revealed transcript supports comprehension, but that attempt is not independent listening evidence.
- `sentence`: assemble a German response from shuffled word tiles. This is supported production because the words are supplied.
- `type`: retrieve a requested German chunk or short response. Hints turn it into supported practice. Explicit alternative answers are accepted where supplied.

There are 24 choice, 29 listening, 42 sentence and 31 typed exercises. The reference `german` and `english` fields support feedback and the vocabulary journal. Showing the reference German before a typed or sentence answer would reveal the solution.

Typed responses are constrained tasks with canonical answers and selected variants. They do not judge unrestricted writing, every valid German paraphrase or pronunciation. Extra spaces and terminal punctuation are normalized, while sentence starts, noun capitalization and formal `Sie` remain significant in story and course sentence production, as well as independent noun/formal-pronoun tasks. Production accepts the keyboard spellings `ae`, `oe` and `ue` for umlauts and one adjacent transposition or accidentally repeated/dropped doubled letter in a word of at least five letters. Ordinary substitutions, short-word errors, dropped umlauts (`schon` / `schön`) and `ß` / `ss` stay distinct unless an alternative is explicitly authored. Recognition and listening choices remain exact. Feedback names article, capitalization and word-order errors when possible.

Sentence practice adds plausible article, pronoun, verb and connector distractors to the canonical answer tiles. Listening choices stay in German. `node scripts/build-story-curriculum.mjs` generates the story's server grading contract; `node scripts/build-course.mjs` generates the course, conservative context maps and server activity-board definitions from their authored sources.

Corrective feedback classifies recognizable capitalization, article-ending and word-order errors. It is a heuristic over constrained answers, rather than a German parser: it can miss or misclassify a more complex error. Alternative-answer coverage is incomplete; 20 of the 73 original story production tasks currently list alternatives. Additional valid phrasing needs editorial review and explicit authoring.

The eighteen quests have short, optional contextual grammar notes linked to fifteen of the existing thirty-nine guides. Opening an explanation records support before the response is graded. These notes explain the form needed in that scene; they do not establish coverage of every form in a CEFR syllabus.

Bundled character clips use distinct installed macOS de-DE voices through `/usr/bin/say`, with stable clip IDs and selected simpler variants. They are synthetic voice sketches; no neural voice service or human voice-over has been integrated. The lexical pronunciation collection uses the installed Anna voice. Personalized names use an available German browser voice or a bundled name-free line. This provides playback but still needs pronunciation, pacing and character-performance review by German speakers.

## Review without a grind

Each contextual phrase has a stable item ID. Recognition, listening and production evidence must remain distinguishable. A correct multiple-choice selection does not demonstrate the ability to produce the phrase independently.

The backend uses upstream `go-fsrs/v4` version 4.0.0 with separate cards for recognition, listening and production. Its configuration requests 90% retention, caps intervals at 365 days, and uses a ten-minute learning/relearning step. Incorrect answers map to `Again`; independent correct answers accept `Hard`, `Good` or `Easy`, with `Good` as the default. The server records bounded response times for unaided attempts; speed alone never implies a rating. Supported correct answers are practice and do not grade an FSRS card. Early correct encounters with an established review card do not repeatedly inflate stability or award farmable XP. A strong item can still appear naturally in a new scene without demanding a drill each time. The retention setting is a scheduler target, not a guarantee or an individually optimized model.

Passive reading, NPC greetings and words occurring beside a practiced target record exposure without creating a recall deadline. Exposure migration version 2 clears older passive-only deadlines while preserving actual FSRS cards and supported-practice gates. Historical exposure counters remain informational. Passive counts currently leave the FSRS interval unchanged; they do not automatically transfer mastery between lemma senses. Review selects only previously practiced due modalities. The context mapper prioritizes exact headwords, ignores imported all-pronoun tables and omits unresolved homographs rather than crediting every possible word.

Activity submissions carry the authored scene ID and board state. The server checks ingredients and ordered actions, payment and change, evidence links, and road-adjacent delivery paths against generated scene definitions. Submitting a canonical exercise answer without the board does not pass a production mission. Board tasks supply contextual recognition; they do not establish unaided sentence production.

Optional placement samples eight existing conversational responses across A1–B1 through the same server attempt endpoint, with five German choices and three typed replies. Short town-character turns give the responses a purpose. Revealing their translation or answer hint records supported practice. Its recommendation selects a practice band saved as a browser preference. It does not skip acts or grant narrative evidence. The sample usually takes about two minutes and finishes after the current response once that time has elapsed. It is a practice suggestion, not a CEFR certification or validated placement instrument. Dialogue gloss helpers hide retained vocabulary by default and avoid resolving ambiguous inflections to the wrong headword.

The dialogue selector estimates known tokens from each word's retained recognition state and chooses the first authored version reaching 95% coverage. If no version reaches that threshold, it selects the version with fewer unknown tokens and offers glosses. Twenty-five simpler A1 variants accompany the 207 original graph lines; most lines have one authored version. The estimate does not measure actual sentence comprehension, word senses or current recall probability. It therefore supports reading without guaranteeing individually calibrated `i+1` input. `npm run assets` records the conservative dictionary-level audit in `docs/audits/dialogue-levels.json`, covering graph lines, their variants and the eight placement turns. Its above-level words include story nouns and ordinary words with coarse imported labels. Unmapped inflections, names and sentence patterns need editorial review; the flags do not validate a line's CEFR level. Ambient generated barks are outside this graph audit.

Contextual items remain whole sentences or chunks, while the extended course has separate lexical identities and cards. Recalling a sentence does not transfer mastery automatically to every included lemma. The explicit review session contains at most eight encounters, including at most six word targets, and converts due contextual sentence tiles to typed retrieval. This provides a bounded session; richer review still needs more unseen contexts and validated transfer tasks.

Nearby residents can print level-appropriate course headwords as parcel-label barks. Practiced due words receive priority, resting cards are left alone, and new words can appear without acquiring a recall deadline. These template-based labels make the catalog available in the world; the release has not authored bespoke signs, menus, parcels and dialogue contexts for all 3,283 entries. Seeing a label records passive exposure. Independent learning evidence comes from the server-graded practice response.

The inn offers explicit review and rest. A promise asks for three saved correct responses, including supported practice; idempotent retries count once. Rest advances the player's story day and grows the lantern counter when that promise is complete. These are in-game days and completed promises, rather than a calendar-day attendance streak. The shared town clock is separate. The loop provides a gentle ritual but does not measure delayed retention or demonstrate improved return rates.

The reference audit measures normalized surface-form coverage: headwords, linked inflections or variants, and authored word-building tasks can satisfy a reference spelling. It does not cover every sense, grammatical use, publisher grouping or skill in the A1/A2/B1 references. Exact-headword matching and omitted ambiguous forms also leave some real words unglossed. Imported levels and surface coverage need qualified editorial review. See `docs/course-coverage.md` for the recorded mappings and exceptions.

The no-microphone contract remains in force. Speech playback and the fictional signal lantern do not assess pronunciation, spontaneous speech, interaction or listening-and-speaking competence. An optional speaking integration remains future work.

## Content and server contract

`web/src/content.ts` exports `Level`, `ExerciseMode`, `Exercise`, `Quest`, `NPC`, `chapters`, `npcs`, `quests`, `vocabulary` and `npcQuests`. `server/curriculum.json` is the server's canonical grading and completion manifest.

The course generator preserves the full `web/src/data/course.json` as its auditable source output and derives four compact browser files: metadata and A1/A2/B1 exercise sets. The browser assembles the same ordered exercises using their canonical source indices. Each transport file stays bounded, with build checks limiting the largest JavaScript chunk to 4 MiB. The split changes delivery, not exercise IDs, accepted answers or progress.

- Quest IDs are the values in the progression table.
- Exercise IDs are `<quest-id>-exercise-1` through `-7`.
- Item IDs are `<quest-id>-item-1` through `-7`.
- The manifest retains seven item IDs for each legacy practice quest. Current narrative completion uses the graph's investigation and current conversation proof. A1/A2/B1 completion rewards are 40/60/90 XP respectively and are awarded once.
- Manifest modes map choice to `recognition`, listen to `listening`, and sentence/type to `production`; support is recorded separately.
- The server derives ordinary language correctness from `exerciseId`, the matching `itemId`, the submitted answer and the canonical accepted answers. Activity submissions also require an authored scene and validated board solution. The client cannot invent learning targets or submit a trusted correctness flag.
- A changed answer, added accepted variant or changed required item must be updated in both content and manifest. Stable IDs should survive copy edits; semantic changes need a migration decision.

## What a complete course still requires

Before claiming an A1, A2 or B1 outcome, add a reviewed syllabus with sufficient topic and form coverage, accessible audio recorded by speakers, many unseen transfer tasks, longer reading and writing, independent assessment and a speaking path outside this microphone-free release. Have a qualified German educator review wording, progression and corrective feedback. Evaluate retention after delays rather than using quest completion or XP as the success metric.
