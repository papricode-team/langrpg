import type { Level } from './content';
import type { MapId, MapPosition, WorldMapSpec, WorldObjectSpec } from './maps';
import type { PlacedScenerySpec, SceneryAsset } from './placed-scenery';
import type { ResidentSpec } from './world-life';

export const expeditionIds = ['saffroncourt', 'rainmarket', 'windplain', 'riverweave', 'terracielo', 'sunpatch', 'kigalights', 'cedarbay', 'seoulsteps', 'dunegarden'] as const;
export type ExpeditionId = typeof expeditionIds[number];
export const isExpeditionMap = (id: string): id is ExpeditionId => (expeditionIds as readonly string[]).includes(id);
export type ExpeditionGameKind = 'dialogue' | 'sequence' | 'directions' | 'trade' | 'repair' | 'memory';
export interface ExpeditionChoice { text: string; correct: boolean; response: string; }
export interface ExpeditionEncounter {
  id: string; title: string; prompt: string; german: string; translation: string;
  choices: readonly ExpeditionChoice[]; languageFocus: string; difficulty: Level; gameKind: ExpeditionGameKind;
}
export interface ExpeditionNpc {
  id: string; name: string; role: string; artVariant: number;
  avatar: { hair: string; skin: string; outfit: string };
  greeting: string; description: string; relationship: string; relationships: readonly string[]; encounterId: string;
}
export interface ExpeditionRegion {
  id: ExpeditionId; name: string; subtitle: string; description: string;
  culture: string; feeling: string; languageFocus: string;
  npcs: readonly ExpeditionNpc[]; objects: readonly WorldObjectSpec[]; encounters: readonly ExpeditionEncounter[];
}
export interface ExpeditionLayout {
  /** Normalized feet coordinates, also used by the terrain assembly pipeline. */
  nodes: readonly MapPosition[];
  links: readonly (readonly [number, number])[];
  /** Width of the entire walkable corridor, in the 1536 × 1024 painting. */
  roadWidth: number;
  /** Extra traversable meadows / plazas; empty on canal and terrace maps. */
  grounds: readonly (readonly (readonly [number, number])[])[];
}
const points = (pairs: readonly (readonly [number, number])[]): MapPosition[] => pairs.map(([x, y]) => ({ x, y }));
const loop = (length: number): (readonly [number, number])[] => Array.from({ length }, (_, i) => [i, (i + 1) % length] as const);
export const expeditionLayouts: Readonly<Record<ExpeditionId, ExpeditionLayout>> = {
  saffroncourt: { nodes: points([[.5,.72],[.24,.72],[.24,.49],[.24,.27],[.5,.27],[.76,.27],[.76,.49],[.76,.72],[.5,.49],[.5,.89]]), links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[0,8],[8,4],[2,8],[8,6],[0,9]], roadWidth: 94, grounds: [] },
  rainmarket: { nodes: points([[.12,.58],[.3,.58],[.48,.58],[.66,.58],[.87,.58],[.3,.29],[.48,.78],[.66,.3],[.87,.81],[.12,.31]]), links: [[0,1],[1,2],[2,3],[3,4],[1,5],[2,6],[3,7],[4,8],[0,9],[5,9],[7,5]], roadWidth: 112, grounds: [] },
  windplain: { nodes: points([[.5,.76],[.24,.68],[.15,.46],[.3,.24],[.55,.21],[.78,.32],[.86,.56],[.7,.75],[.51,.49],[.39,.39]]), links: [...loop(8),[0,8],[2,9],[9,8],[8,5],[8,3]], roadWidth: 120, grounds: [[[.08,.2],[.89,.15],[.94,.84],[.1,.89]]] },
  riverweave: { nodes: points([[.15,.77],[.37,.77],[.62,.77],[.86,.77],[.86,.49],[.62,.49],[.37,.49],[.15,.49],[.37,.22],[.7,.22]]), links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[6,8],[8,9],[9,5]], roadWidth: 108, grounds: [] },
  terracielo: { nodes: points([[.16,.83],[.4,.83],[.76,.68],[.87,.51],[.6,.51],[.22,.37],[.13,.2],[.48,.2],[.78,.2],[.51,.67]]), links: [[0,1],[1,9],[9,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[9,4]], roadWidth: 94, grounds: [] },
  sunpatch: { nodes: points([[.5,.83],[.2,.83],[.2,.56],[.2,.26],[.5,.26],[.8,.26],[.8,.56],[.8,.83],[.5,.56],[.5,.4]]), links: [...loop(8),[0,8],[8,4],[2,8],[8,6],[3,9],[9,6]], roadWidth: 114, grounds: [] },
  kigalights: { nodes: points([[.13,.8],[.33,.71],[.54,.64],[.8,.55],[.86,.35],[.62,.42],[.39,.48],[.17,.55],[.34,.26],[.66,.18]]), links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[1,6],[6,8],[8,9],[9,4]], roadWidth: 104, grounds: [] },
  cedarbay: { nodes: points([[.16,.81],[.34,.71],[.49,.78],[.7,.71],[.86,.59],[.71,.41],[.51,.45],[.31,.35],[.17,.21],[.55,.19]]), links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,5],[1,7]], roadWidth: 104, grounds: [] },
  seoulsteps: { nodes: points([[.17,.84],[.4,.84],[.8,.72],[.83,.55],[.55,.55],[.19,.4],[.16,.23],[.5,.23],[.83,.23],[.42,.65]]), links: [[0,1],[1,9],[9,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[9,4],[4,7]], roadWidth: 96, grounds: [] },
  dunegarden: { nodes: points([[.5,.83],[.23,.83],[.23,.57],[.23,.29],[.5,.29],[.77,.29],[.77,.57],[.77,.83],[.5,.57],[.5,.15]]), links: [...loop(8),[0,8],[8,4],[2,8],[8,6],[4,9]], roadWidth: 102, grounds: [] },
};

type NpcSeed = readonly [slug: string, name: string, role: string, relationship: string, greeting: string, translation: string, answer: string, distractor: string];
type ObjectSeed = readonly [slug: string, label: string, kind: WorldObjectSpec['kind'], description: string, german: string, translation: string, answer: string, distractor: string, gameKind?: ExpeditionGameKind];
interface RegionSeed { id: ExpeditionId; name: string; subtitle: string; level: Level; culture: string; feeling: string; description: string; languageFocus: string; cast: readonly NpcSeed[]; discoveries: readonly ObjectSeed[]; residents: readonly string[]; }

