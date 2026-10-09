import { quests, type Exercise } from './content';
import type { MapId, MapPosition } from './maps';
import { NavigationGrid } from './navigation';

export type InteriorId = 'cafe' | 'bakery' | 'supermarket';
export type InteriorSheet = 'interior-cafe-objects' | 'interior-bakery-objects' | 'interior-supermarket-objects' | 'interior-decor' | 'interior-furniture';
export type InteriorPolygon = readonly (readonly [number, number])[];
export interface InteriorVocabulary {
  article: string;
  lemma: string;
  plural: string;
  english: string;
}
export interface InteriorObjectSpec extends MapPosition {
  id: string;
  label: string;
  germanName: string;
  sessionTitle: string;
  prompt: string;
  description: string;
  dialogue?: string;
  npcId?: string;
  activityId?: 'cafe' | 'market';
  exerciseIds: string[];
  vocabulary: InteriorVocabulary[];
}
export interface InteriorPropSpec {
  id: string;
  sheet: InteriorSheet;
  /** Sprite-sheet row name; each row contains four subtle animation frames. */
  asset: string;
  /** Pixel foot anchor in the 1536 × 1024 room. */
  x: number;
  y: number;
  width: number;
  /** Optional draw order for small objects resting on furniture. */
  depth?: number;
  /** An object encounter to open when this prop is selected. */
  interactive?: string;
  /** Solid footprint, excluding steam, glass reflections, and tall silhouettes. */
  collision?: { x: number; y: number; width: number; height: number };
  /** Detail-only overlays, positioned relative to the fixed furniture anchor. */
  effects?: readonly { asset: 'steam' | 'flame'; x: number; y: number; width: number; alpha: number }[];
}
export interface InteriorNpcSpec extends MapPosition {
  id: string;
  interactionId: string;
  role: string;
}
export interface InteriorSpec {
  id: InteriorId;
  name: string;
  germanName: string;
  subtitle: string;
  description: string;
  icon: 'cup' | 'basket' | 'leaf';
  asset: string;
  width: 1536;
  height: 1024;
  spawn: MapPosition;
  exit: MapPosition;
  /** Architectural floor boundaries in painting pixels, independent of furniture. */
  walkableAreas: readonly InteriorPolygon[];
  /** Solid partition walls. Gaps in these polygons are actual room doorways. */
  barriers?: readonly InteriorPolygon[];
  npcs: readonly InteriorNpcSpec[];
  objects: readonly InteriorObjectSpec[];
  props: readonly InteriorPropSpec[];
}
export interface BuildingEntrance extends MapPosition {
  id: `building:${InteriorId}`;
  interiorId: InteriorId;
  label: string;
  description: string;
}

const position = (x: number, y: number): MapPosition => ({ x: x / 1536, y: y / 1024 });
const vocabulary = (article: string, lemma: string, plural: string, english: string): InteriorVocabulary => ({ article, lemma, plural, english });
const cafeExercise = (...numbers: number[]): string[] => numbers.map(number => `a1-cafe-exercise-${number}`);
const marketExercise = (...numbers: number[]): string[] => numbers.map(number => `a1-market-exercise-${number}`);
const footprint = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

