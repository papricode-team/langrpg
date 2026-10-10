import type { MapId } from './maps';
import { authoredNavigation, type MapNavigationDocument } from './map-authoring';
import { placedSceneryFootprints } from './placed-scenery';
import { expeditionWalkablePolygons, isExpeditionMap } from './expeditions';

export interface MapPoint { x: number; y: number; }
type Polygon = readonly (readonly [number, number])[];
interface Region { polygon: Polygon; minX: number; minY: number; maxX: number; maxY: number; }
const GEOMETRY_EPSILON = 1e-7;
const DIRECTIONS = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] as const;

function region(polygon: Polygon): Region {
  return {
    polygon,
    minX: Math.min(...polygon.map(point => point[0])), minY: Math.min(...polygon.map(point => point[1])),
    maxX: Math.max(...polygon.map(point => point[0])), maxY: Math.max(...polygon.map(point => point[1])),
  };
}

function includes(area: Region, x: number, y: number): boolean {
  return x >= area.minX - GEOMETRY_EPSILON && x <= area.maxX + GEOMETRY_EPSILON
    && y >= area.minY - GEOMETRY_EPSILON && y <= area.maxY + GEOMETRY_EPSILON
    && contains(area.polygon, x, y);
}

export const MAP_WIDTH = 1536;
export const MAP_HEIGHT = 1024;

// Foot-level paths traced from the Lindenhafen painting. Roofs, gardens outside
// their gravel paths, stalls, fountains, and waterways are deliberately excluded.


const ellipse = (x: number, y: number, rx: number, ry: number): Polygon =>
  Array.from({ length: 18 }, (_, index) => {
    const angle = index / 18 * Math.PI * 2;
    return [x + Math.cos(angle) * rx, y + Math.sin(angle) * ry] as const;
  });



function contains(polygon: Polygon, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    // Streets include their boundaries; closed obstacle boundaries block feet.
    // This also makes adjoining street polygons agree at a shared edge.
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (Math.abs(cross) <= GEOMETRY_EPSILON * Math.max(1, Math.hypot(xj - xi, yj - yi))
      && x >= Math.min(xi, xj) - GEOMETRY_EPSILON && x <= Math.max(xi, xj) + GEOMETRY_EPSILON
      && y >= Math.min(yi, yj) - GEOMETRY_EPSILON && y <= Math.max(yi, yj) + GEOMETRY_EPSILON) return true;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface HeapEntry { index: number; score: number; }
class MinHeap {
  private values: HeapEntry[] = [];
  get length(): number { return this.values.length; }
  push(entry: HeapEntry): void {
    this.values.push(entry);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.values[parent].score <= entry.score) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = entry;
  }
  pop(): HeapEntry {
    const first = this.values[0];
    const last = this.values.pop()!;
    if (this.values.length) {
      let index = 0;
      while (index * 2 + 1 < this.values.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.values.length && this.values[child + 1].score < this.values[child].score) child++;
        if (last.score <= this.values[child].score) break;
        this.values[index] = this.values[child];
        index = child;
      }
      this.values[index] = last;
    }
    return first;
  }
}

export class NavigationGrid {
  private readonly cell = 14;
  private readonly columns = Math.ceil(MAP_WIDTH / this.cell);
  private readonly rows = Math.ceil(MAP_HEIGHT / this.cell);
  private readonly allowed = new Uint8Array(this.columns * this.rows);
  private readonly nodes: number[] = [];
  private readonly checkedEdges = new Uint8Array(this.columns * this.rows);
  private readonly clearEdges = new Uint8Array(this.columns * this.rows);
  private readonly streets: readonly Region[];
  private readonly barriers: readonly Region[];
  private readonly geometry: readonly Region[];

  constructor(areas: readonly Polygon[], obstacles: readonly Polygon[] = []) {
    this.streets = areas.map(region);
    this.barriers = obstacles.map(region);
    this.geometry = [...this.streets, ...this.barriers];
    for (let index = 0; index < this.allowed.length; index++) {
      const point = this.point(index);
      if (this.isWalkable(point.x, point.y)) {
        this.allowed[index] = 1;
        this.nodes.push(index);
      }
    }
  }

