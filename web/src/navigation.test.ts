import { describe, expect, it } from 'vitest';
import { createFallbackNavigation, createMapNavigation, createTownNavigation, NavigationGrid, PLAYER_RADIUS, type MapPoint } from './navigation';
import { npcs } from './content';
import { getMap, type MapId } from './maps';

describe('Lindenhafen navigation', () => {
  const navigation = createTownNavigation();
  const map = getMap('lindenhafen');
  const spawn = { x: map.width * map.spawn.x, y: map.height * map.spawn.y };

  it('keeps the central arrival point on clear ground', () => {
    expect(navigation.isWalkable(spawn.x, spawn.y)).toBe(true);
  });

  it('connects every character to the central square without cutting through obstacles', () => {
    for (const npc of map.npcs) {
      const name = npcs.find(character => character.id === npc.id)!.name;
      const requested = { x: npc.x * map.width, y: npc.y * map.height };
      const destination = navigation.closestPoint(requested.x, requested.y);
      const route = navigation.findPath(spawn, destination);
      expect(route.length, `${name} must be reachable`).toBeGreaterThan(0);
      expect(route.at(-1)).toEqual(destination);
      let previous = spawn;
      for (const point of route) {
        const samples = Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 4);
        for (let i = 0; i <= samples; i++) {
          const fraction = samples ? i / samples : 0;
          expect(navigation.isWalkable(previous.x + (point.x - previous.x) * fraction, previous.y + (point.y - previous.y) * fraction), `${name} route crosses an obstacle`).toBe(true);
        }
        previous = point;
      }
    }
  });

  it('blocks water, building foundations, market counters, and fountain rims', () => {
    const obstacles = [[1346,520], [700,540], [1840,380], [700,772], [860,684]];
    for (const [x, y] of obstacles) expect(navigation.isWalkable(x, y)).toBe(false);
  });

  it('allows the canal bridges and routes a water click back onto the bank', () => {
    expect(navigation.isWalkable(1163, 760)).toBe(true);
    expect(navigation.isWalkable(1471, 330)).toBe(true);
    const shore = navigation.closestPoint(1346, 520, spawn);
    expect(navigation.isWalkable(shore.x, shore.y)).toBe(true);
    expect(navigation.findPath(spawn, shore).length).toBeGreaterThan(0);
  });
});

const rectangle = (x: number, y: number, width: number, height: number): readonly (readonly [number, number])[] =>
  [[x,y],[x+width,y],[x+width,y+height],[x,y+height]];

