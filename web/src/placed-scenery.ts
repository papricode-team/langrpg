import type { MapId } from './maps';
import {getWorldScene} from './scene-data';
import {getSceneryGeometryMap} from './scene-schema';
import type {SceneCollision} from './scene-schema';
import {worldDepth} from './world-depth';

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
  /** World-unit foot anchor, independent of terrain texture resolution. */
  x: number;
  y: number;
  width: number;
  depth?: number;
  /** Sort contour in reference pixels relative to the artwork's foot anchor. */
  sortLine?: readonly (readonly [number, number])[];
  motion?: SceneryMotion;
  flipX?: boolean;
  /** Decorative motion props placed beside paths do not close their approaches. */
  collidable?: boolean;
  collision?: SceneCollision;
}

export const getPlacedScenery = (mapId: MapId): readonly PlacedScenerySpec[] => getWorldScene(mapId).scenery;
/** Match the feet-depth convention used by every character root. */
export const sceneryDepth = (baseY: number): number => worldDepth(baseY, 'prop');
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
  return sceneryFootprints(getPlacedScenery(mapId), getSceneryGeometryMap(mapId));
}

export interface SceneryFootprintManifest {
  assets: Readonly<Record<string, {referenceWidth: number; footprint?: readonly (readonly [number, number])[]}>>;
}

/** Drafts and released scenes use exactly the same physical footprints. */
export function sceneryFootprints(placements: readonly PlacedScenerySpec[], manifest?: SceneryFootprintManifest): readonly (readonly (readonly [number, number])[])[] {
  const ellipse = (x: number, y: number, rx: number, ry: number) => Array.from({ length: 8 }, (_, index) => {
    const angle = index / 8 * Math.PI * 2;
    return [x + Math.cos(angle) * rx, y + Math.sin(angle) * ry] as const;
  });
  return placements.flatMap(spec => {
    if (spec.collidable === false) return [];
    if(spec.collision) {
      const scale=spec.width/spec.collision.referenceWidth;
      return spec.collision.polygons.map(polygon=>polygon.map(([x,y])=>[spec.x+x*scale*(spec.flipX?-1:1),spec.y+y*scale] as const));
    }
    const geometry = manifest?.assets[spec.frame ?? spec.asset];
    if (geometry?.footprint && geometry.referenceWidth > 0) {
      const scale = spec.width / geometry.referenceWidth;
      return [geometry.footprint.map(([x, y]) => [spec.x + x * scale * (spec.flipX ? -1 : 1), spec.y + y * scale] as const)];
    }
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

/** Resolve the asset base once, then keep the collider with the placed object. */
export function withSceneryCollision<T extends PlacedScenerySpec>(spec:T,manifest?:SceneryFootprintManifest):T {
  if(spec.collision)return spec;
  const polygons=sceneryFootprints([spec],manifest).map(polygon=>{
    const points=polygon.map(([x,y])=>[(x-spec.x)*(spec.flipX?-1:1),y-spec.y] as const);
    // Some art manifests explicitly close contours by repeating the first
    // vertex. Scene polygons close implicitly and validate distinct vertices.
    return points.filter((point,index)=>!points.slice(0,index).some(other=>Math.hypot(point[0]-other[0],point[1]-other[1])<1e-7));
  });
  return {...spec,collision:{referenceWidth:spec.width,polygons}};
}
