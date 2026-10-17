import {describe, expect, it} from 'vitest';
import {buildingBounds} from './building-bounds';
import {sceneDocument} from './scene-data';
import {plainGround} from './ground';
import {sceneEntrancePoint, sceneEntrances, type WorldScene} from './scene-schema';
import {sceneNavigationGeometry} from './scene-navigation';
import {NavigationGrid, PLAYER_RADIUS} from './navigation';
import {applyEditOps, inverseEditOps, nextObjectId, parseEditOps, type WorldEditOp} from './world-edit-ops';
import {catalogueGroups,variantChoices,variantLabel} from './world-edit-catalogue';
import {sceneryFootprints,withSceneryCollision} from './placed-scenery';
import {getSceneryGeometryMap} from './scene-schema';
import {defaultActivities, newPlacement, paletteChoices} from './world-edit-palette';
import {auditScene, objectLabel, placementProblems, roomOptions, SceneReach, sizeRange, WorldEditError} from './world-edit-rules';

const town = (): WorldScene => structuredClone(sceneDocument.maps.waldruh);
const apply = (scene: WorldScene, ops: WorldEditOp[]) => {
  const result = applyEditOps({version: 4, maps: {[scene.id]: scene}}, ops);
  return {scene: result.document.maps[scene.id], changed: result.changed.get(scene.id) ?? new Set<string>(), restored: result.restored};
};

