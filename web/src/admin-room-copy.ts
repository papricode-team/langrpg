import type {InteriorSpec} from './interiors';
import {additionalRoomTemplate, applyRoomLayout, completeRoomLayout} from './room-layout-runtime';
import {buildingRooms, parseRoomLayout, roomFurnitureAssets, type BuildingRoom, type RoomLayout, type RoomPoint} from './room-layout';

export interface RoomLayoutCopy {
  version:1; scope:'room'|'floor'; label:string; rooms:BuildingRoom[];
}
export const roomCopyStorageKey='glotworld.room-layout-copy.v1';
const fresh=(prefix:string)=>`${prefix}-${crypto.randomUUID().replaceAll('-','').slice(0,24)}`;

/** A portable snapshot contains geometry and public game IDs, never authored dialogue or NPCs. */
export function copyRoomLayout(template:InteriorSpec, building:RoomLayout, activeRoom:string, scope:'room'|'floor', label:string):RoomLayoutCopy {
  const all=buildingRooms(building),active=all.find(r=>r.id===activeRoom);
  if(!active)throw new Error('Choose a room to copy.');
  const selected=all.filter(r=>scope==='room'?r.id===activeRoom:(r.layout.level ?? 0)===(active.layout.level ?? 0));
  const selectedIds=new Set(selected.map(r=>r.id));
  const rooms=selected.map(entry=>{
    const source=entry.id==='main'?template:additionalRoomTemplate(template);
    const layout=completeRoomLayout(source,entry.layout);
    delete layout.rooms;
    const spec=applyRoomLayout(source,layout);
    layout.links=layout.links?.filter(link=>selectedIds.has(link.targetRoom));
    for(const furniture of layout.furniture) if(furniture.source.startsWith('original:')) {
      const prop=spec.props.find(p=>p.id===furniture.id)!;
      if(!prop || !roomFurnitureAssets.includes(prop.asset as typeof roomFurnitureAssets[number]))throw new Error('This furniture is not available in the shared room library.');
      furniture.source=prop.asset;
      furniture.footprint=prop.collision?{referenceWidth:furniture.width,...prop.collision}:null;
    }
    for(const encounter of layout.encounters) {
      const object=spec.objects.find(o=>o.id===encounter.id);
      if(!object?.minigame)continue;
      const furniture=spec.props.find(p=>p.interactive===encounter.id);
      layout.games.push({id:fresh('game'),game:object.minigame,x:encounter.x,y:Math.max(0,encounter.y-64),
        ...(encounter.y<64?{approachOffsetY:encounter.y}:{}),...(furniture?{furnitureId:furniture.id}:{})});
    }
    layout.encounters=[];layout.npcs=[];
    return {id:entry.id,name:entry.name,layout};
  });
  return parseRoomLayoutCopy({version:1,scope,label:label.slice(0,160),rooms});
}

