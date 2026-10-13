# THE LANTERN ATLAS

### A screenplay reconstruction of the full game plot

Built from `web/src/data/dialogue-graphs.json`, `web/src/data/story-text.json`, `web/src/cinematic-content.ts` and `server/story_state.go`. Dialogue is the English rendering of the in-game German; signature German lines are kept where they matter. The PLAYER's lines are the course "gate" sentences the learner must actually say. Branches are marked `[CHOICE]`. Conditional lines that only appear on one branch are marked `(if …)`.

Scene-only notes for review are in `> REVIEW:` blocks.

---

## DRAMATIS PERSONAE

| | |
|---|---|
| **THE PLAYER** `{name}` | A newcomer holding a ticket signed "E." Says *Sie* to officials, *du* to everyone else. |
| **OTTO** | Stationmaster. Counts platforms. Distrusts punctual pigeons. |
| **MARTA** | Café and inn keeper. Asks every guest's name and writes it down twice. Was Frau Berg's pupil. Her café and the Waldruh inn share one door. |
| **FRITZ** | Market trader and cook. Nobody eats alone at his table. |
| **LINA** | Courier. Every letter must arrive. Numbers and labels everything. |
| **EMIL** | Inventor. His lamp has opinions. Everything "works mostly". |
| **GRETA** | Botanist. Runs Lindenhafen's small pharmacy and garden in Act I, the clinic in Act II. Her fern is under observation. |
| **ADA** | Archivist of the travelling archive. Files the truth alphabetically. Elise's former apprentice. |
| **INSPECTOR VOSS** | Brass Office. Formal *Sie*, stamps things, never raises his voice. Listens to a recording every night. |
| **ELISE** | Keeper of the Atlas. Absent for twenty-nine scenes; present only in letters, a voice on tape, and her handwriting. |
| **FRAU BERG** | Retired teacher at Gartenstraße 7; taught half the town to read, reads on the fountain bench every morning, strict about commas. Never seen: a neighbour whose name, then house, disappears. |