describe('world edit operations', () => {
  it('applies absolute edits without touching the input and undoes them exactly', () => {
    const scene = town(), lamp = scene.scenery.find(item => item.asset === 'lamp')!;
    const document = {version: 4 as const, maps: {[scene.id]: scene}};
    const ops: WorldEditOp[] = [{kind: 'move', map: scene.id, id: lamp.id, x: lamp.x + 10, y: lamp.y}, {kind: 'update', map: scene.id, id: lamp.id, flipX: true}];
    let current = document;
    const steps: WorldEditOp[][] = [];
    for (const op of ops) { steps.push(inverseEditOps(current, op)); current = applyEditOps(current, [op]).document; }
    const undo = steps.reverse().flat();
    expect(current.maps[scene.id].scenery.find(item => item.id === lamp.id)).toMatchObject({x: lamp.x + 10, flipX: true});
    expect(document.maps[scene.id].scenery.find(item => item.id === lamp.id)!.x).toBe(lamp.x);
    const restored = applyEditOps(current, undo).document.maps[scene.id].scenery.find(item => item.id === lamp.id)!;
    expect(restored.x).toBe(lamp.x);
    expect(!!restored.flipX).toBe(!!lamp.flipX);
  });
  it('restores a removed object with its activity spots', () => {
    const scene = town(), owner = scene.scenery.find(item => scene.activities?.some(slot => slot.ownerId === item.id) && !scene.residents?.some(resident => resident.schedule.some(task => scene.activities!.find(slot => slot.id === task.activityId)?.ownerId === item.id)));
    if (!owner) return;
    const document = {version: 4 as const, maps: {[scene.id]: scene}}, op: WorldEditOp = {kind: 'remove', map: scene.id, id: owner.id};
    const undo = inverseEditOps(document, op);
    const removed = applyEditOps(document, [op]).document;
    expect(removed.maps[scene.id].activities?.some(slot => slot.ownerId === owner.id)).toBe(false);
    const back = applyEditOps(removed, undo).document.maps[scene.id];
    expect(back.activities?.filter(slot => slot.ownerId === owner.id)).toEqual(scene.activities?.filter(slot => slot.ownerId === owner.id));
    expect(undo[0]).toMatchObject({kind: 'place', restore: true});
  });
  it('refuses to remove objects residents use, naming the residents', () => {
    const scene = structuredClone(sceneDocument.maps.lindenhafen), task = scene.residents![0].schedule[0];
    const owner = scene.activities!.find(slot => slot.id === task.activityId)!.ownerId;
    expect(() => apply(scene, [{kind: 'remove', map: scene.id, id: owner}])).toThrow(new RegExp(scene.residents![0].name));
  });
  it('scales and mirrors activity spots and a room return point with their building', () => {
    const scene = town(), host = scene.scenery.find(item => item.interior)!;
    host.interior = {...host.interior!, returnOffset: {x: 10, y: 80}};
    const next = apply(scene, [{kind: 'update', map: scene.id, id: host.id, width: host.width * 1.02}]).scene;
    expect(next.scenery.find(item => item.id === host.id)!.interior!.returnOffset!.x).toBeCloseTo(10.2);
    const flipped = apply(next, [{kind: 'update', map: scene.id, id: host.id, flipX: !host.flipX}]).scene;
    expect(flipped.scenery.find(item => item.id === host.id)!.interior!.returnOffset!.x).toBeCloseTo(-10.2);
  });
  it('swaps artwork in place, refreshes collision and restores authored metadata on undo', () => {
    const scene = town(), item = scene.scenery.find(item => item.asset === 'tree')!;
    item.frame = 'tree-1'; item.variant = true; item.flipX = true;
    item.collision = {referenceWidth: 100, polygons: [[[0, 0], [10, 0], [0, -10]]]};
    item.sortLine = [[-10, -2], [10, -2]];
    scene.activities = [{id: 'tree-wait', ownerId: item.id, kind: 'wait', offsetX: 0, offsetY: 20}];
    const document = {version: 4 as const, maps: {[scene.id]: scene}};
    const op = parseEditOps([{kind: 'update', map: scene.id, id: item.id, frame: 'tree-2'}])[0];
    const undo = parseEditOps(JSON.parse(JSON.stringify(inverseEditOps(document, op))));
    const result = applyEditOps(document, [op]).document, changed = result.maps[scene.id].scenery.find(value => value.id === item.id)!;
    expect(changed).toMatchObject({id: item.id, x: item.x, y: item.y, width: item.width, flipX: true, frame: 'tree-2', variant: true});
    expect(changed.sortLine).toBeUndefined();
    const manifest = getSceneryGeometryMap(scene.id), expected = withSceneryCollision({...item, frame: 'tree-2', collision: undefined}, manifest);
    expect(changed.collision).toBeUndefined();
    expect(sceneryFootprints([changed], manifest)).toEqual(sceneryFootprints([expected], manifest));
    expect(result.maps[scene.id].activities).toEqual(scene.activities);
    expect(applyEditOps(result, undo).document.maps[scene.id].scenery).toStrictEqual(scene.scenery);
    expect(item.frame).toBe('tree-1');
  });
  it('keeps a usable new footprint when a decorative variant becomes solid again', () => {
    const scene = town(), item = scene.scenery.find(item => item.asset === 'tree')!;
    item.collidable = false;
    item.collision = {referenceWidth: item.width, polygons: []};
    const swapped = apply(scene, [{kind: 'update', map: scene.id, id: item.id, frame: 'tree-3'}]).scene;
    const changed = swapped.scenery.find(value => value.id === item.id)!;
    expect(changed.collidable).toBe(false);
    expect(changed.collision).toBeUndefined();
    const solid = apply(swapped, [{kind: 'update', map: scene.id, id: item.id, collidable: true}]).scene;
    expect(sceneryFootprints([solid.scenery.find(value => value.id === item.id)!], getSceneryGeometryMap(scene.id)).length).toBeGreaterThan(0);
  });
  it('rejects unknown, unrelated and doorless replacements', () => {
    const scene = structuredClone(sceneDocument.maps.lindenhafen);
    const house = scene.scenery.find(item => item.asset === 'house' && item.interior)!;
    for (const frame of ['tree-2', 'house-999', 'house-1']) {
      expect(() => apply(scene, [{kind: 'update', map: scene.id, id: house.id, frame}])).toThrow('compatible version');
    }
    expect(() => parseEditOps([{kind: 'update', map: scene.id, id: house.id, frame: 123}])).toThrow('object version');
    expect(() => parseEditOps([{kind: 'update', map: scene.id, id: house.id, frame: 'house-2', restoreArtwork: {collision: {referenceWidth: 0, polygons: []}}}])).toThrow('artwork');
    const changed = apply(scene, [{kind: 'update', map: scene.id, id: house.id, frame: 'house-inn'}]).scene.scenery.find(item => item.id === house.id)!;
    expect(changed.interior).toEqual(house.interior);
  });
  it('rejects malformed operations from clients', () => {
    expect(() => parseEditOps([])).toThrow(WorldEditError);
    expect(() => parseEditOps([{kind: 'move', map: 'waldruh', id: 'Bad ID', x: 1, y: 2}])).toThrow('needs an object');
    expect(() => parseEditOps([{kind: 'update', map: 'waldruh', id: 'lamp', interior: {kind: 'casino'}}])).toThrow('Choose a room');
    expect(parseEditOps([{kind: 'update', map: 'waldruh', id: 'lamp', interior: null}])[0]).toMatchObject({interior: null});
  });
});