/** localStorage is untrusted. Strip content and check the graph before making any draft changes. */
export function parseRoomLayoutCopy(value:unknown):RoomLayoutCopy {
  const fail=():never=>{throw new Error('The saved room copy is invalid. Copy a room or floor again.');};
  if(!value || typeof value!=='object')return fail();
  const v=value as RoomLayoutCopy;
  if(v.version!==1 || !['room','floor'].includes(v.scope) || typeof v.label!=='string' || v.label.length>160 || !Array.isArray(v.rooms) || !v.rooms.length || v.rooms.length>16 || v.scope==='room' && v.rooms.length!==1)return fail();
  const ids=new Set<string>();
  const rooms=v.rooms.map(r=>{
    if(!r || typeof r.id!=='string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(r.id) || ids.has(r.id) || typeof r.name!=='string' || !r.name.trim() || r.name.length>60)return fail();
    ids.add(r.id);
    const layout=parseRoomLayout(r.layout,true);
    if(!layout.floors || !layout.spawn || !layout.exit || layout.encounters.length || layout.npcs.length || layout.furniture.some(f=>f.source.startsWith('original:')))return fail();
    return {id:r.id,name:r.name.trim(),layout};
  });
  for(const room of rooms) {
    if((room.layout.level ?? 0)!==(rooms[0].layout.level ?? 0))return fail();
    for(const link of room.layout.links ?? []) {
      const target=rooms.find(r=>r.id===link.targetRoom),back=target?.layout.links?.find(l=>l.id===link.targetDoor);
      if(!back || target===room || back.targetRoom!==room.id || back.targetDoor!==link.id || link.kind==='stairs' || back.kind==='stairs')return fail();
    }
  }
  return {version:1,scope:v.scope,label:v.label,rooms};
}

export function nextCopyFloor(building:RoomLayout):number {
  const used=new Set(buildingRooms(building).map(r=>r.layout.level ?? 0));
  for(let level=Math.max(...used)+1;level<=15;level++)if(!used.has(level))return level;
  for(let level=1;level<=15;level++)if(!used.has(level))return level;
  for(let level=-1;level>=-15;level--)if(!used.has(level))return level;
  throw new Error('No free floor remains between −15 and 15.');
}

/** Add independent identities and reconnect each copied component to the destination building. */
export function pasteRoomLayout(building:RoomLayout, value:RoomLayoutCopy, activeRoom:string,
  position:(layout:RoomLayout, main:boolean)=>RoomPoint):{building:RoomLayout; roomId:string} {
  const copy=parseRoomLayoutCopy(value),next=structuredClone(building);
  if(buildingRooms(next).length+copy.rooms.length>16)throw new Error(`This copy needs ${copy.rooms.length} room slots. A building can have up to 16 rooms.`);
  const origin=buildingRooms(next).find(r=>r.id===activeRoom);
  if(!origin)throw new Error('Choose a destination room.');
  const level=copy.scope==='floor'?nextCopyFloor(next):(origin.layout.level ?? 0);
  const roomIds=new Map(copy.rooms.map(r=>[r.id,fresh('room')]));
  const componentIds=new Map(copy.rooms.map(r=>[r.id,new Map([
    ...(r.layout.floors ?? []),...(r.layout.links ?? []),...r.layout.walls,...r.layout.doors,...r.layout.furniture,...r.layout.games,
  ].map(c=>[c.id,fresh('part')]))]));
  const names=new Set(buildingRooms(next).map(r=>r.name));
  const added=copy.rooms.map(room=>{
    const ids=componentIds.get(room.id)!,layout=structuredClone(room.layout);
    layout.kind=next.kind;layout.level=level;
    for(const list of [layout.floors ?? [],layout.links ?? [],layout.walls,layout.doors,layout.furniture,layout.games])for(const item of list)item.id=ids.get(item.id)!;
    for(const door of layout.doors)door.wallId=ids.get(door.wallId)!;
    for(const game of layout.games)if(game.furnitureId)game.furnitureId=ids.get(game.furnitureId)!;
    for(const link of layout.links ?? []) {
      link.targetDoor=componentIds.get(link.targetRoom)!.get(link.targetDoor)!;
      link.targetRoom=roomIds.get(link.targetRoom)!;
    }
    let name=`${room.name.slice(0,50)} copy`,suffix=2;
    while(names.has(name))name=`${room.name.slice(0,50)} copy ${suffix++}`;
    names.add(name);
    return {id:roomIds.get(room.id)!,name,layout};
  });
  const reached=new Set<string>();
  for(const room of added) {
    if(reached.has(room.id))continue;
    const out=fresh('link'),back=fresh('link'),kind=level!==(origin.layout.level ?? 0)?{kind:'stairs' as const}:{};
    const from=position(origin.layout,activeRoom==='main'),to=position(room.layout,false);
    (origin.layout.links ??= []).push({id:out,...from,targetRoom:room.id,targetDoor:back,...kind});
    (room.layout.links ??= []).push({id:back,...to,targetRoom:activeRoom,targetDoor:out,...kind});
    const pending=[room.id];
    while(pending.length) {
      const id=pending.pop()!;if(reached.has(id))continue;reached.add(id);
      for(const link of added.find(r=>r.id===id)?.layout.links ?? [])if(roomIdsHas(link.targetRoom))pending.push(link.targetRoom);
    }
  }
  function roomIdsHas(id:string){return added.some(r=>r.id===id);}
  (next.rooms ??= []).push(...added);
  return {building:parseRoomLayout(next),roomId:added[0].id};
}
