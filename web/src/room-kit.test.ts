import {describe, expect, it} from 'vitest';
import {buildingInteriors} from './building-interiors';
import {getInterior} from './interiors';
import {roomKit} from './room-kit';
import {sceneEntrances} from './scene-schema';
import {getWorldScene} from './scene-data';
import {miniGameById} from './minigames/catalogue';

describe('component rooms', () => {
  it('joins adjacent floor modules without drawing an internal wall across their doorway', () => {
    const room = {...getInterior('cafe'), floorAreas: [
      [[100,300],[500,300],[500,700],[100,700]],
      [[500,300],[900,300],[900,700],[500,700]],
    ] as const};
    const kit = roomKit(room);
    expect(kit.floors).toHaveLength(2);
    expect(kit.walls).toHaveLength(4);
    expect(kit.walls.some(wall => wall.from[0] === 500 && wall.to[0] === 500)).toBe(false);
  });
  it('moves wall geometry with the floor instead of retaining the old painted outline', () => {
    const room = getInterior('library');
    const moved = {...room, floorAreas: room.floorAreas.map(polygon => polygon.map(([x, y]) => [x + 40, y + 20] as const))};
    expect(roomKit(moved).walls.map(wall => wall.from)).toEqual(roomKit(room).walls.map(wall => [wall.from[0] + 40, wall.from[1] + 20]));
  });
  it('keeps buildings distinct when scenery is reordered or another house is removed', () => {
    const scene = getWorldScene('lindenhafen');
    const before = sceneEntrances(scene);
    const after = sceneEntrances({...scene, scenery: [...scene.scenery].reverse().filter(item => item.id !== 'high-street-house')});
    for (const entrance of after) expect(entrance.interiorId).toBe(before.find(item => item.ownerId === entrance.ownerId)!.interiorId);
    const houses = before.filter(entrance => entrance.interiorId.startsWith('home--'));
    expect(houses.length).toBeGreaterThan(1);
    expect(new Set(houses.map(entrance => getInterior(entrance.interiorId).id)).size).toBe(houses.length);
  });
  it('gives every new room working game stations and an all-level game', () => {
    for (const room of buildingInteriors) {
      expect(room.objects.some(object => miniGameById.get(object.minigame!)?.levels.length === 3)).toBe(true);
      for (const object of room.objects) {
        expect(miniGameById.has(object.minigame!)).toBe(true);
        expect(room.props.find(prop => prop.interactive === object.id)?.collision).toBeDefined();
      }
    }
  });
});