describe('placement rules', () => {
  it('allows overlapping building artwork while rejecting overlapping solid bases', () => {
    const scene = town();
    scene.width = 800; scene.height = 600;
    scene.ground = plainGround('meadow', 800, 600);
    scene.npcs = []; scene.objects = [];
    scene.activities = []; scene.residents = []; scene.spawn = {x: 50, y: 50};
    const building = {
      id: 'first-house', asset: 'house' as const, frame: 'house-4', x: 200, y: 300, width: 170,
      collision: {referenceWidth: 170, polygons: [[[-20, -20], [20, -20], [20, 20], [-20, 20]]] as [number, number][][]},
    };
    scene.scenery = [building, {...structuredClone(building), id: 'second-house', x: 600}];
    const reach = SceneReach.build(scene);
    const close = apply(scene, [{kind: 'move', map: scene.id, id: 'second-house', x: 250, y: 300}]);
    const geometry = getSceneryGeometryMap(scene.id).assets['house-4'];
    const first = buildingBounds(close.scene.scenery[0], geometry)!;
    const second = buildingBounds(close.scene.scenery[1], geometry)!;
    expect(first.right).toBeGreaterThan(second.left);
    expect(placementProblems(scene, close.scene, close.changed, {before: reach, after: reach.with(close.scene)})).toEqual([]);
    expect(auditScene(close.scene).filter(problem => problem.severity === 'error')).toEqual([]);

    const overlap = apply(scene, [{kind: 'move', map: scene.id, id: 'second-house', x: 205, y: 300}]);
    expect(placementProblems(scene, overlap.scene, overlap.changed, {before: reach, after: reach.with(overlap.scene)}))
      .toContainEqual(expect.objectContaining({code: 'overlap', objectIds: ['second-house', 'first-house']}));
  });
  it('lets an object that already stands inside another move without blaming it', () => {
    const scene = town();
    scene.width = 800; scene.height = 600;
    scene.ground = plainGround('meadow', 800, 600);
    scene.npcs = []; scene.objects = [];
    scene.activities = []; scene.residents = []; scene.spawn = {x: 50, y: 50};
    const square = {referenceWidth: 170, polygons: [[[-20, -20], [20, -20], [20, 20], [-20, 20]]] as [number, number][][]};
    // Authored this close: the tree stands inside the house's base.
    scene.scenery = [{id: 'house', asset: 'house', frame: 'house-4', x: 200, y: 300, width: 170, collision: square},
      {id: 'tree', asset: 'tree', x: 205, y: 300, width: 170, collision: square}];
    const nudged = apply(scene, [{kind: 'move', map: scene.id, id: 'tree', x: 210, y: 300}]);
    expect(placementProblems(scene, nudged.scene, nudged.changed).filter(problem => problem.code === 'overlap')).toEqual([]);
    // A third object moving in is still refused.
    scene.scenery.push({id: 'lamp', asset: 'lamp', x: 600, y: 300, width: 40, collision: square});
    const crowded = apply(scene, [{kind: 'move', map: scene.id, id: 'lamp', x: 202, y: 300}]);
    expect(placementProblems(scene, crowded.scene, crowded.changed)).toContainEqual(expect.objectContaining({code: 'overlap'}));
  });
  it('derive size limits and room eligibility from the artwork', () => {
    const scene = town(), host = scene.scenery.find(item => item.interior)!, tree = scene.scenery.find(item => item.asset === 'tree')!;
    expect(roomOptions(scene.id, host)).toEqual(['cafe', 'bakery', 'supermarket', 'inn', 'library', 'workshop', 'station', 'greenhouse', 'home']);
    expect(roomOptions(scene.id, tree)).toEqual([]);
    const plain = sizeRange(scene.id, {...host, interior: undefined}), room = sizeRange(scene.id, host);
    expect(room.min).toBeGreaterThanOrEqual(plain.min);
    expect(host.width).toBeGreaterThanOrEqual(room.min - .01);
    expect(host.width).toBeLessThanOrEqual(room.max + .01);
  });
  it('name the objects involved in plain sentences', () => {
    const scene = town(), host = scene.scenery.find(item => item.interior)!;
    const tooBig = apply(scene, [{kind: 'update', map: scene.id, id: host.id, width: host.width * 3}]);
    const problems = placementProblems(scene, tooBig.scene, tooBig.changed);
    expect(problems[0].message).toMatch(new RegExp(`^${objectLabel(scene, host.id).replace(/^the/, 'The')} can be between \\d+ and \\d+ wide\\.$`));
    expect(problems[0].objectIds).toEqual([host.id]);
    expect(problems.every(problem => !/[a-z]+-[a-z]+-\d/.test(problem.message))).toBe(true);
  });
  it('leave layout choices to the admin and refuse only edits that break the world', () => {
    const scene = town(), hosts = scene.scenery.filter(item => item.interior);
    const tooBig = apply(scene, [{kind: 'update', map: scene.id, id: hosts[0].id, width: hosts[0].width * 3}]);
    expect(new Set(placementProblems(scene, tooBig.scene, tooBig.changed).map(problem => problem.severity))).toEqual(new Set(['warning']));
    const twice = apply(scene, [{kind: 'update', map: scene.id, id: hosts[1].id, interior: {kind: hosts[0].interior!.kind}}]);
    expect(placementProblems(scene, twice.scene, twice.changed).find(problem => problem.code === 'room-taken')?.severity).toBe('error');
  });
  it('blocks a second room of the same kind and an object outside the town', () => {
    const scene = town(), hosts = scene.scenery.filter(item => item.interior);
    const twice = apply(scene, [{kind: 'update', map: scene.id, id: hosts[1].id, interior: {kind: hosts[0].interior!.kind}}]);
    expect(placementProblems(scene, twice.scene, twice.changed).map(problem => problem.code)).toContain('room-taken');
    const lamp = scene.scenery.find(item => item.asset === 'lamp')!;
    const outside = apply(scene, [{kind: 'move', map: scene.id, id: lamp.id, x: -50, y: lamp.y}]);
    expect(placementProblems(scene, outside.scene, outside.changed)[0].code).toBe('out-of-bounds');
  });
  it('reports only routes an edit cut, using the incremental grid', () => {
    const scene = town(), reach = SceneReach.build(scene);
    const door = sceneEntrances(scene)[0], point = sceneEntrancePoint(scene, door);
    const id = nextObjectId(scene, 'house');
    const blocker = apply(scene, [{kind: 'place', map: scene.id, item: {id, asset: 'house', frame: 'house-4', x: point.x, y: point.y + 40, width: 170, motion: 'building'}}]);
    const problems = placementProblems(scene, blocker.scene, blocker.changed, {before: reach, after: reach.with(blocker.scene)});
    expect(problems.length).toBeGreaterThan(0);
    const harmless = scene.scenery.find(item => item.asset === 'lamp')!;
    const nudged = apply(scene, [{kind: 'move', map: scene.id, id: harmless.id, x: harmless.x + 1, y: harmless.y}]);
    expect(placementProblems(scene, nudged.scene, nudged.changed, {before: reach, after: reach.with(nudged.scene)})).toEqual([]);
  }, 30000);
  it('accept the committed towns as they are', () => {
    for (const scene of Object.values(sceneDocument.maps)) {
      expect(auditScene(scene).filter(problem => problem.severity === 'error'), scene.id).toEqual([]);
    }
  }, 60000);
});

