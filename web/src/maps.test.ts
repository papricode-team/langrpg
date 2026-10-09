import { describe, expect, it } from 'vitest';
import { maps, storyMaps, getMap, type StoryMapId } from './maps';
import { expeditionIds, getExpedition, getExpeditionEncounter } from './expeditions';
import { npcs, quests } from './content';
import { createMapNavigation, MAP_WIDTH, MAP_HEIGHT, type MapPoint, type NavigationGrid } from './navigation';

const position = (point: MapPoint): MapPoint => ({ x: point.x * MAP_WIDTH, y: point.y * MAP_HEIGHT });

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
  it('keeps the three story paintings and adds ten independent exploration regions', () => {
    expect(maps.map(map => map.id)).toEqual(['lindenhafen', 'waldruh', 'nebelstadt', ...expeditionIds]);
    expect(new Set(maps.map(map => map.asset)).size).toBe(13);
    expect(storyMaps.map(map => map.spawn)).toEqual([{ x: .52, y: .61 }, { x: .52, y: .54 }, { x: .50, y: .55 }]);
    for (const map of maps) expect(getMap(map.id)).toBe(map);
  });

  it('uses unique discoveries and existing exercises at the region’s level', () => {
    const exercises = new Map(quests.flatMap(quest => quest.exercises.map(exercise => [exercise.id, quest.level] as const)));
    const ids = new Set<string>();
    for (const map of maps) {
      expect(map.objects.length).toBeGreaterThanOrEqual(4);
      const expedition = getExpedition(map.id);
      expect(new Set(map.npcs.map(npc => npc.id))).toEqual(new Set((expedition?.npcs ?? npcs).map(npc => npc.id)));
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

for (const map of maps) describe(`${map.name} paths`, () => {
  const navigation = createMapNavigation(map.id);
  const spawn = position(map.spawn);

  it('places arrivals and every NPC’s feet directly on pavement', () => {
    expect(navigation.isWalkable(spawn.x, spawn.y)).toBe(true);
    for (const npc of map.npcs) {
      const point = position(npc);
      expect(navigation.isWalkable(point.x, point.y), npc.id).toBe(true);
    }
  });

  it('reaches every story character and discovery without crossing roofs or water', () => {
    for (const item of [...map.npcs, ...map.objects]) {
      const raw = position(item);
      const destination = navigation.closestPoint(raw.x, raw.y);
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
    lindenhafen: [[1390,750],[597,258],[1037,464],[818,535]],
    waldruh: [[1400,820],[300,160],[1250,430],[650,650],[1070,730],[720,452]],
    nebelstadt: [[1450,830],[300,190],[720,140],[1070,220],[1080,710],[650,710],[742,448]],
  };
  it('excludes each painting’s own buildings, monuments, stalls and open water', () => {
    for (const map of storyMaps) {
      const navigation = createMapNavigation(map.id);
      for (const [x, y] of blocked[map.id as StoryMapId]) expect(navigation.isWalkable(x, y), `${map.id}: ${x},${y}`).toBe(false);
    }
  });

  it('connects the woodland stream bridge and both harbor bridges', () => {
    const crossings: Record<StoryMapId, number[][]> = {
      lindenhafen: [[1430,355],[1330,948]], waldruh: [[1280,605]], nebelstadt: [[1330,400],[1340,652]],
    };
    for (const map of storyMaps) {
      const navigation = createMapNavigation(map.id), spawn = position(map.spawn);
      for (const [x, y] of crossings[map.id as StoryMapId]) {
        expect(navigation.isWalkable(x, y), `${map.id} bridge`).toBe(true);
        const route = navigation.findPath(spawn, { x, y });
        expect(route.length).toBeGreaterThan(0);
        verifyRoute(navigation, spawn, route);
      }
    }
  });
});
