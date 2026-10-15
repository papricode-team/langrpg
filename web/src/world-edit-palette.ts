/** Objects an admin can add, with sizes that already fit the town. */
import {sceneryAssets} from './placed-scenery';
import {getSceneryGeometryMap,type SceneActivity,type ScenePoint,type SceneScenery,type WorldScene} from './scene-schema';
import {nextObjectId} from './world-edit-ops';
import {assetLabel,defaultSize,roomOptions} from './world-edit-rules';

export interface PaletteChoice {
  asset: SceneScenery['asset'];
  frame: string;
  label: string;
  /** Rooms this building can host; empty for everything else. */
  rooms: readonly string[];
}

const motionFor = (asset: SceneScenery['asset']): SceneScenery['motion'] =>
  asset === 'tree' || asset === 'cypress' ? 'tree' : asset === 'lamp' ? 'lamp' : asset === 'boat' ? 'boat' : asset === 'fountain' ? 'water'
    : asset === 'stall' ? 'cloth' : ['archive', 'cafe', 'station', 'workshop', 'house', 'greenhouse'].includes(asset) ? 'building' : 'still';

const groupOrder = ['house', 'cafe', 'archive', 'station', 'workshop', 'greenhouse', 'stall', 'fountain', 'arch', 'tree', 'cypress', 'planter', 'bench', 'lamp', 'sign', 'boat'];

/** Every painted object registered for this town, buildings first. */
export function paletteChoices(mapId: string): PaletteChoice[] {
  const assets = getSceneryGeometryMap(mapId).assets;
  return Object.entries(assets).flatMap(([frame, geometry]) => {
    if (!geometry.visualBounds) return [];
    const name = frame.startsWith('garden-') ? 'planter' : frame.split('-')[0];
    if (!sceneryAssets.includes(name as SceneScenery['asset'])) return [];
    const asset = name as SceneScenery['asset'];
    return [{asset, frame, label: assetLabel({asset, frame}), rooms: roomOptions(mapId, {asset, frame})}];
  }).sort((a, b) => groupOrder.indexOf(a.asset) - groupOrder.indexOf(b.asset) || a.frame.localeCompare(b.frame));
}

/** A new object at a point, sized from its artwork. */
export function newPlacement(scene: WorldScene, choice: PaletteChoice, point: {x: number; y: number}): SceneScenery {
  const item: SceneScenery = {id: nextObjectId(scene, choice.frame), asset: choice.asset, x: Math.round(point.x), y: Math.round(point.y),
    width: defaultSize(scene.id, choice), motion: motionFor(choice.asset)};
  if (choice.frame !== choice.asset) item.frame = choice.frame;
  return item;
}

/**
 * Activity spots for a new object, copied from an existing object with the same
 * artwork and scaled to the new width. A new bench gets seats like the others.
 */
export function defaultActivities(scene: WorldScene, item: SceneScenery): SceneActivity[] {
  const frame = item.frame ?? item.asset;
  const example = scene.scenery.find(other => (other.frame ?? other.asset) === frame && (scene.activities ?? []).some(slot => slot.ownerId === other.id));
  if (!example) return [];
  const scale = item.width / example.width, mirror = !!example.flipX === !!item.flipX ? 1 : -1, round = (value: number) => Math.round(value * 1000) / 1000;
  const point = (p: ScenePoint) => ({x: round(p.x * scale * mirror), y: round(p.y * scale)});
  const used = new Set([...scene.scenery.map(value => value.id), ...(scene.activities ?? []).map(slot => slot.id)]);
  return (scene.activities ?? []).filter(slot => slot.ownerId === example.id).map(slot => {
    let sequence = 1;
    while (used.has(`${item.id}-${slot.kind}-${sequence}`)) sequence++;
    const id = `${item.id}-${slot.kind}-${sequence}`; used.add(id);
    return {...structuredClone(slot), id, ownerId: item.id, offsetX: round(slot.offsetX * scale * mirror), offsetY: round(slot.offsetY * scale),
      ...(slot.approach ? {approach: point(slot.approach)} : {}), ...(slot.exit ? {exit: point(slot.exit)} : {}), ...(slot.places ? {places: slot.places.map(point)} : {})};
  });
}
