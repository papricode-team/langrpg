import {scenerySelection} from './level-editor-model';
import type {SceneScenery, WorldScene} from './scene-schema';

export interface EditorViewState {hidden: Set<string>; locked: Set<string>}
export interface SelectionBounds {x:number; y:number; width:number; height:number}
export const emptyEditorView = ():EditorViewState => ({hidden:new Set(),locked:new Set()});

/** View aids are device-local and never change published art or navigation. */
export function readEditorView(raw:string|null):EditorViewState {
  try {
    const value:unknown=JSON.parse(raw??'null');
    if(!value||typeof value!=='object'||!('version' in value)||value.version!==1)return emptyEditorView();
    const record=value as Record<string,unknown>;
    const ids=(key:'hidden'|'locked'):Set<string>=>{const entries=record[key];return new Set(Array.isArray(entries)?entries.filter((id:unknown):id is string=>typeof id==='string'):[]);};
    return {hidden:ids('hidden'),locked:ids('locked')};
  } catch{return emptyEditorView();}
}
export function writeEditorView(view:EditorViewState):string {
  return JSON.stringify({version:1,hidden:[...view.hidden].sort(),locked:[...view.locked].sort()});
}
export function lockedScenery(scene:WorldScene,view:EditorViewState):Set<string> {
  return new Set([...view.locked,...(scene.prefabInstances??[]).filter(copy=>copy.locked).flatMap(copy=>copy.members.map(member=>member.id))]);
}
export function assertEditorViewEditable(before:WorldScene,after:WorldScene,view:EditorViewState):void {
  // Include owner-relative positions: source updates must not move a locked seat
  // indirectly by changing the activity while keeping its furniture unchanged.
  const record=(world:WorldScene,id:string):unknown=>({
    object:world.scenery.find(item=>item.id===id),
    activities:world.activities?.filter(item=>item.ownerId===id),
    entrances:world.entrances?.filter(item=>item.ownerId===id),
  });
  const affected=[...view.locked].filter(id=>before.scenery.some(item=>item.id===id)&&JSON.stringify(record(before,id))!==JSON.stringify(record(after,id)));
  if(affected.length)throw Error(`Unlock these objects in Placed objects before changing them: ${affected.join(', ')}.`);
}
export function districtForScenery(scene:WorldScene,item:SceneScenery):string {
  const {x,y}=item;
  return scene.districts.find(district=>{
    let inside=false;const points=district.polygon;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const [ax,ay]=points[j],[bx,by]=points[i];
      const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
      if(Math.abs(cross)<1e-7&&x>=Math.min(ax,bx)&&x<=Math.max(ax,bx)&&y>=Math.min(ay,by)&&y<=Math.max(ay,by))return true;
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
    }
    return inside;
  })?.id??'';
}
/** Box selection uses visible sprite rectangles, in either drag direction. */
export function marqueeSelection(scene:WorldScene,start:{x:number;y:number},end:{x:number;y:number},bounds:(item:SceneScenery)=>SelectionBounds,hidden:ReadonlySet<string>,individual=false):string[] {
  const left=Math.min(start.x,end.x),right=Math.max(start.x,end.x),top=Math.min(start.y,end.y),bottom=Math.max(start.y,end.y);
  const ids=new Set<string>();
  for(const item of scene.scenery){
    if(hidden.has(item.id))continue;
    const b=bounds(item);
    if(b.x>right||b.x+b.width<left||b.y>bottom||b.y+b.height<top)continue;
    for(const id of scenerySelection(scene,item.id,individual))if(!hidden.has(id))ids.add(id);
  }
  return [...ids];
}
