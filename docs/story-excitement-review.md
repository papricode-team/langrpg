# Story excitement review

Written 2026-10-15 from the shipped data, not from play: `web/src/data/dialogue-graphs.json` (30 graphs), `web/src/data/story-text.json` (acts, clue cards, letters, 21 case-board objects), `server/story_rules.json` and `server/story_state.go` (choices, items, flags, factions, bell, endings), `content/world-seed.json` (towns, districts, residents), `web/src/minigames/story-scripts.json` (three story mini-games) and the documents `docs/story-bible.md`, `docs/screenplay.md` and `docs/story-rework-proposal.md`.

The brief for this review: the game needs a really exciting story with many interesting characters, locations, objects and mysteries, and it needs to feel fun to play.

## 1. Verdict

The story is now **consistent, gentle and well-plotted, but it is not exciting and it is not yet a game**. The 2026-10-13 rework fixed the problems it set out to fix (one rule, no contradictory magic, clean reveal order, A1-safe Act I). In doing so it removed almost everything that created tension, and it did not add anything that creates play. What is left is a quiet novella the player walks through: every scene is "approach the witness, read one object, say the fixed sentence, pick A or B, get told where to go next".

The main findings, in order of importance:

1. **Nothing can go wrong.** No choice can be lost, no character can be lost, no scene can be missed, the bell only moves forward with progress, and items are never used. The player has no pressure and no agency beyond a binary that is settled by arithmetic at the end.
2. **One mystery, answered early.** Act I asks "Who is E.?" and "Who is missing?". The player can guess E. by scene 3 (a woman, ink, the letter E) and learns the missing name in scene 6. Scenes 7 to 16 are errands with no open question.
3. **Everyone is kind.** Ten named characters, all of them helpful, none with a hidden agenda. The only antagonist, Voss, is softened from scene 10 onwards and becomes a patient by scene 23. There is no rival, no liar, no child, no stranger, nobody the player distrusts.
4. **Three towns, visited once each, on rails.** Thirty-seven object markers over three maps, every one of them on the mandatory chain. There is no optional discovery, no locked place the player opens, no place that changes between visits except Frau Berg's house (which is only described).
5. **Objects are tokens.** Eight inventory items are all gained in Act I. Three are ever checked (the key once, the ledger twice). The lamp that dims near fading names, the best gadget in the game, never does anything in the world. The Keeper's key, the object the whole plot turns on, is never used by the player.
6. **The 12 errands make Act I long without making it bigger.** They teach language well but each one is "which room / pay now or later / umbrella or no umbrella" with a one-line echo later. Twelve such scenes in a row, before anything happens, is where a player stops.

The fix is not to put the whimsy back. It is to add **stakes, agency and breadth** inside the one rule the bible already has. Section 5 gives a concrete direction.

## 2. What is there (measured)

| Surface | Count | Note |
| --- | ---: | --- |
| Story scenes | 30 | 18 Act I (6 story, 12 errands), 6 Act II, 6 Act III |
| Named story characters | 10 | plus Frau Berg, never on screen; the Lenz family, named once |
| Speaking characters per scene | 1 to 6 | Act I scenes are one NPC plus occasionally Voss |
| Towns | 3 | Lindenhafen (5 districts, 12 ambient residents), Waldruh (2 districts, 2 residents), Nebelstadt (0 districts, 0 residents) |
| Case-board objects | 21 | all are the mandatory investigation objects |
| Object markers in the world | 37 | none optional |
| Inventory items | 8 | all from Act I story scenes; used in 2 scenes |
| Flags | 40 | 24 are errand yes/no flags echoed by one line |
| Choices per scene | 2 | a1-station has 4 (item-gated), b1-council has 3 |
| Branching nodes | 6 per graph | one graph has 7; no choice changes which scene comes next |
| Faction ceilings | Brass 9, Lamplighters 18, Circle 15 | the third ending is practically unreachable without the scene-1 ledger (see screenplay Appendix B) |
| Bell | 7 milestones + at most 2 warnings | advances on quest completion; can never be lost or stopped |
| Elise letters | 18 | story scenes only; errands unlock none |
| Optional player questions | 73 | the best world-building in the game, and the most fun lines |
| Story mini-games | 3 | all in Act II (clockmill, seed packets, 17:59); none in Act I or III |
| Cinematics | 9 kinds | each is two or three lines of text |
| Expedition content | 10 regions, 80 named NPCs, 180 encounters | no connection to the story; the "unnamed coast" hook never points at them |
| Hours of story | ≈ 10 to 12 | the vocabulary of the final scene is covered at intake hour 92 of a 200-hour target (docs/pacing.md) |