/** Fictional contemporary communities: the relationships are stories, not cultural generalizations. */
const seeds: readonly RegionSeed[] = [
  {
    id: 'saffroncourt', name: 'Saffron Court', subtitle: 'Every door has another side', level: 'A1',
    culture: 'A fictional courtyard and workshop quarter inspired by Fez, Morocco.', feeling: 'Shaded, intimate, full of hidden connections.',
    description: 'Quiet courtyards connect a lively repair street. Two neighbors who seem to disagree are secretly keeping the same community garden alive.',
    languageFocus: 'Directions, possession, permission and repairing misunderstandings.',
    cast: [
      ['salma','Salma','Repair cooperative organizer','Salma shares a workshop with Youssef and asks Amina to keep its deliveries separate.','Das Paket ist für Youssef. Seine Werkstatt ist hinter dem blauen Tor.','The parcel is for Youssef. His workshop is behind the blue gate.','Ich bringe es hinter das blaue Tor.','Ich stelle es vor das rote Tor.'],
      ['youssef','Youssef','Bicycle repairer','Youssef teaches Idriss; his unfinished bicycle belongs to Leila, who needs it for her deliveries.','Leilas Fahrrad ist fertig. Kannst du ihr Bescheid sagen?','Leila’s bicycle is ready. Can you let her know?','Leila, dein Fahrrad ist fertig.','Youssef möchte dein Fahrrad kaufen.'],
      ['amina','Amina','Courtyard caretaker','Amina and Karim publicly argue about water but privately coordinate the shared garden.','Die Pflanzen gehören uns allen. Bitte frag, bevor du eine mitnimmst.','The plants belong to all of us. Please ask before taking one.','Darf ich diese Pflanze mitnehmen?','Ich nehme alle Pflanzen mit.'],
      ['idriss','Idriss','Repair apprentice','Idriss studies with Youssef and records spoken instructions for his friend Nour.','Ich habe den Schlüssel, aber nicht die Adresse.','I have the key, but not the address.','Welche Adresse brauchst du?','Du brauchst keinen Schlüssel mehr.'],
      ['leila','Leila','Neighborhood courier','Leila delivers for the cooperative and borrows Nour’s route notebook.','Zuerst zu Salma, dann zu Karim. Nicht umgekehrt!','First to Salma, then to Karim. Not the other way around!','Salma kommt zuerst.','Karim kommt zuerst.'],
      ['karim','Karim','Community gardener','Karim fixes Amina’s irrigation pump without telling the courtyard committee.','Amina hat die Pumpe bezahlt. Ich habe sie repariert.','Amina paid for the pump. I repaired it.','Ihr habt beide geholfen.','Amina hat die Pumpe repariert.'],
      ['nour','Nour','Audio storyteller','Nour records neighborhood memories; her brother Sami adds imaginary doors to the map.','Mein Bruder hat diese Tür erfunden. Die echte Tür ist links.','My brother invented this door. The real door is on the left.','Ich gehe nach links.','Ich warte vor der erfundenen Tür.'],
      ['sami','Sami','Student map maker','Sami helps Nour label sound recordings but prefers adding playful possibilities to the map.','Das ist mein Plan. Welche Straße fehlt?','This is my plan. Which street is missing?','Die Straße zwischen den Höfen fehlt.','Der Plan gehört niemandem.'],
    ],
    discoveries: [
      ['gate','The blue delivery gate','noticeboard','A gate connects two workshops; a handwritten sign settles whose parcel goes where.','Lieferungen bitte durch das blaue Tor.','Please deliver through the blue gate.','Ich benutze das blaue Tor.','Ich benutze das geschlossene Fenster.','directions'],
      ['pump','The shared water pump','fountain','Amina’s receipt and Karim’s tools reveal their unannounced cooperation.','Die Pumpe funktioniert wieder. Bitte sparsam benutzen.','The pump works again. Please use it sparingly.','Ich nehme nur das nötige Wasser.','Ich lasse das Wasser immer laufen.','repair'],
      ['bench','A bench for two rivals','garden','Two names scratched under the bench explain who tends the garden before dawn.','Amina gießt morgens, Karim abends.','Amina waters in the morning, Karim in the evening.','Beide kümmern sich um den Garten.','Niemand kümmert sich um den Garten.','memory'],
      ['parcel','The courtyard parcel','parcel','A very ordinary parcel has acquired three conflicting instructions and one clear address.','Für Salma, nicht für Sami.','For Salma, not for Sami.','Das Paket gehört Salma.','Das Paket gehört Sami.','trade'],
      ['bicycle','Leila’s repaired bicycle','instrument','The repair tag lists the owner, mechanic and apprentice in different handwriting.','Repariert von Youssef. Abholung durch Leila.','Repaired by Youssef. Collection by Leila.','Leila holt das Fahrrad ab.','Youssef holt Leilas Paket ab.','repair'],
      ['tea-table','The workshop tea tray','instrument','The cooperative uses cups as place markers during its weekly planning conversation.','Drei Gäste, drei Tassen. Eine Tasse fehlt.','Three guests, three cups. One cup is missing.','Ich bringe noch eine Tasse.','Ich nehme zwei Tassen weg.','trade'],
      ['sound-map','Nour’s sound map','noticeboard','Recorded water, bicycle bells and footsteps identify streets that look nearly identical.','Nach dem Brunnen links, vor der Werkstatt rechts.','Left after the fountain, right before the workshop.','Erst links, dann rechts.','Erst rechts, dann links.','sequence'],
      ['seed-box','The seed exchange','garden','Gardeners exchange seeds with a note asking visitors to leave something in return.','Nimm eine Tüte und lass eine andere hier.','Take one packet and leave another here.','Ich tausche eine Tüte.','Ich nehme die ganze Kiste.','trade'],
      ['key-hook','The borrowed key','instrument','The key hook keeps track of a borrowing agreement between Idriss and Salma.','Idriss leiht den Schlüssel bis morgen.','Idriss borrows the key until tomorrow.','Er gibt ihn morgen zurück.','Er behält ihn für immer.','memory'],
      ['roof-sign','The surprising roof garden','noticeboard','A narrow stair leads above the workshop to the garden both neighbors were defending.','Der Garten ist oben. Bitte vorher fragen.','The garden is upstairs. Please ask first.','Dürfen wir nach oben gehen?','Wir gehen ohne zu fragen hinein.','dialogue'],
    ], residents: ['Hajar','Rachid','Imane','Anas','Meryem','Bilal','Dounia','Tariq'],
  },
  {
    id: 'rainmarket', name: 'Rain Arcade', subtitle: 'The shop that opens after closing', level: 'A2',
    culture: 'A fictional contemporary shopping neighborhood inspired by Japanese covered shopping streets.', feeling: 'Bright, rain-softened, busy and tender after dusk.',
    description: 'A covered arcade changes character when its shutters come down. Residents negotiate an evening event while a handwritten side-door notice changes everyone’s plans.',
    languageFocus: 'Schedules, exceptions, invitations and considerate disagreement.',
    cast: [
      ['haru','Haru','New upstairs tenant','Haru shares an entrance with Aiko’s shop and works early shifts with Jun.','Ich muss morgen früh arbeiten. Können wir die Musik um zehn beenden?','I have to work early tomorrow. Can we finish the music at ten?','Ja, wir planen ein Ende um zehn.','Dann spielen wir bis drei Uhr weiter.'],
      ['aiko','Aiko','Longtime stationery shopkeeper','Aiko lends event supplies to Mei and leaves a side-door collection option for Jun.','Vorne ist geschlossen, aber Abholung ist hinten bis acht möglich.','The front is closed, but collection at the back is possible until eight.','Ich hole es vor acht hinten ab.','Ich komme um neun zur Vorderseite.'],
      ['jun','Jun','Night-shift nurse','Jun relies on Aiko’s late collection and promises Haru a quiet trip upstairs.','Meine Schicht beginnt um neun. Um halb acht kann ich noch helfen.','My shift starts at nine. I can still help at half past seven.','Wir treffen uns um halb acht.','Wir treffen uns erst um zehn.'],
      ['mei','Mei','Community event planner','Mei organizes the event with Ren but needs Haru’s agreement on the closing time.','Ren möchte draußen spielen. Bei Regen brauchen wir einen anderen Ort.','Ren wants to play outside. In rain we need another place.','Bei Regen spielen wir unter dem Dach.','Bei Regen lassen wir die Geräte draußen.'],
      ['ren','Ren','Student musician','Ren rehearses with Mei’s event group and borrows a cable from Sora.','Sora hat mir das Kabel geliehen. Ich muss es heute zurückgeben.','Sora lent me the cable. I must return it today.','Ich erinnere dich an die Rückgabe.','Das Kabel gehört jetzt dir.'],
      ['sora','Sora','Electronics repairer','Sora repairs Ren’s amplifier and asks Ken to test the notice display.','Der Bildschirm funktioniert, aber die Uhrzeit ist noch falsch.','The screen works, but the time is still wrong.','Wir stellen zuerst die richtige Uhrzeit ein.','Wir kaufen sofort einen neuen Bildschirm.'],
      ['ken','Ken','Retired delivery driver','Ken helps Sora test displays and teaches Yui the safest bicycle route.','Die kurze Gasse ist gesperrt. Über die Hauptstraße geht es trotzdem.','The short alley is blocked. It still works via the main street.','Ich nehme die Hauptstraße.','Ich fahre durch die gesperrte Gasse.'],
      ['yui','Yui','Bicycle delivery student','Yui knows the front-door routes but needs Ken and Aiko’s advice on after-hours access.','Ich habe nur die Vorderseite gesehen. Gibt es noch einen Eingang?','I have only seen the front. Is there another entrance?','Ja, hinten gibt es eine Seitentür.','Nein, Abholung ist immer unmöglich.'],
    ],
    discoveries: [
      ['side-door','The handwritten side-door notice','noticeboard','The shop appears closed until a small arrow reveals a collection entrance for late workers.','Abholung hinten: 18–20 Uhr. Verkauf morgen wieder ab 9 Uhr.','Collection at the back: 6–8 pm. Sales again tomorrow from 9 am.','Heute kann ich um sieben hinten abholen.','Heute kann ich um neun vorne einkaufen.','directions'],
      ['event-board','The evening agreement','noticeboard','The event plan includes a quieter closing time added after Haru’s first conversation.','Musik bis 22 Uhr, danach nur Aufräumen.','Music until 10 pm, then cleanup only.','Nach zehn räumen wir leise auf.','Nach zehn beginnt das Konzert.','sequence'],
      ['umbrella','The umbrella exchange','instrument','An umbrella stand helps neighbors borrow weather gear and remember whose item returns where.','Bitte morgen zurückbringen oder eine andere hierlassen.','Please return it tomorrow or leave another here.','Ich bringe den Schirm morgen zurück.','Ich werfe den Schirm nach dem Regen weg.','trade'],
      ['display','Sora’s clock display','clock','A newly repaired screen shows last year’s event time instead of tonight’s agreement.','Das Gerät ist repariert. Jetzt müssen wir die Uhr einstellen.','The device is repaired. Now we must set the clock.','Zuerst korrigieren wir die Zeit.','Wir ändern nur die Farbe.','repair'],
      ['bicycle','Yui’s route card','instrument','Two routes reach the same door, but only one remains open after the deliveries arrive.','Die Gasse ist bis morgen gesperrt.','The alley is blocked until tomorrow.','Heute fahre ich über die Hauptstraße.','Heute nehme ich die gesperrte Gasse.','directions'],
      ['rehearsal','Ren’s rehearsal cable','instrument','A borrowing label prevents a helpful repair from becoming an awkward ownership argument.','Geliehen von Sora. Rückgabe heute.','Borrowed from Sora. Return today.','Das Kabel geht heute zu Sora zurück.','Ren verkauft Soras Kabel morgen.','memory'],
      ['meal-box','Jun’s late meal box','parcel','A meal reserved for a night worker waits behind the counter with precise collection instructions.','Für Jun reserviert. Bitte nicht verkaufen.','Reserved for Jun. Please do not sell.','Ich lasse Juns Essen liegen.','Ich verkaufe es an den nächsten Gast.','trade'],
      ['rain-bell','The arcade rain bell','lantern','A bell calls the event group under cover without canceling the neighbors’ shared evening.','Bei Regen findet das Treffen unter dem Dach statt.','In rain the meeting takes place under the roof.','Das Treffen zieht unter das Dach.','Bei Regen kommt niemand mehr.','dialogue'],
      ['quiet-stairs','Haru’s quiet stairs','noticeboard','The upstairs entrance carries a request from residents who begin work before the arcade wakes.','Nach 22 Uhr bitte leise sprechen.','Please speak quietly after 10 pm.','Wir sprechen auf der Treppe leise.','Wir testen hier nachts den Verstärker.','dialogue'],
      ['invitation','The unfinished invitation','noticeboard','Mei’s draft needs a rain location and closing time before it can be delivered.','Bitte Ort und Ende ergänzen, bevor wir die Einladung drucken.','Please add place and ending time before we print the invitation.','Ergänzen, prüfen, dann drucken.','Drucken, verteilen, dann ergänzen.','sequence'],
    ], residents: ['Nao','Riku','Emi','Tomo','Mika','Kenta','Aya','Daichi'],
  },
  {
    id: 'windplain', name: 'Windplain', subtitle: 'An address that moves', level: 'A2',
    culture: 'A fictional seasonal camp inspired by Mongolian steppe communities.', feeling: 'Expansive, quiet, companionable and mobile.',
    description: 'A broad grassland camp combines homes, workshop vehicles and a shared radio. A perfectly grammatical address becomes outdated when its household moves.',
    languageFocus: 'Future plans, changing landmarks, sequence and checking information.',
    cast: [
      ['sarnai','Sarnai','Household coordinator','Sarnai coordinates the move with Bat and keeps a place ready for her cousin Tuya.','Morgen ziehen wir weiter. Tuya kommt heute noch zum alten Platz.','Tomorrow we move on. Tuya is still coming to the old place today.','Heute findet Tuya euch am alten Platz.','Heute findet Tuya euch schon am neuen Platz.'],
      ['bat','Bat','Vehicle mechanic','Bat repairs Sarnai’s trailer while Erdene checks the radio battery.','Der Anhänger ist fast fertig. Wir können erst nach der Prüfung fahren.','The trailer is almost ready. We can leave only after the inspection.','Wir prüfen ihn vor der Abfahrt.','Wir fahren ohne Prüfung los.'],
      ['tuya','Tuya','Visiting illustrator','Tuya follows Sarnai’s old address and sketches Nomin’s changing landmark map.','Auf meinem Zettel steht der alte Brunnen. Ist die Adresse noch aktuell?','My note says the old well. Is the address still current?','Wir prüfen, ob die Familie noch dort ist.','Ein alter Zettel ist immer richtig.'],
      ['erdene','Erdene','Radio organizer','Erdene shares weather reports with Oyun and borrows Bat’s charger.','Oyun braucht die Nachricht vor der Abfahrt, nicht danach.','Oyun needs the message before departure, not after.','Ich gebe ihr die Nachricht jetzt.','Ich warte bis nach der Abfahrt.'],
      ['nomin','Nomin','Student route recorder','Nomin maps the move for Tuya; Munkh checks the distances she estimates.','Der Hügel bleibt, aber unsere Zelte wechseln den Platz.','The hill stays, but our tents change their position.','Wir benutzen den Hügel als festen Punkt.','Das Zelt bleibt immer am selben Ort.'],
      ['munkh','Munkh','Driver and distance checker','Munkh drives the shared supply van and helps Nomin distinguish near from accessible.','Der nächste Weg ist kürzer, aber der andere ist trocken.','The nearer path is shorter, but the other is dry.','Wir vergleichen Länge und Zustand.','Der kürzeste Weg ist immer der beste.'],
      ['oyun','Oyun','Camp cook','Oyun plans meals around Erdene’s radio message and leaves Ariun a packing checklist.','Erst essen wir, dann packen wir die Küche ein.','First we eat, then we pack the kitchen.','Die Küche wird nach dem Essen eingepackt.','Wir packen zuerst alle Töpfe weg.'],
      ['ariun','Ariun','Packing coordinator','Ariun labels Oyun’s kitchen boxes and wants Tuya’s sketchbooks to travel safely.','Die Bücher sind in der leichten Kiste. Bitte oben einladen.','The books are in the light crate. Please load it on top.','Die leichte Kiste kommt nach oben.','Die schwere Werkzeugkiste kommt auf die Bücher.'],
    ],
    discoveries: [
      ['address','Yesterday’s exact address','noticeboard','An address remains legible after the household has moved; the hill is the useful clue.','Ab morgen östlich vom Hügel, heute noch beim Brunnen.','From tomorrow east of the hill, today still by the well.','Heute suche ich am Brunnen.','Heute suche ich östlich vom Hügel.','directions'],
      ['trailer','Bat’s departure inspection','instrument','The trailer checklist connects an apparently small repair to everyone’s departure plans.','Bremsen prüfen, Ladung sichern, dann fahren.','Check brakes, secure load, then drive.','Prüfen, sichern, fahren.','Fahren, prüfen, sichern.','sequence'],
      ['radio','The shared radio','instrument','A radio report has a timestamp so that residents can distinguish the newest plan from an old one.','Diese Nachricht ist von heute Morgen. Die alte gilt nicht mehr.','This message is from this morning. The old one no longer applies.','Wir folgen der neuen Nachricht.','Wir folgen immer der ältesten Nachricht.','memory'],
      ['kitchen','Oyun’s kitchen boxes','parcel','Kitchen labels preserve the order of a shared meal and the move that follows it.','Küche erst nach dem Mittagessen einpacken.','Pack the kitchen only after lunch.','Zuerst essen wir gemeinsam.','Wir packen die Küche vor dem Kochen ein.','sequence'],
      ['hill-map','Nomin’s fixed landmark','noticeboard','A map uses a hill and two permanent stones instead of a tent that will move tomorrow.','Zwischen den Steinen, südlich vom Hügel.','Between the stones, south of the hill.','Ich suche südlich vom Hügel.','Ich suche nördlich vom Hügel.','directions'],
      ['books','Tuya’s sketchbook crate','parcel','A carefully packed drawing box waits beside tools that must be loaded below it.','Leicht und zerbrechlich. Nicht unter schwere Kisten stellen.','Light and fragile. Do not put under heavy crates.','Diese Kiste steht oben.','Diese Kiste kommt unter die Werkzeuge.','trade'],
      ['solar','The charger agreement','instrument','A shared solar charger has different borrowing windows for the mechanic and radio organizer.','Bat bis zwölf, Erdene ab zwölf.','Bat until twelve, Erdene from twelve.','Um eins kann Erdene laden.','Um eins hat Bat Vorrang bis morgen.','memory'],
      ['water','The well roster','fountain','A roster helps visitors find the person responsible for today’s water containers.','Heute füllt Ariun die Kanister, morgen übernimmt Nomin.','Today Ariun fills the canisters, tomorrow Nomin takes over.','Heute frage ich Ariun.','Heute frage ich ausschließlich Nomin.','dialogue'],
      ['weather','Two possible routes','noticeboard','One route is short and wet while the other is longer and usable by the loaded van.','Für den beladenen Wagen bitte den trockenen Weg nehmen.','For the loaded vehicle please take the dry path.','Wir nehmen den längeren trockenen Weg.','Wir nehmen den kürzeren nassen Weg.','directions'],
      ['arrival','A place for the visitor','garden','Sarnai’s invitation includes a meal and a reminder that the household moves the following day.','Komm heute zum Essen. Morgen findest du uns am neuen Platz.','Come for a meal today. Tomorrow you’ll find us in the new place.','Ich besuche euch heute am alten Platz.','Ich suche heute nur den neuen Platz.','dialogue'],
    ], residents: ['Anu','Bilegt','Bolor','Gan','Khulan','Temuulen','Enkh','Tsetseg'],
  },
  {
    id: 'riverweave', name: 'Riverweave', subtitle: 'Three accounts of one late order', level: 'A2',
    culture: 'A fictional river community inspired by Cần Thơ, Vietnam.', feeling: 'Fluid, energetic and full of anticipation.',
    description: 'Landing stages join waterside workshops and kitchens. A late food order has three plausible explanations, and every person holds one useful part of the story.',
    languageFocus: 'Quantities, alternatives, explanations and coordinating deliveries.',
    cast: [
      ['linh','Linh','Boat operator','Linh transports Mai’s orders and checks the landing schedule with Bao.','Ich kann zehn Kisten mitnehmen, aber Mai hat zwölf bestellt.','I can take ten crates, but Mai ordered twelve.','Zwei Kisten brauchen eine zweite Fahrt.','Alle zwölf passen in zehn Plätze.'],
      ['mai','Mai','Community kitchen cook','Mai ordered vegetables from Phuc and promised Trang a meal before the rehearsal.','Wenn das Gemüse später kommt, kochen wir zuerst den Reis.','If the vegetables arrive later, we cook the rice first.','Wir beginnen mit dem Reis.','Wir warten mit jeder Vorbereitung.'],
      ['phuc','Phuc','Garden supplier','Phuc packed Mai’s vegetables but asked Linh to use a different landing.','Ich habe die Bestellung fertig. Das Boot wartet am anderen Steg.','The order is ready. The boat waits at the other landing.','Die Ware ist fertig, der Treffpunkt hat sich geändert.','Die Ware wurde nie bestellt.'],
      ['bao','Bao','Landing coordinator','Bao updates Linh’s landing slots and asks An to repaint the temporary route arrow.','Der mittlere Steg wird repariert. Heute legen wir weiter südlich an.','The middle landing is being repaired. Today we land farther south.','Ich suche den südlichen Steg.','Ich warte am gesperrten mittleren Steg.'],
      ['trang','Trang','Rehearsal organizer','Trang planned a meal with Mai and asks Huy to collect the group’s changed timetable.','Die Probe beginnt später, damit alle vorher essen können.','The rehearsal starts later so everyone can eat beforehand.','Das Essen kommt vor der Probe.','Die Probe beginnt früher als geplant.'],
      ['huy','Huy','Student messenger','Huy carries Trang’s revised schedule and borrows Chi’s waterproof folder.','Das Papier muss trocken bleiben. Chi hat mir diese Mappe geliehen.','The paper must stay dry. Chi lent me this folder.','Ich bringe Chi die Mappe zurück.','Die Mappe gehört jetzt der ganzen Gruppe.'],
      ['chi','Chi','Book and stationery seller','Chi lends Huy supplies and helps An distinguish permanent signs from temporary notices.','Der neue Pfeil gilt nur heute. Morgen benutzen wir wieder den alten Weg.','The new arrow applies only today. Tomorrow we use the old route again.','Heute folgen wir dem neuen Pfeil.','Der neue Pfeil gilt für immer.'],
      ['an','An','Sign painter','An repaints Bao’s landing sign and works with Chi on clearer instructions.','Ich schreibe den Grund dazu, damit niemand am alten Steg wartet.','I’m adding the reason so nobody waits at the old landing.','Der Hinweis erklärt die Reparatur.','Der Hinweis soll den Treffpunkt verstecken.'],
    ],
    discoveries: [
      ['landing','The temporary landing arrow','noticeboard','A temporary painted arrow explains where today’s boat arrives while the normal stage is repaired.','Heute südlicher Steg wegen Reparatur.','Today southern landing because of repairs.','Ich warte heute im Süden.','Ich warte am geschlossenen Steg.','directions'],
      ['order','Mai’s twelve-crate order','parcel','The kitchen order exceeds the boat’s carrying space, so arithmetic changes the delivery plan.','Zwölf Kisten bestellt, zehn Plätze frei.','Twelve crates ordered, ten spaces available.','Zwei Kisten bleiben für die zweite Fahrt.','Es bleiben fünf Kisten übrig.','trade'],
      ['rice','The first cooking step','instrument','The kitchen can begin one part of dinner while the vegetable delivery is delayed.','Reis zuerst kochen, Gemüse später dazugeben.','Cook rice first, add vegetables later.','Erst Reis, dann Gemüse.','Erst Gemüse, dann auf den Reis warten.','sequence'],
      ['receipts','Three delivery receipts','parcel','Three notes distinguish prepared goods, available space and the landing that actually remains open.','Bestellung fertig, Boot zu klein, mittlerer Steg gesperrt.','Order ready, boat too small, middle landing blocked.','Wir teilen die Ladung und wechseln den Steg.','Wir bestellen alles noch einmal.','memory'],
      ['repair','The landing repair kit','instrument','The workers marked a safe approach beside boards that need replacing.','Bitte den Steg erst nach der Reparatur benutzen.','Please use the landing only after the repair.','Ich warte, bis die Arbeit fertig ist.','Ich laufe während der Reparatur darüber.','repair'],
      ['folder','Chi’s waterproof folder','parcel','A borrowed folder contains a rehearsal timetable with one corrected starting time.','Von Chi geliehen. Nach der Probe zurückgeben.','Borrowed from Chi. Return after rehearsal.','Nach der Probe bringe ich sie zu Chi.','Ich verkaufe sie vor der Probe.','trade'],
      ['rehearsal','The delayed rehearsal','noticeboard','The group chose a later rehearsal so the kitchen and boat crew can join dinner.','Treffen um sieben statt um sechs.','Meeting at seven instead of six.','Das Treffen beginnt eine Stunde später.','Das Treffen beginnt eine Stunde früher.','memory'],
      ['market-scale','The shared weighing table','instrument','A supplier and cook compare quantity rather than assuming every crate weighs the same.','Zwei Kisten wiegen zusammen acht Kilo.','Two crates together weigh eight kilos.','Zusammen sind es acht Kilo.','Jede Kiste wiegt sicher acht Kilo.','trade'],
      ['boat-bell','Linh’s arrival bell','lantern','A bell means the delivery is approaching, while a different sign means collection is ready.','Das Boot kommt an. Abholung erst nach dem Entladen.','The boat is arriving. Collection only after unloading.','Ich warte bis nach dem Entladen.','Ich hole die Kisten vor der Ankunft ab.','sequence'],
      ['garden','Phuc’s kitchen garden','garden','Plant labels connect the supplier’s work to an order the kitchen can change when needed.','Keine Kräuter mehr. Mai kann stattdessen Gemüse nehmen.','No herbs left. Mai can take vegetables instead.','Ich frage Mai nach dem Ersatz.','Ich liefere ohne Erklärung etwas anderes.','dialogue'],
    ], residents: ['Thao','Duc','Lan','Minh','Quynh','Nam','Ngoc','Khanh'],
  },
  {
    id: 'terracielo', name: 'Terracielo', subtitle: 'What exactly was promised?', level: 'B1',
    culture: 'A fictional terrace and lakeside community inspired by Taquile, Peru.', feeling: 'Airy, deliberate and rewarding to climb.',
    description: 'Switchbacks connect shared workspaces, gardens and a lakeside landing. A textile commission succeeds only when a maker, designer and customer agree on what the promise meant.',
    languageFocus: 'Description, comparison, reported speech and revising agreements.',
    cast: [
      ['rosa','Rosa','Textile maker','Rosa makes Ana’s commission from Mateo’s drawing and asks Pilar to confirm the agreed colors.','Ana wollte ein helleres Blau, nicht ein größeres Tuch.','Ana wanted a lighter blue, not a larger cloth.','Wir ändern die Farbe und behalten die Größe.','Wir verdoppeln nur die Größe.'],
      ['mateo','Mateo','Design student','Mateo drew the commission but forgot to label the sample Rosa should follow.','Ich hatte Rosa gesagt, dass die zweite Probe nur ein Versuch sei.','I had told Rosa that the second sample was only a trial.','Die zweite Probe war noch keine endgültige Vorlage.','Die zweite Probe war der bestätigte Auftrag.'],
      ['ana','Ana','Customer and guest teacher','Ana commissioned Rosa’s work and shares a classroom with Elena while visiting.','Mir gefällt das Muster. Nur der Rand sollte schmaler sein.','I like the pattern. Only the border should be narrower.','Wir ändern den Rand und lassen das Muster.','Wir entfernen das ganze Muster.'],
      ['pilar','Pilar','Cooperative coordinator','Pilar keeps Rosa’s agreements and asks Diego to confirm deliveries before accepting payment.','Die Änderung kostet Zeit. Wir sollten zuerst einen neuen Termin vereinbaren.','The change takes time. We should agree on a new date first.','Wir vereinbaren den Termin vor der Zusage.','Wir versprechen sofort denselben Termin.'],
      ['diego','Diego','Landing messenger','Diego brings Pilar’s orders down the switchbacks and exchanges route notes with Luz.','Der obere Weg ist länger, aber die Treppe unten ist gesperrt.','The upper route is longer, but the lower stairs are blocked.','Ich nehme den längeren offenen Weg.','Ich gehe trotzdem über die gesperrte Treppe.'],
      ['elena','Elena','Teacher and garden organizer','Elena teaches with Ana and borrows Tomas’s terrace tool set for a school garden.','Die Werkzeuge gehören Tomas. Die Klasse darf sie bis Freitag benutzen.','The tools belong to Tomas. The class may use them until Friday.','Am Freitag geben wir sie Tomas zurück.','Die Werkzeuge gehören jetzt der Schule.'],
      ['tomas','Tomas','Garden and tool coordinator','Tomas tends the teaching terrace with Elena and repairs the bench Luz uses for sketching.','Luz meinte, die Bank sei locker. Ich habe die Schrauben geprüft.','Luz said the bench was loose. I checked the screws.','Du hast ihre Meldung überprüft.','Luz hat gesagt, die Bank sei neu.'],
      ['luz','Luz','Route illustrator','Luz sketches Diego’s walking routes and shares a terrace bench with Tomas.','Auf der Zeichnung sieht es nah aus. Tatsächlich liegen zwei Treppen dazwischen.','It looks near in the drawing. In fact there are two stairways between.','Die Entfernung allein erklärt den Weg nicht.','Nahe Punkte sind immer direkt erreichbar.'],
    ],
    discoveries: [
      ['samples','The unlabeled textile samples','instrument','Two samples differ in color and border width; only the first was ever approved.','Probe eins bestätigt. Probe zwei nur zum Vergleich.','Sample one approved. Sample two only for comparison.','Die erste Probe ist die vereinbarte Vorlage.','Die zweite Probe ersetzt automatisch die erste.','memory'],
      ['commission','The corrected commission','noticeboard','A careful correction names the change without discarding the parts everyone already likes.','Muster bleibt, Rand schmaler, Blau heller.','Pattern stays, border narrower, blue lighter.','Wir ändern Rand und Farbe.','Wir ersetzen Muster und Größe.','repair'],
      ['delivery','Pilar’s revised deadline','parcel','A new delivery date is needed because the customer’s small-sounding revision takes real work.','Nach der Änderung Lieferung am Freitag statt Mittwoch.','After the change delivery on Friday instead of Wednesday.','Die Lieferung verschiebt sich um zwei Tage.','Die Lieferung kommt zwei Tage früher.','sequence'],
      ['stairs','The closed lower stair','noticeboard','A route note distinguishes straight-line distance from the path a courier can actually walk.','Untere Treppe gesperrt. Obere Terrasse als Umweg nutzen.','Lower stairs blocked. Use upper terrace as a detour.','Ich gehe über die obere Terrasse.','Ich benutze die gesperrte Treppe.','directions'],
      ['tools','The classroom tool loan','instrument','A lending note keeps the class’s garden project connected to the person who owns the tools.','Ausleihe bis Freitag; Rückgabe vollständig.','Loan until Friday; return complete.','Wir zählen die Werkzeuge vor der Rückgabe.','Wir behalten die beliebtesten Werkzeuge.','trade'],
      ['bench','Tomas’s tested terrace bench','garden','A repair record turns a neighbor’s observation into a checked and documented improvement.','Locker gemeldet, Schrauben geprüft, jetzt wieder benutzbar.','Reported loose, screws checked, now usable again.','Die Meldung wurde geprüft und behoben.','Die Bank wurde ohne Prüfung freigegeben.','repair'],
      ['view-map','Luz’s two-stair drawing','noticeboard','A beautiful drawing becomes a useful route map when stairways and access points are added.','Zwei Treppen zwischen Atelier und Steg einzeichnen.','Draw two stairways between studio and landing.','Wir ergänzen die tatsächlichen Verbindungen.','Wir löschen alle Höhenunterschiede.','directions'],
      ['class-invite','Ana’s workshop invitation','noticeboard','A guest lesson remains open to neighbors when the invitation makes attendance conditions clear.','Anmeldung erwünscht, Teilnahme auch ohne eigene Werkzeuge möglich.','Registration requested; participation possible without your own tools.','Ich kann teilnehmen, auch wenn ich keine Werkzeuge habe.','Ohne eigene Werkzeuge darf niemand kommen.','dialogue'],
      ['garden-plan','The teaching terrace plan','garden','Students share responsibility by dividing tasks instead of assigning one person every job.','Elena erklärt, Tomas zeigt die Werkzeuge, die Klasse pflanzt.','Elena explains, Tomas demonstrates tools, the class plants.','Die Aufgaben sind auf drei Beteiligte verteilt.','Tomas soll alles allein erledigen.','sequence'],
      ['receipt','The deposit receipt','parcel','A payment note preserves the original commission while a revised delivery date is discussed.','Anzahlung erhalten. Rest erst nach bestätigter Lieferung.','Deposit received. Balance only after confirmed delivery.','Der Rest wird nach der Lieferung bezahlt.','Der ganze Betrag ist bereits bezahlt.','trade'],
    ], residents: ['Marisol','Luis','Carmen','Javier','Dalia','Hector','Isabel','Pablo'],
  },
  {
    id: 'sunpatch', name: 'Sunpatch', subtitle: 'A wall with room for everyone', level: 'A2',
    culture: 'A fictional contemporary mural and workshop quarter inspired by Oaxaca, Mexico.', feeling: 'Colorful, playful, collaborative and a little argumentative.',
    description: 'Mural lanes connect print rooms, kitchens and repair workshops. A neighborhood painting needs a design that represents its residents and still leaves their delivery entrance usable.',
    languageFocus: 'Suggestions, materials, shared space and reconciling practical needs.',
    cast: [
      ['ines','Inés','Mural coordinator','Inés paints with Pablo and asks Valeria to collect neighbors’ ideas before the final sketch.','Wir brauchen Ideen von allen, bevor wir die Wand bemalen.','We need ideas from everyone before we paint the wall.','Wir sammeln zuerst die Vorschläge.','Wir malen zuerst und fragen später.'],
      ['pablo','Pablo','Printmaker','Pablo shares a wall with Inés but needs the doorway clear for Carmen’s deliveries.','Das Bild darf bunt sein, aber der Eingang muss frei bleiben.','The painting may be colorful, but the entrance must remain clear.','Wir planen das Bild um die Tür herum.','Wir stellen die Leiter dauerhaft vor die Tür.'],
      ['carmen','Carmen','Kitchen cooperative cook','Carmen shares deliveries with Pablo and promised Nico space for the neighborhood meal.','Nico bringt die Tische. Ich kümmere mich um das Essen.','Nico brings the tables. I take care of the food.','Die Aufgaben sind zwischen euch verteilt.','Nico muss auch das ganze Essen kochen.'],
      ['nico','Nico','Furniture repairer','Nico repairs Carmen’s tables and lends Alma a folding chair for the poetry recording.','Der Tisch ist repariert. Bitte erst nach dem Trocknen benutzen.','The table is repaired. Please use only after drying.','Wir warten, bis der Tisch trocken ist.','Wir stellen sofort schwere Töpfe darauf.'],
      ['alma','Alma','Neighborhood poet','Alma records residents with Diego and helps Valeria turn suggestions into a readable poster.','Ich möchte eure Stimmen aufnehmen. Ist das für euch in Ordnung?','I’d like to record your voices. Is that okay with you?','Ja, du darfst meine Stimme aufnehmen.','Eine Aufnahme braucht niemals Zustimmung.'],
      ['diego','Diego','Sound student','Diego records Alma’s readings and needs Luz’s help with a damaged microphone cable.','Das Mikrofon geht, aber das Kabel macht Geräusche.','The microphone works, but the cable makes noise.','Wir prüfen zuerst das Kabel.','Wir werfen das funktionierende Mikrofon weg.'],
      ['luz','Luz','Electronics and bicycle repairer','Luz repairs Diego’s sound gear and exchanges print supplies with Pablo.','Pablo hat mir Papier gebracht. Dafür repariere ich seine Lampe.','Pablo brought me paper. In return I repair his lamp.','Ihr tauscht Material gegen eine Reparatur.','Pablo hat die Lampe verkauft.'],
      ['valeria','Valeria','Student noticeboard editor','Valeria collects suggestions for Inés and checks Alma’s posters with the residents named on them.','Zwei Vorschläge passen zusammen. Wir können beide in den Plan aufnehmen.','Two suggestions fit together. We can include both in the plan.','Wir verbinden die beiden Ideen.','Wir streichen beide Ideen ohne Erklärung.'],
    ],
    discoveries: [
      ['mural','The shared mural sketch','noticeboard','The sketch leaves an entrance open while making space for several neighbors’ visual ideas.','Tür frei lassen. Motive links und rechts verbinden.','Leave door clear. Connect motifs on left and right.','Wir lassen die Tür zugänglich.','Wir malen die Tür zu und blockieren sie.','repair'],
      ['ideas','Valeria’s suggestion box','parcel','The box holds contrasting ideas that can become parts of one larger neighborhood picture.','Vorschläge sammeln, gemeinsam auswählen, dann malen.','Collect suggestions, choose together, then paint.','Sammeln, auswählen, malen.','Malen, auswählen, sammeln.','sequence'],
      ['table','Nico’s drying table','instrument','A repaired folding table still needs time before the community meal can use it.','Leim trocknet bis morgen.','Glue dries until tomorrow.','Wir benutzen den Tisch morgen.','Wir tragen heute schwere Kisten darauf.','repair'],
      ['print','The invitation print plate','instrument','The print studio waits for a confirmed event time before producing the whole neighborhood’s invitations.','Erst Uhrzeit bestätigen, dann alle Einladungen drucken.','Confirm time first, then print all invitations.','Wir prüfen die Uhrzeit vor dem Druck.','Wir drucken mit einem geschätzten Termin.','sequence'],
      ['recording','Alma’s consent cards','noticeboard','Neighbors can join the sound portrait while choosing whether their own voices are recorded.','Aufnahme freiwillig. Bitte vorher fragen.','Recording voluntary. Please ask first.','Darf ich dich aufnehmen?','Ich nehme alle heimlich auf.','dialogue'],
      ['cable','Diego’s noisy cable','instrument','Testing one part of the sound setup avoids replacing the equipment that already works.','Mikrofon funktioniert, Kabel prüfen.','Microphone works, check cable.','Ich teste das Kabel.','Ich tausche zuerst die ganze Anlage.','repair'],
      ['paint','The paint mixing table','instrument','Paint labels preserve a shared color plan across several artists’ separate contributions.','Zwei Teile Blau, ein Teil Weiß.','Two parts blue, one part white.','Ich mische doppelt so viel Blau wie Weiß.','Ich mische doppelt so viel Weiß wie Blau.','trade'],
      ['exchange','Pablo and Luz’s exchange','parcel','A print-paper receipt and repaired lamp explain a reciprocal favor without a cash transaction.','Papier gegen Lampenreparatur.','Paper in exchange for lamp repair.','Beide geben etwas Nützliches.','Nur Pablo bekommt etwas.','memory'],
      ['meal','The community meal roster','garden','A roster distinguishes the people bringing furniture from the people preparing food.','Carmen: Essen. Nico: Tische. Alle: Aufräumen.','Carmen: food. Nico: tables. Everyone: cleanup.','Beim Aufräumen helfen alle.','Carmen räumt allein auf.','sequence'],
      ['game-wall','The picture-and-word wall','noticeboard','A small matching game asks neighbors to connect workshop tools with their German names.','Die Leiter steht neben dem Pinsel, nicht neben dem Mikrofon.','The ladder is next to the brush, not next to the microphone.','Leiter und Pinsel gehören zusammen.','Leiter und Mikrofon gehören zusammen.','memory'],
    ], residents: ['Sofía','Emilio','Julia','Andrés','Teresa','Manuel','Paula','Raúl'],
  },
  {
    id: 'kigalights', name: 'Kigalights', subtitle: 'The hill carries a new signal', level: 'B1',
    culture: 'A fictional hillside creative district inspired by Kigali, Rwanda.', feeling: 'Inventive, sociable and bright with evening possibility.',
    description: 'Stepped studios, roof gardens and a community media room climb a green hillside. A public screening must accommodate a delayed bus, shared equipment and neighbors’ competing schedules.',
    languageFocus: 'Giving reasons, accessibility, compromise and organizing shared resources.',
    cast: [
      ['aline','Aline','Community media producer','Aline edits Eric’s film and relies on Chantal to communicate the screening plan.','Wir verschieben den Beginn, damit auch die Fahrgäste des letzten Busses teilnehmen können.','We are delaying the start so passengers on the last bus can attend too.','Der spätere Beginn ermöglicht mehr Menschen die Teilnahme.','Der spätere Beginn soll Fahrgäste ausschließen.'],
      ['eric','Eric','Filmmaker','Eric filmed Josiane’s garden and promised her a preview before the public screening.','Josiane soll den Film zuerst sehen, weil ihr Garten darin vorkommt.','Josiane should see the film first because her garden appears in it.','Wir zeigen Josiane die Vorschau.','Wir ignorieren die vereinbarte Vorschau.'],
      ['chantal','Chantal','Community notice editor','Chantal publishes Aline’s updated times and coordinates the route with Patrick.','Der alte Aushang ist noch draußen. Wir müssen deutlich auf die Änderung hinweisen.','The old poster is still up. We must clearly indicate the change.','Wir ersetzen den Aushang und markieren die neue Zeit.','Wir hängen einen widersprüchlichen Zettel ohne Erklärung dazu.'],
      ['patrick','Patrick','Accessible route coordinator','Patrick tests hillside approaches with Grace and keeps Chantal’s route arrows current.','Die Treppe ist kürzer, der breite Weg aber ohne Stufen erreichbar.','The stairs are shorter, but the wide path is accessible without steps.','Wir beschreiben beide Wege mit ihren Eigenschaften.','Wir nennen nur die kürzeste Treppe.'],
      ['grace','Grace','Furniture and lighting designer','Grace designs the screening space and shares a battery pack with Samuel.','Samuel braucht den Akku morgen. Heute können wir ihn benutzen, wenn wir ihn danach laden.','Samuel needs the battery tomorrow. We can use it today if we charge it afterward.','Benutzen und anschließend für Samuel aufladen.','Benutzen und leer zurückgeben.'],
      ['samuel','Samuel','Mobile repair technician','Samuel lends Grace the battery and asks Diane to record how much charge remains.','Diane hat den Ladestand geprüft. Wir müssen keinen neuen Akku kaufen.','Diane checked the charge level. We don’t need a new battery.','Der geprüfte Akku reicht aus.','Niemand weiß, ob der Akku geladen ist.'],
      ['diane','Diane','Student equipment keeper','Diane checks Samuel’s battery and labels Aline’s projection cables.','Diese Kabel sehen gleich aus, erfüllen aber verschiedene Aufgaben.','These cables look the same but serve different purposes.','Wir lesen die Beschriftung vor dem Anschließen.','Wir schließen sie beliebig an.'],
      ['josiane','Josiane','Roof garden organizer','Josiane shares her garden story with Eric and invites Patrick to plan the viewing route.','Im Film fehlt noch, dass die Nachbarn den Garten gemeinsam pflegen.','The film still omits that neighbors tend the garden together.','Wir ergänzen die gemeinsame Arbeit.','Wir sagen, Josiane mache alles allein.'],
    ],
    discoveries: [
      ['screening','The revised screening poster','noticeboard','A new start time helps bus passengers join the audience without erasing the original reason for the change.','Beginn 20 Uhr statt 19 Uhr wegen später Busankunft.','Start at 8 instead of 7 pm because of late bus arrival.','Die Vorführung beginnt eine Stunde später.','Die Vorführung beginnt eine Stunde früher.','memory'],
      ['ramp','Patrick’s step-free route','noticeboard','A route diagram offers a longer approach that avoids the hillside stairs.','Breiter Weg ohne Stufen: links um das Studio.','Wide path without steps: left around the studio.','Ich nehme den linken Weg ohne Stufen.','Ich muss unbedingt die Treppe nehmen.','directions'],
      ['battery','The battery borrowing plan','instrument','Tonight’s screening shares power with tomorrow’s repair work under an explicit charging agreement.','Heute nutzen, danach laden, morgen an Samuel zurück.','Use today, charge afterward, return to Samuel tomorrow.','Nutzen, laden, zurückgeben.','Zurückgeben, nutzen, leer lassen.','sequence'],
      ['preview','Josiane’s preview copy','parcel','A preview gives the person whose work appears in a film a chance to correct its account.','Vor der Veröffentlichung Josiane zeigen.','Show Josiane before publication.','Zuerst holen wir ihre Rückmeldung ein.','Wir veröffentlichen vor der vereinbarten Vorschau.','dialogue'],
      ['cables','Diane’s cable labels','instrument','Identical-looking cables carry clear functional labels so the projector does not become a guessing game.','Bildkabel zum Projektor, Ladekabel zum Akku.','Image cable to projector, charging cable to battery.','Wir verbinden nach Funktion und Beschriftung.','Wir entscheiden nur nach der Farbe.','repair'],
      ['garden','The roof garden credit','garden','The film credit names the neighbors whose shared effort made the rooftop garden possible.','Gepflegt von Josiane und der Nachbarschaft.','Tended by Josiane and the neighborhood.','Der Garten ist gemeinschaftliche Arbeit.','Der Garten gehört zur Arbeit einer einzigen Person.','memory'],
      ['seating','Grace’s flexible seating plan','instrument','Movable benches leave a clear passage while accommodating several groups of viewers.','Mittelgang frei halten, Bänke seitlich aufstellen.','Keep central aisle clear, put benches at the sides.','Wir halten den Durchgang offen.','Wir stellen alle Bänke in den Mittelgang.','directions'],
      ['bus','The final bus message','noticeboard','A timestamp distinguishes the confirmed bus arrival from an earlier estimate circulating among residents.','Bestätigte Ankunft 19:30. Frühere Schätzung bitte ersetzen.','Confirmed arrival 7:30 pm. Please replace earlier estimate.','Wir verwenden die bestätigte Zeit.','Wir benutzen weiterhin die alte Schätzung.','memory'],
      ['repair-desk','The community repair signup','noticeboard','A signup sheet lets residents describe a fault before reserving Samuel’s limited workshop time.','Problem beschreiben, Termin wählen, Gerät mitbringen.','Describe problem, choose appointment, bring device.','Ich beschreibe zuerst den Fehler.','Ich buche ohne Angaben jeden Termin.','sequence'],
      ['signal','The hill’s welcome signal','lantern','A lamp at the open approach tells arriving viewers which studio entrance is ready.','Grünes Licht: Eingang offen. Gelbes Licht: bitte warten.','Green light: entrance open. Yellow light: please wait.','Bei Gelb warte ich.','Bei Gelb betrete ich sofort den Raum.','memory'],
    ], residents: ['Claudine','Jean','Sandrine','Claude','Nadine','Olivier','Beatrice','David'],
  },
  {
    id: 'cedarbay', name: 'Cedar Bay', subtitle: 'A garden between two journeys', level: 'A2',
    culture: 'A fictional canal garden neighborhood inspired by Kerala, India.', feeling: 'Lush, reflective and quietly busy beside the water.',
    description: 'Canal paths weave among garden plots, homes and a small reading room. A shared boat connects errands with an evening reading that depends on a borrowed lamp and changing weather.',
    languageFocus: 'Conditions, borrowing, transport times and planning around weather.',
    cast: [
      ['meera','Meera','Reading room organizer','Meera hosts Ravi’s evening reading and borrows Anjali’s battery lamp.','Wenn es regnet, lesen wir im Leseraum statt im Garten.','If it rains, we read in the reading room instead of the garden.','Bei Regen gehen wir in den Leseraum.','Bei Regen bleiben alle Bücher draußen.'],
      ['ravi','Ravi','Writer and workshop teacher','Ravi reads at Meera’s event and asks Nila to select neighborhood questions.','Nila sammelt Fragen. Ich antworte nach dem Lesen.','Nila collects questions. I answer after the reading.','Die Fragen kommen nach dem Lesen.','Die Antworten kommen vor jeder Frage.'],
      ['anjali','Anjali','Lamp and electronics repairer','Anjali lends Meera a lamp and asks Arun to bring it back charged.','Die Lampe ist geliehen. Bitte mit vollem Akku zurückbringen.','The lamp is borrowed. Please return it with a full battery.','Ich lade die Lampe vor der Rückgabe.','Ich behalte die Lampe dauerhaft.'],
      ['arun','Arun','Shared boat driver','Arun collects Meera’s guests and transports Dev’s garden supplies on the return trip.','Auf der Hinfahrt kommen Gäste mit, auf der Rückfahrt die Pflanzen.','Guests travel out, plants travel back.','Die Pflanzen fahren auf dem Rückweg mit.','Die Pflanzen verdrängen die Gäste auf der Hinfahrt.'],
      ['dev','Dev','Garden cooperative grower','Dev shares garden supplies with Latha and waits for Arun’s return trip.','Latha braucht drei Pflanzen. Ich habe fünf vorbereitet.','Latha needs three plants. I prepared five.','Zwei Pflanzen bleiben übrig.','Es fehlt noch eine Pflanze.'],
      ['latha','Latha','Community kitchen gardener','Latha grows ingredients with Dev and prepares a meal for Farah’s visitors.','Die Kräuter sind für die Küche, nicht für die Dekoration.','The herbs are for the kitchen, not decoration.','Ich bringe die Kräuter in die Küche.','Ich hänge alle Kräuter an die Wand.'],
      ['farah','Farah','Guesthouse and neighborhood host','Farah sends guests to Meera’s reading and checks their boat times with Arun.','Meine Gäste müssen vor der letzten Fahrt zurück sein.','My guests need to be back before the last trip.','Wir prüfen die letzte Abfahrt.','Wir kümmern uns erst nach der letzten Fahrt.'],
      ['nila','Nila','Student question collector','Nila collects questions for Ravi and helps Farah write clearer guest instructions.','Ein Gast fragt, ob der Garten auch bei Regen offen bleibt.','A guest asks whether the garden stays open in rain too.','Wir erklären den Wechsel in den Leseraum.','Wir sagen, das Wetter sei immer gleich.'],
    ],
    discoveries: [
      ['reading','The rain-location invitation','noticeboard','The reading invitation names both an outdoor setting and the covered alternative.','Trocken: Garten. Regen: Leseraum.','Dry: garden. Rain: reading room.','Bei Regen findet das Lesen drinnen statt.','Bei Regen findet das Lesen im Garten statt.','directions'],
      ['lamp','Anjali’s borrowed lamp','lantern','A lamp connects the reading room to tomorrow’s electronics work through a charging promise.','Geliehen bis morgen. Bitte geladen zurückgeben.','Borrowed until tomorrow. Please return charged.','Laden und morgen zurückgeben.','Leer behalten und nicht zurückgeben.','sequence'],
      ['boat','Arun’s two-way boat plan','noticeboard','The boat carries people on one leg and garden supplies on the other, using the same trip efficiently.','Hin Gäste, zurück Pflanzen.','Out guests, back plants.','Die Pflanzen kommen auf der Rückfahrt.','Die Gäste kommen erst mit den Pflanzen zurück.','memory'],
      ['plants','Dev’s five plants','garden','A garden order provides a small arithmetic problem with a practical surplus to redistribute.','Fünf vorbereitet, drei bestellt.','Five prepared, three ordered.','Zwei bleiben für andere Nachbarn.','Drei weitere werden benötigt.','trade'],
      ['herbs','The kitchen herb basket','parcel','A labeled basket keeps ingredients from being mistaken for the event’s decorative greenery.','Für Lathas Küche. Bitte nicht als Schmuck verwenden.','For Latha’s kitchen. Please don’t use as decoration.','Ich bringe den Korb zu Latha.','Ich verteile den Korb als Dekoration.','trade'],
      ['questions','Nila’s question cards','noticeboard','Question cards turn a reading into a conversation after the author finishes the text.','Fragen sammeln und nach dem Lesen stellen.','Collect questions and ask after the reading.','Zuerst hören wir den Text.','Wir unterbrechen jeden Satz mit allen Fragen.','sequence'],
      ['last-trip','The final boat time','clock','Guest instructions give a firm final departure instead of a vague invitation to return eventually.','Letzte Rückfahrt um 21 Uhr. Zehn Minuten vorher am Steg.','Last return at 9 pm. At the landing ten minutes before.','Wir sind um 20:50 am Steg.','Wir sind um 21:10 am Steg.','memory'],
      ['repair','The lamp repair diary','instrument','Anjali’s notes explain why a fully charged lamp matters even after its switch has been repaired.','Schalter repariert, Akku vor Benutzung laden.','Switch repaired, charge battery before use.','Wir laden vor dem Einschalten.','Die Reparatur macht Laden überflüssig.','repair'],
      ['bridge','The narrow garden crossing','noticeboard','A crossing note coordinates pedestrians and plant crates along a narrow canal bridge.','Erst Fußgänger, dann Transportwagen.','Pedestrians first, then transport cart.','Der Wagen wartet auf die Fußgänger.','Der Wagen fährt zwischen die Fußgänger.','sequence'],
      ['books','The canal book exchange','parcel','Neighbors exchange books without confusing borrowing with ownership.','Ausleihen oder tauschen? Bitte auf der Karte markieren.','Borrow or exchange? Please mark on the card.','Ich markiere, ob ich das Buch zurückbringe.','Ich nehme das Buch ohne eine Angabe.','dialogue'],
    ], residents: ['Priya','Kiran','Deepa','Sajid','Malini','Vivek','Tara','Rohan'],
  },
  {
    id: 'seoulsteps', name: 'Seoul Steps', subtitle: 'The roof above your address', level: 'B1',
    culture: 'A fictional contemporary rooftop and hillside neighborhood inspired by Seoul, South Korea.', feeling: 'Layered, energetic and unexpectedly spacious above the stairs.',
    description: 'Rooftop gardens and compact studios stack above stepped lanes. A shared rooftop gathering exposes mismatched addresses, overlapping schedules and a creative solution to limited space.',
    languageFocus: 'Clarifying location, reported requests, negotiation and shared schedules.',
    cast: [
      ['minji','Minji','Rooftop garden organizer','Minji shares the roof with Jisoo’s laundry space and asks Hana to plan the gathering.','Jisoo braucht die Leine bis sechs. Danach können wir die Tische aufstellen.','Jisoo needs the washing line until six. Afterward we can set up tables.','Wir warten bis sechs mit den Tischen.','Wir entfernen die Wäsche vor sechs.'],
      ['jisoo','Jisoo','Clothing repairer','Jisoo repairs Dae’s jacket and uses Minji’s rooftop during the afternoon.','Ich hatte Hana gesagt, dass die Fläche am Nachmittag noch gebraucht wird.','I had told Hana that the area would still be needed in the afternoon.','Die Fläche ist erst später verfügbar.','Die Fläche war für den ganzen Tag frei.'],
      ['hana','Hana','Neighborhood gathering planner','Hana coordinates Minji’s roof with Soo’s rehearsal and Joon’s deliveries.','Wenn Soo früher probt, können wir den Abend gemeinsam nutzen.','If Soo rehearses earlier, we can share the evening.','Wir fragen Soo nach einer früheren Probe.','Wir streichen Soos Probe ohne Gespräch.'],
      ['soo','Soo','Music student','Soo rehearses beside Eun’s studio and needs agreement on a quiet ending time.','Ich kann die Probe vorziehen, solange Eun mit dem neuen Termin einverstanden ist.','I can bring rehearsal forward as long as Eun agrees with the new time.','Wir holen Euns Zustimmung zum Termin ein.','Euns Termin spielt keine Rolle.'],
      ['eun','Eun','Audio editor','Eun records Dae’s interview and shares a wall with Soo’s practice room.','Für die Aufnahme brauchen wir eine ruhige Stunde. Danach darf Soo proben.','For the recording we need one quiet hour. Afterward Soo can rehearse.','Erst Aufnahme, dann Probe.','Probe und Aufnahme müssen gleichzeitig stattfinden.'],
      ['dae','Dae','Neighborhood interviewer','Dae interviews Eun’s neighbors and asks Minji to explain the roof garden’s shared history.','Die Dachterrasse gehört nicht nur einer Wohnung. Mehrere Haushalte nutzen sie.','The roof terrace doesn’t belong to just one apartment. Several households use it.','Wir berücksichtigen alle beteiligten Haushalte.','Eine Person entscheidet allein über die ganze Terrasse.'],
      ['joon','Joon','Delivery cooperative rider','Joon delivers Hana’s tables but needs Yuna’s help distinguishing front-door and rooftop addresses.','Die Hausnummer stimmt, aber ich bin am falschen Eingang.','The house number is correct, but I’m at the wrong entrance.','Wir klären, welcher Eingang zur Terrasse führt.','Eine richtige Nummer garantiert den richtigen Eingang.'],
      ['yuna','Yuna','Wayfinding design student','Yuna labels rooftop access for Joon and checks the arrows with Dae’s residents.','Das Schild sollte Stockwerk und Eingang nennen, nicht nur die Hausnummer.','The sign should name floor and entrance, not just the house number.','Wir ergänzen Stockwerk und Eingang.','Wir entfernen die letzte Ortsangabe.'],
    ],
    discoveries: [
      ['roof','The shared rooftop calendar','noticeboard','The calendar fits laundry, rehearsals and a neighborhood gathering into one limited rooftop space.','Bis 18 Uhr Wäsche, ab 18 Uhr Tische.','Laundry until 6 pm, tables from 6 pm.','Die Tische werden nach der Wäsche aufgebaut.','Die Tische stehen während der reservierten Wäschezeit.','sequence'],
      ['address','The almost-correct address','noticeboard','A correct house number still needs a floor and entrance to become a useful delivery instruction.','Nummer 12, oberer Eingang, Dachterrasse.','Number 12, upper entrance, roof terrace.','Ich suche den oberen Eingang zur Terrasse.','Ich warte am unteren Kellereingang.','directions'],
      ['sound','Eun’s quiet recording slot','clock','A quiet recording window coordinates two neighbors’ different uses of sound equipment.','Aufnahme 15–16 Uhr. Probe danach.','Recording 3–4 pm. Rehearsal afterward.','Soo probt nach vier.','Soo beginnt während der Aufnahme um drei.','memory'],
      ['tables','The folding-table delivery','parcel','Tables can travel up the stairs only after the rooftop’s earlier use is finished.','Vor dem Aufbau Verfügbarkeit der Dachfläche bestätigen.','Confirm availability of roof space before setup.','Wir prüfen zuerst, ob die Fläche frei ist.','Wir bauen auf und fragen anschließend.','sequence'],
      ['garden','The rooftop watering roster','garden','Several households take turns keeping the terrace garden alive despite different work schedules.','Minji Montag, Jisoo Mittwoch, Hana Freitag.','Minji Monday, Jisoo Wednesday, Hana Friday.','Am Mittwoch ist Jisoo zuständig.','Am Mittwoch ist ausschließlich Hana zuständig.','memory'],
      ['jacket','Dae’s repaired jacket','instrument','A repair label makes clear that changing one broken fastener does not mean replacing the entire garment.','Reißverschluss ersetzt, Stoff beibehalten.','Zip replaced, fabric retained.','Die Jacke wurde gezielt repariert.','Die ganze Jacke wurde neu gekauft.','repair'],
      ['request','Soo’s proposed rehearsal change','noticeboard','The rehearsal proposal remains conditional until the neighboring studio agrees.','Frühere Probe möglich, wenn Eun zustimmt.','Earlier rehearsal possible if Eun agrees.','Der neue Termin braucht noch Euns Zustimmung.','Der neue Termin ist bereits ohne Bedingung bestätigt.','dialogue'],
      ['arrows','Yuna’s entrance arrows','noticeboard','A direction game tests left, upstairs and the distinction between an entrance and a destination.','Links die Treppe hoch, dann rechts zur Dachterrasse.','Up the stairs on the left, then right to the roof terrace.','Links hinauf, dann rechts.','Rechts hinunter, dann links.','directions'],
      ['interview','Dae’s neighborhood credit','instrument','The interview notes acknowledge shared care instead of attributing the rooftop to one visible organizer.','Mehrere Haushalte pflegen und nutzen die Terrasse.','Several households tend and use the terrace.','Wir nennen die gemeinsame Verantwortung.','Wir beschreiben eine private Terrasse nur für Dae.','memory'],
      ['clean-up','The last rooftop task','garden','A final agreement makes restoring the shared space part of hosting the gathering.','Nach dem Treffen Tische abbauen und Wege freihalten.','After the gathering dismantle tables and keep paths clear.','Wir geben die Fläche nach dem Treffen frei.','Wir lassen die Tische dauerhaft im Durchgang.','sequence'],
    ], residents: ['Hyejin','Minho','Seoyeon','Taeyang','Nari','Hyun','Bora','Woojin'],
  },
  {
    id: 'dunegarden', name: 'Dune Garden', subtitle: 'The water arrives by agreement', level: 'A2',
    culture: 'A fictional oasis garden neighborhood inspired by Oman.', feeling: 'Cool shade, patient rhythms and bright open sky.',
    description: 'Irrigation walks connect palms, homes and a repair yard. Neighbors share water by schedule while a faulty gate turns a simple allocation into a conversation about fairness and responsibility.',
    languageFocus: 'Duration, allocation, fairness, cause and practical repair plans.',
    cast: [
      ['maryam','Maryam','Garden schedule keeper','Maryam coordinates water times with Salim and asks Noura to post the agreed changes.','Salim bekommt Wasser bis zehn, danach ist Huda an der Reihe.','Salim gets water until ten, afterward it is Huda’s turn.','Ab zehn bekommt Huda Wasser.','Salim behält das Wasser bis morgen.'],
      ['salim','Salim','Garden cooperative grower','Salim shares a channel with Huda and alerts Khalid when the gate will not close.','Mein Zeitfenster ist vorbei, aber das Tor schließt nicht.','My time window is over, but the gate won’t close.','Wir melden den Fehler und stellen die Verteilung wieder her.','Wir tun so, als gehöre das ganze Wasser Salim.'],
      ['huda','Huda','Kitchen garden organizer','Huda waits for Salim’s gate repair and shares seedlings with Aisha.','Ich habe gewartet. Können wir die verlorene Zeit später ausgleichen?','I waited. Can we make up the lost time later?','Wir vereinbaren einen fairen Ersatztermin.','Deine verlorene Zeit zählt nicht.'],
      ['khalid','Khalid','Pump and gate repairer','Khalid repairs Salim’s gate with apprentice Saif and reports to Maryam.','Saif prüft den Hebel. Ich kontrolliere danach die Dichtung.','Saif checks the lever. I check the seal afterward.','Zuerst Hebel, dann Dichtung.','Zuerst behaupten wir, alles sei repariert.'],
      ['saif','Saif','Repair apprentice','Saif learns from Khalid and borrows Noura’s camera to document the faulty part.','Das Foto zeigt den Fehler vor der Reparatur. Danach machen wir ein neues.','The photo shows the fault before repair. Afterward we take a new one.','Wir vergleichen vor und nach der Reparatur.','Ein altes Foto beweist eine neue Reparatur.'],
      ['noura','Noura','Neighborhood notice designer','Noura posts Maryam’s schedule and helps Saif label repair photos with times.','Wir müssen die Änderung erklären, damit Huda ihren neuen Termin kennt.','We must explain the change so Huda knows her new time.','Wir veröffentlichen Grund und neuen Termin.','Wir ändern die Uhrzeit ohne Hinweis.'],
      ['aisha','Aisha','Seedling exchange organizer','Aisha swaps plants with Huda and asks Hamad to bring shade cloth to the shared beds.','Huda bekommt vier Pflanzen und bringt morgen vier Töpfe zurück.','Huda gets four plants and returns four pots tomorrow.','Die Töpfe kommen morgen zu Aisha zurück.','Die Pflanzen müssen sofort weggeworfen werden.'],
      ['hamad','Hamad','Shade and furniture repairer','Hamad repairs Aisha’s garden shade and lends Noura a ladder for posting notices.','Das Tuch ist befestigt. Die Leiter kann jetzt zu Noura.','The cloth is secured. The ladder can now go to Noura.','Noura kann die Leiter jetzt benutzen.','Die Leiter muss während jeder Arbeit bei Hamad bleiben.'],
    ],
    discoveries: [
      ['schedule','Maryam’s water schedule','noticeboard','A clear schedule makes neighboring garden plots part of an agreed shared resource.','Salim 9–10 Uhr, Huda 10–11 Uhr.','Salim 9–10 am, Huda 10–11 am.','Um halb elf ist Huda an der Reihe.','Um halb elf ist noch Salim an der Reihe.','memory'],
      ['gate','The stubborn irrigation gate','instrument','A stuck gate explains a delay without turning a mechanical fault into a personal accusation.','Tor klemmt. Reparatur nötig, bevor der Plan wieder gilt.','Gate stuck. Repair needed before the plan applies again.','Wir reparieren das Tor und klären den Ersatz.','Wir beschuldigen Huda ohne Prüfung.','repair'],
      ['compensation','Huda’s replacement slot','clock','The new allocation restores time lost while a shared water gate was being repaired.','Verlorene halbe Stunde später ausgleichen.','Make up lost half-hour later.','Huda bekommt später dreißig Minuten.','Huda bekommt später nur fünf Minuten.','trade'],
      ['repair','Khalid’s gate checklist','instrument','The checklist turns two people’s complementary repair tasks into a clear sequence.','Hebel prüfen, Dichtung prüfen, Tor testen.','Check lever, check seal, test gate.','Prüfen, prüfen, testen.','Benutzen, behaupten, weggehen.','sequence'],
      ['photos','Saif’s before-and-after photos','noticeboard','Dated photographs make a repair record useful to people who did not witness the work.','Links vor der Reparatur, rechts nach der Reparatur.','Left before repair, right after repair.','Ich vergleiche den Zustand vorher und nachher.','Beide Bilder zeigen nur die Zukunft.','memory'],
      ['seedlings','Aisha’s four borrowed pots','garden','The seedling exchange includes a practical promise to return reusable containers.','Vier Pflanzen erhalten. Vier Töpfe morgen zurück.','Four plants received. Four pots back tomorrow.','Ich gebe morgen vier Töpfe zurück.','Ich gebe morgen nur eine Pflanze zurück.','trade'],
      ['shade','Hamad’s shade cloth','instrument','The secured shade cloth frees a ladder for the next person’s neighborhood task.','Tuch befestigt. Leiter für Noura freigeben.','Cloth secured. Release ladder for Noura.','Ich bringe Noura die Leiter.','Ich verstecke die Leiter im Garten.','sequence'],
      ['change','Noura’s explained correction','noticeboard','A corrected notice includes the cause and new allocation so it can be understood fairly.','Neuer Termin wegen Reparatur, nicht wegen einer neuen Bestellung.','New time because of repair, not because of a new order.','Die Reparatur erklärt die Änderung.','Huda hat heimlich doppelt bestellt.','dialogue'],
      ['well','The garden water marker','fountain','A water-level marker lets residents compare an observed condition before making a plan.','Stand niedriger als gestern. Bitte Bedarf gemeinsam prüfen.','Level lower than yesterday. Please check needs together.','Wir vergleichen Bedarf und verfügbares Wasser.','Wir erhöhen jeden Bedarf ohne Prüfung.','trade'],
      ['meeting','The garden agreement table','garden','Neighbors settle the repair and replacement allocation at the same shared table.','Erst Fehler klären, dann Ersatzzeit vereinbaren.','Clarify fault first, then agree replacement time.','Wir verbinden Erklärung mit einer Lösung.','Wir erklären nichts und ändern alle Termine.','dialogue'],
    ], residents: ['Fatma','Ahmed','Amira','Yasir','Latifa','Omar','Reem','Faisal'],
  },
];

