# glotworld — story bible

Single source of truth for the main story (30 quests, three acts: 18 in Act I, 6 each in Acts II and III). Dialogue, clues, letters and cinematics must agree with it. `scripts/story-lint` style checks live in `web/src/story-lint.test.ts`.

The dramatic spine is a ticket carrying the player's name → a neighbour whose place stays empty → evidence that the closure was imposed → choosing who may reopen a route. Every discovery must change a relationship or a practical decision. Humour belongs to how people cope; it must leave room for the loss to land.

## 1. Core conceit

**Names fade unless somebody says them aloud.** That is the single rule of Act I, stated by Otto in the first scene (*„Sag deinen Namen laut. Dann bleibt er.“*) and never added to. Names, addresses and times only stay real while somebody says, writes or reads them. The Atlas's ink answers only to German — Elise wrote its rules that way — so every German sentence the player says is an act of keeping something. Saying *zwei Äpfel* brings Frau Berg's name back; asking for the address makes the ink on the parcel hold.

There is **no other magic in Act I**. Platform seven is a real old platform, closed for twelve years. The receipt is an ordinary receipt. Emil's lamp is an ordinary repaired lantern that happens to burn dimmer where a name is fading (an application of the rule, not a second one). Everything else is people: who paid, who forgot, who kept listening. The door between two towns, the repeating hour, the keeper's key and the eraser machine arrive in Acts II and III.

Elise's notes are short and simple in Act I because the ink cannot hold long sentences yet; they grow as the player's German does.

## 2. Dramatic question per act

| Act | Place | Level | Question | Ends on |
|---|---|---|---|---|
| I | Lindenhafen | A1 | Who is "E." who sent me a ticket for a platform closed for twelve years — and why are people being forgotten? | Elise's letter names Waldruh: *„Bevor du uns wieder auslöschst, komm.“* |
| II | Waldruh | A2 | Who closed the route, and why does everybody pretend they agreed? | Ada: the permanent closure carries two names; Elise's key closed it from inside, and *you* are the successor who now holds the key. |
| III | Nebelstadt | B1 | Can the towns reopen the route without erasing someone else? | Elise hears the player's promise; three towns return; an unnamed coast appears. |

## 3. Reveal map (each fact is revealed in exactly one scene)

| # | Fact | Revealed in | Set up earlier by |
|---|---|---|---|
| R1 | The ticket carries the player's name, is signed "E." and is for platform 7, closed for twelve years; names fade unless said aloud | a1-arrival | — |
| R2 | A tired woman with ink-black hands paid for the player's coffee the day before and left her tea untouched; her receipt carries a Brass Office stamp | a1-cafe | the signed ticket, the faded W on the timetable (a1-timetable) |
| R3 | Frau Berg, the old teacher at Gartenstraße 7, has been forgotten for a week; her Friday seat is empty | a1-market | the unnamed line on Fritz's soup list (a1-shopping) |
| R4 | Voss listens to a recording of a woman's voice every evening and cannot answer her | a1-station | Voss's first appearance; Otto's remark that he "never travels" |
| R5 | Emil's lamp, built from platform 7's old lantern, goes dark where a name is fading and points to the post office | a1-workshop | the lantern gone from the platform (a1-weather) |
| R6 | **E. is Elise; she is waiting in Waldruh**; Frau Berg's name plate is lost for good | a1-lost-parcel | the signed ticket, receipt, guest book, Emil's order book, the inked glove |
| R7 | The player's room in Waldruh was rented in advance by Elise (lease: two addresses, one door) | a2-apartment | Marta's café door |
| R8 | The Unwritten Circle was never asked about the closure | a2-evening-plans | Frau Berg |
| R9 | The route was closed **from inside** with a keeper's key; the connection leaves at 17:59, not 18:00, so no witness arrives | a2-rail-trip | Voss's recording |
| R10 | The sabotage thank-you note is in **Elise's handwriting** | a2-broken-clock | the lost hour |
| R11 | Voss himself travelled the old route before the closure and remembers it (his files say otherwise) — his first doubt | a2-clinic | seed packets, Voss's recording |
| R12 | Ada signed the temporary order as Elise's apprentice; the permanent order bears **two** names (Elise's key, the Brass Office's stamp); the player is Elise's **successor**; the warning "before you erase us again" concerns the key | a2-archive | Ada's silence |
| R13 | The double signal was an old recording, not Elise in two places | b1-witness | R9 |
| R14 | The fast route crosses Greta's garden; the slow one stops at the clinic | b1-new-route | R11 |
| R15 | **Voss personally authorised the eraser's maintenance** and confesses | b1-work | Voss's doubt |
| R16 | Every silence counts as consent to the dark beam; promises must be public | b1-council | R8, R15 |
| R17 | People from all three towns can hold the signal together | b1-storm | factions |
| R18 | Elise's motive, her mistake, why she paid for the player's coffee (so someone would have to say the name aloud) | b1-atlas | the café note in a1-cafe, letters in every quest |

