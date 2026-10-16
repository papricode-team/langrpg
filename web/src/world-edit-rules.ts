/**
 * Placement rules shared by in-game edit mode, the admin map editor, the
 * server edit worker and the scene compiler. Objects carry their own limits
 * (size range, which rooms they can host), so most mistakes cannot be made.
 * The remaining checks run on the objects an edit touched and name them.
 */
import {NavigationGrid,PLAYER_RADIUS,type MapPoint} from './navigation';
import {sceneNavigationGeometry} from './scene-navigation';
import {sceneryFootprints} from './placed-scenery';
import {terrainObject} from './terrain-objects';
import {
  getSceneryGeometry,getSceneryGeometryMap,scaleCanon,PERSON_HEIGHT,sceneEntrances,sceneEntrancePoint,sceneActivityPoint,
  sceneActivityPlaces,sceneryHasDoor,sceneInteriorIds,
  type ScenePoint,type ScenePolygon,type SceneScenery,type SceneInteriorKind,type WorldScene,
} from './scene-schema';

export type WorldProblemCode =
  | 'out-of-bounds' | 'off-ground' | 'overlap' | 'size' | 'no-door' | 'room-taken'
  | 'blocks-spawn' | 'blocks-route' | 'door-blocked' | 'activity-blocked' | 'resident-route'
  | 'in-use' | 'occupied' | 'locked' | 'missing' | 'invalid' | 'stale' | 'missing-room' | 'quality' | 'story-anchor';

export interface WorldProblem {
  code: WorldProblemCode;
  /** One plain sentence that names the object and says what to do. */
  message: string;
  map: string;
  /** Objects to highlight. */
  objectIds: string[];
  point?: ScenePoint;
  severity: 'error' | 'warning';
}

export class WorldEditError extends Error {
  readonly problems: WorldProblem[];
  constructor(problems: WorldProblem[]) { super(problems.map(problem => problem.message).join('\n')); this.problems = problems; }
}

/**
 * Problems that still refuse an edit, because the world would stop working as data: a
 * second room of one kind, a door on a building without one, an object outside the town,
 * a removed object someone's schedule uses. Everything else (routes, overlaps, water,
 * size) is the admin's call; the editor reports it as a warning and publishes anyway.
 */
export const blockingProblems: ReadonlySet<WorldProblemCode> = new Set<WorldProblemCode>(['invalid', 'missing', 'locked', 'stale', 'occupied', 'in-use', 'room-taken', 'no-door', 'out-of-bounds']);
const soften = (value: WorldProblem): WorldProblem => value.severity === 'error' && !blockingProblems.has(value.code) ? {...value, severity: 'warning'} : value;

export const problem = (code: WorldProblemCode, map: string, message: string, objectIds: string[] = [], point?: ScenePoint, severity: WorldProblem['severity'] = 'error'): WorldProblem =>
  ({code, map, message, objectIds, ...(point ? {point: {x: Math.round(point.x), y: Math.round(point.y)}} : {}), severity});

export const roomNames: Readonly<Record<SceneInteriorKind, string>> = {cafe: 'café', bakery: 'bakery', supermarket: 'supermarket', inn: 'inn'};
const assetNames: Readonly<Record<string, string>> = {
  archive: 'archive', cafe: 'café building', station: 'station', workshop: 'workshop', house: 'house', tree: 'tree', cypress: 'cypress',
  lamp: 'lamp', stall: 'market stall', fountain: 'fountain', arch: 'arch', greenhouse: 'greenhouse', boat: 'boat', bench: 'bench',
  planter: 'planter', sign: 'sign',
};
const frameNames: Readonly<Record<string, string>> = {'house-inn': 'inn house', 'house-bakery': 'bakery house', 'house-grocery': 'grocery house', 'garden-1': 'garden bed', 'garden-2': 'garden bed'};
const words = (id: string): string => id.replace(/-/g, ' ');
const capital = (text: string): string => text.charAt(0).toLocaleUpperCase('de') + text.slice(1);

