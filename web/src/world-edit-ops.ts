/**
 * World edits as small, absolute operations. The server applies them to the
 * published document and broadcasts the same operations, so every client
 * reaches the same document by applying them in order.
 */
import {withSceneryCollision} from './placed-scenery';
import {
  getSceneryGeometryMap,sceneActivityUsers,sceneInteriorIds,sceneSceneryAssets,
  type SceneActivity,type SceneInterior,type SceneResident,type SceneScenery,type ScenePoint,type WorldScene,type WorldSceneDocument,
} from './scene-schema';
import {objectLabel,problem,WorldEditError} from './world-edit-rules';

export type WorldEditOp =
  | {kind: 'move'; map: string; id: string; x: number; y: number}
  | {kind: 'update'; map: string; id: string; width?: number; flipX?: boolean; collidable?: boolean; interior?: SceneInterior | null}
  /** `restore` reinstates an object exactly as it was, for undo; routes are still checked. */
  | {kind: 'place'; map: string; item: SceneScenery; activities?: SceneActivity[]; restore?: boolean}
  | {kind: 'remove'; map: string; id: string}
  | {kind: 'moveAnchor'; map: string; anchor: 'npc' | 'object'; id: string; x: number; y: number}
  | {kind: 'residents'; map: string; residents: SceneResident[]};

export const MAX_EDIT_OPS = 50;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = (map: string, message: string) => new WorldEditError([problem('invalid', map, message)]);

/** Shape check for operations received from a client. Content checks happen when applying. */
export function parseEditOps(value: unknown): WorldEditOp[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_EDIT_OPS) throw invalid('', `Send between 1 and ${MAX_EDIT_OPS} edits at a time.`);
  return value.map(op => {
    if (!record(op) || typeof op.map !== 'string' || !slug.test(op.map)) throw invalid('', 'An edit needs a town.');
    const map = op.map, id = op.id;
    const needId = () => { if (typeof id !== 'string' || !slug.test(id)) throw invalid(map, 'An edit needs an object.'); };
    const needPoint = () => { if (!finite(op.x) || !finite(op.y)) throw invalid(map, 'A move needs a position.'); };
    switch (op.kind) {
      case 'move': needId(); needPoint(); return {kind: 'move', map, id: id as string, x: op.x as number, y: op.y as number};
      case 'moveAnchor':
        needId(); needPoint();
        if (op.anchor !== 'npc' && op.anchor !== 'object') throw invalid(map, 'Only story characters and evidence can be moved this way.');
        return {kind: 'moveAnchor', map, anchor: op.anchor, id: id as string, x: op.x as number, y: op.y as number};
      case 'update': {
        needId();
        const update: Extract<WorldEditOp, {kind: 'update'}> = {kind: 'update', map, id: id as string};
        if (op.width !== undefined) { if (!finite(op.width) || op.width <= 0) throw invalid(map, 'Choose a size.'); update.width = op.width; }
        for (const key of ['flipX', 'collidable'] as const) if (op[key] !== undefined) {
          if (typeof op[key] !== 'boolean') throw invalid(map, 'Choose on or off.');
          update[key] = op[key] as boolean;
        }
        if (op.interior !== undefined) {
          if (op.interior !== null && (!record(op.interior) || !sceneInteriorIds.includes(op.interior.kind as SceneInterior['kind']))) throw invalid(map, 'Choose a room.');
          update.interior = op.interior as SceneInterior | null;
        }
        return update;
      }
      case 'place':
        if (!record(op.item) || typeof op.item.id !== 'string' || !slug.test(op.item.id) || !sceneSceneryAssets.includes(op.item.asset as SceneScenery['asset'])
          || !finite(op.item.x) || !finite(op.item.y) || !finite(op.item.width)) throw invalid(map, 'Choose an object to place.');
        if (op.activities !== undefined && !Array.isArray(op.activities)) throw invalid(map, 'Activity spots must be a list.');
        return {kind: 'place', map, item: op.item as unknown as SceneScenery, ...(op.activities ? {activities: op.activities as SceneActivity[]} : {}), ...(op.restore === true ? {restore: true} : {})};
      case 'remove': needId(); return {kind: 'remove', map, id: id as string};
      case 'residents':
        if (!Array.isArray(op.residents)) throw invalid(map, 'Residents must be a list.');
        return {kind: 'residents', map, residents: op.residents as SceneResident[]};
      default: throw invalid(map, 'Unknown edit.');
    }
  });
}

