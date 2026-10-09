import { quests, type Exercise, type Level } from './content.ts';
import type { Progress } from './api';

export type ActivityId = 'cafe' | 'market' | 'detective' | 'delivery';
export type ActivityMode = 'recognition' | 'production' | 'listening';
export interface ActivityDefinition {
  id: ActivityId; title: string; description: string; npcId: string; icon: string;
  objectKinds: string[]; levels: Level[]; scenarioCount: number;
}
export const activityDefinitions: readonly ActivityDefinition[] = [
  { id: 'cafe', title: 'A shift at the Lantern Café', description: 'Read the orders, assemble a tray and keep the kitchen running.', npcId: 'marta', icon: 'cup', objectKinds: ['fountain', 'garden'], levels: ['A1','A2','B1'], scenarioCount: 12 },
  { id: 'market', title: 'The midnight market', description: 'Trade useful things, balance a budget and count the change.', npcId: 'fritz', icon: 'basket', objectKinds: ['garden', 'noticeboard'], levels: ['A1','A2','B1'], scenarioCount: 12 },
  { id: 'detective', title: 'The evidence room', description: 'Connect the witnesses, reconstruct events and uncover a missing fact.', npcId: 'ada', icon: 'clue', objectKinds: ['instrument', 'clock'], levels: ['A1','A2','B1'], scenarioCount: 12 },
  { id: 'delivery', title: 'Letters through the mist', description: 'Follow German directions, choose a connection and deliver the right parcel.', npcId: 'lina', icon: 'parcel', objectKinds: ['parcel', 'lantern', 'noticeboard'], levels: ['A1','A2','B1'], scenarioCount: 12 },
];

export interface InventoryItem { id: string; german: string; icon: string; price?: number; }
export const inventory: Record<string, InventoryItem> = Object.fromEntries([
  ['coffee','Kaffee','cup',220], ['tea','Tee','cup',180], ['water','Wasser','cup',100], ['milk','Milch','cup',80],
  ['bread','Brot','basket',250], ['apple','Apfel','leaf',120], ['potato','Kartoffeln · 1 kg','basket',300], ['tomato','Tomate','leaf',100],
  ['vegetables','Gemüse','leaf',150], ['meat','Fleisch','basket',450], ['receipt','Rechnung','scroll',0], ['reusable','Mehrwegbecher','cup',0], ['disposable','Einwegbecher','cup',0],
  ['room620','Zimmer · 620 €','book',62000], ['room480','Zimmer · 480 €','book',48000], ['room540','Zimmer · 540 €','book',54000],
  ['returnTicket','Hin- und Rückfahrt','route',1800], ['singleTicket','Einfache Fahrt','route',1200],
  ['oldMap','Karte von 1860','map',300], ['newMap','Karte von 1910','map',100],
  ['shortRoute','8 km · kurze Strecke','route',1200], ['longRoute','14 km · lange Strecke','route',700],
  ['wood','Holz','parcel',350], ['rope','Seil','route',200], ['premiumWood','Edelholz','parcel',550],
].map(([id,german,icon,price]) => [id,{ id,german,icon,price }])) as Record<string, InventoryItem>;

export interface CafeGoal {
  items: Record<string, number>; steps: string[]; venue?: 'inside'|'outside'; service?: 'table'|'takeaway'; slot?: string;
}
export interface CafeBoard { kind: 'cafe'; stock: string[]; actions: string[]; goal: CafeGoal; }
export interface MarketBoard {
  kind: 'market'; stock: string[]; goal: Record<string,number>; budget: number; tender: number;
  method: 'cash'|'card'; initialBasket?: Record<string,number>; trade?: { give:string; receive:string; quantity:number };
}
export interface EvidenceCard { id: string; german: string; icon: string; }
export interface EvidenceSlot { id: string; german: string; expected: string; }
export interface DetectiveBoard { kind: 'detective'; cards: EvidenceCard[]; slots: EvidenceSlot[]; }
export interface Cell { x:number; y:number; }
export type Turn = 'left'|'straight'|'right'|'back';
export interface DeliveryBoard {
  kind: 'delivery'; columns:number; rows:number; roads:Cell[]; start:Cell; heading:number; path:Cell[];
  goal:Cell; goalName:string; checkpoint:Cell; checkpointName:string; parcel:string; parcels:string[];
  transport:'walk'|'train'|'bus'; departure?:string; help?:boolean; directions: string[];
}
export type ActivityBoard = CafeBoard | MarketBoard | DetectiveBoard | DeliveryBoard;
export interface ActivityScenario {
  id:string; activityId:ActivityId; level:Level; exerciseId:string; title:string; briefing:string;
  german:string; hint:string; discovery:string; wordTags:string[]; board:ActivityBoard;
}