const avatars = [
  { hair: '#25212c', skin: '#9f6948', outfit: '#337e83' },
  { hair: '#3b2922', skin: '#c88c68', outfit: '#bd665a' },
  { hair: '#b8b0a6', skin: '#d8a07b', outfit: '#64779c' },
  { hair: '#1f2529', skin: '#77503d', outfit: '#b08c45' },
];

/** Plausible misreadings with feedback on the exact time, referent or condition. */
const encounterClarifications: Readonly<Record<string, readonly [distractor: string, correctFeedback: string, correction: string]>> = {
  'saffroncourt-encounter-salma': ['Ich bringe es vor das blaue Tor.', 'The blue gate is the right landmark; “hinter” puts Youssef’s workshop behind it. Your delivery can reach the workshop.', '“Hinter dem blauen Tor” means behind the blue gate. “Vor” would leave the parcel on the other side of that landmark.'],
  'saffroncourt-encounter-leila': ['Ich besuche Karim und danach Salma.', '“Zuerst” names Salma as the first stop; “dann” sends the next delivery to Karim.', 'Both neighbors are on the route, but the order matters: Salma first, Karim afterward.'],
  'saffroncourt-encounter-bench': ['Karim gießt morgens, Amina abends.', 'You kept the two people and their times together: Amina in the morning, Karim in the evening. Both contribute to the garden.', 'The schedule does name both gardeners, but this reply exchanges their times. Amina waters in the morning; Karim waters in the evening.'],
  'saffroncourt-encounter-parcel': ['Das Paket gehört Sami.', 'The label says “Für Salma”. The similar names no longer send the parcel to the wrong neighbor.', '“Nicht für Sami” excludes Sami. Read the full name after “für”: the parcel is intended for Salma.'],
  'rainmarket-encounter-side-door': ['Ich hole es um neun Uhr abends hinten ab.', 'Seven in the evening is inside the 18–20 collection window, and “hinten” identifies the back entrance.', 'The back entrance allows collection only until 20 Uhr. “Ab 9 Uhr” refers to sales tomorrow, not collection tonight at 21 Uhr.'],
  'rainmarket-encounter-event-board': ['Nach zehn räumen wir auf, während die Musik weiterläuft.', '“Danach nur Aufräumen” ends the music at ten. Cleanup remains possible without extending the concert.', 'The notice permits only cleanup after 22 Uhr. Moving into cleanup does not extend the music’s agreed ending time.'],
  'rainmarket-encounter-quiet-stairs': ['Nach zehn sprechen wir auf der Treppe wie tagsüber.', 'You preserve the residents’ request: after ten, voices on the stairs become quieter.', '“Nach 22 Uhr bitte leise sprechen” changes how you speak after ten. Using the same volume as during the day misses that request.'],
  'rainmarket-encounter-invitation': ['Wir drucken die Einladung und ergänzen den Ort danach von Hand.', 'Adding place and ending time before printing gives every invitation the agreed information.', '“Bevor wir die Einladung drucken” puts both additions before printing. Adding a location afterward reverses the requested sequence and still leaves the ending time unresolved.'],
  'windplain-encounter-address': ['Morgen suche ich die Familie noch am Brunnen.', 'Today’s visit uses the well; tomorrow’s address changes to east of the hill. You kept the date attached to the place.', '“Ab morgen” starts the new address tomorrow. The old well remains correct today, not tomorrow.'],
  'windplain-encounter-radio': ['Wir prüfen die Uhrzeiten, folgen aber weiterhin der alten Nachricht.', 'Today’s message replaces the old one. Its timestamp gives the camp one current plan to follow.', '“Die alte gilt nicht mehr” explicitly withdraws the older message. Checking dates but following that message still uses an outdated plan.'],
  'windplain-encounter-solar': ['Ab zwölf hat Bat den Akku weiter, bis er fertig ist.', 'At one, it is already after noon: Erdene’s charging window has started and Bat’s has ended.', 'The allocation says “Bat bis zwölf, Erdene ab zwölf”. It gives Bat a time limit, rather than an open-ended right to finish later.'],
  'windplain-encounter-weather': ['Wir nehmen den kürzeren Weg, obwohl er noch nass ist.', 'The instruction is specific to the loaded vehicle: use the dry route even though it is longer.', 'A shorter distance is a real advantage, but the message asks the loaded vehicle to take the dry path. The wet shortcut does not satisfy that instruction.'],
  'riverweave-encounter-order': ['Zehn Kisten fahren mit, eine bleibt für die zweite Fahrt.', 'Twelve ordered crates minus ten available spaces leaves two crates for another trip.', 'Your first load uses all ten spaces, but twelve minus ten is two. Leaving only one crate out does not account for the full order.'],
  'riverweave-encounter-rice': ['Wir warten auf das Gemüse und beginnen dann mit dem Reis.', 'Rice preparation can begin before the vegetables arrive. “Später dazugeben” puts the vegetables into the later step.', '“Reis zuerst kochen” asks you to start with rice. Waiting for the vegetables delays the step the kitchen can already do.'],
  'riverweave-encounter-receipts': ['Wir wechseln den Steg und laden alle Kisten auf dieselbe Fahrt.', 'Splitting the load resolves the small boat; moving to an open landing resolves the blocked middle stage.', 'Changing the landing addresses the closure, but it does not make the boat larger. The notes require a solution for both the landing and the load.'],
  'riverweave-encounter-rehearsal': ['Das Treffen beginnt um sechs, die übrigen Gäste kommen um sieben.', '“Um sieben statt um sechs” replaces the meeting time for the group. Everyone can work from the same revised start.', '“Statt” means instead of. The message changes the meeting to seven; it does not create an early start at six for part of the group.'],
  'terracielo-encounter-samples': ['Die zweite Probe gilt jetzt, weil sie zum Vergleich gezeigt wurde.', 'The first sample has been approved. Showing another sample for comparison does not approve it as the final commission.', '“Nur zum Vergleich” gives sample two a limited purpose. Only sample one is marked “bestätigt”, so the second is not automatically the agreed template.'],
  'terracielo-encounter-commission': ['Wir machen den Rand schmaler und ersetzen auch das Muster.', 'The revision changes border width and blue shade while preserving the approved pattern.', '“Muster bleibt” explicitly preserves the pattern. Narrowing the border is requested; replacing the pattern adds a change that was not agreed.'],
  'terracielo-encounter-delivery': ['Die Änderung ist klein, deshalb bleibt Mittwoch der Liefertermin.', '“Freitag statt Mittwoch” confirms a replacement date two days later, accounting for the revision.', 'The note already changes delivery to Friday. Judging the revision small does not restore the earlier Wednesday deadline.'],
  'terracielo-encounter-receipt': ['Die Anzahlung ist da, also bezahlen wir den Rest vor der Lieferung.', 'The deposit is recorded, while the remaining payment waits for confirmed delivery.', '“Rest erst nach bestätigter Lieferung” makes delivery confirmation a condition for the balance. Receiving a deposit does not remove that condition.'],
  'sunpatch-encounter-mural': ['Wir verbinden die Motive direkt über die Türöffnung.', 'The picture connects the two sides while keeping the door usable, honoring both the design and access requirement.', '“Tür frei lassen” must hold alongside “Motive links und rechts verbinden”. Connecting the artwork cannot occupy the door opening.'],
  'sunpatch-encounter-recording': ['Wer beim Treffen bleibt, stimmt automatisch der Aufnahme zu.', 'Asking permission respects the voluntary recording arrangement; attendance and consent remain separate choices.', '“Aufnahme freiwillig” and “vorher fragen” require an explicit question before recording. Remaining at the gathering does not supply that permission.'],
  'sunpatch-encounter-paint': ['Ich nehme zwei Teile Weiß und einen Teil Blau.', 'The recipe uses blue as the larger share: two parts blue to one part white.', 'The quantities are correct but attached to the wrong colors. “Zwei Teile Blau” makes blue twice the white amount.'],
  'sunpatch-encounter-meal': ['Carmen und Nico räumen auf, die anderen gehen nach dem Essen.', '“Alle: Aufräumen” distributes cleanup beyond the people already responsible for food and tables.', 'Carmen has food and Nico has tables, but the last assignment is “Alle”. Giving cleanup only to those two overlooks the shared task.'],
  'kigalights-encounter-ramp': ['Ich nehme die kürzere Treppe als Weg ohne Stufen.', 'The left-hand route around the studio provides the stated approach without steps.', 'The shorter stairs and the step-free route are different alternatives. “Ohne Stufen” refers to the wide path left around the studio, not the staircase.'],
  'kigalights-encounter-battery': ['Heute benutzen und morgen vor dem Laden an Samuel zurückgeben.', 'Charging follows today’s use and precedes tomorrow’s return, so the borrowing agreement includes the battery’s condition.', '“Danach laden, morgen ... zurück” puts charging before return. Returning first leaves that part of the agreement unfulfilled.'],
  'kigalights-encounter-preview': ['Wir veröffentlichen den Film und zeigen Josiane danach die Vorschau.', 'Josiane sees the preview while changes can still be considered before publication.', '“Vor der Veröffentlichung” determines the timing. A screening for Josiane after publication cannot fulfill the agreed preview.'],
  'kigalights-encounter-bus': ['Wir behalten die frühere Schätzung, weil sie schon auf dem Aushang steht.', 'The confirmed 19:30 arrival replaces the earlier estimate, even if the older time has already circulated.', 'The notice says “Bestätigte Ankunft” and asks you to replace the earlier estimate. Being printed first does not make that estimate current.'],
  'cedarbay-encounter-reading': ['Bei Regen bleiben wir im Garten, aber beginnen später.', 'The weather condition changes the location to the reading room; it does not merely delay the garden reading.', 'The two locations are paired with two weather conditions: “Regen: Leseraum”. A later outdoor start is not the announced rain plan.'],
  'cedarbay-encounter-lamp': ['Ich gebe die Lampe morgen zurück und lade sie danach.', 'Charging before tomorrow’s return honors both the return time and the requested battery condition.', '“Bitte geladen zurückgeben” describes the lamp’s condition at return. Charging afterward reverses that obligation.'],
  'cedarbay-encounter-last-trip': ['Wir sind um 20:50 unterwegs und kommen um 21 Uhr am Steg an.', 'Arriving at 20:50 gives the requested ten minutes before the 21:00 final departure.', '“Zehn Minuten vorher am Steg” means already at the landing ten minutes before departure. Being on the way at 20:50 is not the same arrival time.'],
  'cedarbay-encounter-books': ['Ich markiere einen Tausch und bringe das ausgeliehene Buch später zurück.', 'The card makes clear whether the book will return as a loan or change hands in an exchange.', '“Ausleihen oder tauschen?” distinguishes two arrangements. Marking an exchange while describing a loan leaves the return obligation unclear.'],
  'seoulsteps-encounter-roof': ['Wir stellen die Tische um fünf auf und lassen Platz für die Wäsche.', 'Table setup begins at six, when the laundry allocation ends; the rooftop schedule stays consistent.', 'Leaving some room may sound considerate, but “ab 18 Uhr Tische” starts table use at six. The roof is still allocated to laundry at five.'],
  'seoulsteps-encounter-address': ['Nummer 12 stimmt, deshalb warte ich am unteren Eingang.', 'The complete address identifies number 12, its upper entrance and the roof terrace as the destination.', 'The house number is only one part of the address. “Oberer Eingang” distinguishes the required access from the lower entrance.'],
  'seoulsteps-encounter-request': ['Soo kann früher proben, weil die neue Zeit schon möglich ist.', 'The earlier time is possible only if Eun agrees. Asking Eun turns an option into a shared arrangement.', '“Möglich, wenn Eun zustimmt” expresses a condition. Possibility alone does not mean Eun’s consent has already been obtained.'],
  'seoulsteps-encounter-interview': ['Minji organisiert den Garten, deshalb nennen wir nur ihre Verantwortung.', 'Naming the shared responsibility reflects the households that both care for and use the terrace.', 'A visible organizer may help explain the garden, but “mehrere Haushalte pflegen und nutzen” describes shared work. Crediting only Minji omits that information.'],
  'dunegarden-encounter-schedule': ['Um halb elf hat Salim Wasser, denn sein Termin beginnt um neun.', 'Half past ten falls inside Huda’s 10–11 window, after Salim’s allocation ends.', 'Salim’s starting time does not give an unlimited allocation. “9–10 Uhr” ends at ten; at 10:30 it is Huda’s turn.'],
  'dunegarden-encounter-compensation': ['Huda bekommt später eine Viertelstunde als Ersatz.', 'A half-hour is thirty minutes. The replacement preserves the full amount of lost time.', 'A quarter-hour is fifteen minutes, while “halbe Stunde” is thirty. This proposal replaces only half the stated loss.'],
  'dunegarden-encounter-change': ['Wir ändern den Termin, weil Huda mehr Wasser bestellt hat.', 'The schedule change is attributed to the repair, without assigning Huda a new request she did not make.', '“Wegen Reparatur, nicht wegen einer neuen Bestellung” distinguishes the cause explicitly. A larger order is the explanation the note rules out.'],
  'dunegarden-encounter-shade': ['Noura bekommt die Leiter, sobald das Tuch später befestigt ist.', '“Tuch befestigt” records a finished task. The ladder can now be released for Noura’s notice work.', 'The first sentence already says the cloth is secured. Treating it as future work delays a ladder the note says can be released now.'],
};

