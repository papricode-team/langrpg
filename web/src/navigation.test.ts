import { describe, expect, it } from 'vitest';
import { createFallbackNavigation, createMapNavigation, createTownNavigation, MAP_HEIGHT, MAP_WIDTH, NavigationGrid, type MapPoint } from './navigation';
import { npcs } from './content';
import { getMap, type MapId } from './maps';

describe('Lindenhafen navigation', () => {
  const navigation = createTownNavigation();
  const spawn = { x: MAP_WIDTH * 0.52, y: MAP_HEIGHT * 0.61 };

  it('keeps the central arrival point on a street', () => {
    expect(navigation.isWalkable(spawn.x, spawn.y)).toBe(true);
  });

  it('connects every character to the central square without cutting through obstacles', () => {
    for (const npc of npcs) {
      const requested = { x: npc.x * MAP_WIDTH, y: npc.y * MAP_HEIGHT };
      const destination = navigation.closestPoint(requested.x, requested.y);
      const route = navigation.findPath(spawn, destination);
      expect(route.length, `${npc.name} must be reachable`).toBeGreaterThan(0);
      expect(route.at(-1)).toEqual(destination);
      let previous = spawn;
      for (const point of route) {
        const samples = Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 4);
        for (let i = 0; i <= samples; i++) {
          const fraction = samples ? i / samples : 0;
          expect(navigation.isWalkable(previous.x + (point.x - previous.x) * fraction, previous.y + (point.y - previous.y) * fraction), `${npc.name} route crosses an obstacle`).toBe(true);
        }
        previous = point;
      }
    }
  });

  it('blocks water, rooftops, market stalls, and both monuments', () => {
    const obstacles = [[1390,750], [597,258], [205,129], [1037,464], [818,535], [688,751]];
    for (const [x, y] of obstacles) expect(navigation.isWalkable(x, y)).toBe(false);
  });

  it('allows the canal bridges and routes a water click back onto the bank', () => {
    expect(navigation.isWalkable(1330, 948)).toBe(true);
    expect(navigation.isWalkable(1430, 355)).toBe(true);
    const shore = navigation.closestPoint(1390, 750);
    expect(navigation.isWalkable(shore.x, shore.y)).toBe(true);
    expect(navigation.findPath(spawn, shore).length).toBeGreaterThan(0);
  });
});

const rectangle = (x: number, y: number, width: number, height: number): readonly (readonly [number, number])[] =>
  [[x,y],[x+width,y],[x+width,y+height],[x,y+height]];

describe('painted scenery foot collisions', () => {
  // These are independently selected lamp-base and rear pavement coordinates
  // from the paintings, rather than values read back from the collision specs.
  // The canopy/pole can cover a character visually without closing the road.
  const fixtures: { mapId: MapId; base: MapPoint; behind: MapPoint }[] = [
    { mapId: 'lindenhafen', base: { x: 578, y: 602 }, behind: { x: 578, y: 570 } },
    { mapId: 'lindenhafen', base: { x: 595, y: 605 }, behind: { x: 595, y: 580 } },
    { mapId: 'waldruh', base: { x: 492, y: 582 }, behind: { x: 492, y: 565 } },
    { mapId: 'waldruh', base: { x: 353, y: 400 }, behind: { x: 353, y: 375 } },
    { mapId: 'waldruh', base: { x: 947, y: 570 }, behind: { x: 947, y: 550 } },
    { mapId: 'waldruh', base: { x: 542, y: 790 }, behind: { x: 542, y: 765 } },
    { mapId: 'nebelstadt', base: { x: 637, y: 318 }, behind: { x: 637, y: 298 } },
    { mapId: 'nebelstadt', base: { x: 448, y: 415 }, behind: { x: 448, y: 395 } },
    { mapId: 'nebelstadt', base: { x: 566, y: 604 }, behind: { x: 566, y: 580 } },
    { mapId: 'nebelstadt', base: { x: 914, y: 387 }, behind: { x: 914, y: 365 } },
    { mapId: 'nebelstadt', base: { x: 1119, y: 563 }, behind: { x: 1119, y: 543 } },
    { mapId: 'nebelstadt', base: { x: 432, y: 758 }, behind: { x: 432, y: 738 } },
  ];

  it('blocks feet at the painted lamp bases', () => {
    for (const { mapId, base } of fixtures) {
      const navigation = createMapNavigation(mapId);
      expect(navigation.isWalkable(base.x, base.y), `${mapId} lamp base at ${base.x},${base.y}`).toBe(false);
      const redirected = navigation.closestPoint(base.x, base.y);
      expect(navigation.isWalkable(redirected.x, redirected.y)).toBe(true);
      expect(Math.hypot(redirected.x - base.x, redirected.y - base.y)).toBeLessThan(30);
    }
  });

  it('keeps the pavement behind tall scenery connected to the arrival square', () => {
    for (const { mapId, behind } of fixtures) {
      const map = getMap(mapId);
      const navigation = createMapNavigation(mapId);
      const start = { x: map.spawn.x * MAP_WIDTH, y: map.spawn.y * MAP_HEIGHT };
      expect(navigation.isWalkable(behind.x, behind.y), `${mapId} rear pavement at ${behind.x},${behind.y}`).toBe(true);
      const route = navigation.findPath(start, behind);
      expect(route.length, `${mapId} rear pavement has no route`).toBeGreaterThan(0);
      expect(route.at(-1)).toEqual(behind);
      expectClearRoute(navigation, start, route);
    }
  });

  it('routes around a narrow lamp base rather than stepping through it', () => {
    const navigation = createMapNavigation('waldruh');
    const start = { x: 542, y: 765 };
    const destination = { x: 542, y: 810 };
    const route = navigation.findPath(start, destination);
    expect(route.length).toBeGreaterThan(1);
    expect(route.at(-1)).toEqual(destination);
    expectClearRoute(navigation, start, route);
  });

  it('leaves the procedural fallback independent of painted scenery', () => {
    expect(createFallbackNavigation().isWalkable(492, 582)).toBe(true);
  });
});

