# Story expansion plan: an exciting Atlas

Written 2026-10-15. Follows `docs/story-excitement-review.md` (the diagnosis) and supersedes the pending part of `docs/story-rework-proposal.md` (Acts II and III). The bible in `docs/story-bible.md` stays the source of truth for the one rule, the reveal map and the server contract; this plan lists what gets added to it.

Goal: a story that is **exciting** (something can be lost, and the player can prevent it), with **many characters** who want different things, **many places** that lock, change and impress, **objects that do things**, **several mysteries open at once**, and play that is **fun**: finding, deducing, racing a clock, collecting, and seeing choices change the world. All of it inside the one rule (*names fade unless somebody says them aloud, and the ink answers only to German*) and inside the course gates (A1 scenes at most 10 new lexemes, two glossed story words, server choice ids unchanged, every line gets a clip).

---

## 1. Design principles

1. **The rule is a mechanic.** Names in the world fade on the world clock. The player sees ink go pale and can bring it back by speaking German where it matters. Every other system (lamp, bell, tickets, clerk) is an application of this.
2. **Something can be lost.** Names, a person, a house, a route. Losses are visible in the world and in the cast, and most of them can be won back by effort. Language mistakes never cause a loss.
3. **The player deduces.** Evidence is found, not narrated. At least one find per scene, and the deduction is a choice the player makes before the NPC confirms it.
4. **Three questions open at any time.** Each act keeps a ladder of mysteries, planted early and answered in different scenes, so no stretch of five scenes is without an open question.
5. **People want different things.** At least one character per act opposes the player, one lies, one needs rescuing, one is a child.
6. **Choices change what you see next.** One real branch per act, visible cast changes, and a third ending reachable by honest dealing.
7. **Wide, not dense.** New content is mostly side quests with almost no new vocabulary (names, numbers, addresses), which fills the gap between the ten-hour story and the two-hundred-hour vocabulary budget.
8. **Everything existing stays valid.** The 30 quest ids, their gate exercises, choice ids, effects, items, flags and clips remain. New scenes are inserted with the existing skip rule (`everydayQuestIds`), so saved adventures never lock.

---

## 2. The story at a glance

**Spine (unchanged):** a ticket with your name, signed E. → a neighbour whose seat is empty → the Office enforcing silence → a route closed from inside by the woman who sent you → the key is now yours → the towns reopen the route together, or not.

**What is new in one paragraph.** The Brass Office does not merely file. It enforces *silence* ("Wer schweigt, stimmt zu" is posted in Lindenhafen in scene 2, not scene 28), and under the rule, enforced silence is erasure. Its clerk, **Frau Kessler**, is the face of that in Act I. The child **Pip** plays the name game that keeps the town alive, and his and Lina's parents, **the Lenz family**, are the people who were forgotten in Waldruh. **Frau Berg** is found in Act I, alive, on her bench, not knowing her own name; the player gets her pupils to say it in front of her, and then still loses her house. In Act II the ink seller **Falk** sells "ink that never fades", lies, and turns out to be an Office clerk who quit because he saw the machine. **Lina** was on the children's train that Elise stopped at 17:59. In Act III the player holds the Keeper's key and is offered the chance to use it: close the route again to stop the beam tonight. The hundred unsold tickets carry a hundred forgotten names; finding their people is the game's side-quest system and the thing that carries the story across the whole course.

### Dramatic questions and act endings

| Act | Place | Level | Question | Ends on |
|---|---|---|---|---|
| I | Lindenhafen | A1 | Who is E., and who is making this town silent? | Frau Berg remembered but her house gone; Kessler's notices torn down or filed; Otto says *Waldruh* aloud |
| II | Waldruh | A2 | Who closed the route, and what did it cost the people here? | Ada's confession; Lina's memory of the train; the key in the player's hand |
| III | Nebelstadt | B1 | Can the towns reopen the route without erasing someone else, and will *you* use the key? | The temptation refused or taken; the storm; Elise answers; Frau Berg's address restored |

---

## 3. Mysteries: the ladder

Each question is planted in one scene, kept alive by at least two hints, and answered in exactly one scene (the reveal map rule). Side questions may be answered in side quests.