/** Focused everyday encounters stay available alongside the longer Atlas story. */
export const interiors: readonly InteriorSpec[] = [
  {
    id: 'cafe', name: 'Marta’s café', germanName: 'Das Café', subtitle: 'A warm cup, a little conversation', icon: 'cup',
    description: 'Coffee hisses, a sleepy clock ticks, and Marta remembers how you like your drink. Explore a cosy café and practise one small conversation at a time.',
    asset: '/assets/interior-cafe-room.webp', width: 1536, height: 1024,
    spawn: position(548, 800), exit: position(548, 845),
    walkableAreas: [[[160,222],[268,222],[268,288],[1020,288],[1020,530],[1360,530],[1360,850],[160,850]]],
    npcs: [
      { id: 'marta', ...position(685, 550), interactionId: 'interior:cafe:coffee', role: 'Café owner' },
      { id: 'lina', ...position(1060, 795), interactionId: 'interior:cafe:table', role: 'A customer on her break' },
    ],
    objects: [
      {
        id: 'interior:cafe:coffee', label: 'Marta’s coffee counter', germanName: 'Die Kaffeetheke', sessionTitle: 'Order your favourite coffee',
        ...position(590, 555), npcId: 'marta', activityId: 'cafe', dialogue: 'Guten Morgen! Was möchtest du trinken?',
        prompt: 'Order a coffee, choose milk, and finish your order politely.',
        description: 'The espresso machine gives a tiny satisfied puff after every order. Marta waits patiently while you find your words.',
        exerciseIds: cafeExercise(1, 2, 7),
        vocabulary: [vocabulary('der', 'Kaffee', 'die Kaffees', 'coffee'), vocabulary('die', 'Milch', '—', 'milk'), vocabulary('der', 'Zucker', '—', 'sugar')],
      },
      {
        id: 'interior:cafe:tea', label: 'The very opinionated kettle', germanName: 'Der Wasserkocher', sessionTitle: 'Ask about drinks and prices',
        ...position(790, 555), dialogue: 'Der Tee kostet drei Euro. Möchtest du auch ein Wasser?',
        prompt: 'Ask the price of tea, listen to the answer, and choose another drink.',
        description: 'A copper kettle rests on the service bar beside the coffee machine. Take your time asking about the drinks and their prices.',
        exerciseIds: cafeExercise(3, 4, 5),
        vocabulary: [vocabulary('der', 'Tee', 'die Tees', 'tea'), vocabulary('das', 'Wasser', '—', 'water'), vocabulary('die', 'Tasse', 'die Tassen', 'cup')],
      },
      {
        id: 'interior:cafe:pastries', label: 'The pastry display', germanName: 'Die Kuchenvitrine', sessionTitle: 'A small treat and a complete order',
        ...position(915, 555), dialogue: 'Noch etwas dazu? — Danke, das ist alles.',
        prompt: 'Choose something to drink, complete your order, and ask for the bill.',
        description: 'Golden pastries fill the glass display at the end of the bar. Practise finishing a small order and asking for the bill.',
        exerciseIds: cafeExercise(5, 7, 6),
        vocabulary: [vocabulary('der', 'Kuchen', 'die Kuchen', 'cake'), vocabulary('das', 'Croissant', 'die Croissants', 'croissant'), vocabulary('die', 'Speisekarte', 'die Speisekarten', 'menu')],
      },
      {
        id: 'interior:cafe:table', label: 'Lina’s window table', germanName: 'Der Tisch am Fenster', sessionTitle: 'Finish a café visit',
        ...position(1185, 825), npcId: 'lina', dialogue: 'Ein schöner Platz! Jetzt noch die Rechnung, bitte.',
        prompt: 'Listen to a price, close your order, and ask for the bill.',
        description: 'A candle flickers beside a slowly cooling cup. Lina has set down her deliveries for five quiet minutes.',
        exerciseIds: cafeExercise(4, 7, 6),
        vocabulary: [vocabulary('der', 'Tisch', 'die Tische', 'table'), vocabulary('die', 'Rechnung', 'die Rechnungen', 'bill'), vocabulary('das', 'Trinkgeld', 'die Trinkgelder', 'tip')],
      },
    ],
    props: [
      { id: 'cafe-service-bar-left', sheet: 'interior-furniture', asset: 'coffee-bar', x: 590, y: 490, width: 160, interactive: 'interior:cafe:coffee', collision: footprint(525, 445, 270, 48) },
      { id: 'cafe-service-bar-right', sheet: 'interior-furniture', asset: 'coffee-bar', x: 730, y: 490, width: 160, interactive: 'interior:cafe:tea' },
      { id: 'cafe-espresso', sheet: 'interior-cafe-objects', asset: 'espresso', x: 565, y: 415, width: 60, depth: 500, interactive: 'interior:cafe:coffee', effects: [{ asset: 'steam', x: 18, y: -30, width: 16, alpha: .22 }] },
      { id: 'cafe-grinder', sheet: 'interior-cafe-objects', asset: 'grinder', x: 660, y: 415, width: 38, depth: 501, interactive: 'interior:cafe:coffee' },
      { id: 'cafe-kettle', sheet: 'interior-cafe-objects', asset: 'kettle', x: 750, y: 415, width: 28, depth: 502, interactive: 'interior:cafe:tea', effects: [{ asset: 'steam', x: 10, y: -21, width: 12, alpha: .22 }] },
      { id: 'cafe-pastry-case', sheet: 'interior-cafe-objects', asset: 'pastry-case', x: 915, y: 490, width: 170, interactive: 'interior:cafe:pastries', collision: footprint(840, 445, 150, 47) },
      { id: 'cafe-reading-table', sheet: 'interior-cafe-objects', asset: 'cafe-table', x: 310, y: 675, width: 140, interactive: 'interior:cafe:table', collision: footprint(254, 632, 112, 45) },
      { id: 'cafe-central-table', sheet: 'interior-cafe-objects', asset: 'cafe-table', x: 640, y: 670, width: 140, interactive: 'interior:cafe:table', collision: footprint(584, 627, 112, 45) },
      { id: 'cafe-front-table', sheet: 'interior-cafe-objects', asset: 'cafe-table', x: 305, y: 805, width: 140, interactive: 'interior:cafe:table', collision: footprint(249, 762, 112, 45) },
      { id: 'cafe-window-banquette', sheet: 'interior-furniture', asset: 'banquette', x: 1200, y: 655, width: 145, interactive: 'interior:cafe:table', collision: footprint(1136, 620, 128, 37) },
      { id: 'cafe-window-table-south', sheet: 'interior-cafe-objects', asset: 'cafe-table', x: 1185, y: 780, width: 140, interactive: 'interior:cafe:table', collision: footprint(1129, 737, 112, 45) },
      { id: 'cafe-reading-cup', sheet: 'interior-cafe-objects', asset: 'cup', x: 330, y: 620, width: 12, depth: 682 },
      { id: 'cafe-central-cup', sheet: 'interior-cafe-objects', asset: 'cup', x: 660, y: 615, width: 12, depth: 677 },
      { id: 'cafe-window-cup', sheet: 'interior-cafe-objects', asset: 'cup', x: 1205, y: 725, width: 12, depth: 787, interactive: 'interior:cafe:table' },
      { id: 'cafe-candle', sheet: 'interior-decor', asset: 'candle', x: 1300, y: 715, width: 55, collision: footprint(1278, 694, 44, 23), effects: [{ asset: 'flame', x: 0, y: -51, width: 8, alpha: .35 }] },
      { id: 'cafe-window-plant', sheet: 'interior-decor', asset: 'plant', x: 225, y: 510, width: 60, collision: footprint(211, 494, 28, 18) },
      { id: 'cafe-clock', sheet: 'interior-decor', asset: 'pendulum-clock', x: 980, y: 285, width: 32 },
      { id: 'cafe-reading-shelf', sheet: 'interior-decor', asset: 'bookshelf', x: 1300, y: 590, width: 95, collision: footprint(1258, 564, 84, 28) },
      { id: 'cafe-menu-board', sheet: 'interior-furniture', asset: 'menu-board', x: 470, y: 780, width: 45, interactive: 'interior:cafe:coffee', collision: footprint(459, 764, 22, 18) },
    ],
  },
  {
    id: 'bakery', name: 'The lantern bakery', germanName: 'Die Bäckerei', subtitle: 'Fresh bread and gentle flour clouds', icon: 'leaf',
    description: 'An amber oven, warm wooden shelves, and a baker with time for your questions. Discover the names of everyday baked goods and practise buying a little something.',
    asset: '/assets/interior-bakery-room.webp', width: 1536, height: 1024,
    spawn: position(1000, 800), exit: position(1000, 845),
    walkableAreas: [
      [[218,500],[1340,500],[1340,850],[218,850]],
      [[620,188],[1340,188],[1340,449],[620,449]],
      [[842,438],[966,438],[966,505],[842,505]],
    ],
    barriers: [
      [[620,449],[842,449],[842,480],[620,480]],
      [[966,449],[1340,449],[1340,480],[966,480]],
    ],
    npcs: [
      { id: 'emil', ...position(1175, 785), interactionId: 'interior:bakery:counter', role: 'Today’s apprentice baker' },
      { id: 'marta', ...position(575, 820), interactionId: 'interior:bakery:pastries', role: 'Choosing treats for the café' },
    ],
    objects: [
      {
        id: 'interior:bakery:bread', label: 'The warm bread shelf', germanName: 'Das Brotregal', sessionTitle: 'Ask for bread',
        ...position(340, 785), dialogue: 'Guten Morgen! Ja, wir haben frisches Brot.',
        prompt: 'Ask whether bread is available and complete a polite purchase.',
        description: 'Fresh loaves fill the wooden shelves in the front shop. Ask whether bread is available and practise a polite purchase.',
        exerciseIds: [...marketExercise(2), ...cafeExercise(7), ...marketExercise(6)],
        vocabulary: [vocabulary('das', 'Brot', 'die Brote', 'bread'), vocabulary('das', 'Brötchen', 'die Brötchen', 'bread roll'), vocabulary('die', 'Brezel', 'die Brezeln', 'pretzel')],
      },
      {
        id: 'interior:bakery:oven', label: 'The glowing oven', germanName: 'Der Backofen', sessionTitle: 'A drink while the bread bakes',
        ...position(1200, 405), activityId: 'cafe', dialogue: 'Das Brot braucht noch einen Moment. Einen Kaffee dazu?',
        prompt: 'Order a coffee, choose milk, and say that your order is complete.',
        description: 'A low amber glow breathes behind the oven door. Emil insists that watching the bread rise is a perfectly respectable hobby.',
        exerciseIds: cafeExercise(1, 2, 7),
        vocabulary: [vocabulary('der', 'Backofen', 'die Backöfen', 'oven'), vocabulary('der', 'Teig', 'die Teige', 'dough'), vocabulary('das', 'Mehl', '—', 'flour')],
      },
      {
        id: 'interior:bakery:pastries', label: 'Marta’s pastry tray', germanName: 'Das Gebäck', sessionTitle: 'A treat to take away',
        ...position(685, 805), npcId: 'marta', dialogue: 'Für das Café, bitte. Und ein Wasser für unterwegs.',
        prompt: 'Choose a drink for the journey, listen to a price, and finish the order.',
        description: 'A pastry tray rests on the front counter. Marta is choosing something for her café and a drink for the journey.',
        exerciseIds: cafeExercise(5, 4, 7),
        vocabulary: [vocabulary('das', 'Gebäck', '—', 'pastries'), vocabulary('der', 'Keks', 'die Kekse', 'biscuit / cookie'), vocabulary('die', 'Schnecke', 'die Schnecken', 'swirl pastry')],
      },
      {
        id: 'interior:bakery:counter', label: 'The bakery counter', germanName: 'Die Bäckereitheke', sessionTitle: 'Pay for your bakery visit',
        ...position(1060, 820), npcId: 'emil', dialogue: 'Das kostet fünf Euro fünfzig. Mit Karte? Sehr gern.',
        prompt: 'Ask for bread, understand a total, and pay by card.',
        description: 'Emil waits beside the wooden counter. Listen to the total and tell him how you would like to pay.',
        exerciseIds: marketExercise(2, 4, 6),
        vocabulary: [vocabulary('die', 'Theke', 'die Theken', 'counter'), vocabulary('die', 'Karte', 'die Karten', 'card'), vocabulary('die', 'Tüte', 'die Tüten', 'bag')],
      },
    ],
    props: [
      { id: 'bakery-bread-rack', sheet: 'interior-bakery-objects', asset: 'bread-rack', x: 340, y: 705, width: 100, interactive: 'interior:bakery:bread', collision: footprint(297, 675, 86, 32), effects: [{ asset: 'steam', x: 0, y: -108, width: 22, alpha: .22 }] },
      { id: 'bakery-roll-rack', sheet: 'interior-bakery-objects', asset: 'bread-rack', x: 505, y: 705, width: 100, interactive: 'interior:bakery:bread', collision: footprint(462, 675, 86, 32), effects: [{ asset: 'steam', x: 0, y: -108, width: 22, alpha: .22 }] },
      { id: 'bakery-dough-counter', sheet: 'interior-furniture', asset: 'prep-bench', x: 725, y: 350, width: 145, collision: footprint(662, 310, 126, 42) },
      { id: 'bakery-dough-bench', sheet: 'interior-bakery-objects', asset: 'dough-bench', x: 725, y: 275, width: 46, depth: 360 },
      { id: 'bakery-mixing-counter', sheet: 'interior-furniture', asset: 'prep-bench', x: 975, y: 350, width: 145, collision: footprint(912, 310, 126, 42) },
      { id: 'bakery-mixer', sheet: 'interior-bakery-objects', asset: 'mixer', x: 975, y: 262, width: 45, depth: 361 },
      { id: 'bakery-oven', sheet: 'interior-bakery-objects', asset: 'oven', x: 1200, y: 365, width: 145, interactive: 'interior:bakery:oven', collision: footprint(1137, 316, 126, 51), effects: [{ asset: 'flame', x: 0, y: -62, width: 25, alpha: .4 }] },
      { id: 'bakery-pantry', sheet: 'interior-furniture', asset: 'pantry', x: 675, y: 270, width: 80, collision: footprint(640, 247, 70, 25) },
      { id: 'bakery-sink', sheet: 'interior-furniture', asset: 'sink', x: 1060, y: 270, width: 90, collision: footprint(1021, 244, 78, 28) },
      { id: 'bakery-pastry-counter', sheet: 'interior-bakery-objects', asset: 'bakery-counter', x: 685, y: 725, width: 155, interactive: 'interior:bakery:pastries', collision: footprint(617, 681, 136, 46) },
      { id: 'bakery-pastry-tray', sheet: 'interior-bakery-objects', asset: 'pastry-tray', x: 710, y: 670, width: 45, depth: 735, interactive: 'interior:bakery:pastries', effects: [{ asset: 'steam', x: 0, y: -32, width: 16, alpha: .22 }] },
      { id: 'bakery-counter', sheet: 'interior-bakery-objects', asset: 'bakery-counter', x: 1060, y: 735, width: 175, interactive: 'interior:bakery:counter', collision: footprint(984, 688, 152, 49) },
      { id: 'bakery-coat-stand', sheet: 'interior-decor', asset: 'coat-stand', x: 1250, y: 810, width: 60, collision: footprint(1235, 792, 30, 22) },
      { id: 'bakery-window-plant', sheet: 'interior-decor', asset: 'plant', x: 265, y: 805, width: 55, collision: footprint(252, 789, 26, 18) },
    ],
  },
  {
    id: 'supermarket', name: 'Fritz’s neighbourhood supermarket', germanName: 'Der Supermarkt', subtitle: 'Small errands, useful words', icon: 'basket',
    description: 'Colourful produce, familiar shelves, and a wonderfully unhurried checkout. Gather useful grocery words and handle one everyday shopping task at a time.',
    asset: '/assets/interior-supermarket-room.webp', width: 1536, height: 1024,
    spawn: position(1230, 790), exit: position(1230, 845),
    walkableAreas: [
      [[548,260],[1380,260],[1380,842],[160,842],[160,456],[548,456]],
      [[146,215],[498,215],[498,382],[146,382]],
      [[264,372],[369,372],[369,458],[264,458]],
      [[1150,835],[1300,835],[1300,875],[1150,875]],
    ],
    barriers: [
      [[506,215],[535,215],[535,440],[506,440]],
      [[146,417],[264,417],[264,440],[146,440]],
      [[369,417],[535,417],[535,440],[369,440]],
    ],
    npcs: [
      { id: 'fritz', ...position(1035, 825), interactionId: 'interior:supermarket:checkout', role: 'Neighbourhood shopkeeper' },
      { id: 'greta', ...position(420, 735), interactionId: 'interior:supermarket:produce', role: 'Choosing soup ingredients' },
    ],
    objects: [
      {
        id: 'interior:supermarket:produce', label: 'Greta’s colourful produce', germanName: 'Das Obst und Gemüse', sessionTitle: 'Choose fresh ingredients',
        ...position(300, 710), npcId: 'greta', activityId: 'market', dialogue: 'Zwei Äpfel? Die Tomaten sind heute besonders frisch.',
        prompt: 'Ask for apples, request a quantity of potatoes, and describe fresh tomatoes.',
        description: 'Fruit and vegetables fill the produce stand near the stockroom. Greta is choosing ingredients for a soup that Fritz has promised to fourteen people.',
        exerciseIds: marketExercise(1, 3, 5),
        vocabulary: [vocabulary('der', 'Apfel', 'die Äpfel', 'apple'), vocabulary('die', 'Kartoffel', 'die Kartoffeln', 'potato'), vocabulary('die', 'Tomate', 'die Tomaten', 'tomato')],
      },
      {
        id: 'interior:supermarket:shelves', label: 'The everyday essentials', germanName: 'Das Lebensmittelregal', sessionTitle: 'Find what you need',
        ...position(680, 820), dialogue: 'Brot findest du hier. Was brauchst du noch?',
        prompt: 'Ask for bread, name a quantity, and get ready to pay.',
        description: 'Two rows of grocery shelves leave clear aisles for browsing. Practise asking for everyday essentials and the quantities you need.',
        exerciseIds: marketExercise(2, 3, 6),
        vocabulary: [vocabulary('das', 'Brot', 'die Brote', 'bread'), vocabulary('der', 'Reis', '—', 'rice'), vocabulary('die', 'Nudel', 'die Nudeln', 'noodle / pasta')],
      },
      {
        id: 'interior:supermarket:scales', label: 'Fritz’s honest scales', germanName: 'Die Waage', sessionTitle: 'Quantities and prices',
        ...position(455, 720), dialogue: 'Ein Kilo, bitte. Das kostet fünf Euro fünfzig.',
        prompt: 'Request a weight, understand a price, and recognise when something costs too much.',
        description: 'The brass needle settles with a soft wobble. Fritz swears these scales have never weighed a customer’s shopping list by mistake.',
        exerciseIds: marketExercise(3, 4, 7),
        vocabulary: [vocabulary('die', 'Waage', 'die Waagen', 'scales'), vocabulary('das', 'Kilo', 'die Kilos', 'kilo'), vocabulary('der', 'Preis', 'die Preise', 'price')],
      },
      {
        id: 'interior:supermarket:checkout', label: 'Fritz’s friendly checkout', germanName: 'Die Kasse', sessionTitle: 'Finish the grocery shop',
        ...position(1180, 835), npcId: 'fritz', dialogue: 'Guten Tag! Das macht fünf Euro fünfzig. Wie möchtest du bezahlen?',
        prompt: 'Listen to the total, pay by card, and recognise a price problem.',
        description: 'The checkout display blinks softly while Fritz untangles a paper receipt. There is always time for another question.',
        exerciseIds: marketExercise(4, 6, 7),
        vocabulary: [vocabulary('die', 'Kasse', 'die Kassen', 'checkout'), vocabulary('der', 'Korb', 'die Körbe', 'basket'), vocabulary('der', 'Kassenbon', 'die Kassenbons', 'receipt')],
      },
    ],
    props: [
      { id: 'supermarket-produce', sheet: 'interior-supermarket-objects', asset: 'produce', x: 325, y: 625, width: 140, interactive: 'interior:supermarket:produce', collision: footprint(263, 584, 124, 43) },
      { id: 'supermarket-scales', sheet: 'interior-supermarket-objects', asset: 'scales', x: 460, y: 655, width: 85, interactive: 'interior:supermarket:scales', collision: footprint(423, 628, 74, 29) },
      { id: 'supermarket-refrigerator', sheet: 'interior-supermarket-objects', asset: 'refrigerator', x: 1210, y: 430, width: 100, collision: footprint(1166, 399, 88, 33) },
      { id: 'supermarket-aisle-one-north', sheet: 'interior-supermarket-objects', asset: 'grocery-shelf', x: 620, y: 535, width: 110, interactive: 'interior:supermarket:shelves', collision: footprint(572, 500, 96, 37) },
      { id: 'supermarket-aisle-two-north', sheet: 'interior-supermarket-objects', asset: 'grocery-shelf', x: 835, y: 535, width: 110, interactive: 'interior:supermarket:shelves', collision: footprint(787, 500, 96, 37) },
      { id: 'supermarket-aisle-one-south', sheet: 'interior-supermarket-objects', asset: 'grocery-shelf', x: 620, y: 735, width: 110, interactive: 'interior:supermarket:shelves', collision: footprint(572, 700, 96, 37) },
      { id: 'supermarket-aisle-two-south', sheet: 'interior-supermarket-objects', asset: 'grocery-shelf', x: 835, y: 735, width: 110, interactive: 'interior:supermarket:shelves', collision: footprint(787, 700, 96, 37) },
      { id: 'supermarket-checkout', sheet: 'interior-supermarket-objects', asset: 'checkout', x: 1125, y: 760, width: 155, interactive: 'interior:supermarket:checkout', collision: footprint(1058, 716, 134, 46) },
      { id: 'supermarket-basket', sheet: 'interior-supermarket-objects', asset: 'basket', x: 1290, y: 815, width: 45, collision: footprint(1274, 802, 32, 15) },
      { id: 'supermarket-stockroom-basket', sheet: 'interior-supermarket-objects', asset: 'basket', x: 210, y: 335, width: 45, collision: footprint(194, 322, 32, 15) },
      { id: 'supermarket-stockroom-aquarium', sheet: 'interior-decor', asset: 'aquarium', x: 425, y: 330, width: 65, collision: footprint(397, 309, 56, 23) },
      { id: 'supermarket-entrance-plant', sheet: 'interior-decor', asset: 'plant', x: 1345, y: 805, width: 55, collision: footprint(1332, 789, 26, 18) },
    ],
  },
];

