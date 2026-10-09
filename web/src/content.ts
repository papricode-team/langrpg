/** Original Lantern Atlas learning content. Curriculum tags describe practice, not certification. */
export type Level = 'A1' | 'A2' | 'B1';
export type ExerciseMode = 'choice' | 'listen' | 'sentence' | 'type';
export interface Exercise {
  id: string;
  itemId: string;
  mode: ExerciseMode;
  prompt: string;
  /** Reference example and listening text. Hide before answering sentence/type exercises. */
  german: string;
  english: string;
  answer: string;
  options?: string[];
  tokens?: string[];
  hint: string;
  explanation: string;
  acceptedAnswers?: string[];
}
export interface Quest {
  id: string;
  level: Level;
  title: string;
  subtitle: string;
  npcId: string;
  location: string;
  story: string;
  objectives: string[];
  reward: number;
  exercises: Exercise[];
}
export interface NPC {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  color: string;
  greeting: string;
  portrait?: string;
}
export interface VocabularyItem { id: string; german: string; english: string; level: Level; example: string; }
export interface Chapter { level: Level; title: string; description: string; color: string; }

export const npcs: NPC[] = [
  {
    "id": "marta",
    "name": "Marta",
    "role": "Café owner · keeper of excellent secrets",
    "x": 0.442,
    "y": 0.459,
    "color": "#F4B17D",
    "greeting": "Willkommen! Möchtest du einen Kaffee?"
  },
  {
    "id": "otto",
    "name": "Otto",
    "role": "Stationmaster · suspicious of punctual pigeons",
    "x": 0.815,
    "y": 0.299,
    "color": "#8CA7E8",
    "greeting": "Guten Tag! Wohin möchtest du fahren?"
  },
  {
    "id": "lina",
    "name": "Lina",
    "role": "Courier · delivers to yesterday if necessary",
    "x": 0.603,
    "y": 0.68,
    "color": "#DB8EAB",
    "greeting": "Hallo! Kannst du mir mit diesem Paket helfen?"
  },
  {
    "id": "emil",
    "name": "Emil",
    "role": "Inventor · almost everything works",
    "x": 0.228,
    "y": 0.738,
    "color": "#D3B36E",
    "greeting": "Hallo! Suchst du etwas?"
  },
  {
    "id": "ada",
    "name": "Ada",
    "role": "Archivist · remembers the missing pages",
    "x": 0.132,
    "y": 0.322,
    "color": "#AB97D6",
    "greeting": "Willkommen in der Bibliothek. Was möchtest du wissen?"
  },
  {
    "id": "fritz",
    "name": "Fritz",
    "role": "Market trader · founder of the soup club",
    "x": 0.775,
    "y": 0.475,
    "color": "#8AB77D",
    "greeting": "Guten Morgen! Was darf es sein?"
  },
  {
    "id": "greta",
    "name": "Greta",
    "role": "Botanist · the fern is under observation",
    "x": 0.414,
    "y": 0.707,
    "color": "#72B7A8",
    "greeting": "Hallo! Schön, dich zu sehen."
  }
];

export const chapters: Chapter[] = [
  {
    "level": "A1",
    "title": "The missing platform",
    "description": "Investigate Lindenhafen’s vanishing platform. Meet its residents, handle everyday errands and follow the first Atlas page toward Waldruh.",
    "color": "#A5BC7B"
  },
  {
    "level": "A2",
    "title": "A town out of time",
    "description": "Explore Waldruh, an autumn village trapped in a missing hour. Make plans, explain problems and uncover whose names the clockmill is erasing.",
    "color": "#D8AD6D"
  },
  {
    "level": "B1",
    "title": "The promise in the mist",
    "description": "Reach Nebelstadt before the seventh bell. Compare testimony, explain motives and negotiate a truthful agreement to restore the forgotten route. Speaking is not assessed.",
    "color": "#AA9FD4"
  }
];

