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
  /** Architecture uses a fixed painting with separately packed detail sheets. */
  base?:{key:string;frame:string};
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
/** Each placement has its own point in an authored cycle; all transforms stay fixed. */
export function sampleSceneryFrame(animation:SceneryAnimation,id:string,seconds:number):string {
  const time=Number.isFinite(seconds)?Math.max(0,seconds):0;
  const phase=sceneryPhase(id)/(Math.PI*2)*animation.frames.length;
  return animation.frames[Math.floor(time*animation.fps+phase)%animation.frames.length];
}
