import type { MapId } from './maps';
import type { WorldPeriod } from './world-clock';
import { sceneryPhase } from './placed-scenery';
import type { SortLine } from './world-depth';
export interface SceneryAnimation {
  key:string;
  frames:readonly string[];
  fps:number;
  width:number;
  height:number;
  referenceWidth:number;
  originX:number;
  originY:number;
  /** Geometry in reference pixels, relative to the painted foot anchor. */
  sortLine?:SortLine;
  footprint?:SortLine;
  door?:{x:number;y:number;width:number;height:number};
  /** Shared daylight source paintings can opt into a runtime moonlight tint. */
  nightTint?:number;
  /** Static paintings may have a higher native resolution than their detail layers. */
  base?:{key:string;frame:string;referenceWidth?:number;originX?:number;originY?:number};
  overlays?:readonly SceneryOverlay[];
}
export interface SceneryOverlay extends SceneryAnimation {
  id:string;
  /** Detail center relative to the building's foot pivot, in unscaled pixels. */
  offsetX:number;
  offsetY:number;
}
export interface TerrainTile { key: string; x: number; y: number; width: number; height: number; crop?: { x: number; y: number; width: number; height: number }; }
export interface SceneryAnimationManifest { version:number;framesPerAsset:number;terrain?:string;terrainTiles?:readonly TerrainTile[];assets:Readonly<Record<string,SceneryAnimation>>; }
/** Include every layer when loading, checking the cache or releasing a period. */
export function sceneryAnimationTextureKeys(manifest:SceneryAnimationManifest):readonly string[] {
  return [...new Set(Object.values(manifest.assets).flatMap(asset=>asset.base
    ? [asset.base.key,...(asset.overlays??[]).map(overlay=>overlay.key)] : [asset.key]))];
}
export const isBuildingScenery=(name:string):boolean=>
  ['archive','cafe','station','workshop','house','greenhouse','arch'].includes(name)||name.startsWith('house-');
export const sceneryAnimationManifestKey=(id:MapId,period:WorldPeriod='day'):string=>`${id}-${period}-animations`;
/** Reuse the streamed base when it is the same painting as the period terrain. */
export function sceneryTerrainKey(id: MapId, manifest?: SceneryAnimationManifest): string | undefined {
  const base = manifest?.terrain === `${id}-terrain`
    || id === 'nebelstadt' && (manifest?.terrain === 'nebelstadt-day-terrain'||manifest?.terrain === 'nebelstadt-harbour-bridge-day-terrain');
  return base ? id : manifest?.terrain;
}
export function sceneryTerrainTextureKeys(id: MapId, manifest?: SceneryAnimationManifest): readonly string[] {
  const base = sceneryTerrainKey(id, manifest);
  return [...new Set([...(base ? [base] : []), ...(manifest?.terrainTiles ?? []).map(tile => tile.key)])];
}
/** Each placement has its own point in an authored cycle; all transforms stay fixed. */
export function sampleSceneryFrame(animation:SceneryAnimation,id:string,seconds:number):string {
  const time=Number.isFinite(seconds)?Math.max(0,seconds):0;
  const phase=sceneryPhase(id)/(Math.PI*2)*animation.frames.length;
  return animation.frames[Math.floor(time*animation.fps+phase)%animation.frames.length];
}
export function sceneryBlend(animation:SceneryAnimation,id:string,seconds:number) {
  const cycle=Math.max(0,Number.isFinite(seconds)?seconds:0)*animation.fps+sceneryPhase(id)/(Math.PI*2)*animation.frames.length;
  const index=Math.floor(cycle)%animation.frames.length;
  return {current:animation.frames[index],next:animation.frames[(index+1)%animation.frames.length],alpha:cycle-Math.floor(cycle)};
}
/** A light breeze: at most 0.14 degrees, with slow, independently phased gusts. */
export function sampleTreeSway(id:string,seconds:number,period:WorldPeriod='day'):number {
  const time=Number.isFinite(seconds)?Math.max(0,seconds):0;
  const phase=sceneryPhase(id);
  const strength=period==='night'?.55:1;
  const pace=period==='night'?.75:1;
  return (.14*Math.PI/180)*strength*(.8*Math.sin(time*.65*pace+phase)+.2*Math.sin(time*.23*pace+phase*.7));
}
