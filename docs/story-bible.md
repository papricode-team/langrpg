# The Lantern Atlas — story bible

Single source of truth for the main story (18 quests, three acts). Dialogue, clues, letters and cinematics must agree with it. `scripts/story-lint` style checks live in `web/src/story-lint.test.ts`.

## 1. Core conceit

**The Atlas forgets whatever nobody says aloud.** Names, addresses, timetables and routes only stay real while somebody says, writes or reads them. The Atlas's ink answers only to German — Elise wrote its rules that way — so every German sentence the player says is an act of restoring something. This is why the language gates exist in the fiction: ordering the coffee prints the receipt, counting the apples brings Frau Berg's name back, asking for the address makes the ink hold.

Elise's notes are short and simple in Act I because the ink cannot hold long sentences yet; they grow as the player's German does.

## 2. Dramatic question per act

| Act | Place | Level | Question | Ends on |
|---|---|---|---|---|
| I | Lindenhafen | A1 | Who is "E." who sent me a ticket to a town that does not exist — and why are people being forgotten? | Elise's letter names Waldruh: *„Bevor du uns wieder auslöschst, komm.“* |
| II | Waldruh | A2 | Who closed the route, and why does everybody pretend they agreed? | Ada: the permanent closure carries two names; Elise's key closed it from inside, and *you* are the successor who now holds the key. |
| III | Nebelstadt | B1 | Can the towns reopen the route without erasing someone else? | Elise hears the player's promise; three towns return; an unnamed coast appears. |

## 3. Reveal map (each fact is revealed in exactly one scene)

| # | Fact | Revealed in | Set up earlier by |
|---|---|---|---|
| R1 | The ticket is signed "E." and the platform (7) is not on any map | a1-arrival | — |
| R2 | A woman paid for "your coffee tomorrow"; receipts are dated tomorrow | a1-cafe | kettle says player's name |
| R3 | Addresses vanish; Frau Berg's name is already gone from Fritz's book | a1-market | numbered apples |
| R4 | Voss listens to a recording of a woman's voice every night and cannot answer her | a1-station | Voss's first appearance |
| R5 | Emil's lamp follows erased addresses | a1-workshop | — |
| R6 | **E. is Elise; she is waiting in Waldruh**; Frau Berg's house is gone | a1-lost-parcel | the signed ticket, lamp, receipt |
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
| R18 | Elise's motive, her mistake, why the kettle knew the player's name | b1-atlas | letters in every quest |

Never reveal a fact twice and never reveal one before its row. Hints are fine; confirmations are not.

## 4. Cast and voices

Address rule (**du / Sie**): residents say *du* to the player and to each other from the first meeting. **Voss uses *Sie*** with everybody until b1-council, where he drops his title, asks to be called Voss and offers *du*; the player says *Sie* to Voss and to officials. **Ada uses *Sie* with the player in a2-archive until she offers *du* at the end of the confession** (a visible lesson in Sie→du). In a formal hearing (b1-witness) the player says *Sie* to the witness and Marta plays along. Elise says *du*.

| Character | Wants | Fears | Voice (A1 → B1) | Tics / humour |
|---|---|---|---|---|
| **Otto**, stationmaster | Trains that arrive when the timetable says | A timetable that lies | Short, dry. A1: *„Pünktlich ist verdächtig.“* | Distrusts punctual pigeons; counts platforms |
| **Marta**, café/inn | Everyone fed and no secret kept from the right person | Being the last to know | Warm, teasing, asks questions | Her kettle whistles tomorrow's weather; the café and the inn share one door |
| **Fritz**, market | Soup shared at one table | Disagreement spoiling dinner | Cheerful, rambling, food metaphors | Apples carry route numbers |
| **Lina**, courier | Every letter delivered on time | Delivering to the wrong day | Clipped, fast, lists | Delivers to yesterday "if necessary" |
| **Emil**, inventor | His lamp and clockmill running | Being the tool of someone's mistake | Enthusiastic, cuts himself off | Everything "works mostly" |
| **Greta**, botanist | Her garden and her people kept | The garden erased again | Calm, practical, talks to her fern | The fern is "under observation" |
| **Ada**, archivist | To be honest at last | Her signature | Careful, precise, drily funny | Files truth alphabetically |
| **Inspector Voss**, Brass Office | Order; to believe the records | Finding the records wrong | Formal Sie, quotes regulations, softens slowly | Stamps things; never raises his voice |
| **Elise**, Keeper of the Atlas | To be forgiven without being excused | Repeating her mistake | Warm, guilty, writes in letters | Writes the way she speaks — simply |

Voss arc: **obstruction** (a1-arrival confiscates the ticket) → **hidden humanity** (a1-station recording) → **doubt** (a2-clinic: his own memory contradicts his file; a2-archive) → **confession** (b1-work, with cinematic) → **accountability** (b1-council, b1-atlas ending lines).

