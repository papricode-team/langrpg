/** All upright world objects share these stable, integer depth bands. */
export type DepthBand = 'shadow' | 'prop' | 'character' | 'label';
const bands: Record<DepthBand, number> = { shadow: 0, prop: 1, character: 2, label: 3 };
export const worldDepth = (footY: number, band: DepthBand = 'prop'): number => Math.floor(footY) * 4 + bands[band];
/** Phaser queues a full display-list sort even when setDepth receives the same value. */
export function setDepthIfChanged(object: { depth: number; setDepth(depth: number): unknown }, depth: number): void {
  if (object.depth !== depth) object.setDepth(depth);
}
export type SortLine = readonly (readonly [number, number])[];
export interface DepthPlacement { x: number; y: number; width: number; flipX?: boolean; sortLine?: SortLine; }
export interface DepthGeometry { referenceWidth: number; sortLine?: SortLine; }

/** Interpolate authored reference-pixel segments at the queried world x. */
export function depthAt(spec: DepthPlacement, worldX: number, geometry?: DepthGeometry): number {
  return createDepthSampler(spec, geometry)(worldX);
}

/** Compile fixed placement geometry once; callers rebuild it when the scenery changes. */
export function createDepthSampler(spec: DepthPlacement, geometry?: DepthGeometry): (worldX: number) => number {
  const line = spec.sortLine ?? geometry?.sortLine;
  if (!line?.length) return () => spec.y;
  const scale = spec.width / (geometry?.referenceWidth ?? spec.width);
  const sorted = [...line].sort((a, b) => a[0] - b[0]);
  return worldX => {
    const x = (worldX - spec.x) / scale * (spec.flipX ? -1 : 1);
    if (x <= sorted[0][0]) return spec.y + sorted[0][1] * scale;
    for (let index = 1; index < sorted.length; index++) {
      const left = sorted[index - 1], right = sorted[index];
      if (x > right[0]) continue;
      const t = right[0] === left[0] ? 1 : (x - left[0]) / (right[0] - left[0]);
      return spec.y + (left[1] + t * (right[1] - left[1])) * scale;
    }
    return spec.y + sorted.at(-1)![1] * scale;
  };
}

export interface OcclusionCharacter { id: string; x: number; y: number; depth: number; height?: number; width?: number; }
export interface WorldBounds { x: number; y: number; right: number; bottom: number; }
export interface OcclusionCircle { id: string; x: number; y: number; strength: number; depth: number; }

/** A character in front of the local wall segment never requests a cutout. */
export function isCharacterOccluded(character: OcclusionCharacter, bounds: WorldBounds, occluderDepth: number): boolean {
  const halfWidth = (character.width ?? 30) / 2, height = character.height ?? 72;
  return occluderDepth > character.depth && character.x + halfWidth > bounds.x && character.x - halfWidth < bounds.right
    && character.y > bounds.y && character.y - height < bounds.bottom;
}

/** Retain outgoing centres until their 300ms fade completes. */
export function updateOcclusion(previous: readonly OcclusionCircle[], covered: readonly OcclusionCharacter[], seconds: number, reducedMotion = false): OcclusionCircle[] {
  const active = new Map(covered.map(character => [character.id, character]));
  const states = new Map(previous.map(circle => [circle.id, circle]));
  for (const character of covered) if (!states.has(character.id)) states.set(character.id, { id: character.id, x: character.x, y: character.y - (character.height ?? 72) * .55, depth: character.depth, strength: 0 });
  const result: OcclusionCircle[] = [];
  for (const [id, previousCircle] of states) {
    const character = active.get(id);
    const strength = reducedMotion ? Number(!!character) : Math.max(0, Math.min(1, previousCircle.strength + Math.max(0, seconds) * (character ? 1 / .15 : -1 / .3)));
    if (!strength) continue;
    result.push(character ? { id, x: character.x, y: character.y - (character.height ?? 72) * .55, depth: character.depth, strength } : { ...previousCircle, strength });
  }
  // Active characters take priority over residual fades. The player comes first in covered.
  return result.sort((a, b) => (active.has(b.id) ? 1 : 0) - (active.has(a.id) ? 1 : 0)).slice(0, 4);
}