const scenarios: ActivityScenario[] = [];
const addCafe = (level:Level, name:string, exerciseId:string, german:string, hint:string, goal:CafeGoal, stock:string[], discovery:string) => {
  scenarios.push({ id:`cafe-${level.toLowerCase()}-${name}`, activityId:'cafe', level, exerciseId, title: name.replaceAll('-',' '),
    briefing: 'Marta needs a hand. Prepare the tray, carry out the kitchen steps in order, then serve. The order determines the table, time or packaging.',
    german, hint, discovery, wordTags:['Kaffee','Tee','Wasser','Milch','bitte','Gemüse','zuerst','dann','weil'],
    board:{kind:'cafe',stock,goal,actions:[...new Set([...goal.steps,'brew','pour','tidy','cook','pack','serve'])]} });
};
addCafe('A1','first-light','a1-cafe-exercise-1','Ich möchte einen Kaffee. Erst die Tasse, dann den Kaffee kochen und einschenken.','One coffee. Choose a cup, brew the coffee, then pour it.',{items:{coffee:1},steps:['cup','brew','pour']},['coffee','tea','water','milk'],'Marta finds a train ticket tucked beneath the saucer. Its platform number has been scratched away.');
addCafe('A1','milk-and-secrets','a1-cafe-exercise-2','Ein Kaffee. Mit Milch, bitte. Erst die Tasse, dann Kaffee kochen, einschenken und Milch dazugeben.','One coffee with milk. Cup → brew → pour → add milk.',{items:{coffee:1,milk:1},steps:['cup','brew','pour','addMilk']},['coffee','tea','water','milk'],'A milk-ring on the receipt circles the same date as Otto’s missing departure.');
addCafe('A1','a-glass-of-water','a1-cafe-exercise-5','Ich nehme ein Wasser. Bitte ein Glas nehmen und einschenken.','One water. Take a glass, then pour. No brewing.',{items:{water:1},steps:['glass','pour']},['water','coffee','tea','milk'],'The customer remembers a carriage full of lanterns. Nobody remembers selling it a ticket.');
addCafe('A1','the-last-receipt','a1-cafe-exercise-6','Ein Kaffee und die Rechnung, bitte. Kaffee kochen, einschenken und die Rechnung schreiben.','One coffee and its receipt. Brew → pour → write the bill.',{items:{coffee:1,receipt:1},steps:['brew','pour','bill']},['coffee','tea','water','receipt'],'The bill contains a tiny handwritten note: “Ask the courier what arrived tomorrow.”');
addCafe('A2','soup-club','a2-evening-plans-exercise-5','Ich esse lieber Gemüse als Fleisch. Für die Suppe brauche ich zwei Portionen Gemüse und ein Glas Wasser. Erst waschen, dann kochen und servieren.','The guest prefers vegetables. Two vegetable portions and one water; wash → cook → serve.',{items:{vegetables:2,water:1},steps:['wash','cook','serve']},['vegetables','meat','water','bread'],'Fritz’s soup club has been meeting every Thursday for a week that never ended.');
addCafe('A2','half-past-six','a2-evening-plans-exercise-2','Wir treffen uns am Samstag um halb sieben. Zwei Gläser Wasser am Tisch, bitte. Glas nehmen, einschenken und servieren.','Saturday at 18:30. Two waters, table service; glass → pour → serve.',{items:{water:2},steps:['glass','pour','serve'],slot:'18:30',service:'table'},['water','tea','coffee','milk'],'At exactly half past six, the clockmill’s second hand moves backward once.');
addCafe('A2','rain-at-the-inn','a2-evening-plans-exercise-6','Wir bleiben zu Hause, weil es regnet. Zwei Tassen Tee drinnen, bitte. Tasse nehmen, Tee kochen und einschenken.','They stay inside because of rain. Two teas, indoors; cup → brew → pour.',{items:{tea:2},steps:['cup','brew','pour'],venue:'inside'},['tea','coffee','water','milk'],'Under the wet umbrella is a map showing Waldruh where an empty forest should be.');
addCafe('A2','before-the-soup','a2-broken-clock-exercise-2','Zuerst habe ich aufgeräumt, dann habe ich gekocht. Heute machen wir es genauso: Gemüse und Wasser, danach servieren.','First tidy, then cook, then serve. One vegetable portion and one water.',{items:{vegetables:1,water:1},steps:['tidy','cook','serve']},['vegetables','meat','water','bread'],'The kitchen log and the mill’s log describe the same missing eleven minutes.');
addCafe('B1','shelter-from-the-storm','b1-storm-exercise-3','Falls es weiter regnet, findet das Fest in der Halle statt. Es regnet noch. Bereite drinnen zwei Tassen Tee und zwei Brote vor: zuerst Tee kochen, dann einschenken und servieren.','The rain continues, so move the catering inside. Two teas, two breads; brew → pour → serve.',{items:{tea:2,bread:2},steps:['brew','pour','serve'],venue:'inside'},['tea','coffee','bread','water'],'The harbor’s guests shelter together. Two witnesses finally compare the stories they were afraid to tell.');
addCafe('B1','a-cleaner-festival','b1-storm-exercise-4','Wir sollten vermeiden, unnötig Müll zu produzieren. Zwei Kaffee, aber keine Einwegbecher. Nimm zwei Mehrwegbecher, koche Kaffee und schenke ein.','Two coffees and two reusable cups. No disposable cups; cup → brew → pour.',{items:{coffee:2,reusable:2},steps:['cup','brew','pour']},['coffee','tea','reusable','disposable'],'On a reusable cup, the old council seal survives beneath years of paint.');
addCafe('B1','friday-deliveries','b1-work-exercise-3','Die Arbeitszeit beginnt um acht, aber freitags arbeiten wir von zu Hause. Heute ist Freitag: ein Kaffee und ein Brot zum Mitnehmen. Kaffee kochen, einpacken und ausgeben.','Friday means working from home. Pack one coffee and one bread for takeaway; brew → pack → serve.',{items:{coffee:1,bread:1},steps:['brew','pack','serve'],service:'takeaway'},['coffee','tea','bread','water'],'The office delivery reaches a clerk who quietly kept the original reopening agreement.');
addCafe('B1','the-council-break','b1-work-exercise-2','Zu meinen Aufgaben gehört die Planung der Termine. Ada kommt um neun Uhr. Plane den Tisch für 09:00 mit einem Tee: Tasse nehmen, Tee kochen und einschenken.','Schedule Ada’s table for 09:00 and prepare one tea; cup → brew → pour.',{items:{tea:1},steps:['cup','brew','pour'],slot:'09:00',service:'table'},['tea','coffee','water','milk'],'Ada’s appointment book shows that both towns requested the same meeting. The invitations never crossed the harbor.');

