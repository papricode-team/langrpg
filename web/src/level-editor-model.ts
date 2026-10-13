import {assertPrefabEditable,duplicatePrefabInstances,preservePrefabPlacement,sceneInstanceIds} from './level-editor-prefabs';
import { parseWorldSceneDocument, sceneActivityUsers, type WorldScene, type WorldSceneDocument, type SceneScenery } from './scene-schema';

export interface EditorDraft { version: 1; baseRevision: string; savedAt: string; document: WorldSceneDocument; }
const clone = <T>(value: T): T => structuredClone(value);

/** Commands retain complete authored data, including fields this editor does not expose. */
export class LevelEditorHistory {
  document: WorldSceneDocument;
  private past: WorldSceneDocument[] = [];
  private future: WorldSceneDocument[] = [];
  private transaction?: WorldSceneDocument;
  constructor(document: WorldSceneDocument) { this.document = clone(document); }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  begin(): void { this.transaction ??= clone(this.document); }
  preview(scene: WorldScene): void {
    this.document = { ...this.document, maps: { ...this.document.maps, [scene.id]: clone(scene) } };
  }
  commit(): boolean {
    const previous = this.transaction;
    this.transaction = undefined;
    if (!previous || JSON.stringify(previous) === JSON.stringify(this.document)) return false;
    this.past.push(previous);
    if (this.past.length > 60) this.past.shift();
    this.future = [];
    return true;
  }
  cancel(): void { if (this.transaction) this.document = this.transaction; this.transaction = undefined; }
  edit(scene: WorldScene): void { this.begin(); this.preview(scene); this.commit(); }
  replace(document: WorldSceneDocument): void { this.begin(); this.document = clone(document); this.commit(); }
  undo(): void {
    this.cancel(); const previous = this.past.pop(); if (!previous) return;
    this.future.push(this.document); this.document = previous;
  }
  redo(): void {
    this.cancel(); const next = this.future.pop(); if (!next) return;
    this.past.push(this.document); this.document = next;
  }
}

export function nextSceneryId(scene: WorldScene, asset: string): string {
  const used = sceneInstanceIds(scene);
  let sequence = 1;
  while (used.has(`${scene.id}-${asset}-${sequence}`)) sequence++;
  return `${scene.id}-${asset}-${sequence}`;
}

export function duplicateScenery(scene: WorldScene, selected: ReadonlySet<string>): { scene: WorldScene; ids: string[] } {
  const next = clone(scene), ids: string[] = [];
  const owners = new Map<string,string>();
  const copies=scene.scenery.filter(item=>selected.has(item.id));
  const moved=sceneryTranslation(scene,new Map(copies.map(item=>[item.id,{x:item.x,y:item.y}])),24,24);
  const groups=new Map<string,string>(),usedGroups=sceneInstanceIds(scene);
  for(const source of copies)if(source.groupId&&copies.filter(item=>item.groupId===source.groupId).length>1&&!groups.has(source.groupId)) {
    let sequence=1;while(usedGroups.has(`${scene.id}-group-${sequence}`))sequence++;
    const id=`${scene.id}-group-${sequence}`;groups.set(source.groupId,id);usedGroups.add(id);
  }
  for (const source of copies) {
    const item: SceneScenery = { ...source, id: nextSceneryId(next, source.asset),
      ...moved.get(source.id)! };
    // A manually duplicated instance is independent of its generator batch.
    delete item.generatorId; delete item.groupId;
    if(source.groupId&&groups.has(source.groupId))item.groupId=groups.get(source.groupId);
    next.scenery = [...next.scenery, item]; ids.push(item.id);
    owners.set(source.id,item.id);
  }
  // Activities belong to the copied furniture. Room entrances stay unique and
  // must be reassigned explicitly, so duplicating a café cannot steal its door.
  const activities = [...(next.activities??[])],activityIds=new Map<string,string>(),usedIds=sceneInstanceIds(next);
  for (const slot of scene.activities??[]) if (owners.has(slot.ownerId)) {
    const ownerId=owners.get(slot.ownerId)!;let suffix=1;
    while(usedIds.has(`${ownerId}-${slot.kind}-${suffix}`))suffix++;
    const id=`${ownerId}-${slot.kind}-${suffix}`;activityIds.set(slot.id,id);usedIds.add(id);
    activities.push({...clone(slot),id,ownerId});
  }
  if(next.activities!==undefined||activities.length)next.activities=activities;
  return { scene: duplicatePrefabInstances(scene,next,owners,activityIds), ids };
}

export function removeScenery(scene:WorldScene, selected:ReadonlySet<string>):WorldScene {
  assertPrefabEditable(scene,selected);
  const doors=(scene.entrances??[]).filter(door=>selected.has(door.ownerId));
  if(doors.length)throw new Error(`Reassign or remove these attached entrances before deleting the storefront: ${doors.map(door=>door.id).join(', ')}.`);
  const tasks=sceneActivityUsers(scene,new Set(scene.activities?.filter(slot=>selected.has(slot.ownerId)).map(slot=>slot.id)));
  if(tasks.length)throw new Error(`Reassign these resident tasks before deleting their activity objects: ${tasks.join(', ')}.`);
  return {...scene,scenery:scene.scenery.filter(item=>!selected.has(item.id)),
    activities:scene.activities?.filter(slot=>!selected.has(slot.ownerId)),
    generationZones:scene.generationZones?.map(zone=>({...zone,pinnedIds:zone.pinnedIds?.filter(id=>!selected.has(id))}))};
}