**The factions** (the player's choices shift reputation):
- **The Lamplighters** want every route reopened now.
- **The Unwritten Circle** want to be asked first.
- **The Brass Office** says the files are correct.

**The conceit.** Names fade unless somebody says them aloud. That is the only rule in Act I; there is no other magic there. The Atlas's ink answers only to German, so every German sentence the player speaks keeps something from fading. The route-closing key, the clockmill and the eraser belong to Acts II and III.

---

# ACT ONE — LINDENHAFEN
### "The names that fade" (A1)

**Dramatic question:** Who is "E.", who sent me a ticket for a platform closed for twelve years, and why are people being forgotten?

**Shape of the act.** Eighteen scenes on one linear path: **six story scenes** (1, 3, 6, 10, 12, 17) and **twelve everyday errands** (the rest: timetable, room, shopping, a neighbour, the pharmacy, directions, weather, a bike, a phone call, an invitation, lost property, a ticket). Each scene ends with a character pointing the player to the next. The only rule of the world is Otto's: **a name fades unless somebody says it aloud.** Errand choices set a single flag and are echoed by one callback line in a later scene; the story scenes carry the factions, items and reveals. (A save that is already past an inserted errand may skip it.)

---

### 1. EXT. LINDENHAFEN RAILWAY STATION, PLATFORM SEVEN — MORNING

*A small harbour town. Six platforms on the board; a seventh at the far end, shut for years, its old lantern lit. A train stands there. It should not.*

**CINEMATIC — ARRIVAL**
> OTTO: The train is here. On platform seven?
> OTTO: No train has stopped here in twelve years.

OTTO, stationmaster, counts the platforms out loud.

> **OTTO:** Good morning! Welcome to Lindenhafen. *(The player returns the greeting.)*
> **OTTO:** Hang on. You came in on platform seven? It has been closed for twelve years. I still light its lantern every morning. Rules are rules, train or no train.
> **OTTO:** And today your train comes in. On time! I do not like that. Your ticket, please.
> **OTTO:** It says {name}. Platform seven. At the bottom: E.
> **OTTO:** Look! Your name is fading. Here in Lindenhafen, names fade. Say your name out loud. Then it stays.
> *(The player says it. The ink goes black again.)* **OTTO:** Good. See? The ink is dark again.

*The player can examine: the ticket (the old platform, the lantern Otto lights out of habit) and the timetable board (platforms one to six).*

INSPECTOR VOSS enters: brass buttons, a ledger, very fast.

> **VOSS:** Good morning. Voss, from the Brass Office. Ticket-not-valid-platform-seven-not-on-the-timetable! Hand-it-over-please-thank-you!

**GATE — PLAYER:** *„Noch einmal, bitte.“* (Voss talks too fast. Ask him to say it again.)

> **VOSS:** Certainly. Slowly: your ticket is not valid. Platform seven is not on the timetable.
> **OTTO:** But the train was here. I was there.
> **VOSS:** The timetable is right, Otto. Always.
> **OTTO:** Your timetable, Mr Voss. My platform. Or the ticket stays here, with us.
> **VOSS:** The ticket goes into my ledger. Who gets your ticket: Otto or me?

**[CHOICE — Who keeps the ticket?]**
- **REPORT** — "Here you are, Mr Voss." → Voss: *"Thank you. Now everything is in order. A copy of my ledger, for you."* Otto: *"Now Voss has your name. Say it often."* (+Brass Office, **ledger**, bell warning)
- **PROTECT** — "The ticket stays with me." → Voss: *"I will be back. With a form."* Otto gives the player his old **key** for platform seven. (+Lamplighters)

**PLATFORM CINEMATIC** (Otto: *"Platform seven. The lantern is burning again."*)

> **OTTO:** Come along. We will read the timetable together.

**ELISE (V.O., journal letter):** *You are here. Good. Say your name out loud every day.*

> REVIEW: R1. One rule, said once, by the person who runs the platform. Voss is pure obstruction; Otto is pure habit. Nothing here is supernatural except the ink — and the ink answers only to speech.

---

### 2. INT. STATION BOARD — MORNING

*The departure board in Otto's handwriting. Six platforms, six times. A seventh line at the bottom, almost washed out.*

> **OTTO:** Good morning. It is ten to eight. The train is on time. I do not like that!
> *(if protected)* You have my key. Very good. *(if reported)* Voss has your ticket. I know the times.
> **OTTO:** Platform one, eight o'clock. Platform two, half past eight. Platform seven is on here too: six p.m. A word is written next to it. Only the W is left.
> **OTTO:** You have been looking at the board a long time. You want to travel?

**GATE — PLAYER:** *„Wann fährt der Zug?“* (Ask Otto when the train leaves.)

> **OTTO:** At ten past eight, from platform three. It arrives on time. That is not good.
> **OTTO:** I have known that town for twenty years. But I cannot say its name. It is gone.
> **OTTO:** Should the lantern be on today, or off?

**[CHOICE — Platform seven's lantern tonight]**
- **LIGHT** — "Yes, please light it." → *"At six o'clock I will light it. Maybe a train will come after all."* (flag `lantern-lit`)
- **DARK** — "No, it stays off." → *"Today it stays off. But at six o'clock I will stand there."* (flag `lantern-dark`)

> **OTTO:** You are hungry. Go to Marta at the café.

> REVIEW: A2. A faded W is the whole mystery of the next sixteen scenes. The lantern choice is echoed in scenes 4, 10, 11 and 18.

---

### 3. INT. MARTA'S CAFÉ — DAY

*A warm room. A telephone on the counter, a guest book, receipts. A paper on the counter, waiting.*

> **MARTA:** Hello! I am Marta. Welcome to the café!
> *(if protected)* You have Otto's key? He never lends it to me! *(if reported)* Voss has your ticket? He has everything.
> **MARTA:** There is a note here, for a guest: *"One coffee for {name}. Paid. — E."* You are {name}? Then this is for you.
> **MARTA:** A woman paid for you yesterday. Her name? I cannot remember it. And I ask every guest their name!
> **MARTA:** So. Your coffee is already paid for. What would you like?

**GATE — PLAYER:** *„Ich möchte einen Kaffee.“* (Order a coffee from Marta.)

> **MARTA:** One coffee. Coming right up! The woman sat over there, alone. She was very tired. Her hands were black with ink. She did not drink her tea.
> **MARTA:** Here is your receipt. Wait… a stamp? That is the Brass Office stamp. She paid with an old voucher. They have not made those for years.
> *(if reported)* Voss already has your ticket. And now this?
> **MARTA:** Does Voss get the receipt, or do you take it?

**[CHOICE — Who keeps the receipt?]**
- **REPORT** — "Voss should see the receipt." → *"I will write you a second receipt. Voss loves reading. Receipts, forms, everything."* (+Brass Office, receipt copy, flag `receipt-filed`)
- **PROTECT** — "I will take the receipt with me." → *"Voss does not need to know everything. I do. I always want to know everything!"* (+Lamplighters, **original receipt**, flag `receipt-kept`)

> **MARTA:** You are staying, aren't you? You need a room.

**ELISE (V.O.):** *Drink your coffee. It is for you.*

> REVIEW: R2. No kettle, no tomorrow-dated receipt: a woman paid, a woman was tired, a stamp is odd. The coffee is a plant — it is paid off in scene 30.

---

### 4. INT. MARTA'S GUEST ROOMS, UPSTAIRS — DAY

*Five doors. The third is slightly open. A table stained with black.*

> **MARTA:** Another coffee? You look tired. Where are you from? Where are you going? How long? Sorry. I ask a lot.
> *(if receipt filed)* The receipt is with Voss? Then I will not see it. *(if kept)* You still have the receipt? Good. *(if lantern lit)* Otto has the lantern lit? I can see it from here.
> **MARTA:** There are five rooms upstairs. Four are free. You have a bag, but no bed for today. My house is small, but there is room upstairs. And you?

**GATE — PLAYER:** *„Hast du ein Zimmer frei?“* (Ask Marta if she has a room free.)

> **MARTA:** Yes! A room costs forty euros. Room three has a bed and a table. A week ago a woman was there.
> **MARTA:** In the guest book it only says: E. No name. Her hands were black. So is the table. The tea is still there.
> **MARTA:** Will you take room three, or the quiet room five?

**[CHOICE — Which room]**
- **ROOM THREE** — "I will take room three." → *"Here is the key. The tea stays. It is for her."* (flag `room-three`)
- **ROOM FIVE** — "I will take room five." → *"The room is quiet. Room three stays for her."* (flag `room-five`)

> **MARTA:** Breakfast is at eight. Fritz has bread for us. Go to him.

> REVIEW: A3. Same woman, same ink, a week earlier: she was in town before the player and left no name. The player now sleeps either inside her trace or beside it.

---

### 5. EXT. LINDENHAFEN MARKET — MORNING

*Crates of bread, milk, eggs, fish. A chalkboard: "FRIDAY SOUP".*

> **FRITZ:** Hello! The water here costs nothing. The bread, though, costs money.
> *(if room three)* Marta says you have room three. Good! *(if room five)* Marta says you have room five. Quiet, right?
> **FRITZ:** On Friday I cook soup for everyone. Here are the names: Otto, Marta, Lina, Emil, Greta. Then comes a place. There is no name there.
> **FRITZ:** A guest always sat here. But who? I have bread, milk, eggs and fish.

**GATE — PLAYER:** *„Was kostet das Brot?“* (Ask Fritz what the bread costs.)

> **FRITZ:** Three euros. For you, two fifty. The milk costs one euro, the fish six.
> **FRITZ:** I write down every name. Every one! There is no name here. I do not like that.
> **FRITZ:** I am buying bread for six. Or seven? Will you buy one loaf or two?

**[CHOICE — Bread for the empty line?]**
- **EXTRA BREAD** — "Two, please. One is for the free place." → *"A loaf for the guest. He is hungry."* (flag `bread-for-empty-seat`)
- **OWN BREAD** — "Just one, please. For me." → *"The place stays free. I will wait."* (flag `bread-own`)

> **FRITZ:** I still have to buy more. Come back to me soon.

> REVIEW: A4. The empty line is a hole in a list. Frau Berg is **not named** here, so scene 6 can reveal her.

---

### 6. EXT. LINDENHAFEN MARKET, FRITZ'S STALL — AFTERNOON

*Friday. A soup pot. A guest list. An order slip in a crate.*

> **FRITZ:** There you are! It is Friday. Soup! On Fridays everyone eats here together.
> *(if bread for the seat)* Your bread for the empty seat is here. Thank you. *(if own bread)* Only one loaf for you? Fine, I have plenty.
> *(if receipt filed)* **VOSS:** Good afternoon. I have your receipt. And your name.
> **FRITZ:** Here are my guests. One seat is empty. A woman sits there every Friday. But who? Here is an order slip of hers: *Apples. Garden Street seven. No name.* And how many? The number has faded.
> **FRITZ:** Come on, you are cooking with me. Here are apples, for the soup. How many do you need?

**GATE — PLAYER:** *„Ich brauche zwei Äpfel.“* (Tell Fritz how many apples you need.)

*Saying the number aloud brings the memory back.*

> **FRITZ:** Two apples. Two apples… wait! Two apples every Friday. Always two! Now I remember. **Frau Berg!**
> **FRITZ:** This whole town learned to read with her. Me too. Very slowly. Her seat has been empty for a week. A week! And I did not say a word.
> **FRITZ:** Does Voss get her address, or do we write her name down?

**[CHOICE — Address or name]**
- **REPORT** — "Voss should put her address in his ledger." → *"Then she is in Voss's ledger. But here at the table her seat is still empty."* (+Brass Office, flag `crate-number-filed`)
- **PROTECT** — "I will write her name down. For Friday." → *"Frau Berg. There. Now she is written down again. Take her address: Garden Street seven."* (+Lamplighters, +Circle, **Berg's address**, flag `berg-remembered`)

> **FRITZ:** Marta knows Frau Berg well. Go and see her.

**ELISE (V.O.):** *Say her name. Then she stays.*

> REVIEW: R3. The spine's emotional anchor is revealed by counting, in a kitchen, by a man who feels guilty. She is a retired teacher — never a mystery object.

---

### 7. EXT. FOUNTAIN SQUARE — MORNING

*A stone fountain. A wooden bench. A bookmark on the seat, no book.*

> **MARTA:** There you are. Fritz was here today. He says: Frau Berg. She was my teacher!
> *(if berg-remembered)* You said her name. Thank you.
> **MARTA:** She sat here at the fountain every morning. For a week I have not known her name. And I live on her street.
> **MARTA:** You do not know Frau Berg, do you? I will tell you about her. What do you want to know?

**GATE — PLAYER:** *„Wie ist Frau Berg?“* (Ask Marta what Frau Berg is like.)

> **MARTA:** She is old and very dear. But strict! One mistake? Write it all again! Every letter of mine had mistakes. She sees everything!
> **MARTA:** Half of Lindenhafen learned to read with her. And I have not known her name for a week.
> **MARTA:** Say her name aloud, or write it on the board?

**[CHOICE — Say it or write it]**
- **SAY** — "I will say her name aloud. Frau Berg!" → *"Frau Berg. Yes. Now I can hear her. The word stays."* (flag `berg-name-said`)
- **WRITE** — "I will write her name on the board." → *"Good. I will read it aloud every day. No mistakes. She will like that."* (flag `berg-name-written`)

> **MARTA:** Greta has tea for her. Please go to Greta.

> REVIEW: A5. Frau Berg's character arrives through her pupils, with warmth and a joke. The same choice, speak or write, returns in scenes 9 and 15.

---

### 8. INT. GRETA'S PHARMACY AND GARDEN — DAY

*Herbs drying. A shelf of small bottles. A paper bag with a pale name.*

> **GRETA:** Good day! This is my pharmacy. The tea is from my garden. A bag for Frau Berg is lying here. I cannot see the name well any more.
> *(if said)* You said her name at the fountain. Good. *(if written)* Marta wrote her name down. Good.
> **GRETA:** She has not come for a week. You look tired. What is wrong?

**GATE — PLAYER:** *„Ich habe Kopfschmerzen.“* (Tell Greta what is wrong: you have a headache.)

> **GRETA:** A headache? That is not good. Drink lots of water. Not only coffee!
> **GRETA:** The tea in the bag is for Frau Berg. She is ill. She drinks it every day. A week without tea. I did not ask.
> **GRETA:** Will you take the bag yourself, or will Lina?

**[CHOICE — Who brings the tea]**
- **TAKE** — "I will take the bag to her." → *"Here you are. Morning and evening. Say her name aloud. Then it stays."* (flag `berg-bag-taken`)
- **ASK LINA** — "Lina should bring the bag." → *"Lina is fast. She knows every house. I will write the name again."* (flag `berg-bag-lina`)

> **GRETA:** You will find Lina at the post office. She knows every street.

> REVIEW: A6. Greta is Lindenhafen's pharmacist/gardener in Act I. See Appendix B on how she is the Waldruh gardener in Act II.

---

### 9. EXT. GARTENSTRASSE — DAY

*A quiet street opposite the school. Number seven: a small house, a garden, a letterbox, a blank name plate.*

> **LINA:** One moment! I still have letters to deliver. Every letter must arrive. Every one!
> *(if bag taken)* You have tea from Greta? It is for number seven. *(if ask Lina)* Greta gave me tea. For number seven.
> **LINA:** On my letter there is a house, no name. You are new here. Where do you want to go?

**GATE — PLAYER:** *„Wo ist die Gartenstraße?“* (Ask Lina where Gartenstraße is.)

> **LINA:** Gartenstraße? That is easy. Go straight ahead to the fountain. Left there. Number seven is opposite the school.
> **LINA:** There is no name on the house any more. A paper on the door says: *Back soon.* A week old. A week of back soon? That is not punctual.
> **LINA:** Will you say her name aloud, or write it down?

**[CHOICE — Knock or note]**
- **KNOCK** — "I will say aloud: Frau Berg!" → *"Nobody answers. But the street has heard the name."* (flag `berg-door-knocked`)
- **LEAVE A NOTE** — "I will write her name on paper." → *"Here is paper for you. Frau Berg, we are waiting. That is good."* (flag `berg-note-left`)

> **LINA:** I must go. Otto is looking for you at the station.

> REVIEW: A7. The first place we see where Frau Berg lived. The empty name plate is the same visual as the fading ticket in scene 1.

---

### 10. EXT. STATION, DEPARTURE BOARD AND BENCH — EVENING

*Lamp light on wet stones. At the end of the bench, a man in a coat with an old recorder; the coat covers the seat beside him.*

> **OTTO:** Good evening. No more trains today.
> *(if lantern lit)* The lantern is lit. Can you see it? *(if dark)* The lantern is dark. That is not right.
> *(if knocked)* Lina says you went to Frau Berg's house. *(if note)* Lina says you left Frau Berg a note.
> **OTTO:** The W is still on the board. See the bench? That is Voss. He comes every evening. He never travels. He has a little machine. He listens to it. His coat takes the right-hand seat.
> **OTTO:** There is only one bench. Come on.

**GATE — PLAYER:** *„Ist dieser Platz frei?“* (Ask the man on the bench if the seat is free.)

> **VOSS:** Yes. Please. The coat has no ticket. One moment, please. She is speaking now.
> **THE RECORDER (a woman's voice):** *„Ist da jemand? Ich bin noch hier.“* — Is anyone there? I am still here.
> **VOSS:** I hear her every evening. She cannot hear me. Who is she? She is not in my ledger.
> *(if reported in scene 1)* Your ticket is in my office. Your name has gone from it. *(if Berg's address filed)* Frau Berg is in my ledger now. Rules are rules.
> **OTTO:** That is my old office. Shut for twelve years. Does Voss write down the W, or do we open the office?

**[CHOICE — The W or the old office]**
- **REPORT** — "Mr Voss, write down the W." → *"Platform seven, to W. I am writing it down."* Otto: *"The W is in the ledger now. My office stays shut."* (+Brass Office)
- **PROTECT** (needs Otto's key) — "I will open the office with Otto's key."
- **SHOW LEDGER** (needs Voss's ledger) — "Mr Voss, here is your ledger. Will you come with me?" → *"I will come with you. Rules are rules."* (flag `archive-witnessed`)
- **ASK OTTO** (no key, didn't report) — "Otto, do you have another key?" → *"Of course. I always have two."*

*On any opening branch:*
> **OTTO:** The office is open. Everything is still there. My old register. And here, tickets: a hundred tickets for platform seven. Every one says E. And I never sold them. Never.

**CINEMATIC — RECORDING**
> VOICE: Is anyone there? I am still here.
> VOSS: I hear her every evening. She cannot hear me.

> **OTTO:** It is late. I will be here again in the morning.

**ELISE (V.O.):** *I am waiting. I am not far.*

> REVIEW: R4. No Waldruh yet. The player's polite question is the first thing Voss answers like a person. The hundred unsold tickets answer "who prepared this?" without naming anyone.

---

### 11. EXT. STATION, PLATFORM SEVEN IN THE RAIN — MORNING

*Rain on the platform. A bare hook where the lantern hung. An umbrella on the bench.*

> **OTTO:** Good morning. It is raining. The rain is punctual. I do not like that. Too punctual.
> **OTTO:** The lantern of platform seven is gone. Emil has it. He is repairing it.
> *(if lit)* Last night it was still bright. *(if dark)* Last night it was not bright. Today it is gone.
> **OTTO:** It is raining today. You want to leave tomorrow.

**GATE — PLAYER:** *„Wie ist das Wetter morgen?“* (Ask Otto what the weather is like tomorrow.)

> **OTTO:** Tomorrow the sun comes. The wind goes away. Today it is bad: rain and wind.
> **OTTO:** Voss was on the bench until late yesterday. He comes every evening. For twelve years. No train runs on platform seven any more.
> **OTTO:** I said: Take an umbrella. He said: Rain is not in the plan. His umbrella is still on the bench.
> **OTTO:** Will you bring Voss the umbrella, or will it stay there?

**[CHOICE — The umbrella]**
- **RETURN** — "I will bring him the umbrella." → *"He will not say thank you. But I will see it."* (flag `voss-umbrella-returned`)
- **LEAVE** — "The umbrella stays on the bench." → *"This evening he will see it. He always comes."* (flag `voss-umbrella-left`)

> **OTTO:** Go to Emil now. He has the lantern.

> REVIEW: A8. Twelve years is stated in scenes 1, 10 and 11 from three angles: the platform closed, the office shut, the man who still comes. The first piece of kindness toward Voss is optional.

---

### 12. INT. EMIL'S WORKSHOP — DAY

*Glass, tools, half a bicycle. A lamp on the bench that looks like a very old lantern with very new glass.*

> **EMIL:** Hello! Careful, there is glass here. And there. And there! I am Emil. I repair everything. Mostly.
> *(if station register)* Otto's old register? A hundred tickets signed E? That is a lot! *(if sign filed)* Voss was here today. He even writes down my coffee.
> **EMIL:** Otto sent you? The lantern is here. I made a lamp out of it. New glass, new light. But it does not work properly.
> **EMIL:** Here at the bench it is bright. Over there it goes out. Is it broken? I do not know.
> **EMIL:** Come! Look! Next to you it is bright. Everybody needs me. And you? What do you need?

**GATE — PLAYER:** *„Ich brauche eine Lampe.“* (Tell Emil you need a lamp.)

> **EMIL:** A lamp? Good. It works for you. *(if original receipt)* Your receipt from Marta! It is bright there too.
> **EMIL:** Yesterday I was on Garden Street. It went out there. Look, to the left, towards the post office: on, off, on, off. A name is fading over there. Or an address.
> **EMIL:** My clock mostly works. The lamp? Not like that. Does Voss write the lamp down, or do you take it with you?

**[CHOICE — The lamp]**
- **REPORT** — "Voss should put the lamp in his ledger." → *"Lamp number one. With a stamp, of course."* (+Brass Office, **registered lamp**, flag `lamp-registered`)
- **PROTECT** — "I will take the lamp with me." → *"It works for you. And bring it back — Otto wants his lantern!"* (+Lamplighters, **signal lamp**, flag `lamp-carried`)

> **EMIL:** Wait! Lina's bike is here too.

**ELISE (V.O.):** *Go with the light.*

> REVIEW: R5. The comic object is still comic ("works mostly") but its function is simple: it dims where a name is fading. No flying, no personality; one ordinary lantern, repaired.

---

### 13. INT. EMIL'S WORKSHOP — LATER

*Lina's bike on a stand. An order book open on the bench.*

> **EMIL:** Hello! I find everything. Just not right away. The bike is Lina's. It was broken.
> *(if lamp carried)* You have my light? Good. *(if registered)* Voss wrote my light in his book.
> **EMIL:** I am almost done. Soon! You are collecting Lina's bike? It is not ready yet.

**GATE — PLAYER:** *„Wann ist das Fahrrad fertig?“* (Ask Emil when Lina's bike will be ready.)

> **EMIL:** This afternoon. The bike mostly works. The repair costs twenty euros.
> **EMIL:** Here is my book. Everything is written here. A week ago a woman bought glass for an old lantern. She paid cash.
> **EMIL:** Signature: E. Her hands were black. I know her. But her name is gone.
> **EMIL:** Will you pay for the bike now, or shall I write it down?

**[CHOICE — Pay]**
- **PAY NOW** — "I will pay now." → *"Thanks! Twenty euros. Lina gets a finished bike today."* (flag `bike-paid`)
- **PAY LATER** — "Please write it in the book." → *"No problem. Lina pays on Friday."* (flag `bike-on-account`)

> **EMIL:** Marta has a phone call for you. Go to the café.

> REVIEW: A9. The glass for the old lantern is bought a week ago by E. — the same woman, the same ink. It quietly says she prepared platform seven's lantern before the player's train.

---

### 14. INT. MARTA'S CAFÉ, THE TELEPHONE — DAY

*A heavy black telephone on the counter. Marta pretends not to listen.*

> **MARTA:** The telephone! Otto has called. You have to call him back. The station number: three, four, seven. I am not listening. Only a little. Here, take the telephone.
> **MARTA:** It takes a moment. Then a man answers.
> **VOSS (on the phone):** Lindenhafen station, Voss. Whom would you like to speak to?

**GATE — PLAYER:** *„Kann ich bitte Otto sprechen?“* (Ask on the phone to speak to Otto.)

> **VOSS:** Mr Otto is at platform seven. He is coming soon.
> *(if receipt filed)* I have the receipt from the café. Thank you. *(if kept)* You took the receipt with you. Fine.
> **VOSS:** I spell: V, O, S, S. Understood?
> **MARTA:** Everyone here knows that, Mr Voss!
> **VOSS:** I have the register in front of me. Gartenstraße seven. There is no name there. That is not normal. Your name is not in the register either.
> **VOSS:** Do you want to spell your name now?

**[CHOICE — The register]**
- **SPELL** — "Yes, Mr Voss. I will spell my name." → *"Thank you. Slowly, please. I am writing it down."* Marta: *"Now your name is in the register."* (flag `name-in-register`)
- **REFUSE** — "No, thank you, Mr Voss. The name stays with me." → *"As you wish. The register will wait."* (flag `name-withheld`)

> **MARTA:** The telephone is quiet again. Go to Fritz. He has a question for you.

> REVIEW: A10. Voss is a voice on a line, courteous and procedural. The question is whether a person's name belongs in an office register or in their own mouth — the Act's theme at its smallest.

---

### 15. EXT. FRITZ'S STALL — EVENING

*Twelve glasses on a long table. A chair at the end with nothing in front of it.*

> **FRITZ:** There you are! I am cooking on Friday. Every Friday at seven there is soup. Everyone comes: Otto, Marta, Lina and Greta. Unfortunately Emil is often late. His machines!
> **FRITZ:** I have twelve glasses. Eleven guests. One glass is too many. Always.
> **FRITZ:** You are new here. That is good. Will you come on Friday at seven?

**GATE — PLAYER:** *„Ja, ich komme gern.“* (Accept Fritz's invitation.)

> **FRITZ:** Wonderful! Please bring bread. *(if bought two)* You already bought bread. Very good! *(if said her name)* You have already said her name. Good.
> **FRITZ:** With us, everyone says all the names aloud before we eat. That way the names stay at my table.
> **FRITZ:** That seat over there is Frau Berg's. She never missed it. Until now.
> **FRITZ:** Does the seat stay free, or will you sit there?

**[CHOICE — Frau Berg's chair]**
- **KEEP** — "The seat stays free. I will write her name." → *"A card with her name. That way her seat waits for her."* (flag `berg-chair-kept`)
- **SHARE** — "I will sit there and say her name." → *"Frau Berg. Now her name is here again. You eat for two. I like that!"* (flag `berg-chair-shared`)

> **FRITZ:** See you Friday! Your bag is at the post office. Lina has it.

> REVIEW: A11. The remedy for the rule of Act I is a dinner table: say everyone's name before you eat. Nobody explains it as magic.

---

### 16. INT. POST OFFICE, LOST PROPERTY — DAY

*A long table of bags and coats, each with a numbered tag in Lina's handwriting.*

> **LINA:** There you are! I write everything down. Number one: bag. Number two: glove.
> *(if bike paid)* My bike is running again. Thanks! *(if on account)* My bike is running again. Emil is writing it down.
> **LINA:** A bag came off the train. Eleven bags are lying on the table. Five are green. Two are old. One is big.
> **LINA:** With me everyone only gets their own bag. What colour is your bag?

**GATE — PLAYER:** *„Meine Tasche ist blau.“* (Tell Lina your bag is blue.)

> **LINA:** Blue and small? Here it is! Bag found, one of two. I am writing it down.
> **LINA:** And this here: a black glove. It was lying on the bench at platform seven. The glove is old, but the ink is new. There is a tag on the glove. The name is gone.
> **LINA:** Will you take the glove, or does it stay here?

**[CHOICE — The glove]**
- **TAKE** — "I will take the glove with me." → *"Good. I will write: glove, taken. Whose it is? I do not know."* (flag `glove-taken`)
- **LEAVE** — "It stays here. It does not belong to me." → *"I will put it on top of the table. Then everyone sees it at once."* (flag `glove-left`)

> **LINA:** Wait a moment. I am still looking for your post.

> REVIEW: A12. Evidence without exposition: a glove with fresh ink on the bench where Voss listens. By now the player has met all of E.'s traces: coffee, room, glass, glove.

---

### 17. INT. POST OFFICE, PARCEL COUNTER — DAY

*A parcel. Its address fades while being read.*

> **LINA:** There you are! I have a parcel for you. For {name}. Sender: E. Like on your ticket.
> *(if lamp carried)* Look at your lamp! By the parcel it is very bright. *(if registered)* Voss brought your lamp. With three forms. *(if glove)* Your hands are black. The same ink is here too.
> **LINA:** But the address… Look! The ink is fading. I read it and it is gone again. This cannot happen. Every letter arrives. Every one!
> **LINA:** Here is the address. I can only see a W. Hold on. I will read it again. Slowly.

**GATE — PLAYER:** *„Wie ist die Adresse?“* (Ask Lina for the address on your parcel.)

*The ink holds.*

> **LINA:** The address? W… A… L… D… You asked out loud. And now the ink is holding! **Waldruh.** W for Waldruh. Like on Otto's timetable!
> **LINA:** There is a letter in the parcel. It is very short: *„Ich bin Elise. Ich warte in Waldruh.“*
> **LINA:** Elise. E. is Elise. And here is another letter. For Frau… Frau…
> *(if chair kept)* Fritz says her name every Friday. Frau Berg! Garden Street seven. Yes.
> **LINA:** I was there today. Now even the seven on her plate is fading. The people in her street say: who lives there?
> **LINA:** Do I send Voss the address, or does the letter stay with you?

**[CHOICE — Who has Elise's address]**
- **REPORT** — "Voss gets the address. For his ledger." → *"I will take it to Voss today. Then Waldruh is in his ledger, in black and white."* (+Brass Office, flag `waldruh-address-public`)
- **PROTECT** — "The letter stays with me. Only with me." → *"Your letter, your post. Voss gets nothing."* (+Lamplighters, +Circle, flag `elise-letter-private`)

*(after the choice)* **CINEMATIC — ERASURE**
> LINA: Her sign was here. It said Frau Berg.
> LINA: And now the seven is going too.

> *(if berg-remembered)* **LINA:** Her name is still written down at Fritz's. It stays.
> **LINA:** Go to Otto. A train is waiting this evening. There is one more sentence in the letter. Very small:
> **LINA:** *„Bevor du uns wieder auslöschst, komm.“* — Before you erase us again, come.

**ELISE (V.O., letter):** *I am Elise. I am waiting in Waldruh. Before you erase us again, come.*

> REVIEW: R6. A single reveal: the address holds when asked aloud — the rule of the act shown at its most concrete. Frau Berg's plate fading beside it keeps the cost visible. "Erase us *again*" is the hook, explained in scene 24 and resolved in scene 30.

---

### 18. EXT. LINDENHAFEN STATION, PLATFORM SEVEN — EVENING

*Eighteen hundred, to the minute. A train stands at platform seven. Its windows are lit.*

> **OTTO:** Eighteen hundred. To the minute. A train is standing at platform seven. Twelve years without a train, and now one is standing here.
> *(if lit)* The lantern is on. Like every morning. *(if dark)* The lantern is off. But the train is here. *(if protected)* You still have my key. Good.
> **VOSS:** The train is not in the plan, Otto.
> **OTTO:** I know. It is too punctual. I do not believe in it. But I sell tickets. That is my job. Where would you like to go?

**GATE — PLAYER:** *„Eine Fahrkarte nach Waldruh, bitte.“* (Buy a ticket to Waldruh.)

> **OTTO:** The word was gone. Now it is back. I write it on the sign. Aloud: *Waldruh.* Platform seven, six o'clock, to Waldruh.
> **VOSS:** That is not in the plan. I see nothing. I am not writing anything down either. Safe journey.
> **OTTO:** This is my first ticket in twelve years. Single, or return?

**[CHOICE — The ticket]**
- **SINGLE** — "Single, please." → *"Single to Waldruh. Ten euros. Platform seven, carriage one."* (flag `ticket-single`)
- **RETURN** — "Return, please." → *"Eighteen euros. Then we will see each other again. Punctually!"* (flag `ticket-return`)

> **OTTO:** All aboard, please! It is six o'clock. The train is leaving. Elise is waiting in Waldruh.

**ELISE (V.O.):** *The train is waiting. So am I.*

**ACT ONE CLIFFHANGER (journal):** The letter finally names a person and a place: Elise. Waldruh. Beneath it, very small: "Before you erase us again, come." At Gartenstraße 7, nobody remembers Frau Berg any more. And on platform seven, a train is waiting.

> REVIEW: The act ends on an act of speech, not a revelation: Otto says a town's name aloud and a platform opens. Voss, who would have stopped it in scene 1, now watches and writes nothing.

---

**CINEMATIC — TRAVEL**
> OTTO: All aboard. The next place is waiting for you.

---

# ACT TWO — WALDRUH
### "The village that lost an hour" (A2)

**Dramatic question:** Who closed the route, and why does everybody pretend they agreed?

*Waldruh is on no map. According to the Brass Office the village "voluntarily ceased to exist". It lies in the forest around an old clockmill whose waterwheel turns but whose clocks cannot agree. Every night the mill plays the same hour, and afterwards a name is missing.*

---

### 19. INT. MARTA'S KITCHEN DOOR / THE WALDRUH INN, UPSTAIRS — DAY

*Marta is holding a door. On one side: her Lindenhafen café. On the other: an inn in Waldruh. The door sticks.*

> **MARTA:** Quick, {name}, come in! I'm holding the door. Today it leads to Waldruh. Five minutes ago it led into my kitchen. The coffee is still on the other side.
> **MARTA:** The café and inn share this door. When it sticks, I can't get into either.
> **VOSS:** Good afternoon. I am inspecting this building. Please hold the doorframe steady.
> *(if address public)* Thank you for the address from Lindenhafen. It brought me straight here.
> *(if letter private)* **MARTA:** He came through my kitchen. Without knocking. I expected more paperwork from an inspector.
> **VOSS:** This file says Waldruh vanished voluntarily. A strange sentence for a village full of people.
> **MARTA:** The people want breakfast. For a vanished village, we have remarkably good potatoes.
> **VOSS:** The refrigerator has a register number. This door does not. That means I cannot alter its frame.
> **VOSS:** A request from the tenant authorizes the repair. Who lives behind this door, in Room 7?
> **MARTA:** There's a lease on the board. It has your name, {name}. I haven't even offered you a room.

*Examine the housing board: Lease for Room 7. Tenant: {name}. Elise paid a year's rent in advance. Two addresses, one door. Valid for three months. A heavy key with a small lantern hangs from the paper.*

> **VOSS:** The lease names you as the tenant, {name}. You can request the repair.
> **MARTA:** For three months. Yet you only arrived today. I've never seen your room key before.
> **VOSS:** The lock is stuck. My tools are ready. If you request the repair, I can begin.

**GATE — PLAYER:** *„Könnten Sie das bitte reparieren?“*

> **VOSS:** Request accepted. First the stamp, then the screw. The frame is holding now.
> **MARTA:** It opens! My coffee is still there. I've never had such a short journey.
> **VOSS:** The rent is paid for a year. By Elise. Three months before your arrival. Excuse me. I need to compare the dates. My register begins with your ticket.
> **MARTA:** He's holding the lease upside down. Usually he only does that with my menus.
> **MARTA:** An open door lets anyone travel through. Do we leave it open, or ask the neighbours first?

**[CHOICE]** *(from here on every choice is RESTORE = Lamplighters vs CONSULT = Circle)*
- **RESTORE** — "We leave it open. Lindenhafen should see Waldruh." → Marta wedges a chair in the door. Lina bursts through: *"Post for Waldruh! Three letters, all from yesterday."*
- **CONSULT** — "We ask the neighbours here first." → Marta hangs a "knock first" note. Fritz: *"I heard knocking. Is there a meeting? I've brought soup."*

> **MARTA:** Fritz wants to set a table for everyone here again. But he won't name a day. Whenever anyone asks for a date, he stirs the soup. Even when the pot is empty.

**ELISE (V.O.):** *The window faces the forest. I often left it open. The room has been waiting for you since I paid the rent. I don't know whether you want to wait for me.*

> REVIEW: R7. Bureaucratic comedy. Note the key on the lease is the Keeper's key — planted here, explained in Scene 24. Nobody says "successor" yet.

---

### 20. EXT. LANTERN SQUARE / HERB GARDEN — EVENING

*An argument. A fern under observation. A calendar where every date reads "postponed".*

> **LINA:** Tonight we send the signal. When Lindenhafen sees our light, they'll know Waldruh is still here.
> **GRETA:** And what do we tell the people living here? Once again, they're last to hear what happens to their village.
> **FRITZ:** Ah, {name}. Take a bowl. While everyone's eating, nobody argues. Usually.
> **GRETA:** I'm Greta. We grow our food here. The fern supervises everything. Keep your distance; he sneezes.
> **GRETA:** We belong to the Unwritten Circle. Some of us appear in no file. All of us sit at Fritz's table.
> **GRETA:** Nobody asked us before the route closed. The paper still says: voluntary.
> **FRITZ:** We ate here that evening. At six. I went to fetch more bread. Afterwards the route was gone.
> **GRETA:** Ever since, he sets the table every evening. But he never invites anyone for a definite time.
> *(if berg-remembered)* Frau Berg wrote to us. Her house is gone. She still has her name. We'll set a place for her.
> *(if number filed)* **FRITZ:** The woman from Lindenhafen, with the apples. I want to write to her. I can't remember her name.

> **LINA:** My letters have to leave today.
> **GRETA:** Everyone can come tomorrow. Fritz, it's your decision whether your table will be waiting for us.
> **FRITZ:** There's nothing in my calendar tomorrow. But if I invite everyone, I'm promising we'll see each other again.

**GATE — PLAYER:** *„Hast du morgen Zeit?“*

> **FRITZ:** Tomorrow? Yes. I have time for you. And for everyone else too.
> **FRITZ:** Half past six. Six is too much. I want to hear the clock without seeing the empty station.
> **GRETA:** I'll write it down. Lina, this time the invitation goes to everyone.
> **LINA:** Good. But Lindenhafen is waiting for a sign we're still here. We can send the light tonight.
> **FRITZ:** Do we send a sign tonight, or wait until everyone here has said what they want?

**[CHOICE]**
- **RESTORE** → Lanterns on. *"Lindenhafen is answering! Three short flashes. Marta still remembers our signal."*
- **CONSULT** → Greta writes down everyone's wishes. *"People are coming from the forest with chairs. They've brought their names. Today they won't be left outside."*

> **FRITZ:** Tomorrow, half past six. I'll put out the little bowls too. The children should find us here. Oh, and Otto is looking for you. He found an old timetable under the station.

**ELISE (V.O.):** *Fritz always left one place free at his table. He called it my place. Today I don't know whether I'm still allowed to sit there.*

> REVIEW: R8. The Circle was never asked. Fritz committing to a time is the scene's emotional turn; the "six o'clock" detail sets up 17:59.

---

### 21. EXT. WALDRUH STATION — 17:59

*A whistle. A train with its doors already shut. The station clock has not reached six.*

> **OTTO:** To the platform, {name}! Hear that whistle? Today we'll see this train for ourselves.
> **OTTO:** The old timetable lists a connection to Nebelstadt. Departure: 18:00. The ticket says the same.
> **OTTO:** The station clock hasn't reached six. It should be waiting. Its doors are already closed.
> **VOSS:** Your ticket, please. I cannot skip this inspection.
> **OTTO:** Mr Voss, you can see it's leaving!
> **VOSS:** Valid. Departure: 18:00. You are here on time. The train should …
> **OTTO:** Gone. We were right outside the door. It left without us.
> **VOSS:** My file says no train runs here. I just saw one. I will write down both.
> **OTTO:** The paint is peeling off the old sign. The destination is underneath. The time is missing.

*Examine the route sign: new plaque "There was never a route here." Under the paint: "Connection to Nebelstadt." Departure time blank. A small lantern burned into the wood.*

> **OTTO:** I'll open the ticket window. Your ticket stays here beside the station clock.
> **VOSS:** I confirm that you were here before departure. For the report I need your account.
> **OTTO:** Waldruh station, window one. The ticket is valid. Why couldn't you continue your journey?

**GATE — PLAYER:** *„Ich habe meinen Anschluss verpasst.“*

> **OTTO:** Missed connection. I'll compare your ticket with the clock. It stopped as the train departed.
> **OTTO:** 17:59. Your ticket says 18:00. Anyone following the ticket arrives to find an empty platform.
> **OTTO:** The sign now says: closed from inside, with a keeper's key. Leaving early keeps witnesses away.
> **VOSS:** Closed from inside. My file omits that. It also omits your arrival on time.
> **VOSS:** I know that whistle. It's on my recording. Every evening I hear a train that supposedly doesn't exist.
> **OTTO:** I can adjust the station clock. But the timetable changes with it. The false time stays visible only until we correct it.
> **OTTO:** Do we adjust the clock for passengers, or leave the error visible until more witnesses arrive?

**[CHOICE]**
- **RESTORE** → *"One minute forward. The clock is running again. The pigeons are furious; their evening schedule is ruined. Nebelstadt, 18:00. Tomorrow people will be waiting here."*
- **CONSULT** → Otto copies both times. Lina: *"Tomorrow there'll be people here who can no longer be left out of the report."*

> **OTTO:** A keeper's key doesn't close an ordinary door. Bring your key. We need to know what it can do.
> **OTTO:** Emil's tools vanished for a night. Afterwards a thank-you note appeared beside them. Perhaps the two are connected.

**ELISE (V.O.):** *You were there on time. Don't let anyone tell you otherwise. I know how long one minute can last.*

> REVIEW: R9. Deduction scene. Voss links the whistle to his recording — second crack in his certainty.

---

### 22. INT. THE CLOCKMILL — NIGHT, THE HOUR BEFORE MIDNIGHT

*A waterwheel. A memory stone listing names from the last lantern festival; one spot polished smooth.*

> **EMIL:** Careful, {name}! The floor is solid. Sometimes it's the hour standing on it that disappears.
> **EMIL:** Every night the mill repeats the hour before midnight. Outside, morning comes. Here, the same hour begins again.
> **EMIL:** After every cycle, a name disappears from the stone. Yesterday I knew the person. Today I know the gap.
> **EMIL:** My repair receipt is dated tomorrow. The coffee on it was definitely from yesterday.
> **EMIL:** My tools vanished for a night. That was when the mill began repeating this hour. They came back clean. With a thank-you note. Even my worst pair of pliers looked lovely.
> **EMIL:** The manual hangs from the clock. Compare it with the stone. We're missing more than a cog here.

*Examine the manual: red lever stops the mill; blue connection links it to the route signal. The blue connection is cut. Two lines in the margin in a different hand.*

> **EMIL:** Red lever, blue connection. The diagram looks simple. The mill doesn't always follow it.

**GATE — PLAYER:** *„Kannst du mir die Anleitung erklären?“*

> **EMIL:** The red lever stops the mill. The blue connection links it to the route signal. Someone disconnected it. No break. A clean cut.
> **EMIL:** The margin says: *"Disconnect only if necessary. Thank you for the tools."*
> **EMIL:** Put the lease beside it. The same loop on the E. The manual and thank-you note are in Elise's handwriting.
> **EMIL:** Elise disconnected it. With my pliers. They were on the table. I heard nothing.
> **EMIL:** She cleaned my pliers. A name is still missing from the stone. What am I supposed to do with her thanks?
> **EMIL:** The lever stops the next cycle. But the hour gets overwritten. We must preserve its missing names first.
> **EMIL:** Do we stop the mill now, or let the village preserve the names before this hour disappears?

**[CHOICE]**
- **RESTORE** → Red lever. *"For the first time, the hour ends. One name returns. The other patch stays smooth. I can't remember who it was for."*
- **CONSULT** → Emil holds the mill by hand; Greta and the village read every name aloud, even the faded ones. Then the lever.

**CINEMATIC — CLOCKMILL**
> EMIL: The clock is running again. But we are missing an hour.
> EMIL: Not all the names come back. We need the old records.

> **EMIL:** Greta has a patient with lantern fever. He talks about a journey that never happened. He was found at the old rails last night. He had been waiting for a train.

**ELISE (V.O.):** *Yes, that is my handwriting. I cleaned the pliers. I can't simply write the name back onto the stone. I owe Emil more than thanks.*

> REVIEW: R10. First hard evidence that Elise is the saboteur. The restore branch has a real cost (a name lost for good) — good.

---

### 23. EXT. CLINIC GARDEN — DAY

*A queue. A fern that sneezes on every patient. Seed packets labelled with old addresses.*

> **GRETA:** Stay behind the line, {name}. The fern examined everyone in the queue.
> **GRETA:** Lantern fever. They watch vanished tracks for too long. Their eyes keep searching when their legs can't go on.
> **GRETA:** My most difficult patient wanted to register his blanket. He didn't want to sleep.
> **VOSS:** *(in a cot)* Nothing is wrong with me. I am merely tired. Please do not record a diagnosis.
> **GRETA:** We found him at the old station. Wet shoes, cold hands. He was holding a blank ticket.
> **VOSS:** I have never travelled this route. My file records every day at the office.
> **GRETA:** In his fever he named three stops. With house numbers. None appears in his file.
> **GRETA:** My seed packets have old addresses. Let's compare them. Perhaps he needs someone to listen, rather than another file.

*Examine: six seed packets, old addresses along the route. Greta's note: the patient named three of them. And a blue garden gate that is on no packet.*

> **GRETA:** Three addresses match. He also described a blue garden gate.
> **VOSS:** I must return to the office. If I keep reading the file, this will make sense.
> **GRETA:** He can barely stand. Today he needs your advice.
> **VOSS:** You have seen both, {name}. My file, and me. What do you advise?

**GATE — PLAYER:** *„Sie sollten sich ausruhen.“*

> **VOSS:** Rest. Very well. Please leave the packets here.
> **VOSS:** Behind the blue gate, there was plum cake. The hostess always cut one slice more than there were guests.
> **VOSS:** I travelled there before the closure. My file says the route never existed. I was there.
> *(if Berg's address)* One packet carries Frau Berg's address. Her apples were the best on the whole route.
> **VOSS:** I used this file to turn people away. I told them their memories were wrong.
> **GRETA:** Put the file down, Mr Voss. You don't have to prove anything today.
> **GRETA:** These addresses could reach the old lanterns. But Voss hasn't given us permission. Do we reach them today, or wait until Voss can speak for his own memories?

**[CHOICE]**
- **RESTORE** → Greta reads the addresses. Three lanterns light along the tracks. Voss, asleep: *"The blue gate … one more slice of cake. For the guest who comes later."*
- **CONSULT** → The packets stay beside his file. Voss: *"I'd like to read them myself. When I can stand again."* Greta: *"The fern has stopped sneezing. For the first time today."*

> **GRETA:** Someone wrote that false file. The travelling archive holds the old orders. Ada works there. Today we need an answer, rather than another copy.

**ELISE (V.O.):** *I remember the blue gate. Everyone got a slice of cake there for the journey home. Please look after Voss.*

> REVIEW: R11. Voss's doubt becomes personal: his own body remembers what his file denies. The gentlest scene in the game.

---

### 24. INT. THE TRAVELLING ARCHIVE (A RAILWAY CARRIAGE) — DAY

*Drawers. A memorial stone outside bearing the first closure order. Voss, on doctor's orders, sits and listens.*

> **ADA:** You're looking for a signature. I have the paper here. I wanted to wait until you left.
> **ADA:** I'm Ada. I file the truth alphabetically. At least that tells me which drawer I'm hiding it in.
> **VOSS:** I have been told to rest. I will listen. I brought the file.
> **ADA:** Stay, Mr Voss. I don't want to sign something again after hearing only one side.
> **ADA:** I was Elise's apprentice. She asked for one week. I signed the first closure. My name is here.
> **ADA:** I wanted to show her she could trust me. I didn't ask the Circle. I had time to.
> **ADA:** My order is on the memorial stone. Beneath it: *ask the residents*. I wrote that sentence myself.

*Examine the stone: "Temporary closure of the route, for one week. Signed: Ada, the Keeper's apprentice. Under the seal, very small: 'Ask the residents.'"*

> **VOSS:** One week. My file says: permanent. Both dates bear the same seal.
> **ADA:** The first paper is here. The second is underneath. All these years, I never took it out. I owe you more than dates.

**GATE — PLAYER:** *„Können Sie mir das genauer erklären?“*

> **ADA:** My order lasted one week. The second was permanent. My signature opened the door for it.
> **ADA:** The permanent order bears two marks: the lantern from Elise's key and the Brass Office stamp.
> **VOSS:** Our stamp is genuine. My file omits this order. That does not make it any less real.
> **ADA:** Elise used the key from inside. Afterwards she passed it on. You've already seen its mark. Room 7. The key attached to your lease.
> **ADA:** The register says: *the Keeper's successor*. Beneath it, your name, {name}. Elise gave you her key.
> **ADA:** *"Before you erase us again, come."* She means the key you carry. It can close the route again.
> **ADA:** I'm putting down my pen. My name stays on the paper. I won't cross it out.
> **ADA:** I'm Ada. If you like, we can say *du* now. I've hidden behind forms long enough.
> **VOSS:** I will keep to *Sie*. I'll take my file with me. This time to examine it, rather than prove it right.
> **ADA:** The second stamp came from Nebelstadt. Do you go now, or first gather witnesses to both orders?

**[CHOICE]**
- **RESTORE** — "I'm going now. Elise must explain to me herself." → Otto: *"Leaving on time matters less today."*
- **CONSULT** — "I'll bring witnesses. No order should hear only one side again." → Ada comes along, *"as the woman whose name is on the first order."* Lina fetches Greta and the others: *"Three witnesses, one fern. No empty seats this time."*

**CINEMATIC — CONFESSION**
> ADA: One week, I said. After that I stopped asking.
> ADA: You may say *du*. My signature stays here, where everyone can see it.

> **ADA:** The records for the second stamp are in Nebelstadt. The seventh bell leaves us little time. But this time you know what you carry.

**ELISE (V.O.):** *I gave you the key before I gave you the truth. That was wrong. You are allowed to choose differently from me.*

**ACT TWO CLIFFHANGER (journal):** Elise closed the route from inside, then hung the key on your lease. In Ada's register: the Keeper's successor. Your name follows. The key is in your pocket. And Waldruh is wondering what you will do with it.

> REVIEW: R12 — the mid-point reversal. The player is not just investigating the erasure; they hold the instrument of it. Note Voss explicitly refuses *du* here so his offer in Scene 28 lands.

---

# ACT THREE — NEBELSTADT
### "The promise in the mist" (B1)

**Dramatic question:** Can the towns reopen the route without erasing someone else?

*A signal harbour, an old observatory, a machine humming under a grey tarpaulin. Every time the great bell rings, a name in Waldruh grows quieter. The Brass Office counts missing replies as consent. With the seventh stroke the closure becomes permanent.*

---

### 25. INT. HARBOUR POST OFFICE — THE HEARING — DAY

*A table. A tape reel. A pigeon that refuses to testify. Marta in the witness chair without her apron.*

> **LINA:** The hearing begins. Two reports, the same voice. Elise's voice came from the harbour and the observatory simultaneously.
> **ADA:** I'm taking the minutes. Alphabetically, unless anyone objects.
> **LINA:** Marta brought tea to the harbour that night. Her statement covers only what she personally saw and heard.
> **MARTA:** Lina, I feel like I'm in court. Can I at least keep my tea?
> **LINA:** No. The tea is an exhibit.
> **LINA:** Every answer goes on record today. So even Marta will use formal address during this hearing.
> **MARTA:** As you wish, Madam Chair. I've even taken my apron off.
> **VOSS:** The Brass Office is attending as an observer. I will listen. I will not interrupt.
> **LINA:** The tape is here. Marta is there. We must keep their evidence separate.
> **LINA:** Marta, your cup is back beside you. We're ready to hear your statement.

**GATE — PLAYER:** *„Könnten Sie beschreiben, was Sie gesehen haben?“*

> **MARTA:** I put the teapot beside the lantern. Through the fog, I heard a woman. *"Is anyone there? I'm still here."* Then a cough. Then the whole thing again from the start.
> **MARTA:** By the third cough, I knew. Even the tiny pause was identical.
> **LINA:** An old recording. Elise wasn't standing in two places in the fog.
> **ADA:** The harbour and observatory repeat the same tape. Two connections, one voice.
> **MARTA:** Someone stood at the machine beside the lantern. When I approached, the words on my tea list vanished.
> **MARTA:** I couldn't see his face. But his stamp sounded like yours, Voss. Twice: clack, clack.
> **VOSS:** I was standing at the machine. Your statement is correct.
> **LINA:** Then your name stays in the record. Even while we wait for your explanation.
> **LINA:** Publish her statement immediately, or send the Circle a checked copy first?

**[CHOICE]** *(REOPEN = Lamplighters / REMEMBER = Circle)*
- **REOPEN** → Posted at the harbour. Voss: *"I will answer here. Before these same people."*
- **REMEMBER** → Marta checks every word *"so nobody can dismiss it as a rumour."* Greta reads it to the Circle.

> **LINA:** Next appointment: Otto on the railway quay. Two plans, one garden, bad mood.

**ELISE (V.O.):** *You listened to Marta before deciding. Back then, I decided first. The voice on the tape is mine. I'm not in two places. I'm here, behind a closed door.*

> REVIEW: R13. Voss admits presence at the machine but not yet what he did. Two-step confession across scenes 25 → 27.

---

### 26. EXT. RAILWAY QUAY, HARBOUR CHART — DAY

*Otto with a pen. Greta holding the map down. A fern between them.*

> **OTTO:** Two plans for the route to Waldruh. One is good. The other is Greta's.
> **GRETA:** I heard that, Otto. So did the fern.
> **OTTO:** My line is straight and forty minutes faster. Every journey matters to the people of Waldruh.
> **GRETA:** Your straight line goes right through my garden. These beds hold the last seeds from vanished homes. Their addresses survive on the packets.
> *(if berg-remembered)* Frau Berg's rhubarb grows there too. Nothing is left of her house, only this bed.
> **OTTO:** The clinic needs supplies. I can't offer them a garden as a timetable.
> *(if Lamplighters ≥ 4)* The Lamplighters have already ordered rails, by the way. Without asking me. Typical.
> **GRETA:** Then draw a route that brings us home without leaving something behind again.

*Examine the chart: a straight line through the garden; a curve along the road; next to the curve a dot rubbed out three times. In Otto's hand: "Clinic?"*

> **OTTO:** I'm holding the pen; Greta's holding the map down. This won't bring our route back.

**GATE — PLAYER:** *„Wir müssen eine Lösung finden, die für alle passt.“*

> **OTTO:** For everyone. Then I suppose I should show you my second drawing.
> **OTTO:** The curve follows the road. Forty minutes longer. Nobody gets much to celebrate.
> **GRETA:** And a stop at the clinic?
> **OTTO:** The stop is for people who can't walk. That's why I could never quite erase that dot.
> **OTTO:** You're right. My second drawing shouldn't have been hidden beneath the first.
> **GRETA:** Both routes cost something. This time, we can see the price before anyone signs.
> **OTTO:** Which line stays on the map?

**[CHOICE]**
- **REOPEN** — the straight line. *"Three beds must move; the clinic gets no stop."* Greta: *"Some only grow here. I'll copy their addresses, at least."*
- **REMEMBER** — the curve. *"Every journey takes longer. At the clinic, I'll stop without anyone waving."* Greta: *"The Circle will tend the beds. You've given us work, {name}."*

> **OTTO:** Wait. Do you see the lighthouse? It's shining *dark*. That isn't even possible.
> **GRETA:** The beam points at Waldruh. Emil says he knows the machine behind it. He's waiting at the repair dock.

**CINEMATIC — DARK BEAM**
> LINA: The beam takes the names with it. We must stop it.

*(The storm flag is set here; weather turns for scenes 27–29.)*

**ELISE (V.O.):** *You saw what each route costs. Back then, I didn't want to see my own price. Soon I'll tell you why I closed the door. I'll stay here while I do.*

> REVIEW: R14. Mediation scene; neither branch is "right". Otto hiding his own second drawing mirrors Ada hiding the second order.

---

### 27. EXT. REPAIR DOCK — THE ERASER MACHINE — DUSK, WIND RISING

*A grey tarpaulin. Under it, a machine that works perfectly. Its maintenance ledger.*

> **EMIL:** {name}! I need help. This time, I'll put the job in writing before we start.
> **EMIL:** We're rebuilding the harbour signal to carry names back.
> **EMIL:** The machine under the tarpaulin works perfectly. Unfortunately. That's exactly the problem.
> **EMIL:** Three new coils. Someone has cared for this machine longer than for my lighthouse.
> **VOSS:** This installation belongs to the Brass Office. Anyone working on it needs a permit.
> **EMIL:** Then approve it. You've got a stamp, after all.
> **VOSS:** Today, I'm keeping my stamp down. First, you'll see the maintenance ledger.
> *(if Voss's ledger)* **EMIL:** Do you still have the ledger Voss gave you in Lindenhafen? Keep it handy.

*Examine: "Maintenance ledger, harbour eraser machine. Three new coils, all ordered after the closure. Approved with two stamps and one signature." Pencilled in the margin of the last page: "Did she call again today?"*

> **EMIL:** Work starts today. Pay: soup. I won't downplay the danger: we're working on an eraser machine.

**GATE — PLAYER:** *„Bevor ich anfange, möchte ich die Bedingungen klären.“*

> **EMIL:** Yes. Before you touch a screw, this ledger stays open.
> **EMIL:** Three new coils, all ordered after the closure: the second of March, the ninth of July, the first of December. Every time the same stamp, pressed twice. Clack, clack.
> *(if ledger)* And now your ledger from Lindenhafen. The same signature. The same crooked stamp.
> **VOSS:** I personally authorised the permanent closure. My signature is beneath it.
> **VOSS:** And all three eraser coils. I paid to keep the machine running.
> **VOSS:** The register said "quiet". Outside, homes were missing. I chose to believe the register.
> **VOSS:** At night I heard: *"Is anyone there? I'm still here."* Then I closed the ledger.
> **VOSS:** When I ordered the third coil, I knew about the missing names. I ordered it anyway.
> **EMIL:** I installed them. Your work order said "lighthouse". Not one word about names.
> **VOSS:** You carried out my order. I concealed what your work would do.
> **EMIL:** Then sign exactly that. And I'll read every line before I install another coil.
> **EMIL:** We can shut down the new coils today, or explain the conversion first. Which risk do we face first?

**[CHOICE]**
- **REOPEN** → Power off. Voss holds the lamp while Emil pulls the coils. *"The beam weakens. The old wiring still hums. For the rest, I need people willing to answer."*
- **REMEMBER** → The plan is posted at council; Emil guards the switch. Voss: *"Put my name beside it. Anyone who loses something while we wait must know where to find me."*

**CINEMATIC — LEDGER**
> VOSS: The permanent closure. The three coils. I signed both.
> VOSS: Leave the book open. On my page too.

> **EMIL:** Ada is calling the council for tomorrow morning. Everyone has to come. Really everyone.
> **VOSS:** I will bring my ledger and open it in front of everyone. It has been shut long enough.

**ELISE (V.O.):** *Voss said what his signature authorised. My answer is still missing. My key closed the route from inside. Without it, his stamp would never have reached that door. You owe me no forgiveness for that.*

> REVIEW: R15. Voss's full confession is on the common path, before the choice — correct per the bible. The machine "always works" vs Emil's "works mostly" is the scene's thematic joke.

---

### 28. INT. THE ARCHIVE — COUNCIL SESSION — MORNING

*Seven chairs, one empty. A pot of soup. The council board: "Open now!", "Ask first!", "Soup from twelve". Beneath: an old Brass Office rule — WER SCHWEIGT, STIMMT ZU. Silence means consent.*

> **ADA:** The session is open. Seven chairs, eight opinions and a pot of soup.
> **FRITZ:** The soup is neutral. It has no opinions, only potatoes.
> **ADA:** The board carries the Office's rule: "Silence means consent." The machine follows that rule. Every silence registers as a vote for closure.
> **LINA:** Fritz! You said nothing for three seconds, and the beam got brighter!
> **FRITZ:** No! I mean: no. I was only chewing.
> **GRETA:** The empty chair can't object, Ada. That doesn't mean it can agree.
> **OTTO:** The Lamplighters say: open it. Today, all of it, right now.
> **GRETA:** The Circle says: nothing opens before every town has been asked. That is exactly what was missing last time.
> **VOSS:** I haven't come to chair this meeting. I authorised the closure, and I will answer your questions.
> **VOSS:** My name is Voss. The title helps nobody here. If you agree, we can use *du*.
> *(if ledger)* Put my ledger on the table. Keep the signature visible while I speak.
> *(if Circle ≥ 5)* **LINA:** The Circle has brought the old objections. Forty pages. Back then, nobody read them.
> **ADA:** An entire route at once, with everyone answering immediately. Is there a smaller first step, {name}?

**GATE — PLAYER:** *„Ein Kompromiss wäre, die Strecke schrittweise zu öffnen.“*

> **OTTO:** Step by step. One station after another. I can live with that. Slowly.
> **GRETA:** Before each step, we ask the town. A no goes on record too.
> **ADA:** The objections are on record now. Hear that? The beam is weakening.
> **VOSS:** And the authorisations must be readable. A stamp alone must never replace an answer again.
> **FRITZ:** My yes is in the record. Now I can finally swallow this potato.
> **ADA:** One step has to come first. The first train or the first vote?

**[CHOICE]**
- **REOPEN** — the first train, Lamplighter-escorted. Otto: *"Anyone afraid of the first train gets a seat beside me."*
- **REMEMBER** — the first vote, in every town. Lina carries the question and the clinic's post.
- **PUBLISH THE LEDGER** (needs Voss's ledger) — *"It goes on public display, and we review every decision."* Voss: *"Nobody has to beg for an explanation at my office door again."* (+2 Brass Office, +1 Circle, flag `ledger-published`)

> **ADA:** Do you hear the wind? The storm is coming sooner than the next bell.
> **GRETA:** Promises are easy in the dry. Now we'll see whether ours holds in the rain.

**ELISE (V.O.):** *The empty chair belonged there. Someone my decision took away should have been sitting in it. You didn't treat their silence as a yes. The Office did, and I allowed it. When the last bell rings, I want to give my answer in front of you.*

> REVIEW: R16. The only scene with a third, item-gated option, and the only route to the "Brass Office reformed" ending in practice. Voss's *Sie → du* arc completes here.

---

### 29. EXT. LIGHTHOUSE STEPS, SIGNAL HARBOUR — THE STORM — NIGHT

*Water between the garden beds. The signal flickers; the dark beam presses against it "like a hand over a mouth". A red boat with a family still out beyond the beds.*

> **GRETA:** The water is already between the beds. The fern is safe. Now the people.
> **OTTO:** The storm has read the timetable. It's arriving on time. Suspicious.
> **EMIL:** The signal is flickering. The beam presses against it like a hand over a mouth.
> **MARTA:** I've got tea, blankets and a list. Greta, who's still missing?
> **GRETA:** The family from Waldruh, with the red boat. I can still see their light beyond the beds.
> **MARTA:** I wrote their names down. There's only a wet streak left. Yesterday I could read them.
> **VOSS:** The office storehouse is open. Sandbags, ropes, lamps. No forms.
> *(if Brass ≥ 3)* My staff are coming too. You brought us evidence instead of rumours.
> *(if Circle ≥ 3)* **LINA:** The Circle is here. Its people know every way to the clinic, even the ones on no map.
> *(if Lamplighters ≥ 3)* **OTTO:** The Lamplighters are here, with ladders and tools. You kept your word. Now we keep ours.
> *(if ledger published)* **GRETA:** People have read Voss's ledger. Now they ask him for ropes instead of avoiding him.
> **OTTO:** I'll climb to the lantern. But someone must hold the ladder, and my people are already in the water.
> **LINA:** The Circle knows the paths to the garden. We need hands on the ropes.
> **VOSS:** My storehouse is open. But lamps alone won't pull anyone out of the water.
> **GRETA:** The ladder is slipping. The ropes are here. Everyone needs hands from another group.
> **GRETA:** Working separately, we don't even have enough hands for the ladder.

**GATE — PLAYER:** *„Wir können das Problem nur gemeinsam lösen.“*

> **OTTO:** Voss, hold the ladder with me. Lina, pass the rope to Greta. Emil climbs.
> **EMIL:** Keep your hands there. Lindenhafen, Waldruh, Nebelstadt. Now the signal holds!
> **MARTA:** Lenz! The Lenz family! Now I remember.
> **GRETA:** Then I'll call their names. They need to know we still remember who they are.
> **GRETA:** The signal is tipping again. Water is rising in the garden. Where do we take the strong ropes first?

**[CHOICE]**
- **REOPEN** — ropes to the signal; families out across the greenhouse roof. *"The signal holds. The Lenz family waves from the hall. Their red boat drifts away without them."* (flag `signal-secured`)
- **REMEMBER** — ropes to the garden; Emil holds the signal by hand. *"Eighteen people, two dogs, one fern. All dry. Emil needs a new support; the old one's in the water."* (flag `families-sheltered`)

**CINEMATIC — STORM**
> GRETA: The last person is in the dry. Now we hold the light.
> OTTO: Three towns answer. No voice comes from the tape.

> **GRETA:** The wind is turning. Do you see the light up in the observatory? No lamp has burned there for years.
> **LINA:** Mail for you. Sender: the old signal room. Signed: E.
> **MARTA:** We'll stay here with the families. Go upstairs, {name}. This time, Elise must open her own door.

**ELISE (V.O.):** *I can see your lamps. One climbs the ladder; the others head towards the garden. You stay together after arguing. I stayed alone because I wanted every argument to end. The door is open. The tea is ready. I'm afraid, but I'm staying here.*

> REVIEW: R17. The one scene where the faction reputation visibly pays off in who shows up. "No voice comes from the tape" is the recorder finally going silent, answered by living voices.

---

### 30. INT. THE OBSERVATORY — THE OLD SIGNAL ROOM — DAWN

*A desk with a pot of tea gone cold. A brass instrument showing three routes with blank metal at its edge. A pile of draft letters to {name}; the earliest are only a few words long. A key on the desk between two chairs.*

ELISE, finally. Tired. Black ink on her hands.

> **ELISE:** {name}. I left the door open. Even so, your knock frightened me.
> **ELISE:** And now all I can think of is: would you like some tea? I'm afraid it's already cold.
> **ELISE:** My letters to you are beside my drafts. Here, I crossed out every word that sounded like an excuse.
> **ELISE:** The letter said: *"Before you erase us again, come."* I was afraid of this key.
> **ELISE:** And later: *"I'm not in two places."* I was here. Behind a door I had closed myself.
> **ELISE:** At first, the ink held only short sentences. As you listened to people, I could write whole letters again.
> **ELISE:** Now the key lies between us. I'll leave it there while I tell you everything.
> **ELISE:** Stones lay on the tracks. The next train was meant to take children to the clinic. I wanted to stop it departing. At 17:59, I closed the route from inside. For one week.
> **ELISE:** I call it my first mistake: I took people's choice away to keep them safe.
> **ELISE:** After a week, I wanted everyone to accept my solution first. The doors stayed closed.
> **ELISE:** When Voss made the closure permanent, I didn't object. I let him carry on what I had started.
> **ELISE:** I paid for your coffee at Marta's. Then someone had to say your name aloud.
> **ELISE:** You hadn't met the towns yet. I hoped you would open their doors. I wanted mine to stay closed.
> *(if letter private)* You kept the letter. Today, Ada gets its drafts too. Even the sentences I crossed out.
> *(if address public)* You gave the Office my address. I was still hiding then. Today, everyone knows where I am.

VOSS, in the doorway.

> **VOSS:** Elise. I heard your voice every night. Now I'm done waiting for a recording.
> **ELISE:** Then answer me. Here, in front of the open door.
> **VOSS:** I am here.
> **ELISE:** I'm coming downstairs with you today. First, let's look at what lies beside the key.
> **ELISE:** The seventh bell is about to ring. This page has room for a rule that binds me too.
> **ELISE:** Last time, I spoke only after everything closed. What do we agree before someone must decide alone again?

**GATE — PLAYER (writes):** *„Wir vereinbaren, dass wir Probleme frühzeitig besprechen.“* — We agree to discuss problems early.

> **ELISE:** I write "we". Then I pause. I leave room for your name beside mine.
> **ELISE:** The ink holds. A stop reappears on the Waldruh line. And another towards Lindenhafen.
> *(if ledger published)* **VOSS:** I'll write the sentence in my ledger too. The ledger that now hangs in the town hall.
> **ELISE:** The key stays in front of me. I won't take it upstairs again.
> **ELISE:** "Again" meant the key you inherited. My guilt doesn't make you guilty.
> **ELISE:** The key needs a permanent, public place. Who will keep it: the council or the Circle?

**[CHOICE — Who keeps the key?]**
- **REOPEN** — the council, in public custody. Ada takes it; Elise lays her drafts beside it. *"Tomorrow, I'll answer their questions. Even if the first train leaves without me."*
- **REMEMBER** — the Circle, for the towns. Greta takes it; Lina records where it is. *"No more hidden drawers. The fern gets no key. I get a chair beside the people whose questions I must answer."*

---

## THE SEVENTH BELL — THREE ENDINGS

*Decided by accumulated faction reputation (`server/story_state.go`):*

| Ending | Condition | What the player sees |
|---|---|---|
| **The routes reopen** | default (Lamplighters lead) | OTTO: *The first train runs. Some connections remain uncertain. I'll stay with the people on the platform.* GRETA: *We'll find the missing addresses together; a timetable alone won't bring them back.* **Bell cinematic:** Otto: "For the new coast we have no safe timetable yet." Elise: "My key is now public. I travel with an ordinary ticket." |
| **The towns choose** | Circle ≥ Lamplighters | GRETA: *Each town decides on its own connection.* LINA: *The trains wait for answers. Today, I carry medicines on foot. Tomorrow, I'll ask again.* **Bell cinematic:** Greta: "Three towns, three voices. The coast waits until its people answer themselves." Elise: "Waiting is hard. This time the people who live there decide." |
| **The Brass Office changes** | Brass > 0 and Brass ≥ both others (practically requires publishing the ledger) | VOSS: *My stamp stays with the council. Ada checks every old authorisation. I answer under my own name.* ADA: *Disputed connections remain closed for now. Even good work must wait for review. I begin today.* **Bell cinematic:** Voss: "My stamp lies on the table. My signature stays in the book." Ada: "Tomorrow we open the office. The first complaint concerns ourselves." |

*All endings close on:*

> **ELISE:** {name}, I'm coming downstairs now. Frau Berg knows my voice. This time, she should see my face too.
> **ELISE:** Three towns stand in the Atlas again. A coast appears at its edge. Its name is still missing.

**CINEMATIC — BELL**
> ELISE: The seventh bell. Now the Atlas belongs to you all.

**ELISE (V.O., final letter):** *I'm writing this letter downstairs, among the others. The key isn't on my desk. Ada has my drafts. Frau Berg has my address. She doesn't have to answer me yet. If you travel to the coast, write to me. Now you know where to find me.*

**FINAL JOURNAL CARD:** Three towns are back in the Atlas. Their people will decide on the next route. Beyond the route, a faint coastline appears with no name. Somewhere out there, someone is still waiting for a question.

FADE OUT.

---

## APPENDIX A — THE PLOT IN ONE PAGE

**Act I (18 scenes: 6 story, 12 errands)**

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
