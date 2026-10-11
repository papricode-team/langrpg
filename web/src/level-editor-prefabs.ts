import type {SceneActivity,ScenePoint,ScenePrefab,ScenePrefabInstance,SceneScenery,WorldScene,WorldSceneDocument} from './scene-schema';
import {sceneActivityUsers} from './scene-schema.ts';

const clone=<T>(value:T):T=>structuredClone(value);
const ordered=(value:unknown):unknown=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>[key,ordered(entry)])):value;
const equal=(a:unknown,b:unknown):boolean=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
function unique(seed:string,used:Set<string>):string {let id=seed,n=1;while(used.has(id))id=`${seed}-${n++}`;used.add(id);return id;}
function childData(item:SceneScenery):SceneScenery {const value=clone(item);delete value.groupId;delete value.generatorId;delete value.pinned;return value;}
/** Deleted prefab children still own their IDs until the copy is detached. */
export function sceneInstanceIds(scene:WorldScene):Set<string> {
  return new Set([
    ...scene.scenery.flatMap(item=>item.groupId?[item.id,item.groupId]:[item.id]),
    ...(scene.activities??[]).map(item=>item.id),
    ...(scene.entrances??[]).map(item=>item.id),
    ...(scene.prefabInstances??[]).flatMap(instance=>[instance.id,...instance.members.map(member=>member.id),...instance.activities.map(slot=>slot.id)]),
  ]);
}
function merged<T extends object>(base:T,current:T,next:T,keep:Set<string>,diagnostics:string[],label:string):T {
  const result={...next} as Record<string,unknown>,before=base as Record<string,unknown>,ours=current as Record<string,unknown>;
  for(const key of new Set([...Object.keys(base),...Object.keys(current),...Object.keys(next)])){
    if(keep.has(key)||!equal(before[key],ours[key])){
      if(ours[key]===undefined)delete result[key];else result[key]=clone(ours[key]);
      if(!keep.has(key)&&!equal(before[key],ours[key])&&!equal(ours[key],(next as Record<string,unknown>)[key]))diagnostics.push(`${label}: kept local ${key}.`);
    }
  }
  return result as T;
}

export function selectedPrefabInstance(scene:WorldScene,selected:ReadonlySet<string>):ScenePrefabInstance|undefined {
  if(!selected.size)return;
  return scene.prefabInstances?.find(instance=>[...selected].every(id=>instance.members.some(member=>member.id===id)));
}
export function assertPrefabEditable(scene:WorldScene,ids:ReadonlySet<string>):void {
  if(scene.prefabInstances?.some(instance=>instance.locked&&instance.members.some(member=>ids.has(member.id))))throw Error('Unlock the prefab copy before editing, deleting or updating it.');
}
export function setPrefabLocked(scene:WorldScene,id:string,locked:boolean):WorldScene {
  return {...scene,prefabInstances:scene.prefabInstances?.map(instance=>{
    if(instance.id!==id)return instance;const next={...instance};if(locked)next.locked=true;else delete next.locked;return next;
  })};
}

export function stampPrefab(scene:WorldScene,prefab:ScenePrefab,origin:ScenePoint):{scene:WorldScene;ids:string[]} {
  const next=clone(scene),used=sceneInstanceIds(next);
  const id=unique(`${scene.id}-${prefab.id}`,used);
  const instance:ScenePrefabInstance={id,prefabId:prefab.id,revision:prefab.revision,origin:clone(origin),members:[],activities:[]};
  for(const child of prefab.scenery){
    const item={...clone(child),id:unique(`${id}-${child.id}`,used),x:origin.x+child.x,y:origin.y+child.y,groupId:id};
    next.scenery.push(item);instance.members.push({key:child.id,id:item.id,base:clone(item)});
  }
  for(const activity of prefab.activities){
    const ownerId=instance.members.find(member=>member.key===activity.ownerId)!.id;
    const slot={...clone(activity),id:unique(`${id}-${activity.id}`,used),ownerId};
    (next.activities??=[]).push(slot);instance.activities.push({key:activity.id,id:slot.id,base:clone(slot)});
  }
  (next.prefabInstances??=[]).push(instance);
  return {scene:next,ids:instance.members.map(member=>member.id)};
}