function makeEncounter(id: string, title: string, german: string, translation: string, answer: string, distractor: string, languageFocus: string, difficulty: Level, gameKind: ExpeditionGameKind, index: number, relationship?: string): ExpeditionEncounter {
  const clarification = encounterClarifications[id];
  const consequence = gameKind === 'sequence' ? 'The next steps are now agreed in the right order.' : gameKind === 'directions' ? 'The destination and its usable approach are now clear.' : gameKind === 'trade' ? 'The quantity, owner or return promise is now agreed.' : gameKind === 'repair' ? 'The faulty part and next repair step are now clear.' : gameKind === 'memory' ? 'The neighbors now share the same account of the message.' : 'The request is understood and a useful reply can travel to the next neighbor.';
  const correct = { text: answer, correct: true, response: clarification?.[1] ?? `“${answer}” ${consequence}${relationship ? ` ${relationship}` : ` The agreement follows this information: ${translation}`}` };
  const incorrect = { text: clarification?.[0] ?? distractor, correct: false, response: clarification?.[2] ?? `The message says: ${translation} Your reply changes that information. To keep the plan consistent, try: “${answer}”` };
  return { id, title, german, translation, languageFocus, difficulty, gameKind,
    prompt: gameKind === 'sequence' ? 'Choose the order that honors the plan.' : gameKind === 'directions' ? 'Which route follows the message?' : gameKind === 'trade' ? 'Choose the exchange that matches the agreement.' : gameKind === 'repair' ? 'What is the useful next repair step?' : gameKind === 'memory' ? 'What does the message actually establish?' : 'Choose a reply that understands the neighbor’s request.',
    choices: index % 2 ? [incorrect, correct] : [correct, incorrect] };
}

