import type { MapId } from './maps';
export type CutsceneKind = 'arrival' | 'platform' | 'clockmill' | 'dark-beam' | 'storm' | 'bell' | 'travel';
export interface CameraBeat { x: number; y: number; zoom: number; }
export interface Beat extends CameraBeat { speaker: string; german: string; seconds: number; }
export function cinematicBeats(kind: CutsceneKind, mapId: MapId): readonly Beat[] {
  const station = mapId === 'waldruh' ? {x:1120,y:320} : mapId === 'nebelstadt' ? {x:1070,y:350} : {x:1245,y:320};
  const journeys: Record<CutsceneKind, readonly Beat[]> = {
    arrival: [{...station,zoom:1.7,speaker:'Otto',german:'Der Zug ist da. Willkommen!',seconds:3}, {x:1170,y:355,zoom:2.2,speaker:'Otto',german:'Siehst du die Laterne? Dieser Bahnsteig ist neu.',seconds:3}],
    platform: [{...station,zoom:2.3,speaker:'Otto',german:'Die erste Glocke. Der Weg ist wieder da.',seconds:3}],
    clockmill: [{x:1180,y:560,zoom:1.8,speaker:'Emil',german:'Die Uhr läuft wieder. Aber uns fehlen elf Minuten.',seconds:3}, {x:1070,y:535,zoom:2.2,speaker:'Ada',german:'Im Archiv finden wir unsere verlorene Zeit.',seconds:3}],
    'dark-beam': [{x:1350,y:395,zoom:1.7,speaker:'Lina',german:'Der Strahl nimmt die Namen mit. Wir müssen ihn stoppen.',seconds:4}],
    storm: [{x:1360,y:415,zoom:1.8,speaker:'Greta',german:'Der Sturm zieht weiter. Alle Gäste sind in Sicherheit.',seconds:3}, {x:970,y:560,zoom:1.6,speaker:'Otto',german:'Wir halten das Signal gemeinsam am Leben.',seconds:3}],
    bell: [{x:770,y:290,zoom:2.1,speaker:'Elise',german:'Die siebte Glocke. Jetzt gehört der Atlas euch.',seconds:4}],
    travel: [{...station,zoom:1.45,speaker:'Otto',german:'Bitte einsteigen. Der nächste Ort wartet auf dich.',seconds:3}],
  };
  return journeys[kind];
}