const addMarket = (level:Level,name:string,exerciseId:string,german:string,hint:string,board:Omit<MarketBoard,'kind'>,discovery:string) => {
  scenarios.push({id:`market-${level.toLowerCase()}-${name}`,activityId:'market',level,exerciseId,title:name.replaceAll('-',' '),
    briefing:'Build the basket from the German request. Keep within the purse, choose cash or card, then count any change before closing the deal.',
    german,hint,discovery,wordTags:['Apfel','Kartoffeln','Gemüse','kosten','Euro','Karte','teuer','günstig','älter'],board:{kind:'market',...board}});
};
addMarket('A1','two-apples','a1-market-exercise-1','Ich brauche zwei Äpfel. Ich bezahle bar mit fünf Euro.','Two apples cost €2.40. The customer gives €5; return €2.60.',{stock:['apple','tomato','bread'],goal:{apple:2},budget:500,tender:500,method:'cash'},'Fritz wraps the apples in a newspaper reporting a train that never arrived.');
addMarket('A1','potatoes-for-soup','a1-market-exercise-3','Ein Kilo Kartoffeln, bitte. Ich gebe Ihnen fünf Euro.','One potato unit is one kilogram and costs €3. Return €2 from the €5 note.',{stock:['potato','apple','tomato'],goal:{potato:1},budget:500,tender:500,method:'cash'},'The potato sack bears Waldruh’s mill stamp. The road there has supposedly been closed for years.');
addMarket('A1','five-fifty','a1-market-exercise-4','Ein Brot und ein Kilo Kartoffeln. Das kostet fünf Euro fünfzig. Ich gebe Ihnen sechs Euro.','Bread €2.50 + potatoes €3 = €5.50. Return €0.50 from €6.',{stock:['bread','potato','apple'],goal:{bread:1,potato:1},budget:600,tender:600,method:'cash'},'A price ledger contains a second set of dates, all eleven minutes ahead.');
addMarket('A1','paying-by-card','a1-market-exercise-6','Eine Portion Gemüse und zwei Tomaten, bitte. Ich bezahle mit Karte.','One vegetable portion and two tomatoes; pay by card. Card payments have no cash change.',{stock:['vegetables','tomato','meat'],goal:{vegetables:1,tomato:2},budget:400,tender:400,method:'card'},'The card receipt names a station the official timetable omits.');
addMarket('A2','a-good-exchange','a2-evening-plans-exercise-5','Ich esse lieber Gemüse als Fleisch. Tausche das Fleisch gegen zwei Portionen Gemüse. Ich zahle bar mit fünf Euro.','Use the exchange offer to trade the meat for two vegetables. Total €3; return €2.',{stock:['meat','vegetables','bread'],initialBasket:{meat:1},trade:{give:'meat',receive:'vegetables',quantity:2},goal:{vegetables:2},budget:500,tender:500,method:'cash'},'The exchange voucher was printed in Waldruh tomorrow. Fritz would like to know whether that affects tax.');
addMarket('A2','the-moving-inn','a2-apartment-exercise-2','Die Miete ist zu hoch. Ich habe höchstens fünfhundert Euro. Ich nehme das Zimmer für vierhundertachtzig Euro und bezahle mit Karte.','Reject the €620 room. Choose the €480 room within the €500 budget and pay by card.',{stock:['room620','room480','room540'],initialBasket:{room620:1},goal:{room480:1},budget:50000,tender:50000,method:'card'},'The affordable room’s window looks onto a platform that was removed from every map.');
addMarket('A2','a-return-journey','a2-rail-trip-exercise-5','Ist die Rückfahrt im Preis enthalten? Ich brauche Hin- und Rückfahrt. Mein Budget ist zwanzig Euro. Ich bezahle mit Karte.','Buy the return ticket for €18, within the €20 budget; pay by card.',{stock:['returnTicket','singleTicket','newMap'],goal:{returnTicket:1},budget:2000,tender:2000,method:'card'},'The return ticket is valid at both ends of a route that supposedly has only one station.');
addMarket('A2','the-older-chart','a2-archive-exercise-4','Diese Karte ist älter als die andere. Ich suche die Karte von 1860 und gebe Ihnen fünf Euro bar.','Choose the 1860 chart. It costs €3; return €2.',{stock:['oldMap','newMap','bread'],goal:{oldMap:1},budget:500,tender:500,method:'cash'},'On the older chart, Waldruh and Nebelstadt are joined by a line nobody remembers erasing.');
addMarket('B1','the-short-route','b1-new-route-exercise-3','Die neue Strecke wäre kürzer, aber die Fahrkarten wären teurer. Ich brauche die kürzeste Strecke und kann zwölf Euro mit Karte bezahlen.','Choose the 8 km route for €12, rather than the 14 km route for €7. Pay by card.',{stock:['shortRoute','longRoute','newMap'],goal:{shortRoute:1},budget:1200,tender:1200,method:'card'},'The shortest route passes the council’s unused signal tower. Its lantern is still warm.');
addMarket('B1','the-cheaper-route','b1-new-route-exercise-6','Obwohl die Strecke länger ist, ist sie günstiger. Ich habe nur acht Euro und gebe Ihnen zehn Euro bar.','Choose the €7 longer route within the €8 budget. Return €3 from €10.',{stock:['shortRoute','longRoute','oldMap'],goal:{longRoute:1},budget:800,tender:1000,method:'cash'},'The cheaper route’s ledger has been altered, but the original fare can still be read underneath.');
addMarket('B1','nothing-wasted','b1-storm-exercise-5','Je weniger wir verschwenden, desto mehr sparen wir. Wir brauchen genau drei Portionen Gemüse, nicht mehr. Ich gebe Ihnen fünf Euro bar.','Buy exactly three vegetable portions, €4.50 total. Return €0.50; extras would be waste.',{stock:['vegetables','meat','bread'],goal:{vegetables:3},budget:500,tender:500,method:'cash'},'Three towns share the final soup equally. For once, the accounts balance and nobody forms a committee.');
addMarket('B1','costs-of-repair','b1-council-exercise-3','Ich verstehe den Vorschlag, trotzdem mache ich mir Sorgen um die Kosten. Wir brauchen zwei Stücke Holz und ein Seil. Höchstens neun Euro; hier sind zehn Euro bar.','Two ordinary wood units and one rope cost €9. Premium wood exceeds the budget. Return €1.',{stock:['wood','rope','premiumWood'],goal:{wood:2,rope:1},budget:900,tender:1000,method:'cash'},'The repair order contains signatures from both towns. The dispute was never about whether the bridge should reopen.');