/** A short name for an asset choice, such as "inn house" or "bench". */
export const assetLabel = (item: {asset: string; frame?: string}): string => terrainObject(item.frame)?.name??frameNames[item.frame ?? ''] ?? assetNames[item.asset] ?? words(item.asset);

/** "the bakery", "the bench", "Otto", "the receipt". Names in messages, never IDs. */
export function objectLabel(scene: WorldScene, id: string): string {
  const item = scene.scenery.find(value => value.id === id);
  if (item) return item.interior ? `the ${roomNames[item.interior.kind]}` : `the ${assetLabel(item)}`;
  if (scene.npcs.some(value => value.id === id)) return capital(words(id));
  // Evidence IDs carry their town, as in `lindenhafen-parcel`; the town goes without saying.
  if (scene.objects.some(value => value.id === id)) return `the ${words(id.startsWith(`${scene.id}-`) ? id.slice(scene.id.length + 1) : id)}`;
  const resident = scene.residents?.find(value => value.id === id);
  if (resident) return resident.name;
  return words(id);
}
export const townName = (mapId: string): string => capital(words(mapId));

/** Rooms are buildable on any building whose painting has a door. */
export function roomOptions(mapId: string, item: {asset: string; frame?: string}): readonly SceneInteriorKind[] {
  return sceneryHasDoor(mapId, item) ? sceneInteriorIds : [];
}

const SOURCE_DENSITY_MIN = 2.5;
const DOOR_PERSONS = 1.1;
/**
 * Width range in world units. Height must stay within the asset's canon in
 * adult heights, the painting must keep its detail, and a room's door must
 * stay tall enough to walk through.
 */
export function sizeRange(mapId: string, item: {asset: string; frame?: string; interior?: unknown}): {min: number; max: number} {
  const detail=terrainObject(item.frame);if(detail)return {min:Math.round(detail.worldWidth*.5),max:Math.min(Math.round(detail.worldWidth*1.6),Math.floor(detail.width/4))};
  const geometry = getSceneryGeometry(mapId, item), canon = scaleCanon[item.asset];
  const bounds = geometry?.visualBounds;
  if (!geometry || !bounds || !canon || geometry.referenceWidth <= 0) return {min: 8, max: 1024};
  const heightPerWidth = (bounds.bottom - bounds.top) / geometry.referenceWidth;
  let min = canon[0] * PERSON_HEIGHT / heightPerWidth;
  let max = Math.min(canon[1] * PERSON_HEIGHT / heightPerWidth, geometry.referenceWidth / SOURCE_DENSITY_MIN);
  if (item.interior && geometry.door) min = Math.max(min, DOOR_PERSONS * PERSON_HEIGHT * geometry.referenceWidth / geometry.door.height);
  const round = (value: number) => Math.round(value * 100) / 100;
  min = round(min); max = round(Math.max(min, max));
  return {min, max};
}
export const clampSize = (mapId: string, item: {asset: string; frame?: string; interior?: unknown}, width: number): number => {
  const range = sizeRange(mapId, item);
  return Math.min(range.max, Math.max(range.min, width));
};
/** A natural default width when an object is first placed. */
export const defaultSize = (mapId: string, item: {asset: string; frame?: string; interior?: unknown}): number => {
  const detail=terrainObject(item.frame);if(detail)return detail.worldWidth;
  const range = sizeRange(mapId, item);
  return Math.round((range.min + range.max) / 2 * 100) / 100;
};

// Geometry -----------------------------------------------------------------

