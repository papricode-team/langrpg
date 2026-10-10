# Story and dialogue review

Reviewed at `31cb589` from code and data, not from a play-through. Sources: `web/src/data/dialogue-graphs.json` (all 18 main-story scenes), `web/src/story.ts` (act intros, clues, object lore), `web/src/cinematic-content.ts`, `web/src/npc-dialogue.ts`, `web/src/beginner-dialogue.ts`, quest metadata in `web/src/content.ts`, `server/story_rules.json` and `server/story_state.go`.

## Verdict

The premise is good: a railway atlas that erases towns, a missing keeper, and a bureaucracy that turned a temporary measure into permanent silence. That is a strong mystery for a language game, because the theme (names disappear when nobody says them) matches what the player is doing (learning to say things).

The scenes the player plays don't deliver that premise. Four problems cause most of the jank:

1. **Each scene is built around a course exercise, not a story problem.** The climax of every quest is the player saying a textbook sentence that has nothing to do with the mystery: ordering coffee, buying two apples, asking if a seat is free. The story then pretends that sentence unlocked the clue.
2. **NPCs tell the player what to say.** In 14 of the 18 scenes, the intro ends with lines like *„Bitte mich um Hilfe.“*, *„Frag mich nach der Adresse.“* or *„Sag mir, dass du zuerst die Bedingungen klären möchtest.“* That is a tutorial prompt spoken by a character, and it breaks immersion every time.
3. **The best story material is in places the player rarely sees.** The whimsical, coherent version of the story (pigeons, a kettle that whistles tomorrow's rain, a village that "voluntarily ceased to exist") is in quest titles, act intros and clue pages. The dialogue the player actually hears is flat and expository, and it often contradicts that material. The Act I/II/III introductions aren't shown automatically for story acts (`web/src/main.ts:503` only shows a toast).
4. **There is very little story, and all of it has the same shape.** The whole main story is **218 spoken lines**: about 12 per quest, or roughly 1–2 minutes of reading each. All 18 quests follow the same template: monologue, then "say X", then a binary choice, then "go to the next person". Even with perfect writing, that repetition reads as mechanical.

Below is the detailed evidence, followed by a phased plan.

---

## 1. What the first ten minutes feel like

This is the A1 opening exactly as authored. My comments are in italics.

**Arrival (Otto, station)**
> Otto: *Guten Morgen, {name}! Willkommen in Lindenhafen.*
> Otto: *Dein Zug ist da. Alle schlafen noch.* — *The player is already off the train. Who is asleep, and why does it matter?*
> Voss: *Ihre Fahrkarte, bitte. Ich heiße Voss.*
> Voss: *Der Bahnsteig ist zu. Das ist normal.*
> Otto: *Normal? Die Laterne ist hell. Und hier steht dein Name.* — *Where is "here"? The player hasn't looked at anything yet.*
> Otto: *Die Fahrkarte ist von Elise. Sie braucht deine Hilfe.* — *The game's central mystery (who sent the ticket?) is answered in line 6, by a person the player has never heard of, and nobody reacts.*
> Otto: *Bitte mich um Hilfe. Dann sehen wir uns das Schild an.* — *A meta-instruction. The game then sends the player to read the sign **before** they can ask, which reverses the causality Otto just stated.*
> *(The player says "Helfen Sie mir bitte." The exercise uses **Sie** although Otto has been saying **du**.)*
> Otto: *Ich helfe dir. Hörst du die Glocke?* — *Non sequitur. No bell has been set up.*
> Otto: *Was möchtest du tun?* → *„Ich sage es Voss.“ / „Ich sage nichts.“* — *Tell Voss what? Voss is standing right there. The stakes of either option are never established.*

**Café (Marta).** The scene opens with a great hook, *„Der Wasserkocher sagt deinen Namen.“*, and drops it in the next line. Marta repeats "Elise needs you", and the scene's language task is ordering a coffee.

**Market (Fritz).** Fritz was sent to you because "he knows the seal", but he never mentions the seal. He opens with *„Zwei Äpfel für die Reise?“* and then says *„Voss bringt die Äpfel. Dann fehlen Adressen.“* That implies the inspector delivers apples, and nothing explains it. Frau Berg is introduced as missing, never appears, and her evidence object contradicts Fritz (it says *„Im Buch steht ihr Name“*, while Fritz says her name is missing). The gate is buying apples.

**Station (Otto again).** We return to the same person at the same place to re-read the same "Nach W…" sign the player read in the first scene. Then: *„Hier ist eine Bank. Ein Mann sitzt am Ende. Frag ihn: Ist der Platz frei? Dann kannst du das Schild lesen.“* The man never speaks, Otto answers for him, and asking about a seat has no logical link to reading a sign.

**Workshop and parcel.** These two are the strongest: the lamp follows erased addresses, and the parcel holds Elise's letter. But every NPC so far has said some version of "X knows your name" (Elise, the kettle, the lamp), without escalation, so the motif has lost its force by the time it matters.

The cumulative effect is a courier chain. Every scene ends with a routing line (*„Geh bitte zum Café.“*, *„Geh zum Bahnhof.“*, *„Lina wartet auf dich.“*). Nobody wants anything for themselves, nobody is in danger, and nothing surprises the player.

---

## 2. Root causes

### 2.1 Language gates are bolted on, not motivated

| Quest | What the scene is about | What the player must say | Problem |
|---|---|---|---|
| a1-arrival | A ticket to a town that doesn't exist | *Helfen Sie mir bitte.* | Generic, and uses Sie with a du-speaker |
| a1-cafe | A receipt dated tomorrow, a kettle saying your name | *Ich möchte einen Kaffee.* | Shopping task, unrelated to the mystery |
| a1-market | The Brass Office seal and vanishing addresses | *Ich brauche zwei Äpfel.* | Shopping task |
| a1-station | The "Nach W…" sign | *Ist dieser Platz frei?* | No causal link to the sign |
| a1-workshop | A lamp that follows erased addresses | *Ich brauche eine Lampe.* | Acceptable |
| a1-lost-parcel | Elise's letter | *Wie ist die Adresse?* | Good: the question is the plot |
| a2-apartment | The player is Elise's named successor | *Könnten Sie das bitte reparieren?* | A door repair during a major reveal; Sie to Marta, who has said du since Act I |
| a2-evening-plans | The Unwritten Circle | *Hast du morgen Zeit?* | The objective says "Ask **Fritz**", **Lina** says "ask **me**", and **Fritz** answers |
| a2-rail-trip | The route was closed from inside | *Ich habe meinen Anschluss verpasst.* | The player didn't miss a connection; it's forced role-play |
| a2-clinic | A patient remembers | *Sie sollten sich ausruhen.* | The patient never appears as a character |
| b1-witness | A witness saw Voss | *Könnten Sie beschreiben, was Sie gesehen haben?* | The witness never appears; Lina speaks for her |
| b1-work | The repair ledger implicates Voss | *Bevor ich anfange, möchte ich die Bedingungen klären.* | A job-interview phrase lifted from the course topic |
| b1-atlas | The finale and meeting Elise | *Wir vereinbaren, dass wir Probleme frühzeitig besprechen.* | The climactic sentence of the game is a meeting-minutes phrase |

**What needs to change:** design each scene backwards from the sentence. The target sentence should be the one thing that solves the scene's problem. The A1 can-do list (greet, say your name, ask where/what/who, numbers, "ich möchte/brauche", "es gibt") is enough to build a mystery around. a1-lost-parcel already shows the pattern working.

### 2.2 The intended story lives outside the dialogue

There are three tonal layers that don't agree with each other:

- **Quest titles and subtitles** (`content.ts`) are comic and whimsical: *"It only levitates on Tuesdays"*, *"Greta's plant has sneezed on the entire queue"*, *"Seven chairs, eight opinions"*, *"Three accounts, one rather nervous pigeon"*. None of these jokes happen in the scenes.
- **Story prose** (`story.ts`) is whimsical with mystery: an extra carriage of sleeping pigeons, letters arriving in Marta's fridge, *"He objects to the sabotage, but appreciates the handwriting."* This is the voice the game should have.
- **Spoken dialogue** is earnest and civic, especially in A2 and B1, which read like a municipal consultation leaflet: *„Akten müssen die Wirklichkeit prüfen, nicht ersetzen.“* / *„Versprechen müssen im Alltag funktionieren.“* / *„Ein Mensch ist kein fehlerhafter Fahrplan.“* The theme is stated rather than dramatised.

The act introductions that set up the premise are only reachable from a menu for story acts (`main.ts:503`). Clues and leads appear *after* a scene, so they read as recaps of events that didn't happen in the conversation.

### 2.3 Reveals are spoiled, repeated or out of order

- **Elise sends the ticket.** This is revealed in the arrival, line 6, which removes Act I's central question at once.
- **The player is Elise's successor.** Marta reveals this in the 4th line of Act II, during a door-repair errand. Ada reveals it again in a2-archive as if it were new.
- **Elise did the sabotage.** Emil reveals this in a2-broken-clock (*„Der Dankesbrief ist von Elise. Sie wollte einen Streit stoppen.“*), which pre-empts Ada's confession two quests later.
- **Ada** is referenced by Voss in a2-rail-trip (*„Ada und ich prüfen den alten Beschluss“*) before the player has met her.
- **The lost hour** is used by Otto in a2-rail-trip before a2-broken-clock introduces it.
- **Voss maintained the eraser.** This is the biggest twist in the story, and it is resolved in one flat line inside b1-work. There is no confrontation scene.

### 2.4 No antagonist, no pressure, no absent mentor

- **Voss** is a polite clerk who appears as a conditional line in other people's scenes. He never obstructs, threatens, bargains or chooses. His arc (rule-follower to accountable) happens off-screen.
- **The eraser machine and the dark beam**, which are the actual threat, are never confronted. The storm is resolved in a menu choice.
- **The seven bells** are the countdown, but the dialogue almost never mentions them, and failing a language gate three times advances the doomsday bell (`story_state.go:220`). That ties narrative punishment to learner struggle, which is the wrong incentive.
- **Elise** is the emotional centre and is absent for 17 of 18 quests. When she finally appears, *„Du bist gekommen“* has no weight, because the player has no relationship with her.
- **Frau Berg and the patient**, the human cost of erasure, never appear on screen.

### 2.5 Choices feel identical and cost nothing

- The choice prompt is the same in every scene of an act: *„Was möchtest du tun?“* in all 6 A1 scenes, *„Wie sollen wir gemeinsam weitergehen?“* in all 6 A2 scenes, and *„Welche Zusage möchtest du dem Rat geben?“* in all 6 B1 scenes. In B1 that includes the scenes before the council exists, Emil's workshop, the middle of the storm, and Elise's finale.
- The A1 options are six variations on "give it to Voss" or "keep it". They shift the Lamplighters and the Unwritten Circle, but neither faction is named in any Act I dialogue.
- Consequences show up as one conditional line in a later scene, or as nothing at all. The good exceptions to build on are a1-station (the key or ledger opens a door), b1-council (the kept ledger becomes evidence) and b1-storm (faction help arrives).

### 2.6 Everyone has the same voice

All nine characters speak in the same short, declarative, slightly formal register. The character roles in `content.ts` ("suspicious of punctual pigeons", "delivers to yesterday if necessary", "almost everything works") describe distinct personalities that never come through in what they say. The same seven residents also turn up in all three towns with no explanation (Marta runs a café in Lindenhafen and is suddenly a landlady in Waldruh), so the towns feel like stage sets rather than places.

### 2.7 Language and pragmatics issues

- **du/Sie mismatches** teach the wrong pragmatics. Examples: *„Helfen Sie mir bitte.“* to Otto (`beginner-dialogue.ts:6`) and *„Könnten Sie das bitte reparieren?“* to Marta.
- **Unidiomatic or odd lines:**
  - *„Lampe: oft gut.“*
  - *„Ein Apfel kommt mit.“*
  - *„Voss bekommt das Schild.“* (a sign isn't something you hand over)
  - *„Wie sollen wir gemeinsam weitergehen?“*
  - *„Gib diesem Satz deine eigene Zusage.“*
  - *„Das Versprechen muss jetzt in der Praxis bestehen.“*
- ***Nachfolge* used for a person** (*„Die Nachfolge der Hüterin heißt {name}“*). This avoids gendering *Nachfolger/in*, but it sounds bureaucratic. Rephrase instead, for example *„Elise hat dich eingetragen. Du sollst ihre Arbeit weitermachen.“*
- **A1 → A2 cliff.** The average line goes from 8.3 to 10.7 words, but the bigger jump is abstraction: from *„Das ist normal.“* to *„Der Mietvertrag verbindet die Adressen, auch wenn die Akten sie vergessen.“* The abstract civic vocabulary (*Beschluss, Akte, Register, Zustimmung, Verbindung*) arrives all at once.

### 2.8 Continuity errors

| Topic | Version A | Version B |
|---|---|---|
| The platform | Cinematic: *„Dieser Bahnsteig ist neu.“* (`cinematic-content.ts:9`) | Dialogue: *„Der Bahnsteig ist zu.“*; act intro: missing from every map; quest title: "Platform two and a half"; evidence: *Bahnsteig sieben* |
| The lost time | Cinematic: *„uns fehlen elf Minuten“* | Everywhere else: the lost **hour** |
| The ticket's origin | Clue: Otto remembers *selling* it (`story.ts:147`) | Dialogue: the ticket is from Elise |
| Fritz's clue | Clue: a runaway shopping list (`story.ts:138`) | Dialogue: numbered apples and Frau Berg |
| Marta's past | Clue: she was a Lamplighter courier (`story.ts:130`) | Never mentioned in dialogue |
| The final meeting | b1-storm lead: *"Meet Ada at the observatory"* (`story.ts:269`) | Dialogue: *„Elise ist im alten Signalraum.“* |
| Who signed the permanent closure | a2-archive clue: Elise, in Nebelstadt | b1-council: Voss, *„meine Unterschrift unter der Schließung“* |
| Frau Berg | Evidence: her name *is* in the book | Fritz: her name is missing |
| Greta in Act I | Garden object: Greta underlined the address | Greta has no Act I role |
| Who answers the gate | a2-evening-plans objective: ask Fritz | Lina asks to be asked; Fritz answers |

---

## 3. What needs to be done

### Phase 0: Stop the bleeding (about 2–4 days, no new content)

1. Fix every item in the continuity table in §2.8.
2. Make du/Sie consistent per NPC, in both the exercises and the beginner reply choices. Voss and officials use Sie; residents use du after the first meeting.
3. Remove the 14 "tell me X" lines that end the intros. Let the NPC ask a natural question that invites the answer (*„Was brauchst du?“* rather than *„Sag mir, dass du eine Lampe brauchst“*), and put the task wording in the objective chip.
4. Fix the intro/evidence causality. NPCs must not say "ask me, then we'll read the sign" when the game makes the player read the sign first.
5. Write a distinct choice prompt for each scene, phrased as the actual dilemma. For example: *„Voss will die Fahrkarte. Gibst du sie ihm?“*
6. Show the act introduction the first time the player enters each story act, as a short skippable cinematic rather than a modal.
7. Stop advancing the bell on gate failures. Struggling learners shouldn't be punished in the story.

### Phase 1: Narrative foundation (about 1 week, writing only)

Write a short **story bible** before rewriting any more lines. It should cover:

- **Core conceit (one line):** *The Atlas forgets whatever nobody says aloud.* This makes every language gate diegetic, because saying a German sentence literally restores a name, an address or a route. It is the bridge between the teaching and the story.
- **Dramatic question per act:**
  - I: *Who sent me a ticket to a town that doesn't exist?*
  - II: *Who closed the route, and why does everyone pretend they agreed?*
  - III: *Can the towns reopen it without erasing someone else?*
- **Reveal map:** a spreadsheet that assigns each fact to exactly one scene, so it is revealed once, set up earlier and paid off later. The order should be: ticket sender → Waldruh exists → closure from inside → Ada's signature → Elise's motive → Voss's maintenance → successorship → the finale.
- **Character voice sheet:** one sentence of want, one of fear, verbal tics, a du/Sie rule and a sample line at A1/A2/B1 for each character. For example:
  - Otto: dry, distrusts pigeons, *„Pünktlich ist verdächtig.“*
  - Emil: *„Fast!“*
  - Lina: clipped, always in a hurry
  - Greta: talks to her fern
  - Voss: Sie, quotes regulations, cracks slowly
  - Elise: writes letters, warm and guilty
- **Antagonist arc for Voss,** with three on-screen beats: obstruction (Act I, confiscating the ticket), doubt (Act II, finding Ada's warning), confrontation and confession (Act III, a scene of his own).
- **Elise's presence:** one short letter or recording per quest (2–4 sentences at the player's level) that the player reads or hears. This builds the relationship, gives reading practice, and makes the finale meeting land. A diegetic reason for the simple German: the Atlas erases long sentences first, so Elise has to write simply.
- **Visible human cost:** Frau Berg, the patient and the witness appear as characters. At the end of Act I, someone the player helped is erased. That is the emotional stakes moment.
- **Why the cast travels:** make Otto, Marta and co. a party that boards the train with the player, with travel banter, or add 1–2 locals per town.
- **One tone:** the whimsical-melancholy voice of `story.ts`. Comedy lives in the residents; seriousness lives in the erasures.

### Phase 2: Rewrite Act I as a vertical slice (about 1–2 weeks)

Act I is the onboarding and decides whether players stay. Rewrite it fully, keeping the existing NPCs, locations and evidence objects so code changes stay small. Here is an outline that keeps every gate inside A1:

| # | Scene | Problem | Gate sentence (A1) | Choice and consequence |
|---|---|---|---|---|
| 1 | Platform 7 (Otto, Voss) | The ticket bears your name, and the letters are **fading**. Lindenhafen has only six platforms. Voss wants to confiscate the "invalid" ticket. | *„Ich heiße {name}.“* Saying it aloud makes the ink return. This is the core conceit, shown in minute one. | Give Voss the ticket (he copies it and stays polite) or let Otto hide it (Voss is suspicious later) |
| 2 | Café (Marta) | The kettle whistles your name. A stranger paid yesterday for "your coffee tomorrow". | *„Ich möchte einen Kaffee.“* Marta: *„Sie hat gesagt: Bestell, was ich bestellt habe.“* The order prints the receipt. | Show Marta the brass seal or hide it |
| 3 | Market (Fritz) | Fritz's delivery list loses an address as you watch. He can't remember who Frau Berg is. | Numbers and *„Wo wohnt Frau Berg?“* | Write her name in the soup club book (Unwritten Circle) or report the route number (Brass Office) |
| 4 | Station at dusk | You overhear Voss on the platform talking to a recording of a woman's voice. The W on the board flickers. | *„Wer ist das?“* / *„Wo ist Bahnsteig sieben?“* | Confront Voss or follow quietly |
| 5 | Workshop (Emil) | The lamp drags itself toward erased places. *„Funktioniert meistens.“* | *„Ich brauche die Lampe.“* | — |
| 6 | Parcel (Lina) | **First** mention of Elise's name: the letter reads *„Bevor du uns wieder auslöschst, komm.“* Frau Berg's house is gone from the street. | *„Wie ist die Adresse?“* | Cliffhanger: the train to Waldruh appears on Platform 7 |

Here is the arrival scene redone to show the target texture: du/Sie consistent, no meta-instructions, a hook in line 1, and a motivated gate.

> Otto: *Bahnsteig sieben? Wir haben nur sechs Bahnsteige.*
> Otto: *Und der Zug … ist leer. Nur Tauben. Und du.*
> Otto: *Zeig mal. Auf der Fahrkarte steht ein Name – aber die Buchstaben verschwinden!*
> Voss: *Guten Morgen. Messingamt. Diese Fahrkarte ist ungültig. Geben Sie sie mir, bitte.*
> Otto (leise): *Schnell. Wie heißt du?* → **Player:** *„Ich heiße {name}.“*
> Otto: *Schau! Der Name ist wieder da.*
> Voss: *… Interessant. Die Fahrkarte, bitte.*
> **Choice:** *„Hier, bitte.“* (hand it over) / *„Nein, danke.“* (keep it; Otto steps between you)

### Phase 3: Systems that make dialogue feel alive (about 2–3 weeks of engineering)

1. **Player questions.** Add a small *Wer? / Was? / Wo? / Warum?* topic menu in every conversation, so the player can ask *„Wer ist Elise?“* or *„Was ist das Messingamt?“*. This teaches question words naturally and gives the player agency.
2. **Varied scene templates.** Not every scene should be monologue → gate → choice. Add:
   - overheard conversations
   - two-NPC arguments where the player sides with one
   - a deduction step (*17:59 vs 18:00*: let the player point out the contradiction)
   - letter- or recording-only scenes
   - short timed moments in the storm
3. **Visible consequences.** Choices should change something on screen: who appears, what is in the world, which door opens. Keep the faction meter, but announce shifts in dialogue (*„Die Laternenhüter haben das gehört.“*).
4. **Ambient banter and callbacks.** Residents comment on the player's last choice and on world events, and they talk to each other when the player passes. The existing `residentConversation` can drive this, keyed on flags rather than only on level.
5. **Cinematic beats at key reveals.** Reveals should be performed rather than read: Ada's confession, the Voss recording, Frau Berg vanishing, and the dark beam. The cutscene system already exists.

### Phase 4: Rewrite Acts II and III (about 2–3 weeks)

- Rebuild both acts against the reveal map. Each act gets one confrontation scene: Ada in II and Voss in III. The eraser machine and lighthouse become a playable climax rather than a menu choice.
- Ramp the language deliberately. Introduce abstract vocabulary (*Beschluss, Akte, Zustimmung*) through objects and Elise's letters first, before NPCs use it in speech.
- Replace the finale sentence. The final gate should be emotionally loaded and still B1. For example: *„Wir lassen niemanden mehr verschwinden, auch wenn wir streiten.“* Or have the player write the name of someone they restored.

### Process and tooling

Add narrative lint tests next to `dialogue-level-audit`:

- The gate speaker matches the NPC named in the objective, and that NPC answers.
- du/Sie is consistent per NPC pair (with an allowed transition point).
- No intro ends with an imperative telling the player what to say.
- Choice prompts are unique across all scenes.
- Each reveal ID is introduced in exactly one scene (backed by the reveal map).
- No speaker references a character who hasn't been introduced yet.

Other process steps:

- **Table reads:** read each act aloud, all lines in order, before recording audio.
- **Native-speaker pass:** have a native German speaker review naturalness and register for every line. AI-written German needs this before anything is final.
- **Re-record dialogue audio** only after the text is locked.

### Definition of done for "AAA-feeling story"

- A new player can state the mystery in one sentence after five minutes.
- Every gate sentence passes the test "would the character plausibly need you to say exactly this right now?"
- Every NPC is recognisable from a single line with the name hidden.
- Every act has one moment players would screenshot or tell a friend about: the fading name, Frau Berg vanishing, Ada's confession, the Voss recording, meeting Elise.
- No reveal is repeated, and every reveal is set up at least one scene earlier.