| # | Question | Planted | Kept alive by | Answered |
|---|---|---|---|---|
| M1 | Who is E.? | a1-arrival | receipt, room 3, glass, glove | a1-lost-parcel (existing R6) |
| M2 | Who is missing? | a1-shopping | pale name on tea bag | a1-market (existing R3) |
| M3 | **Who is making the town silent?** | a1-notice (new): "Nicht sprechen" notices, the fine on Fritz's roll-call | the crossed-out name in Voss's register (a1-phone), Kessler removing Marta's guest book, Pip's chalk wiped | a1-office-window (new): Kessler's handwriting, the Office's rule; its machine in b1-record-room |
| M4 | **How many are missing?** | a1-station: a hundred tickets signed E. | each ticket found | the ticket count on Pip's list; never fully closed (side-quest system) |
| M5 | **Where is Frau Berg?** | a1-directions: "Bin gleich zurück" | the bookmark on the bench, the lamp bright at the fountain | a1-bench (new): she is on her bench and does not know her own name |
| M6 | Why does Voss listen every night? | a1-station | umbrella, phone, "Gute Reise" | b1-atlas (existing R18/Voss) |
| M7 | **Who else arrived on platform seven?** | a1-lost-found: a second ticket with a dark name, *Lenz* | Pip: "Mama und Papa sind in Waldruh"; Lina's silence about it | a2-evening-plans: the Lenz family at Fritz's table, forgotten by their own village |
| M8 | What happened at 17:59? | a2-rail-trip | Voss's whistle | a2-rail-trip (existing R9) |
| M9 | **Why did Elise close the route?** | a2-forest-rails (new): stones still on the old track; Lina counts them | memory stone; a2-clinic patient who was a child on that train | b1-atlas (existing R18), now paid off instead of introduced |
| M10 | **Does Falk's ink really never fade?** | a2-ink-seller (new) | his customer list; Oma Hilde bought some | a2-cellar (new): the ink is ordinary; Falk is a former clerk who saw the machine; he names Nebelstadt |
| M11 | Whose names are on the two orders? | a2-archive | key on the lease | a2-archive (existing R12) |
| M12 | Who stood at the machine? | b1-witness | the stamp sound | b1-work (existing R15) |
| M13 | **Who keeps the machine running day to day?** | b1-record-room (new): Kessler's maintenance slips | Jonas the signalman's silence | b1-work: Voss ordered, Kessler executed; Kessler's choice in b1-council |
| M14 | **What will you do with the key?** | a2-archive | every Act III scene mentions it | b1-temptation (new) |
| M15 | What is the unnamed coast? | b1-atlas | — | the expeditions (section 8) |

---

## 4. Cast

### Existing (kept, with new arcs where noted)

