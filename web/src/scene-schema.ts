import {residentActionLooks,type ResidentActionLook} from './resident-action-art.ts';
import sceneryGeometry from './data/scenery-geometry.json' with {type:'json'};
/** Canonical scene coordinates are world units, independent of image resolution. */
export interface ScenePoint { x: number; y: number; }
export type ScenePolygon = readonly (readonly [number, number])[];
export interface SceneryGeometry {
  referenceWidth: number;
  footprint?: ScenePolygon;
  sortLine?: readonly (readonly [number, number])[];
  /** Painted opening relative to the foot anchor, in reference pixels. */
  door?: {x:number;y:number;width:number;height:number};
}
export function getSceneryGeometryMap(mapId:string):{assets:Readonly<Record<string,SceneryGeometry>>} {
  return (sceneryGeometry as unknown as Record<string,{assets:Record<string,SceneryGeometry>}>)[mapId]??{assets:{}};
}
export const getSceneryGeometry=(mapId:string,placement:{asset:string;frame?:string}):SceneryGeometry|undefined=>
  getSceneryGeometryMap(mapId).assets[placement.frame??placement.asset];
export const PERSON_HEIGHT=72;
/** Height ranges are expressed in adults, independent of texture resolution. */
export const scaleCanon:Readonly<Record<string,readonly [number,number]>>={
  house:[2.6,3],archive:[3.5,4.5],cafe:[3.5,4.5],station:[3.5,4.5],workshop:[3.5,4.5],
  greenhouse:[2.6,3.5],tree:[1.5,3],cypress:[1.5,3],lamp:[1.2,1.4],bench:[.5,.7],
  stall:[1.6,2],fountain:[1.2,2.2],arch:[2,3.5],planter:[.5,1.1],sign:[.8,1.5],boat:[.7,1.8],
};
export interface SceneAnchor extends ScenePoint { id: string; minigame?: string; }
export const sceneSceneryAssets = ['archive', 'cafe', 'station', 'workshop', 'house', 'tree', 'cypress', 'lamp', 'stall', 'fountain', 'arch', 'greenhouse', 'boat', 'bench', 'planter', 'sign'] as const;
export interface SceneScenery extends SceneAnchor {
  asset: typeof sceneSceneryAssets[number];
  frame?: string; variant?: boolean; width: number; depth?: number;
  motion?: 'tree' | 'cloth' | 'boat' | 'lamp' | 'building' | 'water' | 'still';
  flipX?: boolean; collidable?: boolean;
  sortLine?: readonly (readonly [number,number])[];
  groupId?: string; generatorId?: string; pinned?: boolean;
}
export interface SceneTerrain extends ScenePoint {
  id: string; width: number; height: number; dayAsset: string; nightAsset?: string;
  /** Visible texture pixels, excluding the guard band used at adjoining edges. */
  dayCrop?: ScenePoint & {width: number; height: number};
  nightCrop?: ScenePoint & {width: number; height: number};
  /** Source pixels per world unit. New terrain follows the detailed 4 px/unit format. */
  pixelDensity?: number;
  /** Lightweight overview layers used while nearby close-up artwork loads. */
  dayPreviewAsset?: string; nightPreviewAsset?: string;
  /** Authoring/navigation mask: one pixel per world unit, white is walkable ground. */
  walkableMaskAsset?: string;
}
export interface SceneDistrict { id: string; label?: string; polygon: ScenePolygon; }
export interface SceneActivity {
  id: string; ownerId: string; kind: 'seat' | 'work' | 'pickup' | 'service' | 'shelter' | 'wait';
  /** Offsets from the owning scenery foot anchor, in world units. */
  offsetX: number; offsetY: number; approach?: ScenePoint; exit?: ScenePoint;
  capacity?: number;
  /** Separate feet positions, relative to the activity offset, for shared seats/queues. */
  places?: ScenePoint[];
}
export const residentActions = ['wait','sit','read','carry','serve','work','greet','shelter'] as const;
export interface SceneResidentTask {
  id:string; activityId:string; action:typeof residentActions[number];
  startHour:number; endHour:number; durationSeconds:number;
  fallbackActivityId?:string; facing?:'left'|'right'; heldObject?:'book'|'parcel'|'tool';
  /** Customer visit coordinated with this resident's service block. */
  exchangeWith?:{residentId:string;taskId:string};
}
export interface SceneResident {
  id:string; name:string; home:ScenePoint; speed:number;
  avatar:{hair:string;skin:string;outfit:string}; artVariant?:number;
  actionArt?:ResidentActionLook;
  schedule:SceneResidentTask[];
}
export const sceneInteriorIds = ['cafe', 'bakery', 'supermarket', 'inn'] as const;
export interface SceneEntrance {
  id: string; ownerId: string; interiorId: typeof sceneInteriorIds[number];
  /** Walkable approach measured from the owning scenery foot anchor. */
  offsetX: number; offsetY: number;
  /** Outdoor return offset; defaults to one adult-height below a painted door. */
  returnOffset?: ScenePoint;
}
export interface SceneGenerationZone {
  id: string; polygon: ScenePolygon; seed: number; rulesVersion: number;
  palette: string[]; pinnedIds?: string[];
  count?: number; minSpacing?: number; clearance?: number; minScale?: number; maxScale?: number;
}
export interface ScenePrefab {
  id: string; name: string; revision: number;
  /** Local child coordinates; activity offsets remain owner-relative. */
  scenery: SceneScenery[]; activities: SceneActivity[];
}
export interface ScenePrefabInstance {
  id: string; prefabId: string; revision: number; origin: ScenePoint;
  locked?: boolean;
  /** Last accepted defaults. Missing live IDs record explicit local deletions. */
  members: {key: string; id: string; base: SceneScenery}[];
  activities: {key: string; id: string; base: SceneActivity}[];
}
export interface WorldScene {
  id: string; kind?: 'outdoor' | 'interior'; width: number; height: number;
  coordinateVersion: number; legacyOffset?: ScenePoint;
  spawn: ScenePoint; npcs: SceneAnchor[]; objects: SceneAnchor[];
  walkable: ScenePolygon[]; obstacles: ScenePolygon[]; scenery: SceneScenery[];
  terrain: SceneTerrain[]; districts: SceneDistrict[];
  activities?: SceneActivity[]; entrances?: SceneEntrance[]; generationZones?: SceneGenerationZone[];
  prefabInstances?: ScenePrefabInstance[];
  residents?: SceneResident[];
}
export interface WorldSceneDocument { version: 2; maps: Record<string, WorldScene>; prefabs?: ScenePrefab[]; }

