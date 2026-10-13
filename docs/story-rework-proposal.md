# The Lantern Atlas — story rework proposal

> **Status (2026-10-13).** **Act I is implemented** (commit `7dd9507`, "Rebuild Act I as one clear path of eighteen A1 scenes"): the six main scenes were rewritten to the simplified spine and twelve everyday scenes were added, for 18 A1 scenes and 30 quests overall. The one magic rule is "names fade unless somebody says them aloud"; platform seven is a real old platform; the kettle and the tomorrow-dated receipt are gone; Frau Berg is a retired teacher at Gartenstraße 7 who carries the act; Greta runs Lindenhafen's pharmacy and garden. The current rules are in `docs/story-bible.md`, the scenes in `docs/screenplay.md`.
>
> **Where Act I differs from this proposal.**
> - The everyday scenes are **part of the linear chain**, not optional side scenes: the player passes through all 18 in order (6 story scenes and 12 errands). A save already past an inserted errand may skip it (`everydayQuestIds` in `web/src/progression.ts`).
> - The twelve errands are: `a1-timetable`, `a1-room`, `a1-shopping`, `a1-neighbour`, `a1-pharmacy`, `a1-directions`, `a1-weather`, `a1-bike`, `a1-phone`, `a1-invitation`, `a1-lost-found`, `a1-departure`. They use plain `a1-` ids rather than the proposed `a1-e01-…` ids, and the set differs from the table below (for example there is no separate breakfast errand, and the act closes on a ticket-buying errand).
> - Errand choices set one flag each (no faction or item effects); the story scenes keep their choice ids and effects.
> - Voss appears in more Act I scenes (station, phone, departure) than the table assumes.
>
> **Still pending:** Acts II and III (their 18 everyday scenes, simplified magic and whimsy trimming, Elise's earlier motive hint). The pacing audit still shows several Act I scenes above the ten-new-lexemes target (see `docs/pacing.md`).

Goal set by the team on 2026-10-13: make the story **consistent**, **easy to follow**, **easy to understand**, and **wider**, because the game exists to teach German. This document proposes how. It changes no files yet. Companion documents: `docs/screenplay.md` (the current story, scene by scene, with the whimsy audit in Appendix C) and `docs/story-bible.md` (the current rules).

---

## 1. Why the current story is hard to follow

Taken from the screenplay read-through.

1. **Too many magic rules at once.** Fading ink, a platform that only exists when a lantern is lit, a door joining two towns, a clock that repeats an hour, a key that closes routes from inside, a machine that erases names, a bell that counts silence as consent, a lamp that hunts addresses, post delivered to yesterday, receipts dated tomorrow. A learner meeting German for the first time also has to learn a new physics every scene.
2. **Whimsy competes with the plot.** About 45 lines are running gags (pigeons, the fern, the lamp as a daughter, registered pillows). They are funny in English and noise in A1 German.
3. **Key facts arrive late or only in a journal card.** Elise's motive (a children's train, stones on the track) appears for the first time in the final scene. The "voice in two places" hearing is set up only in a journal paragraph, never in dialogue.
4. **The same fact is told twice.** 17:59 is deduced in scene 9 and retold by Elise in scene 18. "Before you erase us again" is explained by Ada in scene 12 and again by Elise in scene 18.
5. **The emotional anchor never appears.** Frau Berg drives six scenes and is never seen.
6. **Choices are not legible.** Every scene offers "report / protect" or "restore / consult" with little visible consequence until the ending, and the third ending is unreachable for half the players.
7. **The story is thin for the budget.** 18 scenes carry about 800 lexemes in 8–12 hours. The target is 2,000 words over 200 hours. The story must get wider, not denser.

## 2. Design principles for the rewrite