  isWalkable(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < 14 || x > MAP_WIDTH - 14 || y < 14 || y > MAP_HEIGHT - 14) return false;
    return this.streets.some(area => includes(area, x, y)) && !this.barriers.some(area => includes(area, x, y));
  }

  /** Check the complete feet movement, including bases narrower than a frame's
   * travel. Endpoint checks alone let keyboard or joystick movement tunnel. */
  canWalkSegment(startX: number, startY: number, endX: number, endY: number): boolean {
    return this.lineClear({ x: startX, y: startY }, { x: endX, y: endY });
  }

  closestPoint(x: number, y: number): MapPoint {
    if (this.isWalkable(x, y)) return { x, y };
    const index = this.closestIndex(x, y);
    return index === undefined ? { x, y } : this.point(index);
  }

  findPath(start: MapPoint, destination: MapPoint): MapPoint[] {
    const target = this.closestPoint(destination.x, destination.y);
    if (!this.isWalkable(start.x, start.y) || !this.isWalkable(target.x, target.y)) return [];
    if (this.lineClear(start, target)) return [target];
    // The nearest cell can sit across a thin wall from an exact endpoint.
    // Only use anchors whose complete endpoint connection is walkable.
    const startIndex = this.closestIndex(start.x, start.y, start);
    const goalIndex = this.closestIndex(target.x, target.y, target);
    if (startIndex === undefined || goalIndex === undefined) return [];
    const scores = new Float64Array(this.allowed.length).fill(Infinity);
    const parents = new Int32Array(this.allowed.length).fill(-1);
    const visited = new Uint8Array(this.allowed.length);
    const open = new MinHeap();
    scores[startIndex] = 0;
    open.push({ index: startIndex, score: 0 });
    const goalColumn = goalIndex % this.columns;
    const goalRow = Math.floor(goalIndex / this.columns);
    while (open.length) {
      const current = open.pop().index;
      if (visited[current]) continue;
      if (current === goalIndex) {
        const points: MapPoint[] = [target];
        let cursor = goalIndex;
        while (cursor !== -1) { points.push(this.point(cursor)); cursor = parents[cursor]; }
        points.reverse();
        return this.simplify(start, points);
      }
      visited[current] = 1;
      const column = current % this.columns;
      const row = Math.floor(current / this.columns);
      for (let direction = 0; direction < DIRECTIONS.length; direction++) {
          const [dx, dy] = DIRECTIONS[direction];
          if (column + dx < 0 || column + dx >= this.columns || row + dy < 0 || row + dy >= this.rows) continue;
          const next = (row + dy) * this.columns + column + dx;
          if (!this.allowed[next] || visited[next]) continue;
          if (dx && dy && (!this.allowed[row * this.columns + column + dx] || !this.allowed[(row + dy) * this.columns + column])) continue;
          const score = scores[current] + (dx && dy ? Math.SQRT2 : 1);
          if (score >= scores[next]) continue;
          // Even adjacent cells must not cross a very thin railing or obstacle.
          if (!this.edgeClear(current, next, direction)) continue;
          scores[next] = score;
          parents[next] = current;
          open.push({ index: next, score: score + Math.hypot(column + dx - goalColumn, row + dy - goalRow) });
      }
    }
    return [];
  }

  private point(index: number): MapPoint {
    return { x: (index % this.columns + 0.5) * this.cell, y: (Math.floor(index / this.columns) + 0.5) * this.cell };
  }

  private closestIndex(x: number, y: number, visibleFrom?: MapPoint): number | undefined {
    let best: number | undefined;
    let bestDistance = Infinity;
    for (const index of this.nodes) {
      const point = this.point(index);
      const distance = (x - point.x) ** 2 + (y - point.y) ** 2;
      if (distance < bestDistance) { best = index; bestDistance = distance; }
    }
    if (best === undefined || !visibleFrom || this.lineClear(visibleFrom, this.point(best))) return best;
    // Usually the nearest anchor is visible; only sort candidates at a wall.
    const candidates = this.nodes.map(index => {
      const point = this.point(index);
      return { index, distance: (x - point.x) ** 2 + (y - point.y) ** 2 };
    }).sort((a, b) => a.distance - b.distance);
    return candidates.find(candidate => this.lineClear(visibleFrom, this.point(candidate.index)))?.index;
  }

  private edgeClear(start: number, end: number, direction: number): boolean {
    const bit = 1 << direction;
    if (!(this.checkedEdges[start] & bit)) {
      const clear = this.lineClear(this.point(start), this.point(end));
      const reverse = 1 << (7 - direction);
      this.checkedEdges[start] |= bit;
      this.checkedEdges[end] |= reverse;
      if (clear) { this.clearEdges[start] |= bit; this.clearEdges[end] |= reverse; }
    }
    return Boolean(this.clearEdges[start] & bit);
  }

  private lineClear(start: MapPoint, end: MapPoint): boolean {
    if (!this.isWalkable(start.x, start.y) || !this.isWalkable(end.x, end.y)) return false;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const squaredLength = dx * dx + dy * dy;
    if (squaredLength < GEOMETRY_EPSILON ** 2) return true;
    const cuts = [0, 1];
    const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);
    const append = (fraction: number): void => {
      if (fraction >= -GEOMETRY_EPSILON && fraction <= 1 + GEOMETRY_EPSILON) cuts.push(Math.max(0, Math.min(1, fraction)));
    };
    for (const area of this.geometry) {
      if (area.maxX < minX || area.minX > maxX || area.maxY < minY || area.minY > maxY) continue;
      const polygon = area.polygon;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [ax, ay] = polygon[j], [bx, by] = polygon[i];
        const ex = bx - ax, ey = by - ay;
        const qx = ax - start.x, qy = ay - start.y;
        const denominator = dx * ey - dy * ex;
        if (Math.abs(denominator) <= GEOMETRY_EPSILON) {
          // Include both ends of a collinear boundary overlap as well.
          if (Math.abs(qx * dy - qy * dx) <= GEOMETRY_EPSILON) {
            append((qx * dx + qy * dy) / squaredLength);
            append(((bx - start.x) * dx + (by - start.y) * dy) / squaredLength);
          }
        } else {
          const fraction = (qx * ey - qy * ex) / denominator;
          const edgeFraction = (qx * dy - qy * dx) / denominator;
          if (edgeFraction >= -GEOMETRY_EPSILON && edgeFraction <= 1 + GEOMETRY_EPSILON) append(fraction);
        }
      }
    }
    cuts.sort((a, b) => a - b);
    let previous = 0;
    for (const fraction of cuts) {
      // Walkability can change only at a polygon edge. Check every boundary
      // contact and every open interval, independent of obstacle thickness.
      if (!this.isWalkable(start.x + dx * fraction, start.y + dy * fraction)) return false;
      if (fraction - previous > GEOMETRY_EPSILON) {
        const midpoint = (previous + fraction) / 2;
        if (!this.isWalkable(start.x + dx * midpoint, start.y + dy * midpoint)) return false;
      }
      previous = fraction;
    }
    return true;
  }

  private simplify(start: MapPoint, points: MapPoint[]): MapPoint[] {
    const output: MapPoint[] = [];
    let previous = start;
    let index = 0;
    while (index < points.length) {
      if (!this.lineClear(previous, points[index])) return [];
      let next = index;
      for (let candidate = index + 1; candidate < points.length; candidate++) {
        if (!this.lineClear(previous, points[candidate])) break;
        next = candidate;
      }
      output.push(points[next]);
      previous = points[next];
      index = next + 1;
    }
    return output;
  }
}