const addDetective = (level:Level,name:string,exerciseId:string,german:string,hint:string,entries:[string,string,string][],slots:[string,string][],discovery:string) => {
  scenarios.push({id:`detective-${level.toLowerCase()}-${name}`,activityId:'detective',level,exerciseId,title:name.replaceAll('-',' '),
    briefing:'Select an evidence slip, then a place on the board. Connect all the facts. You can move any slip again before presenting the reconstruction.',
    german,hint,discovery,wordTags:['Schlüssel','Tisch','Fenster','Paket','gestern','zuerst','danach','weil','Aussage','Bericht'],
    board:{kind:'detective',cards:entries.map(([id,german,icon])=>({id,german,icon})),slots:slots.map(([german,expected],i)=>({id:`slot-${i}`,german,expected}))}});
};
addDetective('A1','the-workshop-key','a1-workshop-exercise-1','Der Schlüssel ist auf dem Tisch. Das Fenster ist geschlossen. Das Paket ist für Marta.','Key → on the table; window → closed; parcel → for Marta.',[['key','der Schlüssel','lock'],['window','das Fenster','expand'],['parcel','das Paket','parcel'],['lamp','die Lampe','lantern']],[['Auf dem Tisch','key'],['Geschlossen','window'],['Für Marta','parcel']],'The key’s teeth match the outline of the missing platform on Otto’s sketch.');
addDetective('A1','closed-window','a1-workshop-exercise-4','Das Fenster ist geschlossen. Die Tür ist offen. Die Lampe funktioniert nicht.','Window → closed; door → open; lamp → broken.',[['window','das Fenster','expand'],['door','die Tür','lock'],['lamp','die Lampe','lantern'],['key','der Schlüssel','lock']],[['Geschlossen','window'],['Offen','door'],['Kaputt','lamp']],'The closed window rules out Emil’s theory that a pigeon stole the page. Emil requests more evidence.');
addDetective('A1','three-recipients','a1-lost-parcel-exercise-1','Das Paket ist für Marta. Die Fahrkarte ist für Otto. Der Schlüssel ist für Emil.','Parcel → Marta; ticket → Otto; key → Emil.',[['parcel','das Paket','parcel'],['ticket','die Fahrkarte','route'],['key','der Schlüssel','lock'],['book','das Buch','book']],[['Marta','parcel'],['Otto','ticket'],['Emil','key']],'Marta’s parcel contains a blank page that reveals writing when held beside a lantern.');
addDetective('A1','platform-two','a1-station-exercise-4','Der Zug nach Berlin fährt von Gleis zwei ab. Der Zug nach Hamburg steht an Gleis eins. Otto wartet im Büro.','Berlin train → platform two; Hamburg train → platform one; Otto → office.',[['berlin','Zug nach Berlin','route'],['hamburg','Zug nach Hamburg','route'],['otto','Otto','users'],['pigeon','die Taube','leaf']],[['Gleis zwei','berlin'],['Gleis eins','hamburg'],['Im Büro','otto']],'The unlisted platform is not platform two. The old numbering jumps from two to four.');
addDetective('A2','yesterday-key','a2-broken-clock-exercise-1','Vorgestern ist die Lampe verschwunden. Ich habe gestern den Schlüssel gefunden. Heute haben wir die Uhr repariert.','Two days ago: lamp disappeared. Yesterday: key found. Today: clock repaired.',[['lamp','Die Lampe ist verschwunden.','lantern'],['key','Den Schlüssel gefunden.','lock'],['clock','Die Uhr repariert.','clock'],['soup','Die Suppe gekocht.','cup']],[['Vorgestern','lamp'],['Gestern','key'],['Heute','clock']],'The key was found before the clock restarted. The mill did not cause its disappearance.');
addDetective('A2','kitchen-chronology','a2-broken-clock-exercise-2','Zuerst habe ich aufgeräumt, dann habe ich gekocht. Danach habe ich den Brief zur Post gebracht.','First tidy, then cook, afterwards post the letter.',[['tidy','Ich habe aufgeräumt.','sparkles'],['cook','Ich habe gekocht.','cup'],['post','Ich habe den Brief gebracht.','parcel'],['sleep','Ich habe geschlafen.','clock']],[['Zuerst','tidy'],['Dann','cook'],['Danach','post']],'The letter left the kitchen after the clockmill stopped, yet arrived eleven minutes earlier.');
addDetective('A2','the-returned-lamp','a2-broken-clock-exercise-7','Otto hat die Lampe zurückgebracht. Ada hat die Karte gefunden. Lina hat das Paket geliefert.','Otto returned the lamp. Ada found the map. Lina delivered the parcel.',[['lamp','Die Lampe zurückgebracht.','lantern'],['map','Die Karte gefunden.','map'],['parcel','Das Paket geliefert.','parcel'],['clock','Die Uhr repariert.','clock']],[['Otto','lamp'],['Ada','map'],['Lina','parcel']],'Otto’s lamp and Ada’s chart bear the same old council mark.');
addDetective('A2','the-station-before','a2-archive-exercise-1','Früher war der Bahnhof kleiner. Heute hat er vier Gleise. Die alte Glocke hängt noch immer dort.','Old station → small; today → four platforms; unchanged → the old bell.',[['small','Ein kleiner Bahnhof.','route'],['four','Vier Gleise.','route'],['bell','Die alte Glocke.','lantern'],['forest','Ein leerer Wald.','leaf']],[['Früher','small'],['Heute','four'],['Unverändert','bell']],'The bell appears on the oldest photograph, above an entrance that has since been bricked shut.');
addDetective('B1','a-face-in-the-dark','b1-witness-exercise-2','Ich konnte ihr Gesicht nicht erkennen, weil es zu dunkel war. Ich sah eine Person weggehen. Ihr Name bleibt unbekannt.','Cause → darkness; reliable observation → a person left; identity → unknown. Do not invent a name.',[['dark','Es war zu dunkel.','lantern'],['left','Eine Person ging weg.','route'],['unknown','Der Name ist unbekannt.','clue'],['marta','Es war sicher Marta.','users']],[['Ursache','dark'],['Beobachtung','left'],['Identität','unknown']],'The witness saw movement, not a face. An old accusation loses its only supposed certainty.');
addDetective('B1','waiting-then-leaving','b1-witness-exercise-4','Zuerst hat sie gewartet, danach ist sie gegangen. Erst später hat Otto die Lampe gefunden.','She waited, then left; Otto found the lamp afterwards.',[['wait','Sie hat gewartet.','clock'],['leave','Sie ist gegangen.','route'],['lamp','Otto fand die Lampe.','lantern'],['train','Der Zug war pünktlich.','route']],[['Zuerst','wait'],['Danach','leave'],['Erst später','lamp']],'The lamp was found after the traveler left. Possession is no longer evidence that she took it.');
addDetective('B1','a-timetable-disagrees','b1-witness-exercise-5','Der Zeuge behauptet: Der Zug fuhr um acht Uhr. Der Fahrplan zeigt: Abfahrt um 07:50. Beide Angaben können nicht dieselbe Abfahrt beschreiben.','Witness → 08:00; timetable → 07:50; conclusion → contradiction.',[['eight','Abfahrt um 08:00.','users'],['seven','Abfahrt um 07:50.','scroll'],['conflict','Die Angaben widersprechen sich.','clue'],['agree','Die Angaben stimmen überein.','check']],[['Aussage des Zeugen','eight'],['Fahrplan','seven'],['Folgerung','conflict']],'The eleven-minute discrepancy comes from two clocks. The witness may be mistaken without lying.');
addDetective('B1','two-sides-one-report','b1-atlas-exercise-1','Der Bericht zeigt, dass beide Seiten Fehler gemacht haben. Die Stadt ignorierte die Warnung. Das Dorf hielt die Briefe zurück. Jetzt wollen beide Probleme frühzeitig besprechen.','City → ignored the warning; village → held back letters; agreement → discuss problems early.',[['warning','Die Warnung wurde ignoriert.','flag'],['letters','Die Briefe wurden zurückgehalten.','parcel'],['talk','Probleme frühzeitig besprechen.','chat'],['blame','Nur eine Seite ist schuld.','clue']],[['Die Stadt','warning'],['Das Dorf','letters'],['Die Vereinbarung','talk']],'The final report names mistakes on both sides. The missing route can be repaired without choosing a villain.');