/** An object edit also transforms its authored usable positions in one undo step. */
export function editScenery(scene:WorldScene, selected:ReadonlySet<string>, changes:Partial<SceneScenery>):WorldScene {
  assertPrefabEditable(scene,selected);
  const scenery=scene.scenery.map(item=>{
    if(!selected.has(item.id))return item;
    const next={...item,...changes,...(item.generatorId&&changes.pinned===undefined?{pinned:true}:{})};
    if((changes.asset!==undefined||changes.frame!==undefined)&&changes.collision===undefined)delete next.collision;
    return next;
  });
  const transform=<T extends {ownerId:string;offsetX:number;offsetY:number;approach?:{x:number;y:number};exit?:{x:number;y:number};returnOffset?:{x:number;y:number};places?:{x:number;y:number}[]}>(item:T):T=>{
    if(!selected.has(item.ownerId))return item;
    const before=scene.scenery.find(value=>value.id===item.ownerId)!,after=scenery.find(value=>value.id===item.ownerId)!;
    const scale=after.width/before.width, mirror=!!before.flipX===!!after.flipX?1:-1;
    const point=(p:{x:number;y:number})=>({x:p.x*scale*mirror,y:p.y*scale});
    return {...item,offsetX:item.offsetX*scale*mirror,offsetY:item.offsetY*scale,
      ...(item.approach?{approach:point(item.approach)}:{}),...(item.exit?{exit:point(item.exit)}:{}),
      ...(item.returnOffset?{returnOffset:point(item.returnOffset)}:{}),...(item.places?{places:item.places.map(point)}:{})};
  };
  return preservePrefabPlacement(scene,{...scene,scenery,...(scene.activities?{activities:scene.activities.map(transform)}:{}),...(scene.entrances?{entrances:scene.entrances.map(transform)}:{})});
}

export function groupScenery(scene:WorldScene,selected:ReadonlySet<string>):WorldScene {
  assertPrefabEditable(scene,selected);
  if(selected.size<2)return scene;
  const used=sceneInstanceIds(scene);
  let sequence=1;while(used.has(`${scene.id}-group-${sequence}`))sequence++;
  return {...scene,scenery:scene.scenery.map(item=>selected.has(item.id)?{...item,groupId:`${scene.id}-group-${sequence}`}:item)};
}
export function ungroupScenery(scene:WorldScene,selected:ReadonlySet<string>):WorldScene {
  assertPrefabEditable(scene,selected);
  const groups=new Set(scene.scenery.filter(item=>selected.has(item.id)).map(item=>item.groupId).filter(Boolean));
  return {...scene,scenery:scene.scenery.map(item=>{
    if(!item.groupId||!groups.has(item.groupId))return item;
    const result={...item};delete result.groupId;return result;
  })};
}
export function scenerySelection(scene:WorldScene,id:string,individual=false):string[] {
  const item=scene.scenery.find(value=>value.id===id);if(!item)return [];
  return !individual&&item.groupId?scene.scenery.filter(value=>value.groupId===item.groupId).map(value=>value.id):[id];
}

/** Clamp one common translation, so dragging against an edge never squashes a group. */
export function sceneryTranslation(scene:WorldScene,positions:ReadonlyMap<string,{x:number;y:number}>,dx:number,dy:number,snap=0):Map<string,{x:number;y:number}> {
  const items=scene.scenery.filter(item=>positions.has(item.id));if(!items.length)return new Map();
  const anchor=positions.get(items[0].id)!;
  if(snap){dx=Math.round((anchor.x+dx)/snap)*snap-anchor.x;dy=Math.round((anchor.y+dy)/snap)*snap-anchor.y;}
  const lowX=Math.max(...items.map(item=>-item.width-positions.get(item.id)!.x));
  const highX=Math.min(...items.map(item=>scene.width+item.width-positions.get(item.id)!.x));
  const lowY=Math.max(...items.map(item=>-item.width-positions.get(item.id)!.y));
  const highY=Math.min(...items.map(item=>scene.height+item.width-positions.get(item.id)!.y));
  dx=Math.max(lowX,Math.min(highX,dx));dy=Math.max(lowY,Math.min(highY,dy));
  return new Map(items.map(item=>{const p=positions.get(item.id)!;return[item.id,{x:p.x+dx,y:p.y+dy}];}));
}

export function makeDraft(document: WorldSceneDocument, baseRevision: string): EditorDraft {
  return { version: 1, document: clone(document), baseRevision, savedAt: new Date().toISOString() };
}

export function readDraft(raw: string): EditorDraft {
  const value = JSON.parse(raw) as EditorDraft;
  if (value.version !== 1 || typeof value.baseRevision !== 'string' || typeof value.savedAt !== 'string') throw new Error('This draft has an unsupported format.');
  return { ...value, document: parseWorldSceneDocument(value.document) };
}