| Character | New in this plan |
|---|---|
| Otto | Unchanged; also host of the ticket side quests in Lindenhafen (he sells each found ticket's name back onto the board) |
| Marta | Loses her guest book to Kessler in Act I and gets it back in a1-office-window or in the finale, depending on the player |
| Fritz | Fined for the Friday roll-call; his chalk list becomes a world object that visibly loses lines |
| **Lina** | Was a child on the train Elise stopped at 17:59; her numbering habit comes from that day; her parents are the Lenz family. Arc: clipped courier → the witness who remembers (a2-forest-rails) → the person who asks the first vote (b1-council) |
| Emil | Builds the dowsing lamp (now a real tool) and the signal-holding rig; no walking lamp, no tomorrow-dated receipt |
| Greta | Lindenhafen pharmacist on market days, Waldruh clinic the rest of the week (one line in a2-evening-plans) |
| Frau Berg | **On screen** from a1-bench; at Fritz's table in a1-invitation; her house lost in a1-lost-parcel; her address restored in the finale |
| Ada | Unchanged |
| Voss | Unchanged arc; in addition he and Kessler disagree on the phone (a1-phone) and he overrules her in a1-departure |
| Elise | Unchanged; the drafts she reads in the finale now include a letter to Lina |

### New

| Character | Level | Wants | Fears | Voice and tic | Role |
|---|---|---|---|---|---|
| **Frau Kessler**, Brass Office clerk | A1 → B1 | A town that matches the file | Being wrong out loud | Imperatives, three words at a time: *„Nicht sprechen. Regel vier.“* Pins a notice before she speaks | Act I antagonist; Act III operator of the eraser's maintenance; can be turned at the council (publishes the notice list) or not |
| **Pip**, 8, Lina's brother | A1 | To win the name game | His parents' names going pale on his chalk list | Repeats everything twice, counts on fingers | The town's memory; keeper of the chalk list that tracks every name the player has saved; plants the Lenz family and the children's train |
| **Oma Hilde**, Marta's grandmother | A2 | To be asked, once | Dying in a village that officially does not exist | Slow, exact, remembers house numbers | Elder of the Unwritten Circle; explains the house in two towns; the first person the Office should have asked |
| **Herr Falk**, ink seller | A2 | To sell every bottle before anyone tests one | The machine he once serviced | Charming, never answers a question directly, every sentence a slogan | Red herring, comic foil, and the source who names Nebelstadt and the machine |
| **The Lenz family** (Jakob and Ruth Lenz) | A2 / B1 | To go home to Lindenhafen | That Pip has forgotten them | Jakob talks about boats; Ruth talks about Pip | Forgotten by Waldruh; at Fritz's table in Act II; the family in the red boat in the storm; the first people through the reopened route |
| **Jonas**, Nebelstadt signalman | B1 | To keep the signal lit | Speaking (silence was rewarded) | Writes on a slate instead of speaking | The one person in Nebelstadt who must be persuaded to say a name aloud; the storm scene depends on him |
| **Four pupils** among Lindenhafen's residents (Ella, Karl, Bea, Theo) | A1 | To remember their teacher | — | One bark each, flag-conditioned | Side stories; called to the bench in a1-bench |

Address rule additions: Kessler uses *Sie* to everyone and is never offered *du*. Pip says *du* to everyone, including Voss, who corrects him once and then gives up. Jonas writes *Sie* and speaks *du*.

---

## 5. Places

Each story town gets one **locked** place (opened with an item the player earned), one **changing** place (the world shows the change, not a line), and one **spectacle** (an event the player watches happen in the world). The painted districts that the story does not use yet get a reason to be visited.

### Lindenhafen (A1)

| Kind | Place | District | What happens |
|---|---|---|---|
| Locked | Otto's old office | station-yard | Exists (a1-station). Now also the ticket desk for side quests: the hundred tickets are laid out and each one found lights a lantern on the wall |
| Locked | The Office notice window | library-square | Kessler's counter. Opens for the player with the ledger (reported path) or Otto's second key (protected path); holds the register and the notice list (a1-office-window) |
| Changing | Gartenstraße 7 | canal-walk | Four scenery variants: full plate → blank plate → number gone → door boarded. Switched by flags at a1-directions, a1-lost-parcel, and restored in the finale |
| Changing | Fritz's chalk list | harbor-court | A world object whose lines fade with the ink registry; names the player saves are rewritten |
| Changing | Pip's chalk wall | canal-walk | The tracker: every saved name appears here in Pip's handwriting |
| Spectacle | Platform seven | station-yard | The train arrives as a world event in scene 1 and departs in scene 18 (the existing train sprite, driven by story stage rather than only by cinematic text) |
| New use | The library | library-square | Frau Berg's old classroom; the four pupils gather here in a1-bench; a side quest finds her reading glasses |
| New use | Bridge quay | bridge-quay | Where the Lenz boat used to moor (M7); a ticket side quest |

### Waldruh (A2)

| Kind | Place | What happens |
|---|---|---|
| Locked | Mill cellar | Opened with the Keeper's key (first use of the key). Holds the draft of the first closure order, Falk's old Office badge, and the face of the name the mill lost (a photograph that is blank or not, depending on the a2-broken-clock branch) |
| Locked | Oma Hilde's room, upstairs at the inn | Opened by Marta after a2-apartment; the window faces the forest (Elise's first letter) |
| Changing | The memory stone | Names fade with the ink registry; restored by the village reading them aloud (consult branch) or by side quests |
| Changing | The forest path to the old rails | Stones on the track; every ticket side quest in Waldruh removes one stone |
| Spectacle | The clockmill hour | The mill's hour is playable more than once (the existing Lost Hour game as a repeatable night event) and the hands visibly jump at 23:00 on the world clock |
| New | Falk's cart on Lantern Square | Appears after a2-evening-plans and leaves after a2-cellar |

### Nebelstadt (B1)

| Kind | Place | What happens |
|---|---|---|
| Locked | The observatory stairs | Opened with the Keeper's key (second use); until then Elise's door is a locked door the player can stand in front of |
| Locked | The Office record room | Opened with the ledger or with Kessler's cooperation; holds the maintenance slips |
| Changing | The harbour signal | Brightness follows the dark beam and the storm; Jonas's slate beside it shows the last name spoken |
| Changing | The harbour | The red boat is moored until the storm, then out beyond the beds |
| Spectacle | The dark beam | Sweeps the map on the world clock after b1-new-route and puts lanterns out where it passes (lantern lights are point lights already) |
| New | Signal tower | Jonas's post; the b1-signalman scene and the Hold the Signal mini-game |

### The unnamed coast

The ten expedition regions, with one Atlas thread each (section 8).

---

## 6. Objects

| Object | Gained | Does |
|---|---|---|
| **The lamp** (`signal-lamp` / `registered-lamp`) | a1-workshop | **Dowses.** Its glow in the world follows the distance to the nearest fading name in the ink registry; it hums louder as the player nears one. Leads the player to side-quest targets and to the hidden finds in errands |
| **The Keeper's key** (new item `keeper-key`, granted in a2-apartment) | a2-apartment | Opens the mill cellar and the observatory. In b1-temptation the player may turn it: closing the route stops the beam tonight and erases Waldruh's new names; refusing keeps the storm hard. Final custody choice unchanged |
| **Otto's key** (`lamplighter-key`) | a1-arrival | Opens Otto's office (existing) and the Office notice window on the protected path |
| **Voss's ledger** (`inspector-ledger`) | a1-arrival | Readable on the case board: a page per reported fact, Kessler's handwriting visible beside Voss's; opens the record room; publishable at the council (existing) |
| **The hundred tickets** (new collectible) | a1-station onwards | Each ticket carries a forgotten name and a place. Finding the person or the place and saying the name aloud (one-word production) restores a resident bark, a chalk line and a lantern in Otto's office. 24 authored, 8 per town; the remaining 76 are the sequel budget |
| **Pip's chalk list** | a1-chalk | The journal's tracker of saved names and lost names, rendered on the canal wall |
| **The glove** (`glove-taken`) | a1-lost-found | Its pair is on Elise's desk in the finale; with both, Elise's first line changes |
| **Falk's ink bottle** (new, optional) | a2-ink-seller | A test: write a name in it on the case board and watch it fade anyway (the "Re-ink" mini-game with a twist) |
| **The tape** | b1-witness | Existing Looping Tape game |
| **Kessler's stamp** | b1-council | If Kessler is turned, she hands it over; a flag the finale and the brass ending acknowledge |
| **Frau Berg's reading glasses** | side quest | Returned at a1-bench; she reads her own name from the board |