export const expeditionRegions: readonly ExpeditionRegion[] = seeds.map(seed => {
  const layout = expeditionLayouts[seed.id];
  const npcs: ExpeditionNpc[] = seed.cast.map(([slug, name, role, relationship, greeting], index) => ({
    id: `${seed.id}-${slug}`, name, role, relationship, relationships: [relationship], greeting,
    description: `${name} is the neighborhood’s ${role.toLowerCase()}. ${relationship}`,
    avatar: avatars[index % avatars.length], artVariant: index % 4, encounterId: `${seed.id}-encounter-${slug}`,
  }));
  const objects: WorldObjectSpec[] = seed.discoveries.map(([slug, label, kind, description, , , , , gameKind], index) => {
    const [from, to] = layout.links[index % layout.links.length];
    // An object's approach occupies an actual road, never a painted roof or water.
    const fraction = .42 + (index % 3) * .08;
    return { id: `${seed.id}-${slug}`, label, kind, description,
      x: layout.nodes[from].x + (layout.nodes[to].x - layout.nodes[from].x) * fraction,
      y: layout.nodes[from].y + (layout.nodes[to].y - layout.nodes[from].y) * fraction,
      prompt: gameKind === 'sequence' ? 'Put a shared plan in order.' : 'Understand the agreement, then choose a useful action.',
      exerciseIds: [], encounterId: `${seed.id}-encounter-${slug}` };
  });
  const encounters: ExpeditionEncounter[] = [
    ...seed.cast.map(([slug, name, , relationship, greeting, translation, answer, distractor], index) => makeEncounter(`${seed.id}-encounter-${slug}`, `A conversation with ${name}`, greeting, translation, answer, distractor, seed.languageFocus, seed.level, 'dialogue', index, relationship)),
    ...seed.discoveries.map(([slug, label, , , german, translation, answer, distractor, gameKind = 'dialogue'], index) => makeEncounter(`${seed.id}-encounter-${slug}`, label, german, translation, answer, distractor, seed.languageFocus, seed.level, gameKind, index + 8)),
  ];
  return { id: seed.id, name: seed.name, subtitle: seed.subtitle, description: seed.description,
    culture: seed.culture, feeling: seed.feeling, languageFocus: seed.languageFocus, npcs, objects, encounters };
});

