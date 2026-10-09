import type { MapId } from './maps';
import { lindenhafenScenery } from './scenery-lindenhafen';
import { waldruhScenery, nebelstadtScenery } from './scenery-regions';

export type SceneryPolygon = readonly (readonly [number, number])[];

/** Original painting coordinates. The outline covers elevated scenery; its
 * physical footprint blocks feet, not the air beneath an overhanging canopy. */
export interface ScenerySpec {
  id: string;
  baseY: number;
  outline: SceneryPolygon;
  holes?: readonly SceneryPolygon[];
  footprint?: SceneryPolygon;
}

const scenery: Readonly<Record<MapId, readonly ScenerySpec[]>> = {
  lindenhafen: lindenhafenScenery,
  waldruh: waldruhScenery,
  nebelstadt: nebelstadtScenery,
};

export const getScenery = (id: MapId): readonly ScenerySpec[] => scenery[id];
export const sceneryFootprints = (id: MapId): readonly SceneryPolygon[] =>
  scenery[id].flatMap(item => item.footprint ? [item.footprint] : []);

/** Character roots currently use feet Y + 10. At the same ground plane,
 * painted scenery wins the tie, including its contact edge. */
export const sceneryDepth = (baseY: number): number => baseY + 10.5;

export interface SceneryFrame {
  spec: ScenerySpec;
  x: number;
  y: number;
  width: number;
  height: number;
  atlasX: number;
  atlasY: number;
}

/** Tight source crops share one atlas, with transparent padding between frames.
 * Packing happens on map entry, never while characters move. */
export function packScenery(specs: readonly ScenerySpec[], atlasWidth = 1024): {
  frames: SceneryFrame[]; width: number; height: number;
} {
  const frames: SceneryFrame[] = [];
  const padding = 2;
  let column = 0, row = 0, rowHeight = 0, usedWidth = 1;
  for (const spec of specs) {
    const x = Math.max(0, Math.floor(Math.min(...spec.outline.map(point => point[0]))) - padding);
    const y = Math.max(0, Math.floor(Math.min(...spec.outline.map(point => point[1]))) - padding);
    const width = Math.min(1536, Math.ceil(Math.max(...spec.outline.map(point => point[0]))) + padding) - x;
    const height = Math.min(1024, Math.ceil(Math.max(...spec.outline.map(point => point[1]))) + padding) - y;
    if (width <= 0 || height <= 0 || width > atlasWidth) throw new Error(`Invalid scenery crop: ${spec.id}`);
    if (column + width > atlasWidth) { row += rowHeight; column = 0; rowHeight = 0; }
    frames.push({ spec, x, y, width, height, atlasX: column, atlasY: row });
    column += width;
    rowHeight = Math.max(rowHeight, height);
    usedWidth = Math.max(usedWidth, column);
  }
  return { frames, width: usedWidth, height: Math.max(1, row + rowHeight) };
}