const routePaths: Cell[][] = [
  [[1,3],[1,2],[1,1],[2,1],[3,1],[3,2],[4,2]],
  [[0,2],[1,2],[2,2],[2,1],[3,1],[4,1],[4,2],[5,2]],
  [[1,4],[1,3],[2,3],[3,3],[3,2],[4,2],[4,1],[5,1]],
  [[0,1],[1,1],[2,1],[2,2],[3,2],[4,2],[4,3],[5,3]],
].map(path=>path.map(([x,y])=>({x,y})));
const cellKey = (cell:Cell) => `${cell.x},${cell.y}`;
const directionsFor = (path:Cell[], heading:number): string[] => {
  let facing = heading;
  return path.slice(1).map((cell,index) => {
    const previous = path[index], dx = cell.x - previous.x, dy = cell.y - previous.y;
    const next = dx > 0 ? 1 : dx < 0 ? 3 : dy > 0 ? 2 : 0;
    const turn = (next - facing + 4) % 4;
    facing = next;
    return turn === 0 ? 'Gehe geradeaus.' : turn === 1 ? 'Biege rechts ab.' : turn === 3 ? 'Biege links ab.' : 'Kehre um.';
  });
};
const addDelivery = (level:Level,name:string,exerciseId:string,german:string,hint:string,index:number,goalName:string,parcel:string,transport:DeliveryBoard['transport'],discovery:string,departure?:string,help?:boolean) => {
  const path = routePaths[index].map(cell=>({...cell}));
  const heading = index === 2 ? 0 : 1;
  const checkpoint = path[Math.floor(path.length / 2)];
  const roads = [...path,{x:0,y:0},{x:1,y:0},{x:4,y:4},{x:5,y:4}].filter((cell,i,all)=>all.findIndex(other=>cellKey(other)===cellKey(cell))===i);
  scenarios.push({id:`delivery-${level.toLowerCase()}-${name}`,activityId:'delivery',level,exerciseId,title:name.replaceAll('-',' '),
    briefing:'Read the dispatch, choose the parcel and connection, then turn through the streets. Reach the marked checkpoint before delivering. Buildings and water block the way.',
    german,hint,discovery,wordTags:['links','rechts','geradeaus','Paket','Post','umsteigen','Abfahrt','früher','Hilfe'],
    board:{kind:'delivery',columns:6,rows:5,roads,start:path[0],heading,path,goal:path.at(-1)!,goalName,checkpoint,checkpointName:level==='A2'&&index===1?'Hamburg':'Laternenplatz',parcel,parcels:[parcel,...['Marta','Otto','Ada','Brief'].filter(value=>value!==parcel)].slice(0,3),transport,departure,help,directions:directionsFor(path,heading)}});
};
addDelivery('A1','left-to-the-pharmacy','a1-lost-parcel-exercise-3','Die Apotheke ist links. Das Paket ist für Ada. Gehe zu Fuß über den Laternenplatz.','Choose Ada’s parcel and walk. The first turn is left; follow the directions to the pharmacy.',0,'Apotheke','Ada','walk','The pharmacist’s delivery book confirms that Ada received the lantern before the train disappeared.');
addDelivery('A1','straight-to-otto','a1-lost-parcel-exercise-4','Gehen Sie geradeaus. Das Paket ist für Otto am Bahnhof. Zu Fuß über den Laternenplatz.','Otto’s parcel, walking. Start straight ahead and pass the checkpoint.',1,'Bahnhof','Otto','walk','Otto signs with the station stamp: its fourth platform has been filed away under “miscellaneous.”');
addDelivery('A1','finding-the-post','a1-lost-parcel-exercise-5','Ich suche die Post. Dieser Brief muss zur Post. Gehe zu Fuß über den Laternenplatz.','Choose the letter, walk to the post office and pass the checkpoint.',2,'Post','Brief','walk','The postbox contains a letter addressed to a town that is missing from the map.');
addDelivery('A1','marta-parcel','a1-lost-parcel-exercise-6','Hier ist Ihr Paket. Das Paket ist für Marta im Café. Gehe zu Fuß über den Laternenplatz.','Marta’s parcel belongs at the café. Walk through the checkpoint, then deliver.',3,'Café','Marta','walk','Marta unwraps a second atlas page. The edges fit the blank page from the first delivery.');
addDelivery('A2','change-in-hamburg','a2-rail-trip-exercise-1','Muss ich in Hamburg umsteigen? Ja. Bring Ottos Paket mit dem Zug über Hamburg nach Berlin.','Otto’s parcel, train connection, with a stop in Hamburg before Berlin.',1,'Berlin','Otto','train','The connecting train’s conductor remembers a Waldruh signal shining in the wrong direction.');
addDelivery('A2','twenty-minutes','a2-rail-trip-exercise-2','Der Anschlusszug fährt in zwanzig Minuten ab. Es ist 09:00. Wähle die richtige Abfahrt und bring Adas Paket mit dem Zug.','09:00 plus twenty minutes is 09:20. Ada’s parcel travels by train.',0,'Archiv','Ada','train','At 09:20, Ada’s timetable and the station clock agree for the first time.','09:20');
addDelivery('A2','missed-connection','a2-rail-trip-exercise-3','Ich habe meinen Anschluss verpasst. Der Zug ist weg, aber der Bus fährt. Bring Martas Paket mit dem Bus.','The train has already left. Take the bus with Marta’s parcel.',2,'Gasthaus','Marta','bus','The bus driver kept the old route marker rather than throwing it away.');
addDelivery('A2','bus-out-of-service','a2-rail-trip-exercise-7','Wegen einer Störung fährt der Bus heute nicht. Bring den Brief zu Fuß über den Laternenplatz.','The bus is not running. Walk with the letter instead.',3,'Post','Brief','walk','The canceled bus announcement uses the same wording as the vanished rail route’s closure.');
addDelivery('B1','if-the-train-is-cancelled','b1-new-route-exercise-1','Wenn der Zug ausfällt, nehmen wir den Bus. Der Zug ist ausgefallen. Bring Adas Bericht mit dem Bus zur Halle.','The condition has happened: the train is canceled. Take the bus with Ada’s parcel.',0,'Halle','Ada','bus','Ada’s report reaches the hall before the council can postpone reading it.');
addDelivery('B1','instead-of-waiting','b1-new-route-exercise-4','Statt zu warten, könnten wir zu Fuß gehen. Bring Martas Paket jetzt zu Fuß über den Laternenplatz.','Do not wait for transport. Walk with Marta’s parcel.',1,'Ratshaus','Marta','walk','The walk reveals a surviving section of the original footbridge. It was never beyond repair.');
addDelivery('B1','leave-earlier','b1-new-route-exercise-7','Ich schlage vor, dass wir früher losfahren. Die Sitzung beginnt um neun Uhr. Nimm die Abfahrt um 08:00 mit dem Zug und Ottos Paket.','Leave at 08:00, earlier than the 09:00 meeting. Choose the train and Otto’s parcel.',2,'Ratshaus','Otto','train','The early departure brings both towns’ witnesses into the same room.','08:00');
addDelivery('B1','ask-for-help','b1-storm-exercise-6','Wenn ich an deiner Stelle wäre, würde ich Hilfe holen. Die Brücke ist beschädigt. Hole Hilfe, dann bring den Brief zu Fuß zur Signalstation.','Call for help before crossing the checkpoint bridge. Take the letter on foot.',3,'Signalstation','Brief','walk','The harbor workers secure the bridge together. The last atlas page can finally cross the mist.',undefined,true);

