import {NavigationGrid, PLAYER_RADIUS} from './navigation';
import type {InteriorSpec} from './interiors';
import {applyRoomLayout, additionalRoomTemplate} from './room-layout-runtime';
import {parseRoomLayout, roomRectangle, buildingRooms, type RoomLayout} from './room-layout';

export function roomLayoutProblems(template: InteriorSpec, value: RoomLayout): string[] {
  try {
    const layout = parseRoomLayout(value);
    if(!buildingRooms(layout).some(r=>r.layout.games.length || r.layout.encounters.length)) return [layout.rooms?.length ? 'Place at least one game or story station in the building.' : 'Place at least one game or story station.'];
    return buildingRooms(layout).flatMap(entry=>validateRoom(entry.id==='main' ? template : additionalRoomTemplate(template),entry.layout).map(p=>entry.id==='main'?p:`${entry.name}: ${p}`));
  } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
}
function validateRoom(template:InteriorSpec, layout:RoomLayout):string[] {
  try {
    const room = applyRoomLayout(template, layout);
    const obstacles = room.props.flatMap(p=>p.collision ? [roomRectangle(p.x+p.collision.offsetX,p.y+p.collision.offsetY,p.collision.width,p.collision.height)] : []);
    const navigation = new NavigationGrid(room.floorAreas,[...(room.barriers ?? []),...obstacles],room,{agentRadius:PLAYER_RADIUS});
    const spawn = {x:room.spawn.x*room.width,y:room.spawn.y*room.height};
    if (!navigation.isWalkable(spawn.x,spawn.y)) return ['Keep the arrival point clear.'];
    const exit = {x:room.exit.x*room.width,y:room.exit.y*room.height};
    const exitApproach=layout.exit ? exit : navigation.closestPoint(exit.x,exit.y,spawn);
    if (Math.hypot(exitApproach.x-exit.x,exitApproach.y-exit.y)>48 || !navigation.isWalkable(exitApproach.x,exitApproach.y)) return ['Keep the exit on clear floor, away from walls and edges.'];
    if (!navigation.findPath(spawn,exitApproach).length) return ['Exit: leave a clear walking route from the arrival point.'];
    for (const door of layout.links ?? []) {
      if (!navigation.isWalkable(door.x,door.y) || !navigation.findPath(spawn,door).length) return [door.kind==='stairs'?'Stair landings must be on clear floor with a walking route from the entrance.':'Room doors must be on clear floor with a walking route from the entrance.'];
    }
    const targets = [...room.objects,...room.npcs.map(n=>({...n,label:n.id}))];
    const problems: string[] = [];
    for (const target of targets) {
      const point = {x:target.x*room.width,y:target.y*room.height};
      const reachable = navigation.closestPoint(point.x,point.y,spawn);
      if (Math.hypot(reachable.x-point.x,reachable.y-point.y)>48 || !navigation.findPath(spawn,reachable).length) problems.push(`${target.label}: leave a clear walking route from the arrival point.`);
    }
    if (!room.objects.length && !layout.links?.length) problems.push('Place at least one game or story station.');
    return problems;
  } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
}
