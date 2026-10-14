import type { Level } from './content';
import { escapeHtml as e, icon } from './icons';
import { seededShuffle } from './game-shuffle.ts';
import { MiniGameInput } from './minigames/input';

export const expeditionGameIds = ['saffroncourt', 'rainmarket', 'windplain', 'riverweave', 'terracielo', 'sunpatch', 'kigalights', 'cedarbay', 'seoulsteps', 'dunegarden'] as const;
export type ExpeditionGameId = typeof expeditionGameIds[number];
interface PlanOption { value: number; label: string; english: string; }
interface PlanField { id: string; label: string; english: string; options: PlanOption[]; }
interface PlanStep { id: string; label: string; english: string; }
export interface ExpeditionPlan {
  version: 1;
  level: Level;
  values: Record<string, number>;
  order: string[];
  completed: boolean;
  attempts: number;
}
export interface PlanCheck { correct: boolean; feedback: string[]; meter: string; }
export type ServerExpeditionPlan = Omit<ExpeditionPlan, 'version'>;
export type AuthoritativeExpeditionPlans = Record<string, ServerExpeditionPlan>;
export interface ExpeditionGameOptions {
  level: Level;
  onComplete(): void;
  onLevelChange?(level: Level): void;
  speak(text: string): void;
  seed?: string;
  /** Seeing or hearing scene text records exposure independently of changed-action recall. */
  onExposure?(context: {mapId:ExpeditionGameId;level:Level;text:string;kind:'placement'|'sequence'|'brief'}): void;
  onPlacement?(context:{mapId:ExpeditionGameId;level:Level;fieldId:string;value:number;label:string;responseMs:number}):Promise<{message:string}>;
  placementPrompt?(level:Level,fieldId:string):string;
  placementReady?(level:Level,fieldId:string):boolean;
  pendingLearning?():number;
  retryLearning?():Promise<number>;
  initialPlan?(level: Level): ServerExpeditionPlan | undefined;
  submitPlan?(plan: ExpeditionPlan): Promise<{ correct: boolean; plan: ServerExpeditionPlan; feedback?: string[] }>;
}
export interface ExpeditionGame {
  id: ExpeditionGameId;
  title: string;
  summary: string;
  german: Record<Level, string>;
  glossary: string;
  fields: PlanField[];
  steps: PlanStep[];
  orderPrompt: string;
  orderExplanation: string;
  validate(values: Record<string, number>): string[];
  meter(values: Record<string, number>): string;
  solution: Record<string, number>;
  note: string;
  agreement: string;
}
const choice = (value: number, label: string, english: string): PlanOption => ({ value, label, english });
const field = (id: string, label: string, english: string, options: PlanOption[]): PlanField => ({ id, label, english, options });
const quantity = (id: string, label: string, english: string, max: number, unit = '') => field(id, label, english, Array.from({ length:max + 1 }, (_, value) => choice(value, `${value}${unit ? ` ${unit}` : ''}`, `${value}${unit ? ` ${unit}` : ''}`)));
const step = (id: string, label: string, english: string): PlanStep => ({ id, label, english });
const require = (condition: boolean, message: string): string[] => condition ? [] : [message];
const duration = (hours: number) => `${Math.max(0,hours)} ${Math.max(0,hours) === 1 ? 'Stunde' : 'Stunden'}`;
const hours = (start: number, end: number) => Array.from({length:end - start + 1}, (_, i) => choice(start + i, `${start + i}:00 Uhr`, `${start + i}:00`));