export const activityScenarios: readonly ActivityScenario[] = scenarios;
/** Stable IDs for bundled German speech, also used by browsers without a German voice. */
export const activityAudioJobs: {id:string;text:string}[] = [
  ...scenarios.flatMap(scene=>[
    {id:`activity-${scene.id}-order`,text:scene.german},
    ...(scene.board.kind==='detective'?scene.board.cards.map(card=>({id:`activity-${scene.id}-${card.id}`,text:card.german})):[]),
  ]),
  {id:'activity-direction-straight',text:'Gehe geradeaus.'},
  {id:'activity-direction-left',text:'Biege links ab.'},
  {id:'activity-direction-right',text:'Biege rechts ab.'},
  {id:'activity-direction-back',text:'Kehre um.'},
];
export const exerciseForScenario = (scenario:ActivityScenario): Exercise => {
  const exercise = quests.flatMap(quest=>quest.exercises).find(item=>item.id===scenario.exerciseId);
  if (!exercise) throw new Error(`Missing authored activity exercise: ${scenario.exerciseId}`);
  return exercise;
};

export interface CafeState { kind:'cafe'; tray:Record<string,number>; steps:string[]; venue:'inside'|'outside'; service:'table'|'takeaway'; slot:string; }
export interface MarketState { kind:'market'; basket:Record<string,number>; method:'cash'|'card'; changeCoins:number[]; traded:boolean; }
export interface DetectiveState { kind:'detective'; links:Record<string,string>; }
export interface DeliveryState { kind:'delivery'; position:Cell; heading:number; trail:Cell[]; parcel:string; transport:DeliveryBoard['transport']; departure:string; help:boolean; lastEvent:string; }
export type ActivityState = CafeState|MarketState|DetectiveState|DeliveryState;
export type ActivityAction =
  | {type:'item';id:string;delta:number} | {type:'step';id:string} | {type:'undo-step'}
  | {type:'venue';value:'inside'|'outside'} | {type:'service';value:'table'|'takeaway'} | {type:'slot';value:string}
  | {type:'payment';value:'cash'|'card'} | {type:'coin';value:number} | {type:'undo-coin'} | {type:'trade'}
  | {type:'link';slotId:string;cardId:string} | {type:'unlink';slotId:string}
  | {type:'turn';value:Turn} | {type:'parcel';value:string} | {type:'transport';value:DeliveryBoard['transport']}
  | {type:'departure';value:string} | {type:'help'} | {type:'reset'};

