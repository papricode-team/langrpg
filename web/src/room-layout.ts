import {roomKinds, type RoomKind} from './room-kind.ts';
import {roomGameIds} from './room-game-catalogue.ts';

export const roomFurnitureAssets = ['espresso','grinder','kettle','cup','pastry-case','cafe-table','oven','mixer','bread-rack','pastry-tray','dough-bench','bakery-counter','produce','grocery-shelf','refrigerator','checkout','basket','scales','plant','pendulum-clock','candle','aquarium','bookshelf','coat-stand','coffee-bar','prep-bench','banquette','pantry','sink','menu-board','bed','desk','lamp'] as const;
export interface RoomPoint {x:number; y:number;}
export interface RoomFloorShape {id:string; points:[number,number][];}
export interface RoomPlacement {id: string; x: number; y: number;}
export interface RoomPartition extends RoomPlacement {width: number; height: number;}
export interface RoomDoor {id: string; wallId: string; offset: number; width: number;}
export interface RoomFurniture extends RoomPlacement {
  source: string; width: number;
  /** Portable template footprint; null preserves a decoration without collision. */
  footprint?: {referenceWidth:number; offsetX:number; offsetY:number; width:number; height:number} | null;
}
export interface RoomLink extends RoomPlacement {kind?:'door'|'stairs'; targetRoom: string; targetDoor: string;}
export interface BuildingRoom {id:string; name:string; layout:RoomLayout;}
export interface RoomGame extends RoomPlacement {
  game: string; furnitureId?:string;
  /** Defaults to 64; copied stations near the canvas edge can use a smaller approach offset. */
  approachOffsetY?:number;
}
/** Only geometry and public game IDs are saved in the world; story content stays authenticated. */
export interface RoomLayout {
  version: 1; kind: RoomKind;
  /** Building storey: zero is ground level; omitted in legacy rooms. */
  level?: number;
  /** Omitted by older layouts, which retain their template geometry. Coordinates are room pixels. */
  floors?: RoomFloorShape[];
  spawn?: RoomPoint;
  exit?: RoomPoint;
  /** Additional rooms belong to the main layout; links are paired door endpoints. */
  rooms?: BuildingRoom[];
  links?: RoomLink[];
  walls: RoomPartition[]; doors: RoomDoor[]; furniture: RoomFurniture[];
  games: RoomGame[]; encounters: RoomPlacement[]; npcs: RoomPlacement[];
}
export function roomLayoutFingerprint(layout: RoomLayout | null | undefined): string {
  // JSON field order can change when an older layout gains floor/travel fields.
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])) : value;
  const text = JSON.stringify(stable(layout ?? null));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