export function sceneActivityPoint(scene: WorldScene, activity: SceneActivity): ScenePoint {
  const owner = scene.scenery.find(item => item.id === activity.ownerId);
  if (!owner) throw new Error(`Missing activity owner ${activity.ownerId}`);
  return {x: owner.x + activity.offsetX, y: owner.y + activity.offsetY};
}
export function sceneActivityPlaces(scene:WorldScene,activity:SceneActivity):ScenePoint[] {
  const origin=sceneActivityPoint(scene,activity);
  return (activity.places??[{x:0,y:0}]).map(point=>({x:origin.x+point.x,y:origin.y+point.y}));
}
export function sceneActivityUsers(scene:WorldScene,ids:ReadonlySet<string>):string[] {
  return (scene.residents??[]).flatMap(resident=>resident.schedule.filter(task=>ids.has(task.activityId)||!!task.fallbackActivityId&&ids.has(task.fallbackActivityId)).map(task=>`${resident.name}/${task.id}`));
}

export function sceneEntrancePoint(scene: WorldScene, entrance: SceneEntrance, returning = false): ScenePoint {
  const owner = scene.scenery.find(item => item.id === entrance.ownerId);
  if (!owner) throw new Error(`Missing entrance owner ${entrance.ownerId}`);
  const geometry=getSceneryGeometry(scene.id,owner),door=geometry?.door,scale=owner.width/(geometry?.referenceWidth??owner.width);
  const approach=door?{x:(door.x+door.width/2)*scale*(owner.flipX?-1:1),y:(door.y+door.height)*scale}:{x:entrance.offsetX,y:entrance.offsetY};
  const offset = returning ? entrance.returnOffset??{x:approach.x,y:approach.y+(door?PERSON_HEIGHT:0)} : approach;
  return {x:owner.x+offset.x,y:owner.y+offset.y};
}

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function fail(message: string): never { throw new Error(`Invalid world scene: ${message}`); }
const validId = (value: unknown): value is string => typeof value === 'string' && slug.test(value);
function point(value: unknown, label: string, width?: number, height?: number): asserts value is ScenePoint {
  if (!record(value) || !finite(value.x) || !finite(value.y)) fail(`${label} needs finite coordinates`);
  if (width !== undefined && height !== undefined && (value.x < 0 || value.x > width || value.y < 0 || value.y > height)) fail(`${label} is outside scene bounds`);
}
function positive(value: unknown, label: string, max = 65536): asserts value is number {
  if (!finite(value) || value <= 0 || value > max) fail(`${label} must be positive and at most ${max}`);
}
function polygon(value: unknown, label: string, width: number, height: number): asserts value is ScenePolygon {
  if (!Array.isArray(value) || value.length < 3 || value.length > 256) fail(`${label} needs 3–256 vertices`);
  const vertices = value as unknown[];
  for (const vertex of vertices) {
    if (!Array.isArray(vertex) || vertex.length !== 2) fail(`${label} has an invalid vertex`);
    point({x: vertex[0], y: vertex[1]}, `${label} vertex`, width, height);
  }
  const p = value as [number, number][];
  if (new Set(p.map(([x, y]) => `${x},${y}`)).size !== p.length) fail(`${label} repeats a vertex`);
  const area = Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
  if (area < 1) fail(`${label} has no usable area`);
  const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const within = (a: number[], b: number[], c: number[]) => c[0] >= Math.min(a[0], b[0]) && c[0] <= Math.max(a[0], b[0]) && c[1] >= Math.min(a[1], b[1]) && c[1] <= Math.max(a[1], b[1]);
  for (let i = 0; i < p.length; i++) for (let j = i + 2; j < p.length; j++) {
    if (i === 0 && j === p.length - 1) continue;
    const a = p[i], b = p[(i + 1) % p.length], c = p[j], d = p[(j + 1) % p.length];
    const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
    if ((abC * abD < 0 && cdA * cdB < 0) || (abC === 0 && within(a, b, c)) || (abD === 0 && within(a, b, d)) || (cdA === 0 && within(c, d, a)) || (cdB === 0 && within(c, d, b))) fail(`${label} crosses itself`);
  }
}
function list(value: unknown, label: string): asserts value is Record<string, unknown>[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const ids = new Set<string>();
  for (const item of value) {
    if (!record(item) || !validId(item.id)) fail(`${label} has an invalid ID`);
    if (ids.has(item.id)) fail(`${label} has duplicate ID ${item.id}`);
    ids.add(item.id);
  }
}
function assetPath(value: unknown, label: string): void {
  if (typeof value !== 'string' || !/^\/assets\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpg)$/.test(value)) fail(`${label} must be a local /assets image path`);
}

