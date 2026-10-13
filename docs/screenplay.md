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
| **MARTA** | Café and inn keeper. Her kettle whistles tomorrow's weather. Her café and the Waldruh inn share one door. |
| **FRITZ** | Market trader and cook. Nobody eats alone at his table. |
| **LINA** | Courier. Delivers to yesterday "if necessary". Labels everything. |
| **EMIL** | Inventor. His lamp has opinions. Everything "works mostly". |
| **GRETA** | Botanist and clinic keeper. Her fern is under observation. |
| **ADA** | Archivist of the travelling archive. Files the truth alphabetically. Elise's former apprentice. |
| **INSPECTOR VOSS** | Brass Office. Formal *Sie*, stamps things, never raises his voice. Listens to a recording every night. |
| **ELISE** | Keeper of the Atlas. Absent for seventeen scenes; present only in letters, a voice on tape, and her handwriting. |
| **FRAU BERG** | Never seen. A neighbour whose name, then house, disappears. |

**The factions** (the player's choices shift reputation):
- **The Lamplighters** want every route reopened now.
- **The Unwritten Circle** want to be asked first.
- **The Brass Office** says the files are correct.

**The conceit.** The Atlas forgets whatever nobody says aloud. Its ink answers only to German. Every German sentence the player speaks restores something.

---

# ACT ONE — LINDENHAFEN
### "The platform that should not exist" (A1)

**Dramatic question:** Who is "E.", who sent me a ticket to a town that does not exist, and why are people being forgotten?

---

### 1. INT./EXT. LINDENHAFEN RAILWAY STATION, PLATFORM SEVEN — MORNING

*A small harbour town. Six platforms on the board. A seventh platform exists only where a lantern is lit. Pigeons sleep on the roof. A train stands at platform seven.*

**CINEMATIC — ARRIVAL**
> OTTO: The train is here. Welcome!
> OTTO: See the lantern? Platform seven does not exist.

OTTO greets the PLAYER.

> **OTTO:** Good morning! Welcome to Lindenhafen.
> *(The player returns the greeting. If they get it wrong:)* It is morning. Good morning!
> **OTTO:** Your train is here. On platform seven. The pigeons got here before you today.
> **OTTO:** I have six platforms. Six every morning. But you are standing on platform seven. The lantern is on. Now the platform is here.
> **OTTO:** Your ticket, please. I need your name. Your name is here. There is an E below.
> **OTTO:** Your name is fading. The ticket remains.

*The player can examine: the ticket (`{name}`, platform seven, "E.") and the noticeboard (platforms one to six, no seven).*

INSPECTOR VOSS enters. Brass buttons. A ledger.

> **VOSS:** Good morning. I am Voss. Your ticket is not valid. Hand it over, please.

**GATE — PLAYER:** *„Können Sie das bitte wiederholen?“* (Voss talks too fast. Ask him to say it again.)

> **VOSS:** Of course. Your ticket is not valid. Platform seven is not on the plan.
> **OTTO:** The train is here. We are here.
> **VOSS:** The timetable is correct. Your ticket is not.
> **OTTO:** Then the ticket stays with me.
> **VOSS:** Who gets your ticket: Otto or me?

**[CHOICE — Who keeps the ticket?]**
- **REPORT** — "Here you are. The ticket is yours." → Voss keeps the ticket, hands the player his **ledger**. *"Read my ledger. Everything is here."* Otto: *"Your ticket is gone. His ledger stays."* (+Brass Office, **bell warning**)
- **PROTECT** — "Ticket? I do not have a ticket." → Voss leaves: *"No ticket? I will be back."* Otto gives the player the **Lamplighter key**: *"My key opens platform seven. For you."* (+Lamplighters)

> **OTTO:** Marta has a coffee for you.

**ELISE (V.O., letter):** *For {name}. You are here. Good. The lantern knows you. I am waiting. E.*

> REVIEW: Reveal R1. Voss's first beat is pure obstruction. Note the "bell" mechanic starts here: reporting to Voss advances the seventh-bell clock.

---

### 2. INT. MARTA'S CAFÉ — DAY

*A kettle whistles. It is whistling the player's name.*

> **MARTA:** Come in! The kettle is saying your name. It knows the weather. Names are new. You are {name}? Then stay with me.
> *(if reported)* Voss has your ticket? Come over here.
> *(if protected)* You have Otto's key? Then you are staying!
> **MARTA:** A woman sat here yesterday. She was alone. She has already paid for your coffee. Her name? I cannot remember it any more.
> **MARTA:** The receipt is waiting too. No coffee yet.

*Optional: "What was the woman like?" — "She was tired. Her hands were black. Her tea is still there. She is not coming. She knew your name. She knew me."*

**GATE — PLAYER:** *„Ich möchte einen Kaffee, bitte.“* (Order a coffee.)

*The receipt prints itself the moment the order is spoken.*

> **MARTA:** Your coffee. Now the receipt is complete. She paid yesterday. This says tomorrow.
> **MARTA:** Here is Voss's seal. He was not here yesterday. Only her.
> **MARTA:** Will Voss get the receipt, or will you take it?

**[CHOICE — Who keeps the receipt?]**
- **REPORT** → Marta copies it for Voss. *"Now the kettle has stopped saying your name."* (+Brass Office, receipt copy)
- **PROTECT** → *"Take it with you. Your name is here. Listen! The kettle is saying {name} again."* (+Lamplighters, original receipt)

> **MARTA:** Fritz has apples with the seal.

**ELISE (V.O.):** *The coffee is for you. Stay with Marta. She asks for my name. My name is E.*

> REVIEW: R2. The kettle knowing the name is a plant paid off in Scene 18.

---

### 3. EXT. LINDENHAFEN MARKET SQUARE — DAY

*A soup pot. A guest book. A crate of apples, each stamped with a number and a brass seal.*

> **FRITZ:** Hello! My soup is ready. But who is missing? We eat together on Fridays. Nobody eats alone here.
> **FRITZ:** Every name is in the guest book. One is missing here.
> **FRITZ:** Number seven needs apples. One? Two? I cannot remember. I know her. She always sits here.
> *(if receipt filed)* **VOSS:** Number seven is here. The ledger is correct.
> **FRITZ:** The apples have numbers and Voss's seal.

*Examine: crate ("Two apples. Number 7. A seal. No name."), the garden at the edge of town ("On the house: number 7. No name.")*

**GATE — PLAYER:** *„Ich brauche zwei Äpfel.“*

*Saying the number aloud brings the memory back.*

> **FRITZ:** Two! Now I remember. Two apples! Mrs Berg buys two apples every Friday. For the soup.
> **FRITZ:** Her house has a garden. The number is seven. Mrs Berg. Her name is missing. Her seat is empty.
> **FRITZ:** Will we write down her name, or give Voss her number?

**[CHOICE]**
- **REPORT** → *"Voss gets the number. I remember her name again. The soup is ready. Her seat stays empty."* (+Brass Office)
- **PROTECT** → *"Mrs Berg is here again. We will keep her seat for her. Here is her address."* (+Lamplighters, +Circle, **Berg's address**; flag `berg-remembered` echoes through the whole game)

> **FRITZ:** Otto is waiting at the station. A name is missing there too.

**ELISE (V.O.):** *Mrs Berg never eats alone. Fritz knows that. Say her name. It must stay. E.*

> REVIEW: R3. Frau Berg is the "neighbour whose place stays empty" — the emotional anchor of the spine.

---

### 4. EXT. STATION, DEPARTURE BOARD AND BENCH — EVENING

*The board now has seven platforms. Platform seven's slip reads only "To W…". At the end of the bench, a man with an old recorder.*

> **OTTO:** There were six platforms this morning. Now there are seven. There is only a W here. Nothing more.
> **OTTO:** I have known the town for twenty years. Its name is missing.
> **OTTO:** That man comes every evening. He always sits there. His old machine speaks. He only listens.
> **OTTO:** He is sitting alone. His coat is on the free seat.
> **OTTO:** There is a seat. Voss looks towards you.

**GATE — PLAYER:** *„Ist dieser Platz frei?“*

> **VOSS:** Yes. The seat is free. Please. You are from platform seven.
> **VOSS:** One moment, please. She is speaking now.
> **OTTO:** A woman. She is speaking quietly.
> **THE RECORDER (a woman's voice):** *„Ist da jemand? Ich bin noch hier.“* — Is anyone there? I am still here.
> **VOSS:** I hear her every evening. She cannot hear me. This does not belong in my ledger.
> **OTTO:** Will the W stay in the ledger, or will we open the door?

**[CHOICE — the sign or the old door]**
- **REPORT** — "Mr Voss, write the sign down." → *"W. That is what it says."* Otto: *"The letter stays. The name does not come back."* (+Brass Office)
- **PROTECT** (needs Lamplighter key) — "I will open the door with Otto's key."
- **SHOW LEDGER** (needs Voss's ledger) — "Mr Voss, here is your ledger. Will you come with me?" → Voss: *"I will come with you. Today I will read your register."* (flag `archive-witnessed`)
- **ASK OTTO** (no key, didn't report) — "Otto, do you have another key?" → *"Another key? Yes. I have two."*

*All three opening branches:*
> **OTTO:** The door is open. My old register is still there. A hundred tickets for seven. There is an E on every one.

**CINEMATIC — RECORDING**
> VOICE: Is anyone there? I am still here.
> VOSS: I hear her. Every night. She does not hear me.

**ELISE (V.O.):** *My voice is still here. Listen. I need an answer. Not a number. E.*

> REVIEW: R4. Voss's hidden humanity. The voice is Elise; she is never named in Act I. This is also the only scene with four choice branches.

---

### 5. INT. EMIL'S WORKSHOP — DAY

*A lamp is running away from its maker.*

> **EMIL:** Watch out! The lamp is running away. Not again! I am Emil. I made her. She never listens.
> **EMIL:** She flies on Tuesdays. That is how it works. Mostly. But today she is running away. From me! Her father!
> **EMIL:** You have a problem. She is looking at you. She knows.
> **EMIL:** In the evening she looks for old addresses. The houses are gone.
> *(if station register)* There is an E in Otto's register. There is one on my lamp too.
> *(if sign filed)* Voss was here. She went straight under the table.

*Examine the workbench label: "Lamp. Works: mostly. On Tuesdays it flies. It looks for old addresses."*

> **EMIL:** She is waiting at your feet. Do you need a lamp?

**GATE — PLAYER:** *„Ich brauche eine Lampe.“*

> **EMIL:** She is staying with you! She never stays that long with me.
> **EMIL:** Now she is bright. And now she is going to the post office. An address must be missing there. Come, let us follow.
> *(if original receipt)* Your receipt! The lamp is making your name bright again.
> **EMIL:** Voss wants a number. To me she is still my little one. Will Voss get her number, or will my lamp go with you?

**[CHOICE]**
- **REPORT** → *"Lamp number one hundred. Voss is pleased. She is going to the post office. Voss is following. He has a form."* (+Brass Office, registered lamp)
- **PROTECT** → *"She works for you. Come home safe, little one. She flies on Tuesdays. She needs your hand then."* (+Lamplighters, **signal lamp**)

**ELISE (V.O.):** *The lamp is not looking for me. She is looking for you. Go with her. Leave the light on. E.*

> REVIEW: R5. Comic-object scene. Emil's "the lamp was made from an old light from platform seven" (optional topic) is a nice seed.

---

### 6. INT. POST OFFICE, PARCEL COUNTER — DAY

*A parcel. Its address fades while being read.*

> **LINA:** You are {name}? Good. Here is your parcel. Please sign. It is from yesterday. I deliver to yesterday too.
> **LINA:** Only the address will not stay. The ink is fading. I read it. It disappears. I read it again.
> **LINA:** There is an E here. Like on your ticket. This is for you.
> *(if lamp carried)* Your lamp is staying by the parcel. She will not move.
> *(if lamp registered)* **VOSS:** Lamp number one hundred is here. Your address is still missing.
> **LINA:** Mrs Berg gets post too. Her house is there. Still.
> **LINA:** The parcel is for you. The address is missing. Do you have a question?

**GATE — PLAYER:** *„Wie ist die Adresse?“*

*The ink holds.*

> **LINA:** W… A… L… D… Now the ink is holding. Waldruh. It says Waldruh here.
> **LINA:** The town is missing from my map. It is not missing here.
> **LINA:** There is a letter in the parcel. E is Elise. She is writing to you. *"I am Elise. I am waiting in Waldruh."*
> *(if receipt kept)* Here is black ink. It stays on my hand.
> **LINA:** Mrs Berg's number is fading! Her post is still here.
> **LINA:** Will Voss get the address, or will it stay between us?

**[CHOICE]**
- **REPORT** → *"Waldruh will be in Voss's ledger too. And here, with you."* (+Brass Office, flag `waldruh-address-public`)
- **PROTECT** → *"The letter stays with you. Voss will not get an address. He can ask me. Your post belongs to you."* (+Lamplighters, +Circle, flag `elise-letter-private`)

**CINEMATIC — ERASURE**
> LINA: Wait. Mrs Berg's house number was here.
> LINA: Now the number is missing. The house is gone too.

> **LINA:** Her house is gone. I still have her post in my hand.
> *(if berg-remembered)* Mrs Berg is in your guest book. Her name is still there.
> **LINA:** Otto is waiting by the train. There is one more sentence in the letter:
> **LINA:** *„Bevor du uns wieder auslöschst, komm.“* — Before you erase us again, come.

**ELISE (V.O.):** *I am Elise. I am waiting in Waldruh. Before you erase us again, come.*

**ACT ONE CLIFFHANGER (journal):** The letter finally names a person and a place: Elise. Waldruh. Beneath it, very small: "Before you erase us again, come." On platform seven, a train is waiting that is in no timetable.

> REVIEW: R6. "Erase us *again*" is the act-break hook; the word "again" is not explained until Scene 12 and resolved in Scene 18.

---

**CINEMATIC — TRAVEL**
> OTTO: All aboard. The next place is waiting for you.

---

# ACT TWO — WALDRUH
### "The village that lost an hour" (A2)

**Dramatic question:** Who closed the route, and why does everybody pretend they agreed?

*Waldruh is on no map. According to the Brass Office the village "voluntarily ceased to exist". It lies in the forest around an old clockmill whose waterwheel turns but whose clocks cannot agree. Every night the mill plays the same hour, and afterwards a name is missing.*

---

### 7. INT. MARTA'S KITCHEN DOOR / THE WALDRUH INN, UPSTAIRS — DAY

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

> REVIEW: R7. Bureaucratic comedy. Note the key on the lease is the Keeper's key — planted here, explained in Scene 12. Nobody says "successor" yet.

---

### 8. EXT. LANTERN SQUARE / HERB GARDEN — EVENING

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

### 9. EXT. WALDRUH STATION — 17:59

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

### 10. INT. THE CLOCKMILL — NIGHT, THE HOUR BEFORE MIDNIGHT

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

### 11. EXT. CLINIC GARDEN — DAY

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

### 12. INT. THE TRAVELLING ARCHIVE (A RAILWAY CARRIAGE) — DAY

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

> REVIEW: R12 — the mid-point reversal. The player is not just investigating the erasure; they hold the instrument of it. Note Voss explicitly refuses *du* here so his offer in Scene 16 lands.

---

# ACT THREE — NEBELSTADT
### "The promise in the mist" (B1)

**Dramatic question:** Can the towns reopen the route without erasing someone else?

*A signal harbour, an old observatory, a machine humming under a grey tarpaulin. Every time the great bell rings, a name in Waldruh grows quieter. The Brass Office counts missing replies as consent. With the seventh stroke the closure becomes permanent.*

---

### 13. INT. HARBOUR POST OFFICE — THE HEARING — DAY

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

> REVIEW: R13. Voss admits presence at the machine but not yet what he did. Two-step confession across scenes 13 → 15.

---

### 14. EXT. RAILWAY QUAY, HARBOUR CHART — DAY

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

*(The storm flag is set here; weather turns for scenes 15–17.)*

**ELISE (V.O.):** *You saw what each route costs. Back then, I didn't want to see my own price. Soon I'll tell you why I closed the door. I'll stay here while I do.*

> REVIEW: R14. Mediation scene; neither branch is "right". Otto hiding his own second drawing mirrors Ada hiding the second order.

---

### 15. EXT. REPAIR DOCK — THE ERASER MACHINE — DUSK, WIND RISING

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

### 16. INT. THE ARCHIVE — COUNCIL SESSION — MORNING

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

### 17. EXT. LIGHTHOUSE STEPS, SIGNAL HARBOUR — THE STORM — NIGHT

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

### 18. INT. THE OBSERVATORY — THE OLD SIGNAL ROOM — DAWN

*A desk. A kettle. A brass instrument showing three routes with blank metal at its edge. A pile of draft letters to {name}; the earliest are only a few words long. A key on the desk between two chairs.*

ELISE, finally. Tired. Black ink on her hands.

> **ELISE:** {name}. I left the door open. Even so, your knock frightened me.
> **ELISE:** And now all I can think of is: would you like some tea? Unfortunately my kettle always whistles yesterday's weather.
> **ELISE:** My letters to you are beside my drafts. Here, I crossed out every word that sounded like an excuse.
> **ELISE:** The letter said: *"Before you erase us again, come."* I was afraid of this key.
> **ELISE:** And later: *"I'm not in two places."* I was here. Behind a door I had closed myself.
> **ELISE:** At first, the ink held only short sentences. As you listened to people, I could write whole letters again.
> **ELISE:** Now the key lies between us. I'll leave it there while I tell you everything.
> **ELISE:** Stones lay on the tracks. The next train was meant to take children to the clinic. I wanted to stop it departing. At 17:59, I closed the route from inside. For one week.
> **ELISE:** I call it my first mistake: I took people's choice away to keep them safe.
> **ELISE:** After a week, I wanted everyone to accept my solution first. The doors stayed closed.
> **ELISE:** When Voss made the closure permanent, I didn't object. I let him carry on what I had started.
> **ELISE:** My message reached the kettle through Marta's old lantern. That's why it knew your name. The last connection.
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

1. A ticket with your name, signed "E.", for a platform that does not exist. Voss confiscates or Otto protects. *(Who is E.?)*
2. A woman paid for your coffee yesterday; the receipt is dated tomorrow. The kettle knows your name.
3. Fritz has forgotten Frau Berg's name. Saying "two apples" aloud brings it back. Her seat stays empty.
4. Voss listens every night to a woman on tape: "Is anyone there? I am still here." She cannot hear him.
5. Emil's lamp follows erased addresses. It leads to the post office.
6. The parcel's address holds when asked aloud: **Waldruh**. E. is **Elise**. Frau Berg's house vanishes. "Before you erase us *again*, come."
7. Waldruh exists behind Marta's kitchen door. A room is already rented in your name by Elise, with a heavy key on the lease.
8. The Unwritten Circle was never asked about the closure. Fritz finally names a time for dinner.
9. The connection leaves at 17:59, not 18:00: closed *from inside* with a keeper's key so no witness ever arrives.
10. The clockmill repeats the hour before midnight and eats a name each night. The sabotage is in **Elise's handwriting**.
11. Voss, feverish, remembers travelling the route his own file denies. His first doubt.
12. Ada confesses: she signed the one-week closure; the permanent order bears Elise's key **and** the Brass stamp. **You are Elise's successor and hold the key.** "Again" means you could do it too.
13. Nebelstadt. The "double Elise" was a looping tape. Voss was at the machine.
14. Two routes home: fast through Greta's garden, or slow with a clinic stop.
15. The eraser machine's ledger: **Voss authorised the permanent closure and three new coils, knowingly.** He confesses.
16. Council: "Silence means consent" is the Office's coercive rule, not the Atlas's. Step-by-step reopening. Voss drops his title.
17. Storm: only hands from all three towns can hold the signal. The Lenz family's names are remembered.
18. Elise: she closed the route to protect a children's train from stones on the track, then could not let go. Voss answers her at last: "I am here." The key goes into public custody. Three towns return; an unnamed coast appears.

## APPENDIX B — THREADS TO CHECK IN REVIEW

- **Frau Berg** is the spine's emotional anchor (scenes 3, 6, 8, 11, 14, 18) but she never appears. Elise's last line promises to visit her. Is that enough payoff, or does she deserve a cameo at the end?
- **The stones on the track / children's train** (Elise's motive) is introduced only in scene 18. There is no earlier hint. Consider planting one in Act II (Greta's clinic or the memory stone).
- **The 17:59 closure** is explained twice: deduced in scene 9 and restated by Elise in scene 18. Intentional echo, but check it does not read as a repeated reveal.
- **The "double signal" (scene 13)** is set up only in Act III's journal introduction, never in Act II dialogue. Scene 12 ends with "the second stamp came from Nebelstadt" — a dialogue hook for the double voice would help.
- **Voss's arc** is the strongest: obstruction (1) → humanity (4) → doubt (9, 11) → confession (13, 15) → accountability (16, 18). His "I am here" in scene 18 answers the tape from scene 4. Keep.
- **The third ending** needs Brass reputation ≥ both other factions. Without the ledger, Brass tops out at 5 while the twelve Act II/III choices push one of the other two to at least 6, so a player who protects the ticket in scene 1 can never see it. With the ledger it needs either the publish choice in scene 16 or an all-report Act I plus a perfect 6/6 split. Is that gating intentional?
- **Act III choices** are all "reopen vs remember" with no Brass Office option except the ledger. The Brass faction therefore stops moving after scene 6 unless the player holds the ledger.
- **The unnamed coast** is the sequel hook. It appears only in the final two lines.

## APPENDIX C — WHIMSY AUDIT

Every magical-realist or comic-absurd detail in the dialogue, sorted by how much the plot leans on it. Counts are dialogue lines (intro, choice, after-, topics, object texts).

### Tier 1 — Decoration. Removable with no plot change.

| Motif | Lines | Where | Note |
|---|---|---|---|
| Otto's pigeons (ride without tickets, "know something", furious about the schedule, punctual pigeons are planning something) | 8 | a1-arrival, a1-market, a1-station, a2-rail-trip, b1-new-route | *Tauben* is one of the two A1 words introduced in a1-arrival; drop the gloss too. |
| Greta's fern (supervises, sneezes on patients, wants your insurance card, turned a stamp green, "under observation", counted among the rescued) | 14 | a2-evening-plans, a2-clinic, a2-archive, b1-new-route, b1-storm, b1-atlas | Pure running gag. Two lines carry story beats that need rewording: "the fern has stopped sneezing" (clinic, consult branch) and "one fern" in the storm headcount. |
| Emil's lamp as a daughter ("her father", "my little one", "she never listens", "flies on Tuesdays", "needs your hand") | 7 | a1-workshop | The *function* of the lamp is load-bearing (Tier 3); only the personification is decoration. |
| Voss registers household objects (fridge has a register number, is the pillow registered, wanted to register his blanket) | 3 | a2-apartment, a2-clinic | The fridge line is Voss's reason for not repairing the door. Reword to "this door is not in the register". |
| Fritz's apples rolling north; pumpkins as big as suitcases; "the number does not taste of anything" | 3 | a1-market topic, a2-evening-plans topic | Optional topics only. |
| Lina's hearing theatre ("the tea is an exhibit", "Madam Chair", a pigeon as second witness that refuses to testify) | 4 | b1-witness | Comic framing of a serious scene. |
| Kettle whistles tomorrow's weather / Elise's kettle whistles yesterday's weather / "a kettle doesn't lie, it only exaggerates" | 3 | a1-cafe topic, a2-apartment topic, b1-atlas | The weather gag is separable from the name gag (Tier 2). |
| Personified things: "the storm has read the timetable", "old wood lies less often", "doors are more loyal than files", "the soup is neutral, it has no opinions" | 4 | a2-apartment, a2-rail-trip, b1-council, b1-storm | These are figures of speech, not magic. Keep or cut by taste. |
| Lina "delivers to yesterday" / "always left, never right" | 3 | a1-lost-parcel | The parcel being *from* yesterday can stay without Lina being able to walk into yesterday. |

### Tier 2 — Load-bearing magic that could be swapped for a different device.

| Motif | Lines | Why the plot needs it | Cheapest replacement |
|---|---|---|---|
| **The kettle says the player's name** | 3 + finale callback | R2 setup; the finale explains it: Elise's message reached the kettle through Marta's old lantern. The bible lists *Wasserkocher* as a required finale word. | Make Marta's **old lantern** the thing that carries the name: it flickers or prints the name on the receipt. The finale line becomes "my message reached Marta's old lantern". Same mechanism, one object fewer. |
| Receipt dated tomorrow; repair receipt dated tomorrow | 3 | Evidence that time is slipping, used as a clue card. | Keep one (the café receipt) and drop Emil's duplicate. |
| The lighthouse "shines dark" / the dark beam | 2 + cinematic | The eraser machine's visible effect, the storm antagonist. | Keep, but describe it as a beam that puts lanterns *out* rather than "shining dark". |
| Lamp "trembles" when the mill repeats; lamp "tugs towards the harbour lantern" | 2 | Signposting for the player. | A plain compass needle or the lamp simply dimming near erased places. |

### Tier 3 — The premise. Removing these is a different game.

- Names, addresses and routes fade unless spoken aloud, and the ink answers only to German.
- Platform seven exists only while the lantern is lit.
- One door joins Marta's café in Lindenhafen to the inn in Waldruh.
- The clockmill repeats the hour before midnight and takes a name each cycle.
- A keeper's key can close a route from inside.
- An eraser machine at the harbour, and a bell that counts silence as consent.
- Emil's lamp seeks erased addresses (this is how the player is led from scene 5 to 6 and to the harbour lantern in Act III).

### Cost note

Every dialogue line has a pre-rendered clip in `web/public/audio/dialogue/` keyed by line id. Changing a line's German means regenerating its clip. A1 lines are also bound by the lexical audit (`scripts/audit-dialogue-levels.mjs --check`), so replacement words must stay in the A1 lexicon or be glossed.