/** Validated at both the operation and document boundaries. Never trust canvas input. */
export function parseRoomLayout(value: unknown, child = false): RoomLayout {
  const fail = (message: string): never => { throw new Error(`Room layout: ${message}`); };
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const number = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (!record(value) || value.version !== 1 || !roomKinds.some(kind => kind === value.kind)) return fail('choose a room template.');
  if (value.level !== undefined && (!number(value.level,-15,15) || !Number.isInteger(value.level) || !child && value.level!==0)) return fail('use whole-number floors from −15 to 15; the main room stays on the ground floor.');
  if (child && value.rooms !== undefined) return fail('rooms cannot contain nested room lists.');
  let rooms: BuildingRoom[] | undefined;
  if (value.rooms !== undefined) {
    if (!Array.isArray(value.rooms) || value.rooms.length > 15) return fail('a building can have up to 16 rooms.');
    const roomIds = new Set(['main']);
    rooms = value.rooms.map(room => {
      if (!record(room) || typeof room.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(room.id) || roomIds.has(room.id)
        || typeof room.name !== 'string' || !room.name.trim() || room.name.length > 60) return fail('give each room a unique ID and a name of 1–60 characters.');
      roomIds.add(room.id);
      const layout = parseRoomLayout(room.layout, true);
      if (layout.kind !== value.kind) return fail('rooms must use the building’s template.');
      return {id:room.id,name:room.name.trim(),layout};
    });
  }
  const ids = new Set<string>();
  let links: RoomLink[] | undefined;
  if (value.links !== undefined) {
    if (!Array.isArray(value.links) || value.links.length > 64) return fail('keep at most 64 room doors.');
    links = value.links.map(link => {
      if (!record(link) || typeof link.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(link.id) || ids.has(link.id)
        || !number(link.x,0,1536) || !number(link.y,0,1024) || typeof link.targetRoom !== 'string' || typeof link.targetDoor !== 'string') return fail('room doors need a unique ID, position and destination.');
      ids.add(link.id);
      if(link.kind!==undefined && link.kind!=='door' && link.kind!=='stairs')return fail('choose a door or stairs for each connection.');
      return {id:link.id,x:link.x,y:link.y,targetRoom:link.targetRoom,targetDoor:link.targetDoor,...(link.kind?{kind:link.kind}: {})};
    });
  }
  if (!child) {
    const all = new Map<string, {links?:RoomLink[];level?:number}>([['main',{links,level:0}],...(rooms ?? []).map(r=>[r.id,r.layout] as const)]);
    for (const [id,room] of all) for (const link of room.links ?? []) {
      const destination=all.get(link.targetRoom),back=destination?.links?.find(d=>d.id===link.targetDoor);
      if (link.targetRoom===id || !back || back.targetRoom!==id || back.targetDoor!==link.id) return fail('each room door must have a matching door in another room.');
      if((link.kind ?? 'door')!==(back.kind ?? 'door'))return fail('both ends of a connection must use the same door or stairs type.');
      const differentFloor=(room.level ?? 0)!==(destination!.level ?? 0);
      if((link.kind==='stairs')!==differentFloor)return fail('use stairs between different floors and doors between rooms on the same floor.');
    }
    const reached = new Set(['main']);
    for (const id of reached) for (const link of all.get(id)?.links ?? []) reached.add(link.targetRoom);
    if (reached.size !== all.size) return fail('connect every room to the main room with doors or stairs.');
  }
  for (const key of ['spawn','exit'] as const) {
    const p = value[key];
    if (p !== undefined && (!record(p) || !number(p.x,0,1536) || !number(p.y,0,1024))) return fail(`${key === 'spawn' ? 'entrance' : 'exit'} must be inside the room canvas.`);
  }
  if (value.floors !== undefined) {
    if (!Array.isArray(value.floors) || !value.floors.length || value.floors.length > 32) return fail('keep between 1 and 32 floor shapes.');
    for (const floor of value.floors) {
      if (!record(floor) || typeof floor.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,120}$/.test(floor.id) || ids.has(floor.id)) return fail('every floor needs a unique ID.');
      ids.add(floor.id);
      const problem = roomFloorProblem(floor.points);
      if (problem) return fail(problem);
    }
  }
  for (const key of ['walls','doors','furniture','games','encounters','npcs'] as const) {
    const list = value[key];
    if (!Array.isArray(list) || list.length > 128) return fail(`choose at most 128 ${key}.`);
    for (const item of list) {
      if (!record(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,120}$/.test(item.id) || ids.has(item.id)) return fail('every component needs a unique ID.');
      ids.add(item.id);
      if (key !== 'doors' && (!number(item.x, 0, 1536) || !number(item.y, 0, 1024))) return fail('keep components inside the room.');
      if (key === 'walls' && (!number(item.width, 12, 1536) || !number(item.height, 12, 1024) || Number(item.x) + Number(item.width) > 1536 || Number(item.y) + Number(item.height) > 1024)) return fail('walls need a valid footprint.');
      if (key === 'doors' && (typeof item.wallId !== 'string' || !number(item.offset, 0, 1536) || !number(item.width, 64, 400))) return fail('doors need a wall and an opening at least 64 pixels wide.');
      if (key === 'furniture' && (typeof item.source !== 'string' || !(item.source.startsWith('original:') && /^[a-zA-Z0-9:_-]{1,120}$/.test(item.source.slice(9)) || roomFurnitureAssets.includes(item.source as typeof roomFurnitureAssets[number])) || !number(item.width, 8, 640))) return fail('choose furniture from the library.');
      if (key === 'games' && (typeof item.game !== 'string' || !roomGameIds.some(id=>id===item.game))) return fail('choose a game from the library.');
      if (key === 'games' && item.approachOffsetY!==undefined && !number(item.approachOffsetY,0,64)) return fail('keep game approach offsets between 0 and 64 pixels.');
      if (key === 'furniture' && item.footprint !== undefined && item.footprint !== null) {
        const f=item.footprint;
        if(!record(f) || !number(f.referenceWidth,8,640) || !number(f.offsetX,-1536,1536) || !number(f.offsetY,-1024,1024) || !number(f.width,0,3072) || !number(f.height,0,2048)) return fail('furniture needs a valid collision footprint.');
      }
    }
  }
  const layout = value as unknown as RoomLayout;
  const attachedFurniture=new Set<string>();
  for(const game of layout.games) if(game.furnitureId!==undefined) {
    if(typeof game.furnitureId!=='string' || !layout.furniture.some(f=>f.id===game.furnitureId) || attachedFurniture.has(game.furnitureId)) return fail('attach each game to its own existing furniture.');
    attachedFurniture.add(game.furnitureId);
  }
  for (const door of layout.doors) {
    const wall = layout.walls.find(wall => wall.id === door.wallId);
    if (!wall || door.offset + door.width > Math.max(wall.width, wall.height)) return fail('keep the entire doorway on its wall.');
    if (layout.doors.some(other => other !== door && other.wallId === door.wallId && other.offset < door.offset + door.width && other.offset + other.width > door.offset)) return fail('doorways must not overlap.');
  }
  // Strip unexpected fields, especially any private content submitted with a placement.
  const pick = <T>(items: T[], keys: string[]): T[] => items.map(item => Object.fromEntries(keys.map(key => [key, (item as Record<string, unknown>)[key]])) as T);
  return {version: 1, kind: layout.kind,
    ...(layout.level!==undefined?{level:layout.level}:{}),
    ...(rooms ? {rooms} : {}), ...(links ? {links} : {}),
    ...(layout.floors ? {floors:layout.floors.map(f=>({id:f.id,points:f.points.map(p=>[...p] as [number,number])}))} : {}),
    ...(layout.spawn ? {spawn:{x:layout.spawn.x,y:layout.spawn.y}} : {}),
    ...(layout.exit ? {exit:{x:layout.exit.x,y:layout.exit.y}} : {}),
    walls: pick(layout.walls,['id','x','y','width','height']), doors: pick(layout.doors,['id','wallId','offset','width']),
    furniture: layout.furniture.map(f=>({...pick([f],['id','source','x','y','width'])[0],...(f.footprint===undefined?{}:{footprint:f.footprint===null?null:pick([f.footprint],['referenceWidth','offsetX','offsetY','width','height'])[0]})})),
    games: layout.games.map(g=>({...pick([g],['id','game','x','y'])[0],...(g.furnitureId===undefined?{}:{furnitureId:g.furnitureId}),...(g.approachOffsetY===undefined?{}:{approachOffsetY:g.approachOffsetY})})),
    encounters: pick(layout.encounters,['id','x','y']), npcs: pick(layout.npcs,['id','x','y'])};
}
export const roomRectangle = (x: number, y: number, width: number, height: number): [number, number][] => [[x,y],[x+width,y],[x+width,y+height],[x,y+height]];
/** Door openings are subtracted from collision and painting by the same function. */
export function roomWallSegments(layout: RoomLayout): RoomPartition[] {
  return layout.walls.flatMap(wall => {
    const vertical = wall.height > wall.width, length = vertical ? wall.height : wall.width;
    const openings = layout.doors.filter(door => door.wallId === wall.id).sort((a,b) => a.offset-b.offset);
    const parts: RoomPartition[] = [];
    let start = 0;
    for (const door of [...openings, {offset: length, width: 0}]) {
      if (door.offset > start) parts.push({...wall, x: wall.x + (vertical ? 0 : start), y: wall.y + (vertical ? start : 0), width: vertical ? wall.width : door.offset-start, height: vertical ? door.offset-start : wall.height});
      start = door.offset + door.width;
    }
    return parts;
  });
}

