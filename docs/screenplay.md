# glotworld

### A screenplay reconstruction of the full game plot

Built from `web/src/data/dialogue-graphs.json`, `web/src/data/story-text.json`, `web/src/cinematic-content.ts` and `server/story_state.go`. Dialogue is the English rendering of the in-game German; signature German lines are kept where they matter. The PLAYER's lines are the course "gate" sentences the learner must actually say. Branches are marked `[CHOICE]`. Conditional lines that only appear on one branch are marked `(if …)`.

Scene-only notes for review are in `> REVIEW:` blocks.

---

## DRAMATIS PERSONAE

| | |
|---|---|
| **THE PLAYER** `{name}` | A newcomer holding a ticket signed "E." Says *Sie* to officials, *du* to everyone else. |
| **OTTO** | Stationmaster. Counts platforms. Still lights the lantern on platform seven every morning. |
| **MARTA** | Café and inn keeper. Asks every guest's name and writes it down twice. Was Frau Berg's pupil. Her café and the Waldruh inn share one door. |
| **FRITZ** | Market trader and cook. Nobody eats alone at his table. |
| **LINA** | Courier. Every letter must arrive. Numbers and labels everything. |
| **EMIL** | Inventor. Built a lamp from platform seven's old lantern. Everything "works mostly". |
| **GRETA** | Botanist. Runs Lindenhafen's small pharmacy and garden in Act I, the clinic in Act II. She keeps seeds from vanished houses. |
| **ADA** | Archivist of the travelling archive. Files the truth alphabetically. Elise's former apprentice. |
| **INSPECTOR VOSS** | Brass Office. Formal *Sie*, stamps things, never raises his voice. Listens to a recording every night. |
| **ELISE** | Keeper of the Atlas. Absent for forty scenes; present only in letters, a voice on tape, and her handwriting. |
| **FRAU BERG** | Retired teacher at Gartenstraße 7; taught half the town to read, reads on the fountain bench every morning, strict about commas. Found on her bench in a1-bench without her own name; her house still disappears. |
| **FRAU KESSLER** | Brass Office clerk. Always *Sie*. Pins a notice before she speaks. Wrote rule four. |
| **PIP** | Lina's little brother. Writes every name he hears on the chalk wall by the water. |
| **OMA HILDE** | Waldruh. Sees both towns from her upstairs window. Nobody asked her either. |
| **HERR FALK** | Ink seller in Waldruh. His ink fades in three days. Former Office clerk. |
| **JAKOB and RUTH LENZ** | Lina and Pip's parents, forgotten in Waldruh. A red boat with their name on it. |
| **JONAS** | Signalman in Nebelstadt. Paid to stay silent for twelve years. Writes on a slate. |