Never reveal a fact twice and never reveal one before its row. Hints are fine; confirmations are not.

**Act I supporting facts** (each established once, in the named scene; later scenes may refer back, earlier ones must not anticipate):

| # | Fact | Established in |
|---|---|---|
| A1 | Platform seven is a real old platform, closed twelve years; Otto lights its lantern every morning out of habit | a1-arrival |
| A2 | The board's line for platform 7 reads "nach W…, 18 Uhr"; Otto has known the town for twenty years and cannot say its name | a1-timetable |
| A3 | The woman stayed in room 3 a week ago; the guest book says only "E."; cold tea and ink on the table | a1-room |
| A4 | Fritz's Friday soup list has one line without a name; a guest always sat there | a1-shopping |
| A5 | Frau Berg is a retired teacher who read on the fountain bench every morning; strict about mistakes; Marta was her pupil | a1-neighbour |
| A6 | Her tea has not been collected for a week; the name on the bag is pale | a1-pharmacy |
| A7 | Gartenstraße 7: blank name plate, a week-old note "Bin gleich zurück" | a1-directions |
| A8 | Platform 7's lantern is missing (Emil has it); Voss has sat on the bench every evening for twelve years | a1-weather |
| A9 | A week ago a woman with black hands bought new glass for an old lantern from Emil, paid cash, signed "E." | a1-bike |
| A10 | Voss's register has no name next to Gartenstraße 7, and not the player's either unless it is spelled | a1-phone |
| A11 | At Friday soup everyone says every guest's name aloud before eating; that is how names stay at Fritz's table; Frau Berg's chair | a1-invitation |
| A12 | The player's bag came off the train; a black glove with fresh ink lay on the bench at platform 7 | a1-lost-found |
| A13 | Otto sells the first platform-7 ticket in twelve years and writes *Waldruh* on the sign himself, aloud | a1-departure |

## 4. Cast and voices

Address rule (**du / Sie**): residents say *du* to the player and to each other from the first meeting. **Voss uses *Sie*** with everybody until b1-council, where he drops his title, asks to be called Voss and offers *du*; the player says *Sie* to Voss and to officials. **Ada uses *Sie* with the player in a2-archive until she offers *du* at the end of the confession** (a visible lesson in Sie→du). In a formal hearing (b1-witness) the player says *Sie* to the witness and Marta plays along. Elise says *du*.