/** Common group translations move the baseline too; child edits stay overrides. */
export function preservePrefabPlacement(before:WorldScene,after:WorldScene):WorldScene {
  if(!before.prefabInstances?.length)return after;
  return {...after,prefabInstances:before.prefabInstances.map(instance=>{
    const pairs=instance.members.map(member=>({before:before.scenery.find(item=>item.id===member.id),after:after.scenery.find(item=>item.id===member.id)})).filter(pair=>pair.before&&pair.after);
    if(!pairs.length)return instance;
    const dx=pairs[0].after!.x-pairs[0].before!.x,dy=pairs[0].after!.y-pairs[0].before!.y;
    if((dx===0&&dy===0)||pairs.some(pair=>Math.abs(pair.after!.x-pair.before!.x-dx)>1e-8||Math.abs(pair.after!.y-pair.before!.y-dy)>1e-8))return instance;
    // A surviving single child is still the whole group. Deletion tombstones
    // move with it so a later revision cannot resurrect a child at its old spot.
    return {...instance,origin:{x:instance.origin.x+dx,y:instance.origin.y+dy},members:instance.members.map(member=>({...member,base:{...member.base,x:member.base.x+dx,y:member.base.y+dy}}))};
  })};
}

export interface PrefabUpdate {scene:WorldScene;added:SceneScenery[];removedIds:string[];changedIds:string[];diagnostics:string[];}
export function previewPrefabUpdate(scene:WorldScene,prefab:ScenePrefab,instanceId:string):PrefabUpdate {
  const next=clone(scene),instance=next.prefabInstances?.find(item=>item.id===instanceId);
  if(!instance||instance.prefabId!==prefab.id)throw Error('Select a copy of this prefab first.');
  assertPrefabEditable(scene,new Set(instance.members.map(member=>member.id)));
  const diagnostics:string[]=[],used=sceneInstanceIds(next);
  const members:ScenePrefabInstance['members']=[],slots:ScenePrefabInstance['activities']=[];
  for(const child of prefab.scenery){
    const old=instance.members.find(member=>member.key===child.id),id=old?.id??unique(`${instance.id}-${child.id}`,used);
    const desired={...clone(child),id,x:instance.origin.x+child.x,y:instance.origin.y+child.y,groupId:instance.id};
    const current=next.scenery.find(item=>item.id===id);
    if(old&&current){
      next.scenery=next.scenery.map(item=>item.id===id?merged(old.base,current,desired,new Set(['id','groupId','generatorId','pinned']),diagnostics,id):item);
    }else if(!old){next.scenery.push(desired);}
    else diagnostics.push(`${id}: kept local deletion.`);
    members.push({key:child.id,id,base:clone(desired)});
  }
  // Removed defaults with local changes, doors or independent activities survive
  // as detached objects. Updates cannot silently remove an authored entrance.
  for(const old of instance.members.filter(member=>!members.some(next=>next.key===member.key))){
    const current=next.scenery.find(item=>item.id===old.id);if(!current)continue;
    const attached=next.entrances?.some(door=>door.ownerId===old.id)||(next.activities??[]).some(slot=>slot.ownerId===old.id&&(!instance.activities.some(record=>record.id===slot.id)||sceneActivityUsers(next,new Set([slot.id])).length>0));
    const changedActivity=instance.activities.some(record=>record.base.ownerId===old.id&&next.activities?.some(slot=>slot.id===record.id&&!equal(slot,record.base)));
    if(attached||changedActivity||current.pinned||!equal(current,old.base)){
      next.scenery=next.scenery.map(item=>{if(item.id!==old.id)return item;const detached={...item};delete detached.groupId;return detached;});
      diagnostics.push(`${old.id}: retained as an independent object because it has local changes or attached content.`);
    }else next.scenery=next.scenery.filter(item=>item.id!==old.id);
  }
  for(const activity of prefab.activities){
    const owner=members.find(member=>member.key===activity.ownerId)!;
    const old=instance.activities.find(slot=>slot.key===activity.id),id=old?.id??unique(`${instance.id}-${activity.id}`,used);
    const desired={...clone(activity),id,ownerId:owner.id};
    const current=next.activities?.find(slot=>slot.id===id);
    if(next.scenery.some(item=>item.id===owner.id)){
      if(old&&current){
        next.activities=next.activities!.map(slot=>slot.id===id?merged(old.base,current,desired,new Set(['id']),diagnostics,id):slot);
      }else if(!old)(next.activities??=[]).push(desired);
      else diagnostics.push(`${id}: kept local deletion.`);
    }
    slots.push({key:activity.id,id,base:clone(desired)});
  }
  for(const old of instance.activities.filter(slot=>!slots.some(next=>next.key===slot.key))){
    const current=next.activities?.find(slot=>slot.id===old.id);if(!current)continue;
    const detached=next.scenery.some(item=>item.id===current.ownerId)&&!members.some(member=>member.id===current.ownerId);
    if(detached||!equal(current,old.base)||sceneActivityUsers(next,new Set([old.id])).length)diagnostics.push(`${old.id}: retained its authored activity.`);
    else next.activities=next.activities?.filter(slot=>slot.id!==old.id);
  }
  next.activities=next.activities?.filter(slot=>next.scenery.some(item=>item.id===slot.ownerId));
  const transformAttached=<T extends {ownerId:string;offsetX:number;offsetY:number;approach?:ScenePoint;exit?:ScenePoint;returnOffset?:ScenePoint;places?:ScenePoint[]}>(slot:T):T=>{
    const before=scene.scenery.find(item=>item.id===slot.ownerId),after=next.scenery.find(item=>item.id===slot.ownerId);
    if(!before||!after)return slot;
    const scale=after.width/before.width,mirror=!!before.flipX===!!after.flipX?1:-1;
    if(scale===1&&mirror===1)return slot;
    const point=(p:ScenePoint):ScenePoint=>({x:p.x*scale*mirror,y:p.y*scale});
    return {...slot,offsetX:slot.offsetX*scale*mirror,offsetY:slot.offsetY*scale,
      ...(slot.approach?{approach:point(slot.approach)}:{}),...(slot.exit?{exit:point(slot.exit)}:{}),
      ...(slot.returnOffset?{returnOffset:point(slot.returnOffset)}:{}),...(slot.places?{places:slot.places.map(point)}:{})};
  };
  // Unique doors and independently authored activities are not prefab defaults,
  // but still follow their owning object's scale and supported orientation.
  if(next.entrances)next.entrances=next.entrances.map(transformAttached);
  if(next.activities)next.activities=next.activities.map(slot=>instance.activities.some(record=>record.id===slot.id)||slots.some(record=>record.id===slot.id)?slot:transformAttached(slot));
  Object.assign(instance,{revision:prefab.revision,members,activities:slots});
  const added=next.scenery.filter(item=>!scene.scenery.some(old=>old.id===item.id));
  const removedIds=scene.scenery.filter(item=>!next.scenery.some(next=>next.id===item.id)).map(item=>item.id);
  const changedIds=next.scenery.filter(item=>scene.scenery.some(old=>old.id===item.id&&!equal(old,item))).map(item=>item.id);
  const activityChanges=(next.activities??[]).filter(slot=>!equal(scene.activities?.find(old=>old.id===slot.id),slot));
  const removedActivities=(scene.activities??[]).filter(slot=>!next.activities?.some(next=>next.id===slot.id));
  for(const slot of activityChanges){const owner=next.scenery.find(item=>item.id===slot.ownerId)!;diagnostics.push(`${slot.id}: ${slot.kind} at ${Math.round(owner.x+slot.offsetX)}, ${Math.round(owner.y+slot.offsetY)}.`);}
  diagnostics.unshift(`${added.length} objects added, ${changedIds.length} changed, ${removedIds.length} removed; ${activityChanges.length} activity positions changed, ${removedActivities.length} removed.`);
  return {scene:next,added,removedIds,changedIds,diagnostics};
}

