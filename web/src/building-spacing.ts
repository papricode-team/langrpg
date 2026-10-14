/** Keep complete roofs and façades separate, even when foundations do not touch. */
export const BUILDING_SPACING = 32;

export interface BuildingPlacement {
  asset: string;
  frame?: string;
  x: number;
  y: number;
  width: number;
  flipX?: boolean;
}

export interface BuildingVisualBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface BuildingGeometry {
  referenceWidth: number;
  /** Union of day/night paintings, relative to the anchor in reference pixels. */
  visualBounds?: BuildingVisualBounds;
  width?: number;
  height?: number;
  originX?: number;
  originY?: number;
  base?: {referenceWidth?: number; originX?: number; originY?: number};
}

export interface BuildingGeometryManifest {
  assets: Readonly<Record<string, BuildingGeometry>>;
}

const buildingNames = new Set(['house', 'archive', 'cafe', 'station', 'workshop', 'greenhouse']);
export const isBuildingPlacement = (placement: {asset: string; frame?: string}): boolean =>
  buildingNames.has(placement.asset) || buildingNames.has(placement.frame ?? '') || !!placement.frame?.startsWith('house-');

/** Geometry snapshots and raw art manifests both follow the rendered pivot/scale. */
export function buildingBounds(placement: BuildingPlacement, geometry?: BuildingGeometry): BuildingVisualBounds | undefined {
  if (!geometry || geometry.referenceWidth <= 0) return undefined;
  const referenceWidth = geometry.visualBounds ? geometry.referenceWidth : geometry.base?.referenceWidth ?? geometry.referenceWidth;
  if (referenceWidth <= 0) return undefined;
  const originX = geometry.base?.originX ?? geometry.originX ?? .5;
  const originY = geometry.base?.originY ?? geometry.originY ?? 1;
  const bounds = geometry.visualBounds ?? (geometry.width !== undefined && geometry.height !== undefined ? {
    left: -geometry.width * originX, top: -geometry.height * originY,
    right: geometry.width * (1 - originX), bottom: geometry.height * (1 - originY),
  } : undefined);
  if (!bounds) return undefined;
  const scale = placement.width / referenceWidth;
  return {
    left: placement.x + (placement.flipX ? -bounds.right : bounds.left) * scale,
    top: placement.y + bounds.top * scale,
    right: placement.x + (placement.flipX ? -bounds.left : bounds.right) * scale,
    bottom: placement.y + bounds.bottom * scale,
  };
}

/** Diagonal neighbours keep the same minimum visible gap as rows and columns. */
export function buildingsTooClose(a: BuildingPlacement, b: BuildingPlacement, manifest: BuildingGeometryManifest): boolean {
  if (!isBuildingPlacement(a) || !isBuildingPlacement(b)) return false;
  const first = buildingBounds(a, manifest.assets[a.frame ?? a.asset]);
  const second = buildingBounds(b, manifest.assets[b.frame ?? b.asset]);
  if (!first || !second) return false;
  const xGap = Math.max(0, first.left - second.right, second.left - first.right);
  const yGap = Math.max(0, first.top - second.bottom, second.top - first.bottom);
  return Math.hypot(xGap, yGap) < BUILDING_SPACING - 1e-7;
}
