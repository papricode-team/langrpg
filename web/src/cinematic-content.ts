import type { MapId } from './maps';
import { getContentClient } from './content-api';
import { hydrateNarrative } from './content-narratives';
import type { TranslatedSentence } from './sentence-translations';

export type CutsceneKind='arrival'|'platform'|'recording'|'erasure'|'clockmill'|'confession'|'dark-beam'|'ledger'|'storm'|'bell'|'travel';
export interface CameraBeat {x:number;y:number;zoom:number;}
export interface Beat extends CameraBeat {speaker:string;german:string;seconds:number;clipId?:string;english?:string;aligned?:TranslatedSentence['aligned'];localized?:boolean;}
export const endingIds=['routes-reopened','towns-consent','brass-reformed'] as const;
export const cutsceneKinds:readonly CutsceneKind[]=['arrival','platform','recording','erasure','clockmill','confession','dark-beam','ledger','storm','bell','travel'];
const scripts=new Map<string,readonly Beat[]>();
function scriptKey(kind:CutsceneKind,mapId:MapId,ending?:string):string {return `${kind}:${mapId}:${kind==='bell'&&endingIds.includes(ending as typeof endingIds[number])?ending:''}`;}
export function installCinematicContent(kind:CutsceneKind,mapId:MapId,beats:readonly Beat[],ending?:string):void {scripts.set(scriptKey(kind,mapId,ending),beats.map(beat=>({...beat})));}
export function clearCinematicContent():void {scripts.clear();}
interface CinematicNarrative {id:string;beats:(CameraBeat&{speaker:string;seconds:number;clipId?:string;line:TranslatedSentence})[];}
/** Cutscene prose is fetched after the story beat and route have been admitted. */
export async function loadCinematicContent(kind:CutsceneKind,mapId:MapId,ending?:string):Promise<void> {
  const key=scriptKey(kind,mapId,ending);if(scripts.has(key))return;
  const client=getContentClient(),bootstrap=await client.bootstrap(),selectedEnding=kind==='bell'&&endingIds.includes(ending as typeof endingIds[number])?ending:undefined;
  const record=(bootstrap.narratives as {id:string;kind:string;mapId?:string;cutsceneKind?:string;ending?:string}[]|undefined)?.find(value=>value.kind==='cinematic'&&value.mapId===mapId&&value.cutsceneKind===kind&&value.ending===selectedEnding);
  if(!record)throw new Error('This story moment could not open. Try again.');
  const value=await hydrateNarrative(await client.narrative<CinematicNarrative>(record.id));
  if(client!==getContentClient())return;
  installCinematicContent(kind,mapId,value.beats.map(({line,...beat})=>({...beat,...line})),selectedEnding);
}
export function cinematicBeats(kind:CutsceneKind,mapId:MapId,ending?:string):readonly Beat[] {return scripts.get(scriptKey(kind,mapId,ending))??[];}
