import type { MapId } from './maps';
export type CutsceneKind = 'arrival' | 'platform' | 'recording' | 'erasure' | 'clockmill' | 'confession' | 'dark-beam' | 'ledger' | 'storm' | 'bell' | 'travel';
export interface CameraBeat { x: number; y: number; zoom: number; }
export interface Beat extends CameraBeat { speaker: string; german: string; seconds: number; clipId?: string; }
export const endingIds = ['routes-reopened', 'towns-consent', 'brass-reformed'] as const;
export function cinematicBeats(kind: CutsceneKind, mapId: MapId, ending?: string): readonly Beat[] {
  const station = mapId === 'waldruh' ? {x:1120,y:320} : mapId === 'nebelstadt' ? {x:1070,y:350} : {x:1245,y:320};
  const journeys: Record<CutsceneKind, readonly Beat[]> = {
    arrival: [{...station,zoom:1.7,speaker:'Otto',german:'Der Zug ist da. Auf Bahnsteig sieben?',seconds:3}, {x:1170,y:355,zoom:2.2,speaker:'Otto',german:'Seit zwölf Jahren hält hier kein Zug.',seconds:3}],
    platform: [{...station,zoom:2.3,speaker:'Otto',german:'Bahnsteig sieben. Die Laterne brennt wieder.',seconds:3}],
    recording: [{x:1230,y:345,zoom:2.4,speaker:'Stimme',german:'Ist da jemand? Ich bin noch hier.',seconds:4}, {x:1230,y:345,zoom:2.6,speaker:'Inspector',german:'Ich höre sie jeden Abend. Sie hört mich nicht.',seconds:5}],
    erasure: [{x:921,y:728,zoom:2,speaker:'Lina',german:'Hier war ihr Schild. Da stand Frau Berg.',seconds:4}, {x:921,y:728,zoom:2.4,speaker:'Lina',german:'Und jetzt geht auch die Sieben weg.',seconds:4}],
    clockmill: [{x:1180,y:560,zoom:1.8,speaker:'Emil',german:'Die Uhr läuft wieder. Aber uns fehlt eine Stunde.',seconds:4}, {x:1070,y:535,zoom:2.2,speaker:'Emil',german:'Nicht alle Namen kommen zurück. Wir brauchen die alten Unterlagen.',seconds:5}],
    confession: [{x:1070,y:535,zoom:2.1,speaker:'Ada',german:'Eine Woche, habe ich gesagt. Danach habe ich nicht mehr gefragt.',seconds:5}, {x:1070,y:535,zoom:2.4,speaker:'Ada',german:'Du darfst du sagen. Meine Unterschrift bleibt hier, wo alle sie sehen.',seconds:5}],
    'dark-beam': [{x:1350,y:395,zoom:1.7,speaker:'Lina',german:'Der Strahl nimmt die Namen mit. Wir müssen ihn stoppen.',seconds:4}],
    ledger: [{x:910,y:500,zoom:1.9,speaker:'Inspector',german:'Die dauerhafte Schließung. Die drei Spulen. Ich habe beides unterschrieben.',seconds:5}, {x:910,y:500,zoom:2.3,speaker:'Inspector',german:'Lassen Sie das Buch offen. Auch auf meiner Seite.',seconds:5}],
    storm: [{x:1360,y:415,zoom:1.8,speaker:'Greta',german:'Die letzte Person ist im Trockenen. Jetzt halten wir das Licht.',seconds:4}, {x:970,y:560,zoom:1.6,speaker:'Otto',german:'Drei Städte antworten. Keine Stimme kommt vom Band.',seconds:4}],
    bell: [{x:770,y:290,zoom:2.1,speaker:'Elise',german:'Die siebte Glocke. Jetzt gehört der Atlas euch.',seconds:4}],
    travel: [{...station,zoom:1.45,speaker:'Otto',german:'Bitte einsteigen. Der nächste Ort wartet.',seconds:3}],
  };
  if (kind === 'bell' && endingIds.includes(ending as typeof endingIds[number])) {
    const finales: Record<string, readonly Beat[]> = {
      'routes-reopened': [
        {x:970,y:560,zoom:1.6,speaker:'Otto',german:'Der erste Zug fährt. Für die neue Küste haben wir noch keinen sicheren Fahrplan.',seconds:6},
        {x:770,y:290,zoom:1.8,speaker:'Elise',german:'Mein Schlüssel liegt jetzt öffentlich. Ich fahre mit einer gewöhnlichen Fahrkarte.',seconds:5},
      ],
      'towns-consent': [
        {x:1360,y:415,zoom:1.65,speaker:'Greta',german:'Drei Städte, drei Stimmen. Die Küste wartet, bis ihre Menschen selbst antworten.',seconds:6},
        {x:770,y:290,zoom:1.8,speaker:'Elise',german:'Warten ist schwer. Diesmal entscheiden die Menschen, die dort leben.',seconds:5},
      ],
      'brass-reformed': [
        {x:910,y:500,zoom:1.7,speaker:'Inspector',german:'Mein Stempel liegt auf dem Tisch. Meine Unterschrift bleibt im Buch.',seconds:6},
        {x:770,y:290,zoom:1.8,speaker:'Ada',german:'Morgen öffnen wir das Amt. Die erste Beschwerde betrifft uns selbst.',seconds:5},
      ],
    };
    return finales[ending!].map((beat,index) => ({...beat,clipId:`cinematic-bell-${ending}-${index}`}));
  }
  return journeys[kind];
}