interface Box { minX: number; minY: number; maxX: number; maxY: number; }
const box = (polygon: ScenePolygon): Box => ({
  minX: Math.min(...polygon.map(point => point[0])), minY: Math.min(...polygon.map(point => point[1])),
  maxX: Math.max(...polygon.map(point => point[0])), maxY: Math.max(...polygon.map(point => point[1])),
});
const boxesTouch = (a: Box, b: Box) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
function inside(polygon: ScenePolygon, x: number, y: number): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
}
function segmentsCross(a: readonly [number, number], b: readonly [number, number], c: readonly [number, number], d: readonly [number, number]): boolean {
  const cross = (p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}
/** Shapes that share area. Touching edges do not count. */
export function polygonsOverlap(a: ScenePolygon, b: ScenePolygon): boolean {
  if (!boxesTouch(box(a), box(b))) return false;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++)
    if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  return a.some(([x, y]) => inside(b, x, y)) || b.some(([x, y]) => inside(a, x, y));
}

const footprintsOf = (scene: WorldScene, item: SceneScenery): readonly ScenePolygon[] =>
  sceneryFootprints([item], getSceneryGeometryMap(scene.id));
const onGround = (scene: WorldScene, point: ScenePoint): boolean =>
  point.x >= 0 && point.y >= 0 && point.x <= scene.width && point.y <= scene.height;

// Reachability ---------------------------------------------------------------

/** Doors must open onto ground a player can stand on. */
export const SPOT_REACH = 24;
/** Residents stand exactly on their activity spots. */
export const ACTOR_REACH = 1;
/** Story characters and evidence can be talked to or read from nearby. */
export const TARGET_REACH = 120;
/** A story marker an admin places must stand next to open ground. */
export const MOVED_TARGET_REACH = 48;

export interface SceneTarget {
  id: string;
  kind: 'npc' | 'object' | 'door' | 'door-return' | 'activity';
  /** The placed object the target moves with. */
  ownerId: string;
  point: ScenePoint;
  reach: number;
}
export function sceneTargets(scene: WorldScene): SceneTarget[] {
  const targets: SceneTarget[] = [
    ...scene.npcs.map(anchor => ({id: anchor.id, kind: 'npc' as const, ownerId: anchor.id, point: {x: anchor.x, y: anchor.y}, reach: TARGET_REACH})),
    ...scene.objects.map(anchor => ({id: anchor.id, kind: 'object' as const, ownerId: anchor.id, point: {x: anchor.x, y: anchor.y}, reach: TARGET_REACH})),
  ];
  for (const entrance of sceneEntrances(scene)) {
    targets.push({id: `${entrance.ownerId}:door`, kind: 'door', ownerId: entrance.ownerId, point: sceneEntrancePoint(scene, entrance), reach: SPOT_REACH});
    targets.push({id: `${entrance.ownerId}:return`, kind: 'door-return', ownerId: entrance.ownerId, point: sceneEntrancePoint(scene, entrance, true), reach: SPOT_REACH});
  }
  for (const activity of scene.activities ?? []) {
    if (!scene.scenery.some(item => item.id === activity.ownerId)) continue;
    const owner = scene.scenery.find(item => item.id === activity.ownerId)!;
    const points = [sceneActivityPoint(scene, activity), ...sceneActivityPlaces(scene, activity),
      ...(['approach', 'exit'] as const).flatMap(key => activity[key] ? [{x: owner.x + activity[key].x, y: owner.y + activity[key].y}] : [])];
    points.forEach((point, index) => targets.push({id: `${activity.id}:${index}`, kind: 'activity', ownerId: activity.ownerId, point, reach: ACTOR_REACH}));
  }
  return targets;
}

/**
 * Navigation for one scene: a player-sized grid for people and doors, and a
 * point-sized grid for resident activity spots. Both update incrementally.
 */