function prefabScenery(value:unknown,label:string):asserts value is SceneScenery {
  if(!record(value)||!validId(value.id))fail(`${label} needs a child ID`);
  point(value,label);positive(value.width,`${label} width`,8192);
  if(!sceneSceneryAssets.includes(value.asset as SceneScenery['asset']))fail(`${label} has unknown asset`);
  if(value.frame!==undefined&&!validId(value.frame))fail(`${label} has invalid frame`);
  if(value.depth!==undefined&&!finite(value.depth))fail(`${label} has invalid depth`);
  sortLine(value.sortLine,label);
  if(value.motion!==undefined&&!['tree','cloth','boat','lamp','building','water','still'].includes(String(value.motion)))fail(`${label} has invalid motion`);
  for(const key of ['variant','flipX','collidable','pinned'])if(value[key]!==undefined&&typeof value[key]!=='boolean')fail(`${label} has invalid ${key}`);
}
function sortLine(value:unknown,label:string):void {
  if(value===undefined)return;
  if(!Array.isArray(value)||value.length<2||value.length>32)fail(`${label} sort line needs 2–32 points`);
  for(const vertex of value){
    if(!Array.isArray(vertex)||vertex.length!==2||!vertex.every(finite))fail(`${label} sort line needs finite pairs`);
  }
  if(new Set(value.map(vertex=>vertex[0])).size!==value.length)fail(`${label} sort line must have distinct x coordinates`);
}
function prefabActivity(value:unknown,owners:Set<string>,label:string):asserts value is SceneActivity {
  if(!record(value)||!validId(value.id)||!owners.has(String(value.ownerId)))fail(`${label} has invalid owner or ID`);
  point({x:value.offsetX,y:value.offsetY},label);
  for(const key of ['approach','exit'])if(value[key]!==undefined)point(value[key],`${label} ${key}`);
  if(!['seat','work','pickup','service','shelter','wait'].includes(String(value.kind)))fail(`${label} has invalid kind`);
  if(value.capacity!==undefined&&(!Number.isInteger(value.capacity)||Number(value.capacity)<1))fail(`${label} has invalid capacity`);
  activityPlaces(value,label);
}
function activityPlaces(value:Record<string,unknown>,label:string):void {
  if(value.places===undefined)return;
  if(!Array.isArray(value.places)||value.places.length!==(value.capacity??1)||value.places.length>16)fail(`${label} needs one explicit feet position per capacity`);
  for(const place of value.places)point(place,`${label} place`);
  const places=value.places as ScenePoint[];
  if(places.some((p,i)=>places.slice(i+1).some(q=>Math.hypot(p.x-q.x,p.y-q.y)<16)))fail(`${label} places need at least 16 units separation`);
}
function prefabCatalog(value:unknown):asserts value is ScenePrefab[] {
  list(value,'prefab catalog');
  for(const prefab of value){
    if(typeof prefab.name!=='string'||!prefab.name.trim()||prefab.name.length>100||!Number.isInteger(prefab.revision)||Number(prefab.revision)<1)fail(`prefab ${prefab.id} needs a name and positive revision`);
    list(prefab.scenery,`prefab ${prefab.id} children`);list(prefab.activities,`prefab ${prefab.id} activities`);
    if(!prefab.scenery.length||prefab.scenery.length>200)fail(`prefab ${prefab.id} needs 1–200 children`);
    for(const child of prefab.scenery){
      prefabScenery(child,`prefab ${prefab.id} child`);
      if(child.groupId!==undefined||child.generatorId!==undefined||child.pinned!==undefined)fail(`prefab ${prefab.id} contains instance ownership`);
    }
    const owners=new Set(prefab.scenery.map(child=>String(child.id)));
    for(const activity of prefab.activities)prefabActivity(activity,owners,`prefab ${prefab.id} activity`);
  }
}