export const quests: Quest[] = [
  {
    "id": "a1-arrival",
    "level": "A1",
    "title": "A rather unusual arrival",
    "subtitle": "Meet the people behind the lanterns",
    "npcId": "otto",
    "location": "Lindenhafen · Railway station",
    "story": "Your train arrives with a greenhouse carriage and forty sleeping pigeons. Otto says this is perfectly normal. The platform behind him is not: it appears only when the station bell rings, and its sign is losing letters. Someone has slipped a blank page into your luggage. Its one surviving sentence reads: “Do not let them ring the seventh bell.” Meet Otto, ask for help, and find out why your ticket names a town nobody admits exists. You can begin with no German; hints and explanations help you through every encounter.",
    "objectives": [
      "Greet someone and introduce yourself",
      "Ask for help and repetition",
      "Discover the unlisted platform"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "choice",
        "prompt": "It is morning. Greet Otto politely.",
        "german": "Guten Morgen!",
        "english": "Good morning!",
        "answer": "Guten Morgen!",
        "hint": "Morgen means morning.",
        "explanation": "Use Guten Morgen as a morning greeting.",
        "options": [
          "Guten Morgen!",
          "Gute Nacht!",
          "Auf Wiedersehen!"
        ],
        "id": "a1-arrival-exercise-1",
        "itemId": "a1-arrival-item-1"
      },
      {
        "mode": "sentence",
        "prompt": "Introduce a traveller called Alex.",
        "german": "Ich heiße Alex.",
        "english": "My name is Alex.",
        "answer": "Ich heiße Alex.",
        "hint": "Start with Ich. The verb follows.",
        "explanation": "heißen means to be called. Ich heiße gives your name.",
        "tokens": [
          "Ich",
          "heiße",
          "Alex."
        ],
        "id": "a1-arrival-exercise-2",
        "itemId": "a1-arrival-item-2"
      },
      {
        "mode": "type",
        "prompt": "Write the line: \"I come from England.\"",
        "german": "Ich komme aus England.",
        "english": "I come from England.",
        "answer": "Ich komme aus England.",
        "hint": "Use Ich komme aus …",
        "explanation": "aus introduces where someone comes from.",
        "id": "a1-arrival-exercise-3",
        "itemId": "a1-arrival-item-3"
      },
      {
        "mode": "choice",
        "prompt": "Ask Otto his name using polite Sie.",
        "german": "Wie heißen Sie?",
        "english": "What is your name?",
        "answer": "Wie heißen Sie?",
        "hint": "heißen is the verb used for names.",
        "explanation": "Sie is the polite form of you; heißen stays in the plural form.",
        "options": [
          "Wie heißen Sie?",
          "Wo wohnen Sie?",
          "Wie viel kostet das?"
        ],
        "id": "a1-arrival-exercise-4",
        "itemId": "a1-arrival-item-4"
      },
      {
        "mode": "listen",
        "prompt": "Listen to the traveller. Which language do they speak?",
        "german": "Ich spreche Englisch.",
        "english": "I speak English.",
        "answer": "English",
        "hint": "Listen for the language after spreche.",
        "explanation": "sprechen means to speak; Englisch means English.",
        "options": [
          "English",
          "German",
          "French"
        ],
        "id": "a1-arrival-exercise-5",
        "itemId": "a1-arrival-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Ask Otto politely to help you.",
        "german": "Helfen Sie mir bitte.",
        "english": "Please help me.",
        "answer": "Helfen Sie mir bitte.",
        "hint": "Start with Helfen Sie; mir means me.",
        "explanation": "Helfen Sie is a polite request. mir is the person receiving help.",
        "tokens": [
          "Helfen",
          "Sie",
          "mir",
          "bitte."
        ],
        "id": "a1-arrival-exercise-6",
        "itemId": "a1-arrival-item-6"
      },
      {
        "mode": "type",
        "prompt": "Ask Otto to repeat: \"Once again, please.\"",
        "german": "Noch einmal, bitte.",
        "english": "Once again, please.",
        "answer": "Noch einmal, bitte.",
        "hint": "noch einmal means once again.",
        "explanation": "This short request is useful whenever you need repetition.",
        "acceptedAnswers": [
          "Noch mal, bitte.",
          "Bitte noch einmal.",
          "Noch einmal bitte.",
          "Noch mal bitte."
        ],
        "id": "a1-arrival-exercise-7",
        "itemId": "a1-arrival-item-7"
      }
    ]
  },
  {
    "id": "a1-cafe",
    "level": "A1",
    "title": "Coffee with a side of prophecy",
    "subtitle": "Marta has a menu and a very opinionated kettle",
    "npcId": "marta",
    "location": "Lindenhafen · Marta’s café",
    "story": "Marta’s kettle predicts yesterday’s weather, which makes it a terrible kettle and an excellent witness. Today it whistles your name. While you help with ordinary café orders, Marta finds a receipt stamped with tomorrow’s date and the seal of the Brass Office. The customer paid for two coffees. Every person at the table remembers only one customer. Marta laughs until the second name begins disappearing from the receipt.",
    "objectives": [
      "Order food and drinks",
      "Understand a price",
      "Meet Marta and hear the kettle’s warning"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Order a coffee politely.",
        "german": "Ich möchte einen Kaffee.",
        "english": "I would like a coffee.",
        "answer": "Ich möchte einen Kaffee.",
        "hint": "Use Ich möchte, then einen Kaffee.",
        "explanation": "möchte makes the request polite; Kaffee is masculine, so the object is einen Kaffee.",
        "tokens": [
          "Ich",
          "möchte",
          "einen",
          "Kaffee."
        ],
        "id": "a1-cafe-exercise-1",
        "itemId": "a1-cafe-item-1"
      },
      {
        "mode": "choice",
        "prompt": "Marta asks how you want your coffee. Choose \"With milk, please.\"",
        "german": "Mit Milch, bitte.",
        "english": "With milk, please.",
        "answer": "Mit Milch, bitte.",
        "hint": "Milch is milk.",
        "explanation": "mit means with. This short phrase works when ordering.",
        "options": [
          "Mit Milch, bitte.",
          "Ohne Zucker, bitte.",
          "Mit Wasser, bitte."
        ],
        "id": "a1-cafe-exercise-2",
        "itemId": "a1-cafe-item-2"
      },
      {
        "mode": "type",
        "prompt": "Ask: \"How much does the tea cost?\"",
        "german": "Was kostet der Tee?",
        "english": "How much does the tea cost?",
        "answer": "Was kostet der Tee?",
        "hint": "Use Was kostet …?",
        "explanation": "kosten means to cost. The item being priced is the subject.",
        "id": "a1-cafe-exercise-3",
        "itemId": "a1-cafe-item-3"
      },
      {
        "mode": "listen",
        "prompt": "Listen to the price. How much is the tea?",
        "german": "Der Tee kostet drei Euro.",
        "english": "The tea costs three euros.",
        "answer": "€3",
        "hint": "drei is three.",
        "explanation": "German uses Euro after a number without adding an s.",
        "options": [
          "€3",
          "€2",
          "€13"
        ],
        "id": "a1-cafe-exercise-4",
        "itemId": "a1-cafe-item-4"
      },
      {
        "mode": "sentence",
        "prompt": "Choose a water: \"I will have a water.\"",
        "german": "Ich nehme ein Wasser.",
        "english": "I will have a water.",
        "answer": "Ich nehme ein Wasser.",
        "hint": "Start with Ich nehme.",
        "explanation": "Ich nehme is a common ordering phrase. Wasser is neuter: ein Wasser.",
        "tokens": [
          "Ich",
          "nehme",
          "ein",
          "Wasser."
        ],
        "id": "a1-cafe-exercise-5",
        "itemId": "a1-cafe-item-5"
      },
      {
        "mode": "choice",
        "prompt": "You are ready to pay. Ask for the bill.",
        "german": "Die Rechnung, bitte.",
        "english": "The bill, please.",
        "answer": "Die Rechnung, bitte.",
        "hint": "Rechnung means bill.",
        "explanation": "This short request is natural in cafés and restaurants.",
        "options": [
          "Die Rechnung, bitte.",
          "Die Zeitung, bitte.",
          "Die Speisekarte, bitte."
        ],
        "id": "a1-cafe-exercise-6",
        "itemId": "a1-cafe-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Does the customer want to order more?",
        "german": "Danke, das ist alles.",
        "english": "Thank you, that is everything.",
        "answer": "No, the order is complete.",
        "hint": "alles means everything.",
        "explanation": "das ist alles tells the server that the order is complete.",
        "options": [
          "No, the order is complete.",
          "Yes, another coffee.",
          "They want the menu."
        ],
        "id": "a1-cafe-exercise-7",
        "itemId": "a1-cafe-item-7"
      }
    ]
  },
  {
    "id": "a1-market",
    "level": "A1",
    "title": "The runaway shopping list",
    "subtitle": "Fritz has misplaced dinner, somehow",
    "npcId": "fritz",
    "location": "Lindenhafen · Lantern market",
    "story": "Fritz’s shopping list has escaped on tiny paper legs. Catch dinner before the soup club arrives; nobody wants to negotiate with hungry onions. Among the apples you find a numbered brass seal identical to Marta’s receipt. Fritz remembers selling the whole crate to a railway clerk, but his ledger now claims the clerk never existed. Buy the ingredients and help him read the surviving quantities before the ink fades completely.",
    "objectives": [
      "Ask for everyday groceries",
      "Use quantities and payment phrases",
      "Find the numbered apple"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Say that you need two apples.",
        "german": "Ich brauche zwei Äpfel.",
        "english": "I need two apples.",
        "answer": "Ich brauche zwei Äpfel.",
        "hint": "brauche means need; the plural is Äpfel.",
        "explanation": "Apfel changes to Äpfel in the plural. Learn nouns with their useful forms.",
        "tokens": [
          "Ich",
          "brauche",
          "zwei",
          "Äpfel."
        ],
        "id": "a1-market-exercise-1",
        "itemId": "a1-market-item-1"
      },
      {
        "mode": "choice",
        "prompt": "Ask Fritz whether he has bread.",
        "german": "Haben Sie Brot?",
        "english": "Do you have bread?",
        "answer": "Haben Sie Brot?",
        "hint": "Brot is bread.",
        "explanation": "Put Haben first to ask a yes/no question politely.",
        "options": [
          "Haben Sie Brot?",
          "Haben Sie Zeit?",
          "Haben Sie Milch?"
        ],
        "id": "a1-market-exercise-2",
        "itemId": "a1-market-item-2"
      },
      {
        "mode": "type",
        "prompt": "Request one kilo of potatoes.",
        "german": "Ein Kilo Kartoffeln, bitte.",
        "english": "One kilo of potatoes, please.",
        "answer": "Ein Kilo Kartoffeln, bitte.",
        "hint": "Use Ein Kilo …, bitte.",
        "explanation": "Kartoffeln is the plural of Kartoffel. No extra word for of is needed here.",
        "acceptedAnswers": [
          "Ein Kilogramm Kartoffeln, bitte.",
          "Ein Kilo Kartoffeln bitte.",
          "Ein Kilogramm Kartoffeln bitte."
        ],
        "id": "a1-market-exercise-3",
        "itemId": "a1-market-item-3"
      },
      {
        "mode": "listen",
        "prompt": "Listen to the total. What must you pay?",
        "german": "Das kostet fünf Euro fünfzig.",
        "english": "That costs five euros fifty.",
        "answer": "€5.50",
        "hint": "fünfzig is fifty.",
        "explanation": "In everyday prices, fünf Euro fünfzig means €5.50.",
        "options": [
          "€5.50",
          "€15.00",
          "€5.15"
        ],
        "id": "a1-market-exercise-4",
        "itemId": "a1-market-item-4"
      },
      {
        "mode": "choice",
        "prompt": "Fritz says the tomatoes were picked today. Describe them.",
        "german": "Die Tomaten sind frisch.",
        "english": "The tomatoes are fresh.",
        "answer": "Die Tomaten sind frisch.",
        "hint": "frisch means fresh.",
        "explanation": "Use sind with a plural subject: die Tomaten sind.",
        "options": [
          "Die Tomaten sind frisch.",
          "Die Tomaten sind teuer.",
          "Die Tomaten sind geschlossen."
        ],
        "id": "a1-market-exercise-5",
        "itemId": "a1-market-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Tell Fritz you are paying by card.",
        "german": "Ich bezahle mit Karte.",
        "english": "I am paying by card.",
        "answer": "Ich bezahle mit Karte.",
        "hint": "Use Ich bezahle, then mit Karte.",
        "explanation": "bezahlen means to pay; mit Karte means by card.",
        "tokens": [
          "Ich",
          "bezahle",
          "mit",
          "Karte."
        ],
        "id": "a1-market-exercise-6",
        "itemId": "a1-market-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What is the customer’s problem?",
        "german": "Das ist zu teuer.",
        "english": "That is too expensive.",
        "answer": "The price is too high.",
        "hint": "zu before teuer means too.",
        "explanation": "zu teuer expresses that something costs more than the speaker wants to pay.",
        "options": [
          "The price is too high.",
          "The tomatoes are fresh.",
          "The card is missing."
        ],
        "id": "a1-market-exercise-7",
        "itemId": "a1-market-item-7"
      }
    ]
  },
  {
    "id": "a1-station",
    "level": "A1",
    "title": "Platform two and a half",
    "subtitle": "Read the board before the board reads you",
    "npcId": "otto",
    "location": "Lindenhafen · The hidden platform",
    "story": "Between platforms two and three, a departure board announces a train to Waldruh. Otto immediately turns it off. He insists it is a maintenance fault; then the disconnected speaker whispers the same destination. Help travellers find platforms and understand delays while checking the timetable. Six crossed-out departures match six faded names on Marta’s receipt. The seventh train leaves when the great bell rings.",
    "objectives": [
      "Ask for travel information",
      "Understand departure times and platforms",
      "Notice the impossible destination"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "choice",
        "prompt": "A visitor needs the railway station. Choose the right question.",
        "german": "Wo ist der Bahnhof?",
        "english": "Where is the station?",
        "answer": "Wo ist der Bahnhof?",
        "hint": "Wo asks where.",
        "explanation": "Wo ist …? asks for the location of a singular thing.",
        "options": [
          "Wo ist der Bahnhof?",
          "Was kostet der Bahnhof?",
          "Wer ist der Bahnhof?"
        ],
        "id": "a1-station-exercise-1",
        "itemId": "a1-station-item-1"
      },
      {
        "mode": "listen",
        "prompt": "Listen. When does the train leave?",
        "german": "Der Zug fährt um neun Uhr.",
        "english": "The train leaves at nine o’clock.",
        "answer": "09:00",
        "hint": "neun means nine; um introduces the time.",
        "explanation": "um neun Uhr is at nine o’clock.",
        "options": [
          "09:00",
          "19:00",
          "08:00"
        ],
        "id": "a1-station-exercise-2",
        "itemId": "a1-station-item-2"
      },
      {
        "mode": "sentence",
        "prompt": "Request a ticket to Berlin.",
        "german": "Ein Ticket nach Berlin, bitte.",
        "english": "A ticket to Berlin, please.",
        "answer": "Ein Ticket nach Berlin, bitte.",
        "hint": "nach introduces a city destination.",
        "explanation": "Use nach with city names such as Berlin when describing a destination.",
        "tokens": [
          "Ein",
          "Ticket",
          "nach",
          "Berlin,",
          "bitte."
        ],
        "id": "a1-station-exercise-3",
        "itemId": "a1-station-item-3"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Which platform do you need?",
        "german": "Der Zug fährt von Gleis zwei ab.",
        "english": "The train departs from platform two.",
        "answer": "Platform 2",
        "hint": "Listen for the number after Gleis.",
        "explanation": "abfahren is separable: the ab appears at the end of the sentence.",
        "options": [
          "Platform 2",
          "Platform 3",
          "Platform 12"
        ],
        "id": "a1-station-exercise-4",
        "itemId": "a1-station-item-4"
      },
      {
        "mode": "type",
        "prompt": "Ask whether this seat is available.",
        "german": "Ist dieser Platz frei?",
        "english": "Is this seat free?",
        "answer": "Ist dieser Platz frei?",
        "hint": "Use Ist dieser Platz …?",
        "explanation": "frei can mean free or available. Here it describes an unoccupied seat.",
        "id": "a1-station-exercise-5",
        "itemId": "a1-station-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Say: \"I have to go home today.\"",
        "german": "Ich muss heute nach Hause.",
        "english": "I have to go home today.",
        "answer": "Ich muss heute nach Hause.",
        "hint": "muss comes second; heute means today.",
        "explanation": "nach Hause means home as a destination. muss expresses necessity.",
        "tokens": [
          "Ich",
          "muss",
          "heute",
          "nach",
          "Hause."
        ],
        "id": "a1-station-exercise-6",
        "itemId": "a1-station-item-6"
      },
      {
        "mode": "choice",
        "prompt": "Choose the announcement meaning \"The train is ten minutes late.\"",
        "german": "Der Zug hat zehn Minuten Verspätung.",
        "english": "The train is ten minutes late.",
        "answer": "Der Zug hat zehn Minuten Verspätung.",
        "hint": "Verspätung means delay.",
        "explanation": "German commonly says a train has a delay: hat … Verspätung.",
        "options": [
          "Der Zug hat zehn Minuten Verspätung.",
          "Der Zug fährt in zehn Minuten ab.",
          "Der Zug fährt von Gleis zehn ab."
        ],
        "id": "a1-station-exercise-7",
        "itemId": "a1-station-item-7"
      }
    ]
  },
  {
    "id": "a1-workshop",
    "level": "A1",
    "title": "Emil’s extremely normal lamp",
    "subtitle": "It only levitates on Tuesdays",
    "npcId": "emil",
    "location": "Lindenhafen · Emil’s workshop",
    "story": "Emil’s “extremely normal lamp” follows everyone except its owner. Locate his tools before it follows the mayor into a cupboard. The lamp brightens whenever you hold it over an erased address, revealing the shape of a road beneath the blank Atlas page. Emil recognizes the brass seal: he repaired a machine for the Brass Office. He was told it restored damaged maps. Its invoice calls it an eraser.",
    "objectives": [
      "Describe objects and locations",
      "Make a simple request",
      "Find the Atlas symbol inside the lamp"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "listen",
        "prompt": "Listen. Where is the key?",
        "german": "Der Schlüssel ist auf dem Tisch.",
        "english": "The key is on the table.",
        "answer": "On the table",
        "hint": "Tisch means table; auf means on.",
        "explanation": "auf dem Tisch describes a location. Learn this as a useful whole phrase.",
        "options": [
          "On the table",
          "Under the chair",
          "In the cupboard"
        ],
        "id": "a1-workshop-exercise-1",
        "itemId": "a1-workshop-item-1"
      },
      {
        "mode": "sentence",
        "prompt": "Tell Emil that you need a lamp.",
        "german": "Ich brauche eine Lampe.",
        "english": "I need a lamp.",
        "answer": "Ich brauche eine Lampe.",
        "hint": "Lampe is feminine: eine Lampe.",
        "explanation": "With a feminine object, eine stays eine.",
        "tokens": [
          "Ich",
          "brauche",
          "eine",
          "Lampe."
        ],
        "id": "a1-workshop-exercise-2",
        "itemId": "a1-workshop-item-2"
      },
      {
        "mode": "choice",
        "prompt": "The door is not closed. Describe it.",
        "german": "Die Tür ist offen.",
        "english": "The door is open.",
        "answer": "Die Tür ist offen.",
        "hint": "offen means open.",
        "explanation": "An adjective after ist has no ending here: ist offen.",
        "options": [
          "Die Tür ist offen.",
          "Die Tür ist klein.",
          "Die Tür ist neu."
        ],
        "id": "a1-workshop-exercise-3",
        "itemId": "a1-workshop-item-3"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Is the window open or closed?",
        "german": "Das Fenster ist geschlossen.",
        "english": "The window is closed.",
        "answer": "Closed",
        "hint": "geschlossen means closed.",
        "explanation": "Fenster is neuter: das Fenster.",
        "options": [
          "Closed",
          "Open",
          "Broken"
        ],
        "id": "a1-workshop-exercise-4",
        "itemId": "a1-workshop-item-4"
      },
      {
        "mode": "type",
        "prompt": "Ask: \"Can I have the pen?\"",
        "german": "Kann ich den Stift haben?",
        "english": "Can I have the pen?",
        "answer": "Kann ich den Stift haben?",
        "hint": "Use Kann ich … haben? Stift is masculine.",
        "explanation": "The modal verb kann starts the question; haben goes at the end. der Stift becomes den Stift.",
        "id": "a1-workshop-exercise-5",
        "itemId": "a1-workshop-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Ask a customer politely to wait here.",
        "german": "Bitte warten Sie hier.",
        "english": "Please wait here.",
        "answer": "Bitte warten Sie hier.",
        "hint": "Start with Bitte warten Sie.",
        "explanation": "warten means wait; hier means here.",
        "tokens": [
          "Bitte",
          "warten",
          "Sie",
          "hier."
        ],
        "id": "a1-workshop-exercise-6",
        "itemId": "a1-workshop-item-6"
      },
      {
        "mode": "choice",
        "prompt": "The lamp refuses to switch on. Say that it does not work.",
        "german": "Das funktioniert nicht.",
        "english": "That does not work.",
        "answer": "Das funktioniert nicht.",
        "hint": "nicht makes the statement negative.",
        "explanation": "funktionieren means to function or work; nicht negates it.",
        "options": [
          "Das funktioniert nicht.",
          "Das gefällt mir.",
          "Das ist fertig."
        ],
        "id": "a1-workshop-exercise-7",
        "itemId": "a1-workshop-item-7"
      }
    ]
  },
  {
    "id": "a1-lost-parcel",
    "level": "A1",
    "title": "A parcel for yesterday",
    "subtitle": "Lina would prefer an ordinary delivery",
    "npcId": "lina",
    "location": "Lindenhafen · Courier’s crossing",
    "story": "Lina carries a parcel posted yesterday, dated tomorrow, and addressed to a person whose name has vanished. Follow its directions and help her deliver it before the station bell. Near Emil’s lamp, the blank page reveals a letter from Waldruh: “Before you erase us again, come.” A railway line burns gold across the paper. Lina is coming with you. Otto has already packed, though he claims he is only checking a connection.",
    "objectives": [
      "Ask for an address and directions",
      "Deliver a parcel politely",
      "Unlock the first Atlas page"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "choice",
        "prompt": "Identify the recipient of Marta’s parcel.",
        "german": "Das Paket ist für Marta.",
        "english": "The parcel is for Marta.",
        "answer": "Das Paket ist für Marta.",
        "hint": "für means for.",
        "explanation": "für names the intended recipient.",
        "options": [
          "Das Paket ist für Marta.",
          "Das Paket ist von Otto.",
          "Das Paket ist leer."
        ],
        "id": "a1-lost-parcel-exercise-1",
        "itemId": "a1-lost-parcel-item-1"
      },
      {
        "mode": "type",
        "prompt": "Ask Lina: \"What is the address?\"",
        "german": "Wie ist die Adresse?",
        "english": "What is the address?",
        "answer": "Wie ist die Adresse?",
        "hint": "The natural question begins Wie ist …?",
        "explanation": "German commonly uses Wie ist die Adresse? to ask for an address.",
        "acceptedAnswers": [
          "Wie lautet die Adresse?"
        ],
        "id": "a1-lost-parcel-exercise-2",
        "itemId": "a1-lost-parcel-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Which direction is the pharmacy?",
        "german": "Die Apotheke ist links.",
        "english": "The pharmacy is on the left.",
        "answer": "Left",
        "hint": "links means on the left.",
        "explanation": "die Apotheke is the pharmacy; rechts would mean on the right.",
        "options": [
          "Left",
          "Right",
          "Straight ahead"
        ],
        "id": "a1-lost-parcel-exercise-3",
        "itemId": "a1-lost-parcel-item-3"
      },
      {
        "mode": "sentence",
        "prompt": "Give the polite direction: \"Go straight ahead.\"",
        "german": "Gehen Sie geradeaus.",
        "english": "Go straight ahead.",
        "answer": "Gehen Sie geradeaus.",
        "hint": "geradeaus means straight ahead.",
        "explanation": "Gehen Sie is a polite instruction to go or walk.",
        "tokens": [
          "Gehen",
          "Sie",
          "geradeaus."
        ],
        "id": "a1-lost-parcel-exercise-4",
        "itemId": "a1-lost-parcel-item-4"
      },
      {
        "mode": "choice",
        "prompt": "Ask for help finding the post office.",
        "german": "Ich suche die Post.",
        "english": "I am looking for the post office.",
        "answer": "Ich suche die Post.",
        "hint": "Post refers to the post office here.",
        "explanation": "suchen means to look for; the thing being sought is the object.",
        "options": [
          "Ich suche die Post.",
          "Ich suche den Park.",
          "Ich suche das Hotel."
        ],
        "id": "a1-lost-parcel-exercise-5",
        "itemId": "a1-lost-parcel-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Hand Marta the parcel politely.",
        "german": "Hier ist Ihr Paket.",
        "english": "Here is your parcel.",
        "answer": "Hier ist Ihr Paket.",
        "hint": "Ihr means your when addressing someone with Sie.",
        "explanation": "Polite Ihr is capitalized. Hier ist … is useful when handing something over.",
        "tokens": [
          "Hier",
          "ist",
          "Ihr",
          "Paket."
        ],
        "id": "a1-lost-parcel-exercise-6",
        "itemId": "a1-lost-parcel-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Why is the courier apologizing?",
        "german": "Entschuldigung, ich bin zu spät.",
        "english": "Sorry, I am late.",
        "answer": "They are late.",
        "hint": "zu spät means late.",
        "explanation": "Entschuldigung is a common apology or way to get someone’s attention.",
        "options": [
          "They are late.",
          "The parcel is empty.",
          "They lost their ticket."
        ],
        "id": "a1-lost-parcel-exercise-7",
        "itemId": "a1-lost-parcel-item-7"
      }
    ]
  },
  {
    "id": "a2-apartment",
    "level": "A2",
    "title": "The room with a travelling view",
    "subtitle": "A home, a rent bill and a suspicious refrigerator",
    "npcId": "marta",
    "location": "Waldruh · The Wayward Inn",
    "story": "Waldruh is real, and every clock shows the same minute. Marta opens the Wayward Inn with a key she does not remember owning. Your room has two addresses: one belongs to the village, the other to a house that has disappeared. Its window changes views whenever someone tells the truth. Settle in, ask about the house rules and report the ordinary repairs. In the refrigerator, a resident has hidden letters to a family nobody remembers.",
    "objectives": [
      "Describe housing and everyday problems",
      "Use since, because and polite requests",
      "Read the refrigerator’s first letter"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Say that you are looking for an apartment.",
        "german": "Ich suche eine Wohnung.",
        "english": "I am looking for an apartment.",
        "answer": "Ich suche eine Wohnung.",
        "hint": "Wohnung is feminine: eine Wohnung.",
        "explanation": "Use suchen with an object to describe what you are looking for.",
        "tokens": [
          "Ich",
          "suche",
          "eine",
          "Wohnung."
        ],
        "id": "a2-apartment-exercise-1",
        "itemId": "a2-apartment-item-1"
      },
      {
        "mode": "type",
        "prompt": "Explain the problem: \"The rent is too high.\"",
        "german": "Die Miete ist zu hoch.",
        "english": "The rent is too high.",
        "answer": "Die Miete ist zu hoch.",
        "hint": "Miete is rent; hoch means high.",
        "explanation": "zu hoch means too high. It also describes prices and temperatures.",
        "id": "a2-apartment-exercise-2",
        "itemId": "a2-apartment-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. How many rooms does the apartment have?",
        "german": "Die Wohnung hat zwei Zimmer und einen Balkon.",
        "english": "The apartment has two rooms and a balcony.",
        "answer": "Two rooms",
        "hint": "Listen for the number before Zimmer.",
        "explanation": "einen Balkon is the masculine object after hat.",
        "options": [
          "Two rooms",
          "Three rooms",
          "One room"
        ],
        "id": "a2-apartment-exercise-3",
        "itemId": "a2-apartment-item-3"
      },
      {
        "mode": "sentence",
        "prompt": "Say: \"I have been living here for three months.\"",
        "german": "Ich wohne seit drei Monaten hier.",
        "english": "I have been living here for three months.",
        "answer": "Ich wohne seit drei Monaten hier.",
        "hint": "Use present-tense wohne with seit.",
        "explanation": "German uses the present tense with seit when the situation continues. Monaten is dative plural.",
        "tokens": [
          "Ich",
          "wohne",
          "seit",
          "drei",
          "Monaten",
          "hier."
        ],
        "id": "a2-apartment-exercise-4",
        "itemId": "a2-apartment-item-4"
      },
      {
        "mode": "choice",
        "prompt": "Describe a refrigerator that no longer works.",
        "german": "Der Kühlschrank ist kaputt.",
        "english": "The refrigerator is broken.",
        "answer": "Der Kühlschrank ist kaputt.",
        "hint": "kaputt means broken.",
        "explanation": "kaputt is a useful everyday adjective for something that does not work.",
        "options": [
          "Der Kühlschrank ist kaputt.",
          "Der Kühlschrank ist bequem.",
          "Der Kühlschrank ist freundlich."
        ],
        "id": "a2-apartment-exercise-5",
        "itemId": "a2-apartment-item-5"
      },
      {
        "mode": "type",
        "prompt": "Ask politely: \"Could you please repair that?\"",
        "german": "Könnten Sie das bitte reparieren?",
        "english": "Could you please repair that?",
        "answer": "Könnten Sie das bitte reparieren?",
        "hint": "Start with Könnten Sie; reparieren goes last.",
        "explanation": "Könnten Sie …? makes a request more polite.",
        "acceptedAnswers": [
          "Könnten Sie das reparieren, bitte?"
        ],
        "id": "a2-apartment-exercise-6",
        "itemId": "a2-apartment-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Why is the speaker moving?",
        "german": "Ich ziehe um, weil die Wohnung zu klein ist.",
        "english": "I am moving because the apartment is too small.",
        "answer": "The apartment is too small.",
        "hint": "Listen to the reason after weil.",
        "explanation": "In a weil clause, the finite verb goes at the end: zu klein ist.",
        "options": [
          "The apartment is too small.",
          "The rent is low.",
          "The station is closed."
        ],
        "id": "a2-apartment-exercise-7",
        "itemId": "a2-apartment-item-7"
      }
    ]
  },
  {
    "id": "a2-evening-plans",
    "level": "A2",
    "title": "Dinner before the moon falls",
    "subtitle": "A calendar problem with excellent soup",
    "npcId": "fritz",
    "location": "Waldruh · Autumn market",
    "story": "Fritz proposes a lantern festival to prove Waldruh still exists. His onions propose a smaller committee. Arrange dinner, compare plans and make a rain plan with Greta. When the old market loudspeaker switches on, forgotten villagers answer from beyond the forest. They call themselves the Unwritten Circle. They want their railway back, but they refuse to be rescued by people who will decide everything for them again.",
    "objectives": [
      "Make and change arrangements",
      "Express preferences and reasons",
      "Coordinate the lantern festival"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Ask a friend whether they have time tomorrow.",
        "german": "Hast du morgen Zeit?",
        "english": "Do you have time tomorrow?",
        "answer": "Hast du morgen Zeit?",
        "hint": "Use du with a friend. Start with Hast.",
        "explanation": "Hast du …? is the informal form of Haben Sie …?",
        "tokens": [
          "Hast",
          "du",
          "morgen",
          "Zeit?"
        ],
        "id": "a2-evening-plans-exercise-1",
        "itemId": "a2-evening-plans-item-1"
      },
      {
        "mode": "listen",
        "prompt": "Listen. At what time is the meeting?",
        "german": "Wir treffen uns am Samstag um halb sieben.",
        "english": "We are meeting on Saturday at half past six.",
        "answer": "18:30",
        "hint": "halb sieben is halfway to seven: 6:30. This is an evening meeting.",
        "explanation": "German halb names the following hour. am Samstag gives the day.",
        "options": [
          "18:30",
          "19:30",
          "17:30"
        ],
        "id": "a2-evening-plans-exercise-2",
        "itemId": "a2-evening-plans-item-2"
      },
      {
        "mode": "type",
        "prompt": "Accept enthusiastically: \"I would like to come along.\"",
        "german": "Ich würde gern mitkommen.",
        "english": "I would like to come along.",
        "answer": "Ich würde gern mitkommen.",
        "hint": "Use Ich würde gern …",
        "explanation": "würde gern expresses a wish politely; mitkommen means come along.",
        "acceptedAnswers": [
          "Ich würde gerne mitkommen."
        ],
        "id": "a2-evening-plans-exercise-3",
        "itemId": "a2-evening-plans-item-3"
      },
      {
        "mode": "choice",
        "prompt": "Decline the invitation politely.",
        "german": "Leider kann ich nicht.",
        "english": "Unfortunately, I cannot.",
        "answer": "Leider kann ich nicht.",
        "hint": "leider means unfortunately.",
        "explanation": "This phrase politely says you are unable to do the suggested thing.",
        "options": [
          "Leider kann ich nicht.",
          "Natürlich komme ich.",
          "Ich freue mich darauf."
        ],
        "id": "a2-evening-plans-exercise-4",
        "itemId": "a2-evening-plans-item-4"
      },
      {
        "mode": "sentence",
        "prompt": "Say that you prefer vegetables to meat.",
        "german": "Ich esse lieber Gemüse als Fleisch.",
        "english": "I prefer eating vegetables to meat.",
        "answer": "Ich esse lieber Gemüse als Fleisch.",
        "hint": "Use lieber … als …",
        "explanation": "lieber compares preferences; als introduces the alternative.",
        "tokens": [
          "Ich",
          "esse",
          "lieber",
          "Gemüse",
          "als",
          "Fleisch."
        ],
        "id": "a2-evening-plans-exercise-5",
        "itemId": "a2-evening-plans-item-5"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Why are they staying home?",
        "german": "Wir bleiben zu Hause, weil es regnet.",
        "english": "We are staying at home because it is raining.",
        "answer": "It is raining.",
        "hint": "regnen means to rain.",
        "explanation": "zu Hause is at home; nach Hause is a destination.",
        "options": [
          "It is raining.",
          "They are tired.",
          "The café is expensive."
        ],
        "id": "a2-evening-plans-exercise-6",
        "itemId": "a2-evening-plans-item-6"
      },
      {
        "mode": "type",
        "prompt": "Ask: \"Can we postpone the appointment?\"",
        "german": "Können wir den Termin verschieben?",
        "english": "Can we postpone the appointment?",
        "answer": "Können wir den Termin verschieben?",
        "hint": "Termin means appointment; verschieben goes last.",
        "explanation": "verschieben means reschedule or postpone. den Termin is the object.",
        "id": "a2-evening-plans-exercise-7",
        "itemId": "a2-evening-plans-item-7"
      }
    ]
  },
  {
    "id": "a2-rail-trip",
    "level": "A2",
    "title": "The express to almost somewhere",
    "subtitle": "A journey worth confirming twice",
    "npcId": "otto",
    "location": "Waldruh · Forest station",
    "story": "Otto finds the lost timetable beneath the station floor. The railway was closed from inside Waldruh, yet every official notice blames a storm outside it. Plan the connections and check the cancelled services. A handwritten instruction orders the keeper to erase the route “until agreement is restored.” Someone has crossed out the condition. The railway can return, but opening it carelessly may wake the machine that erased it.",
    "objectives": [
      "Understand connections and disruptions",
      "Ask follow-up travel questions",
      "Find the route to the missing town"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "type",
        "prompt": "Ask whether you must change trains in Hamburg.",
        "german": "Muss ich in Hamburg umsteigen?",
        "english": "Do I have to change trains in Hamburg?",
        "answer": "Muss ich in Hamburg umsteigen?",
        "hint": "umsteigen means change trains; it stays at the end after muss.",
        "explanation": "A modal question begins with Muss; umsteigen remains an infinitive.",
        "id": "a2-rail-trip-exercise-1",
        "itemId": "a2-rail-trip-item-1"
      },
      {
        "mode": "listen",
        "prompt": "Listen. How long until the connecting train leaves?",
        "german": "Der Anschlusszug fährt in zwanzig Minuten ab.",
        "english": "The connecting train leaves in twenty minutes.",
        "answer": "20 minutes",
        "hint": "zwanzig means twenty.",
        "explanation": "in zwanzig Minuten describes how long from now until departure.",
        "options": [
          "20 minutes",
          "12 minutes",
          "2 minutes"
        ],
        "id": "a2-rail-trip-exercise-2",
        "itemId": "a2-rail-trip-item-2"
      },
      {
        "mode": "sentence",
        "prompt": "Explain that you missed your connection.",
        "german": "Ich habe meinen Anschluss verpasst.",
        "english": "I missed my connection.",
        "answer": "Ich habe meinen Anschluss verpasst.",
        "hint": "Use habe … verpasst.",
        "explanation": "The perfect tense uses haben plus the past participle verpasst.",
        "tokens": [
          "Ich",
          "habe",
          "meinen",
          "Anschluss",
          "verpasst."
        ],
        "id": "a2-rail-trip-exercise-3",
        "itemId": "a2-rail-trip-item-3"
      },
      {
        "mode": "choice",
        "prompt": "Compare two possible journeys. Ask which connection is faster.",
        "german": "Welche Verbindung ist schneller?",
        "english": "Which connection is faster?",
        "answer": "Welche Verbindung ist schneller?",
        "hint": "schneller means faster.",
        "explanation": "Comparative adjectives often add -er: schnell → schneller.",
        "options": [
          "Welche Verbindung ist schneller?",
          "Welche Verbindung ist billiger?",
          "Welche Verbindung ist später?"
        ],
        "id": "a2-rail-trip-exercise-4",
        "itemId": "a2-rail-trip-item-4"
      },
      {
        "mode": "type",
        "prompt": "Ask whether the price includes the return journey.",
        "german": "Ist die Rückfahrt im Preis enthalten?",
        "english": "Is the return journey included in the price?",
        "answer": "Ist die Rückfahrt im Preis enthalten?",
        "hint": "Use Ist die Rückfahrt … enthalten?",
        "explanation": "im Preis enthalten is a useful chunk meaning included in the price.",
        "id": "a2-rail-trip-exercise-5",
        "itemId": "a2-rail-trip-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Ask to cancel the ticket.",
        "german": "Ich möchte das Ticket stornieren.",
        "english": "I would like to cancel the ticket.",
        "answer": "Ich möchte das Ticket stornieren.",
        "hint": "stornieren goes last after möchte.",
        "explanation": "stornieren means cancel a booking or ticket.",
        "tokens": [
          "Ich",
          "möchte",
          "das",
          "Ticket",
          "stornieren."
        ],
        "id": "a2-rail-trip-exercise-6",
        "itemId": "a2-rail-trip-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What transport is not running today?",
        "german": "Wegen einer Störung fährt der Bus heute nicht.",
        "english": "Because of a disruption, the bus is not running today.",
        "answer": "The bus",
        "hint": "Bus is the vehicle mentioned.",
        "explanation": "wegen introduces the reason; einer Störung means a disruption.",
        "options": [
          "The bus",
          "The train",
          "The ferry"
        ],
        "id": "a2-rail-trip-exercise-7",
        "itemId": "a2-rail-trip-item-7"
      }
    ]
  },
  {
    "id": "a2-broken-clock",
    "level": "A2",
    "title": "Yesterday’s repairs, tomorrow’s trouble",
    "subtitle": "Emil kept receipts from the future",
    "npcId": "emil",
    "location": "Waldruh · Clockmill workshop",
    "story": "The clockmill repeats one missing hour. Emil remembers repairing it yesterday; his receipt says the repair is tomorrow. Reconstruct his day and give clear instructions before another cycle starts. The machine is not merely losing minutes: after each repetition, one resident’s name fades from its records. Someone removed a small brass hand from the clock. Its serial number belongs to the lighthouse in Nebelstadt.",
    "objectives": [
      "Describe completed actions",
      "Use sequence and location",
      "Trace the borrowed tools"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Report: \"I found the key yesterday.\"",
        "german": "Ich habe gestern den Schlüssel gefunden.",
        "english": "I found the key yesterday.",
        "answer": "Ich habe gestern den Schlüssel gefunden.",
        "hint": "habe is the helper verb; gefunden goes last.",
        "explanation": "finden has the irregular past participle gefunden.",
        "tokens": [
          "Ich",
          "habe",
          "gestern",
          "den",
          "Schlüssel",
          "gefunden."
        ],
        "id": "a2-broken-clock-exercise-1",
        "itemId": "a2-broken-clock-item-1"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What happened first?",
        "german": "Zuerst habe ich aufgeräumt, dann habe ich gekocht.",
        "english": "First I tidied up, then I cooked.",
        "answer": "Tidying up",
        "hint": "zuerst marks the first action.",
        "explanation": "zuerst and dann help put a report in a clear sequence.",
        "options": [
          "Tidying up",
          "Cooking",
          "Shopping"
        ],
        "id": "a2-broken-clock-exercise-2",
        "itemId": "a2-broken-clock-item-2"
      },
      {
        "mode": "type",
        "prompt": "Ask a friend to explain the instructions to you.",
        "german": "Kannst du mir die Anleitung erklären?",
        "english": "Can you explain the instructions to me?",
        "answer": "Kannst du mir die Anleitung erklären?",
        "hint": "Use Kannst du mir … erklären?",
        "explanation": "erklären takes the thing explained and the person receiving the explanation: mir.",
        "id": "a2-broken-clock-exercise-3",
        "itemId": "a2-broken-clock-item-3"
      },
      {
        "mode": "choice",
        "prompt": "Tell a friend to put the tools on the table.",
        "german": "Leg das Werkzeug auf den Tisch.",
        "english": "Put the tools on the table.",
        "answer": "Leg das Werkzeug auf den Tisch.",
        "hint": "Leg is a request to put something down.",
        "explanation": "Movement onto the table uses auf den Tisch. A location uses auf dem Tisch.",
        "options": [
          "Leg das Werkzeug auf den Tisch.",
          "Das Werkzeug liegt auf dem Tisch.",
          "Das Werkzeug ist unter dem Tisch."
        ],
        "id": "a2-broken-clock-exercise-4",
        "itemId": "a2-broken-clock-item-4"
      },
      {
        "mode": "sentence",
        "prompt": "Describe where the tools are: under the chair.",
        "german": "Das Werkzeug liegt unter dem Stuhl.",
        "english": "The tools are under the chair.",
        "answer": "Das Werkzeug liegt unter dem Stuhl.",
        "hint": "liegen describes where something is. Use unter dem Stuhl.",
        "explanation": "A fixed location with unter uses dative: dem Stuhl.",
        "tokens": [
          "Das",
          "Werkzeug",
          "liegt",
          "unter",
          "dem",
          "Stuhl."
        ],
        "id": "a2-broken-clock-exercise-5",
        "itemId": "a2-broken-clock-item-5"
      },
      {
        "mode": "type",
        "prompt": "Explain: \"I forgot to close the window.\"",
        "german": "Ich habe vergessen, das Fenster zu schließen.",
        "english": "I forgot to close the window.",
        "answer": "Ich habe vergessen, das Fenster zu schließen.",
        "hint": "Use habe vergessen, then das Fenster zu schließen.",
        "explanation": "vergessen can be followed by a zu infinitive stating what was forgotten.",
        "id": "a2-broken-clock-exercise-6",
        "itemId": "a2-broken-clock-item-6",
        "acceptedAnswers": [
          "Ich habe vergessen das Fenster zu schließen."
        ]
      },
      {
        "mode": "listen",
        "prompt": "Listen. Who returned the lamp?",
        "german": "Otto hat die Lampe zurückgebracht.",
        "english": "Otto brought the lamp back.",
        "answer": "Otto",
        "hint": "The first name is the subject.",
        "explanation": "zurückbringen has the past participle zurückgebracht.",
        "options": [
          "Otto",
          "Marta",
          "Lina"
        ],
        "id": "a2-broken-clock-exercise-7",
        "itemId": "a2-broken-clock-item-7"
      }
    ]
  },
  {
    "id": "a2-clinic",
    "level": "A2",
    "title": "A mild case of lantern fever",
    "subtitle": "Greta’s plant has sneezed on the entire queue",
    "npcId": "greta",
    "location": "Waldruh · Conservatory clinic",
    "story": "Greta’s enchanted fern has hay fever and very strong opinions about waiting rooms. Help visitors describe symptoms and arrange appointments while she keeps it away from the paperwork. People here still remember lost places even when clocks and records forget them. A patient remembers Elise Sander, the former Atlas keeper, pleading with the village to stop a fight. Another remembers a Brass Office official taking her signed order away.",
    "objectives": [
      "Describe symptoms and ask for appointments",
      "Understand simple advice",
      "Speak to the patient who remembers"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Describe a headache that started yesterday and continues.",
        "german": "Ich habe seit gestern Kopfschmerzen.",
        "english": "I have had a headache since yesterday.",
        "answer": "Ich habe seit gestern Kopfschmerzen.",
        "hint": "Use present-tense habe with seit gestern.",
        "explanation": "Kopfschmerzen is plural in German. seit describes an ongoing situation.",
        "tokens": [
          "Ich",
          "habe",
          "seit",
          "gestern",
          "Kopfschmerzen."
        ],
        "id": "a2-clinic-exercise-1",
        "itemId": "a2-clinic-item-1"
      },
      {
        "mode": "type",
        "prompt": "Ask for an appointment with the doctor.",
        "german": "Ich brauche einen Termin beim Arzt.",
        "english": "I need an appointment with the doctor.",
        "answer": "Ich brauche einen Termin beim Arzt.",
        "hint": "Use einen Termin beim Arzt.",
        "explanation": "beim is short for bei dem; beim Arzt means with or at the doctor.",
        "id": "a2-clinic-exercise-2",
        "itemId": "a2-clinic-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. When does the office open?",
        "german": "Die Praxis öffnet um Viertel nach acht.",
        "english": "The doctor’s office opens at quarter past eight.",
        "answer": "08:15",
        "hint": "Viertel nach means quarter past.",
        "explanation": "Viertel nach acht is 8:15. Viertel vor acht would be 7:45.",
        "options": [
          "08:15",
          "08:45",
          "07:45"
        ],
        "id": "a2-clinic-exercise-3",
        "itemId": "a2-clinic-item-3"
      },
      {
        "mode": "choice",
        "prompt": "Ask how long you should wait.",
        "german": "Wie lange soll ich warten?",
        "english": "How long should I wait?",
        "answer": "Wie lange soll ich warten?",
        "hint": "Wie lange asks about duration.",
        "explanation": "sollen describes an instruction or recommendation.",
        "options": [
          "Wie lange soll ich warten?",
          "Wie oft soll ich kommen?",
          "Wo soll ich warten?"
        ],
        "id": "a2-clinic-exercise-4",
        "itemId": "a2-clinic-item-4"
      },
      {
        "mode": "sentence",
        "prompt": "Give the polite advice: \"You should rest.\"",
        "german": "Sie sollten sich ausruhen.",
        "english": "You should rest.",
        "answer": "Sie sollten sich ausruhen.",
        "hint": "Use sollten, then sich ausruhen.",
        "explanation": "sollten makes advice less direct. sich ausruhen means rest.",
        "tokens": [
          "Sie",
          "sollten",
          "sich",
          "ausruhen."
        ],
        "id": "a2-clinic-exercise-5",
        "itemId": "a2-clinic-item-5"
      },
      {
        "mode": "type",
        "prompt": "Say: \"I am already feeling better.\"",
        "german": "Mir geht es schon besser.",
        "english": "I am already feeling better.",
        "answer": "Mir geht es schon besser.",
        "hint": "Use Mir geht es …",
        "explanation": "The fixed expression Mir geht es … describes how you feel.",
        "acceptedAnswers": [
          "Mir geht es bereits besser."
        ],
        "id": "a2-clinic-exercise-6",
        "itemId": "a2-clinic-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What should the patient bring?",
        "german": "Bitte bringen Sie Ihre Versicherungskarte mit.",
        "english": "Please bring your insurance card with you.",
        "answer": "Their insurance card",
        "hint": "Listen for Versicherungskarte.",
        "explanation": "mitbringen is separable: bringen … mit.",
        "options": [
          "Their insurance card",
          "Their train ticket",
          "Their shopping list"
        ],
        "id": "a2-clinic-exercise-7",
        "itemId": "a2-clinic-item-7"
      }
    ]
  },
  {
    "id": "a2-archive",
    "level": "A2",
    "title": "The librarian remembers differently",
    "subtitle": "Ada would like the truth filed alphabetically",
    "npcId": "ada",
    "location": "Waldruh · The keeper’s records",
    "story": "Ada brings two versions of the same record. One says Elise closed the railway to protect Waldruh. The other says the residents agreed to disappear. Compare dates, ask for clarification and find out which lines were added later. Ada recognizes her own handwriting beneath the first signature. She was Elise’s apprentice, and she helped file the order. A sealed final record points to Nebelstadt. Ada will go with you; this time she intends to speak.",
    "objectives": [
      "Talk about earlier life and change",
      "Compare people and places",
      "Recover the second Atlas page"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Compare the old station with today: it used to be smaller.",
        "german": "Früher war der Bahnhof kleiner.",
        "english": "The station used to be smaller.",
        "answer": "Früher war der Bahnhof kleiner.",
        "hint": "Start with Früher; war is the past of ist.",
        "explanation": "war is the simple past of sein; kleiner is the comparative of klein.",
        "tokens": [
          "Früher",
          "war",
          "der",
          "Bahnhof",
          "kleiner."
        ],
        "id": "a2-archive-exercise-1",
        "itemId": "a2-archive-item-1"
      },
      {
        "mode": "listen",
        "prompt": "Listen. How did Ada often travel as a child?",
        "german": "Als Kind bin ich oft mit dem Zug gefahren.",
        "english": "As a child, I often travelled by train.",
        "answer": "By train",
        "hint": "mit dem Zug means by train.",
        "explanation": "fahren uses sein in the perfect when it describes travel: bin … gefahren.",
        "options": [
          "By train",
          "By bicycle",
          "On foot"
        ],
        "id": "a2-archive-exercise-2",
        "itemId": "a2-archive-item-2"
      },
      {
        "mode": "type",
        "prompt": "Ask Ada how long she has worked here, using Sie.",
        "german": "Seit wann arbeiten Sie hier?",
        "english": "Since when have you worked here?",
        "answer": "Seit wann arbeiten Sie hier?",
        "hint": "Start with Seit wann …?",
        "explanation": "Seit wann asks when an ongoing situation began. German uses present-tense arbeiten.",
        "id": "a2-archive-exercise-3",
        "itemId": "a2-archive-item-3"
      },
      {
        "mode": "choice",
        "prompt": "Choose the sentence saying this map is older than the other.",
        "german": "Diese Karte ist älter als die andere.",
        "english": "This map is older than the other one.",
        "answer": "Diese Karte ist älter als die andere.",
        "hint": "älter means older; als means than here.",
        "explanation": "alt changes to älter in the comparative.",
        "options": [
          "Diese Karte ist älter als die andere.",
          "Diese Karte ist neuer als die andere.",
          "Diese Karte ist genauso alt wie die andere."
        ],
        "id": "a2-archive-exercise-4",
        "itemId": "a2-archive-item-4"
      },
      {
        "mode": "sentence",
        "prompt": "Tell Ada that you are interested in history.",
        "german": "Ich interessiere mich für Geschichte.",
        "english": "I am interested in history.",
        "answer": "Ich interessiere mich für Geschichte.",
        "hint": "Use interessiere mich für …",
        "explanation": "sich interessieren für is a reflexive expression for being interested in something.",
        "tokens": [
          "Ich",
          "interessiere",
          "mich",
          "für",
          "Geschichte."
        ],
        "id": "a2-archive-exercise-5",
        "itemId": "a2-archive-item-5"
      },
      {
        "mode": "type",
        "prompt": "Ask politely for a more detailed explanation.",
        "german": "Können Sie mir das genauer erklären?",
        "english": "Can you explain that to me in more detail?",
        "answer": "Können Sie mir das genauer erklären?",
        "hint": "Use mir and genauer before erklären.",
        "explanation": "genauer means more precisely or in more detail.",
        "acceptedAnswers": [
          "Können Sie mir das bitte genauer erklären?"
        ],
        "id": "a2-archive-exercise-6",
        "itemId": "a2-archive-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Where is the library now?",
        "german": "Die Bibliothek ist inzwischen in die Altstadt umgezogen.",
        "english": "The library has since moved to the old town.",
        "answer": "In the old town",
        "hint": "Altstadt means old town.",
        "explanation": "inzwischen refers to a change between an earlier time and now; umziehen uses sein for moving home or premises.",
        "options": [
          "In the old town",
          "At the station",
          "By the market"
        ],
        "id": "a2-archive-exercise-7",
        "itemId": "a2-archive-item-7"
      }
    ]
  },
  {
    "id": "b1-witness",
    "level": "B1",
    "title": "The witness who arrived before herself",
    "subtitle": "Three accounts, one rather nervous pigeon",
    "npcId": "lina",
    "location": "Nebelstadt · Harbor post office",
    "story": "The lighthouse shines a dark beam across Nebelstadt’s archive. Lina’s sender was seen arriving twice before anyone saw her leave. Compare the witnesses’ accounts and separate what they saw from what they assumed. One appearance was a recorded echo from Waldruh’s missing hour. The living witness carried Elise’s original agreement. The Brass Office copied her voice, then used it to make silence sound like consent.",
    "objectives": [
      "Understand a connected witness account",
      "Describe sequence and uncertainty",
      "Explain a contradiction respectfully"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Report: \"When I arrived at the station, the train had already gone.\"",
        "german": "Als ich am Bahnhof ankam, war der Zug schon weg.",
        "english": "When I arrived at the station, the train had already gone.",
        "answer": "Als ich am Bahnhof ankam, war der Zug schon weg.",
        "hint": "In the als clause, ankam goes last. Then comes war.",
        "explanation": "als introduces a single event in the past. The following main clause begins with its finite verb.",
        "tokens": [
          "Als",
          "ich",
          "am",
          "Bahnhof",
          "ankam,",
          "war",
          "der",
          "Zug",
          "schon",
          "weg."
        ],
        "id": "b1-witness-exercise-1",
        "itemId": "b1-witness-item-1"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Why could the witness not identify the person?",
        "german": "Ich konnte ihr Gesicht nicht erkennen, weil es zu dunkel war.",
        "english": "I could not make out her face because it was too dark.",
        "answer": "It was too dark.",
        "hint": "Look for the reason after weil.",
        "explanation": "erkennen means recognize or make out. war ends the weil clause.",
        "options": [
          "It was too dark.",
          "The witness forgot their glasses.",
          "The person ran away."
        ],
        "id": "b1-witness-exercise-2",
        "itemId": "b1-witness-item-2"
      },
      {
        "mode": "type",
        "prompt": "Write a cautious response: \"I am not sure whether that is true.\"",
        "german": "Ich bin mir nicht sicher, ob das stimmt.",
        "english": "I am not sure whether that is true.",
        "answer": "Ich bin mir nicht sicher, ob das stimmt.",
        "hint": "Use Ich bin mir nicht sicher, ob …",
        "explanation": "ob introduces an indirect yes/no question; stimmt goes at the end.",
        "acceptedAnswers": [
          "Ich bin nicht sicher, ob das stimmt.",
          "Ich bin mir nicht sicher ob das stimmt.",
          "Ich bin nicht sicher ob das stimmt."
        ],
        "id": "b1-witness-exercise-3",
        "itemId": "b1-witness-item-3"
      },
      {
        "mode": "sentence",
        "prompt": "Put the events in order: she waited first and left afterwards.",
        "german": "Zuerst hat sie gewartet, danach ist sie gegangen.",
        "english": "First she waited; afterwards she left.",
        "answer": "Zuerst hat sie gewartet, danach ist sie gegangen.",
        "hint": "hat … gewartet, then ist … gegangen.",
        "explanation": "warten uses haben; gehen uses sein for movement. danach marks the next event.",
        "tokens": [
          "Zuerst",
          "hat",
          "sie",
          "gewartet,",
          "danach",
          "ist",
          "sie",
          "gegangen."
        ],
        "id": "b1-witness-exercise-4",
        "itemId": "b1-witness-item-4"
      },
      {
        "mode": "choice",
        "prompt": "A timetable disagrees with the witness’s statement. Choose the precise response.",
        "german": "Das widerspricht der Aussage des Zeugen.",
        "english": "That contradicts the witness’s statement.",
        "answer": "Das widerspricht der Aussage des Zeugen.",
        "hint": "widersprechen means contradict.",
        "explanation": "widersprechen takes dative: der Aussage. des Zeugen means of the witness.",
        "options": [
          "Das widerspricht der Aussage des Zeugen.",
          "Das bestätigt die Aussage des Zeugen.",
          "Das erklärt die Verspätung des Zuges."
        ],
        "id": "b1-witness-exercise-5",
        "itemId": "b1-witness-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Ask politely for a description of what the witness saw.",
        "german": "Könnten Sie beschreiben, was Sie gesehen haben?",
        "english": "Could you describe what you saw?",
        "answer": "Könnten Sie beschreiben, was Sie gesehen haben?",
        "hint": "The indirect clause ends with gesehen haben.",
        "explanation": "An indirect question keeps its finite verb at the end.",
        "tokens": [
          "Könnten",
          "Sie",
          "beschreiben,",
          "was",
          "Sie",
          "gesehen",
          "haben?"
        ],
        "id": "b1-witness-exercise-6",
        "itemId": "b1-witness-item-6"
      },
      {
        "mode": "type",
        "prompt": "Offer a possibility: \"Perhaps she took the wrong train.\"",
        "german": "Vielleicht hat sie den falschen Zug genommen.",
        "english": "Perhaps she took the wrong train.",
        "answer": "Vielleicht hat sie den falschen Zug genommen.",
        "hint": "Start with Vielleicht hat sie …",
        "explanation": "vielleicht expresses uncertainty. nehmen has the past participle genommen.",
        "acceptedAnswers": [
          "Sie hat vielleicht den falschen Zug genommen."
        ],
        "id": "b1-witness-exercise-7",
        "itemId": "b1-witness-item-7"
      }
    ]
  },
  {
    "id": "b1-new-route",
    "level": "B1",
    "title": "A town worth reconnecting",
    "subtitle": "Maps are useful; people are better",
    "npcId": "otto",
    "location": "Nebelstadt · Railway quay",
    "story": "The Lamplighters want every erased railway reopened tonight. The Unwritten Circle wants a route that leaves its gardens and homes intact. Otto has a workable timetable; Greta has a map of everything it would destroy. Compare alternatives, explain conditions and propose a connection people can actually use. The Atlas reacts to practical promises. It does not react to a heroic speech, much to Otto’s disappointment.",
    "objectives": [
      "Explain travel problems and solutions",
      "Use conditions and alternatives",
      "Propose a workable new route"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Give a backup plan: if the train is cancelled, take the bus.",
        "german": "Wenn der Zug ausfällt, nehmen wir den Bus.",
        "english": "If the train is cancelled, we will take the bus.",
        "answer": "Wenn der Zug ausfällt, nehmen wir den Bus.",
        "hint": "ausfällt ends the wenn clause; nehmen begins the main clause.",
        "explanation": "wenn introduces a condition; ausfallen means be cancelled or fail to run.",
        "tokens": [
          "Wenn",
          "der",
          "Zug",
          "ausfällt,",
          "nehmen",
          "wir",
          "den",
          "Bus."
        ],
        "id": "b1-new-route-exercise-1",
        "itemId": "b1-new-route-item-1"
      },
      {
        "mode": "type",
        "prompt": "Write the group’s goal: \"We must find a solution that works for everyone.\"",
        "german": "Wir müssen eine Lösung finden, die für alle passt.",
        "english": "We must find a solution that works for everyone.",
        "answer": "Wir müssen eine Lösung finden, die für alle passt.",
        "hint": "Use eine Lösung finden, die …",
        "explanation": "The relative pronoun die refers to feminine Lösung. passt ends the relative clause.",
        "acceptedAnswers": [
          "Wir müssen eine Lösung finden, die für alle funktioniert.",
          "Wir müssen eine Lösung finden die für alle passt.",
          "Wir müssen eine Lösung finden die für alle funktioniert."
        ],
        "id": "b1-new-route-exercise-2",
        "itemId": "b1-new-route-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What is the disadvantage of the new route?",
        "german": "Die neue Strecke wäre kürzer, aber die Fahrkarten wären teurer.",
        "english": "The new route would be shorter, but the tickets would be more expensive.",
        "answer": "The tickets would cost more.",
        "hint": "The disadvantage follows aber.",
        "explanation": "wäre and wären describe a hypothetical situation; teurer means more expensive.",
        "options": [
          "The tickets would cost more.",
          "The journey would take longer.",
          "There would be fewer trains."
        ],
        "id": "b1-new-route-exercise-3",
        "itemId": "b1-new-route-item-3"
      },
      {
        "mode": "sentence",
        "prompt": "Suggest walking instead of waiting.",
        "german": "Statt zu warten, könnten wir zu Fuß gehen.",
        "english": "Instead of waiting, we could walk.",
        "answer": "Statt zu warten, könnten wir zu Fuß gehen.",
        "hint": "Use Statt zu warten, then könnten wir …",
        "explanation": "statt zu introduces an alternative to an action. zu Fuß gehen means walk.",
        "tokens": [
          "Statt",
          "zu",
          "warten,",
          "könnten",
          "wir",
          "zu",
          "Fuß",
          "gehen."
        ],
        "id": "b1-new-route-exercise-4",
        "itemId": "b1-new-route-item-4"
      },
      {
        "mode": "choice",
        "prompt": "Before choosing a route, suggest comparing its good and bad points.",
        "german": "Wir sollten die Vor- und Nachteile vergleichen.",
        "english": "We should compare the advantages and disadvantages.",
        "answer": "Wir sollten die Vor- und Nachteile vergleichen.",
        "hint": "Vor- und Nachteile are advantages and disadvantages.",
        "explanation": "vergleichen means compare; sollten expresses a recommendation.",
        "options": [
          "Wir sollten die Vor- und Nachteile vergleichen.",
          "Wir sollten die Fahrkarten vergessen.",
          "Wir sollten die Entscheidung verschieben."
        ],
        "id": "b1-new-route-exercise-5",
        "itemId": "b1-new-route-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Explain that the longer route is nevertheless cheaper.",
        "german": "Obwohl die Strecke länger ist, ist sie günstiger.",
        "english": "Although the route is longer, it is cheaper.",
        "answer": "Obwohl die Strecke länger ist, ist sie günstiger.",
        "hint": "The obwohl clause ends in ist; the main clause begins with ist.",
        "explanation": "obwohl introduces a contrast. günstiger can mean cheaper or more favourable.",
        "tokens": [
          "Obwohl",
          "die",
          "Strecke",
          "länger",
          "ist,",
          "ist",
          "sie",
          "günstiger."
        ],
        "id": "b1-new-route-exercise-6",
        "itemId": "b1-new-route-item-6"
      },
      {
        "mode": "type",
        "prompt": "Suggest leaving earlier using a dass clause.",
        "german": "Ich schlage vor, dass wir früher losfahren.",
        "english": "I suggest that we leave earlier.",
        "answer": "Ich schlage vor, dass wir früher losfahren.",
        "hint": "Start with Ich schlage vor, dass …",
        "explanation": "vorschlagen is separable; losfahren goes last in the dass clause.",
        "acceptedAnswers": [
          "Ich schlage vor, dass wir eher losfahren.",
          "Ich schlage vor dass wir früher losfahren.",
          "Ich schlage vor dass wir eher losfahren."
        ],
        "id": "b1-new-route-exercise-7",
        "itemId": "b1-new-route-item-7"
      }
    ]
  },
  {
    "id": "b1-work",
    "level": "B1",
    "title": "The job description has escaped",
    "subtitle": "Emil is hiring, probably on purpose",
    "npcId": "emil",
    "location": "Nebelstadt · Lantern repair dock",
    "story": "Emil needs an assistant before the lighthouse’s next great bell. His job advert promises flexible hours because the clock bends them; sensible working conditions are your first repair. Explain skills, responsibilities and a safe work schedule. The maintenance log reveals that the eraser worked exactly as designed. The Brass Office kept repairing it long after the conflict ended. The missing route has been useful to someone.",
    "objectives": [
      "Describe experience and responsibilities",
      "Ask for practical clarification",
      "Prepare a realistic work arrangement"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Describe experience dealing with customers.",
        "german": "Ich habe Erfahrung im Umgang mit Kunden.",
        "english": "I have experience dealing with customers.",
        "answer": "Ich habe Erfahrung im Umgang mit Kunden.",
        "hint": "Use Erfahrung im Umgang mit …",
        "explanation": "im Umgang mit is a useful professional chunk meaning in dealing with.",
        "tokens": [
          "Ich",
          "habe",
          "Erfahrung",
          "im",
          "Umgang",
          "mit",
          "Kunden."
        ],
        "id": "b1-work-exercise-1",
        "itemId": "b1-work-item-1"
      },
      {
        "mode": "type",
        "prompt": "Write: \"My responsibilities include scheduling appointments.\"",
        "german": "Zu meinen Aufgaben gehört die Planung der Termine.",
        "english": "My responsibilities include scheduling appointments.",
        "answer": "Zu meinen Aufgaben gehört die Planung der Termine.",
        "hint": "Use Zu meinen Aufgaben gehört …",
        "explanation": "The singular subject is die Planung, so the verb is gehört.",
        "acceptedAnswers": [
          "Die Planung der Termine gehört zu meinen Aufgaben."
        ],
        "id": "b1-work-exercise-2",
        "itemId": "b1-work-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What is different on Fridays?",
        "german": "Die Arbeitszeit beginnt um acht, aber freitags arbeiten wir von zu Hause.",
        "english": "Work starts at eight, but on Fridays we work from home.",
        "answer": "They work from home.",
        "hint": "The difference follows aber freitags.",
        "explanation": "freitags means on Fridays regularly; von zu Hause means from home.",
        "options": [
          "They work from home.",
          "They start at ten.",
          "They do not work."
        ],
        "id": "b1-work-exercise-3",
        "itemId": "b1-work-item-3"
      },
      {
        "mode": "sentence",
        "prompt": "Explain that you want to take on more responsibility.",
        "german": "Ich würde gern mehr Verantwortung übernehmen.",
        "english": "I would like to take on more responsibility.",
        "answer": "Ich würde gern mehr Verantwortung übernehmen.",
        "hint": "Use würde gern and Verantwortung übernehmen.",
        "explanation": "Verantwortung übernehmen means take on responsibility.",
        "tokens": [
          "Ich",
          "würde",
          "gern",
          "mehr",
          "Verantwortung",
          "übernehmen."
        ],
        "id": "b1-work-exercise-4",
        "itemId": "b1-work-item-4"
      },
      {
        "mode": "choice",
        "prompt": "Ask which things are important for doing the job well.",
        "german": "Könnten Sie mir sagen, worauf es bei der Arbeit ankommt?",
        "english": "Could you tell me what matters in this job?",
        "answer": "Könnten Sie mir sagen, worauf es bei der Arbeit ankommt?",
        "hint": "worauf es ankommt means what matters.",
        "explanation": "ankommen auf expresses what is important. In the indirect question ankommt is joined and placed last.",
        "options": [
          "Könnten Sie mir sagen, worauf es bei der Arbeit ankommt?",
          "Könnten Sie mir sagen, wo die Arbeit stattfindet?",
          "Könnten Sie mir sagen, wann die Arbeit beginnt?"
        ],
        "id": "b1-work-exercise-5",
        "itemId": "b1-work-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Say you want to clarify the conditions before starting.",
        "german": "Bevor ich anfange, möchte ich die Bedingungen klären.",
        "english": "Before I start, I would like to clarify the conditions.",
        "answer": "Bevor ich anfange, möchte ich die Bedingungen klären.",
        "hint": "anfange ends the bevor clause; möchte begins the main clause.",
        "explanation": "bevor introduces an earlier prerequisite action. Bedingungen means conditions.",
        "tokens": [
          "Bevor",
          "ich",
          "anfange,",
          "möchte",
          "ich",
          "die",
          "Bedingungen",
          "klären."
        ],
        "id": "b1-work-exercise-6",
        "itemId": "b1-work-item-6"
      },
      {
        "mode": "type",
        "prompt": "Describe these two strengths: learning quickly and enjoying teamwork.",
        "german": "Ich lerne schnell und arbeite gern im Team.",
        "english": "I learn quickly and enjoy working in a team.",
        "answer": "Ich lerne schnell und arbeite gern im Team.",
        "hint": "Connect two main clauses with und.",
        "explanation": "gern after a verb expresses enjoying that activity.",
        "acceptedAnswers": [
          "Ich lerne schnell und arbeite gerne im Team."
        ],
        "id": "b1-work-exercise-7",
        "itemId": "b1-work-item-7"
      }
    ]
  },
  {
    "id": "b1-council",
    "level": "B1",
    "title": "The council of inconvenient opinions",
    "subtitle": "Seven chairs, eight opinions",
    "npcId": "ada",
    "location": "Nebelstadt · Council archive",
    "story": "Seven chairs, eight opinions, and a lighthouse that records every pause. Ada presents Elise’s original order: she tried to stop a dangerous dispute, then officials kept the village silent to hide what followed. The council must decide how to restore the route and acknowledge the people it erased. Give reasons, question assumptions and make room for disagreement. The dark beam weakens when the residents are heard; it grows stronger when their answers are replaced.",
    "objectives": [
      "State and support an opinion",
      "Agree or disagree respectfully",
      "Offer a concrete compromise"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "State your opinion that the route should reopen.",
        "german": "Meiner Meinung nach sollten wir die Strecke wieder öffnen.",
        "english": "In my opinion, we should reopen the route.",
        "answer": "Meiner Meinung nach sollten wir die Strecke wieder öffnen.",
        "hint": "Begin Meiner Meinung nach; sollten is the finite verb.",
        "explanation": "Meiner Meinung nach is a common way to introduce an opinion.",
        "tokens": [
          "Meiner",
          "Meinung",
          "nach",
          "sollten",
          "wir",
          "die",
          "Strecke",
          "wieder",
          "öffnen."
        ],
        "id": "b1-council-exercise-1",
        "itemId": "b1-council-item-1"
      },
      {
        "mode": "type",
        "prompt": "Support the plan because the connection is important.",
        "german": "Ich bin dafür, weil die Verbindung wichtig ist.",
        "english": "I am in favour because the connection is important.",
        "answer": "Ich bin dafür, weil die Verbindung wichtig ist.",
        "hint": "Use Ich bin dafür, weil …",
        "explanation": "dafür means in favour. wichtig ist ends the reason clause.",
        "acceptedAnswers": [
          "Ich bin dafür, denn die Verbindung ist wichtig.",
          "Ich bin dafür weil die Verbindung wichtig ist.",
          "Ich bin dafür denn die Verbindung ist wichtig."
        ],
        "id": "b1-council-exercise-2",
        "itemId": "b1-council-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What concerns the speaker?",
        "german": "Ich verstehe den Vorschlag, trotzdem mache ich mir Sorgen um die Kosten.",
        "english": "I understand the proposal; nevertheless, I am worried about the costs.",
        "answer": "The costs",
        "hint": "The concern follows Sorgen um.",
        "explanation": "sich Sorgen machen um means worry about; trotzdem expresses nevertheless.",
        "options": [
          "The costs",
          "The timetable",
          "The weather"
        ],
        "id": "b1-council-exercise-3",
        "itemId": "b1-council-item-3"
      },
      {
        "mode": "sentence",
        "prompt": "Agree with Ada politely.",
        "german": "Da stimme ich Ihnen zu.",
        "english": "I agree with you on that.",
        "answer": "Da stimme ich Ihnen zu.",
        "hint": "Use stimme … zu with Ihnen.",
        "explanation": "zustimmen takes dative: Ihnen. The separable zu goes at the end.",
        "tokens": [
          "Da",
          "stimme",
          "ich",
          "Ihnen",
          "zu."
        ],
        "id": "b1-council-exercise-4",
        "itemId": "b1-council-item-4"
      },
      {
        "mode": "choice",
        "prompt": "Disagree respectfully because the group still lacks information.",
        "german": "Ich sehe das anders, weil wir noch nicht genug wissen.",
        "english": "I see it differently because we do not know enough yet.",
        "answer": "Ich sehe das anders, weil wir noch nicht genug wissen.",
        "hint": "anders means differently.",
        "explanation": "Ich sehe das anders is a respectful disagreement; the reason follows weil.",
        "options": [
          "Ich sehe das anders, weil wir noch nicht genug wissen.",
          "Ich sehe das genauso, weil der Plan gut ist.",
          "Ich weiß nicht, wann der Zug abfährt."
        ],
        "id": "b1-council-exercise-5",
        "itemId": "b1-council-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Propose a one-week trial before a final decision.",
        "german": "Wir könnten zunächst eine Woche lang testen.",
        "english": "We could test it for one week first.",
        "answer": "Wir könnten zunächst eine Woche lang testen.",
        "hint": "Use könnten and zunächst; testen goes last.",
        "explanation": "zunächst means initially. eine Woche lang gives a duration.",
        "tokens": [
          "Wir",
          "könnten",
          "zunächst",
          "eine",
          "Woche",
          "lang",
          "testen."
        ],
        "id": "b1-council-exercise-6",
        "itemId": "b1-council-item-6"
      },
      {
        "mode": "type",
        "prompt": "Propose gradually reopening the route as a compromise.",
        "german": "Ein Kompromiss wäre, die Strecke schrittweise zu öffnen.",
        "english": "A compromise would be to open the route gradually.",
        "answer": "Ein Kompromiss wäre, die Strecke schrittweise zu öffnen.",
        "hint": "Use Ein Kompromiss wäre, then a zu infinitive.",
        "explanation": "schrittweise means step by step. The infinitive phrase explains the compromise.",
        "acceptedAnswers": [
          "Ein Kompromiss wäre, die Strecke nach und nach zu öffnen.",
          "Ein Kompromiss wäre die Strecke schrittweise zu öffnen.",
          "Ein Kompromiss wäre die Strecke nach und nach zu öffnen."
        ],
        "id": "b1-council-exercise-7",
        "itemId": "b1-council-item-7"
      }
    ]
  },
  {
    "id": "b1-storm",
    "level": "B1",
    "title": "The weather has read the timetable",
    "subtitle": "Greta would like to lodge a complaint with the clouds",
    "npcId": "greta",
    "location": "Nebelstadt · Observatory garden",
    "story": "A storm cuts the power before the council can finish its agreement. The seventh bell will ring anyway. Greta protects the conservatory; Lina moves supplies; Otto keeps the railway clear; Emil needs help at the lamp mechanism. Give useful instructions and explain the consequences of each plan. No single person can save every place. A chain of small, trustworthy promises carries light from the garden to the lighthouse.",
    "objectives": [
      "Understand a disruption notice",
      "Give advice and explain consequences",
      "Organize a safe festival alternative"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Report that the storm caused the event to be cancelled.",
        "german": "Wegen des Sturms wurde die Veranstaltung abgesagt.",
        "english": "The event was cancelled because of the storm.",
        "answer": "Wegen des Sturms wurde die Veranstaltung abgesagt.",
        "hint": "Use Wegen des Sturms, then wurde … abgesagt.",
        "explanation": "wurde plus a past participle reports a past passive event. des Sturms is genitive after wegen.",
        "tokens": [
          "Wegen",
          "des",
          "Sturms",
          "wurde",
          "die",
          "Veranstaltung",
          "abgesagt."
        ],
        "id": "b1-storm-exercise-1",
        "itemId": "b1-storm-item-1"
      },
      {
        "mode": "type",
        "prompt": "Recommend informing the guests beforehand.",
        "german": "Es wäre besser, die Gäste vorher zu informieren.",
        "english": "It would be better to inform the guests beforehand.",
        "answer": "Es wäre besser, die Gäste vorher zu informieren.",
        "hint": "Start Es wäre besser, then die Gäste … zu informieren.",
        "explanation": "wäre makes the recommendation less direct; vorher means beforehand.",
        "acceptedAnswers": [
          "Es wäre besser, die Gäste im Voraus zu informieren.",
          "Es wäre besser die Gäste vorher zu informieren.",
          "Es wäre besser die Gäste im Voraus zu informieren."
        ],
        "id": "b1-storm-exercise-2",
        "itemId": "b1-storm-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Where will the festival take place if the rain continues?",
        "german": "Falls es weiter regnet, findet das Fest in der Halle statt.",
        "english": "If it keeps raining, the festival will take place in the hall.",
        "answer": "In the hall",
        "hint": "Listen to the location after findet.",
        "explanation": "falls introduces a possible condition; stattfinden is separable in the main clause.",
        "options": [
          "In the hall",
          "In the garden",
          "At the station"
        ],
        "id": "b1-storm-exercise-3",
        "itemId": "b1-storm-item-3"
      },
      {
        "mode": "sentence",
        "prompt": "Recommend avoiding unnecessary rubbish.",
        "german": "Wir sollten vermeiden, unnötig Müll zu produzieren.",
        "english": "We should avoid producing unnecessary rubbish.",
        "answer": "Wir sollten vermeiden, unnötig Müll zu produzieren.",
        "hint": "Use sollten vermeiden, then a zu infinitive.",
        "explanation": "vermeiden means avoid; unnötig means unnecessary.",
        "tokens": [
          "Wir",
          "sollten",
          "vermeiden,",
          "unnötig",
          "Müll",
          "zu",
          "produzieren."
        ],
        "id": "b1-storm-exercise-4",
        "itemId": "b1-storm-item-4"
      },
      {
        "mode": "choice",
        "prompt": "Choose the sentence connecting less waste with greater savings.",
        "german": "Je weniger wir verschwenden, desto mehr sparen wir.",
        "english": "The less we waste, the more we save.",
        "answer": "Je weniger wir verschwenden, desto mehr sparen wir.",
        "hint": "Look for weniger with waste and mehr with savings.",
        "explanation": "je … desto … links changes in two quantities.",
        "options": [
          "Je weniger wir verschwenden, desto mehr sparen wir.",
          "Je mehr wir verschwenden, desto weniger sparen wir.",
          "Wir sparen nichts, obwohl wir weniger verschwenden."
        ],
        "id": "b1-storm-exercise-5",
        "itemId": "b1-storm-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Advise a friend to get help using a hypothetical condition.",
        "german": "Wenn ich an deiner Stelle wäre, würde ich Hilfe holen.",
        "english": "If I were in your position, I would get help.",
        "answer": "Wenn ich an deiner Stelle wäre, würde ich Hilfe holen.",
        "hint": "Use Wenn ich an deiner Stelle wäre, würde ich …",
        "explanation": "wäre and würde describe an imagined situation. an deiner Stelle means in your position.",
        "tokens": [
          "Wenn",
          "ich",
          "an",
          "deiner",
          "Stelle",
          "wäre,",
          "würde",
          "ich",
          "Hilfe",
          "holen."
        ],
        "id": "b1-storm-exercise-6",
        "itemId": "b1-storm-item-6"
      },
      {
        "mode": "type",
        "prompt": "Emphasize that solving the problem requires everyone.",
        "german": "Wir können das Problem nur gemeinsam lösen.",
        "english": "We can only solve the problem together.",
        "answer": "Wir können das Problem nur gemeinsam lösen.",
        "hint": "Use nur gemeinsam; lösen goes last.",
        "explanation": "gemeinsam means together or jointly. nur limits how the solution can happen.",
        "acceptedAnswers": [
          "Nur gemeinsam können wir das Problem lösen."
        ],
        "id": "b1-storm-exercise-7",
        "itemId": "b1-storm-item-7"
      }
    ]
  },
  {
    "id": "b1-atlas",
    "level": "B1",
    "title": "The page nobody wanted to write",
    "subtitle": "The truth belongs to the people who live it",
    "npcId": "ada",
    "location": "Nebelstadt · The last Atlas page",
    "story": "The last page is blank because nobody can write an agreement for everyone else. Report what happened, distinguish motives from excuses, and help the residents state what they will do together. Elise’s protective erasure became the Brass Office’s silence; restoring the route also means preserving that uncomfortable truth. When the final promises are understood, the Atlas draws Waldruh back into the world. The seventh bell rings harmlessly. Then a fourth, unfamiliar coastline appears beyond the restored railway.",
    "objectives": [
      "Summarize an account and explain motives",
      "Clarify and correct a misunderstanding",
      "Write a practical agreement for the restored route"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "prompt": "Summarize the report: both sides made mistakes.",
        "german": "Der Bericht zeigt, dass beide Seiten Fehler gemacht haben.",
        "english": "The report shows that both sides made mistakes.",
        "answer": "Der Bericht zeigt, dass beide Seiten Fehler gemacht haben.",
        "hint": "Use zeigt, dass; gemacht haben ends the clause.",
        "explanation": "A dass clause gives the report’s content. beide Seiten means both sides.",
        "tokens": [
          "Der",
          "Bericht",
          "zeigt,",
          "dass",
          "beide",
          "Seiten",
          "Fehler",
          "gemacht",
          "haben."
        ],
        "id": "b1-atlas-exercise-1",
        "itemId": "b1-atlas-item-1"
      },
      {
        "mode": "type",
        "prompt": "Explain her intention: preventing the dispute from getting worse.",
        "german": "Sie wollte verhindern, dass der Streit schlimmer wird.",
        "english": "She wanted to prevent the dispute from getting worse.",
        "answer": "Sie wollte verhindern, dass der Streit schlimmer wird.",
        "hint": "Use wollte verhindern, dass …",
        "explanation": "verhindern means prevent; schlimmer is the comparative of schlimm.",
        "acceptedAnswers": [
          "Sie wollte verhindern, dass der Konflikt schlimmer wird.",
          "Sie wollte verhindern dass der Streit schlimmer wird.",
          "Sie wollte verhindern dass der Konflikt schlimmer wird."
        ],
        "id": "b1-atlas-exercise-2",
        "itemId": "b1-atlas-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What matters most to the residents?",
        "german": "Die Bewohner wünschen sich eine Verbindung, auf die sie sich verlassen können.",
        "english": "The residents want a connection they can rely on.",
        "answer": "A reliable connection",
        "hint": "sich verlassen auf means rely on.",
        "explanation": "The relative clause describes the connection. auf die refers back to feminine Verbindung.",
        "options": [
          "A reliable connection",
          "A cheaper café",
          "A bigger archive"
        ],
        "id": "b1-atlas-exercise-3",
        "itemId": "b1-atlas-item-3"
      },
      {
        "mode": "sentence",
        "prompt": "Check whether Ada means that she needs more time.",
        "german": "Habe ich Sie richtig verstanden, dass Sie mehr Zeit brauchen?",
        "english": "Have I understood you correctly that you need more time?",
        "answer": "Habe ich Sie richtig verstanden, dass Sie mehr Zeit brauchen?",
        "hint": "Begin Habe ich Sie richtig verstanden, dass …",
        "explanation": "This phrase checks understanding without assuming that you understood correctly.",
        "tokens": [
          "Habe",
          "ich",
          "Sie",
          "richtig",
          "verstanden,",
          "dass",
          "Sie",
          "mehr",
          "Zeit",
          "brauchen?"
        ],
        "id": "b1-atlas-exercise-4",
        "itemId": "b1-atlas-item-4"
      },
      {
        "mode": "choice",
        "prompt": "Correct a misunderstanding about what you meant.",
        "german": "Entschuldigung, das habe ich anders gemeint.",
        "english": "Sorry, I meant that differently.",
        "answer": "Entschuldigung, das habe ich anders gemeint.",
        "hint": "meinen means mean or intend.",
        "explanation": "anders gemeint says the intended meaning was different.",
        "options": [
          "Entschuldigung, das habe ich anders gemeint.",
          "Entschuldigung, das habe ich schon bezahlt.",
          "Entschuldigung, das habe ich gestern gekauft."
        ],
        "id": "b1-atlas-exercise-5",
        "itemId": "b1-atlas-item-5"
      },
      {
        "mode": "sentence",
        "prompt": "Create an agreement to discuss problems early.",
        "german": "Wir vereinbaren, dass wir Probleme frühzeitig besprechen.",
        "english": "We agree that we will discuss problems early.",
        "answer": "Wir vereinbaren, dass wir Probleme frühzeitig besprechen.",
        "hint": "Use Wir vereinbaren, dass …",
        "explanation": "vereinbaren means agree or arrange; frühzeitig means at an early stage.",
        "tokens": [
          "Wir",
          "vereinbaren,",
          "dass",
          "wir",
          "Probleme",
          "frühzeitig",
          "besprechen."
        ],
        "id": "b1-atlas-exercise-6",
        "itemId": "b1-atlas-item-6"
      },
      {
        "mode": "type",
        "prompt": "Finish your message by looking forward to discovering the new route together.",
        "german": "Ich freue mich darauf, die neue Strecke gemeinsam zu entdecken.",
        "english": "I look forward to discovering the new route together.",
        "answer": "Ich freue mich darauf, die neue Strecke gemeinsam zu entdecken.",
        "hint": "Use freue mich darauf, then a zu infinitive.",
        "explanation": "sich freuen auf describes looking forward to something; darauf points to the following infinitive phrase.",
        "acceptedAnswers": [
          "Ich freue mich darauf, die neue Strecke zusammen zu entdecken.",
          "Ich freue mich darauf die neue Strecke gemeinsam zu entdecken.",
          "Ich freue mich darauf die neue Strecke zusammen zu entdecken."
        ],
        "id": "b1-atlas-exercise-7",
        "itemId": "b1-atlas-item-7"
      }
    ]
  }
];

/** Each target is a useful contextual chunk; repeats in story do not imply a new mastery item. */
export const vocabulary: VocabularyItem[] = quests.flatMap(quest =>
  quest.exercises.map(exercise => ({
    id: exercise.itemId,
    german: exercise.german,
    english: exercise.english,
    level: quest.level,
    example: exercise.german,
  }))
);

export const npcQuests = (npcId: string, level?: Level): Quest[] =>
  quests.filter(quest => quest.npcId === npcId && (!level || quest.level === level));