/** Objects an operation edits. Another admin must not hold any of them. */
export function editOpTargets(op: WorldEditOp): string[] {
  if (op.kind === 'place') return [op.item.id];
  if (op.kind === 'residents') return [];
  return [op.id];
}

function sceneOf(document: WorldSceneDocument, op: WorldEditOp): WorldScene {
  const scene = document.maps[op.map];
  if (!scene) throw invalid(op.map, `There is no town called ${op.map}.`);
  return scene;
}
function itemOf(scene: WorldScene, id: string): SceneScenery {
  const item = scene.scenery.find(value => value.id === id);
  if (!item) throw new WorldEditError([problem('missing', scene.id, 'That object no longer exists. Someone may have removed it.', [id])]);
  return item;
}
const round = (value: number) => Math.round(value * 1000) / 1000;

/** Width and mirroring scale the spots attached to an object, like its painted door. */
function transformOwned(scene: WorldScene, before: SceneScenery, after: SceneScenery): WorldScene {
  const scale = after.width / before.width, mirror = !!before.flipX === !!after.flipX ? 1 : -1;
  if (scale === 1 && mirror === 1) return scene;
  const point = (p: ScenePoint) => ({x: round(p.x * scale * mirror), y: round(p.y * scale)});
  const activities = scene.activities?.map(slot => slot.ownerId !== after.id ? slot : {
    ...slot, offsetX: round(slot.offsetX * scale * mirror), offsetY: round(slot.offsetY * scale),
    ...(slot.approach ? {approach: point(slot.approach)} : {}), ...(slot.exit ? {exit: point(slot.exit)} : {}),
    ...(slot.places ? {places: slot.places.map(point)} : {}),
  });
  const scenery = scene.scenery.map(item => item.id !== after.id || !item.interior?.returnOffset ? item
    : {...item, interior: {...item.interior, returnOffset: point(item.interior.returnOffset)}});
  return {...scene, scenery, ...(activities ? {activities} : {})};
}

function applyOne(document: WorldSceneDocument, op: WorldEditOp): WorldSceneDocument {
  const scene = sceneOf(document, op);
  let next: WorldScene;
  switch (op.kind) {
    case 'move': {
      const item = itemOf(scene, op.id);
      next = {...scene, scenery: scene.scenery.map(value => value === item ? {...value, x: round(op.x), y: round(op.y)} : value)};
      break;
    }
    case 'moveAnchor': {
      const key = op.anchor === 'npc' ? 'npcs' : 'objects';
      if (!scene[key].some(value => value.id === op.id)) throw new WorldEditError([problem('missing', scene.id, 'That story marker is not in this town.', [op.id])]);
      next = {...scene, [key]: scene[key].map(value => value.id === op.id ? {...value, x: round(op.x), y: round(op.y)} : value)};
      break;
    }
    case 'update': {
      const item = itemOf(scene, op.id), changed: SceneScenery = {...item};
      if (op.width !== undefined) changed.width = round(op.width);
      if (op.flipX !== undefined) { if (op.flipX) changed.flipX = true; else delete changed.flipX; }
      if (op.collidable !== undefined) { if (op.collidable) delete changed.collidable; else changed.collidable = false; }
      if (op.interior !== undefined) {
        if (op.interior === null) delete changed.interior;
        else changed.interior = {kind: op.interior.kind, ...(item.interior?.returnOffset ? {returnOffset: item.interior.returnOffset} : {})};
      }
      next = transformOwned({...scene, scenery: scene.scenery.map(value => value === item ? changed : value)}, item, changed);
      break;
    }
    case 'place': {
      if (scene.scenery.some(value => value.id === op.item.id)) throw invalid(scene.id, 'Another object already uses that name. Try again.');
      const item = {...op.item, x: round(op.item.x), y: round(op.item.y), width: round(op.item.width)};
      // Clear-land scenes keep each object's footprint with the object, as the compiler does.
      const placed = scene.navigation ? withSceneryCollision(item, getSceneryGeometryMap(scene.id)) : item;
      const activities = op.activities?.map(slot => ({...slot, ownerId: item.id}));
      next = {...scene, scenery: [...scene.scenery, placed],
        ...(activities?.length ? {activities: [...(scene.activities ?? []), ...activities]} : {})};
      break;
    }
    case 'remove': {
      const item = itemOf(scene, op.id);
      const slots = new Set((scene.activities ?? []).filter(slot => slot.ownerId === item.id).map(slot => slot.id));
      const users = sceneActivityUsers(scene, slots);
      if (users.length) {
        const names = [...new Set(users.map(user => user.split('/')[0]))].join(' and ');
        throw new WorldEditError([problem('in-use', scene.id, `${names} use${users.length === 1 ? 's' : ''} ${objectLabel(scene, item.id)} in their day. Change their schedule under Admin › Residents first.`, [item.id], item)]);
      }
      next = {...scene, scenery: scene.scenery.filter(value => value !== item),
        ...(scene.activities ? {activities: scene.activities.filter(slot => slot.ownerId !== item.id)} : {}),
        ...(scene.generationZones ? {generationZones: scene.generationZones.map(zone => zone.pinnedIds ? {...zone, pinnedIds: zone.pinnedIds.filter(id => id !== item.id)} : zone)} : {})};
      break;
    }
    case 'residents':
      next = {...scene, residents: structuredClone(op.residents)};
      break;
  }
  return {...document, maps: {...document.maps, [scene.id]: next}};
}

