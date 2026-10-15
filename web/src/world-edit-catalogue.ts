/** Shared catalogue for placement and compatible artwork swaps. */
import {sceneSceneryAssets as sceneryAssets,getSceneryGeometryMap,type SceneScenery} from './scene-schema';
import {assetLabel,roomOptions} from './world-edit-rules';
import {terrainObjects} from './terrain-objects';

export interface PaletteChoice {
  asset: SceneScenery['asset'];
  frame: string;
  label: string;
  /** Rooms this building can host; empty for everything else. */
  rooms: readonly string[];
}

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
  }).concat(terrainObjects.map(object=>({asset:object.role,frame:object.id,label:object.name,rooms:[]})))
    .sort((a, b) => groupOrder.indexOf(a.asset) - groupOrder.indexOf(b.asset) || a.frame.localeCompare(b.frame, undefined, {numeric: true}));
}

/** Group interchangeable objects by their physical role. */
export function catalogueGroups(choices: readonly PaletteChoice[]): {asset: SceneScenery['asset']; label: string; choices: PaletteChoice[]}[] {
  const groups = new Map<SceneScenery['asset'], PaletteChoice[]>();
  for (const choice of choices) {
    const group = groups.get(choice.asset) ?? [];
    group.push(choice); groups.set(choice.asset, group);
  }
  return [...groups].map(([asset, choices]) => ({asset, label: assetLabel({asset}), choices}));
}

export const variantLabel = (choice: PaletteChoice): string => {
  const number = choice.frame.match(/-(\d+)$/)?.[1];
  return number ? `${choice.label} ${number}` : choice.frame === choice.asset ? `${choice.label} (original)` : choice.label;
};

export const usesVariationAtlas = (frame: string): boolean => /^(house|tree|stall|planter|garden)-\d+$/.test(frame);

/** Preserve a room by only offering artwork which can still host it. */
export function variantChoices(choices: readonly PaletteChoice[], item: SceneScenery): PaletteChoice[] {
  return choices.filter(choice => choice.asset === item.asset && (!item.interior || choice.rooms.includes(item.interior.kind)));
}