export const expeditionMaps: readonly WorldMapSpec[] = expeditionRegions.map((region, index) => ({
  id: region.id, name: region.name, subtitle: region.subtitle, level: seeds[index].level, description: region.description,
  asset: `/assets/${region.id}-terrain.webp`, previewAsset: `/assets/${region.id}-preview.webp`,
  sceneryAsset: `/assets/${region.id}-props.webp`, sceneryAtlas: `/assets/${region.id}-props.json`,
  variationAsset: `/assets/${region.id}-props.webp`, variationAtlas: `/assets/${region.id}-props.json`,
  spawn: expeditionLayouts[region.id].nodes[0], objects: region.objects,
  npcs: region.npcs.map((npc, npcIndex) => ({ id: npc.id, ...expeditionLayouts[region.id].nodes[npcIndex + 1] })),
}));

const regionIndex = new Map<string, ExpeditionRegion>(expeditionRegions.map(region => [region.id, region]));
const npcIndex = new Map<string, ExpeditionNpc>(expeditionRegions.flatMap(region => region.npcs.map(npc => [npc.id, npc] as const)));
export const getExpedition = (id: MapId | string): ExpeditionRegion | undefined => regionIndex.get(id);
export const getExpeditionNpc = (id: string): ExpeditionNpc | undefined => npcIndex.get(id);
export function getExpeditionEncounter(mapId: MapId | string, targetId: string): ExpeditionEncounter | undefined {
  const region = getExpedition(mapId);
  if (!region) return undefined;
  const encounterId = region.npcs.find(npc => npc.id === targetId)?.encounterId ?? region.objects.find(object => object.id === targetId)?.encounterId;
  return region.encounters.find(encounter => encounter.id === encounterId);
}