## 3. What works and must be kept

- **The rule.** "Names fade unless somebody says them aloud, and the ink answers only to German" is a strong premise because it makes every spoken German sentence an act in the fiction. It is the one idea that should drive everything else.
- **Voss.** The only full arc in the game (obstruction, hidden humanity, doubt, confession, accountability) and the only character who changes address form. His "I am here" in scene 30 answering the tape from scene 10 is the best beat in the story.
- **Act II's three deductions.** 17:59 versus 18:00, the thank-you note in Elise's handwriting, the two names on the permanent order. These are real clues with real consequences, and the three story mini-games sit exactly where they should.
- **The optional questions.** "Where do you file the truth? Under W, between Wetter and Wünsche." "Why does your archive travel? An archive that stands still gets forgotten." These lines give the world character for free.
- **Small physical evidence.** The untouched tea, the hundred unsold tickets signed E., the glove with fresh ink on Voss's bench, the dot rubbed out three times on Otto's chart. The game is good at this and should do far more of it.
- **The lint.** The reveal map, the server contract and the narrative lint mean a rewrite can be bold without breaking the data.

## 4. Findings in detail

### 4.1 No stakes

- `server/story_state.go` `storyBellMilestones`: the bell is a progress bar. It rises to 1, 2, 3, 4, 5, 6, 7 as quests complete, plus up to two "warning" choices (only `a1-arrival/report` carries one in the rules file). The README calls it a counter the seventh stroke of which makes the closure permanent, but the player cannot cause or prevent that stroke. A threat the player cannot influence is not a threat.
- Nothing is ever lost. The Act II restore branch of the clockmill says "one name is lost for good" and nothing in the data records it; no later line, object or ending refers to that name.
- No scene can be failed, skipped, or reached in a different order; no character can refuse to speak to the player. Faction reputation changes two greeting lines and the storm roll-call.
- The "Wer schweigt, stimmt zu" rule (silence means consent) is the strongest threat in the fiction and it appears for the first time in scene 28 of 30.

### 4.2 Too few mysteries, solved too early, solved by NPCs

- Act I has two questions and both are answered mechanically: Frau Berg in scene 6, Elise in scene 17. Scenes 7 to 16 add no question of their own. The errands have "a small clue" each (the glass bought a week ago, the glove) but the clues point at a mystery the player has already solved in their head.
- In every scene the deduction happens after the gate sentence and is done by the NPC: Fritz remembers by counting, Otto reads the clock, Emil compares handwriting, Ada reads the order. The player never chooses what to inspect, never combines two pieces of evidence, never makes a wrong guess.
- Elise's motive (stones on the track, the children's train) still appears for the first time in scene 30. The double voice (scene 25) is still set up only in a journal paragraph. Both are listed as open in the screenplay's Appendix B.
- There is no mystery that spans the whole game except "why did Elise do it", which the player cannot investigate because Elise is absent for 29 scenes and nobody in the towns knew her reasons.

### 4.3 Characters without conflict