export function detachPrefab(scene:WorldScene,instanceId:string):WorldScene {
  const instance=scene.prefabInstances?.find(item=>item.id===instanceId);
  if(instance)assertPrefabEditable(scene,new Set(instance.members.map(member=>member.id)));
  return {...scene,prefabInstances:scene.prefabInstances?.filter(instance=>instance.id!==instanceId)};
}

/** Capture placed objects and usable positions; doors remain unique scene content. */
export function savePrefabFromSelection(document:WorldSceneDocument,mapId:string,selected:ReadonlySet<string>,name:string,updateId?:string):WorldSceneDocument {
  name=name.trim();if(!name||name.length>100)throw Error('Give the reusable group a name of 1–100 characters.');
  const next=clone(document),scene=next.maps[mapId],items=scene.scenery.filter(item=>selected.has(item.id));
  if(!items.length||items.length>200)throw Error('Select 1–200 objects to save as a reusable group.');
  assertPrefabEditable(scene,selected);
  const existing=updateId?scene.prefabInstances?.find(instance=>instance.id===updateId):undefined;
  if(updateId&&!existing)throw Error('This prefab instance is no longer present.');
  if(existing?.members.some(member=>scene.scenery.some(item=>item.id===member.id)&&!selected.has(member.id)))throw Error('Select the whole prefab group before publishing its revision.');
  if(scene.prefabInstances?.some(instance=>instance.id!==existing?.id&&instance.members.some(member=>selected.has(member.id))))throw Error('Detach existing prefab groups before combining them into a new prefab.');
  const used=new Set((next.prefabs??[]).map(prefab=>prefab.id));
  const id=existing?.prefabId??unique('group',used),previous=next.prefabs?.find(prefab=>prefab.id===id);
  const origin=existing?.origin??{x:items[0].x,y:items[0].y};
  const memberKeys=new Map(items.map(item=>[item.id,existing?.members.find(member=>member.id===item.id)?.key??item.id]));
  const prefab:ScenePrefab={id,name,revision:(previous?.revision??0)+1,
    scenery:items.map(item=>({...childData(item),id:memberKeys.get(item.id)!,x:item.x-origin.x,y:item.y-origin.y})),
    activities:(scene.activities??[]).filter(slot=>selected.has(slot.ownerId)).map(slot=>({...clone(slot),id:existing?.activities.find(record=>record.id===slot.id)?.key??slot.id,ownerId:memberKeys.get(slot.ownerId)!}))};
  next.prefabs=previous?next.prefabs!.map(value=>value.id===id?prefab:value):[...(next.prefabs??[]),prefab];
  const instanceId=existing?.id??unique(`${scene.id}-${id}`,sceneInstanceIds(scene));
  scene.scenery=scene.scenery.map(item=>selected.has(item.id)?{...item,groupId:instanceId}:item);
  const instance:ScenePrefabInstance={id:instanceId,prefabId:id,revision:prefab.revision,origin:clone(origin),
    members:scene.scenery.filter(item=>selected.has(item.id)).map(item=>({key:memberKeys.get(item.id)!,id:item.id,base:clone(item)})),
    activities:(scene.activities??[]).filter(slot=>selected.has(slot.ownerId)).map(slot=>({key:existing?.activities.find(record=>record.id===slot.id)?.key??slot.id,id:slot.id,base:clone(slot)}))};
  scene.prefabInstances=existing?scene.prefabInstances!.map(value=>value.id===instanceId?instance:value):[...(scene.prefabInstances??[]),instance];
  return next;
}