describe('player footprint navigation', () => {
  const bounds = { width: 480, height: 320 };

  it('uses the same body radius in towns and procedural fallback', () => {
    expect(PLAYER_RADIUS).toBe(10);
    for (const id of ['lindenhafen', 'waldruh', 'nebelstadt'] as const) expect(createMapNavigation(id).agentRadius).toBe(PLAYER_RADIUS);
    expect(createFallbackNavigation().agentRadius).toBe(PLAYER_RADIUS);
  });

  it('requires clearance from the street edge and obstacle rather than only a clear centre', () => {
    const streets = [rectangle(40, 40, 400, 240)], barriers = [rectangle(200, 100, 40, 80)];
    const pointNavigation = new NavigationGrid(streets, barriers, bounds);
    const navigation = new NavigationGrid(streets, barriers, bounds, { agentRadius: PLAYER_RADIUS });
    expect(pointNavigation.agentRadius).toBe(0);
    expect(pointNavigation.isWalkable(45, 80)).toBe(true);
    expect(navigation.clearanceAt(45, 80)).toBeCloseTo(5);
    expect(navigation.isWalkable(45, 80)).toBe(false);
    expect(navigation.isWalkable(51, 80)).toBe(true);
    expect(pointNavigation.isWalkable(195, 140)).toBe(true);
    expect(navigation.clearanceAt(195, 140)).toBeCloseTo(5);
    expect(navigation.isWalkable(195, 140)).toBe(false);
    const snapped = navigation.closestPoint(195, 140);
    expect(navigation.clearanceAt(snapped.x, snapped.y)).toBeGreaterThanOrEqual(PLAYER_RADIUS);
  });

  it('treats adjoining street polygons as one floor without an invisible wall at the shared edge', () => {
    const navigation = new NavigationGrid([rectangle(40, 40, 160, 240), rectangle(200, 40, 240, 240)], [], bounds, { agentRadius: PLAYER_RADIUS });
    expect(navigation.clearanceAt(200, 160)).toBeCloseTo(120);
    expect(navigation.isWalkable(200, 160)).toBe(true);
    expect(navigation.canWalkSegment(180, 160, 220, 160)).toBe(true);
    expect(navigation.move({ x: 180, y: 160 }, { x: 40, y: 0 })).toEqual({ x: 220, y: 160 });
  });

  it('retains exposed edges while discarding only the overlapping sections of street boundaries', () => {
    const navigation = new NavigationGrid([rectangle(40, 40, 180, 120), rectangle(120, 100, 180, 120)], [], bounds, {agentRadius:PLAYER_RADIUS});
    expect(navigation.clearanceAt(190, 110)).toBeCloseTo(Math.hypot(30, 10));
    expect(navigation.canWalkSegment(180, 95, 180, 130)).toBe(true);
    expect(navigation.isWalkable(225, 105)).toBe(false);
    expect(navigation.isWalkable(215, 95)).toBe(false);
  });

  it('snaps a blocked click into the player’s connected streets while preserving disconnected destination failures', () => {
    const navigation = new NavigationGrid([rectangle(40, 40, 80, 160), rectangle(200, 40, 180, 240)], [], bounds, {agentRadius:PLAYER_RADIUS});
    const start = {x:80,y:120}, click = {x:190,y:120};
    expect(navigation.closestPoint(click.x, click.y).x).toBeGreaterThan(200);
    const connected = navigation.closestPoint(click.x, click.y, start);
    expect(connected.x).toBeLessThan(120);
    expect(navigation.isWalkable(connected.x, connected.y)).toBe(true);
    expect(navigation.findPath(start, click).at(-1)).toEqual(connected);
    const disconnected = {x:250,y:120};
    expect(navigation.isWalkable(disconnected.x, disconnected.y)).toBe(true);
    expect(navigation.findPath(start, disconnected)).toEqual([]);
  });

  it('closes a corridor narrower than the body even when the point planner can use it', () => {
    const streets = [rectangle(40, 40, 120, 240), rectangle(160, 151, 160, 18), rectangle(320, 40, 120, 240)];
    const start = { x: 100, y: 160 }, destination = { x: 380, y: 160 };
    expect(new NavigationGrid(streets, [], bounds).findPath(start, destination)).toEqual([destination]);
    const navigation = new NavigationGrid(streets, [], bounds, { agentRadius: PLAYER_RADIUS });
    expect(navigation.clearanceAt(240, 160)).toBeCloseTo(9);
    expect(navigation.isWalkable(240, 160)).toBe(false);
    expect(navigation.findPath(start, destination)).toEqual([]);
    const moved = navigation.move(start, { x: destination.x - start.x, y: 0 });
    expect(moved.x).toBeLessThan(160);
    expect(navigation.isWalkable(moved.x, moved.y)).toBe(true);
  });

  it('sweeps the whole body continuously past a railing thinner than one grid cell', () => {
    const navigation = new NavigationGrid([rectangle(40, 40, 400, 240)], [rectangle(200.7, 80, .6, 80)], bounds, { agentRadius: PLAYER_RADIUS });
    expect(navigation.isWalkable(100, 70.5)).toBe(true);
    expect(navigation.isWalkable(300, 70.5)).toBe(true);
    expect(navigation.canWalkSegment(100, 70.5, 300, 70.5)).toBe(false);
    expect(navigation.canWalkSegment(100, 69, 300, 69)).toBe(true);
    const start = { x: 100, y: 110 }, moved = navigation.move(start, { x: 200, y: 0 });
    expect(moved.x).toBeGreaterThan(190);
    expect(moved.x).toBeLessThanOrEqual(190.7);
    expect(moved.y).toBeCloseTo(start.y);
    expect(navigation.canWalkSegment(start.x, start.y, moved.x, moved.y)).toBe(true);
  });

  it('slides along a diagonal wall and gives consistent travel across frame sizes', () => {
    const navigation = new NavigationGrid([rectangle(40, 40, 400, 240)], [[[140, 40], [440, 40], [440, 280], [380, 280]]], bounds, { agentRadius: PLAYER_RADIUS });
    const start = { x: 160, y: 160 }, delta = { x: 120, y: 0 };
    const moved = navigation.move(start, delta);
    expect(moved.x).toBeGreaterThan(245);
    expect(moved.y).toBeGreaterThan(175);
    expect(navigation.isWalkable(moved.x, moved.y)).toBe(true);
    let stepped = start;
    for (let frame = 0; frame < 12; frame++) stepped = navigation.move(stepped, { x: delta.x / 12, y: 0 });
    expect(Math.hypot(stepped.x - moved.x, stepped.y - moved.y)).toBeLessThan(.1);
  });

  it('holds the body outside a closed corner and allows immediate movement away', () => {
    const navigation = new NavigationGrid([rectangle(40, 40, 400, 240)], [rectangle(200, 40, 240, 240), rectangle(40, 200, 400, 80)], bounds, {agentRadius:PLAYER_RADIUS});
    let position = navigation.move({x:100,y:100}, {x:200,y:200});
    expect(position.x).toBeGreaterThan(189.9);
    expect(position.y).toBeGreaterThan(189.9);
    for (let frame = 0; frame < 32; frame++) {
      position = navigation.move(position, {x:8,y:8});
      expect(position.x).toBeLessThanOrEqual(190);
      expect(position.y).toBeLessThanOrEqual(190);
      expect(navigation.isWalkable(position.x, position.y)).toBe(true);
    }
    const escaped = navigation.move(position, {x:-20,y:-20});
    expect(escaped.x).toBeCloseTo(position.x - 20);
    expect(escaped.y).toBeCloseTo(position.y - 20);
  });

  it('keeps every planned segment clear for the full footprint, including rounded obstacle corners', () => {
    const streets = [rectangle(40, 40, 400, 240)], barriers = [rectangle(200, 100, 40, 80)];
    const pointNavigation = new NavigationGrid(streets, barriers, bounds);
    const navigation = new NavigationGrid(streets, barriers, bounds, { agentRadius: PLAYER_RADIUS });
    const start = { x: 100, y: 140 }, destination = { x: 350, y: 140 };
    const route = navigation.findPath(start, destination);
    expect(route.length).toBeGreaterThan(1);
    expect(route.at(-1)).toEqual(destination);
    let previous = start;
    for (const point of route) {
      const steps = Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y));
      for (let step = 0; step <= steps; step++) {
        const fraction = steps ? step / steps : 0;
        const centre = { x: previous.x + (point.x - previous.x) * fraction, y: previous.y + (point.y - previous.y) * fraction };
        // Check the circle against the original point geometry independently
        // of the clearance function used by the planner and movement.
        for (let sample = 0; sample < 32; sample++) {
          const angle = sample * Math.PI / 16;
          expect(pointNavigation.isWalkable(centre.x + Math.cos(angle) * (PLAYER_RADIUS - .001), centre.y + Math.sin(angle) * (PLAYER_RADIUS - .001))).toBe(true);
        }
      }
      previous = point;
    }
  });
});