// A canopy can cover a clear street while the trunk, pot or lamp plinth blocks
// feet. Share only the painted object's ground footprint with navigation; its
// wider silhouette belongs to depth rendering rather than collision.
export const createTownNavigation = (): NavigationGrid => new NavigationGrid(authoredNavigation.maps.lindenhafen.walkable, [...authoredNavigation.maps.lindenhafen.obstacles, ...placedSceneryFootprints('lindenhafen')]);

// These foot-level paths are traced independently from the two paintings.
// A shared rectangle would allow walking through the clockmill, greenhouses,
// stalls and open harbor water. Bridges and stairways are explicit corridors.






export function createMapNavigation(id: MapId): NavigationGrid {
  if (isExpeditionMap(id)) return new NavigationGrid(expeditionWalkablePolygons(id), placedSceneryFootprints(id));
  const authored = authoredNavigation.maps[id];
  return new NavigationGrid(authored.walkable, [...authored.obstacles, ...placedSceneryFootprints(id)]);
}

export function createFallbackNavigation(): NavigationGrid {
  const rectangle = (x: number, y: number, width: number, height: number): Polygon => [[x,y],[x+width,y],[x+width,y+height],[x,y+height]];
  return new NavigationGrid([rectangle(16, 200, 1110, 800)], [
    rectangle(280, 220, 285, 205), rectangle(660, 170, 275, 225),
    rectangle(865, 360, 240, 190), rectangle(175, 680, 245, 195),
    rectangle(790, 730, 275, 215), ellipse(687, 545, 56, 31),
  ]);
}

/** Validate editor targets with the exact grid and collision rules used in play. */
export function validateAuthoredReachability(document: MapNavigationDocument): string[] {
  const errors: string[] = [];
  for (const [id, map] of Object.entries(document.maps)) {
    const grid = new NavigationGrid(map.walkable, [...map.obstacles, ...placedSceneryFootprints(id as MapId)]);
    if (!grid.isWalkable(map.spawn.x, map.spawn.y)) { errors.push(`${id}: spawn is outside walkable ground`); continue; }
    for (const target of [...map.npcs, ...map.objects]) {
      const approach = grid.closestPoint(target.x, target.y);
      if (Math.hypot(approach.x - target.x, approach.y - target.y) > 120 || !grid.findPath(map.spawn, approach).length) errors.push(`${id}: ${target.id} has no reachable interaction approach`);
    }
  }
  return errors;
}