export function initialActivityState(scenario:ActivityScenario): ActivityState {
  const board = scenario.board;
  if (board.kind==='cafe') return {kind:'cafe',tray:{},steps:[],venue:'outside',service:'table',slot:''};
  if (board.kind==='market') return {kind:'market',basket:{...board.initialBasket},method:'cash',changeCoins:[],traded:false};
  if (board.kind==='detective') return {kind:'detective',links:{}};
  return {kind:'delivery',position:{...board.start},heading:board.heading,trail:[{...board.start}],parcel:'',transport:'walk',departure:'',help:false,lastEvent:'Choose the parcel, then follow the streets.'};
}

function adjust(items:Record<string,number>,id:string,delta:number): Record<string,number> {
  const next={...items}, quantity=Math.max(0,Math.min(9,(next[id]??0)+Math.sign(delta)));
  if (quantity) next[id]=quantity; else delete next[id];
  return next;
}

/** Pure state changes: no server answer is generated by an inventory click. */
export function applyActivityAction(scenario:ActivityScenario,state:ActivityState,action:ActivityAction): ActivityState {
  if (action.type==='reset') return initialActivityState(scenario);
  const board=scenario.board;
  if (board.kind==='cafe'&&state.kind==='cafe') {
    if (action.type==='item'&&board.stock.includes(action.id)&&Number.isFinite(action.delta)) return {...state,tray:adjust(state.tray,action.id,action.delta)};
    if (action.type==='step'&&board.actions.includes(action.id)&&state.steps.length<8) return {...state,steps:[...state.steps,action.id]};
    if (action.type==='undo-step') return {...state,steps:state.steps.slice(0,-1)};
    if (action.type==='venue') return {...state,venue:action.value};
    if (action.type==='service') return {...state,service:action.value};
    if (action.type==='slot'&&['08:00','09:00','18:00','18:30','19:30'].includes(action.value)) return {...state,slot:action.value};
  }
  if (board.kind==='market'&&state.kind==='market') {
    if (action.type==='item'&&board.stock.includes(action.id)&&Number.isFinite(action.delta)) return {...state,basket:adjust(state.basket,action.id,action.delta),changeCoins:[]};
    if (action.type==='payment') return {...state,method:action.value,changeCoins:[]};
    if (action.type==='coin'&&[10,20,50,100,200,500,1000].includes(action.value)&&state.changeCoins.length<30) return {...state,changeCoins:[...state.changeCoins,action.value]};
    if (action.type==='undo-coin') return {...state,changeCoins:state.changeCoins.slice(0,-1)};
    if (action.type==='trade'&&board.trade&&!state.traded&&(state.basket[board.trade.give]??0)>0) {
      const basket=adjust(state.basket,board.trade.give,-1);
      basket[board.trade.receive]=(basket[board.trade.receive]??0)+board.trade.quantity;
      return {...state,basket,traded:true,changeCoins:[]};
    }
  }
  if (board.kind==='detective'&&state.kind==='detective') {
    if (action.type==='unlink') {const links={...state.links};delete links[action.slotId];return {...state,links};}
    if (action.type==='link'&&board.slots.some(slot=>slot.id===action.slotId)&&board.cards.some(card=>card.id===action.cardId)) {
      const links=Object.fromEntries(Object.entries(state.links).filter(([,id])=>id!==action.cardId));
      links[action.slotId]=action.cardId;return {...state,links};
    }
  }
  if (board.kind==='delivery'&&state.kind==='delivery') {
    if (action.type==='parcel'&&board.parcels.includes(action.value)) return {...state,parcel:action.value};
    if (action.type==='transport'&&['walk','train','bus'].includes(action.value)) return {...state,transport:action.value};
    if (action.type==='departure'&&['08:00','09:00','09:20','09:40'].includes(action.value)) return {...state,departure:action.value};
    if (action.type==='help') return {...state,help:true,lastEvent:'The harbor workers secure the crossing. You can continue.'};
    if (action.type==='turn') {
      const offsets={left:3,straight:0,right:1,back:2}, heading=(state.heading+offsets[action.value])%4;
      const directions=[[0,-1],[1,0],[0,1],[-1,0]], [dx,dy]=directions[heading];
      const position={x:state.position.x+dx,y:state.position.y+dy};
      if (!board.roads.some(cell=>cellKey(cell)===cellKey(position))) return {...state,lastEvent:'A wall or water blocks that way. Your parcel is safe; choose another turn.'};
      if (board.help&&!state.help&&cellKey(position)===cellKey(board.checkpoint)) return {...state,lastEvent:'The crossing needs help. Call the harbor workers before continuing.'};
      return {...state,position,heading,trail:[...state.trail,position].slice(-100),lastEvent:cellKey(position)===cellKey(board.goal)?`Arrived at ${board.goalName}. Check the parcel and deliver.`:cellKey(position)===cellKey(board.checkpoint)?`${board.checkpointName} reached. Continue toward ${board.goalName}.`:'On the way. Read the next direction.'};
    }
  }
  return state;
}