---

## 7. Scene plan

Existing ids keep their gate exercises, choice ids, effects and items. New scenes are marked **new**, carry one gate exercise authored like the errands (seven course exercises, a manifest entry), set flags or grant the items listed, and are added to `everydayQuestIds` on both sides so old saves pass them. Side quests are not in the chain.

### Act I: Lindenhafen (A1), 22 scenes

| # | Scene | NPC | Shape | Find | Open question it serves |
|---|---|---|---|---|---|
| 1 | a1-arrival | Otto, Voss | existing | ticket, board | M1 |
| 2 | a1-timetable | Otto | existing | the W | M1 |
| 3 | **a1-notice** (new) | Kessler, Otto | Confrontation: Kessler pins *„Namen nicht laut nennen. Regel vier.“* on the board and fines Otto for saying *Waldruh*'s W aloud. Gate: *„Warum nicht?“*-type A1 question (exact exercise to be authored). Choice: tear the notice down (`notice-torn`, +Lamplighters) or read it aloud to the square (`notice-read`, +Circle) | the notice, Kessler's stamp | M3 |
| 4 | a1-cafe | Marta | existing; Kessler has taken the guest book (line) | the paid note, the receipt | M1 |
| 5 | a1-room | Marta | existing + find: a faint second letter after the E. in the guest book margin, readable with the lamp later | guest book, cold tea | M1 |
| 6 | a1-shopping | Fritz | existing + Fritz's fine for the roll-call | the chalk list | M2, M3 |
| 7 | a1-market | Fritz, Voss | existing | order slip | M2 |
| 8 | **a1-chalk** (new) | Pip, Lina | Game scene: Pip explains the name game (say a name, write it, it stays); two names on his wall are pale: *Mama, Papa*. Gate: *„Wie heißt du?“*. Choice: play now (`pip-game-played`) or promise for Friday (`pip-game-friday`) | the chalk wall, two pale names | M4, M7 |
| 9 | a1-neighbour | Marta | existing | bookmark on the bench | M5 |
| 10 | a1-pharmacy | Greta | existing + find: a second uncollected bag, a different pale name (a ticket target) | two bags | M4 |
| 11 | a1-directions | Lina | existing; Gartenstraße 7 variant switches to "blank plate" | plate, note | M5 |
| 12 | **a1-bench** (new) | Frau Berg, then Marta, Fritz, the four pupils | Rescue: an old woman on the fountain bench with a book and no name. She cannot say who she is. The player fetches people who can (objective: bring three who say *Frau Berg* aloud; the pupils respond to the flag). Gate: *„Wie heißen Sie?“* (Sie, a formal lesson). Choice: she comes to Marta's (`berg-at-marta`) or stays on her bench (`berg-on-bench`). Cinematic `remembered` | the glasses, the book | M5, answers it |
| 13 | a1-station | Otto, Voss | existing; the hundred tickets become the collectible | tickets | M4, M6 |
| 14a / 14b | a1-weather | Otto | **branch**: with Voss's ticket (reported) the morning scene is a1-weather as written; on the protected path the player instead meets Kessler at the window (a1-weather's gate stays; the intro node is chosen by flag) | umbrella / notice list | M6, M3 |
| 15 | a1-workshop | Emil | existing; the lamp now dowses from here | the lamp | M4 |
| 16 | a1-bike | Emil | existing | order book | M1 |
| 17 | a1-phone | Marta, Voss; Kessler audible | existing + find: a name in the register written twice, once crossed out in another hand; Voss and Kessler disagree on the line | register | M3 |
| 18 | **a1-office-window** (new) | Kessler, Otto | Deduction: at the Office window the player compares the crossed-out hand with the notice (flag `notice-*`) and names the hand. Requires ledger or Otto's second key. Gate: *„Das ist Ihre Schrift.“*-type statement (to be authored within A1). Choice: Kessler files the player's name (`name-filed-office`) or the player takes the notice list (`notice-list-taken`, item `notice-list`) | notice list, crossed-out name | M3 answered |
| 19 | a1-invitation | Fritz; Frau Berg present if `berg-at-marta` | existing; the chair choice is now about a present person | twelve glasses | M2 payoff |
| 20 | a1-lost-found | Lina | existing + find: a second platform-seven ticket, name still dark: *Lenz* | the Lenz ticket | M7 |
| 21 | a1-lost-parcel | Lina | existing; the house variant switches to "number gone"; Frau Berg has nowhere to go (cost) | parcel | M1 answered; cost of M5 |
| 22 | a1-departure | Otto, Voss, Kessler | existing + Voss overrules Kessler's objection; Pip waves | ticket | — |