- Everyone in the cast wants what the player wants. The factions are two opinions, not two groups of people: no Lamplighter and no Circle member ever opposes the player, lies, bargains or leaves.
- Frau Berg carries the first act and never appears. The Lenz family are rescued in the storm and had never been mentioned before it.
- The 12 ambient residents in Lindenhafen (Ella, Karl, Anne, Mila, Bruno, Jonas, Bea, Nora, Felix, Ida, Theo, Pia) have routines but no relation to the story; none of them was Frau Berg's pupil, none of them has forgotten anyone.
- Waldruh has two ambient residents and Nebelstadt has none, so the town whose people were "never asked" and the town holding a council are visibly empty.
- The only characters with a visible want that conflicts with another character's are Otto and Greta in scene 26, and that is the best scene in Act III.

### 4.4 Places are backdrops

- Each town is used as a sequence of talk positions. Lindenhafen has five painted districts (station-yard, canal-walk, harbor-court, bridge-quay, library-square); the story uses the station, the café, the market, the fountain and three shops. The canal, the harbour, the bridge and the library carry no story.
- The only "locked place" is Otto's old office in scene 10, and it is the best moment of Act I precisely because the player opens something with something they earned. Nothing else works that way.
- Gartenstraße 7 is the one location that changes (name plate blank, note, number fading) and the change is only narrated. The world does not show it.
- The clockmill and the observatory, the two spectacular locations, are each seen once, in one scene.

### 4.5 Objects do nothing

- `web/src/story-panels.ts` is the only place outside the dialogue data that knows the items exist, and it only describes them.
- The signal lamp "dims where a name is fading" in the dialogue. In the world it is an inventory line. If it actually dimmed and brightened as the player walked, Act I would have an exploration mechanic for free.
- The Keeper's key closes routes from inside. The player holds it from scene 19 and the game never asks them to use it, refuse to use it, or hide it. The final choice is about who stores it.
- A hundred unsold platform-seven tickets signed E. are mentioned once and never seen again. They are the obvious collectible of this game: each ticket could carry a forgotten name.

### 4.6 The errands

- They are good language scenes and bad story scenes. Choices such as room three or room five, pay now or on account, single or return, have no stakes in the fiction, and the player knows it.
- Twelve of them in a row, on a mandatory path, between scene 6 (the first reveal) and scene 17 (the second), is the longest stretch of the game without a question.
- Because a save may skip an inserted errand, their flags can never matter later, which guarantees they stay inert.

### 4.7 Acts II and III are not yet on the bible

- Still present and now contradicting the rebuilt Act I: Emil's lamp "ran off, I followed it three days through the forest" (a2-broken-clock topic) versus Act I's ordinary repaired lantern; the fern that sneezed on a stamp and turned it green; Fritz's apples rolling north; Emil's repair receipt dated tomorrow; pigeons with timetables. The bible says there is one rule and these are second rules.
- Greta is Lindenhafen's pharmacist in Act I and introduces herself as a Waldruh resident in Act II with no line about moving.
- Fritz also simply appears in Waldruh (his topic answer is the rolling apples). Marta's door explains her presence; nobody else's is explained.

### 4.8 Length against the pacing target

The story is about ten hours. The vocabulary target is two hundred. Even with the optional intake brake, the player will finish the last story scene with roughly half the course still ahead and nothing narrative to do except the expeditions, which do not mention the Atlas, Elise, the towns or the player's choices. The story does not need to be denser. It needs to be much wider, which is the same conclusion `docs/story-rework-proposal.md` reached for a different reason.

## 5. Direction: ten moves

All of these keep the one rule, the reveal map, the server choice ids and the A1 lexical gate for Act I (≤ 10 new lexemes a scene, two glossed story words). Costs are mostly audio clips and A1 wording. They are ordered by how much excitement they buy per line of new German.

### 5.1 Make the rule a mechanic (code, almost no new lines)

Names in the world should visibly fade with the world clock: the name on the player's ticket in the HUD, the name plate at Gartenstraße 7, the board's "W", Fritz's chalk list, the names on the memory stone. Saying or typing the German word in the right place restores the ink. The carried lamp should actually dim and brighten with distance from a fading name, which turns it into a dowsing tool that leads to optional discoveries. This is the single biggest change: it turns the premise from a line Otto says into something the player watches and fights.

### 5.2 Give the bell teeth