/** Simple, bounded polygons keep floor union/rendering and navigation in agreement. */
export function roomFloorProblem(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length < 3 || value.length > 32) return 'each floor needs 3–32 corners.';
  if (!value.every(p=>Array.isArray(p) && p.length===2 && p.every(n=>typeof n==='number' && Number.isFinite(n)) && p[0]>=0 && p[0]<=1536 && p[1]>=0 && p[1]<=1024)) return 'keep floor corners inside the room canvas.';
  const points = value as [number,number][];
  if (new Set(points.map(p=>p.join(','))).size !== points.length) return 'floor corners must be distinct.';
  const cross = (a:number[],b:number[],c:number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const within = (a:number[],b:number[],c:number[]) => c[0]>=Math.min(a[0],b[0]) && c[0]<=Math.max(a[0],b[0]) && c[1]>=Math.min(a[1],b[1]) && c[1]<=Math.max(a[1],b[1]);
  for (let i=0;i<points.length;i++) for(let j=i+2;j<points.length;j++) {
    if(i===0 && j===points.length-1) continue;
    const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
    const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
    if ((abC*abD<0 && cdA*cdB<0) || (abC===0 && within(a,b,c)) || (abD===0 && within(a,b,d)) || (cdA===0 && within(c,d,a)) || (cdB===0 && within(c,d,b))) return 'a floor outline cannot cross itself.';
  }
  const area=Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
  if(area<256) return 'each floor needs at least 256 square pixels of area.';
  return undefined;
}

/** Main room keeps the historical building ID. Child identities are scoped to that building. */
export const buildingRoomRoot = (id:string):string => id.split('::')[0];
export const buildingRoomKey = (id:string):string => id.split('::')[1] ?? 'main';
export const buildingRoomId = (root:string, room:string):string => room === 'main' ? buildingRoomRoot(root) : `${buildingRoomRoot(root)}::${room}`;
export const buildingRooms = (layout:RoomLayout):BuildingRoom[] => [{id:'main',name:'Main room',layout},...(layout.rooms ?? [])];

export const roomLevelName = (level:number):string => level===0 ? 'Ground floor' : level<0 ? `Basement ${-level}` : `Floor ${level}`;
export function roomLinkDirection(layout:RoomLayout, link:RoomLink, building:RoomLayout):'up'|'down' {
  const target=buildingRooms(building).find(r=>r.id===link.targetRoom)?.layout.level ?? 0;
  return target>(layout.level ?? 0)?'up':'down';
}