export const expeditionGames: readonly ExpeditionGame[] = [
  {
    id:'saffroncourt', title:'The courtyard delivery', summary:'Build a walking route, ask the right neighbor for permission, and get a shared delivery into the courtyard.',
    german:{ A1:'Das Paket ist für den gemeinsamen Hof. Das Osttor ist offen. Erst fragen, dann eintreten. Geh von der Werkstatt zum Tor, dann zum Brunnen und zum Hof. Die Haussprecherin empfängt das Paket um 16, 17 oder 18 Uhr; das Tor schließt um 19 Uhr.', A2:'Die Lieferung gehört der Hausgemeinschaft. Das Osttor ist bis 19 Uhr offen; die Werkstatt darf keine Erlaubnis für den Hof geben. Frag zuerst die Haussprecherin. Die Haussprecherin empfängt Lieferungen um sechzehn, siebzehn oder achtzehn Uhr. Das Tor schließt um neunzehn Uhr.', B1:'Obwohl Youssef den kürzesten Weg kennt, entscheidet er nicht über den gemeinsam genutzten Hof. Die Haussprecherin erlaubt die Lieferung durch das Osttor. Kläre die Zuständigkeit, bevor du die Route beginnst. Für die Ankunft sind sechzehn, siebzehn oder achtzehn Uhr vereinbart; das Tor schließt erst um neunzehn Uhr.' },
    glossary:'gemeinsam = shared · die Erlaubnis = permission · erst … dann = first … then · das Osttor = east gate',
    fields:[field('permission','Erlaubnis von …','Ask permission from …',[choice(0,'der Werkstatt','the workshop'), choice(1,'der Haussprecherin','the housing spokesperson'),choice(2,'dem Besucher','the visitor')]),field('gate','Eingang','Entrance',[choice(0,'Osttor · offen','east gate · open'),choice(1,'Westtor · geschlossen','west gate · closed'),choice(2,'Privattür','private door')]),field('recipient','Paket für …','Parcel for …',[choice(0,'einen Besucher','one visitor'),choice(1,'Youssefs Werkstatt','Youssef’s workshop'),choice(2,'die Hausgemeinschaft','the housing community')]),field('arrival','Ankunft im Hof','Courtyard arrival',hours(15,19))],
    steps:[step('workshop','Werkstatt','workshop'),step('gate','Osttor','east gate'),step('fountain','Brunnen','fountain'),step('court','gemeinsamer Hof','shared courtyard')], orderPrompt:'Setze die vier Stationen in die richtige Reihenfolge.',orderExplanation:'Von der Werkstatt geht es durch das Osttor zum Brunnen. Dahinter liegt der gemeinsame Hof. / From the workshop, go through the east gate to the fountain, then the shared courtyard.',
    validate:v=>[...require(v.permission===1,'Die Haussprecherin entscheidet über den gemeinsamen Hof. / The housing spokesperson can give permission.'),...require(v.gate===0,'Nur das Osttor ist offen. / Only the east gate is open.'),...require(v.recipient===2,'Das Paket gehört der Hausgemeinschaft, nicht einer einzelnen Person. / The parcel belongs to the housing community.'),...require(v.arrival>=16&&v.arrival<=18,'Die Haussprecherin empfängt Lieferungen um 16, 17 oder 18 Uhr. / Delivery reception is at 16:00, 17:00 or 18:00.')],
    meter:v=>`Erlaubnis: ${v.permission===1?'geklärt':'noch offen'} · Eingang: ${v.gate===0?'offen':'nicht zugänglich'} · Ankunft ${v.arrival}:00`,solution:{permission:1,gate:0,recipient:2,arrival:17},note:'The workshop and the housing group now share a written delivery route. Knowing a shortcut and having permission are different responsibilities.',agreement:'Dürfen wir durch das Osttor in den gemeinsamen Hof? Das Paket ist für alle Nachbarn.',
  },
  {
    id:'rainmarket',title:'The rain arcade timetable',summary:'Schedule a neighborhood event around an early worker’s sleep, shop closing, and rain. Build a plan everyone can attend.',
    german:{A1:'Der Laden schließt um 18 Uhr. Die Musik endet spätestens um 20 Uhr. Es regnet: Wir bleiben unter dem Dach. Zuerst informieren, dann aufbauen, feiern und aufräumen. Eine oder zwei Stunden reichen, einschließlich Aufräumen.',A2:'Der Laden braucht bis 18 Uhr freie Türen. Ab 20 Uhr schläft Haru vor der Frühschicht. Plane ein oder zwei Stunden leise Musik zwischen 18 und 20 Uhr unter dem Dach der Einkaufspassage. Mindestens eine Stunde einschließlich Aufräumen reicht; innerhalb des Fensters dürft ihr Anfang und Ende wählen.',B1:'Da die Ladenbesitzerin erst um 18 Uhr schließen kann und Haru vor der Frühschicht ab 20 Uhr schlafen muss, bleibt ein Zeitfenster für ein oder zwei Stunden einschließlich Aufräumen. Trotz des Regens ist ein Treffen unter dem Dach möglich, sofern die Lautstärke niedrig bleibt. Ein kurzes einstündiges Treffen ist ebenso möglich wie die zweistündige Veranstaltung, sofern Aufbau und Aufräumen im vereinbarten Fenster liegen.'},
    glossary:'spätestens = at the latest · unter dem Dach = under the roof · die Frühschicht = early shift · aufräumen = tidy up',
    fields:[field('start','Beginn','Starting time',hours(16,21)),field('end','Ende','Ending time',hours(17,22)),field('sound','Lautstärke','Sound',[choice(0,'laut · Lautsprecher','loud · speaker'),choice(1,'leise · akustisch','quiet · acoustic')]),field('place','Treffpunkt','Meeting point',[choice(0,'offene Gasse','open alley'),choice(1,'unter dem Dach','under the arcade roof')])],
    steps:[step('notice','Nachbarn informieren','tell the neighbors'),step('setup','Nach Ladenschluss aufbauen','set up after closing'),step('meet','Zusammen feiern','celebrate together'),step('clear','Vor 20 Uhr aufräumen','clear up before 20:00')],orderPrompt:'Plane die Reihenfolge des Abends.',orderExplanation:'Informiere zuerst die Nachbarn. Nach Ladenschluss wird aufgebaut, dann gefeiert und vor der Schlafenszeit aufgeräumt. / Inform neighbors, set up after closing, celebrate, then clear up before sleep.',
    validate:v=>[...require(v.start>=18,'Vor 18 Uhr müssen die Ladentüren frei bleiben. / Shop doors must remain clear until 18:00.'),...require(v.end<=20,'Haru braucht ab 20 Uhr Ruhe. / Haru needs quiet from 20:00.'),...require(v.end-v.start>=1,'Für Aufbau, Treffen und Aufräumen braucht ihr mindestens eine Stunde. / Allow at least one hour including cleanup.'),...require(v.sound===1,'Leise Musik macht das Treffen mit Harus Frühschicht vereinbar. / Quiet music respects Haru’s early shift.'),...require(v.place===1,'Unter dem Dach bleiben Menschen und Instrumente trocken. / The arcade roof keeps everyone dry.')],meter:v=>`Zeitfenster: ${duration(v.end-v.start)} · Ruhe ab 20:00`,solution:{start:18,end:20,sound:1,place:1},note:'The handwritten notice now includes the side entrance, a quiet finishing time, and a rain location. The shops and night workers have an invitation they can trust.',agreement:'Wir treffen uns um achtzehn Uhr unter dem Dach und räumen vor zwanzig Uhr auf.',
  },
  {
    id:'windplain',title:'Pack the moving camp',summary:'Balance a handcart’s supplies while the ger structure travels separately in a workshop vehicle. Confirm the changing destination before moving day.',
    german:{A1:'Der Handwagen trägt 13 Kilo. Die Schutzplane wiegt 4 Kilo. Wir brauchen 4 Kilo Wasser, 2 Kilo Essen und 1 Kilo Werkzeug. Das Funkgerät wiegt 1 Kilo. Das Ger fährt separat im Werkstattwagen. Erst den neuen Ort prüfen, dann packen, das Ger abbauen und fahren. Genau 1 Kilo Werkzeug. Ein extra Kilo Wasser oder Essen darf mit, aber nicht beides.',A2:'Der Handwagen trägt höchstens dreizehn Kilo: mindestens vier Kilo Wasser, mindestens zwei Kilo Essen, genau ein Kilo Werkzeug, ein Kilo Funkgerät und eine vier Kilo schwere Schutzplane. Die Ger-Struktur wird separat im Werkstattwagen transportiert. Prüfe den neuen Ort, packe den Handwagen und baue danach mit der Familie das Ger ab. Es gibt ein Kilo Reserve auf dem Wagen: mehr Wasser oder mehr Essen ist möglich. Das Werkzeug bleibt bei genau einem Kilo.',B1:'Die gestrige Wegbeschreibung führt zu einem leeren Lagerplatz. Bestätige zuerst den neuen Standort per Funk. Die vier Kilo schwere Schutzplane, Vorräte und das Funkgerät müssen gemeinsam innerhalb der Tragfähigkeit des Handwagens von dreizehn Kilo liegen. Erst danach wird die Ger-Struktur abgebaut und separat im Werkstattwagen verladen. Der Handwagen hat ein Kilo Spielraum für zusätzliche Vorräte; Werkzeug und Funkgerät bleiben in der vereinbarten Menge.'},
    glossary:'abbauen = take down · die Schutzplane = protective cover · der Handwagen = handcart · das Funkgerät = radio · der Standort = location',
    fields:[quantity('water','Wasser · je 1 kg','Water · 1 kg per unit',5),quantity('food','Essen · je 1 kg','Food · 1 kg per unit',4),quantity('tools','Werkzeug · je 1 kg','Tools · 1 kg per unit',3),field('radio','Funkgerät · 1 kg','Radio · 1 kg',[choice(0,'hier lassen','leave behind'),choice(1,'mitnehmen','take along')])],
    steps:[step('check','Neuen Standort bestätigen','confirm the new location'),step('pack','Handwagen mit Vorräten und Schutzplane beladen','load supplies and protective cover into the handcart'),step('ger','Ger abbauen und separat im Werkstattwagen verladen','take down the ger and load it separately into the workshop vehicle'),step('move','Zum bestätigten Ort fahren','drive to the confirmed location')],orderPrompt:'Was passiert zuerst, danach und zuletzt?',orderExplanation:'Bestätige zuerst den Standort, belade den Handwagen und baue danach das Ger für den separaten Transport im Werkstattwagen ab. Erst dann geht es los. / Confirm the location, pack the handcart, dismantle the ger for separate vehicle transport, then depart.',
    validate:v=>[...require(v.water>=4,'Vier Kilo Wasser werden für die Fahrt gebraucht. / The trip requires at least four kilos of water.'),...require(v.food>=2,'Zwei Kilo Essen sind für alle eingeplant. / Two kilos of food are required.'),...require(v.tools===1,'Ein Kilo Werkzeug ist für den neuen Platz vereinbart. / Pack the agreed one kilo of tools.'),...require(v.radio===1,'Ohne Funkgerät könnt ihr eine neue Ortsmeldung nicht empfangen. / You need the radio to receive location updates.'),...require(v.water+v.food+v.tools+v.radio+4<=13,'Der Handwagen trägt höchstens dreizehn Kilo einschließlich der Schutzplane. / Keep the handcart within thirteen kilos including the protective cover.')],meter:v=>`Handwagen: ${v.water+v.food+v.tools+v.radio+4} / 13 kg · Schutzplane: 4 kg`,solution:{water:4,food:2,tools:1,radio:1},note:'The family confirmed its new location before leaving. The visiting relative has the current route, and nobody is waiting beside an abandoned landmark.',agreement:'Zuerst bestätigen wir den Standort. Danach laden wir das Wasser ein, und zuletzt fahren wir los.',
  },
  {
    id:'riverweave',title:'The river market basket',summary:'Buy the ingredients for a shared meal, keep a boat within capacity, and choose a route that fits a real budget.',
    german:{A1:'Wir haben 26 Münzen. Wir brauchen 2 Körbe Gemüse, 1 Korb Obst und 2 Säcke Reis. Gemüse kostet 3, Obst 4 und Reis 5 Münzen. Der Ostkanal kostet 3 Münzen. Das Boot trägt 6 Einheiten. Ein extra Korb Gemüse passt noch ins Budget. Die Expressfahrt ist zu teuer.',A2:'Für das gemeinsame Essen werden zwei Körbe Gemüse, ein Korb Obst und zwei Säcke Reis gebraucht. Das Boot fasst sechs Einheiten. Die Fahrt durch den Ostkanal kostet drei, die Expressfahrt sieben Münzen; insgesamt sind 26 Münzen verfügbar. Ein zusätzlicher Gemüsekorb passt noch in Boot und Budget; mehr Obst oder Reis und die Expressfahrt überschreiten das Budget.',B1:'Die Köchin wartet zuerst am Gemüsesteg, danach wird Obst abgeholt und zuletzt Reis am Ostkanal geladen. Zusätzliche Einkäufe dürfen weder die Kapazität von sechs Einheiten noch das Budget von 26 Münzen überschreiten. Plane auch den Fahrpreis ein. Ein zusätzlicher Gemüsekorb nutzt den verbleibenden Spielraum. Die Expressfahrt passt selbst mit dem Mindesteinkauf nicht ins Budget.'},
    glossary:'der Fahrpreis = fare · der Sack = sack · je = each · insgesamt = in total',
    fields:[quantity('veg','Gemüse · 3 Münzen','Vegetables · 3 coins each',4),quantity('fruit','Obst · 4 Münzen','Fruit · 4 coins each',3),quantity('rice','Reis · 5 Münzen','Rice · 5 coins each',4),field('route','Fahrt','Route',[choice(3,'Ostkanal · 3 Münzen','east canal · 3 coins'),choice(7,'Express · 7 Münzen','express · 7 coins')])],
    steps:[step('veg','Gemüsesteg','vegetable landing'),step('fruit','Obstboot','fruit boat'),step('rice','Reislager am Ostkanal','rice depot on the east canal'),step('kitchen','Gemeinschaftsküche','community kitchen')],orderPrompt:'Baue die Abholroute in der vereinbarten Reihenfolge.',orderExplanation:'Erst Gemüse, dann Obst, danach Reis und zuletzt zur Gemeinschaftsküche. / Collect vegetables, fruit, rice, then deliver to the kitchen.',
    validate:v=>[...require(v.veg>=2&&v.fruit>=1&&v.rice>=2,'Für das Essen braucht ihr mindestens 2 Gemüse, 1 Obst und 2 Reis. / Meet all three ingredient requests.'),...require(v.veg+v.fruit+v.rice<=6,'Mehr als sechs Einheiten passen nicht ins Boot. / The boat can carry six units.'),...require(v.veg*3+v.fruit*4+v.rice*5+v.route<=26,'Der Fahrpreis gehört zum Budget von 26 Münzen. / Include the fare in the 26-coin budget.')],meter:v=>`Kosten: ${v.veg*3+v.fruit*4+v.rice*5+v.route} / 26 Münzen · Ladung: ${v.veg+v.fruit+v.rice} / 6`,solution:{veg:2,fruit:1,rice:2,route:3},note:'The supplier, cook, and boat operator now use one collection plan. The missing ingredient was never a broken promise: the old order omitted the fare.',agreement:'Wir nehmen zwei Körbe Gemüse, einen Korb Obst und zwei Säcke Reis. Mit der Fahrt kostet alles dreiundzwanzig Münzen.',
  },
  {
    id:'terracielo',title:'The terrace commission',summary:'Turn a customer’s measurements into a workshop specification, then agree the design before cutting any material.',
    german:{A1:'Drei Taschen, bitte. Jede Tasche ist 40 Zentimeter breit und 60 Zentimeter hoch. Das Muster soll blau sein. Erst messen, dann Muster zeigen, zuschneiden und nähen. Die Kundin kann um 14, 15 oder 16 Uhr abholen.',A2:'Die Kundin bestellt drei Taschen, jeweils vierzig Zentimeter breit und sechzig Zentimeter hoch. Sie möchte das blaue Muster vorher sehen. Erst nach ihrer Zustimmung wird zugeschnitten. Für die Abholung passen der Kundin vierzehn, fünfzehn oder sechzehn Uhr.',B1:'Im Auftrag steht „drei Taschen, vierzig breit und sechzig hoch“. Die Designerin hat die Maße versehentlich vertauscht. Kläre die Spezifikation und lass das blaue Muster bestätigen, bevor unwiderruflich zugeschnitten wird. Die Kundin hat für die Abholung drei gleichwertige Zeitfenster bestätigt: vierzehn, fünfzehn oder sechzehn Uhr.'},
    glossary:'breit = wide · hoch = tall · zuschneiden = cut to size · die Zustimmung = agreement',
    fields:[quantity('count','Anzahl Taschen','Number of bags',4),field('width','Breite','Width',[choice(30,'30 cm','30 cm'),choice(40,'40 cm','40 cm'),choice(60,'60 cm','60 cm')]),field('height','Höhe','Height',[choice(40,'40 cm','40 cm'),choice(50,'50 cm','50 cm'),choice(60,'60 cm','60 cm')]),field('pattern','Muster','Pattern',[choice(0,'rot','red'),choice(1,'grün','green'),choice(2,'blau','blue')]),field('pickup','Abholung','Collection time',hours(13,17))],
    steps:[step('measure','Maße gemeinsam prüfen','check measurements together'),step('approve','Blaues Muster bestätigen lassen','get the blue design approved'),step('cut','Stoff zuschneiden','cut the fabric'),step('sew','Drei Taschen nähen','sew three bags')],orderPrompt:'Ordne die Arbeitsschritte, bevor du Material verbrauchst.',orderExplanation:'Maße prüfen, Muster bestätigen, erst dann zuschneiden und nähen. / Check measurements and agree the design before cutting and sewing.',
    validate:v=>[...require(v.count===3,'Der Auftrag nennt drei Taschen. / The order requests three bags.'),...require(v.width===40&&v.height===60,'Breite und Höhe sind verschieden: 40 breit, 60 hoch. / Width is 40, height is 60.'),...require(v.pattern===2,'Die Kundin hat das blaue Muster bestellt. / The requested design is blue.'),...require(v.pickup>=14&&v.pickup<=16,'Die Kundin kann um 14, 15 oder 16 Uhr abholen. / Collection is available at 14:00, 15:00 or 16:00.')],meter:v=>`Auftrag: ${v.count} Taschen · ${v.width} × ${v.height} cm · Abholung ${v.pickup}:00`,solution:{count:3,width:40,height:60,pattern:2,pickup:15},note:'The commission records both dimensions and the customer’s approval. The maker and designer can now work from the same promise.',agreement:'Sie möchten drei blaue Taschen, jeweils vierzig Zentimeter breit und sechzig Zentimeter hoch. Habe ich das richtig verstanden?',
  },
  {
    id:'sunpatch',title:'The neighborhood radio message',summary:'Reconstruct a radio announcement from separate fragments, verify it with the sender, and program the right broadcast.',
    german:{A1:'Die neue Nachricht ist für Freitag um 8 Uhr im Innenhof. Die Nachricht für Donnerstag ist alt. Erst die Quelle prüfen, dann die Nachricht zusammensetzen und senden. Sende die Einladung am Freitag um 6 oder 7 Uhr, vor dem Treffen.',A2:'Ein altes Band nennt Donnerstag um neun Uhr im Park. Die neue Nachricht der Organisatorin nennt Freitag um acht Uhr im Innenhof. Prüfe die Quelle und rekonstruiere die aktuelle Einladung. Die bestätigte Einladung soll am Freitag um sechs oder sieben Uhr gesendet werden, damit die Gäste rechtzeitig ankommen.',B1:'Zwei Bänder klingen ähnlich, aber nur die von der Organisatorin bestätigte Aufnahme ist aktuell. Verwechsle die alte Ortsangabe nicht mit einem zweiten Treffen. Verbinde Wochentag, Uhrzeit, Ort und Bitte zu einer eindeutigen Einladung. Für die Sendung sind am Freitag sechs oder sieben Uhr freigegeben; die Uhrzeit des Treffens selbst bleibt acht Uhr.'},
    glossary:'die Quelle = source · aktuell = current · die Aufnahme = recording · zusammensetzen = assemble',
    fields:[field('day','Wochentag','Weekday',[choice(0,'Donnerstag','Thursday'),choice(1,'Freitag','Friday'),choice(2,'Samstag','Saturday')]),field('time','Uhrzeit','Time',hours(7,10)),field('place','Ort','Place',[choice(0,'im Park','in the park'),choice(1,'im Innenhof','in the courtyard'),choice(2,'am Markt','at the market')]),field('source','Bestätigte Quelle','Verified source',[choice(0,'altes Band','old tape'),choice(1,'Organisatorin','organizer'),choice(2,'unbekannte Kopie','unidentified copy')]),field('broadcast','Einladung senden','Invitation broadcast',hours(5,9))],
    steps:[step('day','Am Freitag','On Friday'),step('time','um acht Uhr','at eight o’clock'),step('place','treffen wir uns im Innenhof.','we meet in the courtyard.'),step('invite','Bitte bringt eure Ideen mit!','Please bring your ideas!')],orderPrompt:'Setze die vier Funkfragmente zu einer Einladung zusammen.',orderExplanation:'Am Freitag / um acht Uhr / treffen wir uns im Innenhof. / Bitte bringt eure Ideen mit! Time and place must belong to the same current invitation.',
    validate:v=>[...require(v.source===1,'Nur die Organisatorin hat die neue Einladung bestätigt. / The organizer verified the new recording.'),...require(v.day===1&&v.time===8&&v.place===1,'Das aktuelle Treffen ist Freitag um 8 Uhr im Innenhof. / The current meeting is Friday at 8 in the courtyard.'),...require(v.broadcast===6||v.broadcast===7,'Die Einladung muss am Freitag um 6 oder 7 Uhr gesendet werden. / Broadcast on Friday at 6:00 or 7:00, before the meeting.')],meter:v=>`Sendung: ${v.day===1?'Freitag':v.day===0?'Donnerstag':'Samstag'} · ${v.time}:00 · ${v.place===1?'Innenhof':v.place===0?'Park':'Markt'}`,solution:{day:1,time:8,place:1,source:1,broadcast:7},note:'The radio team labeled the old recording instead of erasing it. Neighbors can tell which invitation is current and who confirmed it.',agreement:'Am Freitag um acht Uhr treffen wir uns im Innenhof. Bitte bringt eure Ideen mit!',
  },
  {
    id:'kigalights',title:'A studio for three neighbors',summary:'Allocate a shared studio between sound, editing, and community work. Rooms, times, and an accessible entrance all matter.',
    german:{A1:'Es gibt zwei Räume: A und B. Raum A hat keine Stufen und ist ruhig. Die Gruppe braucht A um 14 Uhr. Die Aufnahme braucht B um 14 Uhr. Schnittarbeit ist danach in A um 16 oder 17 Uhr und dauert mindestens eine Stunde.',A2:'Die Nachbarschaftsgruppe braucht um 14 Uhr den ruhigen, stufenlosen Raum A. Die Band nimmt gleichzeitig im schallgeschützten Raum B auf. Die Schnittarbeit kann um 16 oder 17 Uhr in A beginnen; um 18 Uhr wird der Raum geschlossen.',B1:'Die Nachbarschaftsgruppe kann weder Stufen überwinden noch neben einer lauten Aufnahme arbeiten. Raum A ist ruhig und zugänglich, Raum B schallgeschützt. Verschiebe die flexible Schnittarbeit auf 16 oder 17 Uhr und dokumentiere zuerst die Bedürfnisse aller Beteiligten.'},
    glossary:'stufenlos = step-free · schallgeschützt = sound-isolated · verschieben = reschedule · die Schnittarbeit = editing',
    fields:[field('group','Nachbarschaft · 14:00','Neighborhood group · 14:00',[choice(0,'Raum A · ruhig, stufenlos','room A · quiet, step-free'),choice(1,'Raum B · Treppe','room B · stairs')]),field('band','Aufnahme · 14:00','Recording · 14:00',[choice(0,'Raum A','room A'),choice(1,'Raum B · schallgeschützt','room B · sound-isolated')]),field('edit','Schnittarbeit','Editing start',hours(14,17)),field('entrance','Eingang der Gruppe','Group entrance',[choice(0,'Seitentür · ohne Stufen','side door · no steps'),choice(1,'Treppe','stairs')])],
    steps:[step('needs','Bedürfnisse anhören','listen to everyone’s needs'),step('allocate','Räume und Zeiten verteilen','allocate rooms and times'),step('confirm','Plan von allen bestätigen lassen','get everyone’s agreement'),step('post','Plan an der Seitentür aushängen','post the plan at the side door')],orderPrompt:'Baue einen fairen Ablauf für die gemeinsame Planung.',orderExplanation:'Erst zuhören, dann verteilen, bestätigen und aushängen. / Listen to needs before allocating rooms, agreeing the plan, and posting it.',
    validate:v=>[...require(v.group===0,'Die Gruppe braucht den ruhigen, stufenlosen Raum A. / The group needs quiet, accessible room A.'),...require(v.band===1,'Die Aufnahme braucht den schallgeschützten Raum B. / Recording needs sound-isolated room B.'),...require((v.edit===16||v.edit===17),'Raum A ist von 14 bis 16 Uhr belegt; Schnittarbeit beginnt um 16 oder 17 Uhr und endet bis 18 Uhr. / Editing can start at 16:00 or 17:00 and finish by 18:00.'),...require(v.entrance===0,'Die stufenlose Seitentür gehört zum vereinbarten Zugang. / Include the step-free side entrance.')],meter:v=>`14–16 Uhr: Gruppe ${v.group===0?'A':'B'} · Aufnahme ${v.band===0?'A':'B'} · Schnitt ab ${v.edit}:00`,solution:{group:0,band:1,edit:16,entrance:0},note:'The studio now records accessibility, sound, and flexible time as equally real needs. A posted agreement replaces three competing bookings.',agreement:'Die Gruppe nutzt Raum A ab vierzehn Uhr. Die Aufnahme ist in Raum B, und die Schnittarbeit beginnt um sechzehn Uhr.',
  },
  {
    id:'cedarbay',title:'The canal ferry connection',summary:'Connect a repair delivery with a ferry departure, work with the tide, and keep space for the people traveling with it.',
    german:{A1:'Die Kiste kommt um 10 Uhr am Weststeg an. Die Fähre fährt um 11, 12 oder 13 Uhr. Sie trägt 6 Plätze. Vier Personen kommen mit. Die Kiste braucht zwei Plätze. Erst abholen, dann laden, zählen und abfahren. Wähle eine der drei sicheren Abfahrten.',A2:'Die Werkzeugkiste erreicht den Weststeg um 10 Uhr und belegt zwei Plätze. Vier Personen möchten zur Werkstatt fahren. Die Fähre hat sechs Plätze und kann bei diesem Wasserstand um 11, 12 oder 13 Uhr sicher abfahren. Alle drei Abfahrten sind nach der Ankunft der Kiste und innerhalb des sicheren Tidefensters.',B1:'Die Lieferung und die Fahrgäste passen gemeinsam auf die Fähre, sofern die Kiste als zwei Plätze gezählt wird. Am Oststeg liegt eine veraltete Abholnotiz. Nutze die bestätigte Nachricht für den Weststeg und die tideabhängige Abfahrt um 11, 12 oder 13 Uhr. Wähle eine der drei bestätigten Abfahrten innerhalb des sicheren Tidefensters.'},
    glossary:'der Steg = landing · der Wasserstand = water level · belegen = occupy · die Abfahrt = departure',
    fields:[field('landing','Abholsteg','Pickup landing',[choice(0,'Oststeg · alte Notiz','east landing · old note'),choice(1,'Weststeg · bestätigt','west landing · confirmed')]),field('time','Abfahrt','Departure',hours(10,13)),quantity('people','Personen · je 1 Platz','Passengers · 1 seat each',6),field('crate','Werkzeugkiste','Tool crate',[choice(0,'am Steg lassen','leave at landing'),choice(2,'einladen · 2 Plätze','load · 2 seats')])],
    steps:[step('pickup','Kiste am Weststeg abholen','collect the crate at the west landing'),step('load','Kiste sicher einladen','load and secure the crate'),step('count','Vier Personen und Ladung zählen','count four passengers and cargo'),step('depart','Im sicheren Zeitfenster abfahren','depart in the safe time window')],orderPrompt:'Koordiniere die Übergabe vor der Abfahrt.',orderExplanation:'Abholen, sicher laden, Plätze zählen, dann abfahren. / Collect the crate, secure it, count passengers and cargo, then depart.',
    validate:v=>[...require(v.landing===1,'Die bestätigte Nachricht nennt den Weststeg. / The verified pickup is at the west landing.'),...require(v.time>=11&&v.time<=13,'Der Wasserstand erlaubt Abfahrten um 11, 12 oder 13 Uhr. / The tide permits departure at 11:00, 12:00 or 13:00.'),...require(v.people===4,'Vier Personen warten auf die vereinbarte Fahrt. / The agreement includes four passengers.'),...require(v.crate===2,'Die Werkstatt braucht die Kiste; sie belegt zwei Plätze. / The repair delivery occupies two seats.'),...require(v.people+v.crate<=6,'Die Fähre hat insgesamt sechs Plätze. / Total capacity is six seats.')],meter:v=>`Belegte Plätze: ${v.people+v.crate} / 6 · Abfahrt ${v.time}:00`,solution:{landing:1,time:11,people:4,crate:2},note:'The workshop’s tools arrive on the same ferry as its neighbors. The operator now lists cargo capacity alongside passenger places.',agreement:'Wir holen die Kiste am Weststeg ab. Vier Personen fahren mit; mit der Kiste sind alle sechs Plätze belegt.',
  },
  {
    id:'seoulsteps',title:'The rooftop evening plan',summary:'Plan a rooftop gathering with a rain fallback, accessible arrival, and a sound agreement that fits the building’s evening.',
    german:{A1:'Um 19 Uhr ist die Arbeit fertig. Ab 21 Uhr braucht das Haus Ruhe. Es regnet ab 20 Uhr. Wir treffen uns im Gemeinschaftsraum. Der Aufzug ist offen. Leise Musik, bitte. Eine oder zwei Stunden mit Aufräumen reichen.',A2:'Das Treffen braucht mindestens eine Stunde und kann erst um 19 Uhr beginnen. Um 20 Uhr kommt Regen, ab 21 Uhr gilt Ruhe. Wähle den Gemeinschaftsraum, leise Musik und den Aufzug für alle Gäste. Anfang und Ende sind zwischen neunzehn und einundzwanzig Uhr frei wählbar, wenn mindestens eine Stunde für Treffen und Aufräumen bleibt.',B1:'Die Dachterrasse war der ursprüngliche Plan, aber die Regenmeldung macht den Gemeinschaftsraum sinnvoll. Die flexible Musikerin stimmt leiser Musik zu. Das Treffen darf weder die Arbeitszeit vor 19 Uhr noch die Ruhezeit ab 21 Uhr überschneiden; alle Gäste benötigen einen zugänglichen Weg. Die Nachbarn stimmen auch einem einstündigen Treffen zu, sofern Aufräumen und Heimkehr vor der Ruhezeit abgeschlossen sind.'},
    glossary:'der Aufzug = elevator · die Ruhezeit = quiet hours · die Regenmeldung = rain forecast · ursprünglich = originally',
    fields:[field('start','Beginn','Start',hours(17,21)),field('end','Ende','End',hours(19,23)),field('venue','Ort bei Regen','Rain location',[choice(0,'Dachterrasse · ohne Dach','open rooftop'),choice(1,'Gemeinschaftsraum','community room')]),field('music','Musik','Music',[choice(0,'laute Lautsprecher','loud speakers'),choice(1,'leises Akustikset','quiet acoustic set')]),field('access','Weg nach oben','Way upstairs',[choice(0,'Treppe','stairs'),choice(1,'Aufzug','elevator')])],
    steps:[step('weather','Regenmeldung lesen','check the rain forecast'),step('neighbors','Neuen Ort mit Nachbarn abstimmen','agree the new location'),step('invite','Einladung und Aufzugshinweis senden','send invitation and elevator information'),step('meet','Treffen vor 21 Uhr abschließen','finish the gathering before 21:00')],orderPrompt:'Ordne die Planänderung bis zur ruhigen Heimkehr.',orderExplanation:'Wetter prüfen, Änderung abstimmen, alle informieren, pünktlich abschließen. / Check the weather, agree the change, inform guests, and finish on time.',
    validate:v=>[...require(v.start>=19,'Die Arbeit endet um 19 Uhr. / Work finishes at 19:00.'),...require(v.end<=21,'Ab 21 Uhr beginnt die vereinbarte Ruhezeit. / Quiet hours start at 21:00.'),...require(v.end-v.start>=1,'Das Treffen braucht mindestens eine Stunde einschließlich Aufräumen. / Allow at least one hour including cleanup.'),...require(v.venue===1,'Ab 20 Uhr regnet es; der Gemeinschaftsraum hat Platz und ein Dach. / Use the community room for rain.'),...require(v.music===1,'Die Nachbarn haben leiser Musik zugestimmt. / The neighbors agreed to quiet music.'),...require(v.access===1,'Der Aufzug macht den Weg für alle Gäste zugänglich. / The elevator provides access for all guests.')],meter:v=>`Treffen: ${duration(v.end-v.start)} · Regen ab 20:00 · Ruhe ab 21:00`,solution:{start:19,end:21,venue:1,music:1,access:1},note:'The rooftop invitation became a shared-room gathering before the rain arrived. The change includes a clear route and a finishing time, so people can join with confidence.',agreement:'Wegen des Regens treffen wir uns von neunzehn bis einundzwanzig Uhr im Gemeinschaftsraum. Bitte nutzt den Aufzug.',
  },
  {
    id:'dunegarden',title:'The garden water agreement',summary:'Allocate limited irrigation time among three gardens, keep a reserve, and open the channels in the agreed order.',
    german:{"A1":"Es gibt 12 Minuten Wasser. Normal: 4 Minuten für den Gemeinschaftsgarten, 3 für junge Pflanzen und 3 für Bäume. Du darfst eine Minute von den jungen Pflanzen oder den Bäumen zum Gemeinschaftsgarten geben, aber nicht von beiden. Zwei Minuten bleiben Reserve. Erst prüfen, dann oben öffnen, unten öffnen und schließen.","A2":"Die bestätigte Verteilung ist vier, drei und drei Minuten. Alternativ darf genau einer der beiden kleineren Gärten eine Minute an den Gemeinschaftsgarten abgeben: fünf, zwei, drei oder fünf, drei, zwei. Die gemeinsame Reserve bleibt bei zwei Minuten. Öffne den oberen Kanal vor dem unteren.","B1":"Die alte Notiz, die dem oberen Garten alles gibt, ist ungültig. Die Nachbarn haben drei Verteilungen bestätigt: vier/drei/drei, fünf/zwei/drei oder fünf/drei/zwei Minuten für Gemeinschaftsgarten, junge Pflanzen und Bäume. Zwei Minuten Reserve sind in allen Fällen geschützt. Prüfe den Pegel und dokumentiere die gewählte Vereinbarung."},
    glossary:'die Reserve = reserve · der Pegel = water level · verteilen = distribute · schließen = close',
    fields:[quantity('shared','Gemeinschaftsgarten · Minuten','Community garden · minutes',8),quantity('young','Junge Pflanzen · Minuten','Young plants · minutes',6),quantity('trees','Bäume · Minuten','Trees · minutes',6),quantity('reserve','Gemeinsame Reserve · Minuten','Shared reserve · minutes',4)],
    steps:[step('check','Pegel und Vereinbarung prüfen','check water level and agreement'),step('upper','Oberen Kanal öffnen','open the upper channel'),step('lower','Unteren Kanal öffnen','open the lower channel'),step('close','Kanäle schließen und Zeiten notieren','close channels and record times')],orderPrompt:'Baue die sichere Reihenfolge für den gemeinsamen Wasserlauf.',orderExplanation:'Zuerst Pegel und Vereinbarung prüfen, dann oben und unten öffnen, zuletzt schließen und dokumentieren. / Check level and agreement, open upper then lower channels, close and record.',
    validate:v=>[...require((v.shared===4&&v.young===3&&v.trees===3)||(v.shared===5&&v.young===2&&v.trees===3)||(v.shared===5&&v.young===3&&v.trees===2),'Verteile 4/3/3 Minuten oder gib eine Minute von genau einem kleinen Garten an den Gemeinschaftsgarten ab. / Allocate 4/3/3, or transfer one minute from either smaller garden to the community garden.'),...require(v.reserve===2,'Zwei Minuten sind als gemeinsame Reserve vereinbart. / Keep two minutes in reserve.'),...require(v.shared+v.young+v.trees+v.reserve===12,'Es stehen genau zwölf Minuten zur Verfügung. / Allocate the twelve available minutes without exceeding them.')],meter:v=>`Verteilt: ${v.shared+v.young+v.trees} Minuten · Reserve: ${v.reserve} · Gesamt: ${v.shared+v.young+v.trees+v.reserve} / 12`,solution:{shared:4,young:3,trees:3,reserve:2},note:'The gardeners replaced the outdated note with a shared allocation and a recorded reserve. Each person knows the order and the time their garden receives.',agreement:'Vier Minuten für den Gemeinschaftsgarten, drei für die jungen Pflanzen, drei für die Bäume und zwei Minuten als Reserve.',
  },
];

