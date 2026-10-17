import {NavigationGrid, PLAYER_RADIUS} from './navigation';
import type {InteriorSpec, InteriorPropSpec} from './interiors';
import {roomKind} from './room-kind';
import {roomGameLabel} from './room-game-catalogue';
import {roomLinkDirection, roomRectangle, roomWallSegments, type RoomLayout} from './room-layout';

export const defaultRoomFixtures = (spec: InteriorSpec) => roomKind(spec.id) === 'inn' ? [
  {kind: 'bed' as const, x: 180, y: 365, width: 380, height: 185},
  {kind: 'desk' as const, x: 1070, y: 365, width: 270, height: 100},
  {kind: 'lamp' as const, x: 750, y: 365, width: 120, height: 45},
] : [];
export function createRoomLayout(spec: InteriorSpec): RoomLayout {
  if (spec.layout) return completeRoomLayout(spec, spec.layout);
  return {version: 1, kind: roomKind(spec.id),
    ...roomShell(spec),
    walls: roomKind(spec.id) === 'inn' ? [] : (spec.barriers ?? []).map((polygon,i) => {
      const xs = polygon.map(p=>p[0]), ys = polygon.map(p=>p[1]);
      return {id:`wall-${i}`,x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
    }), doors: [],
    furniture: [...spec.props.map(prop => ({id: `furniture-${prop.id}`,source:`original:${prop.id}`,x:prop.x,y:prop.y,width:prop.width})),
      ...defaultRoomFixtures(spec).map(f => ({id:`fixture-${f.kind}`,source:f.kind,x:f.x+f.width/2,y:f.y+f.height,width:f.width}))],
    games: [], encounters: spec.objects.map(o=>({id:o.id,x:o.x*spec.width,y:o.y*spec.height})),
    npcs: spec.npcs.map(n=>({id:n.id,x:n.x*spec.width,y:n.y*spec.height})),
  };
}

function roomShell(spec: InteriorSpec) {
  const obstacles=spec.props.flatMap(p=>p.collision?[roomRectangle(p.x+p.collision.offsetX,p.y+p.collision.offsetY,p.collision.width,p.collision.height)]:[]);
  const navigation=new NavigationGrid(spec.floorAreas,[...(spec.barriers??[]),...obstacles],spec,{agentRadius:PLAYER_RADIUS});
  const spawn=navigation.closestPoint(spec.spawn.x*spec.width,spec.spawn.y*spec.height);
  // Older painted-room exits sat on the threshold. Editable markers start on walkable floor.
  const exit=navigation.closestPoint(spec.exit.x*spec.width,spec.exit.y*spec.height,spawn);
  return {floors:spec.floorAreas.map((polygon,index)=>({id:`floor-${index}`,points:polygon.map(p=>[...p] as [number,number])})),
    spawn,exit};
}
/** Expand legacy drafts in the editor without mutating their published fingerprint. */
export function completeRoomLayout(spec: InteriorSpec, layout: RoomLayout): RoomLayout {
  const defaults=roomShell(spec);
  // Avoid colliding with an existing component when upgrading an older layout.
  const ids=new Set([...layout.walls,...layout.doors,...layout.furniture,...layout.games,...layout.encounters,...layout.npcs].map(p=>p.id));
  for(const floor of defaults.floors) while(ids.has(floor.id)) floor.id+='-floor';
  return structuredClone({...defaults,...layout});
}

export function layoutFixtures(layout: RoomLayout) {
  return layout.furniture.flatMap(item => {
    if (item.source !== 'bed' && item.source !== 'desk' && item.source !== 'lamp') return [];
    const height = item.width * (item.source === 'bed' ? 185/380 : item.source === 'desk' ? 100/270 : 45/120);
    return [{kind:item.source as 'bed' | 'desk' | 'lamp',x:item.x-item.width/2,y:item.y-height,width:item.width,height}];
  });
}
export function applyRoomLayout(spec: InteriorSpec, layout: RoomLayout, building:RoomLayout=layout): InteriorSpec {
  if (layout.kind !== roomKind(spec.id)) throw new Error('The room template changed. Reopen its layout.');
  const at = (p: {x:number;y:number}) => ({x:p.x/spec.width,y:p.y/spec.height});
  const props: InteriorPropSpec[] = layout.furniture.flatMap(item => {
    if (['bed','desk','lamp'].includes(item.source)) return [];
    const original = item.source.startsWith('original:') ? spec.props.find(p=>p.id===item.source.slice(9)) : undefined;
    if (item.source.startsWith('original:') && !original) throw new Error(`Unknown room furniture ${item.source}.`);
    const scale = original ? item.width/original.width : 1;
    const collision = item.footprint !== undefined ? item.footprint : original?.collision;
    const collisionScale = item.footprint ? item.width/item.footprint.referenceWidth : scale;
    return [{id:item.id,sheet:original?.sheet ?? 'interior-decor',asset:original?.asset ?? item.source,x:item.x,y:item.y,width:item.width,
      ...(original?.interactive && layout.encounters.some(e=>e.id===original.interactive) ? {interactive:original.interactive} : {}),
      ...(original?.depth !== undefined ? {depth:item.y+(original.depth-original.y)*scale} : {}),
      ...(original?.effects ? {effects:original.effects.map(e=>({...e,x:e.x*scale,y:e.y*scale,width:e.width*scale}))} : {}),
      ...(collision ? {collision:{offsetX:collision.offsetX*collisionScale,offsetY:collision.offsetY*collisionScale,width:collision.width*collisionScale,height:collision.height*collisionScale}}
        : original || item.footprint===null ? {} : {collision:{offsetX:-item.width*.35,offsetY:-24,width:item.width*.7,height:28}})}];
  });
  const objects = layout.encounters.map(marker => {
    const original = spec.objects.find(o=>o.id===marker.id);
    if (!original) throw new Error(`Unknown story or game station ${marker.id}.`);
    return {...original,...at(marker)};
  });
  for (const original of spec.objects) if (!original.gameOnly && !objects.some(o=>o.id===original.id)) throw new Error('Keep the room’s story stations; you can move them.');
  const npcs = layout.npcs.map(marker => {
    const original = spec.npcs.find(n=>n.id===marker.id);
    if (!original) throw new Error(`Unknown room character ${marker.id}.`);
    return {...original,...at(marker)};
  });
  if (npcs.length !== spec.npcs.length) throw new Error('Keep the room’s characters; you can move them.');
  for (const game of layout.games) {
    const id = `interior:placed:${game.id}`, title = roomGameLabel(game.game);
    objects.push({id,...at({x:game.x,y:game.y+(game.approachOffsetY ?? 64)}),label:title,germanName:'',sessionTitle:'',prompt:'',description:'',minigame:game.game,gameOnly:true,exerciseIds:[],vocabulary:[]});
    if(game.furnitureId) {
      const furniture=props.find(p=>p.id===game.furnitureId);
      if(furniture)furniture.interactive=id;
    } else props.push({id:game.id,asset:'menu-board',sheet:'interior-furniture',x:game.x,y:game.y,width:70,interactive:id,collision:{offsetX:-25,offsetY:-20,width:50,height:24}});
  }
  return {...spec,layout,props,objects,npcs,
    stairDirections:Object.fromEntries((layout.links ?? []).filter(link=>link.kind==='stairs').map(link=>[link.id,roomLinkDirection(layout,link,building)])),
    floorAreas:layout.floors?.map(f=>f.points) ?? spec.floorAreas,
    spawn:layout.spawn ? at(layout.spawn) : spec.spawn, exit:layout.exit ? at(layout.exit) : spec.exit,
    barriers:[...roomWallSegments(layout).map(w=>roomRectangle(w.x,w.y,w.width,w.height)),...layoutFixtures(layout).map(f=>roomRectangle(f.x,f.y,f.width,f.height))]};
}

/** Extra rooms start without the main room's story actors and fixtures. */
export function additionalRoomTemplate(spec:InteriorSpec):InteriorSpec {
  return {...spec,layout:undefined,props:[],objects:[],npcs:[],barriers:[]};
}