describe('incremental navigation', () => {
  it('matches a freshly built grid after an obstacle moves', () => {
    const scene = town(), lamp = scene.scenery.find(item => item.asset === 'house')!;
    const geometry = sceneNavigationGeometry(scene);
    const base = new NavigationGrid(geometry.ground, geometry.barriers, scene, {agentRadius: PLAYER_RADIUS});
    const moved = apply(scene, [{kind: 'move', map: scene.id, id: lamp.id, x: lamp.x + 48, y: lamp.y + 12}]).scene;
    const next = sceneNavigationGeometry(moved);
    const incremental = base.withObstacles(next.barriers), fresh = new NavigationGrid(next.ground, next.barriers, scene, {agentRadius: PLAYER_RADIUS});
    for (let y = 2; y < scene.height; y += 10) for (let x = 2; x < scene.width; x += 10) expect(incremental.isWalkable(x, y)).toBe(fresh.isWalkable(x, y));
    expect(incremental.auditConnectedArea(scene.spawn)).toEqual(fresh.auditConnectedArea(scene.spawn));
    expect(base.withObstacles(geometry.barriers)).toBe(base);
  }, 30000);
});

describe('palette', () => {
  it('groups all variants with distinct names and limits swaps to compatible objects', () => {
    const choices = paletteChoices('waldruh'), groups = catalogueGroups(choices);
    expect(groups.flatMap(group => group.choices)).toEqual(choices);
    const trees = groups.find(group => group.asset === 'tree')!.choices;
    expect(trees.map(choice => choice.frame)).toEqual(['tree', 'tree-1', 'tree-2', 'tree-3', 'tree-4']);
    expect(new Set(trees.map(variantLabel)).size).toBe(trees.length);
    const item = newPlacement(town(), trees[1], {x: 500, y: 500});
    expect(item.variant).toBe(true);
    expect(variantChoices(choices, item)).toEqual(trees);
    const original = newPlacement(town(), trees[0], item);
    expect(original.frame).toBeUndefined();
    expect(original.variant).toBeUndefined();
  });
  it('offers registered artwork with sizes inside the canon and copies activity spots', () => {
    const scene = structuredClone(sceneDocument.maps.lindenhafen), choices = paletteChoices(scene.id);
    expect(choices.length).toBeGreaterThan(10);
    expect(choices.filter(choice => choice.rooms.length).map(choice => choice.frame).sort()).toEqual(['cafe', 'house-bakery', 'house-grocery', 'house-inn', 'station-office', 'station-ticket-hall']);
    const bench = choices.find(choice => choice.asset === 'bench')!, item = newPlacement(scene, bench, {x: 100.4, y: 200.6});
    const range = sizeRange(scene.id, item);
    expect(item).toMatchObject({x: 100, y: 201});
    expect(item.width).toBeGreaterThanOrEqual(range.min);
    expect(item.width).toBeLessThanOrEqual(range.max);
    const spots = defaultActivities(scene, item);
    if (scene.scenery.some(other => (other.frame ?? other.asset) === (item.frame ?? item.asset) && scene.activities?.some(slot => slot.ownerId === other.id))) {
      expect(spots.length).toBeGreaterThan(0);
      expect(spots.every(slot => slot.ownerId === item.id && slot.id.startsWith(item.id))).toBe(true);
    }
  });
});