/** Full copies retain their prefab lineage; partial copies become ordinary props. */
export function duplicatePrefabInstances(before:WorldScene,after:WorldScene,owners:Map<string,string>,activities:Map<string,string>):WorldScene {
  const next=clone(after),used=sceneInstanceIds(next);
  for(const source of before.prefabInstances??[]){
    const live=source.members.filter(member=>before.scenery.some(item=>item.id===member.id));
    if(!live.length||live.some(member=>!owners.has(member.id)))continue;
    const first=live[0],old=before.scenery.find(item=>item.id===first.id)!,copy=next.scenery.find(item=>item.id===owners.get(first.id))!;
    const dx=copy.x-old.x,dy=copy.y-old.y;
    const id=unique(`${source.id}-copy`,used),ids=new Map(source.members.map(member=>[member.id,owners.get(member.id)??unique(`${id}-${member.key}`,used)]));
    const members=source.members.map(member=>({key:member.key,id:ids.get(member.id)!,base:{...clone(member.base),id:ids.get(member.id)!,x:member.base.x+dx,y:member.base.y+dy,groupId:id}}));
    next.scenery=next.scenery.map(item=>members.some(member=>member.id===item.id)?{...item,groupId:id}:item);
    (next.prefabInstances??=[]).push({...clone(source),id,origin:{x:source.origin.x+dx,y:source.origin.y+dy},members,
      activities:source.activities.map(slot=>{const slotId=activities.get(slot.id)??unique(`${id}-${slot.key}`,used);return {key:slot.key,id:slotId,base:{...clone(slot.base),id:slotId,ownerId:ids.get(slot.base.ownerId)!}};})});
  }
  return next;
}