export class SceneReach {
  readonly scene: WorldScene;
  readonly grid: NavigationGrid;
  readonly actors?: NavigationGrid;
  private constructor(scene: WorldScene, grid: NavigationGrid, actors?: NavigationGrid) { this.scene = scene; this.grid = grid; this.actors = actors; }
  static build(scene: WorldScene, withActors = true): SceneReach {
    const geometry = sceneNavigationGeometry(scene);
    return new SceneReach(scene, new NavigationGrid(geometry.ground, geometry.barriers, scene, {agentRadius: PLAYER_RADIUS}),
      withActors ? new NavigationGrid(geometry.ground, geometry.barriers, scene) : undefined);
  }
  /** Reuse grids that play already built for the same scene. Without an actor grid, activity spots are not checked. */
  static from(scene: WorldScene, grid: NavigationGrid, actors?: NavigationGrid): SceneReach { return new SceneReach(scene, grid, actors); }
  /** The same grids with the obstacles of another version of this scene. */
  with(scene: WorldScene): SceneReach {
    const barriers = sceneNavigationGeometry(scene).barriers;
    return new SceneReach(scene, this.grid.withObstacles(barriers), this.actors?.withObstacles(barriers));
  }
  get spawnClear(): boolean { return this.grid.isWalkable(this.scene.spawn.x, this.scene.spawn.y); }
  /** Whether a player, or for activity spots a resident, can get to the target from the arrival point. */
  reachesTarget(target: SceneTarget): boolean {
    const spawn = this.scene.spawn, {x, y} = target.point;
    if (target.kind === 'activity') {
      if (!this.actors) return true;
      if (!this.actors.isWalkable(spawn.x, spawn.y) || !this.actors.isWalkable(x, y)) return false;
      const approach = this.actors.closestPoint(x, y, spawn);
      return Math.hypot(approach.x - x, approach.y - y) <= target.reach;
    }
    if (!this.reaches(target.point, target.reach)) return false;
    if ((target.kind !== 'npc' && target.kind !== 'object') || !this.actors || !this.actors.isWalkable(spawn.x, spawn.y)) return true;
    // A story character must also stand on, or right beside, ground that joins the town.
    const feet = this.actors.closestPoint(x, y);
    if (Math.hypot(feet.x - x, feet.y - y) > target.reach) return false;
    const joined = this.actors.closestPoint(feet.x, feet.y, spawn);
    return Math.hypot(joined.x - feet.x, joined.y - feet.y) < 1;
  }
  /**
   * The nearest standing ground must be within reach and connect to the
   * arrival point. A separate pocket of ground next to a target does not count.
   */
  reaches(point: MapPoint, reach: number): boolean {
    if (!this.spawnClear) return false;
    const nearest = this.grid.closestPoint(point.x, point.y);
    if (Math.hypot(nearest.x - point.x, nearest.y - point.y) > reach) return false;
    const connected = this.grid.closestPoint(nearest.x, nearest.y, this.scene.spawn);
    return Math.hypot(connected.x - nearest.x, connected.y - nearest.y) < 1;
  }
  /** The nearest standing point that connects to the arrival point. */
  freeGround(point: MapPoint): MapPoint { return this.grid.closestPoint(point.x, point.y, this.scene.spawn); }
}

// Checks -----------------------------------------------------------------------

function targetProblem(scene: WorldScene, target: SceneTarget, moved: boolean): WorldProblem {
  const map = scene.id;
  if (target.kind === 'door' || target.kind === 'door-return') {
    const owner = objectLabel(scene, target.ownerId);
    return problem('door-blocked', map, `${capital(owner)} door would open onto blocked ground. Turn or move the building so its door faces a path.`, [target.ownerId], target.point);
  }
  if (target.kind === 'activity') {
    const owner = objectLabel(scene, target.ownerId);
    return problem('activity-blocked', map, `People could no longer reach ${owner}. Leave room in front of it.`, [target.ownerId], target.point);
  }
  const name = objectLabel(scene, target.id);
  return moved
    ? problem('blocks-route', map, `Players could not reach ${name} there. Put ${target.kind === 'npc' ? 'them' : 'it'} beside a path.`, [target.id], target.point)
    : problem('blocks-route', map, `This blocks the way to ${name}. Leave a path open.`, [target.id], target.point);
}

/**
 * Check what an edit changed. `before` and `after` are versions of one scene.
 * Only problems the edit introduced are reported: an existing tight corner
 * elsewhere never blocks an unrelated move. Pass `reach` to include routes.
 */
