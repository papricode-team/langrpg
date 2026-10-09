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
}
export interface SceneryAnimationManifest { version:number;framesPerAsset:number;terrain?:string;assets:Readonly<Record<string,SceneryAnimation>>; }
export const sceneryAnimationManifestKey=(id:MapId,period:WorldPeriod='day'):string=>`${id}-${period}-animations`;
/** Each placement has its own point in an authored cycle; all transforms stay fixed. */
export function sampleSceneryFrame(animation:SceneryAnimation,id:string,seconds:number):string {
  const time=Number.isFinite(seconds)?Math.max(0,seconds):0;
  const phase=sceneryPhase(id)/(Math.PI*2)*animation.frames.length;
  return animation.frames[Math.floor(time*animation.fps+phase)%animation.frames.length];
}
