import type { Level } from './content';
import type { MapId, MapPosition, WorldMapSpec, WorldObjectSpec } from './maps';
import type { PlacedScenerySpec, SceneryAsset } from './placed-scenery';
import type { ResidentSpec } from './world-life';
import { seededShuffle } from './game-shuffle.ts';
import presentation from './data/expedition-presentation.json';
import {installExpeditionLearning} from './expedition-learning';
import type {AlignedLine} from './aligned-line';
import type {ContentLine} from './content-api';
import {baseLanguage} from './i18n';

export const expeditionIds = ['saffroncourt', 'rainmarket', 'windplain', 'riverweave', 'terracielo', 'sunpatch', 'kigalights', 'cedarbay', 'seoulsteps', 'dunegarden'] as const;
export type ExpeditionId = typeof expeditionIds[number];
export const isExpeditionMap = (id: string): id is ExpeditionId => (expeditionIds as readonly string[]).includes(id);
export type ExpeditionGameKind = 'dialogue' | 'sequence' | 'directions' | 'trade' | 'repair' | 'memory';
export interface ExpeditionChoice { text: string; lineId?:string; aligned?:AlignedLine; correct?: boolean; response?: string; }
export interface ExpeditionEncounter {
  id: string; recordId?:string; aligned?:AlignedLine; title: string; prompt: string; german: string; translation: string;
  choices: readonly ExpeditionChoice[]; languageFocus: string; difficulty: Level; gameKind: ExpeditionGameKind;
}
/** Shuffle presentation only: the server and saved outcomes use canonical indices. */
export function shuffledExpeditionChoices(encounter: ExpeditionEncounter, seed: string): {choice:ExpeditionChoice;index:number}[] {
  return seededShuffle(encounter.choices.map((choice,index) => ({choice,index})), `${seed}:${encounter.id}`);
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
export const expeditionLayouts = presentation.layouts as unknown as Readonly<Record<ExpeditionId,ExpeditionLayout>>;
export const expeditionRegions = structuredClone(presentation.regions) as unknown as ExpeditionRegion[];
export const expeditionMaps = presentation.maps as unknown as readonly (WorldMapSpec & {id:ExpeditionId})[];
export const expeditionLandPlots = presentation.landPlots as unknown as Readonly<Partial<Record<ExpeditionId,readonly (readonly (readonly [number,number])[])[]>>>;
export const expeditionPlacements = presentation.placements as unknown as Readonly<Record<ExpeditionId,readonly PlacedScenerySpec[]>>;
export const expeditionResidentSpecs = presentation.residents as unknown as Readonly<Record<ExpeditionId,readonly ResidentSpec[]>>;
export function installExpeditionRegions(values:readonly ExpeditionRegion[]):void {
 for(const value of values){const current=expeditionRegions.find(region=>region.id===value.id);if(current)Object.assign(current,value);else expeditionRegions.push(value);}
}
export function clearExpeditionContent():void {installExpeditionRegions(structuredClone(presentation.regions) as unknown as ExpeditionRegion[]);}
export const getExpedition=(id:MapId|string):ExpeditionRegion|undefined=>expeditionRegions.find(region=>region.id===id);
export const getExpeditionNpc=(id:string):ExpeditionNpc|undefined=>expeditionRegions.flatMap(region=>region.npcs).find(npc=>npc.id===id);
export function getExpeditionEncounter(mapId:MapId|string,targetId:string):ExpeditionEncounter|undefined {
 const region=getExpedition(mapId),encounterId=region?.npcs.find(npc=>npc.id===targetId)?.encounterId??region?.objects.find(object=>object.id===targetId)?.encounterId;
 return region?.encounters.find(encounter=>encounter.id===encounterId);
}
export async function loadExpeditionEncounter(encounter:ExpeditionEncounter):Promise<ExpeditionEncounter>{
 if(!encounter.recordId)return encounter;
 const {getContentClient}=await import('./content-api');const client=getContentClient();
 const body=await client.expedition<Record<string,unknown>&{lineId:string;id:string;choices?:ExpeditionChoice[]}>(encounter.recordId);
 const lines=await client.lines([body.lineId,...(body.choices??[]).flatMap(choice=>choice.lineId?[choice.lineId]:[])]);
 const byID=new Map(lines.map(line=>[line.id,line])),line=byID.get(body.lineId)!;const support=line.support[baseLanguage()]??line.support.en;
 for(const choice of body.choices??[]){const aligned=choice.lineId&&byID.get(choice.lineId);if(aligned)Object.assign(choice,{text:aligned.de.text,aligned});}
 installExpeditionLearning(body);
 Object.assign(encounter,body,{id:encounter.id,recordId:encounter.recordId,german:line.de.text,translation:support?.text??'',aligned:line as ContentLine});return encounter;
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
