import { describe, expect, it } from 'vitest';
import { maps, storyMaps, getMap, localCast, type StoryMapId } from './maps';
import { expeditionIds, expeditionMaps, getExpedition, getExpeditionEncounter } from './expeditions';
import { npcs, quests } from './content';
import { createMapNavigation, type MapPoint, type NavigationGrid } from './navigation';

const position = (point: MapPoint, bounds: { width: number; height: number }): MapPoint => ({ x: point.x * bounds.width, y: point.y * bounds.height });

function verifyRoute(navigation: NavigationGrid, start: MapPoint, route: MapPoint[]): void {
  let previous = start;
  for (const point of route) {
    const steps = Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y));
    for (let step = 0; step <= steps; step++) {
      const fraction = steps ? step / steps : 0;
      expect(navigation.isWalkable(previous.x + (point.x - previous.x) * fraction, previous.y + (point.y - previous.y) * fraction)).toBe(true);
    }
    previous = point;
  }
}

describe('painted region definitions', () => {
  it('keeps only the three authored story towns playable', () => {
    expect(maps.map(map => map.id)).toEqual(['lindenhafen', 'waldruh', 'nebelstadt']);
    expect(new Set(maps.map(map => map.sceneryAsset)).size).toBe(3);
    expect(storyMaps.map(map => map.spawn)).toEqual([{ x: .52, y: .61 }, { x: .52, y: .54 }, { x: .50, y: .55 }]);
    for (const map of maps) expect(getMap(map.id).id).toBe(map.id);
    expect(expeditionMaps).toHaveLength(10);
    for (const id of expeditionIds) expect(getMap(id).id).toBe('lindenhafen');
  });

  it('uses unique discoveries and existing exercises at the region’s level', () => {
    const exercises = new Map(quests.flatMap(quest => quest.exercises.map(exercise => [exercise.id, quest.level] as const)));
    const ids = new Set<string>();
    for (const map of maps) {
      expect(map.objects.length).toBeGreaterThanOrEqual(4);
      const expedition = getExpedition(map.id);
      const travelling = npcs.filter(npc => npc.id !== 'schaffner' && !localCast[npc.id] && (npc.id !== 'elise' || map.id === 'nebelstadt'));
      const local = expedition ? [] : npcs.filter(npc => localCast[npc.id]?.includes(map.id as StoryMapId));
      expect(new Set(map.npcs.map(npc => npc.id))).toEqual(new Set((expedition?.npcs ?? [...travelling, ...local]).map(npc => npc.id)));
      for (const object of map.objects) {
        expect(ids.has(object.id), `${object.id} must identify one discovery`).toBe(false);
        ids.add(object.id);
        expect(object.id.startsWith(`${map.id}-`)).toBe(true);
        expect(object.description.length).toBeGreaterThan(30);
        if (expedition) expect(getExpeditionEncounter(map.id, object.id)).toBeDefined();
        else expect(object.exerciseIds.length).toBeGreaterThan(0);
        for (const id of object.exerciseIds) expect(exercises.get(id), id).toBe(map.level);
      }
    }
  });
});

for (const map of maps.map(map => getMap(map.id))) describe(`${map.name} paths`, () => {
  const navigation = createMapNavigation(map.id);
  const actorNavigation = createMapNavigation(map.id, {agentRadius:0});
  const spawn = position(map.spawn, map);

  it('places arrivals on clear ground and keeps authored NPC feet beside a safe player approach', () => {
    expect(navigation.isWalkable(spawn.x, spawn.y)).toBe(true);
    for (const npc of map.npcs) {
      const point = position(npc, map);
      expect(actorNavigation.isWalkable(point.x, point.y), npc.id).toBe(true);
      const approach = navigation.closestPoint(point.x, point.y, spawn);
      expect(Math.hypot(approach.x - point.x, approach.y - point.y), npc.id).toBeLessThan(60);
      expect(navigation.isWalkable(approach.x, approach.y), npc.id).toBe(true);
    }
  });

  it('reaches every story character and discovery without crossing foundations or water', () => {
    for (const item of [...map.npcs, ...map.objects]) {
      const raw = position(item, map);
      const destination = navigation.closestPoint(raw.x, raw.y, spawn);
      // An object may sit inside a fountain or on a noticeboard; its pavement
      // approach must stay close enough for the contextual action to activate.
      expect(Math.hypot(raw.x - destination.x, raw.y - destination.y), item.id).toBeLessThan(60);
      const route = navigation.findPath(spawn, destination);
      expect(route.length, `${item.id} has no route from the arrival square`).toBeGreaterThan(0);
      expect(route.at(-1)).toEqual(destination);
      verifyRoute(navigation, spawn, route);

      const angle = Math.atan2(spawn.y - raw.y, spawn.x - raw.x);
      const approach = navigation.findPath(spawn, { x: raw.x + Math.cos(angle) * 58, y: raw.y + Math.sin(angle) * 58 });
      expect(approach.length, `${item.id} cannot be approached by the world action`).toBeGreaterThan(0);
      const end = approach.at(-1)!;
      expect(Math.hypot(raw.x - end.x, raw.y - end.y), item.id).toBeLessThan(140);
    }
  });
});

describe('region-specific scenery barriers', () => {
  const blocked: Record<StoryMapId, number[][]> = {
    lindenhafen: [[1346,520],[700,540],[700,772],[860,684]],
    waldruh: [[1170,600],[600,410],[735,520],[1424,300],[640,920],[885,410]],
    nebelstadt: [[250,320],[700,320],[818,690],[1452,700],[600,950],[1150,750],[230,492],[2222,870]],
  };
  it('excludes each painting’s own buildings, monuments, stalls and open water', () => {
    for (const map of storyMaps) {
      const navigation = createMapNavigation(map.id);
      for (const [x, y] of blocked[map.id as StoryMapId]) expect(navigation.isWalkable(x, y), `${map.id}: ${x},${y}`).toBe(false);
    }
  });

  it('connects the woodland stream bridge and both harbor bridges', () => {
    const crossings: Record<StoryMapId, number[][]> = {
      lindenhafen: [[1471,330],[1163,760],[904,1130]], waldruh: [[1382,451],[1198,791]], nebelstadt: [[1826,920],[210,880],[2160,935]],
    };
    for (const map of storyMaps) {
      const navigation = createMapNavigation(map.id), activeMap = getMap(map.id), spawn = position(activeMap.spawn, activeMap);
      for (const [x, y] of crossings[map.id as StoryMapId]) {
        expect(navigation.isWalkable(x, y), `${map.id} bridge`).toBe(true);
        const route = navigation.findPath(spawn, { x, y });
        expect(route.length).toBeGreaterThan(0);
        verifyRoute(navigation, spawn, route);
      }
    }
  });
});
