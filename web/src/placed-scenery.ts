import type { MapId } from './maps';
import { lindenhafenPlacements } from './placed-lindenhafen';
import { waldruhPlacements } from './placed-waldruh';
import { nebelstadtPlacements } from './placed-nebelstadt';
import { expeditionPlacements } from './expeditions';

/** Each frame is reusable transparent artwork, independent of the terrain. */
export const sceneryAssets = ['archive', 'cafe', 'station', 'workshop', 'house', 'tree', 'cypress', 'lamp',
  'stall', 'fountain', 'arch', 'greenhouse', 'boat', 'bench', 'planter', 'sign'] as const;
export type SceneryAsset = typeof sceneryAssets[number];
export type SceneryMotion = 'tree' | 'cloth' | 'boat' | 'lamp' | 'building' | 'water' | 'still';
export interface PlacedScenerySpec {
  id: string;
  asset: SceneryAsset;
  /** Artistic silhouette may differ from the physical role used for navigation. */
  frame?: string;
  variant?: boolean;
  /** Pixel foot anchor in the 1536 × 1024 region. */
  x: number;
  y: number;
  width: number;
  depth?: number;
  motion?: SceneryMotion;
  flipX?: boolean;
  /** Decorative motion props placed beside paths do not close their approaches. */
  collidable?: boolean;
}

const placements: Readonly<Record<MapId, readonly PlacedScenerySpec[]>> = {
  lindenhafen: lindenhafenPlacements, waldruh: waldruhPlacements, nebelstadt: nebelstadtPlacements,
  ...expeditionPlacements,
};
export const getPlacedScenery = (mapId: MapId): readonly PlacedScenerySpec[] => placements[mapId];
/** Match the feet-depth convention used by every character root. */
export const sceneryDepth = (baseY: number): number => baseY + 10.5;
export const sceneryTextureKey = (mapId: MapId): string => `${mapId}-props`;
export const sceneryVariationKey = (mapId: MapId): string => `${mapId}-variations`;
export const sceneryTextureFor = (mapId: MapId, spec: PlacedScenerySpec): string =>
  spec.variant ? sceneryVariationKey(mapId) : sceneryTextureKey(mapId);

/** Deterministic independent phases survive revisits without random frame work. */
export function sceneryPhase(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4294967296 * Math.PI * 2;
}

/** Solid bases belong to placed assets. The swaying crown never blocks a road. */
export function placedSceneryFootprints(mapId: MapId): readonly (readonly (readonly [number, number])[])[] {
  const ellipse = (x: number, y: number, rx: number, ry: number) => Array.from({ length: 8 }, (_, index) => {
    const angle = index / 8 * Math.PI * 2;
    return [x + Math.cos(angle) * rx, y + Math.sin(angle) * ry] as const;
  });
  return getPlacedScenery(mapId).flatMap(spec => {
    if (spec.collidable === false) return [];
    if (spec.asset === 'boat') return []; // Floating scenery never blocks pavement.
    if (spec.asset === 'arch') {
      // The opening stays walkable; only the two posts have solid bases.
      return [-.34, .34].map(offset => ellipse(spec.x + spec.width * offset, spec.y - 3, spec.width * .035, 4));
    }
    const narrow = spec.asset === 'lamp' ? .11 : spec.asset === 'tree' ? .075 : spec.asset === 'cypress' ? .13
      : spec.asset === 'planter' ? .27 : spec.asset === 'bench' ? .34 : spec.asset === 'sign' ? .2 : 0;
    if (narrow) {
      const rx = Math.max(3, spec.width * narrow);
      const ry = spec.asset === 'bench' ? 5 : Math.max(3, Math.min(8, rx * .4));
      return [ellipse(spec.x, spec.y - 2, rx, ry)];
    }
    // Solid building foundations, market counters and fountain rims follow
    // the placed instance too, so editing its anchor also moves its barrier.
    const rx = spec.width * (spec.asset === 'fountain' ? .43 : .38);
    const ry = spec.width * (spec.asset === 'stall' || spec.asset === 'fountain' ? .1 : .08);
    return [ellipse(spec.x, spec.y - ry - 2, rx, ry)];
  });
}