export function getInterior(id: InteriorId): InteriorSpec {
  return interiors.find(interior => interior.id === id) ?? interiors[0];
}

export function getInteriorObject(id: string): InteriorObjectSpec | undefined {
  return interiors.flatMap(interior => [...interior.objects]).find(object => object.id === id);
}

const referencedExercises = new Set(interiors.flatMap(interior => interior.objects.flatMap(object => object.exerciseIds)));
/** These are the same server-graded expressions used by the existing quests. */
export const interiorExercises: Exercise[] = quests.flatMap(quest => quest.exercises).filter(exercise => referencedExercises.has(exercise.id));

/** Door markers sit on the pavement immediately outside existing storefronts. */
const entranceLocations: Readonly<Record<MapId, Readonly<Record<InteriorId, MapPosition>>>> = {
  lindenhafen: { cafe: position(588, 475), bakery: position(1172, 847), supermarket: position(1230, 485) },
  waldruh: { cafe: position(320, 365), bakery: position(385, 720), supermarket: position(893, 765) },
  nebelstadt: { cafe: position(190, 480), bakery: position(273, 775), supermarket: position(790, 822) },
};

export function buildingEntrances(mapId: MapId): readonly BuildingEntrance[] {
  return interiors.map(interior => ({
    id: `building:${interior.id}` as const, interiorId: interior.id, label: interior.name,
    description: interior.description, ...entranceLocations[mapId][interior.id],
  }));
}

/** Match each distinct building footprint and its partition doorways. */
export function createInteriorNavigation(id: InteriorId): NavigationGrid {
  const rectangle = (x: number, y: number, width: number, height: number): readonly (readonly [number, number])[] =>
    [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  const interior = getInterior(id);
  const obstacles = interior.props.flatMap(prop => prop.collision ? [rectangle(prop.collision.x, prop.collision.y, prop.collision.width, prop.collision.height)] : []);
  return new NavigationGrid(interior.walkableAreas, [...(interior.barriers ?? []), ...obstacles]);
}