| Character | Wants | Fears | Voice (A1 → B1) | Tics / humour |
|---|---|---|---|---|
| **Otto**, stationmaster | Trains that arrive when the timetable says | A timetable that lies | Short, dry. A1: *„Ordnung ist Ordnung.“* | Distrusts anything too punctual; counts platforms; lights platform 7's lantern every morning |
| **Marta**, café/inn | Everyone fed and no secret kept from the right person | Being the last to know | Warm, teasing, asks questions | Asks every guest's name, writes it down twice; the café and the inn share one door (Act II). Was Frau Berg's pupil |
| **Fritz**, market | Soup shared at one table | Disagreement spoiling dinner | Cheerful, rambling, food metaphors | Friday soup at seven; everyone says every guest's name before eating |
| **Lina**, courier | Every letter delivered | A letter nobody can address | Clipped, fast, lists | Numbers everything she holds: "Nummer eins: Tasche. Nummer zwei: Handschuh." |
| **Emil**, inventor | His lamp and clockmill running | Being the tool of someone's mistake | Enthusiastic, cuts himself off | Everything "works mostly" |
| **Greta**, botanist | Her garden and her people kept | The garden erased again | Calm, practical, talks to her fern | In Act I she runs Lindenhafen's small pharmacy and garden (tea for Frau Berg); the fern is "under observation" (Act II) |
| **Frau Berg**, retired teacher | Her pupils, her Friday seat | Being forgotten | Old, kind, strict about commas — heard only through others in Act I | Lives at Gartenstraße 7 and reads on the fountain bench each morning; never seen in Act I. Marta, Fritz and Lina were all her pupils |
| **Ada**, archivist | To be honest at last | Her signature | Careful, precise, drily funny | Files truth alphabetically |
| **Inspector Voss**, Brass Office | Order; to believe the records | Finding the records wrong | Formal Sie, quotes regulations, softens slowly | Stamps things; never raises his voice |
| **Elise**, Keeper of the Atlas | To be forgiven without being excused | Repeating her mistake | Warm, guilty, writes in letters | Writes the way she speaks — simply |

Voss arc: **obstruction** (a1-arrival declares the ticket invalid) → **hidden humanity** (a1-station recording, a1-weather rain and umbrella, a1-phone register, a1-departure "Gute Reise") → **doubt** (a2-clinic: his own memory contradicts his file; a2-archive) → **confession** (b1-work, with cinematic) → **accountability** (b1-council, b1-atlas ending lines).

His authorisation of the permanent closure and all three replacement coils is confessed on the common path before the work scene's choices. Publishing a ledger provides documentary accountability; it cannot be required to hear the truth. Elise gives up unilateral authority and answers for both the emergency closure and continuing it. Neither confession automatically earns forgiveness.

Elise arc: absent but audible — one **letter** (2–4 short sentences) is unlocked by each completed quest and shown in the journal and the discovery card (`letter` in `story.ts`). Level of letter German follows the act. The finale scene pays them off.

## 5. Tone

Whimsical-melancholy: comedy lives in the residents (Otto's distrust of punctuality, soup, Emil's "works mostly", a fern under observation); seriousness lives in the erasures (names, houses, hours). Never state the theme as a slogan; show somebody losing or recovering something. Every scene has a small funny detail **and** one moment of unease.

## 6. Scene template (variety is required)

Not every scene may be "monologue → gate → choice". Each scene has one of these shapes, in this rotation:

| Quest | Shape |
|---|---|
| a1-arrival | Cold open + confrontation (Voss vs Otto, ticket fading) |
| a1-timetable | Reading the board (a faded word) |
| a1-cafe | Mystery at a table (the paid note, the untouched tea) |
| a1-room | Evidence in a room (guest book, cold cup) |
| a1-shopping | Errand with a gap (the nameless line on the list) |
| a1-market | Memory loss (Fritz recovers a name by counting) |
| a1-neighbour | Portrait through a pupil's memory |
| a1-pharmacy | Care errand (the uncollected bag) |
| a1-directions | Walk to a door (blank name plate, week-old note) |
| a1-station | Overheard conversation (Voss + recording) |
| a1-weather | Small kindness in the rain (the umbrella) |
| a1-workshop | Comic object (the lamp has opinions) |
| a1-bike | Errand with a stray clue (Emil's order book) |
| a1-phone | Formal phone call (Sie with Voss) |
| a1-invitation | Social ritual (the Friday table, the empty chair) |
| a1-lost-found | Object recovery (bag, inked glove) |
| a1-lost-parcel | Letter + visible erasure |
| a1-departure | Departure (first ticket in twelve years) |
| a2-apartment | Bureaucratic comedy (Voss must approve a door) |
| a2-evening-plans | Two groups argue; player commits a time |
| a2-rail-trip | Deduction (17:59 vs 18:00) |
| a2-broken-clock | Technical walkthrough with a clue in handwriting |
| a2-clinic | Care scene; Voss as patient |
| a2-archive | Confession; Sie → du |
| b1-witness | Formal hearing |
| b1-new-route | Two proposals, player must mediate |
| b1-work | Confrontation and confession |
| b1-council | Three parties; the ledger as evidence |
| b1-storm | Crisis coordination |
| b1-atlas | Reunion and promise |

## 7. Authoring rules

1. **No meta-instructions.** A character never ends the intro with *Bitte mich…*, *Frag mich…*, *Sag mir, dass…*. The task wording lives in the objective chip (`gatePrompt`). The NPC asks a natural question or states a need that the gate sentence answers.
2. **Gate sentences are fixed by the course.** `gateExerciseId` points at a real exercise of the quest; the line before the gate must make exactly that sentence the natural thing to say.
3. **Unique choice prompt per scene**, spoken by the NPC, naming the actual dilemma. Never *Was möchtest du tun?* / *Wie sollen wir gemeinsam weitergehen?* / *Welche Zusage möchtest du dem Rat geben?* more than once across the story.
4. **Choice ids, `next` targets, effects and items are the server contract** (`server/story_rules.json`) — wording may change, ids/effects may not.
5. **Every scene has 1–3 `topics`** (see §8): optional player questions (*Wer…? Was…? Wo…? Warum…?*) with 1–3 NPC lines. They deepen the world; they never carry a reveal row on their own.
6. **Callbacks**: at least one conditional line per scene reacts to an earlier flag, item or faction; the `after-*` lines announce the consequence on screen (who arrives, what opens, what disappears).
7. **No one refers to a person, place or event before it has been introduced** (use the reveal map and the act order).
8. **A1 lexical gate** (Act I only, enforced by `node scripts/audit-dialogue-levels.mjs --check`): every A1 word must be in the A1 lexicon, or be glossed in `introducedWords` (maximum two new words per quest); turns are capped at 8 words in arrival/café, 12 in workshop/parcel and 10 in every other Act I scene (including variants, corrections, choices, evidence and the optional-practice intro); names of characters/towns are free. One explicit exception is the exact parcel-letter quotation *„Bevor du uns wieder auslöschst, komm.“*: its complete English or Turkish meaning is always visible, its raw difficulty remains in the audit, and its vocabulary is not approved elsewhere. Changing the text, translation, line ID or visibility removes this exception. A2/B1 are not gated but sentences stay ≤19 words and abstract vocabulary (*Beschluss, Akte, Zustimmung*) is introduced through objects and letters before NPCs use it.
9. **Line shape**: `{id, speaker, german, english, clipId: "dialogue-"+id, condition?, glosses?, variants?}`; `{name}` is allowed; English is natural, not word-by-word.

## 8. Schema additions

```jsonc
// QuestGraph
"topics": [
  { "id": "who-is-e",
    "german": "Wer ist E.?", "english": "Who is E.?",        // the player's question
    "condition": { "flag": "..." },                          // optional
    "lines": [ { "id": "...", "speaker": "otto", "german": "...", "english": "...", "clipId": "dialogue-..." } ] }
]
```

Topics appear on the last line of the `intro` node. They are optional, unlimited and not saved.

## 9. Cinematic beats (player-facing performances of reveals)

| Kind | After | Map | What the player sees |
|---|---|---|---|
| `arrival`, `platform` (a1-arrival), `travel`, `clockmill`, `dark-beam`, `storm`, `bell` | existing | — | unchanged except text fixes (the lost time is one **hour**, never minutes) |
| `recording` | a1-station | Lindenhafen | Voss on the bench, a woman's voice from the old recorder, Voss unable to answer |
| `erasure` | a1-lost-parcel | Lindenhafen | Frau Berg's house number blurs out of the street sign |
| `confession` | a2-archive | Waldruh | Ada puts her pen down and offers *du* |
| `ledger` | b1-work | Nebelstadt | Voss opens his own ledger in front of everyone |

## 10. Continuity facts (do not contradict)

- The lost time is **the hour before midnight**; dialogue never quotes clock times for it.
- Platform **seven** is a real old platform, closed for twelve years. No train has stopped there since, but Otto lights its old lantern every morning out of habit. The timetable board lists six platforms plus a faded line (*Bahnsteig 7 — nach W… — 18 Uhr*). Nothing about it is magical; the player's train simply came.
- The ticket says *Bahnsteig sieben*, is signed **E.**, and carries the player's name.
- The stamp on the café receipt belongs to the Brass Office (Voss): Elise paid with an old Brass Office voucher. The paid note on Marta's counter reads *„Ein Kaffee für {name}. Bezahlt. — E.“*
- The recording on the bench belongs to Voss; the voice is a woman's (it is Elise, but Act I never says so). Voss has sat on that bench every evening for twelve years, since platform seven closed.
- Its exact words are *„Ist da jemand? Ich bin noch hier.“* in the station, cinematic and witness hearing. Voss can hear her; she cannot hear him.
- The parcel delivers the actual warning before the archive and finale quote it. Earlier unlocked messages are short notes, not that full letter.
- Frau Berg is a retired teacher at **Gartenstraße 7** who taught half the town to read and read on the fountain bench every morning. Her name has been forgotten for a week (empty line on Fritz's list, unclaimed tea, blank name plate, a week-old note). In a1-lost-parcel even her house number fades; Lina hesitates over her name.
- Before a1-lost-parcel nobody names Elise or Waldruh. The board shows only "W…"; Voss's register and Emil's book show only "E.".
- The route closure: temporary order (Ada, apprentice, at Elise's request) → permanent order (Elise's key + the Brass Office stamp, Voss authorising). Voss's ledger holds his signature.
- Elise closed the route from inside the Atlas at 17:59; the connection leaves one minute early so that no witness arrives.
- The double signal in Nebelstadt was a recording looping on an old recorder.
- The eraser machine's maintenance was authorised by Voss personally (three new coils).
- There is no kettle in Act I and no kettle gag; the a2-apartment kettle topic was removed. Elise paid for the player's coffee in advance (a1-cafe) so that someone would have to say the player's name aloud to collect it; the b1-atlas finale pays this off (*„Ich habe deinen Kaffee bei Marta bezahlt. Dann musste jemand deinen Namen laut sagen.“*).
- The finale must keep: *Kaffee*, *Schlüssel*, `{name}`, *meinen ersten Fehler* (the needles checked by `web/src/story-lint.ts`).
- *„Wer schweigt, stimmt zu.“* is a coercive Brass Office rule, explicitly challenged by the residents. It is not a moral or natural rule of the Atlas.
- The three endings preserve different commitments: immediate family reunions with disputed changes still to resolve; town consent with the cost of waiting; or public institutional accountability that requires continued scrutiny. Their cinematics and case-board text must agree.

## 11. Scene-by-scene beats

`Gate` = the sentence the course expects (fixed). The line before the gate must make exactly that sentence the natural thing to say; the task wording goes in `gatePrompt` and the objective chip, never in an NPC's mouth.

### Act I — Lindenhafen (A1)

**Act I path.** Eighteen scenes, one linear chain, in the order below: **6 story scenes** (a1-arrival, a1-cafe, a1-market, a1-station, a1-workshop, a1-lost-parcel — they carry the reveals, factions and items) and **12 everyday errands** (the rest — they teach one everyday situation each, carry one yes/no-style choice that sets a single flag, and add one small clue or callback). Every scene ends by pointing the player to the next scene's NPC in plain words. Story scenes keep the server-contract choice ids, effects and items; errands set flags only (no faction or item effects). Every scene except a1-arrival has at least one callback line reacting to an earlier flag or item. The set of errand ids lives in `web/src/progression.ts` (`everydayQuestIds`, mirrored in `server/progression.go`): a save that is already past an inserted errand counts it as passed and **may skip it**, so no later scene may depend on an errand's flag without a fallback.

1. **a1-arrival** (Otto; Voss). Gate `a1-arrival-exercise-7` *„Noch einmal, bitte.“* Shape: cold open. Otto: platform seven has been closed twelve years, yet today a train arrived there; he still lights its lantern every morning. The ticket carries the player's name, platform seven and "E."; the name fades, and saying it aloud makes it dark again (the rule). Voss of the Brass Office arrives, declares the ticket invalid and demands it — so fast the player must ask him to repeat. Choice `report`: Voss keeps the ticket and leaves the player his ledger / `protect`: Otto keeps it and gives the platform-door key. Prompt: *„Wer bekommt Ihre Fahrkarte: Otto oder ich?“* Ends: Otto goes to read the timetable. No Elise.
2. **a1-timetable** (Otto). Gate `a1-timetable-exercise-1` *„Wann fährt der Zug?“* Shape: reading the board. Platforms one to six with times; the line for platform seven (*18 Uhr*) is almost gone — only a W of the town name is left. Otto has known that town for twenty years and cannot say its name. Choice `light` / `dark`: light platform seven's lantern tonight as always, or leave it dark (`lantern-lit` / `lantern-dark`). Callbacks: key, ticket with Voss. Ends: Otto sends the player to Marta's café.
3. **a1-cafe** (Marta). Gate `a1-cafe-exercise-1` *„Ich möchte einen Kaffee.“* Shape: mystery at a table. A note on the counter: *Ein Kaffee für {name}. Bezahlt. — E.* A woman paid yesterday; she was tired, ink on her hands, and left her tea untouched; Marta, who asks every guest's name, cannot remember hers. The receipt carries the Brass Office stamp (an old voucher). Choice `report` (Voss sees the receipt, `receipt-filed`) / `protect` (keep the original, `receipt-kept`). Ends: Marta offers a room.
4. **a1-room** (Marta). Gate `a1-room-exercise-1` *„Hast du ein Zimmer frei?“* Marta's many questions; five rooms, four free. Room three: the woman stayed a week ago, the guest book says only *E.*, the table is stained with ink, the tea is still there. Choice `room-three` / `room-five`. Ends: Fritz has bread, go to him.
5. **a1-shopping** (Fritz). Gate `a1-shopping-exercise-1` *„Was kostet das Brot?“* Shape: errand with a gap. Fritz lists his Friday soup guests (Otto, Marta, Lina, Emil, Greta …) and stops at a line with no name: a guest always sat there. He cannot say who. (Frau Berg is **not** named.) Choice `extra-bread` (buy bread for the empty line too) / `own-bread`. Ends: Fritz needs more, come back soon.
6. **a1-market** (Fritz). Gate `a1-market-exercise-1` *„Ich brauche zwei Äpfel.“* Shape: memory loss. An order slip: *Äpfel. Gartenstraße sieben.* — the number has faded. Saying *zwei Äpfel* brings the name back: **Frau Berg**, who taught half the town to read; her seat has been empty for a week and nobody said a word (R3). Choice `report` (Voss writes her address, `crate-number-filed`) / `protect` (write her name down for Friday, `berg-remembered`, item `berg-address`). Prompt: *„Bekommt Voss ihre Adresse, oder schreiben wir ihren Namen auf?“* Ends: Marta knew her well.
7. **a1-neighbour** (Marta). Gate `a1-neighbour-exercise-1` *„Wie ist Frau Berg?“* Marta was her pupil: old, kind, strict about every mistake, read on the fountain bench each morning; Marta lives on her street and has not known her name for a week. Choice `say-name` (say it aloud, `berg-name-said`) / `write-name` (write it on the board, `berg-name-written`). Ends: Greta has tea for her.
8. **a1-pharmacy** (Greta). Gate `a1-pharmacy-exercise-1` *„Ich habe Kopfschmerzen.“* Greta's small pharmacy and garden; she asks the tired player what is wrong (headache; drink water, not only coffee). The tea bag for Frau Berg's cough has not been collected for a week and the name on it is pale. Choice `take-bag` / `ask-lina` (`berg-bag-taken` / `berg-bag-lina`). Ends: Lina knows every street.
9. **a1-directions** (Lina). Gate `a1-directions-exercise-1` *„Wo ist die Gartenstraße?“* Lina gives the way (straight to the fountain, left, opposite the school); at number seven the name plate is blank and a week-old note says *Bin gleich zurück*. Choice `knock` (call her name aloud) / `leave-note` (`berg-door-knocked` / `berg-note-left`). Ends: Otto is looking for the player at the station.
10. **a1-station** (Otto; Voss on the bench). Gate `a1-station-exercise-5` *„Ist dieser Platz frei?“* Shape: overheard conversation. Evening. Voss sits on the bench with an old recorder; his coat takes the seat. A woman's voice: *„Ist da jemand? Ich bin noch hier.“* He hears her every evening; she cannot hear him (R4). Otto's old office, shut for twelve years, holds a hundred tickets for platform seven, all signed E., never sold. Cinematic `recording`. Choices keep ids and conditions: `report` / `protect` (needs key) / `show-ledger` (needs ledger) / `ask-otto`. Prompt: *„Schreibt Voss das W auf, oder öffnen wir das Büro?“* **No mention of Waldruh.** Ends: Otto will be here in the morning.
11. **a1-weather** (Otto). Gate `a1-weather-exercise-1` *„Wie ist das Wetter morgen?“* Rainy morning; Voss sat on the bench in the rain until late — he has come every evening for twelve years, since platform seven closed. The lantern of platform seven is missing: Emil has it. Choice `return-umbrella` / `leave-umbrella` (`voss-umbrella-returned` / `voss-umbrella-left`). Ends: Emil has the lantern.
12. **a1-workshop** (Emil). Gate `a1-workshop-exercise-2` *„Ich brauche eine Lampe.“* Shape: comic object. Emil built a lamp from platform seven's old lantern; it is bright at the bench and next to the player, goes out on Gartenstraße and flickers towards the post office: a name is fading there (R5). It "works mostly". Choice `report` (Voss registers it) / `protect` (take it) with the existing item and flag ids. Ends: Lina's bike is here too.
13. **a1-bike** (Emil). Gate `a1-bike-exercise-1` *„Wann ist das Fahrrad fertig?“* The player collects Lina's bike (twenty euros). In Emil's order book: a week ago a woman bought glass for an old lantern, paid cash, signed *E.*, black hands; Emil knows her but her name is gone. Choice `pay-now` / `pay-later` (`bike-paid` / `bike-on-account`). Ends: Marta has a phone call for the player.
14. **a1-phone** (Marta; Voss on the phone). Gate `a1-phone-exercise-1` *„Kann ich bitte Otto sprechen?“* The player calls the station; Voss answers (*Sie*), spells his own name and reads the register: no name next to Gartenstraße seven — and the player's name is not in it either. Choice `spell` (spell the name for the register, `name-in-register`) / `refuse` (`name-withheld`). Ends: Fritz has a question.
15. **a1-invitation** (Fritz). Gate `a1-invitation-exercise-1` *„Ja, ich komme gern.“* Friday soup at seven; twelve glasses, eleven guests. Before eating everyone says every guest's name aloud — that is why names stay at Fritz's table; one seat is Frau Berg's, who never missed it until now. Choice `keep-chair` (keep it empty with her name card) / `share-chair` (sit there and say her name) (`berg-chair-kept` / `berg-chair-shared`). Ends: Lina has the player's bag.
16. **a1-lost-found** (Lina). Gate `a1-lost-found-exercise-1` *„Meine Tasche ist blau.“* Eleven bags on the table; the player's blue one is found. In the box also a black glove with fresh ink, found on the bench at platform seven, name tag blank. Choice `take-glove` / `leave-glove` (`glove-taken` / `glove-left`). Ends: Lina is still looking for the player's post.
17. **a1-lost-parcel** (Lina). Gate `a1-lost-parcel-exercise-2` *„Wie ist die Adresse?“* Shape: letter + visible erasure. A parcel from E.; the address fades as Lina reads it. The player asks aloud and the ink holds: **Waldruh**. Inside: *„Ich bin Elise. Ich warte in Waldruh.“* E. is Elise (R6). A second letter is for Frau Berg, whose house number is fading from the plate; her neighbours ask who lives there (cinematic `erasure`). Choice `report` (Voss gets the address, `waldruh-address-public`) / `protect` (keep the letter private, `elise-letter-private`). Exact closing line: *„Bevor du uns wieder auslöschst, komm.“* (id `a1-lost-parcel-complete-1`, always translated). Ends: a train waits at the station this evening.
18. **a1-departure** (Otto; Voss present). Gate `a1-departure-exercise-1` *„Eine Fahrkarte nach Waldruh, bitte.“* Evening, eighteen hundred; a train stands at platform seven. Voss objects that it is not in the plan. Otto, who has no train to Waldruh in his plan, writes *Waldruh* on the sign himself, aloud, and sells his first ticket in twelve years; Voss writes nothing down and wishes the player a safe journey. Choice `single` (€10) / `return` (€18) (`ticket-single` / `ticket-return`). Act I closes on the boarding call.

### Act II — Waldruh (A2)

19. **a2-apartment** (Marta; Voss). Gate `a2-apartment-exercise-6` *„Könnten Sie das bitte reparieren?“* — spoken to **Voss**, who has come to inspect the building: the stuck door joins Marta's Lindenhafen café and the Waldruh inn, and he cannot repair what is not in the register. Marta explains why the café and inn share a door. Lease: Room 7, tenant **{name}**, rented in advance by Elise (no "successor" yet).
20. **a2-evening-plans** (Fritz; Greta, Lina). Gate `a2-evening-plans-exercise-1` *„Hast du morgen Zeit?“* — to **Fritz**, who always says he is busy with soup; the Unwritten Circle wants a fixed time. The Circle were never asked about the closure (R8).
21. **a2-rail-trip** (Otto; Voss). Gate (see exercise list) *„Ich habe meinen Anschluss verpasst.“* Shape: deduction. The ticket promises 18:00; the player hears a departure and reports missing the connection. Otto then compares the station log and discovers 17:59 (R9). Intro, optional questions and pre-gate evidence cannot give away that conclusion. The complaint creates a witnessed discrepancy; no repeated "only counts aloud" explanation. No Ada yet.
22. **a2-broken-clock** (Emil). Gate *„Kannst du mir die Anleitung erklären?“* Shape: technical walkthrough. Red lever, blue connection, the hour before midnight; the borrowed-tools thank-you note is in **Elise's handwriting** (R10). Cinematic `clockmill` after (one hour, not minutes).
23. **a2-clinic** (Greta; **Voss as patient**). Gate *„Sie sollten sich ausruhen.“* — to Voss. Exhausted after a journey he says he never made; his own memory matches three old addresses on the seed packets (R11). Care scene; Voss's first doubt.
24. **a2-archive** (Ada; Voss). Gate *„Können Sie mir das genauer erklären?“* — Ada uses Sie; at the end of her confession she offers *du* (cinematic `confession`). R12: Ada signed the temporary order; the permanent order bears Elise's key **and** the Brass Office's stamp; the player is the successor; the warning concerns the key.

### Act III — Nebelstadt (B1)

25. **b1-witness** (Lina; Marta as witness). Gate *„Könnten Sie beschreiben, was Sie gesehen haben?“* — formal hearing; Marta plays along with Sie. R13: the double signal was an old recording; Voss was at the machine.
26. **b1-new-route** (Otto; Greta). Gate *„Wir müssen eine Lösung finden, die für alle passt.“* Two proposals; Greta's garden vs. a clinic stop; player mediates.
27. **b1-work** (Emil; Voss). Gate *„Bevor ich anfange, möchte ich die Bedingungen klären.“* Emil offers the job of rebuilding the signal; the repair ledger shows who kept the eraser maintained. **Voss confesses (R15)**; he keeps Sie until b1-council, where he asks to be addressed by name and offers du. Cinematic `ledger` after.
28. **b1-council** (Ada; Voss). Gate *„Ein Kompromiss wäre, die Strecke schrittweise zu öffnen.“* Three parties; each silence counts as consent to the dark beam (R16); publishing the ledger is a choice with its item condition.
29. **b1-storm** (Greta; Marta, Voss). Gate *„Wir können das Problem nur gemeinsam lösen.“* Crisis coordination; faction-conditioned arrivals (keep).
30. **b1-atlas** (Elise). Gate `b1-atlas-exercise-6` *„Wir vereinbaren, dass wir Probleme frühzeitig besprechen.“* Reunion. Elise reads the letters back; Elise explains the paid coffee (R18: she paid so that someone would have to say the player's name aloud); the finale must keep *Kaffee*, *Schlüssel*, `{name}`, *meinen ersten Fehler*; ending lines (conditions `ending`) stay.