export function getExpeditionGame(id: string): ExpeditionGame | undefined { return expeditionGames.find(game => game.id===id); }
/** Completed paper props describe the learner's actual accepted allocation. */
export function expeditionAgreement(game: ExpeditionGame, values: Record<string,number>): string {
  values={...game.solution,...values};
  const words:Record<number,string>={1:'eins',2:'zwei',3:'drei',4:'vier',5:'fünf',6:'sechs',7:'sieben',8:'acht',11:'elf',12:'zwölf',13:'dreizehn',14:'vierzehn',15:'fünfzehn',16:'sechzehn',17:'siebzehn',18:'achtzehn',19:'neunzehn',20:'zwanzig',21:'einundzwanzig',23:'dreiundzwanzig',26:'sechsundzwanzig'};
  const n=(value:number)=>words[value]??String(value);
  switch(game.id){
    case 'saffroncourt':return `Mit Erlaubnis der Haussprecherin bringen wir das Paket um ${n(values.arrival)} Uhr durch das Osttor in den gemeinsamen Hof.`;
    case 'rainmarket':return `Wir treffen uns von ${n(values.start)} bis ${n(values.end)} Uhr unter dem Dach. Wir spielen leise Musik und räumen vor der Ruhezeit auf.`;
    case 'windplain':return `Wir nehmen ${n(values.water)} Kilo Wasser, ${n(values.food)} Kilo Essen, ein Kilo Werkzeug und das Funkgerät mit. Die Schutzplane gehört auf den Handwagen; das Ger fährt separat.`;
    case 'riverweave':return `Wir nehmen ${n(values.veg)} Körbe Gemüse, einen Korb Obst und zwei Säcke Reis. Mit der Fahrt durch den Ostkanal kostet alles ${n(values.veg*3+values.fruit*4+values.rice*5+values.route)} Münzen.`;
    case 'terracielo':return `Wir nähen drei blaue Taschen, jeweils vierzig Zentimeter breit und sechzig Zentimeter hoch. Die Abholung ist um ${n(values.pickup)} Uhr.`;
    case 'sunpatch':return `Wir senden die bestätigte Einladung am Freitag um ${n(values.broadcast)} Uhr: Am Freitag um acht Uhr treffen wir uns im Innenhof. Bitte bringt eure Ideen mit!`;
    case 'kigalights':return `Die Gruppe nutzt Raum A ab vierzehn Uhr. Die Aufnahme ist in Raum B. Die Schnittarbeit beginnt um ${n(values.edit)} Uhr und endet bis achtzehn Uhr.`;
    case 'cedarbay':return `Wir holen die Kiste am Weststeg ab und fahren um ${n(values.time)} Uhr. Vier Personen und die Kiste belegen alle sechs Plätze.`;
    case 'seoulsteps':return `Wegen des Regens treffen wir uns von ${n(values.start)} bis ${n(values.end)} Uhr im Gemeinschaftsraum. Leise Musik, bitte. Alle nutzen den Aufzug.`;
    case 'dunegarden':return `${n(values.shared)} Minuten für den Gemeinschaftsgarten, ${n(values.young)} für die jungen Pflanzen, ${n(values.trees)} für die Bäume und zwei Minuten als Reserve.`;
  }
}
export const expeditionGameAudioJobs = expeditionGames.flatMap(game => (['A1','A2','B1'] as const).map(level => ({id:`expedition-${game.id}-brief-${level.toLowerCase()}`,text:game.german[level]})));
export function shuffledExpeditionSteps(game: ExpeditionGame, seed: string): PlanStep[] {
  const pieces = seededShuffle(game.steps, `${seed}:${game.id}`);
  if (pieces.length > 1 && pieces.every((piece,index) => piece.id === game.steps[index].id)) [pieces[0],pieces[1]] = [pieces[1],pieces[0]];
  return pieces;
}
export function freshExpeditionPlan(game: ExpeditionGame, level: Level): ExpeditionPlan {
  return { version:1, level, values:Object.fromEntries(game.fields.map(field => [field.id,field.options[0].value])), order:[], completed:false, attempts:0 };
}
export function checkExpeditionPlan(game: ExpeditionGame, plan: ExpeditionPlan): PlanCheck {
  const invalidFields = game.fields.filter(field => !field.options.some(option => option.value===plan.values[field.id]));
  const feedback = invalidFields.length ? ['Please select a valid value for every part of your plan.'] : game.validate(plan.values);
  if (plan.order.length!==game.steps.length || game.steps.some((step,index)=>plan.order[index]!==step.id)) feedback.push(game.orderExplanation);
  return {correct:feedback.length===0, feedback, meter:game.meter(plan.values)};
}
interface StorageLike { getItem(key: string): string | null; setItem(key: string,value: string): void; }
const planKey = (id: string,level: Level) => `atlas.expedition.plan.v1.${id}.${level}`;
export function loadExpeditionPlan(game: ExpeditionGame,level: Level,storage?: StorageLike): ExpeditionPlan {
  const fresh = freshExpeditionPlan(game,level);
  try {
    const saved: unknown = JSON.parse((storage ?? localStorage).getItem(planKey(game.id,level)) || 'null');
    if (!saved || typeof saved!=='object') return fresh;
    const data = saved as Partial<ExpeditionPlan>;
    if (data.version!==1 || data.level!==level) return fresh;
    for (const field of game.fields) { const value=data.values?.[field.id]; if (field.options.some(option=>option.value===value)) fresh.values[field.id]=value!; }
    if (Array.isArray(data.order)) fresh.order=data.order.filter((id,index,array):id is string=>typeof id==='string'&&game.steps.some(step=>step.id===id)&&array.indexOf(id)===index).slice(0,game.steps.length);
    fresh.attempts=typeof data.attempts==='number'&&Number.isFinite(data.attempts)?Math.max(0,Math.floor(data.attempts)):0;
    fresh.completed=data.completed===true&&checkExpeditionPlan(game,fresh).correct;
  } catch { /* A malformed or blocked storage record starts a fresh plan. */ }
  return fresh;
}
export function saveExpeditionPlan(game: ExpeditionGame,plan: ExpeditionPlan,storage?: StorageLike): void { try { (storage ?? localStorage).setItem(planKey(game.id,plan.level),JSON.stringify(plan)); } catch { /* The game remains playable when browser storage is unavailable. */ } }
export function expeditionGameStatus(id:string,level:Level,authoritativePlans?:AuthoritativeExpeditionPlans): 'new'|'started'|'completed' {
  const game=getExpeditionGame(id); if (!game) return 'new';
  const plan=loadExpeditionPlan(game,level);
  const completed = authoritativePlans ? authoritativePlans[`${id}:${level}`]?.completed === true : plan.completed;
  return completed?'completed':plan.attempts||plan.order.length||game.fields.some(field=>plan.values[field.id]!==field.options[0].value)?'started':'new';
}
export function expeditionNotebook(authoritativePlans?:AuthoritativeExpeditionPlans): string {
  const entries=expeditionGames.flatMap(game=>(['A1','A2','B1'] as const).filter(level=>expeditionGameStatus(game.id,level,authoritativePlans)==='completed').map(level=>({game,level})));
  if (!entries.length) return '';
  return `<section class="field-notes expedition-notebook"><h3>People you helped connect</h3>${entries.map(({game,level})=>`<article class="grammar-route"><span class="caption">${level} · ${e(game.title)}</span><p>${e(game.note)}</p><blockquote>${e(expeditionAgreement(game,authoritativePlans?.[`${game.id}:${level}`]?.values??loadExpeditionPlan(game,level).values))}</blockquote><button class="text-button" data-expedition-game="${game.id}" data-expedition-level="${level}">Revisit this plan ${icon('arrow')}</button></article>`).join('')}</section>`;
}

