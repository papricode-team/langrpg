import type { MapId } from './maps';
import type { MapNavigationDocument } from './map-authoring';
import { placedSceneryFootprints } from './placed-scenery';
import {getWorldScene} from './scene-data';
import {sceneNavigationGeometry} from './scene-navigation';

export interface MapPoint { x: number; y: number; }
type Polygon = readonly (readonly [number, number])[];
interface Region { polygon: Polygon; minX: number; minY: number; maxX: number; maxY: number; }
interface Boundary { a: MapPoint; b: MapPoint; minX: number; minY: number; maxX: number; maxY: number; }
export interface NavigationOptions { agentRadius?: number; }
/** Ground footprint shared by keyboard, touch, gamepad and click routes. */
export const PLAYER_RADIUS = 10;
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
export interface NavigationBounds { width: number; height: number; }
export interface NavigationView { x: number; y: number; right: number; bottom: number; }
export interface NavigationReachability {
  sampleStep: number;
  walkableSamples: number;
  reachableSamples: number;
  unreachableSamples: number;
  reachableRatio: number;
  unreachablePoints: MapPoint[];
  unreachableBounds?: {minX: number; minY: number; maxX: number; maxY: number};
}

// Canonical towns use registered land minus named terrain hazards and owned
// object footprints. Generic grids also support architectural floor polygons.


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

function boundary(a: MapPoint, b: MapPoint): Boundary {
  return {a, b, minX: Math.min(a.x,b.x), minY: Math.min(a.y,b.y), maxX: Math.max(a.x,b.x), maxY: Math.max(a.y,b.y)};
}

function polygonEdges(polygon: Polygon): Boundary[] {
  return polygon.map(([x,y], index) => {
    const [bx,by] = polygon[(index+1)%polygon.length];
    return boundary({x,y}, {x:bx,y:by});
  });
}

function nearestOnEdge(point: MapPoint, edge: Boundary): MapPoint {
  const dx=edge.b.x-edge.a.x, dy=edge.b.y-edge.a.y, length=dx*dx+dy*dy;
  const t=length ? Math.max(0,Math.min(1,((point.x-edge.a.x)*dx+(point.y-edge.a.y)*dy)/length)) : 0;
  return {x:edge.a.x+dx*t, y:edge.a.y+dy*t};
}

function edgeDistance(point: MapPoint, edge: Boundary): number {
  const nearest=nearestOnEdge(point,edge);
  return Math.hypot(point.x-nearest.x,point.y-nearest.y);
}

function segmentDistance(a: Boundary, b: Boundary): number {
  const dx=a.b.x-a.a.x, dy=a.b.y-a.a.y, ex=b.b.x-b.a.x, ey=b.b.y-b.a.y;
  const qx=b.a.x-a.a.x, qy=b.a.y-a.a.y, cross=dx*ey-dy*ex;
  if (Math.abs(cross)>GEOMETRY_EPSILON) {
    const t=(qx*ey-qy*ex)/cross, u=(qx*dy-qy*dx)/cross;
    if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
  }
  return Math.min(edgeDistance(a.a,b),edgeDistance(a.b,b),edgeDistance(b.a,a),edgeDistance(b.b,a));
}

/** Split street edges at intersections, then discard edges inside the union.
 * Shrinking each authored polygon separately would create walls at street seams. */