Errand pre-gate rewrites: each errand keeps its gate and flags and gains the find listed. Budget: at most 10 new lexemes per scene, checked by `npm run pacing` and `node scripts/audit-dialogue-levels.mjs --check`.

### Act II: Waldruh (A2), 10 scenes

| # | Scene | NPC | What changes |
|---|---|---|---|
| 23 | a2-apartment | Marta, Voss | On the bible: no registered pillow; grants `keeper-key` as an item (the lease key) |
| 24 | **a2-upstairs** (new) | Oma Hilde, Marta | Oma Hilde explains the house in two towns and that nobody asked her; she bought Falk's ink. Gate: a polite A2 request. Choice: ask her to the table (`hilde-invited`) or let her rest (`hilde-rests`) |
| 25 | a2-evening-plans | Fritz, Greta, Lina; **the Lenz family at the table** | On the bible: no sneezing fern. The Lenz family are seated and nobody in Waldruh knows their names; Lina does not look at them. Greta's line about market days |
| 26 | **a2-ink-seller** (new) | Falk | Comic sales scene on Lantern Square; the player can buy a bottle. Gate: price or refusal. Choice: buy (`ink-bought`, item `falk-ink`) or ask where it comes from (`falk-questioned`) |
| 27 | a2-rail-trip | Otto, Voss | On the bible: no pigeons. Existing 17:59 game |
| 28 | **a2-forest-rails** (new) | Lina | The old rails in the forest: stones still on the track. Lina counts them and says what she has not said: she was ten and on that train; Elise stopped it. Gate: past tense question. Choice: tell Pip (`lina-tells-pip`) or not yet (`lina-waits`) |
| 29 | a2-broken-clock | Emil | On the bible: no walking lamp, no tomorrow receipt. **The restore branch really loses a name:** the Circle member Ruth Lenz's name goes from the stone and she is absent from a2-cellar, the council and the storm (flag `ruth-lost`); the consult branch keeps her. Existing Lost Hour game |
| 30 | a2-clinic | Greta, Voss | On the bible: no fern. A second patient who was a child on the train (M9 hint) |
| 31 | **a2-cellar** (new) | Falk, Emil | Opened with the key (first use). Falk's Office badge; his ink tested on the case board (fades); he saw the machine and names Nebelstadt. Gate: *„Erklären Sie mir, warum…“*-type. Choice: let Falk go (`falk-released`) or bring him to Ada (`falk-witness`) |
| 32 | a2-archive | Ada, Voss | Existing; Falk present if `falk-witness`; the double-voice hook line added |

### Act III: Nebelstadt (B1), 10 scenes

| # | Scene | NPC | What changes |
|---|---|---|---|
| 33 | b1-witness | Lina, Marta, Ada, Voss | On the bible: no pigeon witness, no "tea is an exhibit"; Falk as second witness if `falk-witness` |
| 34 | **b1-record-room** (new) | Kessler, Ada | Opened with the ledger or `notice-list`. Maintenance slips in Kessler's hand. Gate: formal B1 request. Choice: give Kessler a chance to speak at the council (`kessler-invited`) or file the slips (`slips-filed`) |
| 35 | b1-new-route | Otto, Greta | Existing; **the route choice decides the storm**: slow route = the Lenz boat is reached by the clinic train (`clinic-stop`); fast route = a rope rescue |
| 36 | **b1-signalman** (new) | Jonas, Emil | Jonas keeps the signal but will not speak; the player must get one name out of him (his own). Gate: B1 persuasion. Choice: he speaks (`jonas-speaks`) or he writes it and the player reads it aloud (`jonas-writes`). Hold the Signal mini-game introduced here |
| 37 | b1-work | Emil, Voss | Existing confession; Kessler named as the hands |
| 38 | b1-council | Ada, all; Kessler if invited | Existing; a fourth voice: Kessler can publish the notice list (`kessler-turned`), which gives +Brass without the ledger (third-ending fix) |
| 39 | **b1-temptation** (new) | Elise's voice on the tape, Voss, Ada | The only scene where the player can do harm. The beam is at its strongest; the key is in the player's hand; Ada says it could close the route tonight and stop the beam. Gate: B1 conditional sentence. Choice: turn it (`route-closed-again`: Waldruh's new names fade, the storm is short, the finale is colder, Elise's first line changes) or refuse (`key-refused`: the storm is long). Both continue; neither is a game over |
| 40 | b1-storm | Greta, Otto, Emil, Marta, Voss, Lina, Jonas | Existing; the roll-call now depends on the Lenz, Ruth, Jonas, Kessler and clinic-stop flags; Hold the Signal is the gate's mini-game |
| 41 | b1-atlas | Elise, Voss | Existing; drafts include a letter to Lina; Frau Berg's address restored on screen; the key custody choice unchanged |
| 42 | **Epilogue** (no gate) | Otto, Pip, Frau Berg | The first train through the reopened route (or the first vote); the Lenz family walk off the train to Pip; Frau Berg's plate variant restored in Lindenhafen; the coast appears on the atlas |