export function placementProblems(before: WorldScene, after: WorldScene, changed: ReadonlySet<string>,
  reach?: {before: SceneReach; after: SceneReach}, restored: ReadonlySet<string> = new Set()): WorldProblem[] {
  const problems: WorldProblem[] = [], map = after.id;
  const previous = new Map(before.scenery.map(item => [item.id, item]));
  const hazards = sceneNavigationGeometry(after).terrain.map((polygon,index)=>({id:`ground-${index}`,kind:'water',polygon}));
  for (const id of changed) {
    const item = after.scenery.find(value => value.id === id);
    const anchor = after.npcs.find(value => value.id === id) ?? after.objects.find(value => value.id === id);
    if (anchor) {
      if (anchor.x < 0 || anchor.y < 0 || anchor.x > after.width || anchor.y > after.height) problems.push(problem('out-of-bounds', map, `Keep ${objectLabel(after, id)} inside ${townName(map)}.`, [id], anchor));
      continue;
    }
    if (!item || restored.has(id)) continue;
    const name = objectLabel(after, id), old = previous.get(id);
    if (item.x < 0 || item.y < 0 || item.x > after.width || item.y > after.height) {
      problems.push(problem('out-of-bounds', map, `Keep ${name} inside ${townName(map)}.`, [id], item));
      continue;
    }
    if (!onGround(after, item)) { problems.push(problem('off-ground', map, `There is no ground under ${name} there.`, [id], item)); continue; }
    if (!old || old.frame !== item.frame || old.width !== item.width || !!old.interior !== !!item.interior) {
      const range = sizeRange(map, item);
      if (item.width < range.min - .01 || item.width > range.max + .01) problems.push(problem('size', map, `${capital(name)} can be between ${Math.round(range.min)} and ${Math.round(range.max)} wide.`, [id], item));
    }
    if (item.interior) {
      if (!sceneryHasDoor(map, item)) problems.push(problem('no-door', map, `${capital(assetLabel(item))} has no door, so it cannot be a ${roomNames[item.interior.kind]}.`, [id], item));
      const other = after.scenery.find(value => value.id !== id && value.interior?.kind === item.interior!.kind);
      if (other) problems.push(problem('room-taken', map, `${townName(map)} already has a ${roomNames[item.interior.kind]}. Choose another room or remove the other one first.`, [id, other.id], item));
    }
    if (item.collidable === false) continue;
    const shapes = footprintsOf(after, item);
    const oldShapes = old ? footprintsOf(before, old) : [];
    for (const hazard of hazards) {
      if (!shapes.some(shape => polygonsOverlap(shape, hazard.polygon))) continue;
      if (oldShapes.some(shape => polygonsOverlap(shape, hazard.polygon))) continue;
      const where = hazard.kind === 'water' ? 'in the water' : hazard.kind === 'cliff' ? 'on the cliff' : hazard.kind === 'rock' ? 'on the rocks' : 'inside a wall';
      problems.push(problem('off-ground', map, `${capital(name)} would stand ${where}.`, [id], item));
      break;
    }
    // Footprints may touch, as a tree trunk beside a wall does. An object
    // standing inside another object's base is always a mistake.
    const standsInside = (scene: WorldScene, a: SceneScenery, aShapes: readonly ScenePolygon[], b: SceneScenery) => {
      const bShapes = footprintsOf(scene, b);
      const within = bShapes.some(shape => inside(shape, a.x, a.y)) || aShapes.some(shape => inside(shape, b.x, b.y));
      return within && aShapes.some(shape => bShapes.some(value => polygonsOverlap(shape, value)));
    };
    for (const other of after.scenery) {
      if (other.id === id || other.collidable === false || !standsInside(after, item, shapes, other)) continue;
      // Authored towns have objects that already stand this close; moving one of them is not a new problem.
      const otherBefore = previous.get(other.id);
      if (old && otherBefore && old.collidable !== false && otherBefore.collidable !== false && standsInside(before, old, oldShapes, otherBefore)) continue;
      problems.push(problem('overlap', map, `${capital(name)} would stand inside ${objectLabel(after, other.id)}.`, [id, other.id], item));
      break;
    }
  }
  if (!reach || problems.some(value => value.severity === 'error' && blockingProblems.has(value.code))) return distinctProblems(problems.map(soften));
  if (!reach.after.spawnClear && reach.before.spawnClear) {
    problems.push(problem('blocks-spawn', map, `This covers the spot where players arrive in ${townName(map)}.`, [...changed], after.spawn));
    return problems.map(soften);
  }
  const beforeTargets = new Map(sceneTargets(before).map(target => [target.id, target]));
  for (const candidate of sceneTargets(after)) {
    const moved = changed.has(candidate.ownerId);
    const target = moved && (candidate.kind === 'npc' || candidate.kind === 'object') ? {...candidate, reach: MOVED_TARGET_REACH} : candidate;
    if (reach.after.reachesTarget(target)) continue;
    const earlier = beforeTargets.get(target.id);
    // Something unrelated was already unreachable; this edit did not cause it.
    if (!moved && earlier && !reach.before.reachesTarget(earlier)) continue;
    problems.push(targetProblem(after, target, moved));
  }
  return distinctProblems(problems.map(soften));
}