describe('painted scenery foot collisions', () => {
  const playerNavigation = new Map<MapId, NavigationGrid>();
  const actorNavigation = new Map<MapId, NavigationGrid>();
  const navigationFor = (mapId: MapId, agentRadius = PLAYER_RADIUS): NavigationGrid => {
    const cache = agentRadius ? playerNavigation : actorNavigation;
    const existing = cache.get(mapId);
    if (existing) return existing;
    const navigation = createMapNavigation(mapId, {agentRadius});
    cache.set(mapId, navigation);
    return navigation;
  };
  // These are independently selected lamp-base and rear pavement coordinates
  // from the paintings, rather than values read back from the collision specs.
  // The canopy/pole can cover a character visually without closing the road.
  const fixtures: { mapId: MapId; base: MapPoint; behind: MapPoint }[] = [
    { mapId: 'lindenhafen', base: { x: 280, y: 316 }, behind: { x: 280, y: 290 } },
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
      const navigation = navigationFor(mapId);
      expect(navigation.isWalkable(base.x, base.y), `${mapId} lamp base at ${base.x},${base.y}`).toBe(false);
      const redirected = navigation.closestPoint(base.x, base.y);
      expect(navigation.isWalkable(redirected.x, redirected.y)).toBe(true);
      expect(Math.hypot(redirected.x - base.x, redirected.y - base.y)).toBeLessThan(30);
    }
  });

  it('keeps the pavement behind tall scenery connected to the arrival square', () => {
    for (const { mapId, behind } of fixtures) {
      const map = getMap(mapId);
      const navigation = navigationFor(mapId);
      const pointNavigation = navigationFor(mapId, 0);
      const start = { x: map.spawn.x * map.width, y: map.spawn.y * map.height };
      expect(pointNavigation.isWalkable(behind.x, behind.y), `${mapId} rear pavement at ${behind.x},${behind.y}`).toBe(true);
      const approach = navigation.closestPoint(behind.x, behind.y);
      expect(Math.hypot(approach.x - behind.x, approach.y - behind.y), `${mapId} rear pavement must leave room for the body`).toBeLessThan(20);
      const route = navigation.findPath(start, approach);
      expect(route.length, `${mapId} rear pavement has no route`).toBeGreaterThan(0);
      expect(route.at(-1)).toEqual(approach);
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

  it('keeps the pavement beside a canon-sized lamp free of its former oversized collision', () => {
    const navigation = createMapNavigation('lindenhafen');
    expect(navigation.isWalkable(280,316)).toBe(false);
    expect(createMapNavigation('lindenhafen', {agentRadius:0}).isWalkable(297,318)).toBe(true);
    const approach = navigation.closestPoint(297, 318);
    expect(Math.hypot(approach.x - 297, approach.y - 318)).toBeLessThan(20);
    expect(navigation.isWalkable(approach.x, approach.y)).toBe(true);
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

describe('fine navigation and map audits', () => {
  it('routes along a narrow bent alley close to the map border', () => {
    const navigation = new NavigationGrid([rectangle(4,4,116,8),rectangle(112,4,8,116)], [], {width:128,height:128});
    const start = {x:8,y:8}, destination = {x:116,y:108};
    expect(navigation.isWalkable(4,4)).toBe(true);
    expect(navigation.isWalkable(3,4)).toBe(false);
    const route = navigation.findPath(start,destination);
    expect(route.at(-1)).toEqual(destination);
    expectClearRoute(navigation,start,route);
    expect(navigation.auditConnectedArea(start).cellSize).toBe(8);
  });

  it('retains a diagonal path when its exact edges are clear and side cells are outside the path', () => {
    const navigation = new NavigationGrid([[[20,24],[24,20],[108,104],[104,108]]], [], {width:128,height:128});
    expect(navigation.auditConnectedArea({x:28,y:28}).connectedCells).toBeGreaterThan(8);
  });

  it('reports isolated walkable samples and excludes blocked ground from the denominator', () => {
    const navigation = new NavigationGrid([rectangle(16,16,40,40),rectangle(80,16,24,24)], [rectangle(88,24,8,8)], {width:128,height:80});
    const audit = navigation.auditReachability({x:20,y:20},8);
    expect(audit.walkableSamples).toBe(48);
    expect(audit.reachableSamples).toBe(36);
    expect(audit.unreachableSamples).toBe(12);
    expect(audit.reachableRatio).toBe(.75);
    expect(audit.unreachableBounds).toEqual({minX:80,minY:16,maxX:104,maxY:40});
    for (const point of audit.unreachablePoints) expect(navigation.findPath({x:20,y:20},point)).toEqual([]);
  });

  it('exposes visible grid dots with both authored polygons and physical barriers', () => {
    const street = rectangle(4,4,100,100), barrier = rectangle(40,40,16,16);
    const navigation = new NavigationGrid([street],[barrier],{width:128,height:128});
    const debug = navigation.debugGeometry({x:20,y:20,right:36,bottom:36});
    expect(debug.walkable).toEqual([street]);
    expect(debug.obstacles).toEqual([]);
    expect(debug.nodes).toHaveLength(9);
    expect(debug.nodes.every(point=>point.x>=20&&point.x<=36&&point.y>=20&&point.y<=36)).toBe(true);
    expect(navigation.debugGeometry().obstacles).toEqual([barrier]);
  });

  it('keeps nearest-point projection exact across cached cells and off-map clicks', () => {
    const navigation = new NavigationGrid([rectangle(24,24,8,8),rectangle(40,24,8,8)],[],{width:80,height:80});
    expect(navigation.closestPoint(35,30)).toEqual({x:28,y:28});
    expect(navigation.closestPoint(37,30)).toEqual({x:44,y:28});
    expect(navigation.closestPoint(-100,30)).toEqual({x:28,y:28});
    expect(navigation.closestPoint(1000,30)).toEqual({x:44,y:28});
  });
});