**The factions** (the player's choices shift reputation):
- **The Lamplighters** want every route reopened now.
- **The Unwritten Circle** want to be asked first.
- **The Brass Office** says the files are correct.

**The conceit.** Names fade unless somebody says them aloud. That is the only rule in Act I; there is no other magic there. The Atlas's ink answers only to German, so every German sentence the player speaks keeps something from fading. The route-closing key, the clockmill and the eraser belong to Acts II and III.

---

# PROLOGUE — THE NIGHT TRAIN

Brandt, the train conductor, asks; the player answers. The train rooms are illustrated backdrops. Object inspections and replies advance the story independently of vocabulary intake.

### A ticket in your hand `a0-ticket`

**intro**

> **BRANDT:** *Guten Abend.* — Good evening.
> **BRANDT:** *Die Fahrkarte, bitte.* — The ticket, please.

**gate**

> **BRANDT:** *Die Fahrkarte, bitte.* — The ticket, please.

Task: He is asking for your ticket. Hand it over.
> **PLAYER (reply):** *Bitte.* — Here you are.
> **PLAYER (distractor):** *Guten Abend.* — Good evening.

**choice**

> **BRANDT:** *Danke.* — Thank you.
> **BRANDT:** *Lindenhafen! Gut.* — Lindenhafen! Good.
> [CHOICE **PLAYER** → `complete`] *Danke.* — Thank you.

**complete**

> **BRANDT:** *Danke.* — Thank you.

**Objects in the room**

- `prologue-ticket`: *Fahrkarte. Lindenhafen.* — Ticket. Lindenhafen.

### Your name on the ticket `a0-name`

**intro**

> **BRANDT:** *Der Name!* — The name!
> **BRANDT:** *Wie heißen Sie?* — What is your name?

**gate**

> **BRANDT:** *Wie heißen Sie?* — What is your name?

Task: Say your name.
> **PLAYER (reply):** *Ich heiße {name}.* — My name is {name}.

**choice**

> **BRANDT:** *{name}. Gut.* — {name}. Good.
> **BRANDT:** *Der Name bleibt.* — The name stays.
> [CHOICE **PLAYER** → `complete`] *Danke.* — Thank you.

**complete**

> **BRANDT:** *Danke, {name}.* — Thank you, {name}.

**Objects in the room**

- `prologue-name`: *Fahrkarte. Lindenhafen.* — Ticket. Lindenhafen. The name has faded.

### Carriage seven `a0-wagen`

**intro**

> **BRANDT:** *Eins. Zwei. Drei.* — One. Two. Three.
> **BRANDT:** *Vier. Fünf. Sechs.* — Four. Five. Six.
> **BRANDT:** *Sieben.* — Seven.
> **BRANDT:** *Wagen sieben, bitte.* — Carriage seven, please.

**gate**

> **BRANDT:** *Wagen sieben?* — Carriage seven?

Task: Which carriage are you in? Look at the door.
> **PLAYER (reply):** *Sieben.* — Seven.
> **PLAYER (distractor):** *Drei.* — Three.

**choice**

> **BRANDT:** *Ja. Wagen sieben.* — Yes. Carriage seven.
> [CHOICE **PLAYER** → `complete`] *Danke.* — Thank you.

**complete**

> **BRANDT:** *Gut.* — Good.

**Objects in the room**

- `prologue-wagen`: *Wagen sieben.* — Carriage seven.

### Tea in the dining car `a0-tee`

**intro**

> **BRANDT:** *Guten Abend.* — Good evening.
> **BRANDT:** *Tee oder Kaffee?* — Tea or coffee?

**gate**

> **BRANDT:** *Tee oder Kaffee?* — Tea or coffee?

Task: You would like tea. Order it.
> **PLAYER (reply):** *Einen Tee, bitte.* — A tea, please.
> **PLAYER (distractor):** *Einen Kaffee, bitte.* — A coffee, please.

**choice**

> **BRANDT:** *Milch?* — Milk?
> [CHOICE **PLAYER** → `complete`] *Ja, bitte.* — Yes, please.
> [CHOICE **PLAYER** → `complete`] *Nein, danke.* — No, thank you.

**complete**

> **BRANDT:** *Bitte. Der Tee.* — Here you are. The tea.

**Objects in the room**

- `prologue-tee`: *Tee. Kaffee.* — Tea. Coffee.

### Where is …? `a0-wo`

**intro**

> **BRANDT:** *Ja?* — Yes?

**gate**

> **BRANDT:** *Ja?* — Yes?

Task: Ask where the toilet is.
> **PLAYER (reply):** *Wo ist die Toilette?* — Where is the toilet?
> **PLAYER (distractor):** *Wo ist der Tee?* — Where is the tea?

**choice**

> **BRANDT:** *Die Toilette? Da.* — The toilet? There.
> [CHOICE **PLAYER** → `complete`] *Danke.* — Thank you.

**complete**

> **BRANDT:** *Da: der Ausgang.* — There: the exit.

**Objects in the room**

- `prologue-wo`: *Die Toilette.* — The toilet.
- `prologue-exit`: *Der Ausgang.* — The exit.

### Slower, please `a0-langsam`

**intro**

> **BRANDT:** *Lindenhafen kommt!* — Lindenhafen is coming up!
> **BRANDT:** *Verstehen Sie?* — Do you understand?

**gate**

> **BRANDT:** *Verstehen Sie?* — Do you understand?

Task: You did not catch that. Say so.
> **PLAYER (reply):** *Ich verstehe nicht.* — I do not understand.
> **PLAYER (distractor):** *Ja.* — Yes.

**choice**

> **BRANDT:** *Lindenhafen kommt.* — Lindenhafen is coming up.
> [CHOICE **PLAYER** → `after-repeat`] *Noch einmal, bitte.* — Once again, please.
> [CHOICE **PLAYER** → `complete`] *Danke.* — Thank you.

**complete**

> **BRANDT:** *Gut.* — Good.

**after-repeat**

> **BRANDT:** *Lindenhafen kommt. Gut?* — Lindenhafen is coming up. All right?

**Objects in the room**

- `prologue-langsam`: *Lindenhafen.* — Lindenhafen.

### Morning `a0-morgen`

**intro**

> **BRANDT:** *Guten Morgen.* — Good morning.
> **BRANDT:** *Der Zug ist da.* — The train is here.
> **BRANDT:** *Lindenhafen! Bahnsteig sieben.* — Lindenhafen! Platform seven.

**gate**

> **BRANDT:** *Auf Wiedersehen, {name}.* — Goodbye, {name}.

Task: Say goodbye.
> **PLAYER (reply):** *Auf Wiedersehen.* — Goodbye.
> **PLAYER (distractor):** *Guten Morgen.* — Good morning.

**choice**

> **BRANDT:** *Gut.* — Good.
> [CHOICE **PLAYER** → `complete`] *Danke.* — Thank you.

**complete**

> **BRANDT:** *Bahnsteig sieben. Da.* — Platform seven. There.

**Objects in the room**

- `prologue-morgen`: *Lindenhafen. Bahnsteig sieben.* — Lindenhafen. Platform seven.

# ACT ONE — LINDENHAFEN
### "The names that fade" (A1)

### A ticket from nowhere `a1-arrival`

**intro**

> **OTTO:** *Guten Morgen! Willkommen in Lindenhafen.* — Good morning! Welcome to Lindenhafen.
> **OTTO:** *Moment. Du kommst von Bahnsteig sieben?* — Hang on. You came in on platform seven?
> **OTTO:** *Deine Fahrkarte, bitte.* — Your ticket, please.
> **OTTO:** *Hier steht {name}. Bahnsteig sieben. Unten: E.* — It says {name}. Platform seven. At the bottom: E.
> **OTTO:** *Sieh! Dein Name geht weg.* — Look! Your name is fading.
> **OTTO:** *Sag deinen Namen laut. Dann bleibt er.* — Say your name out loud. Then it stays.
> **OTTO:** *Gut. Siehst du? Er ist wieder schwarz.* — Good. See? The ink is dark again.
> **VOSS:** *Guten Morgen. Voss, vom Messingamt.* — Good morning. Voss, from the Brass Office.

**gate**

> **VOSS:** *Fahrkarte-nicht-gültig-Bahnsteig-sieben-nicht-im-Plan!* — Ticket-not-valid-platform-seven-not-on-the-timetable!
> **VOSS:** *Abgeben-bitte-danke!* — Hand-it-over-please-thank-you!

Task: Voss talks too fast. Ask him to say it again.
> **PLAYER (reply):** *Noch einmal, bitte.* — Once again, please.
> **PLAYER (distractor):** *Guten Morgen!* — Good morning!

**choice**

> **VOSS:** *Gern. Langsam: Ihre Fahrkarte ist nicht gültig.* — Certainly. Slowly: your ticket is not valid.
> **VOSS:** *Bahnsteig sieben steht nicht im Plan.* — Platform seven is not on the timetable.
> **OTTO:** *Der Zug war aber hier. Ich war da.* — But the train was here. I was there.
> **VOSS:** *Der Plan ist richtig, Herr Otto. Immer.* — The timetable is right, Otto. Always.
> **OTTO:** *Ihr Plan, Herr Voss. Mein Bahnsteig.* — Your timetable, Mr Voss. My platform.
> **VOSS:** *Die Fahrkarte kommt in mein Buch. Bitte.* — The ticket goes into my ledger. Please.
> **OTTO:** *Oder sie bleibt hier. Bei uns.* — Or it stays here. With us.
> **VOSS:** *Wer bekommt Ihre Fahrkarte: Otto oder ich?* — Who gets your ticket: Otto or me?
> [CHOICE **PLAYER** → `after-report`] *Bitte, Herr Voss. Hier ist die Fahrkarte.* — Here you are, Mr Voss. Here is the ticket.
> [CHOICE **PLAYER** → `after-protect`] *Die Fahrkarte bleibt bei mir.* — The ticket stays with me.

**after-report**

> **VOSS:** *Danke. Jetzt ist alles in Ordnung.* — Thank you. Now everything is in order.
> **VOSS:** *Mein Buch für Sie. Dort steht alles.* — A copy of my ledger, for you. Everything is in it.
> **OTTO:** *Jetzt hat Voss deinen Namen. Sag ihn oft.* — Now Voss has your name. Say it often.

**after-protect**

> **VOSS:** *Gut. Ich komme wieder. Mit Formular.* — Fine. I will be back. With a form.
> **OTTO:** *Hier. Mein alter Schlüssel. Für Bahnsteig sieben.* — Here. My old key. For platform seven.
> **OTTO:** *Sag deinen Namen jeden Tag. Dann bleibt er.* — Say your name every day. Then it stays.

**complete**

> **OTTO:** *Du hast Hunger. Geh zu Marta ins Café.* — You are hungry. Go to Marta at the café.

**Objects in the room**

- `lindenhafen-platform-ticket`: *Fahrkarte: {name}. Bahnsteig sieben. Unten: E.* — Ticket: {name}. Platform seven. At the bottom: E.
- `lindenhafen-noticeboard`: *Bahnsteig eins bis sechs. Kein Bahnsteig sieben.* — Platforms one to six. No platform seven.

**Optional question: Wer ist Voss?**

> **OTTO:** *Voss ist vom Messingamt. Er hat ein Buch.* — Voss is from the Brass Office. He keeps a ledger.
> **OTTO:** *Dort stehen alle Namen. Sagt er.* — Every name is in it. So he says.
> **OTTO:** *Er schreibt auch das Wetter auf. Jeden Tag.* — He writes down the weather too. Every day.

**Optional question: Warum machst du die Laterne an?**

> **OTTO:** *Bahnsteig sieben ist seit zwölf Jahren zu.* — Platform seven has been closed for twelve years.
> **OTTO:** *Seit zwölf Jahren kommt hier kein Zug.* — No train has stopped here in twelve years.
> **OTTO:** *Aber ich mache jeden Morgen die Laterne an.* — But I still light the lantern every morning.
> **OTTO:** *Ordnung ist Ordnung. Auch ohne Zug.* — Rules are rules. Train or no train.

**Optional question: Wer ist E.?**

> **OTTO:** *Ich weiß es nicht. Nur E.* — I do not know. Just E.
> **OTTO:** *E. kennt deinen Namen. Kennst du E.?* — E. knows your name. Do you know E.?


### 2. LINDENHAFEN · STATION BOARD — Six platforms and a faded word `a1-timetable`

*Otto is standing in front of the board. He knows every time. Only one word is gone.*

> **OTTO:** Good morning. It is ten to eight.
> **OTTO:** The train is on time. I do not like that!
> **OTTO:** You have my key. Very good. *(if flag platform-protected)*
> **OTTO:** Voss has your ticket. I know the times. *(if flag platform-reported)*
> **OTTO:** Six platforms, six times. I know them all.
> **OTTO:** Platform one: eight o’clock. Platform two: half past eight.
> **OTTO:** Platform seven is on here too. Six p.m.
> **OTTO:** A word is written there. Only the W is left.

*The player can examine:* **lindenhafen-noticeboard** — Platform 1: eight o’clock. Platform 7: to W… — 6 p.m.

*Optional questions:* “When does the train come to platform seven?” · “What is the town with W called?”

> **OTTO:** You are looking at the board a long time. You want to travel?

**GATE — PLAYER:** *„Wann fährt der Zug?“* (Ask Otto when the train leaves.)

> **OTTO:** At ten past eight. From platform three.
> **OTTO:** It arrives on time. That is not good.
> **OTTO:** I have known the town for twenty years.
> **OTTO:** But I cannot say its name.
> **OTTO:** It is gone. That is not good.
> **OTTO:** Should the lantern be on today, or off?

**[CHOICE `light`]** *„Ja, mach sie bitte an.“* — Yes, please light it.
> **OTTO:** Good. At six o’clock I will light it.
> **OTTO:** Maybe a train will come after all.

**[CHOICE `dark`]** *„Nein, sie bleibt aus.“* — No, it stays off.
> **OTTO:** Good. Today it stays off.
> **OTTO:** But at six o’clock I will stand here.

> **OTTO:** I will read the board again.
> **OTTO:** Wait. Who is the woman there at the board?

---

### 3. LINDENHAFEN · STATION BOARD — Rule four `a1-notice`

*A woman from the Brass Office comes to the station. She brings a notice for Otto’s board. There is a rule on the notice.*

> **FRAU KESSLER:** Good morning. Kessler, from the Brass Office.
> **FRAU KESSLER:** Here is a rule. From Voss.
> **OTTO:** A rule? I have my timetable. It is good.
> **FRAU KESSLER:** Otto, you said a W. Out loud.
> **FRAU KESSLER:** Rule four: do not say names out loud. Here, the notice.
> **OTTO:** And my lantern? Is it too loud as well? *(if flag lantern-lit)*
> **OTTO:** My lantern is out. Is that order now? *(if flag lantern-dark)*
> **FRAU KESSLER:** Your ticket is with Voss. Very good. *(if flag platform-reported)*
> **FRAU KESSLER:** And Otto has your ticket. I am writing that down. *(if flag platform-protected)*
> **OTTO:** Order is order. But this is not order.

*The player can examine:* **lindenhafen-noticeboard** — A new notice: Rule four. Do not say names out loud. Brass Office.

*Optional questions:* “Who is Frau Kessler?” · “Why do you say names out loud?”

> **FRAU KESSLER:** Now you say no names either. Yes?

**GATE — PLAYER:** *„Warum darf ich das nicht?“* (Ask Frau Kessler why you are not allowed to.)

> **FRAU KESSLER:** Names are loud. Loud is not in order.
> **FRAU KESSLER:** Quiet is good. Quiet is order. Good day.
> **OTTO:** Here we say names out loud. Always.
> **OTTO:** Here names fade. Said aloud, they stay.
> **OTTO:** The notice is on my board.
> **OTTO:** Will you take it down? Or shall we read it out loud?

**[CHOICE `notice-torn`]** *„Ich nehme den Zettel weg.“* — I will take the notice down.
> **OTTO:** Good. That is my board again.
> **FRAU KESSLER:** I see that, Otto. I am writing that down.

**[CHOICE `notice-read`]** *„Wir lesen ihn laut. Für alle.“* — We read it out loud. For everyone.
> **OTTO:** Rule four! Do not say names out loud!
> **OTTO:** See? Now everyone knows the rule.

> **OTTO:** A W, a notice, a rule. And now?
> **OTTO:** You are hungry. Go to Marta at the café.

---

### 4. LINDENHAFEN · MARTA’S CAFÉ — A coffee already paid for `a1-cafe`

*Marta runs a café. Your coffee is already paid for. Who paid?*

> **MARTA:** Hello! I am Marta. Welcome to the café!
> **MARTA:** You have Otto’s key? He never lends it to me! *(if flag platform-protected)*
> **MARTA:** Voss has your ticket? He has everything. *(if flag platform-reported)*
> **MARTA:** There is a note here. For a guest.
> **MARTA:** One coffee for {name}. Paid. E.
> **MARTA:** You are {name}? Then this is for you.
> **MARTA:** A woman paid for you yesterday.
> **MARTA:** Her name? I cannot remember it.
> **MARTA:** And I ask every guest their name!

*The player can examine:* **lindenhafen-cafe-receipt** — One coffee for {name}. Paid. — E.

*Optional questions:* “What was the woman like?” · “How much is a coffee?”

> **MARTA:** So. Your coffee is already paid for.
> **MARTA:** What would you like?

**GATE — PLAYER:** *„Ich möchte einen Kaffee.“* (Order a coffee from Marta.)

> **MARTA:** One coffee. Coming right up!
> **MARTA:** The woman sat over there, alone.
> **MARTA:** She was very tired. Her hands were black with ink.
> **MARTA:** She did not drink her tea.
> **MARTA:** Here is your receipt. Wait… a stamp?
> **MARTA:** That is the Brass Office stamp.
> **MARTA:** She paid with an old voucher.
> **MARTA:** They have not made those for years.
> **MARTA:** Voss already has your ticket. And now this? *(if flag platform-reported)*
> **MARTA:** Does Voss get the receipt, or do you take it?

**[CHOICE `report`]** *„Voss soll die Rechnung sehen.“* — Voss should see the receipt.
> **MARTA:** All right. I will write you a second receipt.
> **MARTA:** Voss loves reading. Receipts, forms, everything.

**[CHOICE `protect`]** *„Ich nehme die Rechnung mit.“* — I will take the receipt with me.
> **MARTA:** Good. Voss does not need to know everything.
> **MARTA:** I do. I always want to know everything!

> **MARTA:** You are staying, right? You need a room.

---

### 5. LINDENHAFEN · MARTA’S GUEST ROOMS — Two rooms upstairs `a1-room`

*Marta has rooms above the café. You need a bed. A woman was in one of the rooms.*

> **MARTA:** Another coffee? You look tired.
> **MARTA:** Where are you from? Where are you going? How long?
> **MARTA:** Sorry. I ask a lot. I like to know everything.
> **MARTA:** The receipt is with Voss? Then I will not see it. *(if flag receipt-filed)*
> **MARTA:** You still have the receipt? Good. *(if flag receipt-kept)*
> **MARTA:** Otto has the lantern lit? I can see it from here. *(if flag lantern-lit)*
> **MARTA:** There are five rooms upstairs. Four are free.
> **MARTA:** You have a bag, but no bed for today.

*The player can examine:* **lindenhafen-cafe-receipt** — Guest book: Room 3 — E, then a small L. Room 5 — free.

*Optional questions:* “How long was the woman here?” · “Where is the bathroom?”

> **MARTA:** My house is small, but there is room upstairs. And you?

**GATE — PLAYER:** *„Hast du ein Zimmer frei?“* (Ask Marta if she has a room free.)

> **MARTA:** Yes! A room costs forty euros.
> **MARTA:** Room three has a bed and a table.
> **MARTA:** A week ago a woman was there.
> **MARTA:** In the guest book it only says: E. No name.
> **MARTA:** Her hands were black. So is the table.
> **MARTA:** The tea is still there. She is not drinking it.
> **MARTA:** Will you take room three, or the quiet room five?

**[CHOICE `room-three`]** *„Ich nehme Zimmer drei.“* — I will take room three.
> **MARTA:** All right. Here is the key.
> **MARTA:** The tea stays. It is for her.

**[CHOICE `room-five`]** *„Ich nehme Zimmer fünf.“* — I will take room five.
> **MARTA:** All right. The room is quiet.
> **MARTA:** Room three stays for her.

> **MARTA:** Breakfast is at eight o’clock.
> **MARTA:** Fritz has bread for us. Go to him.

---

### 6. LINDENHAFEN · LANTERN MARKET — Bread for Friday `a1-shopping`

*Fritz is buying bread for the soup. All the guests have a name. One place has none.*

> **FRITZ:** Hello! The water here costs nothing.
> **FRITZ:** The bread, though, costs money.
> **FRITZ:** Marta says you have room three. Good! *(if flag room-three)*
> **FRITZ:** Marta says you have room five. Quiet, right? *(if flag room-five)*
> **FRITZ:** On Friday I cook soup for everyone.
> **FRITZ:** Here are the names: Otto, Marta, Lina, Emil, Greta.
> **FRITZ:** Then comes a place. There is no name there.
> **FRITZ:** A guest always sat here. But who?

*The player can examine:* **lindenhafen-market-crate** — Names for Friday: Otto, Marta, Lina, Emil, Greta, …

*Optional questions:* “What are you cooking on Friday?” · “Who sat there?”

> **FRITZ:** I have bread, milk, eggs and fish.

**GATE — PLAYER:** *„Was kostet das Brot?“* (Ask Fritz what the bread costs.)

> **FRITZ:** Three euros. For you two fifty.
> **FRITZ:** The milk costs one euro, the fish six.
> **FRITZ:** I write down every name. Every one!
> **FRITZ:** There is no name here. I do not like that.
> **FRITZ:** I am buying bread for six. Or seven?
> **FRITZ:** Will you buy one loaf or two?

**[CHOICE `extra-bread`]** *„Zwei, bitte. Eins ist für den freien Platz.“* — Two, please. One is for the free place.
> **FRITZ:** Good. Two loaves. That makes five euros.
> **FRITZ:** A loaf for the guest. He is hungry.

**[CHOICE `own-bread`]** *„Nur eins, bitte. Für mich.“* — Just one, please. For me.
> **FRITZ:** Good. One loaf. That makes two fifty.
> **FRITZ:** The place stays free. I will wait.

> **FRITZ:** Thanks! I need a lot before Friday.
> **FRITZ:** I still have to buy more. Come back to me soon.

---

### 7. LINDENHAFEN · MARKET — The empty place `a1-market`

*It is Friday. Fritz is cooking soup for everyone. One seat at the table is empty.*

> **FRITZ:** There you are! It is Friday. Soup!
> **FRITZ:** On Fridays everyone eats here together.
> **FRITZ:** Your bread for the empty seat is here. Thank you. *(if flag bread-for-empty-seat)*
> **FRITZ:** Only one loaf, for you? Fine, I have plenty. *(if flag bread-own)*
> **VOSS:** Good afternoon. I have your receipt. And your name. *(if flag receipt-filed)*
> **FRITZ:** Here are my guests. One seat is empty.
> **FRITZ:** A woman sits there every Friday. But who?
> **FRITZ:** I know every guest. Every one! Except her.
> **FRITZ:** Here is an order slip of hers.
> **FRITZ:** Apples. Garden Street seven. No name.
> **FRITZ:** And how many? The number has faded.

*The player can examine:* **lindenhafen-market-crate** — An order slip: … apples. Garden Street 7. No name.

*Optional questions:* “Who eats soup on Friday?” · “What is in the soup?”

> **FRITZ:** Come on, you are cooking with me. Here are apples.
> **FRITZ:** For the soup. How many do you need?

**GATE — PLAYER:** *„Ich brauche zwei Äpfel.“* (Tell Fritz how many apples you need.)

> **FRITZ:** Two apples. Two apples… wait!
> **FRITZ:** Two apples every Friday. Always two!
> **FRITZ:** Now I remember. Frau Berg!
> **FRITZ:** This whole town learned to read with her.
> **FRITZ:** Me too. Very slowly.
> **FRITZ:** Her seat has been empty for a week.
> **FRITZ:** A week! And I did not say a word.
> **FRITZ:** Does Voss get her address, or do we write her name down?

**[CHOICE `report`]** *„Voss soll ihre Adresse in sein Buch schreiben.“* — Voss should put her address in his ledger.
> **FRITZ:** All right. Then she is in Voss’s ledger.
> **FRITZ:** But here at the table her seat is still empty.

**[CHOICE `protect`]** *„Ich schreibe ihren Namen auf. Für Freitag.“* — I will write her name down. For Friday.
> **FRITZ:** Frau Berg. There. Now she is written down again.
> **FRITZ:** Take her address with you. Garden Street seven.

> **FRITZ:** Lina’s brother Pip writes down every name. By the water.

---

### 8. LINDENHAFEN · CANAL WALL — The chalk game `a1-chalk`

*By the water a child writes names on a wall. The child is called Pip. He is Lina’s brother. Two names on the wall are fading.*

> **LINA:** Hello! Slowly, please. Pip is writing here.
> **LINA:** This is my brother. He is twelve.
> **PIP:** I write names. With chalk. On the wall.
> **PIP:** Otto. Marta. Fritz. Lina. They all stay here.
> **PIP:** And Frau Berg! Fritz said her name. Out loud! *(if flag berg-remembered)*
> **LINA:** Otto’s notice is gone? Very good. *(if flag notice-torn)*
> **LINA:** You read the rule out loud? Good. *(if flag notice-read)*
> **LINA:** His name is Pip. He likes saying it.

*The player can examine:* **lindenhafen-chalk-wall** — On the wall: Otto, Marta, Lina, Pip. At the bottom: Mother, Father.

*Optional questions:* “Where is your family?” · “How do you play it?”

> **PIP:** I do not know you. And you do not know me.

**GATE — PLAYER:** *„Wie heißt du?“* (Ask the boy his name.)

> **PIP:** My name is Pip! And now I am writing you.
> **PIP:** Here: {name}. Now you stay.
> **PIP:** But down here. Two names are fading.
> **PIP:** Mother. Father. I do not know their names.
> **LINA:** I have not said them for a long time. Now they are gone.
> **LINA:** The woman from the Brass Office writes everything down.
> **LINA:** Are you playing out loud? Or quietly?

**[CHOICE `pip-game-loud`]** *„Laut. Namen sind für alle.“* — Out loud. Names are for everyone.
> **PIP:** Pip! Lina! {name}! Otto! Marta!
> **LINA:** Now the town knows. The Brass Office too.

**[CHOICE `pip-game-quiet`]** *„Leise. Nur für uns.“* — Quietly. Just for us.
> **PIP:** Pip. Lina. {name}. Quietly.
> **LINA:** Good. Nobody sees the wall here.

> **PIP:** Do you know Frau Berg? Lina knows her.
> **LINA:** Marta knows her even better. Go to Marta.

---

### 9. LINDENHAFEN · FOUNTAIN SQUARE — The woman on the fountain bench `a1-neighbour`

*Marta is standing at the fountain. A woman sat here every morning. The bench is free.*

> **MARTA:** There you are. Fritz was here today.
> **MARTA:** He says: Frau Berg. She was my teacher!
> **MARTA:** You said her name. Thank you. *(if flag berg-remembered)*
> **MARTA:** She sat here at the fountain every morning.
> **MARTA:** For a week I have not known her name.
> **MARTA:** And I live on her street.
> **MARTA:** A woman from the Brass Office was here today.
> **MARTA:** She took my guest book. Rule four, she says.
> **MARTA:** Pip says names out loud. I can hear him from here. *(if flag pip-game-loud)*
> **MARTA:** You do not know Frau Berg, do you?

*The player can examine:* **lindenhafen-fountain** — The bench is free. No book, nobody.

*Optional questions:* “Where does Frau Berg live?” · “What was Frau Berg like at school?”

> **MARTA:** I will tell you about her. What do you want to know?

**GATE — PLAYER:** *„Wie ist Frau Berg?“* (Ask Marta what Frau Berg is like.)

> **MARTA:** She is old and very dear.
> **MARTA:** But strict! One mistake? Write it all again!
> **MARTA:** Every letter of mine has mistakes. She sees everything!
> **MARTA:** Half of Lindenhafen learned to read with her.
> **MARTA:** And for a week I have not known her name.
> **MARTA:** Say her name aloud, or write it on the board?

**[CHOICE `say-name`]** *„Ich sage ihren Namen laut. Frau Berg!“* — I will say her name aloud. Frau Berg!
> **MARTA:** Frau Berg. Yes. Now I can hear her.
> **MARTA:** The word stays. I will say it again.

**[CHOICE `write-name`]** *„Ich schreibe ihren Namen auf die Tafel.“* — I will write her name on the board.
> **MARTA:** Good. I will read it aloud every day.
> **MARTA:** Frau Berg. No mistakes. She will like that.

> **MARTA:** Greta has tea for her.
> **MARTA:** Please go to Greta. She has the tea.

---

### 10. LINDENHAFEN · GRETA’S PHARMACY — Tea for a cough `a1-pharmacy`

*Greta has a pharmacy. A bag of tea has been waiting for a week.*

> **GRETA:** Good day! This is my pharmacy.
> **GRETA:** The tea is from my garden.
> **GRETA:** A bag for Frau Berg is lying here.
> **GRETA:** I cannot see the name well any more.
> **GRETA:** You said her name at the fountain. Good. *(if flag berg-name-said)*
> **GRETA:** Marta wrote her name down. Good. *(if flag berg-name-written)*
> **GRETA:** Another bag. For A. K. Who is that?
> **GRETA:** She has not come for a week.

*The player can examine:* **lindenhafen-garden** — Two bags: Frau Berg and A. K. Both names are fading.

*Optional questions:* “How often do I take the tea?” · “Who is Frau Berg?”

> **GRETA:** You look tired. What is wrong?

**GATE — PLAYER:** *„Ich habe Kopfschmerzen.“* (Tell Greta what is wrong: you have a headache.)

> **GRETA:** A headache? That is not good.
> **GRETA:** Drink lots of water. Not only coffee!
> **GRETA:** Otto says: I am never ill. He comes every week.
> **GRETA:** The tea in the bag is for Frau Berg.
> **GRETA:** She is ill. She drinks it every day.
> **GRETA:** A week without tea. I did not ask.
> **GRETA:** Will you take the bag yourself, or will Lina take it?

**[CHOICE `take-bag`]** *„Ich bringe den Beutel zu ihr.“* — I will take the bag to her.
> **GRETA:** Good. Here you are. Morning and evening.
> **GRETA:** Say her name aloud. Then it stays.

**[CHOICE `ask-lina`]** *„Lina soll den Beutel bringen.“* — Lina should bring the bag.
> **GRETA:** Good. Lina is fast. She knows every house.
> **GRETA:** I will write the name again.

> **GRETA:** You will find Lina at the post office. She knows every street.

---

### 11. LINDENHAFEN · GARTENSTRASSE — The way to number seven `a1-directions`

*Lina delivers letters to Gartenstraße. Number seven has no name.*

> **LINA:** One moment! I still have letters to deliver.
> **LINA:** Every letter must arrive. Every one!
> **LINA:** You have tea from Greta? It is for number seven. *(if flag berg-bag-taken)*
> **LINA:** Greta gave me tea. For number seven. *(if flag berg-bag-lina)*
> **LINA:** On my letter there is a house, no name.

*The player can examine:* **lindenhafen-berg-house** — A door without a name. A note: Back soon.

*Optional questions:* “Where is the letter going?” · “Where is the post office?” · “How do I get to the station?”

> **LINA:** You are new here. Where do you want to go?

**GATE — PLAYER:** *„Wo ist die Gartenstraße?“* (Ask Lina where Gartenstraße is.)

> **LINA:** Gartenstraße? That is easy.
> **LINA:** Go straight ahead to the fountain.
> **LINA:** Left there. The fountain is by the school.
> **LINA:** Here is number seven, opposite the school.
> **LINA:** There is no name on the house any more.
> **LINA:** Paper says: Back soon. A week old.
> **LINA:** A week of back soon? That is not punctual.
> **LINA:** Will you say her name aloud, or write it down?

**[CHOICE `knock`]** *„Ich sage laut: Frau Berg!“* — I will say aloud: Frau Berg!
> **LINA:** Frau Berg! Frau Berg! Nobody answers.
> **LINA:** But the street has heard the name.

**[CHOICE `leave-note`]** *„Ich schreibe ihren Namen auf Papier.“* — I will write her name on paper.
> **LINA:** Good. Here is paper for you.
> **LINA:** Frau Berg, we are waiting. That is good.

> **LINA:** An old woman is sitting by the fountain. She is reading.
> **LINA:** I have to go. Go to her.

---

### 12. LINDENHAFEN · FOUNTAIN SQUARE — A teacher without a name `a1-bench`

*An old woman sits by the fountain. She is reading a book. She does not know her name. Who still knows her?*

> **FRAU BERG:** Good day. Excuse me, is this my bench?
> **FRAU BERG:** I sit here every morning. I think.
> **FRAU BERG:** I am reading a book. But I do not understand it.
> **FRAU BERG:** I am waiting. For whom? I do not know.
> **FRAU BERG:** You have tea for me? How lovely. But from whom? *(if flag berg-bag-taken)*
> **FRAU BERG:** A note on my house? We are waiting. Who is waiting? *(if flag berg-note-left)*
> **FRAU BERG:** A comma is missing here. I see that at once.

*The player can examine:* **lindenhafen-fountain** — A book on the bench: For my pupils. No name.

*Optional questions:* “What are you reading?” · “Where do you live?”

> **FRAU BERG:** And you? Perhaps you know me?

**GATE — PLAYER:** *„Wie heißen Sie?“* (Ask the old woman her name politely.)

> **FRAU BERG:** My name is … my name is …
> **FRAU BERG:** The word is gone. My name is gone.
> **PIP:** Wait! I will get Marta and Fritz!
> **MARTA:** Frau Berg! It is you!
> **FRITZ:** Frau Berg. Two apples, every Friday.
> **PIP:** Frau Berg! Frau Berg! I am writing it on the wall!
> **FRAU BERG:** Berg. Yes. I am Frau Berg.
> **FRAU BERG:** And you are Marta. Your letters always had mistakes.
> **MARTA:** Her sign has no name. Her house does not know her.
> **MARTA:** Will she come with us to the café? Or does she stay here?

**[CHOICE `berg-at-marta`]** *„Sie kommt mit ins Café.“* — She comes with us to the café.
> **MARTA:** Come, Frau Berg. A tea, a bed, a name.
> **FRAU BERG:** Thank you, Marta. But please, no mistakes.

**[CHOICE `berg-on-bench`]** *„Sie bleibt an ihrer Bank.“* — She stays at her bench.
> **FRAU BERG:** Here I read. Here my pupils find me.
> **FRITZ:** Then I will bring soup every morning. And two apples.

> **FRAU BERG:** And you? What is your name?
> **FRAU BERG:** {name}. A good name. Say it often.
> **MARTA:** Otto is at the station. Go to him quickly.

**CINEMATIC — REMEMBERED**
> BERG: Berg. Ja. Ich bin Frau Berg.
> PIP: Frau Berg! Ich schreibe es an die Wand.

---

### 13. LINDENHAFEN · RAILWAY STATION — A voice on the bench `a1-station`

*It is evening. Voss is sitting on the bench at the station. He is sitting alone.*

> **OTTO:** Good evening. No more trains today.
> **OTTO:** The lantern is lit. Can you see it? *(if flag lantern-lit)*
> **OTTO:** The lantern is dark. That is not right. *(if flag lantern-dark)*
> **OTTO:** Lina says you went to Frau Berg’s house. *(if flag berg-door-knocked)*
> **OTTO:** Lina says you left Frau Berg a note. *(if flag berg-note-left)*
> **OTTO:** Frau Berg is back? That is good. Very good. *(if flag scene a1-bench)*
> **OTTO:** The W is still on the board.
> **OTTO:** See the bench? That is Voss.
> **OTTO:** He comes every evening. He never travels.
> **OTTO:** He has a little machine. He listens to it.
> **OTTO:** He always sits on the left. His coat takes the right.

*The player can examine:* **lindenhafen-bench** — The bench at the station. Voss sits here every evening. · **lindenhafen-noticeboard** — Platform 7: To W… 6 pm. No train.

*Optional questions:* “Who is the man?” · “What is Voss listening to?”

> **OTTO:** There is only one bench. Come on.
> **VOSS:** Good evening.

**GATE — PLAYER:** *„Ist dieser Platz frei?“* (Ask the man on the bench if the seat is free.)

> **VOSS:** Yes. Please. The coat has no ticket.
> **VOSS:** One moment, please. She is speaking now.
> **OTTO:** A woman. She speaks very quietly.
> **VOSS:** Is anyone there? I am still here.
> **VOSS:** I hear her every evening. She cannot hear me.
> **VOSS:** Who is she? She is not in my ledger.
> **VOSS:** Your ticket is in my office. Your name has gone from it. *(if flag platform-reported)*
> **VOSS:** Frau Berg is in my ledger now. Rules are rules. *(if flag crate-number-filed)*
> **OTTO:** That is my old office. Shut for twelve years.
> **OTTO:** Does Voss write down the W, or do we open the office?

**[CHOICE `report`]** *„Herr Voss, schreiben Sie das W auf.“* — Mr Voss, write down the W.
> **VOSS:** Platform seven, to W. I am writing it down.
> **OTTO:** The W is in the ledger now. My office stays shut.

**[CHOICE `protect`]** *„Ich öffne das Büro mit Ottos Schlüssel.“* — I will open the office with Otto’s key. *(if holding lamplighter-key)*
> **OTTO:** Another key? Of course. I always have two. *(if not archive-witnessed, without lamplighter-key)*
> **VOSS:** I will come with you. Rules are rules. *(if flag archive-witnessed)*
> **OTTO:** The office is open. Everything is still there.
> **OTTO:** My old register. And here: tickets.
> **OTTO:** A hundred tickets for platform seven. Every one says E.
> **OTTO:** And I never sold them. Never.

**[CHOICE `show-ledger`]** *„Herr Voss, hier ist Ihr Buch. Kommen Sie mit?“* — Mr Voss, here is your ledger. Will you come with me? *(if holding inspector-ledger)*
> **OTTO:** Another key? Of course. I always have two. *(if not archive-witnessed, without lamplighter-key)*
> **VOSS:** I will come with you. Rules are rules. *(if flag archive-witnessed)*
> **OTTO:** The office is open. Everything is still there.
> **OTTO:** My old register. And here: tickets.
> **OTTO:** A hundred tickets for platform seven. Every one says E.
> **OTTO:** And I never sold them. Never.

**[CHOICE `ask-otto`]** *„Otto, hast du noch einen Schlüssel?“* — Otto, do you have another key? *(if not platform-reported, without lamplighter-key)*
> **OTTO:** Another key? Of course. I always have two. *(if not archive-witnessed, without lamplighter-key)*
> **VOSS:** I will come with you. Rules are rules. *(if flag archive-witnessed)*
> **OTTO:** The office is open. Everything is still there.
> **OTTO:** My old register. And here: tickets.
> **OTTO:** A hundred tickets for platform seven. Every one says E.
> **OTTO:** And I never sold them. Never.

> **OTTO:** It is late. I will be here again in the morning.

**CINEMATIC — RECORDING**
> STIMME: Ist da jemand? Ich bin noch hier.
> INSPECTOR: Ich höre sie jeden Abend. Sie hört mich nicht.

---

### 14. LINDENHAFEN · STATION — Rain on platform seven `a1-weather`

*It is raining at the station. The old lantern from platform seven is gone.*

> **OTTO:** Good morning. It is raining. The rain is punctual.
> **OTTO:** I do not like that. Too punctual.
> **OTTO:** The lantern of platform seven is gone.
> **OTTO:** Emil has it. He is repairing it.
> **OTTO:** Frau Kessler comes every morning now. With a notice. *(if flag platform-protected)*
> **FRAU KESSLER:** The lantern is gone? Very good. Quiet is good. *(if flag platform-protected)*
> **OTTO:** Last night it was still bright. *(if flag lantern-lit)*
> **OTTO:** Last night it was not bright. Today it is gone. *(if flag lantern-dark)*

*The player can examine:* **lindenhafen-platform-ticket** — Platform seven. The old lantern is missing.

*Optional questions:* “What was the weather like yesterday?” · “When does the sun come?” · “Where is the lantern?”

> **OTTO:** It is raining today. You want to leave tomorrow.

**GATE — PLAYER:** *„Wie ist das Wetter morgen?“* (Ask Otto what the weather is like tomorrow.)

> **OTTO:** Tomorrow the sun comes. The wind goes away.
> **OTTO:** Today it is bad: rain and wind.
> **OTTO:** Voss was on the bench until late yesterday.
> **OTTO:** He comes every evening. For twelve years.
> **OTTO:** No train runs on platform seven any more.
> **OTTO:** I said: Take an umbrella.
> **OTTO:** He said: Rain is not in the plan.
> **OTTO:** His umbrella is still on the bench.
> **OTTO:** Will you bring Voss the umbrella, or will it stay there?

**[CHOICE `return-umbrella`]** *„Ich bringe ihm den Schirm.“* — I will bring him the umbrella.
> **OTTO:** Good. He is sitting on the bench again.
> **OTTO:** He will not say thank you. But I will see it.

**[CHOICE `leave-umbrella`]** *„Der Schirm bleibt auf der Bank.“* — The umbrella stays on the bench.
> **OTTO:** Good. The umbrella stays on the bench.
> **OTTO:** He will see it this evening. He always comes.

> **OTTO:** Go to Emil now. He has the lantern.

---

### 15. LINDENHAFEN · EMIL’S WORKSHOP — The lamp from platform seven `a1-workshop`

*Emil repairs everything. He has made a lamp out of the old lantern. It does not work properly.*

> **EMIL:** Hello! Careful, there is glass here. And there. And there!
> **EMIL:** I am Emil. I repair everything. Mostly.
> **EMIL:** Otto’s old register? A hundred tickets signed E? That is a lot! *(if holding station-register)*
> **EMIL:** Voss was here today. He even writes down my coffee. *(if flag station-sign-filed)*
> **EMIL:** Otto sent you? The lantern is here.
> **EMIL:** I made a lamp. Out of the old lantern.
> **EMIL:** New glass, new light. But it does not work properly.
> **EMIL:** Here at the bench it is bright. Over there it goes out.
> **EMIL:** Is it broken? I do not know.

*The player can examine:* **lindenhafen-workbench** — Glass, paper, coffee. And a lamp made from the old lantern.

*Optional questions:* “Where does the lantern come from?” · “How does the lamp work?”

> **EMIL:** Come here. Look! Next to you it is bright.
> **EMIL:** Everybody needs me. And you? What do you need?

**GATE — PLAYER:** *„Ich brauche eine Lampe.“* (Tell Emil you need a lamp.)

> **EMIL:** A lamp? Good. It works for you.
> **EMIL:** Next to your ticket it is very bright. *(if not platform-reported)*
> **EMIL:** It is bright next to you. Next to your name, I think. *(if flag platform-reported)*
> **EMIL:** Your receipt from Marta! It is bright there too. *(if holding original-receipt)*
> **EMIL:** Yesterday I was on Garden Street. It went out there.
> **EMIL:** Look, to the left, towards the post office: on, off, on, off.
> **EMIL:** A name is fading over there. Or an address.
> **EMIL:** My clock mostly works. The lamp? Not like that.
> **EMIL:** Does Voss write the lamp down, or do you take it with you?

**[CHOICE `report`]** *„Voss soll die Lampe in sein Buch schreiben.“* — Voss should put the lamp in his ledger.
> **EMIL:** All right. Voss gives it a number. Lamp number one.
> **EMIL:** Then you get it. With a stamp, of course.

**[CHOICE `protect`]** *„Ich nehme die Lampe mit.“* — I will take the lamp with me.
> **EMIL:** Good. Take it. It works for you.
> **EMIL:** And bring it back. Otto wants his lantern back!

> **EMIL:** Wait! Lina’s bike is here too.

---

### 16. LINDENHAFEN · EMIL’S WORKSHOP — A bike that mostly works `a1-bike`

*Emil is repairing Lina’s bike. You are collecting it for Lina.*

> **EMIL:** Hello! I find everything. Just not right away.
> **EMIL:** The bike is Lina’s. It was broken.
> **EMIL:** You have my light? Good. *(if flag lamp-carried)*
> **EMIL:** Voss wrote my light in his book. *(if flag lamp-registered)*
> **EMIL:** I am almost done. Soon!

*The player can examine:* **lindenhafen-workbench** — Emil’s book: glass for a lantern. Signed: E.

*Optional questions:* “Where is Lina’s bike?” · “How much does it cost?” · “Who was the woman?”

> **EMIL:** You are collecting Lina’s bike? It is not ready yet.

**GATE — PLAYER:** *„Wann ist das Fahrrad fertig?“* (Ask Emil when Lina’s bike will be ready.)

> **EMIL:** This afternoon. The bike mostly works.
> **EMIL:** The repair costs twenty euros.
> **EMIL:** Here is my book. Everything is written here.
> **EMIL:** A week ago a woman bought glass.
> **EMIL:** It was for an old lantern. She paid cash.
> **EMIL:** Signature: E. Her hands were black.
> **EMIL:** I know her. But her name is gone.
> **EMIL:** Will you pay for the bike now, or shall I write it down?

**[CHOICE `pay-now`]** *„Ich bezahle jetzt.“* — I will pay now.
> **EMIL:** Thanks! Twenty euros. That is quick.
> **EMIL:** Lina gets a finished bike today.

**[CHOICE `pay-later`]** *„Bitte schreib es ins Buch.“* — Please write it in the book.
> **EMIL:** No problem. I will write it in the book.
> **EMIL:** Lina pays on Friday. Then it is there.

> **EMIL:** Marta has a phone call for you. Go to the café.

---

### 17. LINDENHAFEN · MARTA’S CAFÉ — A call to the station `a1-phone`

*Otto has called the café. You speak to the station.*

> **MARTA:** The telephone! Otto has called.
> **MARTA:** You have to call him. It is important.
> **MARTA:** The station number: three, four, seven.
> **MARTA:** I am not listening. Only a little.
> **MARTA:** Here, take the telephone. It is for you.

*The player can examine:* **lindenhafen-cafe-receipt** — The telephone. Beside it lie receipts and letters.

*Optional questions:* “Where is Otto now?” · “What is in your register?”

> **MARTA:** It takes a moment. Then a man answers.
> **VOSS:** Lindenhafen station, Voss. Whom would you like to speak to?

**GATE — PLAYER:** *„Kann ich bitte Otto sprechen?“* (Ask on the phone to speak to Otto.)

> **VOSS:** Mr Otto is at platform seven. He is coming soon.
> **VOSS:** I have the receipt from the café. Thank you. *(if flag receipt-filed)*
> **VOSS:** You took the receipt with you. Fine. *(if flag receipt-kept)*
> **VOSS:** I spell: V, O, S, S. Understood?
> **MARTA:** Everyone here knows that, Mr Voss!
> **VOSS:** I have the register in front of me. Gartenstraße seven.
> **VOSS:** There is no name there. That is not normal.
> **VOSS:** One moment. A name was written here. Now it is gone.
> **VOSS:** That is not my hand. Who did that?
> **VOSS:** Your name is not in the register either.
> **VOSS:** Do you want to spell your name now?

**[CHOICE `spell`]** *„Ja, Herr Voss. Ich buchstabiere meinen Namen.“* — Yes, Mr Voss. I will spell my name.
> **VOSS:** Thank you. Slowly, please. I am writing it down.
> **MARTA:** Now your name is in the register.

**[CHOICE `refuse`]** *„Nein, danke, Herr Voss. Der Name bleibt bei mir.“* — No, thank you, Mr Voss. The name stays with me.
> **VOSS:** As you wish. The register will wait.
> **MARTA:** Your name stays with you. That is good.

> **MARTA:** The telephone is quiet again.
> **MARTA:** Go to the Brass Office. It is by the station.

---

### 18. LINDENHAFEN · BRASS OFFICE DEPOT — The Office window `a1-office-window`

*A name is gone from the register. Who makes names disappear? The answer is in the Brass Office.*

> **FRAU KESSLER:** The office is closed. Please leave.
> **VOSS:** One moment, Frau Kessler. The guest has my ledger. *(if flag platform-reported)*
> **VOSS:** My ledger may be read. That is order. *(if flag platform-reported)*
> **OTTO:** There is another entrance at the back. I have the key. *(if flag platform-protected)*
> **FRAU KESSLER:** Mr Otto! You may not do that! *(if flag platform-protected)*
> **FRAU KESSLER:** Here is the register. Everything is in order.
> **FRAU KESSLER:** A name too loud? I make it quiet.

*The player can examine:* **lindenhafen-office-window** — 7 Gartenstraße: no name. Beside it: Rule four. Written as on the notice.

*Optional questions:* “Why should names be quiet?” · “How long have you worked here?”

> **FRAU KESSLER:** What do you want? I have a lot of work.

**GATE — PLAYER:** *„Das haben Sie geschrieben.“* (Tell Frau Kessler that she wrote it.)

> **FRAU KESSLER:** Yes. I write everything. And I make names quiet.
> **FRAU KESSLER:** That is what rule four says.
> **FRAU KESSLER:** A child writes names on a wall. Loudly. *(if flag pip-game-loud)*
> **VOSS:** Frau Kessler, that is not in my plan. *(if flag platform-reported)*
> **FRAU KESSLER:** There is also a guest book here. Marta’s.
> **FRAU KESSLER:** And here is my list. Rule one to ten.
> **FRAU KESSLER:** You only get one. The guest book or the list?

**[CHOICE `guestbook-returned`]** *„Ich nehme Martas Gästebuch.“* — I will take Marta’s guest book.
> **FRAU KESSLER:** Here. But your name is now in my book.
> **OTTO:** Marta will be happy. Every guest is back in it.

**[CHOICE `notice-list-taken`]** *„Ich nehme die Liste.“* — I will take the list.
> **FRAU KESSLER:** The list is not for you! I am writing that down.
> **OTTO:** Good. Now everyone sees what quiet means.

> **FRAU KESSLER:** Mr Voss knows about this. All of it. Good day.
> **OTTO:** Fritz has a question for you. Go to him.

---

### 19. LINDENHAFEN · FRITZ’S STALL — A seat at Friday’s table `a1-invitation`

*Fritz cooks every Friday. Today he asks you: are you coming too?*

> **FRITZ:** There you are! I am cooking on Friday.
> **FRITZ:** Every Friday at seven there is soup.
> **FRITZ:** Everyone comes: Otto, Marta, Lina and Greta.
> **FRITZ:** Unfortunately Emil is often late. His machines!
> **FRITZ:** I have twelve glasses. Eleven guests.
> **FRITZ:** One glass is too many. Always.

*The player can examine:* **lindenhafen-market-crate** — The table for Friday. One seat is free.

*Optional questions:* “Who is coming on Friday?” · “What should I bring?”

> **FRITZ:** You are new here. That is good.
> **FRITZ:** Will you come on Friday at seven?

**GATE — PLAYER:** *„Ja, ich komme gern.“* (Accept Fritz’s invitation.)

> **FRITZ:** Wonderful! Please bring bread.
> **FRITZ:** You already bought bread. Very good! *(if flag bread-for-empty-seat)*
> **FRITZ:** You have already said her name. Good. *(if flag berg-name-said)*
> **FRITZ:** With us, everyone says all the names aloud.
> **FRITZ:** That way the names stay at my table.
> **FRITZ:** Marta’s guest book is back. Every guest is in the book. *(if flag guestbook-returned)*
> **FRITZ:** There is a seat over there. It is free.
> **FRITZ:** That is Frau Berg’s seat.
> **FRITZ:** She never missed it. Until now. *(if not quest:a1-bench)*
> **FRITZ:** She is staying at her bench. I will take her soup. *(if flag berg-on-bench)*
> **FRITZ:** Today she is coming with Marta. At eight o’clock. *(if flag berg-at-marta)*
> **FRITZ:** Does the seat stay free, or will you sit there?

**[CHOICE `keep-chair`]** *„Der Platz bleibt frei. Ich schreibe ihren Namen.“* — The seat stays free. I will write her name.
> **FRITZ:** Good. A card with her name.
> **FRITZ:** That way her seat waits for her.

**[CHOICE `share-chair`]** *„Ich sitze dort und sage ihren Namen.“* — I will sit there and say her name.
> **FRITZ:** Frau Berg. Now her name is here again.
> **FRITZ:** You eat for two. I like that!

> **FRITZ:** See you Friday! Your bag is there too.
> **FRITZ:** Lina has it. Go to her at the post office.

---

### 20. LINDENHAFEN · LINA’S POST COUNTER — The lost-and-found table `a1-lost-found`

*Lina has eleven bags from the train. One bag is yours.*

> **LINA:** There you are! I write everything down.
> **LINA:** Number one: bag. Number two: glove.
> **LINA:** My bike is running again. Thanks! *(if flag bike-paid)*
> **LINA:** My bike is running again. Emil is writing it down. *(if flag bike-on-account)*
> **LINA:** A bag came off the train. It is lying here.
> **LINA:** Eleven bags are lying on the table.
> **LINA:** Five are green. Two are old. One is big.

*The player can examine:* **lindenhafen-parcel** — The table: eleven bags, a black glove and an old ticket.

*Optional questions:* “Where was my bag?” · “What does the glove look like?”

> **LINA:** With me everyone only gets their own bag.
> **LINA:** What colour is your bag?

**GATE — PLAYER:** *„Meine Tasche ist blau.“* (Tell Lina your bag is blue.)

> **LINA:** Blue and small? Here it is!
> **LINA:** Bag found. One of two. I am writing it down.
> **LINA:** And this here: a black glove.
> **LINA:** It was lying on the bench at platform seven.
> **LINA:** The glove is old, but the ink is new.
> **LINA:** There is a tag on the glove. The name is gone.
> **LINA:** And here: an old ticket. Platform seven.
> **LINA:** The name is still there: Lenz.
> **LINA:** Lenz. That is our name. Pip and I.
> **LINA:** Will you take the glove, or does it stay here?

**[CHOICE `take-glove`]** *„Ich nehme den Handschuh mit.“* — I will take the glove with me.
> **LINA:** Good. I will write: glove, taken.
> **LINA:** Whose it is? I do not know.

**[CHOICE `leave-glove`]** *„Er bleibt hier. Er gehört nicht mir.“* — It stays here. It does not belong to me.
> **LINA:** Good. I will put it on top of the table.
> **LINA:** Then everyone sees it at once.

> **LINA:** Your blue bag is with you again.
> **LINA:** Wait a moment. I am still looking for your post.

---

### 21. LINDENHAFEN · POST OFFICE — A letter without a door `a1-lost-parcel`

*Lina has a parcel for you. The sender is E. The address is fading.*

> **LINA:** There you are! I have a parcel for you.
> **LINA:** For {name}. Sender: E. Like on your ticket.
> **LINA:** Look at your lamp! By the parcel it is very bright. *(if flag lamp-carried)*
> **LINA:** Voss brought your lamp. With three forms. *(if flag lamp-registered)*
> **LINA:** Your hands are black. The same ink is here too. *(if flag glove-taken)*
> **LINA:** But the address… Look! The ink is fading.
> **LINA:** I read it. And it is gone again.
> **LINA:** This cannot happen. Every letter arrives. Every one!

*The player can examine:* **lindenhafen-parcel** — Parcel for {name}. Sender: E. Address: W… · **lindenhafen-berg-house** — Garden Street 7. No name. The number is fading.

*Optional questions:* “What is in the parcel?” · “Who is E.?”

> **LINA:** Here is the address. I can only see a W.
> **LINA:** Hold on. I will read it again. Slowly.

**GATE — PLAYER:** *„Wie ist die Adresse?“* (Ask Lina for the address on your parcel.)

> **LINA:** The address? W… A… L… D…
> **LINA:** You asked out loud. And now the ink is holding!
> **LINA:** Waldruh. It says Waldruh.
> **LINA:** W for Waldruh. Like on Otto’s timetable!
> **LINA:** There is a letter in the parcel. It is very short.
> **LINA:** “I am Elise. I am waiting in Waldruh.”
> **LINA:** Elise. E. is Elise.
> **LINA:** And here is another letter. For Frau… Frau… *(if not quest:a1-bench)*
> **LINA:** And here is another letter. For Frau Berg. *(if flag scene a1-bench)*
> **LINA:** Fritz says her name every Friday. Frau Berg! *(if flag berg-chair-kept)*
> **LINA:** Frau Berg. Garden Street seven. Yes.
> **LINA:** I was there today. Now even the seven on her plate is fading.
> **LINA:** She sits at her bench. But her house no longer knows her. *(if flag berg-on-bench)*
> **LINA:** She sleeps at Marta’s. But her house no longer knows her. *(if flag berg-at-marta)*
> **LINA:** The people on her street say: who lives there?
> **LINA:** Do I send Voss the address, or does the letter stay with you?

**[CHOICE `report`]** *„Voss bekommt die Adresse. Für sein Buch.“* — Voss gets the address. For his ledger.
> **LINA:** All right. I will take Voss the address. Today.
> **LINA:** Then Waldruh is in his ledger. In black and white.

**[CHOICE `protect`]** *„Der Brief bleibt bei mir. Nur bei mir.“* — The letter stays with me. Only with me.
> **LINA:** Fine. Your letter, your post. Voss gets nothing.
> **LINA:** I will not say a word. Only to my bike. It does not talk.

> **LINA:** Her name is still written down at Fritz’s. It is staying. *(if flag berg-remembered)*
> **LINA:** Go to Otto. A train is waiting this evening.
> **LINA:** There is one more sentence in the letter. Very small:
> **LINA:** Before you erase us again, come.

**CINEMATIC — ERASURE**
> LINA: Hier war ihr Schild. Da stand Frau Berg.
> LINA: Und jetzt geht auch die Sieben weg.

---

### 22. LINDENHAFEN · STATION — Platform seven, six o’clock `a1-departure`

*A train stands at platform seven. Otto sells the ticket.*

> **OTTO:** Eighteen hundred. To the minute.
> **OTTO:** A train is standing at platform seven.
> **OTTO:** Twelve years without a train. And now one is standing here.
> **OTTO:** The lantern is on. Like every morning. *(if flag lantern-lit)*
> **OTTO:** The lantern is off. But the train is here. *(if flag lantern-dark)*
> **OTTO:** You still have my key. Good. *(if flag platform-protected)*
> **VOSS:** The train is not in the plan, Otto.
> **FRAU KESSLER:** Mr Voss, the train is loud. Rule four!
> **VOSS:** Frau Kessler. Not today.
> **OTTO:** I know. It is too punctual. I do not believe in it.

*The player can examine:* **lindenhafen-noticeboard** — The sign: platforms one to six. And platform seven.

*Optional questions:* “When does the train leave?” · “How much does the ticket cost?”

> **OTTO:** I sell tickets. That is my job.
> **OTTO:** Where would you like to go?

**GATE — PLAYER:** *„Eine Fahrkarte nach Waldruh, bitte.“* (Buy a ticket to Waldruh.)

> **OTTO:** The word was gone. Now it is back.
> **OTTO:** I write it on the sign. Aloud: Waldruh.
> **OTTO:** Platform seven, six o’clock, to Waldruh.
> **VOSS:** That is not in the plan. I see nothing.
> **VOSS:** I am not writing anything down either. Safe journey.
> **OTTO:** This is my first ticket in twelve years.
> **OTTO:** Single, or return?

**[CHOICE `single`]** *„Einfach, bitte.“* — Single, please.
> **OTTO:** Single to Waldruh. Ten euros, please.
> **OTTO:** Here. Platform seven, carriage one.

**[CHOICE `return`]** *„Hin und zurück, bitte.“* — Return, please.
> **OTTO:** Return. Eighteen euros, please.
> **OTTO:** Then we will see each other again. Punctually!

> **OTTO:** All aboard, please! It is six o’clock.
> **OTTO:** The train is leaving. Elise is waiting in Waldruh.
> **PIP:** Bye, {name}! I will write you every day! Out loud! *(if flag pip-game-loud)*
> **PIP:** Bye, {name}. Quietly, but every day. *(if flag pip-game-quiet)*

---

# ACT TWO — WALDRUH
### "The door between two towns" (A2)

### 23. WALDRUH · THE WAYWARD INN — The room already waiting `a2-apartment`

*Another village lies behind Marta’s kitchen door. A room is waiting upstairs, but the door is stuck. Voss is inspecting the house missing from his file.*

> **MARTA:** Quick, {name}, come in! I am holding the door. Today it leads to Waldruh.
> **MARTA:** Five minutes ago my kitchen was behind it. The coffee is on the other side.
> **MARTA:** The café and the inn share one door. When it sticks, I cannot get into either.
> **VOSS:** Good afternoon. I am inspecting this building. Please hold the frame steady.
> **VOSS:** Thank you for the address from Lindenhafen. It led me straight here. *(if flag waldruh-address-public)*
> **MARTA:** He came through my kitchen. Without knocking. With three forms. *(if flag elise-letter-private)*
> **VOSS:** Frau Kessler says you have her list. We will talk about that later. *(if flag notice-list-taken)*
> **VOSS:** My file says Waldruh voluntarily stopped existing.
> **MARTA:** For a village that does not exist, we have very good potatoes.
> **VOSS:** This door is in no register. Without a request I may not repair it.
> **MARTA:** There is a lease on the board. With your name. I never even offered you a room.

*The player can examine:* **waldruh-housing-board** — Lease, Room 7. Tenant: {name}. Paid a year in advance by Elise. A key hangs from the paper.

*Optional questions:* “Why do the café and the inn share a door?” · “How long are you staying in Waldruh, Mr Voss?” · “What does the key open?”

> **VOSS:** The lease names you as the tenant. If you request it, I will begin.

**GATE — PLAYER:** *„Könnten Sie das bitte reparieren?“* (Ask Inspector Voss politely whether he could please repair it.)

> **VOSS:** Request accepted. First the stamp, then the screw.
> **MARTA:** It opens! And my coffee is still warm.
> **VOSS:** The rent is paid for a year. By Elise. Three months before your arrival.
> **VOSS:** A heavy key hangs from the lease. With a little lantern on the handle.
> **MARTA:** She left it here. For you. I do not know what it opens.
> **MARTA:** My grandmother lives upstairs. Seventy years in this house. Nobody ever asked her.
> **MARTA:** An open door lets anyone in. Do we leave it open, or ask the neighbours first?

**[CHOICE `restore`]** *„Wir lassen sie offen. Lindenhafen soll Waldruh sehen.“* — We leave it open. Lindenhafen should see Waldruh.
> **MARTA:** I will wedge a chair in the door.
> **LINA:** Post for Waldruh! Three letters, all from yesterday.

**[CHOICE `consult`]** *„Wir fragen zuerst die Nachbarn hier.“* — We ask the neighbours here first.
> **MARTA:** I will hang up a note: Please knock first.
> **FRITZ:** I heard knocking. Is there a meeting? I brought soup.

> **MARTA:** Go upstairs to Oma Hilde. She has been waiting a long time for a question.

---

### 24. WALDRUH · UPSTAIRS AT THE INN — Seventy years upstairs `a2-upstairs`

*Marta’s grandmother lives upstairs at the inn. She has lived in this house for seventy years. Nobody asked her when the route closed.*

> **OMA HILDE:** Sit down, child. Marta says you repaired her door.
> **OMA HILDE:** I am Hilde. To the whole street I am the grandmother.
> **OMA HILDE:** I have lived in this house for seventy years. I saw two towns through this window.
> **OMA HILDE:** The morning after the closure a man from the Office came. He had a paper.
> **OMA HILDE:** The paper said: voluntary. He asked me nothing. Nobody did.
> **OMA HILDE:** The door to Lindenhafen opens again? Then the house has two sides again. *(if flag scene a2-apartment)*
> **OMA HILDE:** Do you see my name on the window? In new ink. It is fading anyway.

*The player can examine:* **waldruh-hilde-window** — On the window frame, in blue ink: Hilde. The ink is new, but the name is fading anyway.

*Optional questions:* “What was the house like before?” · “Who was the man from the Office?”

> **OMA HILDE:** For twelve years nobody has asked me anything. People talk about me, not to me.

**GATE — PLAYER:** *„Darf ich Sie etwas fragen?“* (Ask Oma Hilde politely if you may ask her something.)

> **OMA HILDE:** Finally. Ask. Ask everything.
> **OMA HILDE:** That evening two people came from Lindenhafen. A man with a red boat and a nurse.
> **OMA HILDE:** They waited for their children. The children’s train came at six. It never came.
> **OMA HILDE:** They are still waiting today. Every evening they sit at Fritz’s table.
> **OMA HILDE:** A man at the market sold me this ink. He says it stays forever.
> **MARTA:** Oma, Fritz is setting the table for everyone today. The Circle is coming too.
> **MARTA:** Will she come to the table today? Or is the walk too far for her?

**[CHOICE `hilde-invited`]** *„Sie kommt mit. Wir fragen sie vor allen anderen.“* — She comes along. We ask her before anyone else.
> **OMA HILDE:** Then fetch my stick. And my best scarf.
> **MARTA:** Seventy years, and she is going to a meeting for the first time.

**[CHOICE `hilde-rests`]** *„Sie ruht sich aus. Ich erzähle ihr später alles.“* — She rests. I will tell her everything later.
> **OMA HILDE:** Good. But really come back. Everyone says that.
> **MARTA:** I will bring her soup. And every name I hear.

> **OMA HILDE:** There are old tickets in my box. With names from here. Take them.
> **MARTA:** Fritz is cooking down by the herb garden. Go while the soup is warm.

---

### 25. WALDRUH · AUTUMN MARKET — An empty chair at dinner `a2-evening-plans`

*Fritz is cooking for everyone in Waldruh. At the end of the table sit two guests nobody knows. Fritz never invites people for a fixed time.*

> **FRITZ:** Ah, {name}! Take a bowl. Nobody argues while eating. Usually.
> **FRITZ:** I came through Marta’s door yesterday. With the big pot.
> **GRETA:** Me too. The clinic here has had no doctor for twelve years. Now it has me.
> **LINA:** Tonight we send a light to Lindenhafen. So they see: Waldruh is still here.
> **GRETA:** And the people here? Nobody asked them before the closure. Again they will be the last to know.
> **OMA HILDE:** Someone is asking me today. That is new. I am staying until dessert. *(if flag hilde-invited)*
> **GRETA:** Frau Berg wrote to us. Her house is gone, but she still has her name. *(if flag berg-remembered)*
> **FRITZ:** Do you see the two at the end of the table? They come every evening at six.
> **FRITZ:** They are waiting for a train. Nobody here knows their names any more.
> **LINA:** I have to go on in a moment. My letters …

*The player can examine:* **waldruh-herb-garden** — A long table in the herb garden. At the end stand two plates that wait every evening.

*Optional questions:* “Who belongs to the Circle?” · “Why do the two of them wait every evening?” · “How did you get to Waldruh, Fritz?”

> **FRITZ:** Tomorrow I want to bring everyone to one table. But I never name a fixed time. Then someone is missing again.

**GATE — PLAYER:** *„Hast du morgen Zeit?“* (Ask Fritz whether he has time tomorrow.)

> **FRITZ:** Tomorrow? Yes. I have time for you. And for everyone else too.
> **FRITZ:** Half past six. Not six. At six those two wait for their train.
> **RUTH LENZ:** Excuse me. The girl with the letters … is that Lina?
> **LINA:** How do you know my name?
> **JAKOB LENZ:** We left our children in Lindenhafen. For one hour. Twelve years ago.
> **LINA:** My name is Lina Lenz. My brother is called Pip.
> **JAKOB LENZ:** Pip. He was a baby. I am Jakob Lenz. I am your father.
> **RUTH LENZ:** My name is Ruth. Say it, Lina. Please. Once, out loud.
> **LINA:** Ruth. Jakob. I stopped saying your names. It hurt too much.
> **GRETA:** I will write the names on the old stone. Then they stay.
> **FRITZ:** Lindenhafen is waiting for a sign.
> **FRITZ:** Do we send the light today? Or do we wait until everyone here has spoken?

**[CHOICE `restore`]** *„Wir senden das Licht heute Abend.“* — We send the light tonight.
> **LINA:** Lindenhafen is answering! Three short flashes. That is Pip, I know it.
> **JAKOB LENZ:** Pip at a lamp? Then he has grown up.

**[CHOICE `consult`]** *„Wir warten. Erst sagen alle hier, was sie wollen.“* — We wait. First everyone here says what they want.
> **GRETA:** People are coming out of the forest with chairs. Today nobody stays outside.
> **RUTH LENZ:** Then I will say something too: I want to go home. But not without the others.

> **FRITZ:** Tomorrow, half past six. With little bowls. For everyone.
> **FRITZ:** On the market square a man is selling ink. He says it never fades. Have a look at him.

---

### 26. WALDRUH · LANTERN SQUARE — Ink that never fades `a2-ink-seller`

*On the market square stands a cart full of ink. Herr Falk says: this ink never fades. But the names on his test sheet are already pale.*

> **HERR FALK:** Ink that never fades! Write your name, and it stays forever!
> **HERR FALK:** My name is Falk. Delighted. You look like someone who wants to keep their name.
> **HERR FALK:** Oma Hilde has already bought some. Fritz too. All of Waldruh writes with my ink.
> **HERR FALK:** Oma Hilde? Her name on the window is pale anyway? The light upstairs is poor. *(if flag scene a2-upstairs)*
> **HERR FALK:** You rescued a guest book? Then you urgently need good ink. *(if flag guestbook-returned)*
> **HERR FALK:** The big bottle: fifty euros. For you today, only fifty euros.

*The player can examine:* **waldruh-ink-cart** — A sign: Guaranteed! Never fades! Beside it a test sheet. The names from last week are already pale.

*Optional questions:* “Where does your ink come from?” · “Why are the names on your sheet pale?” · “Who were you before you sold ink?”

> **HERR FALK:** Fifty is a good price for eternity. Or do you want to haggle?

**GATE — PLAYER:** *„Haben Sie auch etwas Günstigeres?“* (Ask Herr Falk if he has something cheaper.)

> **HERR FALK:** Cheaper? For you: the small bottle. Twelve euros. And a free smile.
> **HERR FALK:** My test sheet? The names are from last week. They are … very discreet.
> **EMIL:** I smelled one of the bottles. It is completely ordinary ink.
> **HERR FALK:** Ordinary? The recipe is secret! Very secret. I hardly know it myself.
> **EMIL:** There is a brass button on his waistcoat. Like at the Office.
> **HERR FALK:** So? Will you buy the small bottle? Or would you rather ask questions?

**[CHOICE `ink-bought`]** *„Ich nehme die kleine Flasche.“* — I will take the small bottle.
> **HERR FALK:** A wise choice! Write quickly, before … I mean: write whenever you like.
> **EMIL:** Twelve euros for ordinary ink. Good thing you have a name that stays when said aloud.

**[CHOICE `falk-questioned`]** *„Ich will wissen, woher Ihre Tinte kommt.“* — I want to know where your ink comes from.
> **HERR FALK:** From where? From … Nebelstadt. From a workshop at the harbour. I will say no more.
> **HERR FALK:** Please. Tell nobody that I said that.

> **HERR FALK:** The stationmaster is looking for you. Very punctual, that man. Too punctual for my business.

---

### 27. WALDRUH · FOREST STATION — The minute nobody saw `a2-rail-trip`

*Your ticket says six o’clock. Otto waits with you for the connection. A train whistle comes from the forest.*

> **OTTO:** To the platform, {name}! Hear that whistle? Today we see the train ourselves.
> **OTTO:** The old timetable lists a connection to Nebelstadt. Departure: six p.m. As on your ticket.
> **OTTO:** The station clock does not show six yet. But the doors are already shut.
> **VOSS:** Your ticket, please. I may not skip this inspection.
> **OTTO:** Mr Voss, you can see it is leaving!
> **VOSS:** Valid. Departure six p.m. You are here on time. The train should …
> **OTTO:** Gone. We were standing at the door. It left without us.
> **VOSS:** In my file no train runs here. I just saw one. I will write down both.
> **OTTO:** Lina did not want to come. She is standing back by the old rails, counting. *(if flag scene a2-evening-plans)*
> **OTTO:** The paint is peeling off the old sign. A destination is underneath. The time is missing.

*The player can examine:* **waldruh-route-sign** — A new sign: There was never a route here. Underneath, under the paint: Connection to Nebelstadt. The time is missing.

*Optional questions:* “Why is punctual suspicious?” · “How did you get to Waldruh, Mr Voss?” · “Where does the train actually go?”

> **OTTO:** Waldruh station, window one. The ticket is valid. Why could you not continue your journey?

**GATE — PLAYER:** *„Ich habe meinen Anschluss verpasst.“* (Tell Otto that you missed your connection.)

> **OTTO:** Missed connection. I will compare your ticket with the clock. It stopped when the train left.
> **OTTO:** 17:59. Your ticket says 18:00. Anyone who follows the ticket finds an empty platform.
> **OTTO:** Under the paint it says: closed from inside, with a keeper’s key. One minute early. So no witness comes.
> **VOSS:** Closed from inside. That is missing from my file. So is your punctual arrival.
> **VOSS:** I know that whistle. It is on my recording. Every evening I hear a train that does not exist.
> **OTTO:** I can set the clock. Then the timetable changes with it.
> **OTTO:** Do we set the clock for the passengers? Or does the error stay visible until more witnesses come?

**[CHOICE `restore`]** *„Wir stellen die Uhr. Morgen sollen die Leute den Zug bekommen.“* — We set the clock. Tomorrow people should catch the train.
> **OTTO:** One minute forward. The clock is running again. Nebelstadt, six p.m. This time it is right.

**[CHOICE `consult`]** *„Der Fehler bleibt sichtbar. Wir brauchen mehr Zeugen.“* — The error stays visible. We need more witnesses.
> **OTTO:** I will write both times on the board. 17:59 and 18:00.
> **LINA:** Tomorrow there will be people here. Nobody can leave them out of the report any more.

> **OTTO:** A keeper’s key does not close an ordinary door. Look after your key.
> **OTTO:** Go to Lina by the old rails. She has been counting alone for too long.

---

### 28. WALDRUH · THE OLD RAILS — Eleven stones `a2-forest-rails`

*Old rails lie in the forest. Lina stands there counting stones. She was ten when the children’s train did not leave.*

> **LINA:** Nine. Ten. Eleven. Eleven stones. There are always eleven.
> **LINA:** I count when I do not want to cry. Frau Berg taught me that.
> **LINA:** The children’s train to the clinic ran here. Every evening at six.
> **LINA:** I had a cough. Pip was a baby. Mum and Dad went on ahead.
> **LINA:** Ruth and Jakob. I say it every day now. It hurts, but it stays. *(if flag scene a2-evening-plans)*
> **LINA:** You set the clock? Good. A train should never again leave a minute early. *(if flag scene a2-rail-trip)*

*The player can examine:* **waldruh-old-rails** — Old rails in the forest. Beside them eleven stones, neatly in a row.

*Optional questions:* “Who was the woman at the platform?” · “Who moved the stones aside?”

> **LINA:** You want to know why I count. Everyone does. Nobody asks.

**GATE — PLAYER:** *„Was ist damals passiert?“* (Ask Lina what happened back then.)

> **LINA:** We were sitting in the train. I had Pip on my lap. At six the train did not leave.
> **LINA:** The conductor said: stones on the rails. Eleven of them. We would have died.
> **LINA:** A woman with black hands stood at the platform. She was crying. Then she was gone.
> **LINA:** After that no train ran any more. Mum and Dad were on the other side.
> **LINA:** Frau Berg brought us bread every morning. And words. And numbers.
> **LINA:** Pip knows nothing. He only knows Mum and Dad from my wall.
> **LINA:** Do I write to him today? Or do I tell him myself when I am back?

**[CHOICE `lina-tells-pip`]** *„Schreib ihm heute. Er soll die Namen sofort sagen.“* — Write to him today. He should say the names right away.
> **LINA:** Dear Pip. Mum is called Ruth. Dad is called Jakob. Say it out loud. Every day.
> **LINA:** The letter goes through Marta’s door. Tonight it will be on his wall.

**[CHOICE `lina-waits`]** *„Sag es ihm selbst. Er soll dein Gesicht dabei sehen.“* — Tell him yourself. He should see your face when you do.
> **LINA:** Then I will take the first train. With both names in my mouth.
> **LINA:** Until then I will say them here. Ruth. Jakob. Eleven stones.

> **LINA:** Emil is at the clockmill. Every night an hour goes missing there. Go to him.

**CINEMATIC — RAILS**
> LINA: Elf Steine auf den Schienen. Ich habe sie gezählt.
> LINA: Der Zug ist nicht gefahren. Wir waren sicher. Mama und Papa waren auf der anderen Seite.

---

### 29. WALDRUH · CLOCKMILL WORKSHOP — The borrowed hour `a2-broken-clock`

*The clockmill repeats the hour before midnight. Emil has the manual and a box of tools. A letter lies beside the box.*

> **EMIL:** Careful, {name}! The floor holds. Only the hour on it sometimes disappears.
> **EMIL:** Marta let me through her door. The mill needs a mechanic.
> **EMIL:** Every night the mill repeats the hour before midnight. Outside, morning comes. In here, the same hour starts again.
> **EMIL:** After every round a name is missing from the stone. Yesterday I knew the person. Today I know the gap.
> **EMIL:** My tools were gone for a night. Then they came back clean. With a thank-you note.
> **EMIL:** The lamp from Lindenhafen? Here it is completely dark. Many names are missing here. *(if flag lamp-carried)*
> **EMIL:** The manual is hanging on the clock. Compare it with the stone. More than a cog is missing here.

*The player can examine:* **waldruh-clock** — The manual: Red lever stops the mill. Blue connection to the route signal. Two lines in a different hand in the margin. · **waldruh-memory-stone** — The stone carries the names from the last lantern festival. Some are smooth. New: Jakob Lenz, Ruth Lenz.

*Optional questions:* “What actually works around here?” · “Why are you in Waldruh too, Emil?” · “Who built the clockmill?”

> **EMIL:** Red lever, blue connection. The drawing looks simple. The mill does not always follow it.

**GATE — PLAYER:** *„Kannst du mir die Anleitung erklären?“* (Ask Emil whether he can explain the manual to you.)

> **EMIL:** The red lever stops the mill. The blue connection leads to the route signal. Someone cut it. Cleanly.
> **EMIL:** The margin says: disconnect only in an emergency. Thank you for the tools.
> **EMIL:** Put the lease beside it. The same E. The manual and the thank-you note are in Elise’s handwriting.
> **EMIL:** Elise cut the connection. With my pliers. They were on the table. I heard nothing.
> **EMIL:** She cleaned my pliers. A name is still missing from the stone. What do I do with her thanks?
> **GRETA:** Tonight’s names are on the stone too. Jakob Lenz. Ruth Lenz. They are already pale.
> **EMIL:** The lever stops the next round. But the hour gets overwritten. Whoever has not been said stays gone.
> **EMIL:** Do we stop the mill now? Or do we first read every name aloud before this hour disappears?

**[CHOICE `restore`]** *„Wir halten die Mühle jetzt an.“* — We stop the mill now.
> **EMIL:** The red lever. For the first time the hour ends.
> **GRETA:** One spot on the stone is smooth. A name stood there. I no longer know whose.

**[CHOICE `consult`]** *„Erst lesen wir alle Namen vor. Dann der Hebel.“* — First we read every name aloud. Then the lever.
> **EMIL:** I will hold the mill by hand. Read, quickly!
> **GRETA:** We read them all. Ruth Lenz and Jakob Lenz too. Everyone is still there.

> **EMIL:** Greta has a patient with lantern fever. He talks about a journey that never happened.
> **EMIL:** He was found at the old rails last night. He had been waiting for a train.

**CINEMATIC — CLOCKMILL**
> EMIL: Die Uhr läuft wieder. Aber uns fehlt eine Stunde.
> EMIL: Nicht alle Namen kommen zurück. Wir brauchen die alten Unterlagen.

---

### 30. WALDRUH · CONSERVATORY CLINIC — What the records forgot `a2-clinic`

*Voss sits in Greta’s clinic, still wearing his coat. He grips a file. Greta puts water beside him. Three old seed packets lie on the table.*

> **GRETA:** Stay behind the line, {name}. Many are waiting here.
> **GRETA:** Lantern fever. People look too long at vanished rails. Their eyes keep searching when their legs cannot go on.
> **RUTH LENZ:** I am helping Greta. I used to be a nurse here. For twelve years I waited and did nothing. *(if not ruth-lost)*
> **GRETA:** A woman helped me early today. I do not know her name. She has gone again. *(if flag ruth-lost)*
> **VOSS:** There is nothing wrong with me. I am merely tired. Please do not write down a diagnosis.
> **GRETA:** We found him at the old station. Wet shoes, cold hands. A blank ticket in his hand.
> **VOSS:** I have never travelled this route. My file records every day at the office.
> **GRETA:** In his fever he named three stops. With house numbers. None is in his file.
> **GRETA:** My seed packets carry old addresses. Let us compare them.

*The player can examine:* **waldruh-herb-garden** — Six seed packets with old addresses along the route. Greta has marked three. And a blue garden gate, on no packet.

*Optional questions:* “What is lantern fever?” · “Where was the blue gate?” · “How long do people have to wait here?”

> **GRETA:** Three addresses match. He also described a blue garden gate.
> **VOSS:** I must go back to the office. If I keep reading the file, it will all make sense.
> **VOSS:** You have seen both, {name}. My file and me. What do you advise?

**GATE — PLAYER:** *„Sie sollten sich ausruhen.“* (Advise Inspector Voss politely that he should rest.)

> **VOSS:** Rest. Very well. Please leave the packets here.
> **VOSS:** Behind the blue gate there was plum cake. The hostess always cut one piece more than there were guests.
> **VOSS:** I travelled there. Before the closure. My file says the route never existed. I was there.
> **VOSS:** One packet carries Frau Berg’s address. Her apples were the best on the whole route. *(if flag berg-remembered)*
> **RUTH LENZ:** In the night he kept asking: is anyone there? *(if not ruth-lost)*
> **VOSS:** I used this file to send people away. I told them their memories were wrong.
> **GRETA:** Put the file down, Mr Voss. You do not have to prove anything today.
> **GRETA:** With these addresses we can reach the old lanterns.
> **GRETA:** Do we do it today? Or wait until Voss can speak for himself?

**[CHOICE `restore`]** *„Wir lesen die Adressen heute vor.“* — We read the addresses aloud today.
> **GRETA:** Three lanterns light up along the rails.
> **VOSS:** The blue gate … one more piece of cake. For the guest who comes later.

**[CHOICE `consult`]** *„Wir warten, bis Herr Voss selbst sprechen kann.“* — We wait until Mr Voss can speak for himself.
> **VOSS:** I would like to read them myself. When I can stand again.
> **GRETA:** For the first time today he is sleeping peacefully.

> **GRETA:** Someone wrote that false file. The old archive has the orders from back then.
> **GRETA:** There is a cellar under the clockmill. The door has a lock with a little lantern.

---

### 31. WALDRUH · CLOCKMILL CELLAR — The cellar under the mill `a2-cellar`

*There is a cellar under the clockmill. Elise’s key opens its door. Someone is hiding inside.*

> **EMIL:** The key fits! The little lantern on the handle and the one on the lock are the same.
> **HERR FALK:** Don’t shoot! I mean: good evening. I am selling … nothing here.
> **EMIL:** Herr Falk. Among ink bottles. And a brass badge from the Office.
> **HERR FALK:** You asked where my ink comes from. I got scared. *(if flag falk-questioned)*
> **HERR FALK:** You bought my ink. Is your name already pale? I am sorry. *(if flag ink-bought)*
> **EMIL:** On the table lies an old copy. Rule four. Signed F.

*The player can examine:* **waldruh-mill-cellar** — A brass badge, ink bottles and an old copy: Rule four. Do not say names out loud. Signed: F. *(locked: The door has a lock with a little lantern on it. You do not have its key.)*

*Optional questions:* “What exactly does the machine do?” · “Who gave you the rule?”

> **HERR FALK:** Yes. The F is me. And now you look at me as if I had sold the world.

**GATE — PLAYER:** *„Warum haben Sie das gemacht?“* (Ask Herr Falk why he did it.)

> **HERR FALK:** I was a clerk at the Brass Office in Nebelstadt. Three years. I had the most beautiful handwriting in the building.
> **HERR FALK:** They gave me a sentence: do not say names out loud. I wrote it beautifully. A hundred times.
> **HERR FALK:** Then I saw the machine at the harbour. Under a grey tarpaulin. It makes names quiet.
> **HERR FALK:** My rule helps it. Whoever stays silent disappears faster. That is when I left.
> **HERR FALK:** Now I sell ink to people who are afraid. Because I am afraid too.
> **EMIL:** Ordinary ink against a machine. That does not even mostly work.
> **HERR FALK:** Will you let me go? Or will you take me to the archive, before everyone?

**[CHOICE `falk-released`]** *„Gehen Sie. Aber verkaufen Sie keine Versprechen mehr.“* — Go. But sell no more promises.
> **HERR FALK:** Thank you. I will give away the rest of the ink. To children. For drawing.
> **EMIL:** And he left the badge here. I will take it.

**[CHOICE `falk-witness`]** *„Sie kommen mit ins Archiv. Als Zeuge.“* — You come with us to the archive. As a witness.
> **HERR FALK:** As a witness. I have never been that. Only a clerk.
> **EMIL:** This time he does not write. This time he speaks.

> **EMIL:** The archive stands at the station, in an old carriage. Ada knows the orders from back then.

---

### 32. WALDRUH · THE KEEPER’S RECORDS — The second signature `a2-archive`

*Ada lays two documents side by side. One is valid for a week. The other has no end date. She holds the pen, but does not write.*

> **ADA:** You are looking for a signature. I have the paper here. I wanted to wait until you had gone.
> **ADA:** I am Ada. I file the truth alphabetically. At least that tells me which drawer I am hiding it in.
> **VOSS:** I have been told to rest. I will listen. I brought the file.
> **HERR FALK:** I am here as a witness. I wrote rule four. I will tell everything. *(if flag falk-witness)*
> **ADA:** I was Elise’s apprentice. She asked for one week. I signed the first closure.
> **ADA:** I wanted to show her she could trust me. I did not ask the Circle. I had time to.
> **ADA:** My order is on the memorial stone. Beneath it: ask the residents. I wrote that sentence myself.

*The player can examine:* **waldruh-memory-stone** — Temporary closure of the route, one week. Signed: Ada, the Keeper’s apprentice. Under the seal, very small: Ask the residents.

*Optional questions:* “How long have you worked here?” · “Where do you file the truth?” · “Why does your archive travel?”

> **VOSS:** One week. My file says: permanent. Both dates carry the same seal.
> **ADA:** The first paper is here. The second is underneath. All these years I never took it out.

**GATE — PLAYER:** *„Können Sie mir das genauer erklären?“* (Ask Ada politely whether she can explain that more precisely.)

> **ADA:** My order lasted one week. The second was permanent. My signature opened the door for it.
> **ADA:** The permanent order bears two marks: the lantern from Elise’s key and the Brass Office stamp.
> **VOSS:** Our stamp is genuine. My file leaves out this order. That does not make it any less true.
> **ADA:** Elise used the key from inside. Afterwards she passed it on. Room 7. Your lease.
> **ADA:** The register says: the Keeper’s successor. Beneath it, your name, {name}.
> **ADA:** “Before you erase us again, come.” She means the key in your pocket. It can close the route again.
> **HERR FALK:** I saw the second stamp. In Nebelstadt. Pressed twice. Clack, clack. *(if flag falk-witness)*
> **ADA:** That night her voice was heard at the harbour and at the observatory. At the same time.
> **ADA:** I am putting my pen down. My name stays on the paper. I will not cross it out.
> **ADA:** I am Ada. If you like, we can say du now. I have hidden behind forms long enough.
> **VOSS:** I will keep to Sie. I am taking my file. This time to examine it, not to defend it.
> **ADA:** The second stamp came from Nebelstadt. Do you go now? Or do you first gather witnesses for both orders?

**[CHOICE `restore`]** *„Ich gehe jetzt. Elise muss es mir selbst erklären.“* — I am going now. Elise must explain it to me herself.
> **OTTO:** Today punctuality matters less. I will take you.

**[CHOICE `consult`]** *„Ich hole Zeugen. Kein Befehl soll wieder nur eine Seite hören.“* — I will bring witnesses. No order should hear only one side again.
> **ADA:** I will come along. As the woman whose name is on the first order.
> **LINA:** Three witnesses, two platforms. This time no chair stays empty.

> **ADA:** The records for the second stamp are in Nebelstadt. The seventh bell leaves us little time.
> **ADA:** But this time you know what you carry.

**CINEMATIC — CONFESSION**
> ADA: Eine Woche, habe ich gesagt. Danach habe ich nicht mehr gefragt.
> ADA: Du darfst du sagen. Meine Unterschrift bleibt hier, wo alle sie sehen.

---

# ACT THREE — NEBELSTADT
### "Whose silence counts" (B1)

### 33. NEBELSTADT · HARBOR POST OFFICE — A voice without a witness `b1-witness`

*Two signals arrived together. Only one had a witness. Lina lays out the statements. Marta waits for her first question. This time, a convincing story will not be enough.*

> **LINA:** The hearing begins. Two reports, the same voice. At the harbour and at the observatory, at the same time.
> **ADA:** I will keep the minutes. Alphabetically, unless anyone objects.
> **LINA:** Marta took tea to the harbour that night. She will only say what she herself saw and heard.
> **MARTA:** Lina, I feel as if I am in court. And without my apron.
> **LINA:** Today every answer goes on record. That is why even we speak formally today.
> **VOSS:** The Brass Office is attending as an observer. I will listen. I will not interrupt.
> **HERR FALK:** I am the second witness. I know the stamp. Pressed twice. *(if flag falk-witness)*
> **LINA:** The tape is here. Marta is sitting there. We keep the evidence separate.

*The player can examine:* **nebelstadt-evidence-crate** — Delivery slips, Marta’s tea list from that night and a reel of tape. · **nebelstadt-signal-lantern** — An old recorder with an endless tape hangs beneath the lantern.

*Optional questions:* “What is a hearing?” · “Where is the machine?”

> **LINA:** Madam witness, your cup is beside you. We are ready for your statement.

**GATE — PLAYER:** *„Könnten Sie beschreiben, was Sie gesehen haben?“* (Politely ask the witness to describe what she saw (formal Sie).)

> **MARTA:** I put the teapot down beside the lantern. Then I heard a woman in the fog.
> **MARTA:** She called: “Is anyone there? I am still here.”
> **MARTA:** Then a cough. Then everything from the start. By the third cough I knew.
> **LINA:** An old recording. Elise was not standing in two places in the fog.
> **ADA:** The harbour and the observatory play the same tape. Two connections, one voice.
> **MARTA:** Someone stood at the machine beside the lantern. When I came closer, the words on my tea list were gone.
> **MARTA:** I did not see his face. But his stamp sounded like yours, Mr Voss. Twice: clack, clack.
> **VOSS:** I was standing at the machine. Your statement is correct.
> **LINA:** Then your name stays in the record. Even while we wait for your explanation.
> **LINA:** Do we publish the statement right away? Or send the Circle a checked copy first?

**[CHOICE `reopen`]** *„Wir hängen sie sofort am Hafen aus.“* — We post it at the harbour right away.
> **VOSS:** I will answer here. Before these same people.

**[CHOICE `remember`]** *„Erst bekommt der Kreis eine geprüfte Abschrift.“* — First the Circle receives a checked copy.
> **MARTA:** I will check every word. Then nobody can call it a rumour.
> **GRETA:** I will read it to the Circle tonight.

> **LINA:** Next appointment: Frau Kessler in the Office archive. She has notices. Many notices.

---

### 34. NEBELSTADT · BRASS OFFICE ARCHIVE — The Office record room `b1-record-room`

*The maintenance slips lie in the Brass Office archive. Frau Kessler filled them all in herself. Who kept the machine running?*

> **FRAU KESSLER:** You again. From Lindenhafen. You travelled very loudly.
> **FRAU KESSLER:** Mr Voss has become an observer. I have not. I am still on duty.
> **FRAU KESSLER:** You have my list. Rules one to ten. It belongs in the archive, not in your bag. *(if holding notice-list)*
> **FRAU KESSLER:** You took Marta’s guest book. Your name has been in my book since then. *(if flag guestbook-returned)*
> **FRAU KESSLER:** A man from the writing office was a witness? Herr Falk. His letters were always too beautiful. *(if flag falk-witness)*
> **FRAU KESSLER:** The archive is locked. To unauthorised persons. And you are very unauthorised.

*The player can examine:* **nebelstadt-record-room** — Maintenance slips for the harbour machine. Three coils. All in Frau Kessler’s hand, all with Voss’s signature. *(locked: The archive is locked. You need a key or one of the Office’s books.)*

*Optional questions:* “Why do you work for the Office?” · “Where does rule four come from?”

> **FRAU KESSLER:** You are inside anyway. With a key that should not exist. What are you looking for?

**GATE — PLAYER:** *„Könnten Sie mir zeigen, wo die Unterlagen sind?“* (Ask Frau Kessler formally to show you where the documents are.)

> **FRAU KESSLER:** Third drawer. Maintenance, harbour, signal. All complete. All in order.
> **FRAU KESSLER:** Three orders for new coils. March, July, December. I filled them in. Mr Voss signed.
> **FRAU KESSLER:** I never asked what the machine does. That was not on the form.
> **ADA:** The same sentence is at the bottom of every slip: whoever stays silent agrees.
> **FRAU KESSLER:** That is not a threat. That is a simplification. Whoever says nothing makes no work.
> **ADA:** For you, Frau Kessler. For the others it was a disappearance.
> **FRAU KESSLER:** The council meets tomorrow. Will you invite me? Or will you simply put my slips on the table?

**[CHOICE `kessler-invited`]** *„Sie sprechen selbst vor dem Rat. Mit Ihren Zetteln.“* — You speak before the council yourself. With your slips.
> **FRAU KESSLER:** I have never spoken in front of people. Only in front of forms.
> **ADA:** Then you start tomorrow. We will listen. Even if you make a mistake.

**[CHOICE `slips-filed`]** *„Die Zettel kommen auf den Tisch. Sie müssen nichts sagen.“* — The slips go on the table. You need not say anything.
> **FRAU KESSLER:** Of course. Whoever stays silent … No. I will not say that any more.
> **ADA:** I will take the slips. Alphabetically, by date.

> **ADA:** Otto is waiting on the railway quay. He has two plans for the route and a bad mood.

---

### 35. NEBELSTADT · RAILWAY QUAY — The price of a shortcut `b1-new-route`

*Otto has drawn two routes. Greta has brought her own map. What looks simple on paper will cost someone dearly.*

> **OTTO:** Two plans for the route to Waldruh. One is good. The other is Greta’s.
> **GRETA:** I heard that, Otto.
> **OTTO:** My line is straight and forty minutes faster. For the people of Waldruh every journey counts.
> **GRETA:** Your straight line goes right through my garden. The last seeds from vanished houses grow there.
> **GRETA:** Frau Berg’s rhubarb grows there too. Only this bed is left of her house. *(if flag berg-remembered)*
> **OTTO:** The clinic needs supplies. I cannot offer it a garden as a timetable.
> **OTTO:** The Lamplighters have already ordered rails, by the way. Without asking me. Typical. *(if lamplighters ≥ 4)*
> **GRETA:** Then draw a route that brings us home without leaving something behind again.

*The player can examine:* **nebelstadt-harbor-chart** — A straight line through Greta’s garden. A curve along the road. Beside it a dot, erased three times: Clinic?

*Optional questions:* “Why does being on time matter so much to you?” · “What grows in your garden?” · “Who built the old route?”

> **OTTO:** I am holding the pen; Greta is holding the map down. This will not bring our route back.

**GATE — PLAYER:** *„Wir müssen eine Lösung finden, die für alle passt.“* (Say that we must find a solution that suits everyone.)

> **OTTO:** For everyone. Then I suppose I should show my second drawing.
> **OTTO:** The curve follows the road. Forty minutes longer. Nobody has much to celebrate.
> **GRETA:** And a stop at the clinic?
> **OTTO:** The stop is for people who cannot walk. That is why I could never quite erase that dot.
> **OTTO:** You are right. My second drawing should not have been hidden beneath the first.
> **GRETA:** Both routes cost something. This time we can see the price before anyone signs.
> **OTTO:** Which line stays on the map?

**[CHOICE `reopen`]** *„Die gerade Linie. Sie bringt die Leute schneller heim.“* — The straight line. It brings people home faster.
> **OTTO:** Three beds must go. The clinic gets no stop.
> **GRETA:** Some only grow here. I will copy their addresses, at least.

**[CHOICE `remember`]** *„Die Kurve mit dem Halt an der Klinik.“* — The curve with the stop at the clinic.
> **OTTO:** Every journey takes longer. At the clinic I will stop without anyone having to wave.
> **GRETA:** The Circle will tend the beds. You have given us work, {name}.

> **OTTO:** Wait. Do you see the lighthouse? It is shining dark. That is not even possible.
> **GRETA:** The beam points at Waldruh. Where it falls, the lanterns go out.
> **GRETA:** At the signal tower sits a man who does not speak. He knows the signal. Go to him.

**CINEMATIC — DARK-BEAM**
> LINA: Der Strahl nimmt die Namen mit. Wir müssen ihn stoppen.

---

### 36. NEBELSTADT · SIGNAL TOWER — The man who writes `b1-signalman`

*Jonas keeps the signal at the harbour. He has not said a word in twelve years. His name on the slate is fading.*

> **EMIL:** This is Jonas. He has kept the signal for twelve years. He does not speak. He writes.
> **JONAS:** He writes: Good evening. Quietly, please. The signal is listening.
> **EMIL:** The Office paid him a bonus every year. For zero complaints.
> **JONAS:** He writes: whoever says nothing loses nothing. That is what the form said.
> **EMIL:** Frau Kessler is coming to the council. She will speak. Jonas, do you hear? Even her. *(if flag kessler-invited)*
> **EMIL:** Look at his slate. His own name is almost gone.
> **EMIL:** Tonight the storm comes. Without voices the signal cannot hold off the beam.

*The player can examine:* **nebelstadt-signal-slate** — A slate beside the signal. At the top: No complaints. At the bottom, almost wiped away: Jonas.

*Optional questions:* “Why does Jonas not speak?” · “What does the signal do?”

> **JONAS:** He writes his name. Then he wipes it away. Then he writes it again.

**GATE — PLAYER:** *„Ich bitte Sie, es einmal laut zu sagen.“* (Ask Jonas politely to say it out loud once.)

> **JONAS:** J … Jo …
> **EMIL:** His voice is twelve years old. It has to remember first.
> **JONAS:** He writes: when I speak, I hear how quiet I have become.
> **EMIL:** The signal has three levers. One for each town. One name per lever, out loud, or it slips.
> **EMIL:** Will you give him time? Or will you read his name aloud for him now?

**[CHOICE `jonas-speaks`]** *„Ich warte. Er sagt ihn selbst.“* — I will wait. He will say it himself.
> **JONAS:** I … My name is Jonas.
> **EMIL:** Do you hear? The signal is brighter. Just one name, and it is brighter.

**[CHOICE `jonas-writes`]** *„Ich lese ihn für ihn. Laut.“* — I will read it for him. Out loud.
> **JONAS:** He writes: thank you. It is easier when someone else says it.
> **EMIL:** The signal holds. Quietly, but it holds.

> **EMIL:** The machine’s maintenance ledger is at the repair dock. I want to read it before I touch anything.

---

### 37. NEBELSTADT · LANTERN REPAIR DOCK — The hand that kept it running `b1-work`

*Emil offers you work on the signal. The next bell is close. Voss stands beside the maintenance ledger. He has not opened it yet.*

> **EMIL:** {name}! I need help. This time I will put the job in writing before we start.
> **EMIL:** We are rebuilding the harbour signal. It should carry names back.
> **EMIL:** The machine under the tarpaulin works perfectly. Unfortunately. That is exactly the problem.
> **EMIL:** Three new coils. Someone has looked after this machine better than my lighthouse.
> **VOSS:** This installation belongs to the Brass Office. Anyone working on it needs a permit.
> **EMIL:** Then approve it. You have a stamp, after all.
> **VOSS:** Today my stamp stays down. First you will see the maintenance ledger.
> **EMIL:** Frau Kessler’s slips are already here. Three orders. All tidy. *(if flag scene b1-record-room)*
> **EMIL:** Do you still have the ledger Voss gave you in Lindenhafen? Keep it ready. *(if holding inspector-ledger)*
> **EMIL:** Pay: soup. I will not downplay the danger. We are working on an eraser machine.

*The player can examine:* **nebelstadt-repair-ledger** — Maintenance ledger, harbour eraser machine. Three new coils, all after the closure. Approved with two stamps and one signature.

*Optional questions:* “What does “works mostly” mean?” · “Why does the machine belong to the Office?”

> **EMIL:** Before you touch a screw: what do you want to know?

**GATE — PLAYER:** *„Bevor ich anfange, möchte ich die Bedingungen klären.“* (Say that before starting you want to clarify the conditions.)

> **EMIL:** Yes. Before you touch a screw, this ledger stays open.
> **EMIL:** Three new coils, all ordered after the closure: on the second of March, the ninth of July, the first of December.
> **EMIL:** Every time the same stamp, pressed twice. Clack, clack.
> **EMIL:** And now your ledger from Lindenhafen. The same signature. The same crooked stamp. *(if holding inspector-ledger)*
> **VOSS:** I personally authorised the permanent closure. My signature is beneath it.
> **VOSS:** And all three eraser coils. I paid to keep the machine running.
> **VOSS:** Frau Kessler filled in the slips. I signed. The responsibility is mine.
> **VOSS:** The register said: quiet. Outside, homes were missing. I chose to believe the register.
> **VOSS:** When I ordered the third coil, I knew about the missing names. I ordered it anyway.
> **EMIL:** I installed them. The work order said: lighthouse. Not a word about names.
> **VOSS:** You carried out my order. I concealed what your work would do.
> **EMIL:** Then sign exactly that. And I will read every line before I install another coil.
> **EMIL:** Do we switch off the new coils today? Or explain the conversion first? Which risk do we take first?

**[CHOICE `reopen`]** *„Wir schalten die Spulen heute ab.“* — We switch off the coils today.
> **EMIL:** Power off. Voss, hold the lamp.
> **EMIL:** The beam is weakening. The old wiring still hums. For the rest I need people who answer.

**[CHOICE `remember`]** *„Erst erklären wir den Umbau vor dem Rat.“* — First we explain the conversion before the council.
> **EMIL:** The plan is posted at the council. I will guard the switch.
> **VOSS:** Write my name beside it. Anyone who loses something while we wait must know where to find me.

> **EMIL:** Ada is calling the council for tomorrow morning. Everyone should come. Really everyone.
> **VOSS:** I will bring my ledger and open it in front of everyone. It has been shut long enough.

**CINEMATIC — LEDGER**
> INSPECTOR: Die dauerhafte Schließung. Die drei Spulen. Ich habe beides unterschrieben.
> INSPECTOR: Lassen Sie das Buch offen. Auch auf meiner Seite.

---

### 38. NEBELSTADT · COUNCIL ARCHIVE — Whose silence counts? `b1-council`

*Ada places three chairs around a table. Voss stays standing at first. The evidence is open. A decision is still missing. Outside the window, the dark beam grows brighter.*

> **ADA:** The session is open. Seven chairs, eight opinions and a pot of soup.
> **FRITZ:** The soup is neutral. It has no opinions, only potatoes.
> **ADA:** The board carries the Office’s rule: whoever stays silent agrees. The machine follows that rule.
> **LINA:** Fritz! You said nothing for three seconds, and the beam got brighter!
> **FRITZ:** No! I mean: no. I was only chewing.
> **GRETA:** The empty chair cannot object, Ada. That does not mean it agrees.
> **GRETA:** Today someone we no longer know is sitting there. I can feel it. *(if flag ruth-lost)*
> **OTTO:** The Lamplighters say: open it. Today, all of it, right now.
> **GRETA:** The Circle says: nothing opens before every town has been asked. That is exactly what was missing last time.
> **OMA HILDE:** And I say: ask the old ones first. We have waited the longest. *(if flag hilde-invited)*
> **VOSS:** I am not chairing this meeting. I authorised the closure. I will answer your questions.
> **VOSS:** My name is Voss. The title helps nobody here. If you agree, we can use du.
> **FRAU KESSLER:** I am Frau Kessler. I wrote the slips. I will keep to Sie. But I am speaking. *(if flag kessler-invited)*
> **LINA:** The Circle has brought the old objections. Forty pages. Back then nobody read them. *(if unwritten ≥ 5)*

*The player can examine:* **nebelstadt-council-board** — Three notices: Open now! Ask first! Soup from twelve. Beneath them an old Office rule: whoever stays silent agrees. · **nebelstadt-harbor-chart** — The chart with both lines. A note from Otto: ask first, then draw.

*Optional questions:* “Why does silence count as yes?” · “Why is one chair empty?” · “What is in the soup?”

> **ADA:** A whole route at once, with everyone answering immediately. Is there a smaller first step, {name}?

**GATE — PLAYER:** *„Ein Kompromiss wäre, die Strecke schrittweise zu öffnen.“* (Propose opening the route gradually as a compromise.)

> **OTTO:** Step by step. One station after another. I can live with that. Slowly.
> **GRETA:** Before each step we ask the town. A no goes on record too.
> **ADA:** The objections are on record now. Do you hear? The beam is weakening.
> **VOSS:** And the authorisations must be readable. A stamp must never again replace an answer.
> **FRITZ:** My yes is in the record. Now I can finally swallow this potato.
> **ADA:** One step has to come first. The first train or the first vote?

**[CHOICE `reopen`]** *„Der erste Zug. Mit den Laternenhütern an Bord.“* — The first train. With the Lamplighters on board.
> **OTTO:** Anyone afraid of the first train gets a seat beside me.

**[CHOICE `remember`]** *„Die erste Abstimmung. In jeder Stadt.“* — The first vote. In every town.
> **LINA:** I will carry the question to every town. And the clinic’s post.

**[CHOICE `publish-ledger`]** *„Das Buch des Amtes wird öffentlich ausgehängt. Wir prüfen jede Entscheidung.“* — The Office’s ledger goes on public display. We review every decision. *(if holding inspector-ledger)*
> **VOSS:** Nobody has to beg for an explanation at my office door again.

**[CHOICE `kessler-list`]** *„Frau Kessler liest ihre Liste vor. Alle Regeln, öffentlich.“* — Frau Kessler reads her list aloud. Every rule, in public. *(if flag kessler-invited)*
> **FRAU KESSLER:** Rules one to ten. I will read them aloud. Then I will strike out rule four. Myself.
> **ADA:** For the first time everyone hears what they were only allowed to sign before.

> **ADA:** Do you hear the wind? The storm is coming before the next bell.
> **ADA:** {name}, Voss is waiting at the observatory. Before the storm comes, you must know something about your key.

---

### 39. NEBELSTADT · OBSERVATORY STAIRS — One minute, one key `b1-temptation`

*The dark beam is stronger than ever. With the key you could close the route tonight. Then the beam stops. But Waldruh goes dark again.*

> **VOSS:** The stairs to the observatory are locked. With a lantern lock. You know which key fits.
> **ADA:** Up at the desk is the place where Elise closed the route back then.
> **VOSS:** The beam is stronger tonight than ever. The coils are off, but the old wiring is enough.
> **VOSS:** The coils are still running. The council wanted the plan first. Now we are paying for it. *(if flag scene b1-work)*
> **ADA:** The beam runs along the route. Where it is open, it reaches the names.
> **ADA:** Listen. The tape is running again.

*The player can examine:* **nebelstadt-observatory-stairs** — A staircase leading up. A little lantern on the lock. Your key fits. *(locked: The stairs are locked. There is a little lantern on the lock.)*

*Optional questions:* “Why did Elise turn it back then?” · “Who recorded the tape?”

> **VOSS:** I will not tell you what to do. I decided for others once. That was enough.

**GATE — PLAYER:** *„Wenn ich den Schlüssel drehe, was passiert dann?“* (Ask Voss what happens if you turn the key.)

> **ADA:** Then the route closes. One minute, one turn. The beam has no path any more.
> **ADA:** Tonight there would be peace. No storm over the names. Tomorrow you start again.
> **ADA:** But Waldruh would be dark again. All the new names there, on the stone and at the table.
> **VOSS:** I have done this once before. One signature. It is easy. That is the terrible thing about it.
> **ADA:** From the harbour, quietly: “Is anyone there? I am still here.”
> **VOSS:** Will you turn the key tonight? Or do we weather the storm without it?

**[CHOICE `route-closed-again`]** *„Ich drehe ihn. Nur für diese Nacht.“* — I will turn it. Just for tonight.
> **ADA:** The beam breaks off. It is quiet over the harbour.
> **LINA:** Waldruh is dark. I cannot see a single light any more. Not even at the table.
> **VOSS:** Now you know how easy it is. I do not judge you. I recognise you.

**[CHOICE `key-refused`]** *„Nein. Wir halten den Sturm aus. Zusammen.“* — No. We weather the storm. Together.
> **ADA:** Then we weather it. The key stays in your pocket.
> **VOSS:** Back then someone should have said no. Today someone did.

> **VOSS:** Do you hear the wind? Greta is already in the garden. The water is rising.

**CINEMATIC — TEMPTATION**
> ADA: Ein Schlüssel. Eine Minute. Dann ist der Strahl dunkel.
> STIMME: Ist da jemand? Ich bin noch hier.

---

### 40. NEBELSTADT · OBSERVATORY GARDEN — Three lanterns in the rain `b1-storm`

*The storm cuts the power. The bell keeps going. Greta counts people; Emil counts connections. Both need help in different places. Now you find out who keeps a promise in the rain.*

> **GRETA:** The water is already between the beds. Now the people.
> **EMIL:** The signal is flickering. The beam presses against it like a hand over a mouth. *(if not route-closed-again)*
> **EMIL:** No beam tonight. Only storm. But Waldruh is dark, and the signal cannot find the names there. *(if flag route-closed-again)*
> **MARTA:** I have tea, blankets and a list. Greta, who is still missing?
> **GRETA:** The family from Waldruh, with the red boat. I can see their light beyond the beds.
> **MARTA:** I wrote their names down. Only a wet streak is left. Yesterday I could still read them.
> **VOSS:** The Office storehouse is open. Sandbags, ropes, lamps. No forms.
> **VOSS:** My staff are coming too. You brought us evidence instead of rumours. *(if brassOffice ≥ 3)*
> **FRAU KESSLER:** I unlocked the storehouse. Without a form. It feels wrong. And right. *(if flag kessler-turned)*
> **LINA:** The Circle is here. Its people know every way to the clinic, even those on no map. *(if unwritten ≥ 3)*
> **OTTO:** The Lamplighters are here, with ladders and tools. You kept your word. Now we keep ours. *(if lamplighters ≥ 3)*
> **OTTO:** The clinic train is at the stop. It can take people out of the water. Good that we chose the curve. *(if flag clinic-stop)*
> **EMIL:** Jonas calls from the tower: here! The signal is here! *(if flag jonas-speaks)*
> **OTTO:** I will climb to the lantern. But someone must hold the ladder, and my people are already in the water.
> **GRETA:** The ladder is slipping. The ropes are here. Every group needs hands from another.

*The player can examine:* **nebelstadt-signal-lantern** — The signal lantern flickers in the storm. Three levers, one for each town.

*Optional questions:* “Why was the festival called off?” · “What is the beam doing to the signal?”

> **GRETA:** Each on their own, and we do not even have enough hands for the ladder.

**GATE — PLAYER:** *„Wir können das Problem nur gemeinsam lösen.“* (Say that we can only solve the problem together.)

> **OTTO:** Voss, hold the ladder with me. Lina, pass the rope to Greta. Emil climbs.
> **EMIL:** Keep your hands there. Lindenhafen, Waldruh, Nebelstadt. Now the signal holds!
> **MARTA:** Lenz! The Lenz family! Now I remember.
> **LINA:** Dad! Jakob! We are here!
> **LINA:** Mum! Ruth! Hold on! *(if not ruth-lost)*
> **GRETA:** The signal is tipping again. Water is rising in the garden. Where do we take the strong ropes first?

**[CHOICE `reopen`]** *„Zum Signal. Dann holen wir die Familien über das Gewächshausdach.“* — To the signal. Then we bring the families out over the greenhouse roof.
> **OTTO:** The signal holds. The Lenz family waves from the hall. Their red boat drifts away without them.

**[CHOICE `remember`]** *„Zum Garten. Emil hält das Signal mit der Hand.“* — To the garden. Emil holds the signal by hand.
> **GRETA:** Eighteen people and two dogs. All dry. Emil needs a new support.

> **GRETA:** The wind is turning. Do you see the light up in the observatory? No lamp has burned there for years.
> **LINA:** Mail for you. Sender: the old signal room. Signed: E.
> **MARTA:** We will stay with the families. Go upstairs, {name}. This time Elise must open her own door.

**CINEMATIC — STORM**
> GRETA: Die letzte Person ist im Trockenen. Jetzt halten wir das Licht.
> OTTO: Drei Städte antworten. Keine Stimme kommt vom Band.

---

### 41. NEBELSTADT · THE LAST ATLAS PAGE — A promise with witnesses `b1-atlas`

*Elise waits at the desk. Your letters lie before her. A page in the Atlas is blank. The key still fits. She looks at the others first, then at you.*

> **ELISE SANDER:** {name}. I left the door open. Even so, your knock frightened me.
> **ELISE SANDER:** You turned the key. Now you know how easy it is. I do not condemn you. *(if flag route-closed-again)*
> **ELISE SANDER:** You did not turn the key. I saw it from the window. *(if flag key-refused)*
> **ELISE SANDER:** And now all I can think of is: would you like some tea? I am afraid it is already cold.
> **ELISE SANDER:** My letters to you are beside my drafts. Here I crossed out every word that sounded like an excuse.
> **ELISE SANDER:** The letter said: “Before you erase us again, come.” I was afraid of this key.
> **ELISE SANDER:** And later: “I am not in two places.” I was here. Behind a door I had closed myself.
> **ELISE SANDER:** Lay the key between us. I will leave it there while I tell you everything.
> **ELISE SANDER:** Lina told you about the stones. Eleven. I counted them before I moved them. *(if flag scene a2-forest-rails)*
> **ELISE SANDER:** There were stones on the tracks at the station. The next train was meant to take children to the clinic.
> **ELISE SANDER:** I wanted to stop it leaving. At 17:59 I closed the route from inside. For one week.
> **ELISE SANDER:** I call it my first mistake: I took people’s choice away to keep them safe.
> **ELISE SANDER:** After a week I wanted to be sure everyone agreed with my solution first. The doors stayed closed.
> **ELISE SANDER:** When Voss made the closure permanent, I did not object. I let him carry out what I had begun.
> **ELISE SANDER:** I paid for your coffee at Marta’s. Then someone had to say your name aloud.
> **ELISE SANDER:** You did not know the towns yet. I hoped you would open their doors. I wanted to keep mine closed.
> **ELISE SANDER:** You kept the letter. Today Ada gets its drafts too. Even the sentences I crossed out. *(if flag elise-letter-private)*
> **ELISE SANDER:** You gave the Office my address. I was still hiding then. Today everyone knows where I am. *(if flag waldruh-address-public)*
> **ELISE SANDER:** One letter is right on top. For Lina. I stopped the train she was sitting in.
> **VOSS:** Elise. I heard your voice every evening. Now I am done waiting for a recording.
> **ELISE SANDER:** Then answer me. Here, in front of the open door.
> **VOSS:** I am here.
> **ELISE SANDER:** I am coming downstairs with you today. First, let us look at what lies beside the key.

*The player can examine:* **nebelstadt-observatory** — On the desk a pile of draft letters to {name}. The first ones are only a few words long. Beside them an empty place for a key. · **nebelstadt-council-board** — One line on the council board has been left blank. Above it, in Ada’s handwriting: “Our rule:”

*Optional questions:* “How did you live up here?” · “What will you do now?” · “Why did you make the recording?”

> **ELISE SANDER:** The seventh bell is about to ring. This page has room for a rule that binds me too.
> **ELISE SANDER:** Last time, I spoke only after everything was closed. What do we agree before someone must decide alone again?

**GATE — PLAYER:** *„Wir vereinbaren, dass wir Probleme frühzeitig besprechen.“* (Write that we agree to discuss problems early.)

> **ELISE SANDER:** I write “we”. Then I pause. I leave room for your name beside mine.
> **ELISE SANDER:** The ink holds. A stop reappears on the Waldruh line. And another towards Lindenhafen.
> **LINA:** Ruth. My mother’s name is Ruth. I never stopped knowing it. I only stopped saying it. *(if flag ruth-lost)*
> **ELISE SANDER:** A name stands on the stone in Waldruh again. Ruth Lenz. *(if flag ruth-lost)*
> **VOSS:** I will write the sentence in my ledger too. The ledger that now hangs in the town hall. *(if flag ledger-published)*
> **ELISE SANDER:** The key stays in front of me. I will not take it upstairs again.
> **ELISE SANDER:** “Again” meant the key you inherited. My guilt does not make you guilty.
> **ELISE SANDER:** The key needs a permanent, public place. Who will keep it: the council or the Circle?

**[CHOICE `reopen`]** *„Der Rat verwahrt ihn öffentlich.“* — The council keeps it, in public.
> **ELISE SANDER:** Ada takes the key. I lay my drafts beside it. Both stay downstairs with the others.
> **ELISE SANDER:** Tomorrow I will answer their questions. Even if the first train leaves without me.

**[CHOICE `remember`]** *„Der Kreis verwahrt ihn für die Städte.“* — The Circle keeps it, for the towns.
> **ELISE SANDER:** Greta takes the key for the Circle. Lina records where it is. No more hidden drawers.
> **ELISE SANDER:** I get a chair among the people I must answer to.

> **OTTO:** The first train runs. Not every connection is settled yet. I will stay with the people on the platform. *(if ending routes-reopened)*
> **GRETA:** People are going home. We will look for the missing addresses together; they do not come back with the timetable. *(if ending routes-reopened)*
> **GRETA:** Each town decides on its own connection. Lina brings every answer back. *(if ending towns-consent)*
> **LINA:** The trains wait for the answers. Today I carry the medicines on foot. Tomorrow I will ask again. *(if ending towns-consent)*
> **VOSS:** My stamp stays with the council. Ada checks every old authorisation. I answer questions under my own name. *(if ending brass-reformed)*
> **ADA:** Disputed connections stay closed for now. Even good work now waits for review. I begin today. *(if ending brass-reformed)*
> **ELISE SANDER:** {name}, I am coming downstairs now. Frau Berg knows my voice. This time she should see my face too.
> **ELISE SANDER:** At 7 Gartenstraße there is a name on the house again. I saw it from the window.
> **ELISE SANDER:** Three towns stand in the Atlas again. A coast appears at its edge. Its name is still missing.

---

## THE SEVENTH BELL — THREE ENDINGS

*Decided by accumulated faction reputation (`server/story_state.go`):*

| Ending | Condition | What the player sees |
|---|---|---|
| **The routes reopen** | default (Lamplighters lead) | OTTO: *The first train runs. Some connections remain uncertain. I'll stay with the people on the platform.* GRETA: *We'll find the missing addresses together; a timetable alone won't bring them back.* **Bell cinematic:** Otto: "For the new coast we have no safe timetable yet." Elise: "My key is now public. I travel with an ordinary ticket." |
| **The towns choose** | Circle ≥ Lamplighters | GRETA: *Each town decides on its own connection.* LINA: *The trains wait for answers. Today, I carry medicines on foot. Tomorrow, I'll ask again.* **Bell cinematic:** Greta: "Three towns, three voices. The coast waits until its people answer themselves." Elise: "Waiting is hard. This time the people who live there decide." |
| **The Brass Office changes** | Brass > 0 and Brass ≥ both others (reachable through the published ledger, Falk's testimony or Frau Kessler's public list) | VOSS: *My stamp stays with the council. Ada checks every old authorisation. I answer under my own name.* ADA: *Disputed connections remain closed for now. Even good work must wait for review. I begin today.* **Bell cinematic:** Voss: "My stamp lies on the table. My signature stays in the book." Ada: "Tomorrow we open the office. The first complaint concerns ourselves." |

*All endings close on:*

> **ELISE:** {name}, I'm coming downstairs now. Frau Berg knows my voice. This time, she should see my face too.
> **ELISE:** Three towns stand in the Atlas again. A coast appears at its edge. Its name is still missing.

**CINEMATIC — BELL**
> ELISE: The seventh bell. Now the Atlas belongs to you all.

**ELISE (V.O., final letter):** *I'm writing this letter downstairs, among the others. The key isn't on my desk. Ada has my drafts. Frau Berg has my address. She doesn't have to answer me yet. If you travel to the coast, write to me. Now you know where to find me.*

**FINAL JOURNAL CARD:** Three towns are back in the Atlas. Their people will decide on the next route. Beyond the route, a faint coastline appears with no name. Somewhere out there, someone is still waiting for a question.

**CINEMATIC — EPILOGUE** *(after the bell)*
> OTTO: The first train through all three towns. On time. Today I believe it.
> PIP: Mum! Dad! I said your names every day!
> *(one line per ending: every route open / Waldruh voted first / rule four struck out by Kessler herself)*
> FRAU BERG's answer: Come to the fountain.

FADE OUT.

---

## APPENDIX A — THE PLOT IN ONE PAGE

*Scene numbers below follow the original 30-scene order. The 2026-10-15 expansion added eleven scenes, listed after them; the scene text above is generated from the dialogue graphs and is authoritative.*

**Act I (18 original scenes: 6 story, 12 errands)**

1. A ticket with your name, signed "E.", for platform seven, closed twelve years but where your train just stopped. Names fade unless said aloud. Voss declares the ticket invalid; the player gives it up or keeps it. *(Who is E.?)*
2. The timetable's line for platform seven reads "nach W…"; Otto has known the town for twenty years and cannot say its name.
3. A woman paid for your coffee yesterday: tired, black ink on her hands, untouched tea. The receipt carries a Brass Office stamp.
4. Room three: the same woman stayed a week ago; the guest book says only "E.".
5. Fritz's Friday soup list has a line with no name; a guest always sat there.
6. Saying "two apples" aloud brings the name back: **Frau Berg**, the old teacher at Gartenstraße 7. Her seat has been empty for a week.
7. Marta was her pupil: strict, dear, read on the fountain bench every morning. Marta forgot her name for a week.
8. Greta's tea for Frau Berg's cough has sat uncollected for a week.
9. Gartenstraße 7: a blank name plate and a week-old note, "Back soon".
10. Voss listens every evening to a woman on tape: "Is anyone there? I am still here." She cannot hear him. Otto's shut office holds a hundred unsold tickets for platform seven, all signed E.
11. Voss has sat on that bench for twelve years; the lantern of platform seven is at Emil's.
12. Emil's lamp, built from that lantern, dims where a name is fading and points to the post office.
13. A week ago a woman signing "E." bought glass for an old lantern from Emil.
14. On the phone Voss reads his register: no name at Gartenstraße 7, and not the player's either.
15. At Fritz's Friday table everyone says every guest's name aloud before eating; Frau Berg's chair waits.
16. The player's bag and a black glove with fresh ink from the bench at platform seven.
17. The parcel's address holds when asked aloud: **Waldruh**. E. is **Elise**. Frau Berg's name plate fades. "Before you erase us *again*, come."
18. A train waits at platform seven. Otto says "Waldruh" aloud, writes it on the sign and sells his first ticket in twelve years.

**Acts II and III**

19. Waldruh exists behind Marta's kitchen door. A room is already rented in your name by Elise, with a heavy key on the lease.
20. The Unwritten Circle was never asked about the closure. Fritz finally names a time for dinner.
21. The connection leaves at 17:59, not 18:00: closed *from inside* with a keeper's key so no witness ever arrives.
22. The clockmill repeats the hour before midnight and eats a name each night. The sabotage is in **Elise's handwriting**.
23. Voss, feverish, remembers travelling the route his own file denies. His first doubt.
24. Ada confesses: she signed the one-week closure; the permanent order bears Elise's key **and** the Brass stamp. **You are Elise's successor and hold the key.** "Again" means you could do it too.
25. Nebelstadt. The "double Elise" was a looping tape. Voss was at the machine.
26. Two routes home: fast through Greta's garden, or slow with a clinic stop.
27. The eraser machine's ledger: **Voss authorised the permanent closure and three new coils, knowingly.** He confesses.
28. Council: "Silence means consent" is the Office's coercive rule, not the Atlas's. Step-by-step reopening. Voss drops his title.
29. Storm: only hands from all three towns can hold the signal. The Lenz family's names are remembered.
30. Elise: she closed the route to protect a children's train from stones on the track, then could not let go. Voss answers her at last: "I am here." The key goes into public custody. Three towns return; an unnamed coast appears.

**Added in the 2026-10-15 expansion**

- a1-notice: the Office's notice, *Wer schweigt, stimmt zu*, posted as rule four.
- a1-chalk: Pip's chalk wall; at the bottom, *Mama. Papa.*
- a1-bench: Frau Berg on her bench without her own name; her pupils give it back.
- a1-office-window: Frau Kessler's handwriting on every notice; Marta's guest book on her counter.
- a2-upstairs: Oma Hilde, who sees both towns and was never asked.
- a2-ink-seller: Herr Falk sells ink that never fades. It does.
- a2-forest-rails: eleven stones on the old rails; Lina was on the children's train; her parents are the Lenz family.
- a2-cellar: the keeper's key opens the mill cellar; Falk quit the Office after seeing the machine.
- b1-record-room: three coil orders in Kessler's hand, Voss's signature; she may speak at the council.
- b1-signalman: Jonas, paid for silence, says (or writes) his own name.
- b1-temptation: the player may turn the key and close the route again for one night.

## APPENDIX B — THREADS TO CHECK IN REVIEW

*Status after the Act I rebuild (commit 7dd9507): resolved items are marked **Resolved**; Acts II and III have not been reworked yet.*

- **Frau Berg** — **Resolved for Act I.** She now carries the act: named in scene 6 and given a character in scenes 7 to 9 (retired teacher, strict, fountain bench), then an empty chair in 15 and a fading plate in 17. She still never appears on screen; Elise's last line promises to visit her. Is a short cameo in the finale warranted?
- **The kettle** — **Resolved.** Removed from Act I, from the a2-apartment topic and from the finale's cause; the finale pays off the coffee Elise paid for instead (someone had to say the name aloud).
- **Platform seven** — **Resolved.** It is a real old platform, closed twelve years, not a lantern-conjured one; the only rule in Act I is the fading name.
- **Elise's motive** (stones on the track / children's train) is still introduced only in scene 30. There is no earlier hint. Consider planting one in Act II (Greta's clinic or the memory stone). Act I now plants only the woman's traces (coffee, room, glass, glove, tickets), not why she left.
- **The 17:59 closure** is explained twice: deduced in scene 21 and restated by Elise in scene 30. Intentional echo, but check it does not read as a repeated reveal.
- **The "double signal" (scene 25)** is set up only in Act III's journal introduction, never in Act II dialogue. Scene 24 ends with "the second stamp came from Nebelstadt" — a dialogue hook for the double voice would help.
- **Voss's arc** is the strongest: obstruction (1) → humanity (10, 11, 14, 18) → doubt (21, 23) → confession (25, 27) → accountability (28, 30). His "I am here" in scene 30 answers the tape from scene 10. Keep. Act I now gives him more small human beats (the umbrella, the register, "Safe journey").
- **Greta's two towns** — open. In Act I she runs Lindenhafen's pharmacy and garden; Act II still introduces her as a Waldruh resident (scenes 20 and 23). Decide whether she moved, or whether Act II needs a line that explains it.
- **Whimsy in Acts II and III** is not yet reworked: the fern, pigeons, registered household objects, personified storm and Emil's tomorrow-dated repair receipt remain (see Appendix C).
- **Why Elise paid for the coffee** is explained only in the finale (scene 30). Act I plants the paid note and Elise's other traces, but not her reason; check the finale line lands without a reminder.
- **The third ending** needs Brass reputation ≥ both other factions. Without the ledger, Brass tops out at 5 while the twelve Act II/III choices push one of the other two to at least 6, so a player who protects the ticket in scene 1 can never see it. With the ledger it needs either the publish choice in scene 28 or an all-report Act I plus a perfect 6/6 split. Act I's errand choices set flags only, so they do not change this; re-check the arithmetic if errands ever gain faction effects.
- **Act III choices** are all "reopen vs remember" with no Brass Office option except the ledger. The Brass faction therefore stops moving after the Act I story scenes unless the player holds the ledger.
- **Skipped errands** — a save already past an inserted errand may skip it, so callbacks to errand flags (for example `lantern-lit`, `berg-chair-kept`, `bread-for-empty-seat`) are always conditional and never required for sense.
- **The unnamed coast** is the sequel hook. It appears only in the final two lines.

## APPENDIX C — WHIMSY AUDIT

*Status 2026-10-15: every Tier 1 item in Acts II and III is removed (pigeons, fern, fridge, tree complaint, pigeon receipt, soup comparison, hearing theatre). The table is kept as the record of what was cut.*

*Updated for the Act I rebuild: Act I items below are marked **Removed in Act I**. Acts II and III are unchanged except that the a2-apartment kettle topic and the finale's kettle explanation are gone.*

Every magical-realist or comic-absurd detail in the dialogue, sorted by how much the plot leans on it. Counts are dialogue lines (intro, choice, after-, topics, object texts).

### Tier 1 — Decoration. Removable with no plot change.

| Motif | Lines | Where | Note |
|---|---|---|---|
| Otto's pigeons (ride without tickets, "know something", furious about the schedule, punctual pigeons are planning something) | 8 | a1-arrival, a1-market, a1-station, a2-rail-trip, b1-new-route (**Removed in Act I**: remains in a2-rail-trip and b1-new-route) | *Tauben* is one of the two A1 words introduced in a1-arrival; drop the gloss too. |
| Greta's fern (supervises, sneezes on patients, wants your insurance card, turned a stamp green, "under observation", counted among the rescued) | 14 | a2-evening-plans, a2-clinic, a2-archive, b1-new-route, b1-storm, b1-atlas | Pure running gag. Two lines carry story beats that need rewording: "the fern has stopped sneezing" (clinic, consult branch) and "one fern" in the storm headcount. |
| Emil's lamp as a daughter ("her father", "my little one", "she never listens", "flies on Tuesdays", "needs your hand") | 7 | a1-workshop (**Removed in Act I**: the lamp is now an ordinary repaired lantern) | The *function* of the lamp is load-bearing (Tier 3); only the personification is decoration. |
| Voss registers household objects (fridge has a register number, is the pillow registered, wanted to register his blanket) | 3 | a2-apartment, a2-clinic | The fridge line is Voss's reason for not repairing the door. Reword to "this door is not in the register". |
| Fritz's apples rolling north; pumpkins as big as suitcases; "the number does not taste of anything" | 3 | a1-market topic (**Removed in Act I**), a2-evening-plans topic | Optional topics only. |
| Lina's hearing theatre ("the tea is an exhibit", "Madam Chair", a pigeon as second witness that refuses to testify) | 4 | b1-witness | Comic framing of a serious scene. |
| Kettle whistles tomorrow's weather / Elise's kettle whistles yesterday's weather / "a kettle doesn't lie, it only exaggerates" | 3 | a1-cafe topic, a2-apartment topic, b1-atlas (**Removed**: no kettle in Act I, the a2-apartment topic is gone, and the finale now has cold tea) | The weather gag is separable from the name gag (Tier 2). |
| Personified things: "the storm has read the timetable", "old wood lies less often", "doors are more loyal than files", "the soup is neutral, it has no opinions" | 4 | a2-apartment, a2-rail-trip, b1-council, b1-storm | These are figures of speech, not magic. Keep or cut by taste. |
| Lina "delivers to yesterday" / "always left, never right" | 3 | a1-lost-parcel (**Removed in Act I**) | The parcel being *from* yesterday can stay without Lina being able to walk into yesterday. |

### Tier 2 — Load-bearing magic that could be swapped for a different device.

| Motif | Lines | Why the plot needs it | Cheapest replacement |
|---|---|---|---|
| **The kettle says the player's name** — **Removed.** Replaced by the paid coffee note in a1-cafe; the finale explains it as Elise paying so someone would have to say the name aloud. | 3 + finale callback | R2 setup; the finale explains it: Elise's message reached the kettle through Marta's old lantern. The bible lists *Wasserkocher* as a required finale word. | Make Marta's **old lantern** the thing that carries the name: it flickers or prints the name on the receipt. The finale line becomes "my message reached Marta's old lantern". Same mechanism, one object fewer. |
| Receipt dated tomorrow; repair receipt dated tomorrow — **café receipt Removed in Act I** (it is an ordinary receipt with a Brass Office stamp); Emil's tomorrow-dated repair receipt in Act II remains | 3 | Evidence that time is slipping, used as a clue card. | Keep one (the café receipt) and drop Emil's duplicate. |
| The lighthouse "shines dark" / the dark beam | 2 + cinematic | The eraser machine's visible effect, the storm antagonist. | Keep, but describe it as a beam that puts lanterns *out* rather than "shining dark". |
| Lamp "trembles" when the mill repeats; lamp "tugs towards the harbour lantern" | 2 | Signposting for the player. | A plain compass needle or the lamp simply dimming near erased places. |

### Tier 3 — The premise. Removing these is a different game.

- Names, addresses and routes fade unless spoken aloud, and the ink answers only to German.
- ~~Platform seven exists only while the lantern is lit.~~ **Removed in Act I:** it is a real old platform, closed for twelve years.
- One door joins Marta's café in Lindenhafen to the inn in Waldruh.
- The clockmill repeats the hour before midnight and takes a name each cycle.
- A keeper's key can close a route from inside.
- An eraser machine at the harbour, and a bell that counts silence as consent.
- Emil's lamp dims where a name is fading (this is how the player is led from scene 12 to 17 and to the harbour lantern in Act III). In Act I it is an ordinary repaired lantern with no personality; later scenes still lean on it.

### Cost note

Every dialogue line has a pre-rendered clip in `web/public/audio/dialogue/` keyed by line id. Changing a line's German means regenerating its clip. A1 lines (Act I's 18 scenes) are also bound by the lexical audit (`scripts/audit-dialogue-levels.mjs --check`), so replacement words must stay in the A1 lexicon or be glossed.
