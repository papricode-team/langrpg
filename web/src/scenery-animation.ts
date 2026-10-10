import type { MapId } from './maps';
import type { WorldPeriod } from './world-clock';
import { sceneryPhase } from './placed-scenery';
export interface SceneryAnimation {
  key:string;
  frames:readonly string[];
  fps:number;
  width:number;
  height:number;
  referenceWidth:number;
  originX:number;
  originY:number;
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
export interface SceneryAnimationManifest { version:number;framesPerAsset:number;terrain?:string;assets:Readonly<Record<string,SceneryAnimation>>; }
/** Include every layer when loading, checking the cache or releasing a period. */
export function sceneryAnimationTextureKeys(manifest:SceneryAnimationManifest):readonly string[] {
  return [...new Set(Object.values(manifest.assets).flatMap(asset=>asset.base
    ? [asset.base.key,...(asset.overlays??[]).map(overlay=>overlay.key)] : [asset.key]))];
}
export const isBuildingScenery=(name:string):boolean=>
  ['archive','cafe','station','workshop','house','greenhouse','arch'].includes(name)||name.startsWith('house-');
export const sceneryAnimationManifestKey=(id:MapId,period:WorldPeriod='day'):string=>`${id}-${period}-animations`;
/** Expedition day/night motions share the already streamed terrain texture. */
export function sceneryTerrainKey(id: MapId, manifest?: SceneryAnimationManifest): string | undefined {
  return manifest?.terrain === `${id}-terrain` ? id : manifest?.terrain;
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
