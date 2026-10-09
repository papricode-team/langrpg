# Lantern Atlas curriculum

German for English speakers. Content edition: 2026-10-08.

The playable content contains **18 quests, 126 contextual learning targets and seven recurring characters**. A1, A2 and B1 identify the intended practice band. They do not certify proficiency. This release has reading, listening with bundled German MP3 audio, sentence construction and constrained written production. It has no microphone or speaking assessment, and it is not a complete A1–B1 course.

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

Each quest has seven exercises with a short hint and corrective explanation. The story supplies a purpose, but correctness is measured on the language task. All chapters are available for exploration; unlocking a quest is not evidence that its language has been mastered.

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

Typed responses are constrained tasks with canonical answers and selected variants. They do not judge unrestricted writing, every valid German paraphrase or pronunciation. Capitalization, extra spaces and terminal punctuation may be normalized; umlauts and `ß` carry meaning and should not be silently removed. Feedback should show an example formulation without suggesting that every unlisted wording is ungrammatical.

## Review without a grind

Each contextual phrase has a stable item ID. Recognition, listening and production evidence must remain distinguishable. A correct multiple-choice selection does not demonstrate the ability to produce the phrase independently.

The backend uses upstream `go-fsrs/v4` version 4.0.0 with separate cards for recognition, listening and production. Its configuration requests 90% retention, caps intervals at 365 days, and uses a ten-minute learning/relearning step. Incorrect answers map to `Again`; independent correct answers map to `Good`. Supported correct answers are practice and do not grade an FSRS card. Early correct encounters with an established review card do not repeatedly inflate stability or award farmable XP. A strong item can still appear naturally in a new scene without demanding a drill each time. The retention setting is a scheduler target, not a guarantee or an individually optimized model.

The current item is a whole sentence or chunk. It is not a full lexical graph: recalling one item does not yet transfer mastery automatically to every occurrence of the same lemma. Review must offer independent retrieval when possible: repeating supplied sentence tiles forever cannot demonstrate unaided recall. Richer future review should reuse a target in another context and move from recognition toward unsupported production. Review pressure needs a session budget, mixed tasks and narrative variety; returning players should not face an endless backlog before they can continue the story.

## Content and server contract

`web/src/content.ts` exports `Level`, `ExerciseMode`, `Exercise`, `Quest`, `NPC`, `chapters`, `npcs`, `quests`, `vocabulary` and `npcQuests`. `server/curriculum.json` is the server's canonical grading and completion manifest.

- Quest IDs are the values in the progression table.
- Exercise IDs are `<quest-id>-exercise-1` through `-7`.
- Item IDs are `<quest-id>-item-1` through `-7`.
- All seven item IDs are required for their quest. A1/A2/B1 completion rewards are 40/60/90 XP respectively.
- Manifest modes map choice to `recognition`, listen to `listening`, and sentence/type to `production`; support is recorded separately.
- The server derives correctness from `exerciseId`, the matching `itemId`, the submitted answer and the canonical accepted answers. The client cannot invent learning targets or submit a trusted correctness flag.
- A changed answer, added accepted variant or changed required item must be updated in both content and manifest. Stable IDs should survive copy edits; semantic changes need a migration decision.

## What a complete course still requires

Before claiming an A1, A2 or B1 outcome, add a reviewed syllabus with sufficient topic and form coverage, accessible audio recorded by speakers, many unseen transfer tasks, longer reading and writing, independent assessment and a speaking path outside this microphone-free release. Have a qualified German educator review wording, progression and corrective feedback. Evaluate retention after delays rather than using quest completion or XP as the success metric.