/** One message per issue, most important first, at most `limit`. */
export function distinctProblems(problems: readonly WorldProblem[], limit = 4): WorldProblem[] {
  const seen = new Set<string>(), result: WorldProblem[] = [];
  for (const item of [...problems].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))) {
    if (seen.has(item.message)) continue;
    seen.add(item.message); result.push(item);
  }
  return result.slice(0, limit);
}

/** Warnings that appear after an edit but did not exist before it. */
export function newWarnings(before: WorldScene, after: WorldScene): WorldProblem[] {
  const existing = new Set(sceneWarnings(before).map(item => item.message));
  return sceneWarnings(after).filter(item => !existing.has(item.message));
}

/** Composition hints for a whole town. They never block an edit. */
export function sceneWarnings(scene: WorldScene): WorldProblem[] {
  const problems: WorldProblem[] = [], map = scene.id;
  if (scene.kind !== 'interior' && ['lindenhafen', 'waldruh', 'nebelstadt'].includes(map)) for (const kind of sceneInteriorIds) {
    if (!scene.scenery.some(item => item.interior?.kind === kind))
      problems.push(problem('missing-room', map, `${townName(map)} has no ${roomNames[kind]}. Players cannot do the ${roomNames[kind]} activities here. Choose a building with a door and set its room.`, [], undefined, 'warning'));
  }
  return problems;
}

/**
 * Check a complete scene, for imports and the compiler. Everything players
 * need must be reachable.
 */
export function auditScene(scene: WorldScene, reach: SceneReach = SceneReach.build(scene)): WorldProblem[] {
  const problems: WorldProblem[] = [], map = scene.id;
  for (const item of scene.scenery) if (item.interior) {
    if (!sceneryHasDoor(map, item)) problems.push(problem('no-door', map, `${capital(assetLabel(item))} has no door, so it cannot be a ${roomNames[item.interior.kind]}.`, [item.id], item));
  }
  if (!reach.spawnClear) {
    problems.push(problem('blocks-spawn', map, `Something covers the spot where players arrive in ${townName(map)}.`, [], scene.spawn));
    return problems;
  }
  const seen = new Set<string>();
  for (const target of sceneTargets(scene)) {
    if (reach.reachesTarget(target)) continue;
    const issue = targetProblem(scene, target, true), key = `${issue.code}:${issue.objectIds.join(',')}`;
    if (!seen.has(key)) { seen.add(key); problems.push(issue); }
  }
  return [...problems, ...sceneWarnings(scene)];
}
