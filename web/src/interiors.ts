import { npcs,quests, type Exercise } from './content';
import presentation from './data/interior-presentation.json';
import type {AlignedLine} from './aligned-line';
import type {Narrative} from './sentence-translations';
import {baseLanguage} from './i18n';
import type { MapId, MapPosition } from './maps';
import { NavigationGrid, PLAYER_RADIUS, type NavigationOptions } from './navigation';
import {getWorldScene} from './scene-data';
import {sceneEntrancePoint, type SceneEntrance} from './scene-schema';

export type InteriorId = SceneEntrance['interiorId'];
export type InteriorSheet = 'interior-cafe-objects' | 'interior-bakery-objects' | 'interior-supermarket-objects' | 'interior-decor' | 'interior-furniture';
export type InteriorPolygon = readonly (readonly [number, number])[];
export interface InteriorVocabulary {
  article: string;
  lemma: string;
  plural: string;
  english: string;
  aligned?:AlignedLine;
  lexemeId?:string;
  exampleLineId?:string;
  example?:Narrative;
}
export interface InteriorObjectSpec extends MapPosition {
  narrativeId?:string;
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
  /** Solid footprint relative to this prop's anchor; moves with the furniture. */
  collision?: { offsetX: number; offsetY: number; width: number; height: number };
  /** Detail-only overlays, positioned relative to the fixed furniture anchor. */
  effects?: readonly { asset: 'steam' | 'flame'; x: number; y: number; width: number; alpha: number }[];
}
export interface InteriorNpcSpec extends MapPosition {
  id: string;
  interactionId: string;
  role: string;
  /** Shared-clock visiting hours; room actions remain available overnight. */
  hours?: readonly [number, number];
}
export interface InteriorSpec {
  id: InteriorId;
  name: string;
  germanName: string;
  subtitle: string;
  description: string;
  icon: 'cup' | 'basket' | 'leaf';
  asset: string;
  width: number;
  height: number;
  /** Visible adult height in painting pixels; defaults to the shop furniture scale. */
  characterHeight?: number;
  spawn: MapPosition;
  exit: MapPosition;
  /** Architectural floor boundaries in painting pixels, independent of furniture. */
  floorAreas: readonly InteriorPolygon[];
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
  returnPoint: MapPosition;
}

/** Geometry is synchronous; learning cards arrive only for the selected object. */
export const interiors = structuredClone(presentation.interiors) as unknown as InteriorSpec[];
export function installInteriors(values:readonly InteriorSpec[]):void {for(const value of values){const current=interiors.find(room=>room.id===value.id);if(current)Object.assign(current,value);else interiors.push(value);}refreshInteriorExercises();}
export function clearInteriorContent():void {installInteriors(structuredClone(presentation.interiors) as unknown as InteriorSpec[]);interiorExercises.length=0;}
export async function loadInteriorObject(object:InteriorObjectSpec):Promise<InteriorObjectSpec>{
 if(!object.narrativeId)return object;
 const {getContentClient}=await import('./content-api');const client=getContentClient();
 const body=await client.narrative<InteriorObjectSpec&{vocabulary:Array<{lexemeId:string;lineId:string}>}>(object.narrativeId);
 const cards=body.vocabulary as unknown as Array<{lexemeId:string;lineId:string;article?:string;lemma?:string;plural?:string;meaning?:string|Record<string,string>;exampleLineId?:string}>;
 const [lines,words,exercises]=await Promise.all([client.lines(cards.map(card=>card.lineId)),client.lexemes(cards.map(card=>card.lexemeId)),client.exercises(body.exerciseIds)]);
 const vocabulary=cards.map(card=>{const word=words.find(word=>word.id===card.lexemeId)!;const meaning=typeof card.meaning==='string'?card.meaning:card.meaning?.[baseLanguage()]??card.meaning?.en;return {lexemeId:card.lexemeId,article:card.article??word.article??'',lemma:card.lemma??word.lemma,plural:card.plural??word.plural??'',english:meaning??word.english,aligned:lines.find(line=>line.id===card.lineId),exampleLineId:card.exampleLineId};});
 Object.assign(object,body,{id:object.id,npcId:npcs.find(npc=>npc.contentId===body.npcId)?.id??body.npcId,vocabulary});for(const exercise of exercises)if(!interiorExercises.some(value=>value.id===exercise.id))interiorExercises.push(exercise);return object;
}
/** A selected word reveals one authored example without downloading other cards' examples. */
export async function loadInteriorWordExample(word:InteriorVocabulary):Promise<InteriorVocabulary>{
 if(!word.exampleLineId||word.example)return word;
 const {getContentClient}=await import('./content-api');const client=getContentClient();const [line]=await client.lines([word.exampleLineId]);
 if(client!==getContentClient())return word;
 if(!line)throw new Error('This content could not open. Try again.');
 const support=line.support[baseLanguage()]??line.support.en;word.example=[{german:line.de.text,english:support?.text??'',localized:true,aligned:line}];return word;
}
export function getInterior(id: InteriorId): InteriorSpec {
  return interiors.find(interior => interior.id === id) ?? interiors[0];
}

export function getInteriorObject(id: string): InteriorObjectSpec | undefined {
  return interiors.flatMap(interior => [...interior.objects]).find(object => object.id === id);
}

/** Visiting actors and their conversation station share the same hours. */
export function interiorNpcAvailable(npc: InteriorNpcSpec, hour: number): boolean {
  if (!npc.hours) return true;
  const h = ((hour % 24) + 24) % 24;
  const [start, end] = npc.hours;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

export function interiorObjectAvailable(room: InteriorSpec, id: string, hour: number): boolean {
  const object = room.objects.find(item => item.id === id);
  const npc = object?.npcId ? room.npcs.find(item => item.id === object.npcId) : undefined;
  return !npc || interiorNpcAvailable(npc, hour);
}


/** These are the same server-graded expressions used by the existing quests. */
export const interiorExercises: Exercise[] = [];
export function refreshInteriorExercises():void {const ids=new Set(interiors.flatMap(room=>room.objects.flatMap(object=>object.exerciseIds)));interiorExercises.splice(0,interiorExercises.length,...quests.flatMap(quest=>quest.exercises).filter(exercise=>ids.has(exercise.id)));}

/** Scenery and its doorway share one authored transform. */
export function buildingEntrances(mapId: MapId): readonly BuildingEntrance[] {
  const scene=getWorldScene(mapId);
  return (scene.entrances ?? []).map(entrance => {
    const interior=getInterior(entrance.interiorId), point=sceneEntrancePoint(scene,entrance), back=sceneEntrancePoint(scene,entrance,true);
    return {id:`building:${interior.id}` as const,interiorId:interior.id,label:interior.germanName,description:interior.description,
      x:point.x/scene.width,y:point.y/scene.height,returnPoint:{x:back.x/scene.width,y:back.y/scene.height}};
  });
}

/** Match each distinct building footprint and its partition doorways. */
export function createInteriorNavigation(id: InteriorId, options: NavigationOptions = {}): NavigationGrid {
  const rectangle = (x: number, y: number, width: number, height: number): readonly (readonly [number, number])[] =>
    [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  const interior = getInterior(id);
  const obstacles = interior.props.flatMap(prop => prop.collision ? [rectangle(prop.x + prop.collision.offsetX, prop.y + prop.collision.offsetY, prop.collision.width, prop.collision.height)] : []);
  return new NavigationGrid(interior.floorAreas, [...(interior.barriers ?? []), ...obstacles], interior, {agentRadius:PLAYER_RADIUS,...options});
}