Elise arc: absent but audible — one **letter** (2–4 short sentences) is unlocked by each completed quest and shown in the journal and the discovery card (`letter` in `story.ts`). Level of letter German follows the act. The finale scene pays them off.

## 5. Tone

Whimsical-melancholy: comedy lives in the residents (pigeons, kettles, soup, a fern under observation); seriousness lives in the erasures (names, houses, hours). Never state the theme as a slogan; show somebody losing or recovering something. Every scene has a small funny detail **and** one moment of unease.

## 6. Scene template (variety is required)

Not every scene may be "monologue → gate → choice". Each scene has one of these shapes, in this rotation:

| Quest | Shape |
|---|---|
| a1-arrival | Cold open + confrontation (Voss vs Otto, ticket fading) |
| a1-cafe | Mystery at a table (receipt, kettle) |
| a1-market | Memory loss (Fritz forgets a number) |
| a1-station | Overheard conversation (Voss + recording) |
| a1-workshop | Comic object (the lamp has opinions) |
| a1-lost-parcel | Letter + visible erasure |
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
8. **A1 lexical gate** (Act I only, enforced by `node scripts/audit-dialogue-levels.mjs --check`): every A1 word must be in the A1 lexicon, or be glossed in `introducedWords` (maximum two new words per quest); no turn over 16 words; names of characters/towns are free. A2/B1 are not gated but sentences stay ≤19 words and abstract vocabulary (*Beschluss, Akte, Zustimmung*) is introduced through objects and letters before NPCs use it.
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
| `arrival`, `platform`, `travel`, `clockmill`, `dark-beam`, `storm`, `bell` | existing | — | unchanged except text fixes (the lost time is one **hour**, never minutes) |
| `recording` | a1-station | Lindenhafen | Voss on the bench, a woman's voice from the old recorder, Voss unable to answer |
| `erasure` | a1-lost-parcel | Lindenhafen | Frau Berg's house number blurs out of the street sign |
| `confession` | a2-archive | Waldruh | Ada puts her pen down and offers *du* |
| `ledger` | b1-work | Nebelstadt | Voss opens his own ledger in front of everyone |

## 10. Continuity facts (do not contradict)

- The lost time is **the hour before midnight**; dialogue never quotes clock times for it.
- Platform **seven** exists only when the lantern is lit; Lindenhafen's timetable has six.
- The ticket says *Bahnsteig sieben*, is signed **E.**, and carries the player's name.
- The brass seal belongs to the Brass Office (Voss). The receipt's date is *morgen*.
- The recording on the bench belongs to Voss; the voice is a woman's (it is Elise — never named in A1).
- Frau Berg's name is missing from Fritz's guest book; her house vanishes in a1-lost-parcel.
- The route closure: temporary order (Ada, apprentice, at Elise's request) → permanent order (Elise's key + the Brass Office stamp, Voss authorising). Voss's ledger holds his signature.
- Elise closed the route from inside the Atlas at 17:59; the connection leaves one minute early so that no witness arrives.
- The double signal in Nebelstadt was a recording looping on an old recorder.
- The eraser machine's maintenance was authorised by Voss personally (three new coils).
- The kettle knew the player's name because Elise's message travelled through Marta's old lantern.
- The finale must keep: *Wasserkocher*, *Schlüssel*, `{name}`, *meinen ersten Fehler*.

## 11. Scene-by-scene beats

`Gate` = the sentence the course expects (fixed). The line before the gate must make exactly that sentence the natural thing to say; the task wording goes in `gatePrompt` and the objective chip, never in an NPC's mouth.

### Act I — Lindenhafen (A1)