export interface AppliedEdits {
  document: WorldSceneDocument;
  /** Changed object IDs per town, for placement checks. */
  changed: Map<string, Set<string>>;
  /** Objects put back exactly as they were. */
  restored: Set<string>;
}
/** Apply operations in order without mutating the input document. */
export function applyEditOps(document: WorldSceneDocument, ops: readonly WorldEditOp[]): AppliedEdits {
  const changed = new Map<string, Set<string>>(), restored = new Set<string>();
  let next = document;
  for (const op of ops) {
    if (op.kind === 'place' && op.restore) restored.add(op.item.id);
    next = applyOne(next, op);
    const ids = changed.get(op.map) ?? new Set<string>();
    for (const id of editOpTargets(op)) ids.add(id);
    changed.set(op.map, ids);
  }
  return {document: next, changed, restored};
}

/** Operations that undo `op` when applied after it. Compute before applying. */
export function inverseEditOps(document: WorldSceneDocument, op: WorldEditOp): WorldEditOp[] {
  const scene = sceneOf(document, op);
  switch (op.kind) {
    case 'move': { const item = itemOf(scene, op.id); return [{kind: 'move', map: op.map, id: op.id, x: item.x, y: item.y}]; }
    case 'moveAnchor': {
      const anchor = (op.anchor === 'npc' ? scene.npcs : scene.objects).find(value => value.id === op.id);
      return anchor ? [{...op, x: anchor.x, y: anchor.y}] : [];
    }
    case 'update': {
      const item = itemOf(scene, op.id), undo: Extract<WorldEditOp, {kind: 'update'}> = {kind: 'update', map: op.map, id: op.id};
      if (op.width !== undefined) undo.width = item.width;
      if (op.flipX !== undefined) undo.flipX = !!item.flipX;
      if (op.collidable !== undefined) undo.collidable = item.collidable !== false;
      if (op.interior !== undefined) undo.interior = item.interior ?? null;
      return [undo];
    }
    case 'place': return [{kind: 'remove', map: op.map, id: op.item.id}];
    case 'remove': {
      const item = itemOf(scene, op.id), activities = (scene.activities ?? []).filter(slot => slot.ownerId === op.id);
      return [{kind: 'place', map: op.map, item: structuredClone(item), ...(activities.length ? {activities: structuredClone(activities)} : {}), restore: true}];
    }
    case 'residents': return [{kind: 'residents', map: op.map, residents: structuredClone(scene.residents ?? [])}];
  }
}

/** A fresh object name such as `waldruh-bench-4`. */
export function nextObjectId(scene: WorldScene, asset: string): string {
  const used = new Set([...scene.scenery.map(item => item.id), ...(scene.activities ?? []).map(slot => slot.id)]);
  let sequence = 1;
  while (used.has(`${scene.id}-${asset}-${sequence}`)) sequence++;
  return `${scene.id}-${asset}-${sequence}`;
}