export const marketTotal = (state:MarketState): number => Object.entries(state.basket).reduce((total,[id,quantity])=>total+(inventory[id]?.price??0)*quantity,0);
export const money = (cents:number): string => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents/100);
const sameInventory = (actual:Record<string,number>,expected:Record<string,number>): boolean =>
  Object.keys(actual).length===Object.keys(expected).length&&Object.entries(expected).every(([id,quantity])=>actual[id]===quantity);

export interface ActivityEvaluation { valid:boolean; answer:string; feedback:string[]; }
/** The canonical answer is available only after the complete task is demonstrated. */
export function evaluateActivity(scenario:ActivityScenario,state:ActivityState): ActivityEvaluation {
  const board=scenario.board, feedback:string[]=[];
  if (state.kind!==board.kind) feedback.push('This task needs a fresh board. Restart the scene.');
  else if (board.kind==='cafe'&&state.kind==='cafe') {
    if (!sameInventory(state.tray,board.goal.items)) feedback.push('The tray does not match the German order. Check the ingredients and quantities.');
    if (state.steps.join('|')!==board.goal.steps.join('|')) feedback.push('The kitchen steps are out of order or incomplete. Undo a step and check zuerst / dann.');
    if (board.goal.venue&&state.venue!==board.goal.venue) feedback.push('Check where the guests will eat: drinnen is inside, draußen is outside.');
    if (board.goal.service&&state.service!==board.goal.service) feedback.push('Check the service: am Tisch means at the table; zum Mitnehmen means takeaway.');
    if (board.goal.slot&&state.slot!==board.goal.slot) feedback.push('The reservation time does not match. Halb sieben means half past six.');
  } else if (board.kind==='market'&&state.kind==='market') {
    if (!sameInventory(state.basket,board.goal)) feedback.push('The basket has the wrong goods or quantities. Extras also cost money.');
    if (marketTotal(state)>board.budget) feedback.push('The basket exceeds the budget. Remove an item or choose a more affordable trade.');
    if (state.method!==board.method) feedback.push('The customer requested a different payment method: bar is cash, mit Karte is by card.');
    const change=state.changeCoins.reduce((sum,coin)=>sum+coin,0), expected=board.method==='cash'?board.tender-marketTotal(state):0;
    if (change!==expected) feedback.push(`Check the change: payment ${money(board.tender)} minus basket ${money(marketTotal(state))}${board.method==='card'?'; card payments need no coins':''}.`);
    if (board.trade&&!state.traded) feedback.push('Use the agreed exchange offer; buying new goods does not complete the trade.');
  } else if (board.kind==='detective'&&state.kind==='detective') {
    for (const slot of board.slots) if (state.links[slot.id]!==slot.expected) feedback.push(`Recheck the evidence linked to “${slot.german}”.`);
  } else if (board.kind==='delivery'&&state.kind==='delivery') {
    if (cellKey(state.position)!==cellKey(board.goal)) feedback.push(`The parcel has not reached ${board.goalName} yet.`);
    if (!state.trail.some(cell=>cellKey(cell)===cellKey(board.checkpoint))) feedback.push(`The dispatch requires a stop at ${board.checkpointName}.`);
    if (state.parcel!==board.parcel) feedback.push('The parcel’s address belongs to a different recipient. Check für on the dispatch.');
    if (state.transport!==board.transport) feedback.push('The selected connection does not match the German announcement.');
    if (board.departure&&state.departure!==board.departure) feedback.push('Check the departure time against the dispatch.');
    if (board.help&&!state.help) feedback.push('The bridge needs help before the delivery can be completed.');
  }
  const valid=feedback.length===0;
  return {valid,answer:valid?exerciseForScenario(scenario).answer:`Meine Lösung: ${JSON.stringify(state).slice(0,240)}`,feedback};
}

const seededHash = (text:string):number => {let value=2166136261;for(const char of text)value=Math.imul(value^char.charCodeAt(0),16777619);return value>>>0;};
export function selectActivityScenarios(id:ActivityId,level:Level,progress:Progress,seed:string,now=Date.now()): { scenarios:ActivityScenario[]; familiar:boolean } {
  const pool=scenarios.filter(scene=>scene.activityId===id&&scene.level===level);
  const ready=(scene:ActivityScenario):boolean=>{const item=progress.items[exerciseForScenario(scene).itemId];return !item||!Number.isFinite(Date.parse(item.dueAt))||Date.parse(item.dueAt)<=now;};
  const score=(scene:ActivityScenario):number=>{
    const item=progress.items[exerciseForScenario(scene).itemId];
    if (!item) return 2;
    return ready(scene)?3+Math.min(3,Math.max(0,now-Date.parse(item.dueAt))/86400000):0;
  };
  return {scenarios:[...pool].sort((a,b)=>score(b)-score(a)||seededHash(`${seed}:${a.id}`)-seededHash(`${seed}:${b.id}`)).slice(0,3),familiar:pool.every(scene=>!ready(scene))};
}