1. **a1-arrival** (Otto; Voss). Gate `a1-arrival-exercise-7` *„Noch einmal, bitte.“* Shape: cold open. Otto counts platforms (six) and finds a seventh the lantern lights; the ticket carries the player's name, signed **"E."**, and the letters are fading. Voss arrives, formal and fast, declares the ticket invalid and demands it — he talks so fast the player has to ask him to repeat (gate). Greeting reply (`a1-arrival-exercise-1`) stays on the first Otto line. Choice: hand the ticket to Voss (report: Voss copies it and leaves his ledger with you "so you can check") / Otto keeps it hidden (protect: Otto gives you the platform-door key). No Elise.
2. **a1-cafe** (Marta). Gate `a1-cafe-exercise-1` *„Ich möchte einen Kaffee.“* Shape: mystery at a table. The kettle whistles the player's name; a woman paid yesterday for "your coffee tomorrow" — but the receipt only prints when someone orders it. Brass seal on the receipt. Choice: give Voss the receipt / keep the original.
3. **a1-market** (Fritz). Gate `a1-market-exercise-1` *„Ich brauche zwei Äpfel.“* Shape: memory loss. Fritz cannot remember how many apples; the crate says *Nummer 7*; Frau Berg's name is gone from the guest book (fix: crate and garden evidence agree — the name is **missing**). Saying the number aloud brings it back. Choice: report the number to Voss / write her name in the guest book.
4. **a1-station** (Otto; Voss on the bench). Gate `a1-station-exercise-5` *„Ist dieser Platz frei?“* Shape: overheard conversation. A man sits at the end of the bench listening to an old recorder: it is Voss; a woman's voice from the recorder, which he cannot answer (cinematic `recording` after). The gate asks to sit next to him. Choices keep ids/conditions: report / protect (needs key) / show-ledger (needs ledger) / ask-otto. **No mention of Waldruh.**
5. **a1-workshop** (Emil). Gate `a1-workshop-exercise-2` *„Ich brauche eine Lampe.“* Shape: comic object. The lamp walks away from anyone who doesn't need it; it follows erased addresses; Emil files it under "funktioniert meistens". Choice: let Voss register it / take it.
6. **a1-lost-parcel** (Lina). Gate `a1-lost-parcel-exercise-2` *„Wie ist die Adresse?“* Shape: letter + visible erasure. The ink on the parcel label keeps fading; asking aloud for the address makes it hold: *Waldruh*. **E. is Elise (R6).** Frau Berg's house number blurs out of the street (cinematic `erasure` after). Choice: send Voss the address / keep the letter private. Ends on *„Bevor du uns wieder auslöschst, komm.“*

### Act II — Waldruh (A2)

7. **a2-apartment** (Marta; Voss). Gate `a2-apartment-exercise-6` *„Könnten Sie das bitte reparieren?“* — spoken to **Voss**, who has come to inspect the building: the stuck door joins Marta's Lindenhafen café and the Waldruh inn, and he cannot repair what is not in the register. Marta explains why the café and inn share a door. Lease: Room 7, tenant **{name}**, rented in advance by Elise (no "successor" yet).
8. **a2-evening-plans** (Fritz; Greta, Lina). Gate `a2-evening-plans-exercise-1` *„Hast du morgen Zeit?“* — to **Fritz**, who always says he is busy with soup; the Unwritten Circle wants a fixed time. The Circle were never asked about the closure (R8).
9. **a2-rail-trip** (Otto; Voss). Gate (see exercise list) *„Ich habe meinen Anschluss verpasst.“* Shape: deduction. The player tries to board and misses the 17:59 connection; complaints only count in the register when said aloud (conceit). Ticket says 18:00 (R9). No Ada yet.
10. **a2-broken-clock** (Emil). Gate *„Kannst du mir die Anleitung erklären?“* Shape: technical walkthrough. Red lever, blue connection, the hour before midnight; the borrowed-tools thank-you note is in **Elise's handwriting** (R10). Cinematic `clockmill` after (one hour, not minutes).
11. **a2-clinic** (Greta; **Voss as patient**). Gate *„Sie sollten sich ausruhen.“* — to Voss. Exhausted after a journey he says he never made; his own memory matches three old addresses on the seed packets (R11). Care scene; Voss's first doubt.
12. **a2-archive** (Ada; Voss). Gate *„Können Sie mir das genauer erklären?“* — Ada uses Sie; at the end of her confession she offers *du* (cinematic `confession`). R12: Ada signed the temporary order; the permanent order bears Elise's key **and** the Brass Office's stamp; the player is the successor; the warning concerns the key.

### Act III — Nebelstadt (B1)

13. **b1-witness** (Lina; Marta as witness). Gate *„Könnten Sie beschreiben, was Sie gesehen haben?“* — formal hearing; Marta plays along with Sie. R13: the double signal was an old recording; Voss was at the machine.
14. **b1-new-route** (Otto; Greta). Gate *„Wir müssen eine Lösung finden, die für alle passt.“* Two proposals; Greta's garden vs. a clinic stop; player mediates.
15. **b1-work** (Emil; Voss). Gate *„Bevor ich anfange, möchte ich die Bedingungen klären.“* Emil offers the job of rebuilding the signal; the repair ledger shows who kept the eraser maintained. **Voss confesses (R15)**; he keeps Sie until b1-council, where he asks to be addressed by name and offers du. Cinematic `ledger` after.
16. **b1-council** (Ada; Voss). Gate *„Ein Kompromiss wäre, die Strecke schrittweise zu öffnen.“* Three parties; each silence counts as consent to the dark beam (R16); publishing the ledger is a choice with its item condition.
17. **b1-storm** (Greta; Marta, Voss). Gate *„Wir können das Problem nur gemeinsam lösen.“* Crisis coordination; faction-conditioned arrivals (keep).
18. **b1-atlas** (Elise). Gate `b1-atlas-exercise-6` *„Wir vereinbaren, dass wir Probleme frühzeitig besprechen.“* Reunion. Elise reads the letters back; the finale must keep *Wasserkocher*, *Schlüssel*, `{name}`, *meinen ersten Fehler*; ending lines (conditions `ending`) stay.
