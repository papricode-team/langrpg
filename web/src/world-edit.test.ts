import {describe, expect, it} from 'vitest';
import {sceneDocument} from './scene-data';
import {sceneEntrancePoint, sceneEntrances, type WorldScene} from './scene-schema';
import {sceneNavigationGeometry} from './scene-navigation';
import {NavigationGrid, PLAYER_RADIUS} from './navigation';
import {applyEditOps, inverseEditOps, nextObjectId, parseEditOps, type WorldEditOp} from './world-edit-ops';
import {defaultActivities, newPlacement, paletteChoices} from './world-edit-palette';
import {auditScene, objectLabel, placementProblems, roomOptions, SceneReach, sizeRange, WorldEditError} from './world-edit-rules';

const town = (): WorldScene => structuredClone(sceneDocument.maps.waldruh);
const apply = (scene: WorldScene, ops: WorldEditOp[]) => {
  const result = applyEditOps({version: 3, maps: {[scene.id]: scene}}, ops);
  return {scene: result.document.maps[scene.id], changed: result.changed.get(scene.id) ?? new Set<string>(), restored: result.restored};
};

describe('world edit operations', () => {
  it('applies absolute edits without touching the input and undoes them exactly', () => {
    const scene = town(), lamp = scene.scenery.find(item => item.asset === 'lamp')!;
    const document = {version: 3 as const, maps: {[scene.id]: scene}};
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
    const document = {version: 3 as const, maps: {[scene.id]: scene}}, op: WorldEditOp = {kind: 'remove', map: scene.id, id: owner.id};
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
  it('rejects malformed operations from clients', () => {
    expect(() => parseEditOps([])).toThrow(WorldEditError);
    expect(() => parseEditOps([{kind: 'move', map: 'waldruh', id: 'Bad ID', x: 1, y: 2}])).toThrow('needs an object');
    expect(() => parseEditOps([{kind: 'update', map: 'waldruh', id: 'lamp', interior: {kind: 'casino'}}])).toThrow('Choose a room');
    expect(parseEditOps([{kind: 'update', map: 'waldruh', id: 'lamp', interior: null}])[0]).toMatchObject({interior: null});
  });
});

describe('placement rules', () => {
  it('derive size limits and room eligibility from the artwork', () => {
    const scene = town(), host = scene.scenery.find(item => item.interior)!, tree = scene.scenery.find(item => item.asset === 'tree')!;
    expect(roomOptions(scene.id, host)).toEqual(['cafe', 'bakery', 'supermarket', 'inn']);
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
  it('offers registered artwork with sizes inside the canon and copies activity spots', () => {
    const scene = structuredClone(sceneDocument.maps.lindenhafen), choices = paletteChoices(scene.id);
    expect(choices.length).toBeGreaterThan(10);
    expect(choices.filter(choice => choice.rooms.length).map(choice => choice.frame).sort()).toEqual(['house-bakery', 'house-grocery', 'house-inn']);
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