- **One magic rule, stated in scene 1 and never added to:** *Whatever nobody says aloud fades from the Atlas. Say it in German and it stays.* Every other device is either an ordinary object or an application of that rule.
- **One mystery, one antagonist, one choice.** Who closed the route (answer: Elise, then Voss made it permanent). What do I do with the key she left me (reopen it with the towns' consent, or alone).
- **Each act ends with the player able to say in one sentence what they now know.** Those sentences are written down below and nothing may contradict them.
- **Every fact is revealed once, in dialogue, by a person who would know it.** Journal cards summarise; they never introduce.
- **Everyday German first.** A scene is built around a situation a learner will meet in Germany (ordering, asking directions, a repair, a doctor's visit, a job, a meeting). The plot is the reason to have that conversation, not the subject of it.
- **Comedy from character, not from physics.** Otto is strict, Fritz is generous, Emil is messy, Voss is formal. No sneezing plants, no flying lamps.
- **Choices show their result in the next scene**, in one line, so the player can follow cause and effect.

## 3. The simplified spine

**Premise.** Three towns on one railway: Lindenhafen on the coast, Waldruh in the forest, Nebelstadt in the mist. Years ago the route between them was closed. Since then the towns have been forgetting each other: names, addresses, departure times fade unless someone says them aloud. Elise, the Keeper of the Atlas, sends the player a ticket and the key that can reopen the route. She cannot do it herself, because she is the one who closed it.

| Act | Town | Level | Question | What the player can say at the end |
|---|---|---|---|---|
| I | Lindenhafen | A1 | Who sent me this ticket, and why are people being forgotten? | "Names fade when nobody says them. A woman called Elise is waiting for me in Waldruh. My neighbour Frau Berg has already been forgotten." |
| II | Waldruh | A2 | Who closed the route, and why does the paper say the town agreed? | "Elise closed the route to stop a train after a rockfall. Nobody asked the town. She gave me her key, and the key can open or close the route." |
| III | Nebelstadt | B1 | Can we reopen the route so that everyone agrees, and nobody is forgotten again? | "The Brass Office kept the route closed and counted silence as agreement. We made the towns speak. The route is open, and Frau Berg has her name back." |

**Cast and function** (unchanged people, clearer jobs):

| | Job | Story function | Everyday German they teach |
|---|---|---|---|
| Otto | Stationmaster | Trains, timetables, the platform | travel, time, directions |
| Marta | Café and inn | Hospitality, the first letter, a witness | food, ordering, housing |
| Fritz | Market | Frau Berg's neighbour, the shared table | shopping, quantities, invitations |
| Lina | Post | Letters, addresses, evidence | addresses, forms, deliveries |
| Emil | Workshop | Repairs, the signal, the eraser | tools, instructions, work |
| Greta | Garden and clinic | Care, the rockfall story, the Circle | health, weather, advice |
| Ada | Archive | The two orders, the confession | past tense, comparing accounts |
| Voss | Brass Office | Antagonist who changes | formal register, rules, apology |
| Elise | Keeper | Letters; present only in the finale | summary, agreement |
| **Frau Berg** | Retired teacher | The forgotten neighbour; **appears in the finale** | her return is the proof |

**Devices to keep, cut, or simplify** (from Appendix C of the screenplay):

| Keep as is | Simplify | Cut |
|---|---|---|
| Fading names and addresses | Platform seven → the *old platform* behind the fence, lantern lit by Otto | Kettle saying names |
| The key (opens and closes the route) | The door between towns → a real train from the old platform at the end of Act I | Door between café and inn |
| The eraser machine at the harbour | Clockmill "repeats an hour" → the station clock **stopped at 17:59** the night of the closure; every night at that minute a name fades | Pigeons, fern, flying lamp, registered pillows, post to yesterday, tea as exhibit |
| "Silence counts as consent" (the Office's rule) | Receipt dated tomorrow → a receipt with the player's name printed on it before they ordered | Voice in two places |
| The seventh bell as a deadline | Emil's lamp → an ordinary lantern that **dims** near a forgotten address | Lighthouse "shining dark" (becomes: the beam puts lanterns out) |

**Plant early what pays off late.**
- Scene 3 (market): Fritz says Frau Berg taught half the town to read.
- Scene 8 (Waldruh dinner): Greta tells the rockfall story: stones on the track, a train of schoolchildren due, the route closed that evening.
- Scene 10 (the clock): the stopped clock shows 17:59, the minute of the closure.
- Scene 13 (hearing): Marta saw Voss at the harbour machine. No tape, no double voice.
- Scene 18: Elise explains only what nobody else could: why she never reopened it. Frau Berg walks in when her name is said.

## 4. Making it wider: main scenes and everyday scenes

Keep the **18 main scenes** (IDs, gate exercises and the server contract stay stable). Add **36 everyday scenes**, twelve per town, each tied to a curriculum unit, each ≤10 new lexemes, each a self-contained errand with a small story stitch (a clue, a letter, a faction point). They are optional, always available, and never gate the main story, in line with `docs/pacing.md`.

Target after rework: 54 scenes, roughly 540 new lexemes on the story path plus the learning routes, spread over the first 60–80 hours, with the remaining budget carried by routes, barks and review.

### Act I — Lindenhafen (A1): 6 main + 12 everyday

| # | Scene | NPC | Unit | Situation | Story stitch |
|---|---|---|---|---|---|
| M1 | Arrival | Otto, Voss | Learning & communication | Greet, give your name, ask him to repeat | The ticket; Voss wants it |
| E1 | The timetable | Otto | Time & numbers | Read departure times, ask when the next train goes | Platform seven has no time |
| E2 | Breakfast | Marta | Food & cafés | Order breakfast, ask the price, pay | Receipt already has your name |
| M2 | The receipt | Marta | Food & cafés | Order a coffee | A woman paid yesterday |
| E3 | Renting a room | Marta | Home & everyday things | Ask for a room, how many nights, where is the bathroom | Marta's inn has a room reserved for you |
| E4 | Shopping list | Fritz | Food & cafés | Buy bread, cheese, three apples; weights and prices | Fritz mentions Frau Berg's Friday order |
| M3 | Two apples | Fritz | Food & cafés | Say how many you need | Frau Berg's name is gone |
| E5 | Directions | Lina | Travel & directions | Ask the way to the post office, left, right, straight on | A street sign with a missing number |
| E6 | At the pharmacy | Greta (visiting) | Health & care | I have a headache, something for a cold | Greta is from Waldruh; first mention |
| M4 | The bench | Otto, Voss | People & relationships | Ask if the seat is free | Voss listens to a recording |
| E7 | Lost and found | Lina | Home & everyday things | Describe a lost object: colour, size, where | A lost key with a lantern tag |
| E8 | The weather | Otto | Nature & weather | It is raining, is the train late | The old platform floods |
| M5 | The lamp | Emil | Actions & practical verbs | Say you need a lamp | The lantern dims near forgotten houses |
| E9 | Fixing a bike | Emil | Work & money | The tyre is flat, how much does it cost, when is it ready | Emil's invoice is signed E. |
| E10 | A phone call | Marta | Learning & communication | Spell your name, leave a message | Marta spells "Elise" |
| M6 | The parcel | Lina | Travel & directions | Ask for the address | Waldruh; "Before you erase us again, come." |
| E11 | Invitation | Fritz | People & relationships | Accept or decline, bring something | Frau Berg's chair at the Friday table |
| E12 | Buying a ticket | Otto | Travel & directions | One ticket to Waldruh, single, what time | Departure from the old platform |

### Act II — Waldruh (A2): 6 main + 12 everyday

| # | Scene | NPC | Unit | Situation | Story stitch |
|---|---|---|---|---|---|
| M7 | The room | Marta, Voss | Home & everyday things | Ask Voss to repair the lock | Lease in your name, key on the hook |
| E13 | Moving in | Marta | Home & everyday things | Furniture, where things go, what is broken | The room was Elise's |
| E14 | At the bakery | Fritz | Food & cafés | Preferences, I'd rather, with or without | Bread for the Circle's dinner |
| M8 | Dinner plans | Fritz, Greta | Time & numbers | Ask if he has time tomorrow | The rockfall story; nobody was asked |
| E15 | A doctor's appointment | Greta | Health & care | Make an appointment, symptoms, since when | Greta treated the children that night |
| E16 | The neighbour | Lina | People & relationships | Introduce a neighbour, what she does, where from | Lina delivers to an empty house |
| M9 | The missed train | Otto, Voss | Travel & directions | Say you missed your connection | 17:59; closed from inside |
| E17 | Complaint | Otto | Public life & decisions | Make a polite complaint, ask for a refund | Otto's old log book |
| E18 | Job interview | Emil | Work & money | What did you do before, can you start Monday | Emil's tools went missing one night |
| M10 | The stopped clock | Emil | Actions & practical verbs | Ask him to explain the instructions | The note in Elise's handwriting |
| E19 | The weather forecast | Greta | Nature & weather | Tomorrow it will rain, take a coat | The storm season begins |
| E20 | A past journey | Voss | Describing the world | Where did you travel, what did you see (perfect tense) | Voss remembers the route |
| M11 | The patient | Greta, Voss | Health & care | Tell Voss he should rest | His memory contradicts his file |
| E21 | School days | Ada | Learning & communication | What did you learn, who was your teacher | Frau Berg taught Ada to read |
| E22 | Library card | Ada | Public life & decisions | Fill in a form: name, address, date of birth | The register with your name |
| M12 | The archive | Ada, Voss | Learning & communication | Ask her to explain more precisely | Two orders; you are the successor |
| E23 | Packing | Marta | Home & everyday things | What to take, how long you'll be away | The key goes in your pocket |
| E24 | Saying goodbye | Fritz | Feelings & opinions | Thank someone, promise to come back | Fritz keeps the chair |

### Act III — Nebelstadt (B1): 6 main + 12 everyday

| # | Scene | NPC | Unit | Situation | Story stitch |
|---|---|---|---|---|---|
| E25 | Arrival in the mist | Otto | Travel & directions | Ask what happened, delayed because of fog | The harbour bell |
| M13 | The hearing | Lina, Marta | Public life & decisions | Ask the witness to describe what she saw | Marta saw Voss at the machine |
| E26 | Newspaper | Ada | Learning & communication | Summarise an article, agree or disagree | Report on the closure years ago |
| E27 | Bank | Voss | Work & money | Open an account, identification, fees | The Office paid for the machine |
| M14 | Two routes | Otto, Greta | Feelings & opinions | Say we need a solution for everyone | Garden or clinic stop |
| E28 | Renting a flat | Marta | Home & everyday things | Contract, deposit, notice period | Families waiting to return |
| E29 | Environment | Greta | Nature & weather | Recycling, protecting the garden | Seeds from vanished houses |
| M15 | The job | Emil, Voss | Work & money | Clarify the conditions before starting | Voss confesses |
| E30 | Workplace rules | Emil | Work & money | Working hours, safety, who is responsible | The maintenance ledger |
| E31 | Apology | Voss | Feelings & opinions | Apologise formally, accept or refuse | Voss writes to Frau Berg |
| M16 | The council | Ada, all | Public life & decisions | Propose opening step by step | Silence is no longer consent |
| E32 | Debate | Fritz, Greta | Feelings & opinions | Give an opinion with reasons, although, however | The Circle's objections |
| E33 | Volunteering | Lina | People & relationships | Offer help, organise a group | Preparing for the storm |
| M17 | The storm | Greta, all | Actions & practical verbs | Say we can only solve it together | Three towns hold the signal |
| E34 | Emergency call | Marta | Health & care | Report an emergency, where, how many people | The Lenz family |
| E35 | Letter to the editor | Ada | Learning & communication | Write a formal letter | The new rule, published |
| M18 | The Keeper | Elise, Voss, **Frau Berg** | Learning & communication | Write the agreement | The key goes downstairs; Frau Berg returns |
| E36 | The coast | Otto | Travel & directions | Plan a journey, book, connections | The unnamed coast (sequel hook) |

## 5. Choices that the player can follow

Keep the two factions and the Office, but make every choice answer the same question in different words: **do we act now, or ask first?** Every choice has a one-line visible result in the next main scene (someone arrives, a door opens, a name returns or stays missing). The Brass Office gains reputation whenever the player deals with Voss honestly, in any act, so that the third ending is reachable without the scene 1 ledger.

Endings stay three: routes reopened now, towns consent first, Office reformed. All three end with Frau Berg's return.

## 6. Consistency rules for the new bible

1. One rule of magic, stated by Otto in M1, never extended.
2. No object does anything an object cannot do, except fade.
3. Nobody mentions a person, place or event before its row in the reveal map.
4. Every fact is revealed once, in dialogue. Journal cards repeat only.
5. Voss: obstruction (M1) → listening (M4) → doubt (M9, M11, E20) → confession (M15) → apology (E31) → accountability (M16, M18). He uses *Sie* until M16.
6. Elise: letters after each main scene, two to four short sentences, no new facts, only feeling. Present only in M18.
7. Frau Berg: named in M3, remembered in E11, E16, E21, E31, returns in M18.
8. The seventh bell: rings once per act boundary and once per Act III main scene; the player always knows the count.

## 7. What changes in the repo

- **Dialogue graphs:** rewrite the 18 main scenes to the simplified spine (IDs, gate exercises, choice IDs and effects unchanged). Add 36 everyday graphs under new IDs (`a1-e01-timetable`, …). Each new graph has the same shape: intro, gate, choice, two after-nodes, one to three topics.
- **Course content:** each everyday scene needs seven exercises in `course.json` and a manifest entry in `server/curriculum.json`, generated by the existing build scripts.
- **Story rules:** `server/story_rules.json` gains the new quests with a single faction effect each. Everyday scenes never award bell pressure.
- **Story text:** letters for main scenes only; clue cards for every scene.
- **Audio:** every changed or new line needs a clip. Budget this; it is the largest cost.
- **Audits:** `npm run pacing` and `node scripts/audit-dialogue-levels.mjs --check` must pass per scene (≤10 new lexemes, A1 lexicon for Act I).
- **Bible:** replace `docs/story-bible.md` sections 1, 3, 6, 10 and 11 with the tables above once agreed.

## 8. Order of work

1. Agree this spine and the cut list (section 3).
2. Rewrite Act I main scenes M1–M6 and write E1–E12. Run the audits. Play Act I.
3. Act II, then Act III, same way.
4. Regenerate audio, syllabus and pacing audit.
5. Update the bible and the screenplay document.
