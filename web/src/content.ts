import type { Narrative } from './sentence-translations';

/** Original glotworld learning content. Curriculum tags describe practice, not certification. */
export type Level = 'A1' | 'A2' | 'B1';
export type ExerciseMode = 'choice' | 'listen' | 'sentence' | 'type';
export interface Exercise {
  id: string;
  /** Public authored sentence references; model answers arrive only after grading. */
  sentenceId?: string;
  exampleSentenceId?: string;
  optionSentenceIds?: Record<string, string>;
  audioRequires?: boolean;
  wordIds?: string[];
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
  /** Sentence starts, German nouns and formal Sie retain their authored capitals. */
  caseSensitive?: boolean;
}
export interface Quest {
  id: string;
  level: Level;
  title: string;
  subtitle: string;
  npcId: string;
  location: string;
  story: Narrative;
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
  greetingSentences?: Narrative;
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
    "greeting": "Willkommen! Möchtest du einen Kaffee?",
    "greetingSentences": [
      {
        "german": "Willkommen!",
        "english": "Welcome!"
      },
      {
        "german": "Möchtest du einen Kaffee?",
        "english": "Would you like a coffee?"
      }
    ]
  },
  {
    "id": "otto",
    "name": "Otto",
    "role": "Stationmaster · suspicious of punctual pigeons",
    "x": 0.815,
    "y": 0.299,
    "color": "#8CA7E8",
    "greeting": "Guten Tag! Wohin möchtest du fahren?",
    "greetingSentences": [
      {
        "german": "Guten Tag!",
        "english": "Good day!"
      },
      {
        "german": "Wohin möchtest du fahren?",
        "english": "Where would you like to travel?"
      }
    ]
  },
  {
    "id": "lina",
    "name": "Lina",
    "role": "Courier · delivers to yesterday if necessary",
    "x": 0.603,
    "y": 0.68,
    "color": "#DB8EAB",
    "greeting": "Hallo! Kannst du mir mit diesem Paket helfen?",
    "greetingSentences": [
      {
        "german": "Hallo!",
        "english": "Hello!"
      },
      {
        "german": "Kannst du mir mit diesem Paket helfen?",
        "english": "Can you help me with this parcel?"
      }
    ]
  },
  {
    "id": "emil",
    "name": "Emil",
    "role": "Inventor · almost everything works",
    "x": 0.228,
    "y": 0.738,
    "color": "#D3B36E",
    "greeting": "Hallo! Suchst du etwas?",
    "greetingSentences": [
      {
        "german": "Hallo!",
        "english": "Hello!"
      },
      {
        "german": "Suchst du etwas?",
        "english": "Are you looking for something?"
      }
    ]
  },
  {
    "id": "ada",
    "name": "Ada",
    "role": "Archivist · remembers the missing pages",
    "x": 0.132,
    "y": 0.322,
    "color": "#AB97D6",
    "greeting": "Willkommen in der Bibliothek. Was möchtest du wissen?",
    "greetingSentences": [
      {
        "german": "Willkommen in der Bibliothek.",
        "english": "Welcome to the library."
      },
      {
        "german": "Was möchtest du wissen?",
        "english": "What would you like to know?"
      }
    ]
  },
  {
    "id": "fritz",
    "name": "Fritz",
    "role": "Market trader · founder of the soup club",
    "x": 0.775,
    "y": 0.475,
    "color": "#8AB77D",
    "greeting": "Guten Morgen! Was darf es sein?",
    "greetingSentences": [
      {
        "german": "Guten Morgen!",
        "english": "Good morning!"
      },
      {
        "german": "Was darf es sein?",
        "english": "What would you like?"
      }
    ]
  },
  {
    "id": "greta",
    "name": "Greta",
    "role": "Botanist · the fern is under observation",
    "x": 0.414,
    "y": 0.707,
    "color": "#72B7A8",
    "greeting": "Hallo! Schön, dich zu sehen.",
    "greetingSentences": [
      {
        "german": "Hallo!",
        "english": "Hello!"
      },
      {
        "german": "Schön, dich zu sehen.",
        "english": "It is nice to see you."
      }
    ]
  },
  { id: "inspector", name: "Inspector Voss", role: "Brass Office · responsible for the records", x: .815, y: .299, color: "#b09554", greeting: "Ihre Fahrkarte, bitte. Das Messingamt prüft jede Reise.", greetingSentences: [{ german: "Ihre Fahrkarte, bitte.", english: "Your ticket, please." }, { german: "Das Messingamt prüft jede Reise.", english: "The Brass Office checks every journey." }] },
  { id: "elise", name: "Elise Sander", role: "Keeper of the Atlas · a promise still unfinished", x: .132, y: .322, color: "#5f8178", greeting: "Du bist gekommen. Lass uns die Namen gemeinsam bewahren.", greetingSentences: [{ german: "Du bist gekommen.", english: "You came." }, { german: "Lass uns die Namen gemeinsam bewahren.", english: "Let us preserve the names together." }] }
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
    "title": "A ticket from nowhere",
    "subtitle": "Your train stops at a platform closed for twelve years",
    "npcId": "otto",
    "location": "Lindenhafen · Railway station",
    "story": [
      {
        "german": "Dein Zug ist da.",
        "english": "Your train is here."
      },
      {
        "german": "Er steht auf Bahnsteig sieben.",
        "english": "It is standing at platform seven."
      },
      {
        "german": "Dort kommt seit Jahren kein Zug.",
        "english": "No train has come there for years."
      }
    ],
    "objectives": [
      "Greet someone and introduce yourself",
      "Ask someone to say it again",
      "Learn why names fade in Lindenhafen"
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Englisch",
        "hint": "Listen for the language after spreche.",
        "explanation": "sprechen means to speak; Englisch means English.",
        "options": [
          "Englisch",
          "Deutsch",
          "Französisch"
        ],
        "id": "a1-arrival-exercise-5",
        "itemId": "a1-arrival-item-5"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
    "id": "a1-timetable",
    "level": "A1",
    "title": "Six platforms and a faded word",
    "subtitle": "Otto reads you the timetable",
    "npcId": "otto",
    "location": "Lindenhafen · Station board",
    "story": [
      {
        "german": "Otto steht vor der Tafel.",
        "english": "Otto is standing in front of the board."
      },
      {
        "german": "Er kennt jede Zeit.",
        "english": "He knows every time."
      },
      {
        "german": "Nur ein Wort ist weg.",
        "english": "Only one word is gone."
      }
    ],
    "objectives": [
      "Ask about train times",
      "Say and understand clock times",
      "Notice what is missing from the board"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Ask when the train leaves.",
        "german": "Wann fährt der Zug?",
        "english": "When does the train leave?",
        "answer": "Wann fährt der Zug?",
        "hint": "Start with Wann, then the verb fährt.",
        "explanation": "Wann asks for a time. The verb comes second: Wann fährt der Zug?",
        "tokens": [
          "Wann",
          "fährt",
          "der",
          "Zug?"
        ],
        "id": "a1-timetable-exercise-1",
        "itemId": "a1-timetable-item-1"
      },
      {
        "mode": "choice",
        "prompt": "Ask what time it is.",
        "german": "Wie spät ist es?",
        "english": "What time is it?",
        "answer": "Wie spät ist es?",
        "hint": "spät means late.",
        "explanation": "Wie spät ist es? is the everyday way to ask the time.",
        "options": [
          "Wie spät ist es?",
          "Wie alt ist es?",
          "Wo ist es?"
        ],
        "id": "a1-timetable-exercise-2",
        "itemId": "a1-timetable-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. When does the train leave?",
        "german": "Der Zug fährt um halb neun.",
        "english": "The train leaves at half past eight.",
        "answer": "halb neun",
        "hint": "halb neun is 8:30.",
        "explanation": "halb neun means half an hour before nine: 8:30.",
        "options": [
          "halb neun",
          "halb acht",
          "neun Uhr"
        ],
        "id": "a1-timetable-exercise-3",
        "itemId": "a1-timetable-item-3"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Say: \"The train leaves at eight o’clock.\"",
        "german": "Der Zug fährt um acht Uhr.",
        "english": "The train leaves at eight o’clock.",
        "answer": "Der Zug fährt um acht Uhr.",
        "hint": "Use um before the time.",
        "explanation": "um + number + Uhr gives a clock time.",
        "acceptedAnswers": [
          "Der Zug fährt um 8 Uhr."
        ],
        "id": "a1-timetable-exercise-4",
        "itemId": "a1-timetable-item-4"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say: \"I am travelling at ten o’clock.\"",
        "german": "Ich fahre um zehn Uhr.",
        "english": "I am travelling at ten o’clock.",
        "answer": "Ich fahre um zehn Uhr.",
        "hint": "Ich fahre …",
        "explanation": "fahren changes to fahre after ich.",
        "tokens": [
          "Ich",
          "fahre",
          "um",
          "zehn",
          "Uhr."
        ],
        "id": "a1-timetable-exercise-5",
        "itemId": "a1-timetable-item-5"
      },
      {
        "mode": "choice",
        "prompt": "Ask where platform three is.",
        "german": "Wo ist Bahnsteig drei?",
        "english": "Where is platform three?",
        "answer": "Wo ist Bahnsteig drei?",
        "hint": "Wo asks for a place.",
        "explanation": "Wo ist …? asks where something is.",
        "options": [
          "Wo ist Bahnsteig drei?",
          "Wann ist Bahnsteig drei?",
          "Wer ist Bahnsteig drei?"
        ],
        "id": "a1-timetable-exercise-6",
        "itemId": "a1-timetable-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. At what time does the train come?",
        "german": "Der Zug kommt um achtzehn Uhr.",
        "english": "The train arrives at six p.m.",
        "answer": "achtzehn Uhr",
        "hint": "achtzehn is eighteen, so 6 p.m.",
        "explanation": "Trains use the 24-hour clock: 18 Uhr is 6 p.m.",
        "options": [
          "acht Uhr",
          "achtzehn Uhr",
          "zwölf Uhr"
        ],
        "id": "a1-timetable-exercise-7",
        "itemId": "a1-timetable-item-7"
      }
    ]
  },
  {
    "id": "a1-cafe",
    "level": "A1",
    "title": "A coffee already paid for",
    "subtitle": "Someone was here the day before you",
    "npcId": "marta",
    "location": "Lindenhafen · Marta’s café",
    "story": [
      {
        "german": "Marta hat ein Café.",
        "english": "Marta runs a café."
      },
      {
        "german": "Dein Kaffee ist schon bezahlt.",
        "english": "Your coffee is already paid for."
      },
      {
        "german": "Wer hat bezahlt?",
        "english": "Who paid?"
      }
    ],
    "objectives": [
      "Order food and drinks",
      "Understand a price",
      "Find out who paid for your coffee"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "drei Euro",
        "hint": "drei is three.",
        "explanation": "German uses Euro after a number without adding an s.",
        "options": [
          "drei Euro",
          "zwei Euro",
          "dreizehn Euro"
        ],
        "id": "a1-cafe-exercise-4",
        "itemId": "a1-cafe-item-4"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "answer": "Nein, das ist alles.",
        "hint": "alles means everything.",
        "explanation": "das ist alles tells the server that the order is complete.",
        "options": [
          "Nein, das ist alles.",
          "Ja, noch einen Kaffee.",
          "Die Speisekarte, bitte."
        ],
        "id": "a1-cafe-exercise-7",
        "itemId": "a1-cafe-item-7"
      }
    ]
  },
  {
    "id": "a1-room",
    "level": "A1",
    "title": "Two rooms upstairs",
    "subtitle": "Marta has a bed for you",
    "npcId": "marta",
    "location": "Lindenhafen · Marta’s guest rooms",
    "story": [
      {
        "german": "Marta hat Zimmer über dem Café.",
        "english": "Marta has rooms above the café."
      },
      {
        "german": "Du brauchst ein Bett.",
        "english": "You need a bed."
      },
      {
        "german": "In einem Zimmer war eine Frau.",
        "english": "A woman was in one of the rooms."
      }
    ],
    "objectives": [
      "Ask for a room and its price",
      "Describe a room",
      "Choose between two rooms"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Ask if there is a room free.",
        "german": "Hast du ein Zimmer frei?",
        "english": "Do you have a room free?",
        "answer": "Hast du ein Zimmer frei?",
        "hint": "Start with Hast du … and finish with frei.",
        "explanation": "In a yes/no question the verb comes first. frei means free.",
        "tokens": [
          "Hast",
          "du",
          "ein",
          "Zimmer",
          "frei?"
        ],
        "id": "a1-room-exercise-1",
        "itemId": "a1-room-item-1"
      },
      {
        "mode": "choice",
        "prompt": "Ask if the room has a bathroom.",
        "german": "Hat das Zimmer ein Bad?",
        "english": "Does the room have a bathroom?",
        "answer": "Hat das Zimmer ein Bad?",
        "hint": "Bad is neuter: ein Bad.",
        "explanation": "Hat … ein Bad? asks what a room has.",
        "options": [
          "Hat das Zimmer ein Bad?",
          "Hat das Zimmer einen Hund?",
          "Hat das Zimmer eine Uhr?"
        ],
        "id": "a1-room-exercise-2",
        "itemId": "a1-room-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. How much is the room?",
        "german": "Das Zimmer kostet vierzig Euro.",
        "english": "The room costs forty euros.",
        "answer": "vierzig Euro",
        "hint": "vierzig is forty, vierzehn is fourteen.",
        "explanation": "Do not mix up vierzehn (14) and vierzig (40).",
        "options": [
          "vierzehn Euro",
          "vierzig Euro",
          "fünfzig Euro"
        ],
        "id": "a1-room-exercise-3",
        "itemId": "a1-room-item-3"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Say: \"The room is quiet.\"",
        "german": "Das Zimmer ist ruhig.",
        "english": "The room is quiet.",
        "answer": "Das Zimmer ist ruhig.",
        "hint": "ruhig means quiet.",
        "explanation": "Das Zimmer is neuter. ist links the room to its description.",
        "id": "a1-room-exercise-4",
        "itemId": "a1-room-item-4"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say: \"I am staying two days.\"",
        "german": "Ich bleibe zwei Tage.",
        "english": "I am staying two days.",
        "answer": "Ich bleibe zwei Tage.",
        "hint": "Tag becomes Tage in the plural.",
        "explanation": "bleiben becomes bleibe after ich.",
        "tokens": [
          "Ich",
          "bleibe",
          "zwei",
          "Tage."
        ],
        "id": "a1-room-exercise-5",
        "itemId": "a1-room-item-5"
      },
      {
        "mode": "choice",
        "prompt": "Ask where the bathroom is.",
        "german": "Wo ist das Bad?",
        "english": "Where is the bathroom?",
        "answer": "Wo ist das Bad?",
        "hint": "Bad is the bathroom.",
        "explanation": "Wo ist …? asks for a place.",
        "options": [
          "Wo ist das Bad?",
          "Wo ist der Schlüssel?",
          "Wer ist das Bad?"
        ],
        "id": "a1-room-exercise-6",
        "itemId": "a1-room-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Where is your room?",
        "german": "Dein Zimmer ist oben.",
        "english": "Your room is upstairs.",
        "answer": "oben",
        "hint": "oben is up, unten is down.",
        "explanation": "oben means upstairs or above.",
        "options": [
          "oben",
          "unten",
          "draußen"
        ],
        "id": "a1-room-exercise-7",
        "itemId": "a1-room-item-7"
      }
    ]
  },
  {
    "id": "a1-shopping",
    "level": "A1",
    "title": "Bread for Friday",
    "subtitle": "Fritz is shopping for the soup",
    "npcId": "fritz",
    "location": "Lindenhafen · Lantern market",
    "story": [
      {
        "german": "Fritz kauft Brot für die Suppe.",
        "english": "Fritz is buying bread for the soup."
      },
      {
        "german": "Alle Gäste haben einen Namen.",
        "english": "All the guests have a name."
      },
      {
        "german": "Ein Platz hat keinen.",
        "english": "One place has none."
      }
    ],
    "objectives": [
      "Ask for prices",
      "Order food and say how much you want",
      "Notice the place without a name"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Ask what the bread costs.",
        "german": "Was kostet das Brot?",
        "english": "What does the bread cost?",
        "answer": "Was kostet das Brot?",
        "hint": "Start with Was kostet …",
        "explanation": "Was kostet …? asks for a price. Brot is neuter: das Brot.",
        "tokens": [
          "Was",
          "kostet",
          "das",
          "Brot?"
        ],
        "id": "a1-shopping-exercise-1",
        "itemId": "a1-shopping-item-1"
      },
      {
        "mode": "choice",
        "prompt": "It costs a lot. Say: \"That is expensive.\"",
        "german": "Das ist teuer.",
        "english": "That is expensive.",
        "answer": "Das ist teuer.",
        "hint": "teuer is expensive.",
        "explanation": "teuer means expensive; billig would mean cheap.",
        "options": [
          "Das ist teuer.",
          "Das ist billig.",
          "Das ist klein."
        ],
        "id": "a1-shopping-exercise-2",
        "itemId": "a1-shopping-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. How much is the fish?",
        "german": "Der Fisch kostet sechs Euro.",
        "english": "The fish costs six euros.",
        "answer": "sechs Euro",
        "hint": "sechs is six, sechzehn is sixteen.",
        "explanation": "Listen to the end of the number word.",
        "options": [
          "sechs Euro",
          "sechzehn Euro",
          "sieben Euro"
        ],
        "id": "a1-shopping-exercise-3",
        "itemId": "a1-shopping-item-3"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Say: \"I will take the bread.\"",
        "german": "Ich nehme das Brot.",
        "english": "I will take the bread.",
        "answer": "Ich nehme das Brot.",
        "hint": "Start with Ich nehme.",
        "explanation": "Ich nehme is a common phrase when you choose something to buy.",
        "acceptedAnswers": [
          "Ich nehme das Brot"
        ],
        "id": "a1-shopping-exercise-4",
        "itemId": "a1-shopping-item-4"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say: \"I would like milk and bread.\"",
        "german": "Ich möchte Milch und Brot.",
        "english": "I would like milk and bread.",
        "answer": "Ich möchte Milch und Brot.",
        "hint": "Join the two items with und.",
        "explanation": "und joins two things. No article is needed here.",
        "tokens": [
          "Ich",
          "möchte",
          "Milch",
          "und",
          "Brot."
        ],
        "id": "a1-shopping-exercise-5",
        "itemId": "a1-shopping-item-5"
      },
      {
        "mode": "choice",
        "prompt": "Ask Fritz if he has eggs.",
        "german": "Hast du Eier?",
        "english": "Do you have eggs?",
        "answer": "Hast du Eier?",
        "hint": "Eier means eggs.",
        "explanation": "Hast du …? asks whether someone has something.",
        "options": [
          "Hast du Eier?",
          "Hast du Hunger?",
          "Hast du Zeit?"
        ],
        "id": "a1-shopping-exercise-6",
        "itemId": "a1-shopping-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. How much do you pay in total?",
        "german": "Das macht sieben Euro, bitte.",
        "english": "That makes seven euros, please.",
        "answer": "sieben Euro",
        "hint": "sieben is seven, siebzehn is seventeen.",
        "explanation": "Das macht … tells you the total.",
        "options": [
          "sieben Euro",
          "siebzehn Euro",
          "siebzig Euro"
        ],
        "id": "a1-shopping-exercise-7",
        "itemId": "a1-shopping-item-7"
      }
    ]
  },
  {
    "id": "a1-market",
    "level": "A1",
    "title": "The empty place",
    "subtitle": "Fritz cooks for everyone, but one guest is missing",
    "npcId": "fritz",
    "location": "Lindenhafen · Market",
    "story": [
      {
        "german": "Heute ist Freitag.",
        "english": "It is Friday."
      },
      {
        "german": "Fritz kocht Suppe für alle.",
        "english": "Fritz is cooking soup for everyone."
      },
      {
        "german": "Ein Platz am Tisch ist frei.",
        "english": "One seat at the table is empty."
      }
    ],
    "objectives": [
      "Ask for everyday groceries",
      "Use quantities and payment phrases",
      "Find out who is missing from the table"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "fünf Euro fünfzig",
        "hint": "fünfzig is fifty.",
        "explanation": "In everyday prices, fünf Euro fünfzig means €5.50.",
        "options": [
          "fünf Euro fünfzig",
          "fünfzehn Euro",
          "fünf Euro fünfzehn"
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
        "caseSensitive": true,
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
        "answer": "Der Preis ist zu hoch.",
        "hint": "zu before teuer means too.",
        "explanation": "zu teuer expresses that something costs more than the speaker wants to pay.",
        "options": [
          "Der Preis ist zu hoch.",
          "Die Tomaten sind frisch.",
          "Die Karte fehlt."
        ],
        "id": "a1-market-exercise-7",
        "itemId": "a1-market-item-7"
      }
    ]
  },
  {
    "id": "a1-neighbour",
    "level": "A1",
    "title": "The woman on the fountain bench",
    "subtitle": "Marta remembers her old teacher",
    "npcId": "marta",
    "location": "Lindenhafen · Fountain square",
    "story": [
      {
        "german": "Marta steht am Brunnen.",
        "english": "Marta is standing at the fountain."
      },
      {
        "german": "Hier saß jeden Morgen eine Frau.",
        "english": "A woman sat here every morning."
      },
      {
        "german": "Die Bank ist frei.",
        "english": "The bench is free."
      }
    ],
    "objectives": [
      "Ask what someone is like",
      "Describe people with simple adjectives",
      "Choose how to keep a name"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Ask what Frau Berg is like.",
        "german": "Wie ist Frau Berg?",
        "english": "What is Frau Berg like?",
        "answer": "Wie ist Frau Berg?",
        "hint": "Wie asks about the way someone is.",
        "explanation": "Wie ist …? asks for a description of a person.",
        "tokens": [
          "Wie",
          "ist",
          "Frau",
          "Berg?"
        ],
        "id": "a1-neighbour-exercise-1",
        "itemId": "a1-neighbour-item-1"
      },
      {
        "mode": "choice",
        "prompt": "Say that she is old.",
        "german": "Sie ist alt.",
        "english": "She is old.",
        "answer": "Sie ist alt.",
        "hint": "Sie can mean she.",
        "explanation": "sie means she, and alt means old.",
        "options": [
          "Sie ist alt.",
          "Er ist alt.",
          "Sie ist jung."
        ],
        "id": "a1-neighbour-exercise-2",
        "itemId": "a1-neighbour-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What is the teacher like?",
        "german": "Sie ist lieb und streng.",
        "english": "She is dear and strict.",
        "answer": "streng",
        "hint": "streng means strict.",
        "explanation": "streng describes someone who has firm rules.",
        "options": [
          "streng",
          "müde",
          "laut"
        ],
        "id": "a1-neighbour-exercise-3",
        "itemId": "a1-neighbour-item-3"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Say: \"He is tall.\"",
        "german": "Er ist groß.",
        "english": "He is tall.",
        "answer": "Er ist groß.",
        "hint": "groß means big or tall.",
        "explanation": "er means he, and groß describes his size.",
        "id": "a1-neighbour-exercise-4",
        "itemId": "a1-neighbour-item-4"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say: \"My teacher was strict.\"",
        "german": "Meine Lehrerin war streng.",
        "english": "My teacher was strict.",
        "answer": "Meine Lehrerin war streng.",
        "hint": "Lehrerin is feminine: meine.",
        "explanation": "war is the past of ist: was.",
        "tokens": [
          "Meine",
          "Lehrerin",
          "war",
          "streng."
        ],
        "id": "a1-neighbour-exercise-5",
        "itemId": "a1-neighbour-item-5"
      },
      {
        "mode": "choice",
        "prompt": "Ask who the woman is.",
        "german": "Wer ist die Frau?",
        "english": "Who is the woman?",
        "answer": "Wer ist die Frau?",
        "hint": "Wer means who.",
        "explanation": "Wer asks about a person.",
        "options": [
          "Wer ist die Frau?",
          "Wo ist die Frau?",
          "Wie alt ist die Frau?"
        ],
        "id": "a1-neighbour-exercise-6",
        "itemId": "a1-neighbour-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What does she read?",
        "german": "Sie liest jeden Morgen ein Buch.",
        "english": "She reads a book every morning.",
        "answer": "ein Buch",
        "hint": "Buch means book.",
        "explanation": "lesen means to read. ein Buch is what she reads.",
        "options": [
          "ein Buch",
          "eine Zeitung",
          "einen Brief"
        ],
        "id": "a1-neighbour-exercise-7",
        "itemId": "a1-neighbour-item-7"
      }
    ]
  },
  {
    "id": "a1-pharmacy",
    "level": "A1",
    "title": "Tea for a cough",
    "subtitle": "Greta has a bag nobody has collected",
    "npcId": "greta",
    "location": "Lindenhafen · Greta’s pharmacy",
    "story": [
      {
        "german": "Greta hat eine Apotheke.",
        "english": "Greta has a pharmacy."
      },
      {
        "german": "Ein Beutel Tee wartet seit einer Woche.",
        "english": "A bag of tea has been waiting for a week."
      }
    ],
    "objectives": [
      "Say how you feel and name body parts",
      "Understand how often to take medicine",
      "Follow simple advice when you are ill"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Tell Greta you have a headache.",
        "german": "Ich habe Kopfschmerzen.",
        "english": "I have a headache.",
        "answer": "Ich habe Kopfschmerzen.",
        "hint": "Start with Ich habe.",
        "explanation": "German says I have headaches: Kopfschmerzen is always plural.",
        "acceptedAnswers": [
          "Ich habe Kopfschmerzen"
        ],
        "tokens": [
          "Ich",
          "habe",
          "Kopfschmerzen."
        ],
        "id": "a1-pharmacy-exercise-1",
        "itemId": "a1-pharmacy-item-1"
      },
      {
        "mode": "choice",
        "prompt": "Greta asks how you are. Say you are not well.",
        "german": "Mir geht es nicht gut.",
        "english": "I am not well.",
        "answer": "Mir geht es nicht gut.",
        "hint": "nicht gut means not good.",
        "explanation": "Mir geht es nicht gut is a natural way to say you feel bad.",
        "options": [
          "Mir geht es nicht gut.",
          "Mir geht es sehr gut.",
          "Ich habe Hunger."
        ],
        "id": "a1-pharmacy-exercise-2",
        "itemId": "a1-pharmacy-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. How often should you take the tea?",
        "german": "Nimm den Tee dreimal am Tag.",
        "english": "Take the tea three times a day.",
        "answer": "Dreimal am Tag.",
        "hint": "dreimal means three times.",
        "explanation": "Number + mal says how often: einmal, zweimal, dreimal.",
        "options": [
          "Dreimal am Tag.",
          "Einmal am Tag.",
          "Zweimal am Tag."
        ],
        "id": "a1-pharmacy-exercise-3",
        "itemId": "a1-pharmacy-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say that your throat hurts.",
        "german": "Mein Hals tut weh.",
        "english": "My throat hurts.",
        "answer": "Mein Hals tut weh.",
        "hint": "Use tut weh after the body part.",
        "explanation": "Body part + tut weh says that it hurts.",
        "tokens": [
          "Mein",
          "Hals",
          "tut",
          "weh."
        ],
        "id": "a1-pharmacy-exercise-4",
        "itemId": "a1-pharmacy-item-4"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Say that you are ill.",
        "german": "Ich bin krank.",
        "english": "I am ill.",
        "answer": "Ich bin krank.",
        "hint": "krank means ill.",
        "explanation": "Use ich bin with an adjective: Ich bin krank.",
        "acceptedAnswers": [
          "Ich bin krank"
        ],
        "id": "a1-pharmacy-exercise-5",
        "itemId": "a1-pharmacy-item-5"
      },
      {
        "mode": "choice",
        "prompt": "Your stomach hurts. Which sentence is right?",
        "german": "Mein Bauch tut weh.",
        "english": "My stomach hurts.",
        "answer": "Mein Bauch tut weh.",
        "hint": "Bauch is stomach.",
        "explanation": "Bauch is the belly. Mein Bauch tut weh.",
        "options": [
          "Mein Bauch tut weh.",
          "Mein Fuß tut weh.",
          "Mein Kopf tut weh."
        ],
        "id": "a1-pharmacy-exercise-6",
        "itemId": "a1-pharmacy-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What will you do?",
        "german": "Du hast Fieber. Bleib heute im Bett.",
        "english": "You have a fever. Stay in bed today.",
        "answer": "Ich bleibe im Bett.",
        "hint": "Bett is bed.",
        "explanation": "Bleib im Bett means stay in bed.",
        "options": [
          "Ich bleibe im Bett.",
          "Ich gehe zur Arbeit.",
          "Ich gehe in den Park."
        ],
        "id": "a1-pharmacy-exercise-7",
        "itemId": "a1-pharmacy-item-7"
      }
    ]
  },
  {
    "id": "a1-directions",
    "level": "A1",
    "title": "The way to number seven",
    "subtitle": "Lina shows you the street",
    "npcId": "lina",
    "location": "Lindenhafen · Gartenstraße",
    "story": [
      {
        "german": "Lina bringt Briefe in die Gartenstraße.",
        "english": "Lina delivers letters to Gartenstraße."
      },
      {
        "german": "Nummer sieben hat keinen Namen.",
        "english": "Number seven has no name."
      }
    ],
    "objectives": [
      "Ask where a street is",
      "Use links, rechts and geradeaus",
      "Place things next to and opposite others"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Ask Lina where Gartenstraße is.",
        "german": "Wo ist die Gartenstraße?",
        "english": "Where is Gartenstraße?",
        "answer": "Wo ist die Gartenstraße?",
        "hint": "Start with Wo ist.",
        "explanation": "Wo asks for a place and the verb comes second.",
        "acceptedAnswers": [
          "Wo ist die Gartenstraße"
        ],
        "tokens": [
          "Wo",
          "ist",
          "die",
          "Gartenstraße?"
        ],
        "id": "a1-directions-exercise-1",
        "itemId": "a1-directions-item-1"
      },
      {
        "mode": "choice",
        "prompt": "How do you say “Go left”?",
        "german": "Geh links.",
        "english": "Go left.",
        "answer": "Geh links.",
        "hint": "links is left.",
        "explanation": "links is left, rechts is right, geradeaus is straight ahead.",
        "options": [
          "Geh links.",
          "Geh rechts.",
          "Geh geradeaus."
        ],
        "id": "a1-directions-exercise-2",
        "itemId": "a1-directions-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Where is the post office?",
        "german": "Die Post ist gegenüber vom Café.",
        "english": "The post office is opposite the café.",
        "answer": "Gegenüber vom Café.",
        "hint": "gegenüber means opposite.",
        "explanation": "gegenüber vom means opposite the.",
        "options": [
          "Gegenüber vom Café.",
          "Neben dem Café.",
          "Links vom Café."
        ],
        "id": "a1-directions-exercise-3",
        "itemId": "a1-directions-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Give directions: straight ahead, then right.",
        "german": "Geh geradeaus, dann rechts.",
        "english": "Go straight ahead, then right.",
        "answer": "Geh geradeaus, dann rechts.",
        "hint": "Use dann between the two steps.",
        "explanation": "dann means then. Geh is the du command.",
        "tokens": [
          "Geh",
          "geradeaus,",
          "dann",
          "rechts."
        ],
        "id": "a1-directions-exercise-4",
        "itemId": "a1-directions-item-4"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Ask where the station is.",
        "german": "Wo ist der Bahnhof?",
        "english": "Where is the station?",
        "answer": "Wo ist der Bahnhof?",
        "hint": "Bahnhof is a der word.",
        "explanation": "Bahnhof is masculine: der Bahnhof.",
        "acceptedAnswers": [
          "Wo ist der Bahnhof"
        ],
        "id": "a1-directions-exercise-5",
        "itemId": "a1-directions-item-5"
      },
      {
        "mode": "choice",
        "prompt": "The house is opposite the park. Which sentence?",
        "german": "Das Haus ist gegenüber vom Park.",
        "english": "The house is opposite the park.",
        "answer": "Das Haus ist gegenüber vom Park.",
        "hint": "gegenüber means opposite.",
        "explanation": "gegenüber vom Park means opposite the park.",
        "options": [
          "Das Haus ist gegenüber vom Park.",
          "Das Haus ist neben dem Park.",
          "Das Haus ist im Park."
        ],
        "id": "a1-directions-exercise-6",
        "itemId": "a1-directions-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Which street do you take?",
        "german": "Nimm die erste Straße links.",
        "english": "Take the first street on the left.",
        "answer": "Die erste links.",
        "hint": "erste means first.",
        "explanation": "die erste Straße links is the first street on the left.",
        "options": [
          "Die erste links.",
          "Die zweite links.",
          "Die erste rechts."
        ],
        "id": "a1-directions-exercise-7",
        "itemId": "a1-directions-item-7"
      }
    ]
  },
  {
    "id": "a1-station",
    "level": "A1",
    "title": "A voice on the bench",
    "subtitle": "Voss stays after the last train",
    "npcId": "otto",
    "location": "Lindenhafen · Railway station",
    "story": [
      {
        "german": "Es ist Abend.",
        "english": "It is evening."
      },
      {
        "german": "Voss sitzt am Bahnhof auf der Bank.",
        "english": "Voss is sitting on the bench at the station."
      },
      {
        "german": "Er sitzt allein.",
        "english": "He is sitting alone."
      }
    ],
    "objectives": [
      "Ask for travel information",
      "Understand departure times and platforms",
      "Ask politely for a seat"
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
        "answer": "neun Uhr",
        "hint": "neun means nine; um introduces the time.",
        "explanation": "um neun Uhr is at nine o’clock.",
        "options": [
          "neun Uhr",
          "neunzehn Uhr",
          "acht Uhr"
        ],
        "id": "a1-station-exercise-2",
        "itemId": "a1-station-item-2"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "answer": "Gleis zwei",
        "hint": "Listen for the number after Gleis.",
        "explanation": "abfahren is separable: the ab appears at the end of the sentence.",
        "options": [
          "Gleis zwei",
          "Gleis drei",
          "Gleis zwölf"
        ],
        "id": "a1-station-exercise-4",
        "itemId": "a1-station-item-4"
      },
      {
        "mode": "type",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
    "id": "a1-weather",
    "level": "A1",
    "title": "Rain on platform seven",
    "subtitle": "Otto talks about the weather and the bench",
    "npcId": "otto",
    "location": "Lindenhafen · Station",
    "story": [
      {
        "german": "Es regnet am Bahnhof.",
        "english": "It is raining at the station."
      },
      {
        "german": "Die alte Laterne von Bahnsteig sieben ist weg.",
        "english": "The old lantern from platform seven is gone."
      }
    ],
    "objectives": [
      "Describe today’s weather",
      "Ask about the weather tomorrow",
      "Use heute and morgen"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Ask what the weather is like tomorrow.",
        "german": "Wie ist das Wetter morgen?",
        "english": "What is the weather like tomorrow?",
        "answer": "Wie ist das Wetter morgen?",
        "hint": "Start with Wie ist.",
        "explanation": "Wie ist das Wetter? asks about the weather; add morgen for tomorrow.",
        "acceptedAnswers": [
          "Wie ist das Wetter morgen"
        ],
        "tokens": [
          "Wie",
          "ist",
          "das",
          "Wetter",
          "morgen?"
        ],
        "id": "a1-weather-exercise-1",
        "itemId": "a1-weather-item-1"
      },
      {
        "mode": "choice",
        "prompt": "It is raining. Which sentence?",
        "german": "Es regnet.",
        "english": "It is raining.",
        "answer": "Es regnet.",
        "hint": "Regen is rain.",
        "explanation": "Es regnet means it is raining.",
        "options": [
          "Es regnet.",
          "Es ist heiß.",
          "Die Sonne ist hell."
        ],
        "id": "a1-weather-exercise-2",
        "itemId": "a1-weather-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What is the weather tomorrow?",
        "german": "Heute ist es kalt. Morgen ist es warm.",
        "english": "Today it is cold. Tomorrow it is warm.",
        "answer": "Warm.",
        "hint": "morgen is tomorrow.",
        "explanation": "heute is today, morgen is tomorrow.",
        "options": [
          "Warm.",
          "Kalt.",
          "Regen."
        ],
        "id": "a1-weather-exercise-3",
        "itemId": "a1-weather-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say that today is cold.",
        "german": "Heute ist es kalt.",
        "english": "Today it is cold.",
        "answer": "Heute ist es kalt.",
        "hint": "Start with Heute.",
        "explanation": "After heute the verb comes second: ist es.",
        "tokens": [
          "Heute",
          "ist",
          "es",
          "kalt."
        ],
        "id": "a1-weather-exercise-4",
        "itemId": "a1-weather-item-4"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Say that it is warm today.",
        "german": "Heute ist es warm.",
        "english": "Today it is warm.",
        "answer": "Heute ist es warm.",
        "hint": "warm is warm.",
        "explanation": "Heute ist es warm uses the weather es.",
        "acceptedAnswers": [
          "Heute ist es warm",
          "Es ist heute warm."
        ],
        "id": "a1-weather-exercise-5",
        "itemId": "a1-weather-item-5"
      },
      {
        "mode": "choice",
        "prompt": "The wind is strong. Which sentence?",
        "german": "Der Wind ist stark.",
        "english": "The wind is strong.",
        "answer": "Der Wind ist stark.",
        "hint": "Wind is wind.",
        "explanation": "stark means strong.",
        "options": [
          "Der Wind ist stark.",
          "Es ist sehr warm.",
          "Es regnet nicht."
        ],
        "id": "a1-weather-exercise-6",
        "itemId": "a1-weather-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Do you need an umbrella tomorrow?",
        "german": "Morgen regnet es nicht. Es gibt viel Sonne.",
        "english": "Tomorrow it will not rain. There will be lots of sun.",
        "answer": "Nein, morgen nicht.",
        "hint": "nicht means not.",
        "explanation": "regnet es nicht means it is not raining.",
        "options": [
          "Nein, morgen nicht.",
          "Ja, morgen regnet es.",
          "Ja, es ist kalt."
        ],
        "id": "a1-weather-exercise-7",
        "itemId": "a1-weather-item-7"
      }
    ]
  },
  {
    "id": "a1-workshop",
    "level": "A1",
    "title": "The lamp from platform seven",
    "subtitle": "Emil has repaired something he does not understand",
    "npcId": "emil",
    "location": "Lindenhafen · Emil’s workshop",
    "story": [
      {
        "german": "Emil repariert alles.",
        "english": "Emil repairs everything."
      },
      {
        "german": "Er hat eine Lampe aus der alten Laterne gemacht.",
        "english": "He has made a lamp out of the old lantern."
      },
      {
        "german": "Sie funktioniert nicht richtig.",
        "english": "It does not work properly."
      }
    ],
    "objectives": [
      "Describe objects and locations",
      "Make a simple request",
      "Follow the lamp towards a fading name"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "listen",
        "prompt": "Listen. Where is the key?",
        "german": "Der Schlüssel ist auf dem Tisch.",
        "english": "The key is on the table.",
        "answer": "Auf dem Tisch",
        "hint": "Tisch means table; auf means on.",
        "explanation": "auf dem Tisch describes a location. Learn this as a useful whole phrase.",
        "options": [
          "Auf dem Tisch",
          "Unter dem Stuhl",
          "Im Schrank"
        ],
        "id": "a1-workshop-exercise-1",
        "itemId": "a1-workshop-item-1"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "answer": "Geschlossen",
        "hint": "geschlossen means closed.",
        "explanation": "Fenster is neuter: das Fenster.",
        "options": [
          "Geschlossen",
          "Offen",
          "Kaputt"
        ],
        "id": "a1-workshop-exercise-4",
        "itemId": "a1-workshop-item-4"
      },
      {
        "mode": "type",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
    "id": "a1-bike",
    "level": "A1",
    "title": "A bike that mostly works",
    "subtitle": "Emil repairs Lina’s bike",
    "npcId": "emil",
    "location": "Lindenhafen · Emil’s workshop",
    "story": [
      {
        "german": "Emil repariert Linas Fahrrad.",
        "english": "Emil is repairing Lina’s bike."
      },
      {
        "german": "Du holst es für Lina.",
        "english": "You are collecting it for Lina."
      }
    ],
    "objectives": [
      "Say that something is broken or ready",
      "Ask when something is ready",
      "Talk about cost and paying"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Ask Emil when the bike is ready.",
        "german": "Wann ist das Fahrrad fertig?",
        "english": "When is the bike ready?",
        "answer": "Wann ist das Fahrrad fertig?",
        "hint": "Start with Wann ist.",
        "explanation": "Wann asks for a time; fertig means ready.",
        "acceptedAnswers": [
          "Wann ist das Fahrrad fertig"
        ],
        "tokens": [
          "Wann",
          "ist",
          "das",
          "Fahrrad",
          "fertig?"
        ],
        "id": "a1-bike-exercise-1",
        "itemId": "a1-bike-item-1"
      },
      {
        "mode": "choice",
        "prompt": "Say that the bike is broken.",
        "german": "Das Fahrrad ist kaputt.",
        "english": "The bike is broken.",
        "answer": "Das Fahrrad ist kaputt.",
        "hint": "kaputt means broken.",
        "explanation": "kaputt describes something that does not work.",
        "options": [
          "Das Fahrrad ist kaputt.",
          "Das Fahrrad ist fertig.",
          "Das Fahrrad ist neu."
        ],
        "id": "a1-bike-exercise-2",
        "itemId": "a1-bike-item-2"
      },
      {
        "mode": "listen",
        "prompt": "Listen. When is the bike ready?",
        "german": "Das Fahrrad ist morgen fertig.",
        "english": "The bike is ready tomorrow.",
        "answer": "Morgen.",
        "hint": "morgen is tomorrow.",
        "explanation": "morgen tells you the day.",
        "options": [
          "Morgen.",
          "Heute.",
          "Am Freitag."
        ],
        "id": "a1-bike-exercise-3",
        "itemId": "a1-bike-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Ask how much it costs.",
        "german": "Wie viel kostet das?",
        "english": "How much does that cost?",
        "answer": "Wie viel kostet das?",
        "hint": "Start with Wie viel.",
        "explanation": "Wie viel kostet das? is the basic price question.",
        "acceptedAnswers": [
          "Wie viel kostet das"
        ],
        "tokens": [
          "Wie",
          "viel",
          "kostet",
          "das?"
        ],
        "id": "a1-bike-exercise-4",
        "itemId": "a1-bike-item-4"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Say that you pay now.",
        "german": "Ich bezahle jetzt.",
        "english": "I pay now.",
        "answer": "Ich bezahle jetzt.",
        "hint": "bezahle means pay.",
        "explanation": "Ich bezahle jetzt uses the present tense.",
        "acceptedAnswers": [
          "Ich bezahle jetzt",
          "Ich zahle jetzt."
        ],
        "id": "a1-bike-exercise-5",
        "itemId": "a1-bike-item-5"
      },
      {
        "mode": "choice",
        "prompt": "Ask Emil if he can repair it.",
        "german": "Kannst du das reparieren?",
        "english": "Can you repair that?",
        "answer": "Kannst du das reparieren?",
        "hint": "reparieren means repair.",
        "explanation": "Kannst du … ? asks if someone can do something.",
        "options": [
          "Kannst du das reparieren?",
          "Kannst du das lesen?",
          "Kannst du das essen?"
        ],
        "id": "a1-bike-exercise-6",
        "itemId": "a1-bike-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. How much is it?",
        "german": "Das macht zwanzig Euro.",
        "english": "That is twenty euros.",
        "answer": "Zwanzig Euro.",
        "hint": "zwanzig is twenty.",
        "explanation": "Das macht … Euro says the total.",
        "options": [
          "Zwanzig Euro.",
          "Zwölf Euro.",
          "Zehn Euro."
        ],
        "id": "a1-bike-exercise-7",
        "itemId": "a1-bike-item-7"
      }
    ]
  },
  {
    "id": "a1-phone",
    "level": "A1",
    "title": "A call to the station",
    "subtitle": "Marta hands you the café telephone",
    "npcId": "marta",
    "location": "Lindenhafen · Marta’s café",
    "story": [
      {
        "german": "Otto hat im Café angerufen.",
        "english": "Otto has called the café."
      },
      {
        "german": "Du sprichst mit dem Bahnhof.",
        "english": "You speak to the station."
      }
    ],
    "objectives": [
      "Make a polite phone call",
      "Spell a name and understand numbers",
      "Use Sie with Inspector Voss"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Ask politely to speak to Otto.",
        "german": "Kann ich bitte Otto sprechen?",
        "english": "May I speak to Otto, please?",
        "answer": "Kann ich bitte Otto sprechen?",
        "hint": "Start with Kann ich bitte.",
        "explanation": "Kann ich … sprechen? is the polite phone question. The verb sprechen goes to the end.",
        "tokens": [
          "Kann",
          "ich",
          "bitte",
          "Otto",
          "sprechen?"
        ],
        "id": "a1-phone-exercise-1",
        "itemId": "a1-phone-item-1"
      },
      {
        "mode": "choice",
        "prompt": "You answer the phone at the café. Say: \"Hello, this is Marta.\"",
        "german": "Hallo, hier ist Marta.",
        "english": "Hello, this is Marta.",
        "answer": "Hallo, hier ist Marta.",
        "hint": "Use hier ist.",
        "explanation": "On the phone Germans say hier ist plus the name.",
        "options": [
          "Hallo, hier ist Marta.",
          "Hallo, wo ist Marta?",
          "Guten Tag, Marta ist da?"
        ],
        "id": "a1-phone-exercise-2",
        "itemId": "a1-phone-item-2"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Say: \"I am spelling my name.\"",
        "german": "Ich buchstabiere meinen Namen.",
        "english": "I am spelling my name.",
        "answer": "Ich buchstabiere meinen Namen.",
        "hint": "buchstabieren plus meinen Namen.",
        "explanation": "Name is masculine, so after buchstabieren it becomes meinen Namen.",
        "id": "a1-phone-exercise-3",
        "itemId": "a1-phone-item-3"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What is the station number?",
        "german": "Die Nummer ist drei, vier, sieben.",
        "english": "The number is three, four, seven.",
        "answer": "drei, vier, sieben",
        "hint": "drei is three, sieben is seven.",
        "explanation": "On the phone people read numbers one by one.",
        "options": [
          "drei, vier, sieben",
          "drei, vier, neun",
          "zwei, vier, sieben"
        ],
        "id": "a1-phone-exercise-4",
        "itemId": "a1-phone-item-4"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say: \"I am calling later.\"",
        "german": "Ich rufe später an.",
        "english": "I am calling later.",
        "answer": "Ich rufe später an.",
        "hint": "anrufen splits: rufe … an.",
        "explanation": "In anrufen the little word an goes to the end of the sentence.",
        "tokens": [
          "Ich",
          "rufe",
          "später",
          "an."
        ],
        "id": "a1-phone-exercise-5",
        "itemId": "a1-phone-item-5"
      },
      {
        "mode": "choice",
        "prompt": "Voss speaks too fast. Politely ask him: \"Can you repeat that, please?\"",
        "german": "Können Sie das bitte wiederholen?",
        "english": "Can you repeat that, please?",
        "answer": "Können Sie das bitte wiederholen?",
        "hint": "With Voss use Sie, not du.",
        "explanation": "Können Sie is the formal form for strangers and officials.",
        "options": [
          "Können Sie das bitte wiederholen?",
          "Kannst du das bitte wiederholen?",
          "Kann ich das bitte wiederholen?"
        ],
        "id": "a1-phone-exercise-6",
        "itemId": "a1-phone-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. How is the name spelled?",
        "german": "Ich heiße Lina. L, I, N, A.",
        "english": "My name is Lina. L, I, N, A.",
        "answer": "L, I, N, A",
        "hint": "Listen to each letter.",
        "explanation": "Spelling aloud is very common on the phone.",
        "options": [
          "L, I, N, A",
          "L, I, M, A",
          "N, I, L, A"
        ],
        "id": "a1-phone-exercise-7",
        "itemId": "a1-phone-item-7"
      }
    ]
  },
  {
    "id": "a1-invitation",
    "level": "A1",
    "title": "A seat at Friday’s table",
    "subtitle": "Fritz invites you to dinner",
    "npcId": "fritz",
    "location": "Lindenhafen · Fritz’s stall",
    "story": [
      {
        "german": "Fritz kocht jeden Freitag.",
        "english": "Fritz cooks every Friday."
      },
      {
        "german": "Heute fragt er dich: Kommst du auch?",
        "english": "Today he asks you: are you coming too?"
      }
    ],
    "objectives": [
      "Invite and accept an invitation",
      "Say the day and time",
      "Say sorry politely with leider"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Accept the invitation happily.",
        "german": "Ja, ich komme gern.",
        "english": "Yes, I will gladly come.",
        "answer": "Ja, ich komme gern.",
        "hint": "komme plus gern.",
        "explanation": "gern after the verb shows you do it with pleasure.",
        "tokens": [
          "Ja,",
          "ich",
          "komme",
          "gern."
        ],
        "id": "a1-invitation-exercise-1",
        "itemId": "a1-invitation-item-1"
      },
      {
        "mode": "choice",
        "prompt": "Fritz invites you. Say: \"That is nice, thanks!\"",
        "german": "Das ist nett, danke!",
        "english": "That is nice, thanks!",
        "answer": "Das ist nett, danke!",
        "hint": "nett means nice.",
        "explanation": "A short thank-you is a warm reply to an invitation.",
        "options": [
          "Das ist nett, danke!",
          "Das ist teuer, danke!",
          "Das ist kalt, danke!"
        ],
        "id": "a1-invitation-exercise-2",
        "itemId": "a1-invitation-item-2"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Say: \"On Friday at seven.\"",
        "german": "Am Freitag um sieben.",
        "english": "On Friday at seven.",
        "answer": "Am Freitag um sieben.",
        "hint": "am for days, um for clock times.",
        "explanation": "German uses am with days and um with clock times.",
        "id": "a1-invitation-exercise-3",
        "itemId": "a1-invitation-item-3"
      },
      {
        "mode": "listen",
        "prompt": "Listen. When is the soup?",
        "german": "Die Suppe gibt es um sieben Uhr.",
        "english": "The soup is at seven o’clock.",
        "answer": "um sieben Uhr",
        "hint": "sieben is seven.",
        "explanation": "um plus a number gives the clock time.",
        "options": [
          "um sieben Uhr",
          "um acht Uhr",
          "um sechs Uhr"
        ],
        "id": "a1-invitation-exercise-4",
        "itemId": "a1-invitation-item-4"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say: \"I am bringing bread.\"",
        "german": "Ich bringe Brot mit.",
        "english": "I am bringing bread.",
        "answer": "Ich bringe Brot mit.",
        "hint": "mitbringen splits: bringe … mit.",
        "explanation": "In mitbringen the little word mit goes to the end.",
        "tokens": [
          "Ich",
          "bringe",
          "Brot",
          "mit."
        ],
        "id": "a1-invitation-exercise-5",
        "itemId": "a1-invitation-item-5"
      },
      {
        "mode": "choice",
        "prompt": "You cannot come. Choose the polite sentence.",
        "german": "Leider habe ich keine Zeit.",
        "english": "Unfortunately I have no time.",
        "answer": "Leider habe ich keine Zeit.",
        "hint": "leider means unfortunately.",
        "explanation": "leider softens a no and sounds friendly.",
        "options": [
          "Leider habe ich keine Zeit.",
          "Gern habe ich keine Zeit.",
          "Leider habe ich viel Zeit."
        ],
        "id": "a1-invitation-exercise-6",
        "itemId": "a1-invitation-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Who is not coming?",
        "german": "Leider kommt Emil nicht.",
        "english": "Unfortunately Emil is not coming.",
        "answer": "Emil",
        "hint": "Listen for the name.",
        "explanation": "nicht stands after the verb here.",
        "options": [
          "Emil",
          "Lina",
          "Marta"
        ],
        "id": "a1-invitation-exercise-7",
        "itemId": "a1-invitation-item-7"
      }
    ]
  },
  {
    "id": "a1-lost-found",
    "level": "A1",
    "title": "The lost-and-found table",
    "subtitle": "Your bag is waiting at the post counter",
    "npcId": "lina",
    "location": "Lindenhafen · Lina’s post counter",
    "story": [
      {
        "german": "Lina hat elf Taschen vom Zug.",
        "english": "Lina has eleven bags from the train."
      },
      {
        "german": "Eine Tasche ist deine.",
        "english": "One bag is yours."
      }
    ],
    "objectives": [
      "Describe things by colour and size",
      "Use alt, neu, groß and klein",
      "Say whose thing it is with mein"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say: \"My bag is blue.\"",
        "german": "Meine Tasche ist blau.",
        "english": "My bag is blue.",
        "answer": "Meine Tasche ist blau.",
        "hint": "Tasche is feminine: meine.",
        "explanation": "Feminine nouns take meine: meine Tasche.",
        "tokens": [
          "Meine",
          "Tasche",
          "ist",
          "blau."
        ],
        "id": "a1-lost-found-exercise-1",
        "itemId": "a1-lost-found-item-1"
      },
      {
        "mode": "choice",
        "prompt": "Your bag is big and old. Choose the sentence.",
        "german": "Sie ist groß und alt.",
        "english": "It is big and old.",
        "answer": "Sie ist groß und alt.",
        "hint": "Tasche is feminine, so sie.",
        "explanation": "sie stands for a feminine noun. groß means big, alt means old.",
        "options": [
          "Sie ist groß und alt.",
          "Sie ist klein und neu.",
          "Sie ist groß und neu."
        ],
        "id": "a1-lost-found-exercise-2",
        "itemId": "a1-lost-found-item-2"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Say: \"The glove is black.\"",
        "german": "Der Handschuh ist schwarz.",
        "english": "The glove is black.",
        "answer": "Der Handschuh ist schwarz.",
        "hint": "Handschuh is masculine: der.",
        "explanation": "Colours stay the same after ist: ist schwarz.",
        "id": "a1-lost-found-exercise-3",
        "itemId": "a1-lost-found-item-3"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What is the bag like?",
        "german": "Meine Tasche ist klein und grün.",
        "english": "My bag is small and green.",
        "answer": "klein und grün",
        "hint": "klein is small.",
        "explanation": "Two adjectives are joined with und.",
        "options": [
          "klein und grün",
          "groß und grün",
          "klein und rot"
        ],
        "id": "a1-lost-found-exercise-4",
        "itemId": "a1-lost-found-item-4"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say: \"That is not my bag.\"",
        "german": "Das ist nicht meine Tasche.",
        "english": "That is not my bag.",
        "answer": "Das ist nicht meine Tasche.",
        "hint": "nicht comes before meine Tasche.",
        "explanation": "nicht negates the whole statement: nicht meine Tasche.",
        "tokens": [
          "Das",
          "ist",
          "nicht",
          "meine",
          "Tasche."
        ],
        "id": "a1-lost-found-exercise-5",
        "itemId": "a1-lost-found-item-5"
      },
      {
        "mode": "choice",
        "prompt": "Choose the opposite of alt (old).",
        "german": "Das Buch ist neu.",
        "english": "The book is new.",
        "answer": "neu",
        "hint": "It means new.",
        "explanation": "alt and neu are opposites, like groß and klein.",
        "options": [
          "neu",
          "alt",
          "blau"
        ],
        "id": "a1-lost-found-exercise-6",
        "itemId": "a1-lost-found-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What colour is the umbrella?",
        "german": "Der Schirm ist gelb.",
        "english": "The umbrella is yellow.",
        "answer": "gelb",
        "hint": "gelb is yellow.",
        "explanation": "Colours are easy adjectives: gelb, rot, grün, blau.",
        "options": [
          "gelb",
          "grün",
          "grau"
        ],
        "id": "a1-lost-found-exercise-7",
        "itemId": "a1-lost-found-item-7"
      }
    ]
  },
  {
    "id": "a1-lost-parcel",
    "level": "A1",
    "title": "A letter without a door",
    "subtitle": "Lina refuses to leave a delivery unfinished",
    "npcId": "lina",
    "location": "Lindenhafen · Post office",
    "story": [
      {
        "german": "Lina hat ein Paket für dich.",
        "english": "Lina has a parcel for you."
      },
      {
        "german": "Der Absender ist E.",
        "english": "The sender is E."
      },
      {
        "german": "Die Adresse geht weg.",
        "english": "The address is fading."
      }
    ],
    "objectives": [
      "Ask for an address and directions",
      "Deliver a parcel politely",
      "Learn who sent your ticket"
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
        "caseSensitive": true,
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
        "answer": "Links",
        "hint": "links means on the left.",
        "explanation": "die Apotheke is the pharmacy; rechts would mean on the right.",
        "options": [
          "Links",
          "Rechts",
          "Geradeaus"
        ],
        "id": "a1-lost-parcel-exercise-3",
        "itemId": "a1-lost-parcel-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Die Person kommt zu spät.",
        "hint": "zu spät means late.",
        "explanation": "Entschuldigung is a common apology or way to get someone’s attention.",
        "options": [
          "Die Person kommt zu spät.",
          "Das Paket ist leer.",
          "Die Person hat ihre Fahrkarte verloren."
        ],
        "id": "a1-lost-parcel-exercise-7",
        "itemId": "a1-lost-parcel-item-7"
      }
    ]
  },
  {
    "id": "a1-departure",
    "level": "A1",
    "title": "Platform seven, six o’clock",
    "subtitle": "Otto sells his first ticket in twelve years",
    "npcId": "otto",
    "location": "Lindenhafen · Station",
    "story": [
      {
        "german": "Ein Zug steht an Gleis sieben.",
        "english": "A train stands at platform seven."
      },
      {
        "german": "Otto verkauft die Fahrkarte.",
        "english": "Otto sells the ticket."
      }
    ],
    "objectives": [
      "Buy a ticket and name the place",
      "Choose einfach or hin und zurück",
      "Ask about the time and the platform"
    ],
    "reward": 40,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Buy a ticket to Waldruh.",
        "german": "Eine Fahrkarte nach Waldruh, bitte.",
        "english": "A ticket to Waldruh, please.",
        "answer": "Eine Fahrkarte nach Waldruh, bitte.",
        "hint": "nach plus the place.",
        "explanation": "nach goes before a town name: nach Waldruh. bitte makes it polite.",
        "tokens": [
          "Eine",
          "Fahrkarte",
          "nach",
          "Waldruh,",
          "bitte."
        ],
        "id": "a1-departure-exercise-1",
        "itemId": "a1-departure-item-1"
      },
      {
        "mode": "choice",
        "prompt": "You want to come back too. Choose \"Return, please.\"",
        "german": "Hin und zurück, bitte.",
        "english": "Return, please.",
        "answer": "Hin und zurück, bitte.",
        "hint": "hin is there, zurück is back.",
        "explanation": "hin und zurück means there and back.",
        "options": [
          "Hin und zurück, bitte.",
          "Einfach, bitte.",
          "Nur zurück, bitte."
        ],
        "id": "a1-departure-exercise-2",
        "itemId": "a1-departure-item-2"
      },
      {
        "mode": "type",
        "caseSensitive": true,
        "prompt": "Ask: \"What time does the train leave?\"",
        "german": "Um wie viel Uhr fährt der Zug?",
        "english": "What time does the train leave?",
        "answer": "Um wie viel Uhr fährt der Zug?",
        "hint": "Start with Um wie viel Uhr.",
        "explanation": "Um wie viel Uhr asks for a clock time.",
        "id": "a1-departure-exercise-3",
        "itemId": "a1-departure-item-3"
      },
      {
        "mode": "listen",
        "prompt": "Listen. Which platform?",
        "german": "Der Zug fährt von Gleis sieben.",
        "english": "The train leaves from platform seven.",
        "answer": "Gleis sieben",
        "hint": "Gleis is platform.",
        "explanation": "Gleis is the track or platform number at the station.",
        "options": [
          "Gleis sieben",
          "Gleis zwei",
          "Gleis elf"
        ],
        "id": "a1-departure-exercise-4",
        "itemId": "a1-departure-item-4"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
        "prompt": "Say: \"I would like a ticket.\"",
        "german": "Ich möchte eine Fahrkarte.",
        "english": "I would like a ticket.",
        "answer": "Ich möchte eine Fahrkarte.",
        "hint": "Fahrkarte is feminine: eine.",
        "explanation": "möchte is the polite way to ask for something.",
        "tokens": [
          "Ich",
          "möchte",
          "eine",
          "Fahrkarte."
        ],
        "id": "a1-departure-exercise-5",
        "itemId": "a1-departure-item-5"
      },
      {
        "mode": "choice",
        "prompt": "Ask where platform seven is.",
        "german": "Wo ist Gleis sieben?",
        "english": "Where is platform seven?",
        "answer": "Wo ist Gleis sieben?",
        "hint": "Wo asks for a place.",
        "explanation": "Wo ist …? is the basic question for a place.",
        "options": [
          "Wo ist Gleis sieben?",
          "Wer ist Gleis sieben?",
          "Wann ist Gleis sieben?"
        ],
        "id": "a1-departure-exercise-6",
        "itemId": "a1-departure-item-6"
      },
      {
        "mode": "listen",
        "prompt": "Listen. What time is it?",
        "german": "Der Zug fährt um achtzehn Uhr.",
        "english": "The train leaves at 18:00.",
        "answer": "achtzehn Uhr",
        "hint": "achtzehn is eighteen.",
        "explanation": "Timetables use the 24-hour clock: 18 Uhr is six in the evening.",
        "options": [
          "achtzehn Uhr",
          "achtzehn Euro",
          "acht Uhr"
        ],
        "id": "a1-departure-exercise-7",
        "itemId": "a1-departure-item-7"
      }
    ]
  },
  {
    "id": "a2-apartment",
    "level": "A2",
    "title": "The room already waiting",
    "subtitle": "One door, two addresses, a name you recognise",
    "npcId": "marta",
    "location": "Waldruh · The Wayward Inn",
    "story": [
      {
        "german": "Hinter Martas Küchentür liegt ein anderes Dorf.",
        "english": "Another village lies behind Marta’s kitchen door."
      },
      {
        "german": "Oben wartet ein Zimmer, aber die Tür klemmt.",
        "english": "A room is waiting upstairs, but the door is stuck."
      },
      {
        "german": "Voss prüft das Haus, das in seiner Akte fehlt.",
        "english": "Voss is inspecting the house missing from his file."
      }
    ],
    "objectives": [
      "Describe housing and everyday problems",
      "Use since, because and polite requests",
      "Read the refrigerator’s first letter"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Zwei Zimmer",
        "hint": "Listen for the number before Zimmer.",
        "explanation": "einen Balkon is the masculine object after hat.",
        "options": [
          "Zwei Zimmer",
          "Drei Zimmer",
          "Ein Zimmer"
        ],
        "id": "a2-apartment-exercise-3",
        "itemId": "a2-apartment-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Die Wohnung ist zu klein.",
        "hint": "Listen to the reason after weil.",
        "explanation": "In a weil clause, the finite verb goes at the end: zu klein ist.",
        "options": [
          "Die Wohnung ist zu klein.",
          "Die Miete ist niedrig.",
          "Der Bahnhof ist geschlossen."
        ],
        "id": "a2-apartment-exercise-7",
        "itemId": "a2-apartment-item-7"
      }
    ]
  },
  {
    "id": "a2-evening-plans",
    "level": "A2",
    "title": "An empty chair at dinner",
    "subtitle": "A meeting means little if nobody can attend",
    "npcId": "fritz",
    "location": "Waldruh · Autumn market",
    "story": [
      {
        "german": "Fritz bringt die Suppe. Greta bringt einen Kalender.",
        "english": "Fritz brings soup. Greta brings a calendar."
      },
      {
        "german": "Beide wollen ein Treffen, aber nicht aus demselben Grund.",
        "english": "Both want a meeting, but for different reasons."
      },
      {
        "german": "Zwischen ihnen steht ein leerer Stuhl.",
        "english": "An empty chair stands between them."
      }
    ],
    "objectives": [
      "Make and change arrangements",
      "Express preferences and reasons",
      "Coordinate the lantern festival"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "answer": "halb sieben",
        "hint": "halb sieben is halfway to seven: 6:30. This is an evening meeting.",
        "explanation": "German halb names the following hour. am Samstag gives the day.",
        "options": [
          "halb sieben",
          "halb acht",
          "halb sechs"
        ],
        "id": "a2-evening-plans-exercise-2",
        "itemId": "a2-evening-plans-item-2"
      },
      {
        "mode": "type",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Es regnet.",
        "hint": "regnen means to rain.",
        "explanation": "zu Hause is at home; nach Hause is a destination.",
        "options": [
          "Es regnet.",
          "Sie sind müde.",
          "Das Café ist teuer."
        ],
        "id": "a2-evening-plans-exercise-6",
        "itemId": "a2-evening-plans-item-6"
      },
      {
        "mode": "type",
        "caseSensitive": true,
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
    "title": "The minute nobody saw",
    "subtitle": "The ticket and the station disagree",
    "npcId": "otto",
    "location": "Waldruh · Forest station",
    "story": [
      {
        "german": "Auf deiner Fahrkarte steht achtzehn Uhr.",
        "english": "Your ticket says six o’clock."
      },
      {
        "german": "Otto wartet mit dir auf den Anschluss.",
        "english": "Otto waits with you for the connection."
      },
      {
        "german": "Aus dem Wald kommt ein Zugpfiff.",
        "english": "A train whistle comes from the forest."
      }
    ],
    "objectives": [
      "Understand connections and disruptions",
      "Ask follow-up travel questions",
      "Find the route to the missing town"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "type",
        "caseSensitive": true,
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
        "answer": "Zwanzig Minuten",
        "hint": "zwanzig means twenty.",
        "explanation": "in zwanzig Minuten describes how long from now until departure.",
        "options": [
          "Zwanzig Minuten",
          "Zwölf Minuten",
          "Zwei Minuten"
        ],
        "id": "a2-rail-trip-exercise-2",
        "itemId": "a2-rail-trip-item-2"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Der Bus",
        "hint": "Bus is the vehicle mentioned.",
        "explanation": "wegen introduces the reason; einer Störung means a disruption.",
        "options": [
          "Der Bus",
          "Der Zug",
          "Die Fähre"
        ],
        "id": "a2-rail-trip-exercise-7",
        "itemId": "a2-rail-trip-item-7"
      }
    ]
  },
  {
    "id": "a2-broken-clock",
    "level": "A2",
    "title": "The borrowed hour",
    "subtitle": "Emil can repair a clock, but not what it took",
    "npcId": "emil",
    "location": "Waldruh · Clockmill workshop",
    "story": [
      {
        "german": "Die Uhrenmühle wiederholt die Stunde vor Mitternacht.",
        "english": "The clockmill repeats the hour before midnight."
      },
      {
        "german": "Emil hat die Anleitung und eine Kiste Werkzeuge.",
        "english": "Emil has the manual and a box of tools."
      },
      {
        "german": "Neben der Kiste liegt ein Brief.",
        "english": "A letter lies beside the box."
      }
    ],
    "objectives": [
      "Describe completed actions",
      "Use sequence and location",
      "Trace the borrowed tools"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "answer": "Aufräumen",
        "hint": "zuerst marks the first action.",
        "explanation": "zuerst and dann help put a report in a clear sequence.",
        "options": [
          "Aufräumen",
          "Kochen",
          "Einkaufen"
        ],
        "id": "a2-broken-clock-exercise-2",
        "itemId": "a2-broken-clock-item-2"
      },
      {
        "mode": "type",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
    "title": "What the records forgot",
    "subtitle": "Greta has a patient who will not rest",
    "npcId": "greta",
    "location": "Waldruh · Conservatory clinic",
    "story": [
      {
        "german": "Voss sitzt in Gretas Klinik, noch immer mit seinem Mantel.",
        "english": "Voss sits in Greta’s clinic, still wearing his coat."
      },
      {
        "german": "Er hält eine Akte fest. Greta stellt ihm Wasser hin.",
        "english": "He grips a file. Greta puts water beside him."
      },
      {
        "german": "Auf dem Tisch liegen drei alte Samentüten.",
        "english": "Three old seed packets lie on the table."
      }
    ],
    "objectives": [
      "Describe symptoms and ask for appointments",
      "Understand simple advice",
      "Speak to the patient who remembers"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Viertel nach acht",
        "hint": "Viertel nach means quarter past.",
        "explanation": "Viertel nach acht is 8:15. Viertel vor acht would be 7:45.",
        "options": [
          "Viertel nach acht",
          "Viertel vor neun",
          "Viertel vor acht"
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Die Versicherungskarte",
        "hint": "Listen for Versicherungskarte.",
        "explanation": "mitbringen is separable: bringen … mit.",
        "options": [
          "Die Versicherungskarte",
          "Die Fahrkarte",
          "Die Einkaufsliste"
        ],
        "id": "a2-clinic-exercise-7",
        "itemId": "a2-clinic-item-7"
      }
    ]
  },
  {
    "id": "a2-archive",
    "level": "A2",
    "title": "The second signature",
    "subtitle": "Ada has kept the page she most wants to forget",
    "npcId": "ada",
    "location": "Waldruh · The keeper’s records",
    "story": [
      {
        "german": "Ada legt zwei Dokumente nebeneinander.",
        "english": "Ada lays two documents side by side."
      },
      {
        "german": "Eines ist nur für eine Woche gültig. Das andere hat kein Enddatum.",
        "english": "One is valid for a week. The other has no end date."
      },
      {
        "german": "Sie hält den Stift, aber sie schreibt nicht.",
        "english": "She holds the pen, but does not write."
      }
    ],
    "objectives": [
      "Talk about earlier life and change",
      "Compare people and places",
      "Recover the second Atlas page"
    ],
    "reward": 60,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "answer": "Mit dem Zug",
        "hint": "mit dem Zug means by train.",
        "explanation": "fahren uses sein in the perfect when it describes travel: bin … gefahren.",
        "options": [
          "Mit dem Zug",
          "Mit dem Fahrrad",
          "Zu Fuß"
        ],
        "id": "a2-archive-exercise-2",
        "itemId": "a2-archive-item-2"
      },
      {
        "mode": "type",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "In der Altstadt",
        "hint": "Altstadt means old town.",
        "explanation": "inzwischen refers to a change between an earlier time and now; umziehen uses sein for moving home or premises.",
        "options": [
          "In der Altstadt",
          "Am Bahnhof",
          "Am Markt"
        ],
        "id": "a2-archive-exercise-7",
        "itemId": "a2-archive-item-7"
      }
    ]
  },
  {
    "id": "b1-witness",
    "level": "B1",
    "title": "A voice without a witness",
    "subtitle": "Lina separates what was heard from what was seen",
    "npcId": "lina",
    "location": "Nebelstadt · Harbor post office",
    "story": [
      {
        "german": "Zwei Signale kamen gleichzeitig an. Nur eines hatte eine Zeugin.",
        "english": "Two signals arrived together. Only one had a witness."
      },
      {
        "german": "Lina legt die Aussagen aus. Marta wartet auf ihre erste Frage.",
        "english": "Lina lays out the statements. Marta waits for her first question."
      },
      {
        "german": "Diesmal reicht es nicht, dass eine Geschichte gut klingt.",
        "english": "This time, a convincing story will not be enough."
      }
    ],
    "objectives": [
      "Understand a connected witness account",
      "Describe sequence and uncertainty",
      "Explain a contradiction respectfully"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "answer": "Es war zu dunkel.",
        "hint": "Look for the reason after weil.",
        "explanation": "erkennen means recognize or make out. war ends the weil clause.",
        "options": [
          "Es war zu dunkel.",
          "Die Zeugin hatte ihre Brille vergessen.",
          "Die Person ist weggelaufen."
        ],
        "id": "b1-witness-exercise-2",
        "itemId": "b1-witness-item-2"
      },
      {
        "mode": "type",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
    "title": "The price of a shortcut",
    "subtitle": "Every line on Otto’s map runs through someone’s life",
    "npcId": "otto",
    "location": "Nebelstadt · Railway quay",
    "story": [
      {
        "german": "Otto hat zwei Strecken gezeichnet. Greta hat ihre Karte mitgebracht.",
        "english": "Otto has drawn two routes. Greta has brought her own map."
      },
      {
        "german": "Was auf Papier einfach aussieht, wird für jemanden teuer.",
        "english": "What looks simple on paper will cost someone dearly."
      }
    ],
    "objectives": [
      "Explain travel problems and solutions",
      "Use conditions and alternatives",
      "Propose a workable new route"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Die Fahrkarten wären teurer.",
        "hint": "The disadvantage follows aber.",
        "explanation": "wäre and wären describe a hypothetical situation; teurer means more expensive.",
        "options": [
          "Die Fahrkarten wären teurer.",
          "Die Fahrt würde länger dauern.",
          "Es gäbe weniger Züge."
        ],
        "id": "b1-new-route-exercise-3",
        "itemId": "b1-new-route-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
    "title": "The hand that kept it running",
    "subtitle": "Emil needs help; Voss has brought his book",
    "npcId": "emil",
    "location": "Nebelstadt · Lantern repair dock",
    "story": [
      {
        "german": "Emil bietet dir Arbeit am Signal an. Der nächste Glockenschlag ist nah.",
        "english": "Emil offers you work on the signal. The next bell is close."
      },
      {
        "german": "Voss steht neben dem Wartungsbuch. Er hat es noch nicht geöffnet.",
        "english": "Voss stands beside the maintenance ledger. He has not opened it yet."
      }
    ],
    "objectives": [
      "Describe experience and responsibilities",
      "Ask for practical clarification",
      "Prepare a realistic work arrangement"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Sie arbeiten von zu Hause.",
        "hint": "The difference follows aber freitags.",
        "explanation": "freitags means on Fridays regularly; von zu Hause means from home.",
        "options": [
          "Sie arbeiten von zu Hause.",
          "Sie beginnen um zehn.",
          "Sie arbeiten nicht."
        ],
        "id": "b1-work-exercise-3",
        "itemId": "b1-work-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
    "title": "Whose silence counts?",
    "subtitle": "Three groups must agree on who gets a say",
    "npcId": "ada",
    "location": "Nebelstadt · Council archive",
    "story": [
      {
        "german": "Ada stellt drei Stühle an einen Tisch. Voss bleibt zunächst stehen.",
        "english": "Ada places three chairs around a table. Voss stays standing at first."
      },
      {
        "german": "Die Beweise liegen offen. Ein Beschluss fehlt noch.",
        "english": "The evidence is open. A decision is still missing."
      },
      {
        "german": "Vor dem Fenster wird der dunkle Strahl heller.",
        "english": "Outside the window, the dark beam grows brighter."
      }
    ],
    "objectives": [
      "State and support an opinion",
      "Agree or disagree respectfully",
      "Offer a concrete compromise"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Die Kosten",
        "hint": "The concern follows Sorgen um.",
        "explanation": "sich Sorgen machen um means worry about; trotzdem expresses nevertheless.",
        "options": [
          "Die Kosten",
          "Der Fahrplan",
          "Das Wetter"
        ],
        "id": "b1-council-exercise-3",
        "itemId": "b1-council-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
    "title": "Three lanterns in the rain",
    "subtitle": "The promise must survive its first test",
    "npcId": "greta",
    "location": "Nebelstadt · Observatory garden",
    "story": [
      {
        "german": "Der Sturm unterbricht den Strom. Die Glocke läuft weiter.",
        "english": "The storm cuts the power. The bell keeps going."
      },
      {
        "german": "Greta zählt Menschen, Emil zählt Verbindungen. Beide brauchen Hilfe an verschiedenen Orten.",
        "english": "Greta counts people; Emil counts connections. Both need help in different places."
      },
      {
        "german": "Jetzt zeigt sich, wer eine Zusage auch im Regen hält.",
        "english": "Now you find out who keeps a promise in the rain."
      }
    ],
    "objectives": [
      "Understand a disruption notice",
      "Give advice and explain consequences",
      "Organize a safe festival alternative"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "In der Halle",
        "hint": "Listen to the location after findet.",
        "explanation": "falls introduces a possible condition; stattfinden is separable in the main clause.",
        "options": [
          "In der Halle",
          "Im Garten",
          "Am Bahnhof"
        ],
        "id": "b1-storm-exercise-3",
        "itemId": "b1-storm-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
    "title": "A promise with witnesses",
    "subtitle": "Elise is waiting beside an unwritten page",
    "npcId": "elise",
    "location": "Nebelstadt · The last Atlas page",
    "story": [
      {
        "german": "Elise wartet am Pult. Deine Briefe liegen vor ihr.",
        "english": "Elise waits at the desk. Your letters lie before her."
      },
      {
        "german": "Im Atlas ist eine Seite frei. Der Schlüssel passt noch immer.",
        "english": "A page in the Atlas is blank. The key still fits."
      },
      {
        "german": "Sie sieht zuerst die anderen an, dann dich.",
        "english": "She looks at the others first, then at you."
      }
    ],
    "objectives": [
      "Summarize an account and explain motives",
      "Clarify and correct a misunderstanding",
      "Write a practical agreement for the restored route"
    ],
    "reward": 90,
    "exercises": [
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "answer": "Eine zuverlässige Verbindung",
        "hint": "sich verlassen auf means rely on.",
        "explanation": "The relative clause describes the connection. auf die refers back to feminine Verbindung.",
        "options": [
          "Eine zuverlässige Verbindung",
          "Ein günstigeres Café",
          "Ein größeres Archiv"
        ],
        "id": "b1-atlas-exercise-3",
        "itemId": "b1-atlas-item-3"
      },
      {
        "mode": "sentence",
        "caseSensitive": true,
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
        "caseSensitive": true,
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
        "caseSensitive": true,
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