function expectClearRoute(navigation: NavigationGrid, start: MapPoint, route: MapPoint[]): void {
  let previous = start;
  for (const point of route) {
    // This independent dense check catches barriers narrower than the old six
    // pixel ray samples, including unsafe endpoint-to-grid connections.
    const samples = Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 0.2);
    for (let i = 0; i <= samples; i++) {
      const fraction = samples ? i / samples : 0;
      expect(navigation.isWalkable(previous.x + (point.x - previous.x) * fraction, previous.y + (point.y - previous.y) * fraction)).toBe(true);
    }
    previous = point;
  }
}

describe('continuous route collision checks', () => {
  it('rejects a frame movement that crosses a small base between walkable endpoints', () => {
    const navigation = new NavigationGrid([rectangle(40,40,400,240)], [rectangle(200,110,8,6)]);
    expect(navigation.isWalkable(204, 107)).toBe(true);
    expect(navigation.isWalkable(204, 119)).toBe(true);
    expect(navigation.canWalkSegment(204, 107, 204, 119)).toBe(false);
    expect(navigation.canWalkSegment(194, 107, 194, 119)).toBe(true);
    expect(navigation.canWalkSegment(204, 119, 204, 107)).toBe(false);
  });

  it('routes around a railing narrower than either the grid or old ray samples', () => {
    const navigation = new NavigationGrid([rectangle(40,40,400,240)], [rectangle(200.7,80,0.6,80)]);
    const start = { x:100, y:110 };
    const destination = { x:300, y:110 };
    const route = navigation.findPath(start, destination);
    expect(route.length).toBeGreaterThan(1);
    expect(route.at(-1)).toEqual(destination);
    expectClearRoute(navigation, start, route);
  });

  it('does not connect streets separated by a narrow gap', () => {
    const navigation = new NavigationGrid([rectangle(20,60,170,160), rectangle(191,60,170,160)]);
    expect(navigation.findPath({ x:100, y:140 }, { x:290, y:140 })).toEqual([]);
  });

  it('attaches an exact destination to a visible grid cell on its side of a wall', () => {
    const navigation = new NavigationGrid([rectangle(60,60,240,180)], [rectangle(127.8,60,0.4,100), rectangle(90,90,20,25)]);
    const start = { x:77, y:105 };
    const destination = { x:126.4, y:105 };
    const route = navigation.findPath(start, destination);
    expect(route.length).toBeGreaterThan(0);
    expect(route.at(-1)).toEqual(destination);
    expectClearRoute(navigation, start, route);
  });
});