type Polygon = readonly (readonly [number, number])[];
const pixel = (point: MapPosition): MapPosition => ({ x: point.x * 1536, y: point.y * 1024 });
/** Corridors and junctions match the separately painted paths in the terrain export. */
export function expeditionWalkablePolygons(id: ExpeditionId): readonly Polygon[] {
  const layout = expeditionLayouts[id], halfWidth = layout.roadWidth / 2;
  const corridors = layout.links.map(([from, to]): Polygon => {
    const a = pixel(layout.nodes[from]), b = pixel(layout.nodes[to]);
    const length = Math.hypot(b.x - a.x, b.y - a.y), dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
    return [[a.x-dy*halfWidth,a.y+dx*halfWidth],[b.x-dy*halfWidth,b.y+dx*halfWidth],[b.x+dy*halfWidth,b.y-dx*halfWidth],[a.x+dy*halfWidth,a.y-dx*halfWidth]];
  });
  const junctions = layout.nodes.map(point => {
    const p = pixel(point);
    return [[p.x-halfWidth,p.y-halfWidth],[p.x+halfWidth,p.y-halfWidth],[p.x+halfWidth,p.y+halfWidth],[p.x-halfWidth,p.y+halfWidth]] as Polygon;
  });
  return [...corridors, ...junctions, ...layout.grounds.map(polygon => polygon.map(([x,y]) => [x*1536,y*1024] as const))];
}