export function mountExpeditionGame(root: HTMLElement, game: ExpeditionGame, options: ExpeditionGameOptions): {destroy():void;pause():void;resume():void;reset():void} {
  let currentLevel = options.level;
  const selectPlan = (level: Level): ExpeditionPlan => {
    const saved = options.initialPlan?.(level);
    if (saved) {
      const restored=freshExpeditionPlan(game,level);
      for(const field of game.fields){
        const value=saved.values[field.id];
        if(field.options.some(option=>option.value===value))restored.values[field.id]=value;
        else if(saved.completed&&value===undefined)restored.values[field.id]=game.solution[field.id];
      }
      restored.order=saved.order.filter((id,index,array)=>game.steps.some(step=>step.id===id)&&array.indexOf(id)===index);
      restored.attempts=saved.attempts;restored.completed=saved.completed&&checkExpeditionPlan(game,restored).correct;
      return restored;
    }
    const draft = loadExpeditionPlan(game,level);
    if (options.submitPlan) draft.completed = false;
    return draft;
  };
  let plan = selectPlan(currentLevel);
  let feedback: PlanCheck | undefined;
  let hint = currentLevel === 'A1', alive = true, submitting = false, paused = false;
  let selectedField = game.fields[0].id, layoutRevision = 0;
  let placementStarted=performance.now(),placementRevision=0,placementPausedAt=0,learningStatus='';
  const sessionSeed = options.seed ?? crypto.randomUUID();
  const seenBriefs = new Set<Level>();
  const persist = () => saveExpeditionPlan(game,plan);
  const expose = (text:string,kind:'placement'|'sequence'|'brief') => options.onExposure?.({mapId:game.id,level:currentLevel,text,kind});
  const speakPlacement = (text:string,kind:'placement'|'sequence') => { options.speak(text); expose(text,kind); };
  const layoutSeed = () => `${sessionSeed}:${currentLevel}:${plan.attempts}:${layoutRevision}`;
  const locked = () => plan.completed || submitting || paused;
  const tokenIcon = (field:PlanField) => /minute|wasser|garten|pflanzen|bäume/i.test(`${field.id} ${field.label}`) ? 'leaf' : /zimmer|room|ort|eingang|tür|weg/i.test(`${field.id} ${field.label}`) ? 'lock' : /zeit|beginn|ende|abfahrt|termin/i.test(`${field.id} ${field.label}`) ? 'clock' : 'parcel';
  const redraw = (focusKey?:string) => {
    if (!alive) return;
    const active = game.fields.find(field => field.id === selectedField)!;
    const disabled = locked() ? 'disabled' : '';
    const focus = focusKey ?? (root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.expFocus : undefined);
    const placed = game.fields.map(field => {
      const value = field.options.find(option => option.value === plan.values[field.id])!;
      return `<button type="button" class="expedition-placement ${selectedField===field.id?'selected':''}" data-exp-zone="${field.id}" data-game-action="plan-zone-${field.id}" data-exp-focus="zone:${field.id}" aria-pressed="${selectedField===field.id}" aria-label="${e(field.label)}: ${e(value.label)}. ${hint?'Choose this place to change its token.':'Tippe hier, um das Teil zu ändern.'}" ${disabled}>${icon(tokenIcon(field))}<span><span class="caption">${e(field.label)}</span><strong lang="de">${e(value.label)}</strong>${hint?`<em>${e(field.english)}</em>`:''}</span>${icon('arrow')}</button>`;
    }).join('');
    const tokens = seededShuffle(active.options,`${layoutSeed()}:${active.id}`).map((option,position) => `<button type="button" class="expedition-resource-token ${plan.values[active.id]===option.value?'selected':''}" draggable="${!locked()}" data-exp-token="${active.id}" data-game-option="${position}" data-exp-value="${option.value}" data-exp-focus="token:${active.id}:${option.value}" aria-pressed="${plan.values[active.id]===option.value}" aria-label="${e(option.label)}. ${e(active.label)}" ${disabled}>${icon(tokenIcon(active))}<strong lang="de">${e(option.label)}</strong>${hint&&option.english!==option.label?`<span class="caption">${e(option.english)}</span>`:''}</button>`).join('');
    root.innerHTML = `<section class="expedition-game" ${paused?'inert':''}><header class="expedition-game-heading"><h2>${e(game.title)}</h2><p>${e(game.summary)}</p><div class="expedition-levels" aria-label="Language scaffold">${(['A1','A2','B1'] as const).map(level=>`<button type="button" class="${currentLevel===level?'selected':''}" data-exp-level="${level}" data-game-action="plan-level-${level}" aria-pressed="${currentLevel===level}">${level}</button>`).join('')}<span>${plan.completed?'Agreement remembered':submitting?'Saving your plan…':'Your plan takes shape'}</span></div></header><blockquote class="expedition-brief"><span lang="de">${e(game.german[currentLevel])}</span><button class="icon-button" data-exp-speak data-game-action="plan-audio" aria-label="Listen to the German instructions">${icon('volume')}</button></blockquote><button class="text-button" data-exp-hint data-game-action="plan-help" aria-expanded="${hint}">${icon('book')} ${hint?'Hide':'Show'} English support</button>${hint?`<p class="expedition-glossary">${e(game.glossary)}</p>`:''}<div class="expedition-workbench"><div class="expedition-region-board" style="--expedition-preview:url('/assets/${game.id}-preview.webp')" aria-label="Neighborhood placement board"><div class="expedition-plan-fields">${placed}</div></div>${!plan.completed?`<section class="expedition-token-tray" aria-label="Tokens for ${e(active.label)}"><h3>${icon(tokenIcon(active))} ${e(active.label)}</h3><p>${hint?'Tap a token to place it here, or drag it to the matching place. Choose another place on the painting to work on it.':'Tippe auf ein Teil oder ziehe es an den passenden Ort. Wähle einen anderen Ort auf dem Bild.'}</p><p class="expedition-placement-prompt" lang="de">${e(options.placementPrompt?.(currentLevel,active.id)??'')}</p><div class="expedition-resource-tokens">${tokens}</div><p class="expedition-learning-state" role="status" aria-live="polite">${e(!options.placementReady?.(currentLevel,active.id)?'Exposure only · restore this instruction’s words before it can count as recall.':'Placements save supported recognition. Printed labels and speech do not create listening evidence.')}${learningStatus?`<span>${e(learningStatus)}</span>`:''}</p>${options.pendingLearning?.()?'<button type="button" class="text-button" data-exp-retry-learning data-game-action="plan-retry-learning">Retry learning saves</button>':''}</section>`:''}<output class="expedition-resource" aria-live="polite">${icon('basket')} ${e(game.meter(plan.values))}</output><div class="expedition-order"><h3>${e(game.orderPrompt)}</h3><p>${hint?'Tap or drag pieces onto the route. Tap a placed piece to return it to the tray.':'Tippe auf die Teile oder ziehe sie auf den Weg. Tippe erneut, um ein Teil zurückzulegen.'}</p><ol class="expedition-order-result" data-exp-sequence aria-label="Your assembled sequence">${plan.order.map((id,index)=>{const item=game.steps.find(step=>step.id===id)!;return `<li><button type="button" data-exp-remove="${index}" data-game-action="plan-remove-${id}" data-exp-focus="remove:${id}" ${disabled}><span>${index+1}</span><strong lang="de">${e(item.label)}</strong>${hint?`<span class="caption">${e(item.english)}</span>`:''}${!plan.completed?icon('close'):icon('check')}</button></li>`;}).join('')}${!plan.order.length?`<li class="expedition-order-empty">${hint?'Your route begins here.':'Dein Weg beginnt hier.'}</li>`:''}</ol><div class="expedition-order-pieces">${shuffledExpeditionSteps(game,layoutSeed()).map(item=>`<button type="button" draggable="${!locked()&&!plan.order.includes(item.id)}" data-exp-add="${item.id}" data-game-action="plan-step-${item.id}" data-exp-focus="step:${item.id}" ${locked()||plan.order.includes(item.id)?'disabled':''}>${icon('parcel')}<strong lang="de">${e(item.label)}</strong>${hint?`<span class="caption">${e(item.english)}</span>`:''}</button>`).join('')}</div></div></div><div class="expedition-plan-feedback ${feedback?.correct||plan.completed?'good':feedback?'retry':''}" role="status" aria-live="polite">${plan.completed?`<h3>${icon('check')} Everyone can work from this plan.</h3><p>${e(game.note)}</p><blockquote lang="de">${e(expeditionAgreement(game,plan.values))}</blockquote><button class="text-button" data-speak="${e(expeditionAgreement(game,plan.values))}">${icon('volume')} Listen to your agreement</button>`:feedback?`<strong>Your plan needs a change.</strong><ul>${feedback.feedback.map(text=>`<li>${e(text)}</li>`).join('')}</ul>`:''}</div><footer class="expedition-game-actions">${!plan.completed?`<button class="primary-button" data-exp-check data-game-action="plan-check" ${submitting?'disabled':''}>${icon('check')} Test the plan</button>`:''}<button class="text-button" data-exp-reset data-game-action="plan-reset">${icon('refresh')} ${plan.completed?'Build another plan':'Start this plan again'}</button><button class="text-button" data-action="close-dialog">Keep exploring ${icon('arrow')}</button></footer><p class="expedition-save-note">Your completed agreements are remembered with your adventure. Completing a plan adds an agreement to your expedition notebook.</p></section>`;
    if(!paused&&!seenBriefs.has(currentLevel)){seenBriefs.add(currentLevel);expose(game.german[currentLevel],'brief');}
    if (focus) Array.from(root.querySelectorAll<HTMLButtonElement>('[data-exp-focus]')).find(button => button.dataset.expFocus===focus&&!button.disabled)?.focus({preventScroll:true});
  };
  const place = (fieldId:string,value:number) => {
    if (locked()) return;
    const field = game.fields.find(field => field.id===fieldId), option = field?.options.find(option => option.value===value);
    if (!field || !option) return;
    if(plan.values[fieldId]===value){speakPlacement(option.label,'placement');return;}
    const responseMs=performance.now()-placementStarted,revision=++placementRevision,level=currentLevel;
    plan.values[fieldId] = value; selectedField = fieldId; feedback = undefined;placementStarted=performance.now();
    persist(); speakPlacement(option.label,'placement'); redraw(`token:${fieldId}:${value}`);
    if(options.onPlacement){learningStatus='Saving supported recognition…';redraw(`token:${fieldId}:${value}`);void options.onPlacement({mapId:game.id,level,fieldId,value,label:option.label,responseMs}).then(result=>{if(!alive)return;if(revision===placementRevision)learningStatus=`${field.label}: ${result.message}`;redraw();},error=>{if(!alive)return;if(revision===placementRevision)learningStatus=error instanceof Error?error.message:'Learning save needs a connection.';redraw();});}
  };
  const addStep = (id:string) => {
    if (locked() || plan.order.includes(id)) return;
    const step = game.steps.find(step => step.id===id); if (!step) return;
    plan.order.push(id); feedback = undefined; persist(); speakPlacement(step.label,'sequence'); redraw(`remove:${id}`);
  };
  const reset = () => {
    if (submitting || !alive) return;
    plan = freshExpeditionPlan(game,currentLevel); selectedField = game.fields[0].id; layoutRevision++; placementRevision++;feedback = undefined;placementStarted=performance.now();learningStatus='';persist(); redraw();
  };
  const onClick = async (event:Event) => {
    const target=(event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!target||!root.contains(target)||target.disabled||submitting||paused) return;
    if (target.dataset.expLevel) { currentLevel=target.dataset.expLevel as Level;plan=selectPlan(currentLevel);layoutRevision++;placementRevision++;feedback=undefined;hint=currentLevel==='A1';placementStarted=performance.now();learningStatus='';options.onLevelChange?.(currentLevel);redraw();return; }
    if (target.hasAttribute('data-exp-hint')) { hint=!hint;redraw();return; }
    if (target.hasAttribute('data-exp-speak')) { options.speak(game.german[currentLevel]);expose(game.german[currentLevel],'brief');return; }
    if (target.dataset.expZone&&!plan.completed) { selectedField=target.dataset.expZone;placementRevision++;learningStatus='';placementStarted=performance.now();redraw(`zone:${selectedField}`);return; }
    if (target.dataset.expToken) { place(target.dataset.expToken,Number(target.dataset.expValue));return; }
    if (target.dataset.expAdd) { addStep(target.dataset.expAdd);return; }
    if (target.dataset.expRemove!==undefined&&!plan.completed) { const id=plan.order[Number(target.dataset.expRemove)];plan.order.splice(Number(target.dataset.expRemove),1);feedback=undefined;persist();redraw(`step:${id}`);return; }
    if (target.hasAttribute('data-exp-check')&&!plan.completed) {
      if (options.submitPlan) {
        submitting=true;redraw();
        try {
          const result=await options.submitPlan({...plan,values:{...plan.values},order:[...plan.order]});
          if (!alive) return;
          plan={version:1,...result.plan,values:{...result.plan.values},order:[...result.plan.order],completed:result.correct&&result.plan.completed};
          const explanation=checkExpeditionPlan(game,plan).feedback;
          feedback={correct:result.correct,feedback:result.feedback??(explanation.length?explanation:['The neighborhood needs a different agreement.']),meter:game.meter(plan.values)};
          if (!plan.completed) layoutRevision++;
          persist();if(plan.completed)options.onComplete();
        } catch(error) {
          if (alive) feedback={correct:false,feedback:[error instanceof Error?error.message:'The neighborhood could not save this plan. Try again.'],meter:game.meter(plan.values)};
        } finally { submitting=false;redraw(); }
      } else {
        plan.attempts++;feedback=checkExpeditionPlan(game,plan);plan.completed=feedback.correct;persist();redraw();if(plan.completed)options.onComplete();
      }
      return;
    }
    if (target.hasAttribute('data-exp-reset')) reset();
    if (target.hasAttribute('data-exp-retry-learning')&&options.retryLearning){try{const count=await options.retryLearning();if(alive)learningStatus=`${count} supported recognition answers saved.`;}catch(error){if(alive)learningStatus=error instanceof Error?error.message:'Learning save needs a connection.';}redraw();}
  };
  let dragged: {field:string;value:number} | {step:string} | undefined;
  const onDragStart = (event:DragEvent) => {
    if (locked()) {event.preventDefault();return;}
    const target=(event.target as HTMLElement).closest<HTMLButtonElement>('[draggable="true"]');if(!target||!root.contains(target))return;
    dragged=target.dataset.expToken?{field:target.dataset.expToken,value:Number(target.dataset.expValue)}:target.dataset.expAdd?{step:target.dataset.expAdd}:undefined;
    if(dragged&&event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',JSON.stringify(dragged));}
  };
  const onDragOver = (event:DragEvent) => {
    const target=(event.target as HTMLElement).closest<HTMLElement>('[data-exp-zone],[data-exp-sequence]');
    if(!locked()&&dragged&&target&&('field' in dragged?target.dataset.expZone===dragged.field:target.hasAttribute('data-exp-sequence')))event.preventDefault();
  };
  const onDrop = (event:DragEvent) => {
    const target=(event.target as HTMLElement).closest<HTMLElement>('[data-exp-zone],[data-exp-sequence]');
    if(!target||!dragged||locked())return;
    if('field' in dragged&&target.dataset.expZone===dragged.field){event.preventDefault();place(dragged.field,dragged.value);}
    else if('step' in dragged&&target.hasAttribute('data-exp-sequence')){event.preventDefault();addStep(dragged.step);}
    dragged=undefined;
  };
  const onDragEnd = () => {dragged=undefined;};
  const onKeyDown = (event:KeyboardEvent) => {
    if(locked()||event.altKey||event.ctrlKey||event.metaKey||!/^\d$/.test(event.key)||event.key==='0')return;
    const token=root.querySelectorAll<HTMLButtonElement>('[data-exp-token]')[Number(event.key)-1];
    if(token&&!token.disabled){event.preventDefault();event.stopPropagation();token.click();}
  };
  root.addEventListener('click',onClick);root.addEventListener('dragstart',onDragStart);root.addEventListener('dragover',onDragOver);root.addEventListener('drop',onDrop);root.addEventListener('dragend',onDragEnd);root.addEventListener('keydown',onKeyDown);const unbindInput=new MiniGameInput().bind(root);redraw();
  return {destroy(){alive=false;unbindInput();root.removeEventListener('click',onClick);root.removeEventListener('dragstart',onDragStart);root.removeEventListener('dragover',onDragOver);root.removeEventListener('drop',onDrop);root.removeEventListener('dragend',onDragEnd);root.removeEventListener('keydown',onKeyDown);root.replaceChildren();},pause(){if(paused)return;paused=true;placementPausedAt=performance.now();redraw();},resume(){if(!paused)return;placementStarted+=performance.now()-placementPausedAt;paused=false;redraw();},reset};
}
