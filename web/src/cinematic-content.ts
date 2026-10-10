import type { MapId } from './maps';
export type CutsceneKind = 'arrival' | 'platform' | 'recording' | 'erasure' | 'clockmill' | 'confession' | 'dark-beam' | 'ledger' | 'storm' | 'bell' | 'travel';
export interface CameraBeat { x: number; y: number; zoom: number; }
export interface Beat extends CameraBeat { speaker: string; german: string; seconds: number; clipId?: string; }
export const endingIds = ['routes-reopened', 'towns-consent', 'brass-reformed'] as const;
export function cinematicBeats(kind: CutsceneKind, mapId: MapId, ending?: string): readonly Beat[] {
  const station = mapId === 'waldruh' ? {x:1120,y:320} : mapId === 'nebelstadt' ? {x:1070,y:350} : {x:1245,y:320};
  const journeys: Record<CutsceneKind, readonly Beat[]> = {
    arrival: [{...station,zoom:1.7,speaker:'Otto',german:'Der Zug ist da. Willkommen!',seconds:3}, {x:1170,y:355,zoom:2.2,speaker:'Otto',german:'Siehst du die Laterne? Bahnsteig sieben gibt es nicht.',seconds:3}],
    platform: [{...station,zoom:2.3,speaker:'Otto',german:'Die erste Glocke. Der Weg ist wieder da.',seconds:3}],
    recording: [{x:1230,y:345,zoom:2.4,speaker:'Stimme',german:'Ist da jemand? Ich bin noch hier.',seconds:4}, {x:1230,y:345,zoom:2.6,speaker:'Inspector',german:'Jede Nacht ruft sie. Ich höre Sie. Aber ich darf nicht antworten.',seconds:5}],
    erasure: [{x:921,y:728,zoom:2,speaker:'Lina',german:'Moment. Hier stand die Hausnummer von Frau Berg.',seconds:4}, {x:921,y:728,zoom:2.4,speaker:'Lina',german:'Jetzt ist das Schild leer. Und das Haus auch.',seconds:4}],
    clockmill: [{x:1180,y:560,zoom:1.8,speaker:'Emil',german:'Die Uhr läuft wieder. Aber uns fehlt eine Stunde.',seconds:3}, {x:1070,y:535,zoom:2.2,speaker:'Ada',german:'Im Archiv finden wir unsere verlorene Zeit.',seconds:3}],
    confession: [{x:1070,y:535,zoom:2.1,speaker:'Ada',german:'Ich habe unterschrieben. Ich dachte, es dauert nur eine Woche.',seconds:5}, {x:1070,y:535,zoom:2.4,speaker:'Ada',german:'Du darfst „du“ sagen, wenn du magst. Ich verstecke mich nicht mehr.',seconds:5}],
    'dark-beam': [{x:1350,y:395,zoom:1.7,speaker:'Lina',german:'Der Strahl nimmt die Namen mit. Wir müssen ihn stoppen.',seconds:4}],
    ledger: [{x:910,y:500,zoom:1.9,speaker:'Inspector',german:'Hier ist mein Buch. Jede Seite trägt meine Unterschrift.',seconds:5}, {x:910,y:500,zoom:2.3,speaker:'Inspector',german:'Ich habe die Maschine am Laufen gehalten. Das war mein Fehler.',seconds:5}],
    storm: [{x:1360,y:415,zoom:1.8,speaker:'Greta',german:'Der Sturm zieht weiter. Alle Gäste sind in Sicherheit.',seconds:3}, {x:970,y:560,zoom:1.6,speaker:'Otto',german:'Wir halten das Signal gemeinsam am Leben.',seconds:3}],
    bell: [{x:770,y:290,zoom:2.1,speaker:'Elise',german:'Die siebte Glocke. Jetzt gehört der Atlas euch.',seconds:4}],
    travel: [{...station,zoom:1.45,speaker:'Otto',german:'Bitte einsteigen. Der nächste Ort wartet auf dich.',seconds:3}],
  };
  if (kind === 'bell' && endingIds.includes(ending as typeof endingIds[number])) {
    const finales: Record<string, readonly Beat[]> = {
      'routes-reopened': [
        {x:970,y:560,zoom:1.6,speaker:'Otto',german:'Der erste Zug fährt wieder. Die Laternen zeigen allen den Weg.',seconds:5},
        {x:770,y:290,zoom:1.8,speaker:'Elise',german:'Der Schlüssel gehört jetzt dem Rat. Keine Reise braucht meine Erlaubnis.',seconds:5},
      ],
      'towns-consent': [
        {x:1360,y:415,zoom:1.65,speaker:'Greta',german:'Jede Stadt hat einen Schlüssel. Wir hören jede Stimme, bevor wir eine neue Strecke öffnen.',seconds:6},
        {x:770,y:290,zoom:1.8,speaker:'Elise',german:'Die siebte Glocke wartet auf eure Zustimmung. Der Atlas hört euch zu.',seconds:5},
      ],
      'brass-reformed': [
        {x:910,y:500,zoom:1.7,speaker:'Inspector',german:'Ich lege meinen Stempel ab. Jede Entscheidung steht von heute an im offenen Buch.',seconds:6},
        {x:770,y:290,zoom:1.8,speaker:'Ada',german:'Die siebte Glocke. Das Amt muss jetzt den Menschen antworten.',seconds:5},
      ],
    };
    return finales[ending!].map((beat,index) => ({...beat,clipId:`cinematic-bell-${ending}-${index}`}));
  }
  return journeys[kind];
}