### Side quests (not in the chain)

- **Tickets (24).** Eight per town. Each: a name and a place on the ticket, a target in the world (a resident, a door, a boat, a bench), a one-word production (the name), a bark restored, a chalk line on Pip's wall, a lantern in Otto's office. Hosted by Otto (Lindenhafen), Oma Hilde (Waldruh), Jonas (Nebelstadt). No new lexemes beyond the names.
- **Pupils (4).** Ella, Karl, Bea and Theo each have a two-line memory of Frau Berg, unlocked after a1-bench; collecting all four gives her the reading glasses scene.
- **Falk's customers (3).** Oma Hilde, a clinic patient and Fritz bought ink; each test shows it fading; completes M10 from the other side.
- **Repeatable nights.** The clockmill's hour (Lost Hour) and the signal (Hold the Signal) can be replayed on the world clock after their scenes for ink restoration in that town.

---

## 8. The unnamed coast

Each expedition region gets one **Atlas thread** encounter in its existing encounter set (A1/A2/B1 variants, as the encounters already have):

| Region | Thread |
|---|---|
| Saffron Court | A Brass Office notice in German, pinned on a courtyard gate; the residents ask what it means |
| Rain Arcade | A name on a shop sign has gone pale; the arcade's timetable lists a train that never came |
| Windplain | The moving camp keeps its names by saying them at every move (the Circle's method, independently found) |
| Riverweave | A red boat with *Lenz* on the hull, sold years ago |
| Terracielo | A memory stone of their own, with one smooth patch |
| Sunpatch | The radio announcement is a looping tape |
| Kigalights | A screening of a film about a vanished railway |
| Cedar Bay | The reading room has one of Frau Berg's primers |
| Seoul Steps | A rooftop lantern answers Lindenhafen's signal pattern |
| Dune Garden | A water agreement written "so that silence never counts as consent" |

Plus one ending-conditioned line per region (the first train reached here / the vote is still open / the Office's complaints desk has a branch). This gives the finale's last promise a place to go and adds eighty characters' worth of world to the story at the cost of about forty lines.

---

## 9. Systems to build

### 9.1 Ink registry (the rule as a mechanic)

- `web/src/data/ink-registry.json`: per town, a list of nameable world entries `{id, mapId, objectId|residentId|sceneryId, german, english, kind: plate|sign|chalk|stone|hud, decayHours, restoredBy: [questId|sideId|flag]}`.
- Server: `StoryState.Ink map[string]float64` (0 pale … 1 dark) advanced by the shared world clock on each `story` read, restored by quest completion, side-quest completion and the explicit "say it" action; persisted with the story state. Server-authoritative so it cannot be gamed; the client only renders.
- Client: `web/src/ink.ts` reads the state and drives (a) text overlays on scenery (plate, chalk, stone), (b) the HUD ticket name, (c) resident barks (a pale resident goes quiet), (d) Pip's chalk wall. Scenery variants for Gartenstraße 7 are switched by flags through the existing variant mechanism (`variant` on placed scenery, commit 13624bf5).
- The **"say it" action**: standing beside a pale entry, the player gets a one-word production prompt (reuses the `lex-` drill path with the name as the target; names are free of the lexical gate). Success restores the ink; failure costs nothing.

### 9.2 Lamp dowsing

- When `signal-lamp` or `registered-lamp` is in the inventory, the lamp's point light intensity and a low hum follow the inverse distance to the nearest registry entry with ink below a threshold. Pure client code in the world scene; a small HUD indicator for reduced-motion players.

### 9.3 A bell with teeth

- Keep milestones. Make `BellWarnings` **reversible**: an entry reaching ink 0 calls `warnStoryBell`; restoring every lost entry in the town decrements it. Cap stays at 2, so the finale is always reachable. The HUD bell shows the warning as a cracked bell that heals.
- Never from language mistakes: `recordStoryGateFailure` remains separate.

### 9.4 Locked places and item uses

- `StoryRule.objects[].condition` (reuse `StoryCondition`) on the server; `inspectStory` refuses with a one-line reason ("The key fits a different door", "The ledger opens this window"). Client shows the lock on the marker.
- The key's uses are object conditions; b1-temptation's turn is a normal choice with effects (`flag`, plus a new effect `ink: {mapId, amount}` that pales a town).

### 9.5 Branches

- `QuestGraph.start` may be a list `[{node, condition}]`; `storyNode` on the server and `nodeForStage` on the client pick the first whose condition is met (a1-weather's two intros, the storm's roll-calls).
- **Cast changes**: story NPC and resident visibility conditions in `story_rules.json` (`npc.condition`) and in `world-life.ts` resident specs (`condition`), evaluated against the story state. Ruth Lenz absent after `ruth-lost`; Falk's cart present only between two flags; Frau Berg at Marta's or on the bench.
- Third ending: `kessler-turned` adds +2 Brass at b1-council; honest dealing with Voss (spell your name, return the umbrella, bring witnesses) each adds +1 Brass retroactively in the rules file so Brass can reach parity without the scene-1 ledger. Re-run the ending arithmetic in `story_state.go` tests.

### 9.6 Side quests

- `server/story_rules.json` gains `sideQuests`: `{id, mapId, hostNpcId, targetObjectId|targetResidentId, name, requires: StoryCondition, rewards: [{bark}, {chalk}, {ink}, {xp}]}`. Completion endpoint reuses the story transition with `kind: "side"`; evidence is the one-word production receipt.
- Client: a **Tickets** page in the journal (found / restored / missing counts per town), Pip's chalk wall rendering, Otto's office lanterns.

### 9.7 Spectacle

- Platform-seven train arrival and departure as world events keyed to story stage (the train sprite and the existing `travel` cinematic camera).
- Dark beam sweep: a rotating light cone on the Nebelstadt map after b1-new-route; lantern point lights it passes dim for a few seconds.
- Four new cinematic kinds in `cinematic-content.ts`: `remembered` (a1-bench), `rails` (a2-forest-rails), `temptation` (b1-temptation), `epilogue`.

### 9.8 Mini-games

- **Lamp Walk** (Act I, new, mechanic reuses `pictures` + the world): walk Gartenstraße with the lamp, pick the house where the name is fading from three spoken addresses.
- **Hold the Signal** (Act III, new, mechanic reuses `chain` with a beat): say the three towns' names and the Lenz name in rhythm with the signal; each miss dims it. Gate game for b1-storm.
- Existing: Lost Hour and the signal become repeatable night events.

### 9.9 Lint and audits

Extend `web/src/story-lint.ts`:
- every act has at least three questions open at every scene index (from a `mysteries` table in the bible);
- every inventory item is checked by at least one condition outside dialogue;
- every scene has at least one find (`investigations` non-empty, already true) **and** one line that references a find before the gate;
- new characters never speak before their first-appearance scene;
- Kessler never says *du*; Pip never says *Sie*.
Keep `npm run pacing`, `node scripts/audit-dialogue-levels.mjs --check`, `npm run check` and `go test ./...` green at every step.

---

## 10. Phases, order and acceptance

Each phase is shippable on its own and leaves the lint, the server contract and the course gates intact.

### Phase 0: mechanics, no new German (about one week)

Build 9.1, 9.2, 9.3, 9.4 (object conditions, key opens the observatory stairs and Otto's office window), the Gartenstraße variants, the train as a world event, and the ticket scaffold (9.6) with the eight Lindenhafen tickets using names already in the lexicon.
**Done when:** ink visibly fades and returns on a plate in Lindenhafen; the lamp hums toward it; a cracked bell heals after the name is said; the key refuses the wrong door; `go test ./...` covers ink decay, reversible warnings and object conditions.

### Phase 1: contradictions and audio (two days)

Fix the section-6 list from the review (walking lamp, fern, apples, tomorrow receipt, pigeons, Greta and Fritz in Waldruh, "He is hungry"). Regenerate only those clips with `node scripts/generate-dialogue-audio.mjs --only`.
**Done when:** the whimsy audit in `docs/screenplay.md` Appendix C has no Tier 1 items left in Acts II and III.

### Phase 2: Act I additions (two weeks)

Author a1-notice, a1-chalk, a1-bench, a1-office-window; the errand finds; Kessler, Pip, Frau Berg and the four pupils; the a1-weather branch; the `remembered` cinematic; Lamp Walk. Seven course exercises and a manifest entry per new scene (`scripts/build-story-curriculum.mjs`), clips for every line, Turkish support text.
**Done when:** Act I has 22 scenes, every one at or under 10 new lexemes in `npm run pacing`, the dialogue audit passes, the lint's "three open questions" rule passes for Act I, and a save from before this phase reaches a1-departure without touching the new scenes.

### Phase 3: one real branch per act and the third ending (one week)

Conditional start nodes, NPC and resident visibility conditions, `ruth-lost`, `clinic-stop`, Brass parity rules, ending arithmetic tests.
**Done when:** all three endings are reachable in the server tests from a protected-ticket start, and the storm roll-call differs across the four flag combinations.

### Phase 4: Acts II and III on the bible (three weeks)

Rewrite the twelve existing scenes to the bible and the finds; author a2-upstairs, a2-ink-seller, a2-forest-rails, a2-cellar, b1-record-room, b1-signalman, b1-temptation, the epilogue; Oma Hilde, Falk, the Lenz family, Jonas; the `rails`, `temptation` and `epilogue` cinematics; Hold the Signal; the dark beam sweep.
**Done when:** 42 scenes, the reveal map in the bible updated with M3 to M14, the lint's "reveal once, in order" rule green, and the pacing audit shows Acts II and III each at or under 10 new lexemes per scene where the course allows (A2/B1 are not gated but are measured).

### Phase 5: width (two weeks)

The remaining sixteen tickets, the pupils, Falk's customers, repeatable nights, the ten coast threads and the ending-conditioned expedition lines.
**Done when:** the journal's Tickets page shows 24 restorable names across three towns, each expedition has one Atlas encounter, and the pacing table shows narrative content available past intake hour 92.

### Phase 6: polish (one week)

Camera framing for the new cinematics, sound for the hum and the cracked bell, screenshots for `docs/screenshots`, the bible and the screenplay regenerated, `docs/story-expansion-plan.md` closed out with what shipped.

---

## 11. Costs and risks

- **Audio.** Roughly 300 new lines for twelve new scenes, 300 rewritten in Acts II and III, 200 for side content: about 800 clips, close to one full TTS run. Use `--only` per scene; run the full regeneration once at the end of Phase 4.
- **A1 wording.** Kessler, Pip and Frau Berg scenes must stay under 10 new lexemes; the gate sentences must be real course exercises. Author the gate first, then the scene.
- **Server state growth.** The ink map adds one float per registry entry (about 60 entries); negligible.
- **Saves.** Every new scene is in `everydayQuestIds` on both client and server; new items are granted on first read of their scene for saves already past it (`ensureStory` migration), so the key exists for a save already in Act III.
- **Scope.** If time is short, Phases 0 to 2 alone turn the rule into play and give Act I an opponent, a child and a rescue; that is where most of the excitement per hour of work is.

---

## 12. What shipped (2026-10-15)

All phases were implemented in one pass on the `claude/game-story-review-1005c2` branch. The story bible (`docs/story-bible.md`) and the screenplay (`docs/screenplay.md`, scene text now rendered from the dialogue graphs) describe the result.

| Phase | Shipped | Not done or different from the plan |
|---|---|---|
| 0. Rule as mechanic | Server-side ink registry with decay, "say it aloud" restoration, bell cracks from lost names (`server/story_mechanics.go`, authored in `content/story-mechanics.json`); ink labels and the lamp hum in the world; locked evidence (`lock` on investigations); the station train as a world event; the dark beam sweep in Nebelstadt | Gartenstraße 7 uses an ink label instead of switching a painted scenery variant |
| 1. Contradictions | Tier 1 whimsy removed from Acts II and III, map descriptions, NPC roles and ambient lines | — |
| 2. Act I | a1-notice, a1-chalk, a1-bench, a1-office-window; Kessler, Pip, Frau Berg on screen; the `remembered` cinematic; each new scene at or under 10 new lexemes; the A1 audit passes | Lamp Walk reuses the Lantern Lighting mechanic rather than a bespoke street walk. The a1-weather branch (conditional start nodes) was not built; every player meets Kessler in the separate a1-office-window scene instead |
| 3. Branches and third ending | `ruth-lost`/`ruth-kept`, `clinic-stop`, `route-closed-again`, Kessler and Falk as Brass sources; server tests show every ending is reachable, Brass without the ledger | — |
| 4. Acts II and III | a2-upstairs, a2-ink-seller, a2-forest-rails, a2-cellar, b1-record-room, b1-signalman, b1-temptation and the epilogue; Hilde, Falk, the Lenz family, Jonas; `rails`, `temptation`, `epilogue` cinematics; 41 scenes in all | Act III has nine scenes, as listed in section 7 (the heading's "10" counted the epilogue) |
| 5. Width | 24 tickets (8 per town, hosts Otto, Hilde, Jonas); Frau Berg's four pupils (group flag `pupils-remembered` gives her glasses back); Falk's three customers; Hold the Signal as a dusk game; the ten coast threads with ending-specific lines, shown on arrival, in the expedition overview and in the journal | Coast threads are story text, not graded encounters, so the expedition learning pipeline is unchanged. Night replays do not restore ink. A returned name shows its memory in the journal and darkens linked ink; Otto's office lanterns and per-ticket chalk lines were not built |
| 6. Polish | Voices for the seven new speakers; bible, screenplay and this close-out | Human art review of the eight new cast members, native Turkish review and an in-browser visual pass are still open; camera framing and the cracked-bell sound were not tuned |