Tie the bell to the fiction instead of to progress: a bell strikes when a name in the current town fades completely, and the player can prevent it by acting before the world clock reaches it. Keep the promise that language mistakes never advance it. Let one strike actually cost something visible (a resident's name plate goes blank, a bark goes silent, Fritz's list loses a line) and let the player win it back. A clock the player can beat is fun; a clock the player cannot touch is decoration.

### 5.3 Give Act I an opponent whose weapon is silence

The bible forbids a second kind of magic in Act I, and it does not need one. The Brass Office's rule "Wer schweigt, stimmt zu" should be posted in Lindenhafen in scene 2, not scene 28: a clerk from the Office (a new character, not Voss, so Voss can keep his arc) pins notices that say "Namen bitte nicht laut nennen", fines Fritz for his Friday roll-call and removes Marta's guest book. Under the one rule, enforced silence is erasure. That gives every errand a reason to exist: each one is a place where the player chooses to say a name against the rule, and the clerk notices. A1 can carry this: "Nicht sprechen. Das ist die Regel." The clerk is a Brass Office human who believes the files; Voss, by contrast, starts to doubt them. The two can disagree in scene 14 (the phone call).

### 5.4 Add characters who want something else

Six additions would change the texture of the whole game, and three of them are A1-safe:

- **A child** (Lina's little sibling or Fritz's grandchild) who treats saying names aloud as a game and keeps a list. A1 scenes with a child are naturally short and repetitive. The child is also the natural planting of the "children's train" that Elise closed the route for, so the finale motive is set up from Act I.
- **The Brass Office clerk** from 5.3: the first person who is not kind to the player.
- **Frau Berg on screen** in Act I. The strongest possible mid-act scene: she is found on the fountain bench, alive, and does not know her own name; the player has to go and get the people who do (Marta, Fritz, the child) to say it in front of her. Her return in the finale then pays off something the player did, not something they were told.
- **A travelling seller of "Namenstinte"** who promises that his ink never fades (Act II, A2): a charming liar whose ink is ordinary; he is the comic foil and a red herring for who is erasing names.
- **Marta's grandmother**, who remembers the house with the door in two towns (she exists in a topic line already).
- **The Lenz family** introduced in Act II at Fritz's table, so their rescue in the storm is a rescue of people the player knows.

Also give the ambient residents one story each: at least four of Lindenhafen's twelve were Frau Berg's pupils and say so in a bark; the pupil count becomes a thing the player can collect for her.

### 5.5 Make choices branch at least once per act

The server contract fixes choice ids and effects, not what a scene does with the result. At least one choice per act should change what the player sees next:

- Act I: whether Voss or Otto keeps the ticket should decide **who is at the bench in scene 10** and which of two scenes 11 the player gets (the umbrella errand with Otto, or a search of the Office's register with the clerk).
- Act II: stopping the mill early should really lose a name, and the lost name should be a character the player has met (one of the Circle), who is then absent from the council and the storm. The consult branch keeps them. That is a choice with a face.
- Act III: the route choice should decide whether the clinic stop exists in the storm scene (the slow route saves the Lenz family by train; the fast one makes the rescue a rope job).

Make the third ending reachable by honest dealing with Voss in any act, as the proposal already suggests.

### 5.6 Turn the errands into small mysteries

Keep all twelve, keep their gate sentences and flags, change what the player does before the gate. Every errand should have one **find** (an object the player must locate in the district, led by the lamp or a direction from the NPC) and one **question** that does not close until a later scene. Examples that stay inside A1 and the existing flags:

- a1-room: room three is not just stained; the guest book's E. has a faint second letter the player can rub with the lamp. It becomes legible in scene 17.
- a1-pharmacy: a second uncollected bag with a different pale name. Who else is being forgotten? Answered when the child's list is compared in scene 15.
- a1-lost-found: eleven bags; one of the others carries a platform-seven ticket with a name that is still dark. Someone else arrived.
- a1-phone: Voss reads the register and one name is in it twice, once crossed out. The clerk's handwriting.

### 5.7 Give each town one locked place, one changing place and one spectacle

- Locked: Otto's office (exists), the Office's record room in Lindenhafen (opened with the ledger or the key), the mill cellar in Waldruh, the observatory stairs in Nebelstadt (opened with the key, which is finally used).
- Changing: Gartenstraße 7 across Act I (plate, then number, then door, then garden, rendered in the world), the memory stone across Act II, the harbour signal across Act III.
- Spectacle: the train at platform seven should be seen arriving in scene 1 and leaving in scene 18 as the world's own train, not only as cinematic text; the clockmill's hour should be playable more than once; the dark beam should put lanterns out on the map as it sweeps.

### 5.8 Make objects earn their place

- The lamp dowses (5.1). The key opens the observatory and, in one optional scene, could be turned: the player is offered the chance to close a route to stop the beam, and refusing or accepting matters.
- The hundred tickets become a collectible: each carries one forgotten name; finding the person restores a resident bark and a line on Fritz's list. This is the side-quest system the pacing budget needs, and it is pure A1 (names, numbers, addresses).
- The ledger should be readable: a case-board page the player can open and compare, and the place where the clerk's and Voss's handwriting differ.

### 5.9 Plant the end in the beginning

- Elise's motive: the child (5.4), stones on the track (a2-rail-trip topic or the memory stone), and a clinic patient in a2-clinic who was on the children's train.
- The double voice: a2-archive ends on "the second stamp came from Nebelstadt"; add one line that two harbours reported her voice the same night.
- Why she paid for the coffee: Marta's optional question in a1-cafe can hint ("She said: then someone has to say the name").

### 5.10 Make the expeditions the unnamed coast

The finale promises an unnamed coast and the game already has ten regions with 80 named characters and 180 encounters that the story never mentions. Let the coast be them: each expedition gets one Atlas thread (a name that is fading there, a letter from Elise, a Brass Office notice, a Lenz cousin) and one place where the player's ending shows (a reopened route or a town that is still deciding). That alone adds dozens of characters and places to the story at the cost of a handful of lines per region, and it fills the hours between story end and vocabulary end.

## 6. Contradictions to fix now

These are cheap and should go in with the next audio run:

- a2-broken-clock topic: Emil's lamp "ran off, three days through the forest". Replace with Otto sending him to the mill with the lantern.
- a2-evening-plans and a2-clinic topics: the fern sneezing on a stamp, the stamp turning green, apples rolling north, pumpkins the size of suitcases.
- a2-broken-clock: Emil's repair receipt dated tomorrow.
- a2-rail-trip and b1-new-route: pigeons with timetables.
- Greta's and Fritz's presence in Waldruh: one line each (Greta's clinic is in Waldruh and she keeps the Lindenhafen pharmacy on market days; Fritz came through Marta's door with the soup).
- a1-shopping, extra-bread branch: Fritz says "A loaf for the guest. He is hungry" about a guest who turns out to be a woman. The German is grammatically fine (der Gast); the English should say "they".
- The screenplay's Appendix B items that are still open: Elise's motive, the double signal, Greta's two towns, the third ending arithmetic.

## 7. Suggested order of work

1. **Code only, no new German:** fading names in the world, the dowsing lamp, a bell that the player can beat, the key opening the observatory, the ticket collectible scaffold, world-rendered changes at Gartenstraße 7. This is where excitement comes from and it costs no audio.
2. **Fix section 6** and regenerate those clips with `--only`.
3. **Act I additions:** the clerk, the child, Frau Berg on the bench, the errand finds (5.3, 5.4, 5.6). Keep every new scene at or under 10 new lexemes; run `node scripts/audit-dialogue-levels.mjs --check` and `npm run pacing` per scene.
4. **One real branch per act** (5.5) and the third-ending fix.
5. **Acts II and III on the bible** with the Namenstinte seller, the Lenz family and the plants from 5.9.
6. **The coast** (5.10).

Each step is independently shippable and each one leaves the lint, the server contract and the course gates intact.
