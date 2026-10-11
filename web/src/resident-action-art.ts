import type {ActivityResidentSample} from './resident-activities';

/** Painted looks are explicit choices, never inferred from a resident's name. */
export const residentActionLooks = {
  anne:{label:'Blonde · lilac jacket',avatar:{hair:'#d7ae61',skin:'#ecc4a2',outfit:'#797197'}},
  ella:{label:'Brown hair · blue jacket',avatar:{hair:'#62412f',skin:'#c18b60',outfit:'#4e729a'}},
  karl:{label:'Black hair · sage jacket',avatar:{hair:'#302b2d',skin:'#ecc4a2',outfit:'#75855f'}},
  mila:{label:'Auburn hair · green jacket',avatar:{hair:'#7a492b',skin:'#bc855b',outfit:'#52784b'}},
} as const;
export type ResidentActionLook=keyof typeof residentActionLooks;
export const residentActionFrames=['idle','read','read-turn','sit','work','work-down','serve','greet','carry','carry-left','carry-pass','carry-right'] as const;
export const RESIDENT_ACTION_ART={width:128,height:192,bodyHeight:142,footY:.9,columns:4,rows:3};
export const residentActionKey=(mapId:string,look:ResidentActionLook):string=>`${mapId}-resident-actions-${look}`;
export interface ResidentActionPose {frame:typeof residentActionFrames[number];bakedObject?:ActivityResidentSample['heldObject'];}
export function residentSeatedOffset(sample:ActivityResidentSample,reducedMotion:boolean):number {
  if(sample.seatedOffsetY===undefined)return 0;
  const blend=reducedMotion?1:Math.max(0,Math.min(1,(sample.segmentSeconds??sample.phaseSeconds)/.3,((sample.phaseDurationSeconds??Infinity)-sample.phaseSeconds)/.3));
  return sample.seatedOffsetY*blend*blend*(3-2*blend);
}

/** Shared phase time and route distance reconstruct poses without frame replay. */
export function residentActionPose(sample:ActivityResidentSample,reducedMotion:boolean):ResidentActionPose|undefined {
  if((sample.phase==='return'||sample.phase==='travel')&&sample.heldObject==='parcel'){
    const frames=['carry-left','carry-pass','carry-right','carry-pass'] as const;
    return {frame:reducedMotion||!sample.moving?'carry':frames[Math.floor(Math.max(0,sample.walkDistance)%64/16)],bakedObject:'parcel'};
  }
  if(sample.phase!=='act')return;
  if(sample.action==='shelter'&&sample.heldObject==='parcel')return {frame:'carry',bakedObject:'parcel'};
  const seconds=reducedMotion?0:Math.max(0,sample.phaseSeconds);
  switch(sample.action){
    case 'read':return sample.heldObject==='book'?{frame:seconds%8>=6.8?'read-turn':'read',bakedObject:'book'}:{frame:'sit'};
    case 'sit':return {frame:'sit'};
    case 'work':return sample.heldObject==='parcel'?{frame:'carry',bakedObject:'parcel'}:sample.heldObject==='tool'?{frame:seconds%2.4>=1.2?'work-down':'work',bakedObject:'tool'}:{frame:'serve'};
    case 'carry':return sample.heldObject==='parcel'?{frame:'carry',bakedObject:'parcel'}:undefined;
    case 'serve':return {frame:seconds%4<2.8?'serve':'idle'};
    case 'greet':return {frame:seconds%5<2.5?'greet':'idle'};
    default:return {frame:'idle'};
  }
}