/** Pure structural validation. Content, file and path checks belong to the compiler. */
export function parseWorldSceneDocument(value: unknown): WorldSceneDocument {
  if (!record(value) || value.version !== 2 || !record(value.maps) || !Object.keys(value.maps).length) fail('expected version 2 and a nonempty map registry');
  if(value.prefabs!==undefined)prefabCatalog(value.prefabs);
  const catalog=(value.prefabs??[]) as ScenePrefab[];
  for (const [id, input] of Object.entries(value.maps)) {
    if (!validId(id) || !record(input) || input.id !== id) fail(`map key ${id} must match its ID`);
    positive(input.width, `${id} width`, 16384); positive(input.height, `${id} height`, 16384);
    if (input.width < 28 || input.height < 28) fail(`${id} dimensions must be at least 28 world units`);
    if (!Number.isInteger(input.width) || !Number.isInteger(input.height)) fail(`${id} dimensions must be integer world units`);
    if (input.kind !== undefined && input.kind !== 'outdoor' && input.kind !== 'interior') fail(`${id} has an invalid kind`);
    if (!Number.isInteger(input.coordinateVersion) || Number(input.coordinateVersion) < 1) fail(`${id} has an invalid coordinate version`);
    if (input.legacyOffset !== undefined) point(input.legacyOffset, `${id} legacy offset`);
    point(input.spawn, `${id} spawn`, input.width, input.height);
    for (const kind of ['walkable', 'obstacles'] as const) {
      const shapes = input[kind];
      if (!Array.isArray(shapes) || (kind === 'walkable' && !shapes.length)) fail(`${id} needs ${kind} polygons`);
      shapes.forEach((shape, index) => polygon(shape, `${id} ${kind} ${index}`, input.width as number, input.height as number));
    }
    for (const kind of ['npcs', 'objects'] as const) {
      list(input[kind], `${id} ${kind}`);
      for (const anchor of input[kind]) point(anchor, `${id} ${kind} ${anchor.id}`, input.width, input.height);
    }
    list(input.scenery, `${id} scenery`);
    for (const item of input.scenery) {
      point(item, `${id} scenery ${item.id}`);
      positive(item.width, `${id} scenery ${item.id} width`, 8192);
      // Edge dressing may legitimately extend beyond playable bounds.
      if (item.x < -item.width || item.x > input.width + item.width || item.y < -item.width || item.y > input.height + item.width) fail(`${id} scenery ${item.id} exceeds decorative overscan`);
      if (!sceneSceneryAssets.includes(item.asset as SceneScenery['asset'])) fail(`${id} scenery ${item.id} has unknown asset`);
      if (item.frame !== undefined && !validId(item.frame)) fail(`${id} scenery ${item.id} has invalid frame`);
      if (item.depth !== undefined && !finite(item.depth)) fail(`${id} scenery ${item.id} has invalid depth`);
      sortLine(item.sortLine,`${id} scenery ${item.id}`);
      if (item.motion !== undefined && !['tree', 'cloth', 'boat', 'lamp', 'building', 'water', 'still'].includes(String(item.motion))) fail(`${id} scenery ${item.id} has invalid motion`);
      for (const key of ['variant', 'flipX', 'collidable', 'pinned']) if (item[key] !== undefined && typeof item[key] !== 'boolean') fail(`${id} scenery ${item.id} has invalid ${key}`);
      for (const key of ['groupId', 'generatorId']) if (item[key] !== undefined && !validId(item[key])) fail(`${id} scenery ${item.id} has invalid ${key}`);
    }
    list(input.terrain, `${id} terrain`);
    if (!input.terrain.length) fail(`${id} needs terrain`);
    for (const tile of input.terrain) {
      point(tile, `${id} terrain ${tile.id}`, input.width, input.height);
      positive(tile.width, `${id} terrain width`); positive(tile.height, `${id} terrain height`);
      if (tile.x + tile.width > input.width || tile.y + tile.height > input.height) fail(`${id} terrain ${tile.id} exceeds scene bounds`);
      assetPath(tile.dayAsset, `${id} terrain ${tile.id}`);
      if (tile.nightAsset !== undefined) assetPath(tile.nightAsset, `${id} terrain ${tile.id}`);
      for (const key of ['dayPreviewAsset', 'nightPreviewAsset']) if (tile[key] !== undefined) assetPath(tile[key], `${id} terrain ${tile.id} overview`);
      if(tile.walkableMaskAsset!==undefined)assetPath(tile.walkableMaskAsset,`${id} terrain ${tile.id} walkable mask`);
      if (tile.pixelDensity !== undefined) positive(tile.pixelDensity, `${id} terrain ${tile.id} pixel density`, 16);
      for (const key of ['dayCrop', 'nightCrop']) if (tile[key] !== undefined) {
        const crop = tile[key];
        point(crop, `${id} terrain ${tile.id} ${key}`);
        if (crop.x < 0 || crop.y < 0 || !Number.isInteger(crop.x) || !Number.isInteger(crop.y)) fail(`${id} terrain ${tile.id} crop origin must be nonnegative pixels`);
        const rectangle = crop as ScenePoint & {width: number; height: number};
        positive(rectangle.width, `${id} terrain crop width`); positive(rectangle.height, `${id} terrain crop height`);
        if (!Number.isInteger(rectangle.width) || !Number.isInteger(rectangle.height)) fail(`${id} terrain crop must use whole pixels`);
        if (tile.pixelDensity !== undefined && (rectangle.width !== Number(tile.width) * Number(tile.pixelDensity) || rectangle.height !== Number(tile.height) * Number(tile.pixelDensity))) fail(`${id} terrain ${tile.id} crop does not match its pixel density`);
      }
    }
    list(input.districts, `${id} districts`);
    for (const district of input.districts) {
      if (district.label !== undefined && typeof district.label !== 'string') fail(`${id} district ${district.id} has invalid label`);
      polygon(district.polygon, `${id} district ${district.id}`, input.width, input.height);
    }
    if (input.activities !== undefined) {
      list(input.activities, `${id} activities`);
      for (const activity of input.activities) {
        const owner = input.scenery.find(item => item.id === activity.ownerId);
        if (!owner) fail(`${id} activity ${activity.id} has missing owner`);
        point({x: activity.offsetX, y: activity.offsetY}, `${id} activity ${activity.id} offset`);
        const offsetX = activity.offsetX as number, offsetY = activity.offsetY as number;
        point({x: Number(owner.x) + offsetX, y: Number(owner.y) + offsetY}, `${id} activity ${activity.id}`, input.width, input.height);
        for (const key of ['approach', 'exit']) if (activity[key] !== undefined) {
          const offset = activity[key];
          point(offset, `${id} activity ${activity.id} ${key} offset`);
          point({x: Number(owner.x) + offset.x, y: Number(owner.y) + offset.y}, `${id} activity ${activity.id} ${key}`, input.width, input.height);
        }
        if (!['seat', 'work', 'pickup', 'service', 'shelter', 'wait'].includes(String(activity.kind))) fail(`${id} activity ${activity.id} has invalid kind`);
        if (activity.capacity !== undefined && (!Number.isInteger(activity.capacity) || Number(activity.capacity) < 1)) fail(`${id} activity ${activity.id} has invalid capacity`);
        activityPlaces(activity,`${id} activity ${activity.id}`);
      }
    }
    if(input.residents!==undefined){
      list(input.residents,`${id} residents`);
      if(input.residents.length>100)fail(`${id} has more than 100 authored residents`);
      for(const resident of input.residents){
        if(typeof resident.name!=='string'||!resident.name.trim()||resident.name.length>60)fail(`${id} resident needs a name`);
        point(resident.home,`${id} resident ${resident.id} home`,input.width,input.height);
        positive(resident.speed,`${id} resident speed`,200);
        const avatar=resident.avatar;
        if(!record(avatar)||['hair','skin','outfit'].some(key=>typeof avatar[key]!=='string'||!/^#[\da-f]{6}$/i.test(String(avatar[key]))))fail(`${id} resident ${resident.id} needs valid avatar colors`);
        if(resident.artVariant!==undefined&&(!Number.isInteger(resident.artVariant)||Number(resident.artVariant)<0||Number(resident.artVariant)>15))fail(`${id} resident has invalid art variant`);
        if(resident.actionArt!==undefined){
          const look=residentActionLooks[resident.actionArt as ResidentActionLook];
          if(!look)fail(`${id} resident has unknown action artwork`);
          if(resident.artVariant!==undefined||Object.entries(look.avatar).some(([key,color])=>String(avatar[key]).toLowerCase()!==color))fail(`${id} resident action artwork must match its avatar colors and cannot replace regional art`);
        }
        if((input.npcs as SceneAnchor[]).some(npc=>npc.id===resident.id))fail(`${id} resident cannot replace a required story character`);
        list(resident.schedule,`${id} resident schedule`);
        if(resident.schedule.length>32)fail(`${id} resident has too many schedule blocks`);
        const windows:{start:number;end:number}[]=[];
        for(const task of resident.schedule){
          if(!residentActions.includes(task.action as SceneResidentTask['action']))fail(`${id} resident task has invalid action`);
          if(!finite(task.startHour)||!finite(task.endHour)||task.startHour<0||task.endHour>24||task.endHour<=task.startHour)fail(`${id} resident task needs a same-day time window`);
          const start=task.startHour,end=task.endHour;
          if(windows.some(window=>start<window.end&&end>window.start))fail(`${id} resident schedule blocks overlap`);
          windows.push({start:task.startHour,end:task.endHour});
          positive(task.durationSeconds,`${id} resident task duration`,300);
          for(const key of ['activityId','fallbackActivityId'])if(key==='activityId'||task[key]!==undefined){
            const slot=(input.activities as SceneActivity[]|undefined)?.find(slot=>slot.id===task[key]);
            if(!slot)fail(`${id} resident ${resident.id} task ${task.id} references a missing activity`);
            if((slot.capacity??1)>1&&!slot.places)fail(`${id} scheduled activity ${slot.id} needs explicit places for its capacity`);
          }
          if(task.facing!==undefined&&!['left','right'].includes(String(task.facing)))fail(`${id} resident task has invalid facing`);
          if(task.heldObject!==undefined&&!['book','parcel','tool'].includes(String(task.heldObject)))fail(`${id} resident task has invalid held object`);
          if(task.exchangeWith!==undefined){
            const partner=task.exchangeWith;
            if(!record(partner)||!validId(partner.residentId)||!validId(partner.taskId))fail(`${id} resident exchange needs a resident and service task`);
            const vendor=(input.residents as unknown as SceneResident[]).find(item=>item.id===partner.residentId);
            const service=Array.isArray(vendor?.schedule)?vendor.schedule.find(item=>item?.id===partner.taskId):undefined;
            if(!vendor||vendor.id===resident.id||!service||service.action!=='serve'||service.exchangeWith)fail(`${id} resident ${resident.id}/${task.id} exchange references a missing or invalid service task`);
            const slot=(input.activities as unknown as SceneActivity[]).find(item=>item.id===task.activityId)!;
            if(task.action!=='wait'||slot.kind!=='wait'||task.fallbackActivityId||task.heldObject)fail(`${id} exchange customer needs a waiting position with no fallback or held object`);
            if(Math.max(start,service.startHour)>=Math.min(end,service.endHour)||Number(task.durationSeconds)>service.durationSeconds)fail(`${id} exchange needs overlapping hours and enough service time`);
          }
        }
      }
    }
    if (input.entrances !== undefined) {
      list(input.entrances, `${id} entrances`);
      const interiors = new Set<string>();
      for (const entrance of input.entrances) {
        const owner = input.scenery.find(item => item.id === entrance.ownerId);
        if (!owner) fail(`${id} entrance ${entrance.id} has missing owner`);
        if (!sceneInteriorIds.includes(entrance.interiorId as SceneEntrance['interiorId'])) fail(`${id} entrance ${entrance.id} has unknown interior`);
        if (interiors.has(String(entrance.interiorId))) fail(`${id} has duplicate entrances to ${entrance.interiorId}`);
        interiors.add(String(entrance.interiorId));
        point({x:entrance.offsetX,y:entrance.offsetY}, `${id} entrance ${entrance.id} offset`);
        point({x:Number(owner.x)+Number(entrance.offsetX),y:Number(owner.y)+Number(entrance.offsetY)}, `${id} entrance ${entrance.id}`,input.width,input.height);
        if (entrance.returnOffset !== undefined) {
          point(entrance.returnOffset, `${id} entrance ${entrance.id} return offset`);
          point({x:Number(owner.x)+entrance.returnOffset.x,y:Number(owner.y)+entrance.returnOffset.y}, `${id} entrance ${entrance.id} return`,input.width,input.height);
        }
      }
    }
    if(input.prefabInstances!==undefined){
      list(input.prefabInstances,`${id} prefab instances`);
      const members=new Set<string>(),slots=new Set<string>();
      for(const instance of input.prefabInstances){
        if(instance.locked!==undefined&&typeof instance.locked!=='boolean')fail(`${id} prefab lock must be boolean`);
        const prefab=catalog.find(item=>item.id===instance.prefabId);
        if(!prefab||!Number.isInteger(instance.revision)||Number(instance.revision)<1||Number(instance.revision)>prefab.revision)fail(`${id} prefab instance ${instance.id} has missing catalog entry or invalid revision`);
        point(instance.origin,`${id} prefab origin`);
        for(const key of ['members','activities'] as const){
          list(instance[key],`${id} prefab ${key}`);
          const keys=new Set<string>();
          for(const entry of instance[key]){
            if(!validId(entry.key)||keys.has(entry.key)||!record(entry.base)||entry.base.id!==entry.id)fail(`${id} prefab ${key} has invalid baseline identity`);
            keys.add(entry.key);
            const used=key==='members'?members:slots;
            if(used.has(String(entry.id)))fail(`${id} prefab child belongs to multiple instances`);
            used.add(String(entry.id));
            if(key==='members')prefabScenery(entry.base,`${id} prefab baseline`);
          }
        }
        const owners=new Set((instance.members as {id:string}[]).map(item=>item.id));
        for(const entry of instance.activities as {base:unknown}[])prefabActivity(entry.base,owners,`${id} prefab activity baseline`);
      }
    }
    if (input.generationZones !== undefined) {
      list(input.generationZones, `${id} generation zones`);
      for (const zone of input.generationZones) {
        polygon(zone.polygon, `${id} generation zone ${zone.id}`, input.width, input.height);
        if (!Number.isSafeInteger(zone.seed) || !Number.isInteger(zone.rulesVersion) || Number(zone.rulesVersion) < 1) fail(`${id} generation zone ${zone.id} has invalid seed/version`);
        if (!Array.isArray(zone.palette) || !zone.palette.length || zone.palette.some(asset => !validId(asset))) fail(`${id} generation zone ${zone.id} needs an asset palette`);
        if (zone.count !== undefined && (!Number.isInteger(zone.count) || Number(zone.count) < 1 || Number(zone.count) > 300)) fail(`${id} generation zone ${zone.id} count must be 1–300`);
        for (const key of ['minSpacing', 'clearance']) if (zone[key] !== undefined && (!finite(zone[key]) || zone[key] < 0)) fail(`${id} generation zone ${zone.id} has invalid ${key}`);
        for (const key of ['minScale', 'maxScale']) if (zone[key] !== undefined && (!finite(zone[key]) || zone[key] < .25 || zone[key] > 2)) fail(`${id} generation zone ${zone.id} ${key} must be .25–2`);
        if (zone.minScale !== undefined && zone.maxScale !== undefined && Number(zone.minScale) > Number(zone.maxScale)) fail(`${id} generation zone ${zone.id} has inverted scale range`);
        const sceneryIds = new Set(input.scenery.map(item => item.id));
        if (zone.pinnedIds !== undefined && (!Array.isArray(zone.pinnedIds) || zone.pinnedIds.some(pinned => !sceneryIds.has(pinned)))) fail(`${id} generation zone ${zone.id} has missing pinned instance`);
      }
    }
  }
  return value as unknown as WorldSceneDocument;
}
