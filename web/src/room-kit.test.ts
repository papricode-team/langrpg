import {describe, expect, it} from 'vitest';
import {buildingInteriors} from './building-interiors';
import {getInterior} from './interiors';
import {roomKit, roomLighting, roomWindows} from './room-kit';
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
  it('shares the inn window anchor with its floor shaft and follows edited floors', () => {
    const inn = getInterior('inn');
    expect(roomWindows(inn)[0]).toMatchObject({x: 1000, bottom: 345, floorY: 365});
    expect(roomLighting(inn).windows).toEqual(roomWindows(inn));
    const cafe = getInterior('cafe');
    const shifted = {...cafe, floorAreas: cafe.floorAreas.map(polygon => polygon.map(([x,y]) => [x+40,y+20] as const))};
    expect(roomLighting(shifted).windows.map(window => [window.x, window.floorY])).toEqual(
      roomLighting(cafe).windows.map(window => [window.x+40, window.floorY+20]));
  });
  it('gives every room template a lamp, and includes the café candle flame', () => {
    for (const id of ['inn', 'cafe', 'bakery', 'supermarket', ...buildingInteriors.map(room => room.id)] as const) {
      expect(roomLighting(getInterior(id)).lamps.length).toBeGreaterThan(0);
    }
    expect(roomLighting(getInterior('cafe')).lamps).toContainEqual(expect.objectContaining({x:1300,y:664}));
    const spec = {...getInterior('home'), floorAreas: [[[100,300],[350,300],[350,650],[100,650]]] as const};
    expect(roomKit(spec).walls.some(wall => wall.window)).toBe(false);
    expect(roomLighting(spec).lamps).toHaveLength(1);
  });
  it('keeps buildings distinct when scenery is reordered or another house is removed', () => {
    const scene = getWorldScene('lindenhafen');
    const before = sceneEntrances(scene);
    const after = sceneEntrances({...scene, scenery: [...scene.scenery].reverse().filter(item => item.id !== 'high-street-house')});
    for (const entrance of after) expect(entrance.interiorId).toBe(before.find(item => item.id === entrance.id)!.interiorId);
    expect(new Set(before.map(entrance => entrance.interiorId)).size).toBe(before.length);
    expect(before.filter(entrance => entrance.interiorId.startsWith('train-')).map(entrance => entrance.ownerId)).toEqual(['station']);
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