function streetBoundaries(streets: readonly Region[]): Boundary[] {
  const edges=streets.flatMap(area=>polygonEdges(area.polygon)), output: Boundary[]=[];
  for(const edge of edges) {
    const dx=edge.b.x-edge.a.x, dy=edge.b.y-edge.a.y, length=dx*dx+dy*dy;
    if(!length)continue;
    const cuts=[0,1];
    for(const other of edges) {
      if(other===edge||other.maxX<edge.minX||other.minX>edge.maxX||other.maxY<edge.minY||other.minY>edge.maxY)continue;
      const ex=other.b.x-other.a.x, ey=other.b.y-other.a.y, qx=other.a.x-edge.a.x, qy=other.a.y-edge.a.y;
      const cross=dx*ey-dy*ex;
      if(Math.abs(cross)>GEOMETRY_EPSILON) {
        const t=(qx*ey-qy*ex)/cross, u=(qx*dy-qy*dx)/cross;
        if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
      }else if(Math.abs(qx*dy-qy*dx)<=GEOMETRY_EPSILON) {
        for(const point of [other.a,other.b]) {
          const t=((point.x-edge.a.x)*dx+(point.y-edge.a.y)*dy)/length;
          if(t>0&&t<1)cuts.push(t);
        }
      }
    }
    cuts.sort((a,b)=>a-b);
    const offset=1e-4/Math.sqrt(length), nx=-dy*offset, ny=dx*offset;
    for(let i=1;i<cuts.length;i++) {
      const from=cuts[i-1], to=cuts[i];
      if(to-from<GEOMETRY_EPSILON)continue;
      const x=edge.a.x+dx*(from+to)/2, y=edge.a.y+dy*(from+to)/2;
      if(streets.some(area=>includes(area,x+nx,y+ny))&&streets.some(area=>includes(area,x-nx,y-ny)))continue;
      output.push(boundary({x:edge.a.x+dx*from,y:edge.a.y+dy*from},{x:edge.a.x+dx*to,y:edge.a.y+dy*to}));
    }
  }
  return output;
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
  readonly cellSize: number;
  readonly agentRadius: number;
  private readonly cell: number;
  readonly width: number;
  readonly height: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly allowed: Uint8Array;
  private readonly nodes: number[] = [];
  private readonly checkedEdges: Uint8Array;
  private readonly clearEdges: Uint8Array;
  private readonly streets: readonly Region[];
  private readonly barriers: readonly Region[];
  private readonly geometry: readonly Region[];
  private readonly boundaries: readonly Boundary[];
  private readonly boundaryBins = new Map<number, number[]>();
  private readonly boundaryBinSize = 64;
  private readonly boundaryColumns: number;
  private readonly closestCandidates = new Map<number, readonly number[]>();
  private readonly components: Uint32Array;
  private readonly componentCounts: number[] = [0];

  constructor(areas: readonly Polygon[], obstacles: readonly Polygon[] = [], bounds: NavigationBounds = {width:MAP_WIDTH,height:MAP_HEIGHT}, options: NavigationOptions = {}) {
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width < 28 || bounds.height < 28 || bounds.width > 16384 || bounds.height > 16384) throw new Error('Invalid navigation dimensions');
    this.width = bounds.width;
    this.height = bounds.height;
    this.agentRadius=options.agentRadius??0;
    if(!Number.isFinite(this.agentRadius)||this.agentRadius<0||this.agentRadius>128)throw new Error('Invalid navigation agent radius');
    this.cellSize=this.cell=this.agentRadius?4:8;
    this.boundaryColumns=Math.ceil(this.width/this.boundaryBinSize);
    this.columns = Math.ceil(this.width / this.cell);
    this.rows = Math.ceil(this.height / this.cell);
    this.allowed = new Uint8Array(this.columns * this.rows);
    this.components=new Uint32Array(this.allowed.length);
    this.checkedEdges = new Uint8Array(this.allowed.length);
    this.clearEdges = new Uint8Array(this.allowed.length);
    this.streets = areas.map(region);
    this.barriers = obstacles.map(region);
    this.geometry = [...this.streets, ...this.barriers];
    this.boundaries=this.agentRadius ? [
      ...streetBoundaries(this.streets), ...this.barriers.flatMap(area=>polygonEdges(area.polygon)),
      ...polygonEdges([[4,4],[this.width-4,4],[this.width-4,this.height-4],[4,this.height-4]]),
    ] : [];
    this.boundaries.forEach((edge,index)=>{
      this.visitBoundaryBins(edge.minX,edge.minY,edge.maxX,edge.maxY,key=>{
        const bin=this.boundaryBins.get(key);
        if(bin)bin.push(index);else this.boundaryBins.set(key,[index]);
      });
    });
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
    if (x < 4 || x > this.width - 4 || y < 4 || y > this.height - 4) return false;
    if(!this.streets.some(area => includes(area, x, y)) || this.barriers.some(area => includes(area, x, y)))return false;
    if(!this.agentRadius)return true;
    return this.nearbyBoundaries(x-this.agentRadius,y-this.agentRadius,x+this.agentRadius,y+this.agentRadius)
      .every(edge=>edgeDistance({x,y},edge)>=this.agentRadius-GEOMETRY_EPSILON);
  }

  /** Distance from a ground point to the nearest solid or outer street edge. */
  clearanceAt(x: number, y: number): number {
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<4||y<4||x>this.width-4||y>this.height-4
      ||!this.streets.some(area=>includes(area,x,y))||this.barriers.some(area=>includes(area,x,y)))return 0;
    const edges=this.agentRadius?this.boundaries:[...streetBoundaries(this.streets),...this.barriers.flatMap(area=>polygonEdges(area.polygon))];
    return Math.min(x-4,y-4,this.width-4-x,this.height-4-y,...edges.map(edge=>edgeDistance({x,y},edge)));
  }

  /** Sweep the footprint to contact, then project remaining input along walls.
   * Every accepted segment uses the same clearance check as the path planner. */
  move(start: MapPoint, delta: MapPoint): MapPoint {
    if(!Number.isFinite(delta.x)||!Number.isFinite(delta.y)||!Number.isFinite(start.x)||!Number.isFinite(start.y))return {...start};
    let position=this.isWalkable(start.x,start.y)?{...start}:this.closestPoint(start.x,start.y);
    if(!this.isWalkable(position.x,position.y))return position;
    let remaining={...delta};
    for(let contact=0;contact<4;contact++) {
      const length=Math.hypot(remaining.x,remaining.y);
      if(length<1e-6)break;
      const end={x:position.x+remaining.x,y:position.y+remaining.y};
      if(this.lineClear(position,end))return end;
      let low=0, high=1;
      for(let iteration=0;iteration<20;iteration++) {
        const fraction=(low+high)/2;
        if(this.lineClear(position,{x:position.x+remaining.x*fraction,y:position.y+remaining.y*fraction}))low=fraction;else high=fraction;
      }
      const fraction=Math.max(0,low-.001/length);
      position={x:position.x+remaining.x*fraction,y:position.y+remaining.y*fraction};
      remaining={x:remaining.x*(1-fraction),y:remaining.y*(1-fraction)};
      if(!this.agentRadius)break;
      const normals=this.nearbyBoundaries(position.x-this.agentRadius-.02,position.y-this.agentRadius-.02,
        position.x+this.agentRadius+.02,position.y+this.agentRadius+.02).flatMap(edge=>{
        const nearest=nearestOnEdge(position,edge), dx=position.x-nearest.x, dy=position.y-nearest.y, distance=Math.hypot(dx,dy);
        return distance>0&&distance<=this.agentRadius+.02?[{x:dx/distance,y:dy/distance}]:[];
      });
      let projected=false;
      for(let pass=0;pass<2;pass++)for(const normal of normals) {
        const into=remaining.x*normal.x+remaining.y*normal.y;
        if(into<0){remaining.x-=normal.x*into;remaining.y-=normal.y*into;projected=true;}
      }
      if(!projected)break;
    }
    return position;
  }

  private visitBoundaryBins(minX:number,minY:number,maxX:number,maxY:number,visit:(key:number)=>void): void {
    const size=this.boundaryBinSize;
    for(let y=Math.max(0,Math.floor(minY/size));y<=Math.min(Math.ceil(this.height/size)-1,Math.floor(maxY/size));y++)
      for(let x=Math.max(0,Math.floor(minX/size));x<=Math.min(this.boundaryColumns-1,Math.floor(maxX/size));x++)visit(y*this.boundaryColumns+x);
  }

  private nearbyBoundaries(minX:number,minY:number,maxX:number,maxY:number): Boundary[] {
    const indices=new Set<number>();
    this.visitBoundaryBins(minX,minY,maxX,maxY,key=>{for(const index of this.boundaryBins.get(key)??[])indices.add(index);});
    return Array.from(indices,index=>this.boundaries[index]).filter(edge=>edge.minX<=maxX&&edge.maxX>=minX&&edge.minY<=maxY&&edge.maxY>=minY);
  }

  /** Check the complete feet movement, including bases narrower than a frame's
   * travel. Endpoint checks alone let keyboard or joystick movement tunnel. */
  canWalkSegment(startX: number, startY: number, endX: number, endY: number): boolean {
    return this.lineClear({ x: startX, y: startY }, { x: endX, y: endY });
  }

  /** Repeatable area proxy using the exact collision-safe movement graph. */
  auditConnectedArea(spawn: MapPoint): {cellSize:number; totalWalkableCells:number; connectedCells:number; connectedArea:number} {
    const {count} = this.connectedNodes(spawn);
    return {cellSize:this.cell,totalWalkableCells:this.nodes.length,connectedCells:count,connectedArea:count*this.cell*this.cell};
  }

  /** Prepare component-aware click snapping during room setup, before input. */
  prepareReachability(spawn: MapPoint): void {
    if(!this.isWalkable(spawn.x,spawn.y))return;
    const index=this.closestIndex(spawn.x,spawn.y,spawn);
    if(index!==undefined)this.componentAt(index);
  }

  /** Audit every walkable lattice sample without repeating A* for each sample. */
  auditReachability(spawn: MapPoint, sampleStep = 6): NavigationReachability {
    if (!Number.isFinite(sampleStep) || sampleStep < 1) throw new Error('Invalid navigation sample step');
    const {seen} = this.connectedNodes(spawn);
    const spawnWalkable = this.isWalkable(spawn.x, spawn.y);
    let walkableSamples = 0, reachableSamples = 0;
    const unreachablePoints: MapPoint[] = [];
    for (let y = 0; y <= this.height; y += sampleStep) for (let x = 0; x <= this.width; x += sampleStep) {
      if (!this.isWalkable(x, y)) continue;
      walkableSamples++;
      const sample = {x, y};
      const anchor = this.closestIndex(x, y, sample);
      if (spawnWalkable && (anchor !== undefined && seen[anchor] || this.lineClear(spawn, sample))) reachableSamples++;
      else unreachablePoints.push(sample);
    }
    const unreachableBounds = unreachablePoints.length ? unreachablePoints.reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, point.x), minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x), maxY: Math.max(bounds.maxY, point.y),
    }), {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity}) : undefined;
    return {sampleStep, walkableSamples, reachableSamples, unreachableSamples: unreachablePoints.length,
      reachableRatio: walkableSamples ? reachableSamples / walkableSamples : 1, unreachablePoints, unreachableBounds};
  }

  /** Visible grid dots and the exact collision geometry used by movement. */
  debugGeometry(view?: NavigationView): {cellSize: number; walkable: readonly Polygon[]; obstacles: readonly Polygon[]; nodes: MapPoint[]} {
    const visible = (area: Region) => !view || area.maxX >= view.x && area.minX <= view.right && area.maxY >= view.y && area.minY <= view.bottom;
    return {
      cellSize: this.cell,
      walkable: this.streets.filter(visible).map(area => area.polygon),
      obstacles: this.barriers.filter(visible).map(area => area.polygon),
      nodes: this.nodes.filter(index => !view || (index % this.columns + .5) * this.cell >= view.x
        && (index % this.columns + .5) * this.cell <= view.right
        && (Math.floor(index / this.columns) + .5) * this.cell >= view.y
        && (Math.floor(index / this.columns) + .5) * this.cell <= view.bottom).map(index => this.point(index)),
    };
  }

  private connectedNodes(spawn: MapPoint): {seen: Uint8Array; count: number} {
    const start = this.isWalkable(spawn.x,spawn.y) ? this.closestIndex(spawn.x,spawn.y,spawn) : undefined;
    const component=start===undefined?0:this.componentAt(start);
    const seen=new Uint8Array(this.allowed.length);
    if(component)for(const index of this.nodes)if(this.components[index]===component)seen[index]=1;
    return {seen,count:this.componentCounts[component]};
  }

  private componentAt(start: number): number {
    if(this.components[start])return this.components[start];
    const component=this.componentCounts.length;
    this.componentCounts.push(0);
    const queue=[start];
    this.components[start]=component;
    for(let head=0;head<queue.length;head++) {
      const current=queue[head],column=current%this.columns,row=Math.floor(current/this.columns);
      for(let direction=0;direction<DIRECTIONS.length;direction++) {
        const [dx,dy]=DIRECTIONS[direction];
        if(column+dx<0||column+dx>=this.columns||row+dy<0||row+dy>=this.rows)continue;
        const next=(row+dy)*this.columns+column+dx;
        if(this.components[next]||!this.allowed[next])continue;
        if(!this.edgeClear(current,next,direction))continue;
        this.components[next]=component;queue.push(next);
      }
    }
    this.componentCounts[component]=queue.length;
    return component;
  }

  closestPoint(x: number, y: number, reachableFrom?: MapPoint): MapPoint {
    const anchor=reachableFrom&&this.isWalkable(reachableFrom.x,reachableFrom.y)?this.closestIndex(reachableFrom.x,reachableFrom.y,reachableFrom):undefined;
    const component=anchor===undefined?undefined:this.componentAt(anchor);
    if(reachableFrom&&component===undefined)return {...reachableFrom};
    if (this.isWalkable(x, y)) {
      if(!component)return {x,y};
      const target=this.closestIndex(x,y,{x,y});
      if(target!==undefined&&this.components[target]===component)return {x,y};
    }
    const index = this.closestIndex(x, y, undefined,component);
    return index === undefined ? { x, y } : this.point(index);
  }

  findPath(start: MapPoint, destination: MapPoint): MapPoint[] {
    if(!this.isWalkable(start.x,start.y))return [];
    const target = this.isWalkable(destination.x,destination.y)?destination:this.closestPoint(destination.x, destination.y,start);
    if (!this.isWalkable(start.x, start.y) || !this.isWalkable(target.x, target.y)) return [];
    if (this.lineClear(start, target)) return [target];
    // The nearest cell can sit across a thin wall from an exact endpoint.
    // Only use anchors whose complete endpoint connection is walkable.
    const startIndex = this.closestIndex(start.x, start.y, start);
    const goalIndex = this.closestIndex(target.x, target.y, target);
    if (startIndex === undefined || goalIndex === undefined) return [];
    if(this.components[startIndex]&&this.components[goalIndex]&&this.components[startIndex]!==this.components[goalIndex])return [];
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

  private closestIndex(x: number, y: number, visibleFrom?: MapPoint, component?:number): number | undefined {
    if (!this.nodes.length || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    const column = Math.max(0, Math.min(this.columns - 1, Math.floor(x / this.cell)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cell)));
    const key = row * this.columns + column;
    let candidates = this.closestCandidates.get(key);
    if (!candidates) {
      // A point in this cell is at most half a diagonal from its centre. Any
      // nearest node is therefore within nearest-centre-distance + one diagonal.
      const centre = this.point(key);
      const nearby: number[] = [];
      let nearest = Infinity;
      for (let radius = 0; radius < Math.max(this.columns, this.rows); radius++) {
        this.forRing(column, row, radius, index => {
          if (!this.allowed[index]) return;
          nearby.push(index);
          const point = this.point(index);
          nearest = Math.min(nearest, Math.hypot(centre.x - point.x, centre.y - point.y));
        });
        if ((radius + 1) * this.cell > nearest + Math.SQRT2 * this.cell) break;
      }
      candidates = nearby;
      // Pointer clicks and audit samples can visit the whole map. Bound the
      // cache instead of retaining one large water-side candidate list per cell.
      if (this.closestCandidates.size >= 4096) this.closestCandidates.clear();
      this.closestCandidates.set(key, candidates);
    }
    let best: number | undefined;
    let bestDistance = Infinity;
    let nearestCandidateDistance = Infinity;
    const consider = (index: number): void => {
      if(component!==undefined&&this.components[index]!==component)return;
      const point = this.point(index);
      const distance = (x - point.x) ** 2 + (y - point.y) ** 2;
      nearestCandidateDistance = Math.min(nearestCandidateDistance, distance);
      if (distance >= bestDistance || visibleFrom && !this.lineClear(visibleFrom, point)) return;
      best = index;
      bestDistance = distance;
    };
    for (const index of candidates) consider(index);
    // The cached local nodes suffice for an ordinary in-map nearest point. A
    // thin wall may hide them, and off-map clicks need the full distance bound.
    if (best !== undefined && (!visibleFrom || bestDistance === nearestCandidateDistance) && x >= column * this.cell && x <= (column + 1) * this.cell
      && y >= row * this.cell && y <= (row + 1) * this.cell) return best;
    for (let radius = 0; radius < Math.max(this.columns, this.rows); radius++) {
      this.forRing(column, row, radius, index => { if (this.allowed[index]) consider(index); });
      const left = Math.max(0, column - radius), right = Math.min(this.columns - 1, column + radius);
      const top = Math.max(0, row - radius), bottom = Math.min(this.rows - 1, row + radius);
      const outsideDistance = Math.min(
        left > 0 ? Math.max(0, x - (left - .5) * this.cell) : Infinity,
        right < this.columns - 1 ? Math.max(0, (right + 1.5) * this.cell - x) : Infinity,
        top > 0 ? Math.max(0, y - (top - .5) * this.cell) : Infinity,
        bottom < this.rows - 1 ? Math.max(0, (bottom + 1.5) * this.cell - y) : Infinity,
      );
      if (best !== undefined && outsideDistance * outsideDistance > bestDistance) break;
    }
    return best;
  }

  private forRing(column: number, row: number, radius: number, visit: (index: number) => void): void {
    if (!radius) { visit(row * this.columns + column); return; }
    const left = column - radius, right = column + radius, top = row - radius, bottom = row + radius;
    for (let x = Math.max(0, left); x <= Math.min(this.columns - 1, right); x++) {
      if (top >= 0) visit(top * this.columns + x);
      if (bottom < this.rows) visit(bottom * this.columns + x);
    }
    for (let y = Math.max(0, top + 1); y <= Math.min(this.rows - 1, bottom - 1); y++) {
      if (left >= 0) visit(y * this.columns + left);
      if (right < this.columns) visit(y * this.columns + right);
    }
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
    if(this.agentRadius) {
      const sweep=boundary(start,end), radius=this.agentRadius;
      return this.nearbyBoundaries(sweep.minX-radius,sweep.minY-radius,sweep.maxX+radius,sweep.maxY+radius)
        .every(edge=>segmentDistance(sweep,edge)>=radius-GEOMETRY_EPSILON);
    }
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
export const createTownNavigation = (): NavigationGrid => createMapNavigation('lindenhafen');

// Play, authoring previews and compilation share sceneNavigationGeometry.






export function createMapNavigation(id: MapId, options: NavigationOptions = {}): NavigationGrid {
  const scene = getWorldScene(id);
  const geometry=sceneNavigationGeometry(scene);
  return new NavigationGrid(geometry.ground,geometry.barriers,scene,{agentRadius:PLAYER_RADIUS,...options});
}

export function createFallbackNavigation(): NavigationGrid {
  const rectangle = (x: number, y: number, width: number, height: number): Polygon => [[x,y],[x+width,y],[x+width,y+height],[x,y+height]];
  return new NavigationGrid([rectangle(16, 200, 1110, 800)], [
    rectangle(280, 220, 285, 205), rectangle(660, 170, 275, 225),
    rectangle(865, 360, 240, 190), rectangle(175, 680, 245, 195),
    rectangle(790, 730, 275, 215), ellipse(687, 545, 56, 31),
  ], {width:MAP_WIDTH,height:MAP_HEIGHT}, {agentRadius:PLAYER_RADIUS});
}

/** Validate legacy point-foot documents. Canonical scenes additionally audit
 * player clearance in scene-compiler.mjs before an editor save. */
export function validateAuthoredReachability(document: MapNavigationDocument): string[] {
  const errors: string[] = [];
  for (const [id, map] of Object.entries(document.maps)) {
    const grid = new NavigationGrid(map.walkable, [...map.obstacles, ...placedSceneryFootprints(id as MapId)], document);
    if (!grid.isWalkable(map.spawn.x, map.spawn.y)) { errors.push(`${id}: spawn is outside walkable ground`); continue; }
    for (const target of [...map.npcs, ...map.objects]) {
      const approach = grid.closestPoint(target.x, target.y);
      if (Math.hypot(approach.x - target.x, approach.y - target.y) > 120 || !grid.findPath(map.spawn, approach).length) errors.push(`${id}: ${target.id} has no reachable interaction approach`);
    }
  }
  return errors;
}