function distanceToRoad(id: ExpeditionId, x: number, y: number): number {
  const layout = expeditionLayouts[id];
  return Math.min(...layout.links.map(([from, to]) => {
    const a = pixel(layout.nodes[from]), b = pixel(layout.nodes[to]);
    const lengthSquared = (b.x-a.x)**2 + (b.y-a.y)**2;
    const t = Math.max(0, Math.min(1, ((x-a.x)*(b.x-a.x)+(y-a.y)*(b.y-a.y))/lengthSquared));
    return Math.hypot(x-a.x-t*(b.x-a.x), y-a.y-t*(b.y-a.y));
  }));
}

/** Grass banks traced from the terrain painting; water is never a prop plot. */
export const expeditionLandPlots: Readonly<Partial<Record<ExpeditionId, readonly Polygon[]>>> = {
  cedarbay: [
    [[155,90],[715,55],[1045,100],[1040,145],[200,150]],
    [[315,220],[720,215],[710,267],[495,275],[320,260]],
    [[170,140],[250,140],[310,285],[250,280],[170,245]],
    [[430,280],[495,285],[590,350],[530,366],[455,338]],
    [[930,270],[1110,305],[1190,390],[1135,420],[1050,345],[950,320]],
    [[385,390],[443,390],[462,670],[383,690]],
    [[550,460],[940,452],[1080,467],[1080,505],[610,520],[550,500]],
    [[1260,590],[1360,600],[1400,670],[1310,735],[1240,755],[1240,705],[1325,640]],
    [[330,705],[450,678],[485,700],[460,758],[345,798],[330,770]],
    [[595,660],[870,640],[1010,635],[995,687],[875,721],[680,726],[595,695]],
    [[525,825],[865,815],[1040,790],[1040,840],[850,882],[570,885]],
    [[170,830],[305,830],[420,790],[445,840],[350,890],[210,920],[155,900]],
    [[65,670],[155,640],[200,680],[140,735],[75,755]],
    [[1130,270],[1210,270],[1230,335],[1155,335]],
  ],
  riverweave: [
    [[20,15],[535,15],[535,115],[430,175],[280,130],[20,75]],
    [[1040,15],[1515,15],[1515,165],[1200,185],[1040,130]],
    [[275,325],[490,325],[490,425],[275,425]],
    [[665,345],[955,345],[955,435],[665,435]],
    [[1120,390],[1280,390],[1280,450],[1120,450]],
    [[285,650],[610,650],[610,712],[285,712]],
    [[760,660],[1280,660],[1280,712],[760,712]],
    [[20,850],[520,850],[520,1005],[20,1005]],
    [[655,850],[850,850],[850,1005],[655,1005]],
    [[1190,850],[1515,850],[1515,1005],[1190,1005]],
    [[20,530],[125,530],[125,815],[20,815]],
  ],
};
function pointInPlot(polygon: Polygon, x: number, y: number): boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [xi,yi]=polygon[i], [xj,yj]=polygon[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
function hasLandBase(id: ExpeditionId, x:number, y:number, width:number): boolean {
  const plots=expeditionLandPlots[id];
  if(!plots)return true;
  // Test the whole base, rather than only the center of a wide building.
  return plots.some(plot=>[-.34,0,.34].every(offset=>pointInPlot(plot,x+width*offset,y-5)));
}

function makePlacements(id: ExpeditionId, regionNumber: number): readonly PlacedScenerySpec[] {
  const specs: PlacedScenerySpec[] = [];
  const used: MapPosition[] = [];
  const buildings: MapPosition[] = [];
  const bankPlots=!!expeditionLandPlots[id], columns=bankPlots?60:30;
  const candidates = Array.from({ length: bankPlots?1920:600 }, (_, index) => ({
    x: 50 + (index % columns) * (bankPlots?24:49) + Math.sin(index * 1.7 + regionNumber) * (bankPlots?5:9),
    y: 105 + Math.floor(index / columns) * (bankPlots?28:46) + Math.cos(index * 2.3 + regionNumber) * (bankPlots?4:8),
  })).filter(point => point.y < 980).sort((a,b) => Math.sin(a.x*.02+a.y*.017+regionNumber) - Math.sin(b.x*.02+b.y*.017+regionNumber));
  const place = (asset: SceneryAsset, frame: string, count: number, width: number, clearance: number) => {
    const building=['archive','cafe','station','workshop','house','greenhouse'].includes(asset);
    // Local workshops belong near usable lanes, including the inner plots.
    // Small water-side buildings fit on the actual broad bank foundations.
    const ordered=building?[...candidates].sort((a,b)=>{
      const target=expeditionLandPlots[id]?85:120;
      const score=(point:MapPosition)=>Math.abs(distanceToRoad(id,point.x,point.y)-target)+Math.hypot(point.x-768,point.y-512)*.09;
      return score(a)-score(b);
    }):candidates;
    for (let instance=0; instance<count; instance++) {
      const instanceWidth=width*(.88+((instance+regionNumber)%5)*.06);
      const point = ordered.find(candidate => distanceToRoad(id,candidate.x,candidate.y)>clearance
        && (asset==='boat'||hasLandBase(id,candidate.x,candidate.y,instanceWidth))
        && (!building||buildings.every(previous=>Math.hypot(previous.x-candidate.x,previous.y-candidate.y)>width*.9))
        && used.every(previous => Math.hypot(previous.x-candidate.x,previous.y-candidate.y)>(bankPlots?28:42)));
      if (!point) break;
      used.push(point);
      if(building)buildings.push(point);
      specs.push({ id: `${id}-${frame}-${specs.length}`, asset, frame, ...point, width: instanceWidth, motion: asset==='tree'||asset==='cypress'?'tree':asset==='boat'?'boat':asset==='lamp'?'lamp':'still', flipX: (instance+regionNumber)%2===1 });
    }
  };
  for (const [index,frame] of ['archive','cafe','station','workshop','house','greenhouse','house-1','house-2','house-3','house-4','arch','stall'].entries()) {
    const asset = frame.startsWith('house-') ? 'house' : frame as SceneryAsset;
    const waterBank=!!expeditionLandPlots[id];
    place(asset,frame,1,index===10?100:waterBank?130:150,index===10?80:waterBank?60:90);
  }
  for (const frame of ['tree','tree-1','tree-2','tree-3','tree-4']) place('tree',frame,5,86,62);
  place('cypress','cypress',5,53,60);
  place('lamp','lamp',8,33,58);
  place('stall','stall',4,103,106);
  place('fountain','fountain',2,88,100);
  place('boat','boat',4,92,100);
  place('bench','bench',6,66,64);
  place('planter','planter',8,46,62);
  place('sign','sign',6,44,60);
  // Every discovery has its own visible object beside the exact action point.
  const region = getExpedition(id)!;
  for (const object of region.objects) {
    const asset: SceneryAsset = object.kind==='fountain'?'fountain':object.kind==='garden'?'planter':object.kind==='noticeboard'?'sign':object.kind==='lantern'?'lamp':object.kind==='parcel'?'stall':'bench';
    specs.push({ id: `${object.id}-scenery`, asset, frame: asset, x: object.x*1536, y: object.y*1024-18, width: asset==='stall'?46:asset==='fountain'?52:42, motion:'still' });
  }
  // Each motion sheet paints a COMPLETE object, including its fixed container,
  // stand or pole. Place it on its own ground instead of stacking it on a tree,
  // window or transport sprite. The terrain and architecture remain stable.
  const groups = [
    { name:'motion-tree',asset:'planter' as const,width:58 },
    { name:'motion-cloth',asset:'sign' as const,width:58 },
    { name:'motion-lamp',asset:'lamp' as const,width:30 },
    { name:'motion-water',asset:'fountain' as const,width:70 },
  ];
  for (const group of groups) {
    for (let index=0; index<6; index++) {
      const point=candidates.find(candidate=>distanceToRoad(id,candidate.x,candidate.y)>60
        &&hasLandBase(id,candidate.x,candidate.y,group.width)
        &&used.every(previous=>Math.hypot(previous.x-candidate.x,previous.y-candidate.y)>(bankPlots?30:44)));
      if(!point)throw new Error(`${id}: no grounded position for ${group.name}`);
      used.push(point);
      specs.push({ id:`${id}-${group.name}-${index}`,asset:group.asset,frame:group.name,
        ...point,width:group.width,motion:'still',collidable:false });
    }
  }
  return specs;
}

export const expeditionPlacements: Readonly<Record<ExpeditionId, readonly PlacedScenerySpec[]>> = Object.fromEntries(expeditionIds.map((id,index)=>[id,makePlacements(id,index)])) as Record<ExpeditionId, readonly PlacedScenerySpec[]>;
export const expeditionResidentSpecs: Readonly<Record<ExpeditionId, readonly ResidentSpec[]>> = seeds.reduce((result,seed,regionNumber)=>{
  result[seed.id] = seed.residents.map((name,index)=>{
  const nodes=expeditionLayouts[seed.id].nodes;
  return { id:`${seed.id}-resident-${index}`,name,avatar:avatars[(index+regionNumber)%4],speed:48+(index%5)*5,phase:(index+.35)/seed.residents.length,
    stops:[0,(index+1)%nodes.length,(index+3)%nodes.length,(index+6)%nodes.length].map((node,stopIndex)=>({...nodes[node],pauseSeconds:2.4+((index+stopIndex)%4)})) };
  });
  return result;
}, {} as Record<ExpeditionId, readonly ResidentSpec[]>);
