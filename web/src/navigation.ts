import type { MapId } from './maps';
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
const STREETS: readonly Polygon[] = [
  // Central square and café terrace.
  [[552,480],[781,385],[917,425],[932,518],[1083,544],[1117,560],[999,650],[900,746],[837,669],[746,640],[627,619],[598,586],[513,531]],
  [[420,454],[499,499],[582,511],[699,470],[775,415],[818,390],[794,358],[772,327],[752,320],[733,380],[697,416],[629,453],[555,465],[511,445],[448,407]],
  // Upper high street and station forecourt.
  [[748,334],[762,266],[823,221],[911,194],[1003,133],[1039,108],[1071,134],[1072,187],[985,224],[902,262],[841,299],[835,360],[812,405]],
  [[1008,222],[1082,213],[1184,255],[1268,300],[1288,334],[1234,351],[1166,312],[1040,267]],
  // Northern canal bridge. Its parapets remain outside the route.
  [[1290,312],[1370,342],[1452,333],[1536,296],[1536,343],[1445,392],[1391,385],[1322,352]],
  // Outside of the market stalls.
  [[1050,556],[1170,522],[1232,490],[1274,446],[1286,396],[1260,370],[1235,364],[1210,396],[1215,452],[1180,480],[1086,521]],
  // West side of the riverside house, with its southern street.
  [[953,627],[1039,570],[1115,569],[1088,616],[1044,644],[996,709],[981,756],[1062,812],[1172,850],[1245,844],[1263,811],[1186,780],[1171,796],[1081,785],[1034,757],[1018,711],[999,691]],
  // Garden perimeter: northwestern, southwestern, and southeastern walks.
  [[388,776],[414,730],[461,691],[510,663],[559,634],[610,616],[650,632],[581,670],[520,710],[467,748],[425,789]],
  [[342,759],[405,774],[435,799],[462,842],[531,867],[621,912],[676,922],[684,956],[586,939],[500,901],[425,867],[365,825],[311,792]],
  [[678,904],[771,892],[846,861],[902,814],[939,777],[969,737],[1010,758],[995,803],[935,851],[884,896],[816,938],[725,984],[688,967]],
  // Southern canal bridge.
  [[971,785],[1049,814],[1135,851],[1266,876],[1385,950],[1440,986],[1416,1023],[1330,993],[1230,941],[1124,912],[1032,873],[959,838]],
  // Library and the narrow lane on the western side of the café.
  [[546,522],[479,500],[428,466],[373,427],[342,389],[353,335],[375,320],[393,347],[381,385],[415,420],[465,443],[511,470],[572,491]],
  [[94,370],[143,393],[207,438],[263,449],[331,422],[347,392],[364,425],[316,463],[250,487],[180,469],[105,427],[74,390]],
  [[125,306],[166,310],[210,318],[251,309],[287,287],[326,292],[354,320],[326,344],[278,350],[245,359],[179,353],[122,343],[105,331]],
  // Workshop lane and its front courtyard.
  [[428,466],[459,475],[475,525],[511,558],[545,584],[561,614],[510,656],[458,686],[425,718],[401,724],[410,681],[446,641],[465,605],[423,565],[396,543],[397,491]],
  [[230,726],[271,733],[309,740],[350,737],[390,757],[392,799],[344,817],[310,796],[253,773],[219,753]],
  // A single gate leads into the garden's gravel path around the statue.
  [[595,639],[625,650],[641,678],[651,706],[671,717],[666,741],[636,744],[613,718],[610,693],[594,669]],
  [[615,720],[644,706],[693,703],[733,716],[758,741],[749,776],[720,795],[675,800],[635,783],[610,754]],
  // Overlapping junction aprons keep narrow streets connected on the grid.
  [[987,207],[1026,202],[1053,227],[1027,249],[997,242]],
  [[331,320],[360,318],[375,344],[349,359],[330,345]],
  [[1223,329],[1290,319],[1331,339],[1320,371],[1280,402],[1247,385]],
  [[583,604],[625,599],[654,621],[636,646],[597,647],[578,628]],
  [[955,686],[987,676],[1019,691],[1023,717],[989,735],[956,714]],
];

const ellipse = (x: number, y: number, rx: number, ry: number): Polygon =>
  Array.from({ length: 18 }, (_, index) => {
    const angle = index / 18 * Math.PI * 2;
    return [x + Math.cos(angle) * rx, y + Math.sin(angle) * ry] as const;
  });

const OBSTACLES: readonly Polygon[] = [
  ellipse(818, 535, 51, 32), // Square fountain.
  ellipse(688, 751, 45, 25), // Garden statue and flower bed.
  ellipse(958, 689, 27, 26), // Tree in the eastern garden walk.
  ellipse(997, 835, 24, 20), // Potted tree by the southern bridge approach.
];

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
export const createTownNavigation = (): NavigationGrid => new NavigationGrid(STREETS, [...OBSTACLES, ...placedSceneryFootprints('lindenhafen')]);

// These foot-level paths are traced independently from the two paintings.
// A shared rectangle would allow walking through the clockmill, greenhouses,
// stalls and open harbor water. Bridges and stairways are explicit corridors.
const WOODLAND_STREETS: readonly Polygon[] = [
  // Fountain square and its broad northern/southern roads.
  [[501,436],[547,391],[631,352],[655,312],[636,274],[649,232],[688,244],[716,301],[767,356],[862,326],[949,305],[1009,321],[977,369],[957,425],[955,490],[982,552],[959,594],[916,648],[871,686],[847,755],[803,805],[758,839],[741,930],[761,1010],[646,1010],[629,923],[587,867],[520,825],[463,809],[402,778],[393,733],[431,679],[463,622],[485,547],[498,485]],
  // Inn forecourt, its terrace stairs, and the noticeboard lane.
  [[173,344],[250,344],[358,327],[434,326],[488,354],[535,377],[574,385],[579,426],[541,453],[449,432],[412,457],[351,439],[314,413],[235,396],[190,378]],
  // Station forecourt and steps. Stay in front of the platform shelters.
  [[886,269],[927,258],[1002,265],[1102,280],[1197,296],[1300,301],[1320,322],[1280,339],[1168,324],[1082,330],[1018,318],[991,343],[955,341],[975,300],[909,292]],
  // Mill entrance and the stone bridge across its stream.
  [[945,422],[1008,402],[1072,424],[1066,489],[1104,524],[1172,564],[1205,584],[1149,618],[1078,596],[1008,565],[970,582],[955,510]],
  [[1121,570],[1204,560],[1281,584],[1369,605],[1405,637],[1370,665],[1300,640],[1244,618],[1188,604],[1125,616]],
  [[1366,626],[1414,625],[1459,648],[1473,682],[1433,700],[1385,675],[1355,659]],
  // Workshop apron; the roof and work carts remain outside the street.
  [[397,680],[440,647],[475,601],[508,616],[500,665],[478,709],[430,742],[389,756],[349,738],[340,717]],
  // Market perimeter and its eastern lane toward the conservatory garden.
  [[467,638],[518,604],[560,615],[570,657],[538,707],[516,763],[558,801],[647,823],[725,814],[779,782],[839,774],[857,725],[883,681],[911,650],[942,670],[924,724],[901,781],[872,819],[810,852],[725,875],[626,866],[544,845],[469,820],[429,786],[422,747]],
  // Old route garden and the narrow paved path beside the greenhouse.
  [[407,786],[443,803],[459,846],[428,883],[389,881],[350,917],[303,929],[252,901],[232,868],[252,831],[312,810],[369,803]],
  [[426,789],[461,808],[480,837],[463,861],[444,840],[425,817],[409,798]],
  [[908,714],[942,708],[964,744],[953,785],[981,825],[994,865],[980,904],[947,910],[926,877],[926,832],[906,794],[885,782]],
];
const WOODLAND_OBSTACLES: readonly Polygon[] = [
  ellipse(720,452,112,70), // Fountain, planting pots and the two benches.
  [[549,613],[655,602],[694,648],[686,698],[603,721],[549,704]],
  [[756,616],[830,604],[889,628],[881,710],[808,739],[755,705]],
  [[685,682],[769,671],[830,699],[825,771],[758,799],[680,767]],
  ellipse(305,852,29,22), // Old route instrument pedestal.
];

const HARBOR_STREETS: readonly Polygon[] = [
  // Council square, from its stair aprons to the market approaches.
  [[429,418],[473,382],[552,357],[586,309],[641,297],[683,312],[843,309],[887,295],[943,333],[996,365],[1041,413],[1048,463],[1007,507],[964,544],[940,578],[894,596],[837,621],[759,629],[704,613],[652,625],[598,623],[547,607],[530,565],[501,529],[455,505],[429,468]],
  // Council archive stairs and the small western café frontage.
  [[123,454],[171,466],[219,464],[281,456],[359,443],[398,415],[414,379],[366,316],[377,295],[403,291],[472,361],[490,391],[460,431],[428,463],[389,483],[346,502],[281,510],[208,512],[152,494]],
  // Observatory stairs and the paths around its stone garden wall.
  [[704,307],[733,277],[748,235],[782,235],[809,268],[822,302],[785,321],[744,326]],
  [[561,327],[576,298],[572,257],[552,214],[576,200],[597,230],[617,266],[635,297],[610,330]],
  // Station lane and its approach around the eastern garden.
  [[851,316],[879,277],[866,237],[864,209],[884,190],[914,219],[929,271],[986,308],[1045,337],[1116,383],[1157,416],[1140,455],[1103,456],[1071,413],[1016,375],[964,348],[910,342]],
  // The upper bridge to the signal lantern island, including its stairs.
  [[1109,420],[1151,402],[1189,427],[1229,416],[1287,390],[1353,360],[1389,350],[1417,369],[1391,406],[1340,429],[1267,466],[1236,483],[1189,468],[1152,450]],
  // Lower harbor bridge. Neither water nor parapets are walkable.
  [[1028,509],[1079,493],[1135,520],[1190,551],[1253,579],[1320,613],[1391,650],[1460,690],[1511,720],[1490,756],[1416,720],[1334,677],[1271,647],[1196,609],[1129,574],[1082,551],[1028,552]],
  // Workshop road and its stairs back into the council square.
  [[143,733],[189,729],[255,750],[319,774],[382,758],[427,724],[468,693],[505,637],[539,606],[568,623],[539,666],[522,704],[496,739],[454,772],[415,798],[382,827],[334,830],[276,801],[214,785],[159,766]],
  // Market's east/south perimeter. The tents are solid obstacles.
  [[548,601],[594,597],[623,617],[609,660],[579,689],[563,726],[595,761],[651,789],[712,812],[758,798],[792,754],[820,710],[822,666],[843,626],[878,620],[880,685],[854,739],[822,784],[796,829],[737,862],[676,844],[613,814],[558,779],[523,735],[529,685]],
  // Conservatory northern terrace; avoid the glass roof and south docks.
  [[866,589],[902,553],[939,534],[981,549],[1022,563],[1036,592],[1000,615],[956,601],[917,618],[882,620]],
  // Open aprons join the square to each market lane and the lower bridge.
  [[969,493],[1014,466],[1063,480],[1106,508],[1109,543],[1064,576],[1028,561],[991,530]],
  [[807,594],[846,588],[880,605],[894,633],[880,662],[850,665],[833,635],[804,627]],
];
const HARBOR_OBSTACLES: readonly Polygon[] = [
  ellipse(742,448,56,40), // Atlas pedestal.
  ellipse(637,379,27,19), ellipse(537,506,29,21),
  ellipse(712,566,28,20), ellipse(952,484,27,21), ellipse(932,560,27,20),
  [[600,614],[698,635],[754,695],[738,785],[672,813],[565,765],[535,716],[540,659]],
];

export function createMapNavigation(id: MapId): NavigationGrid {
  if (isExpeditionMap(id)) return new NavigationGrid(expeditionWalkablePolygons(id), placedSceneryFootprints(id));
  if (id === 'waldruh') return new NavigationGrid(WOODLAND_STREETS, [...WOODLAND_OBSTACLES, ...placedSceneryFootprints(id)]);
  if (id === 'nebelstadt') return new NavigationGrid(HARBOR_STREETS, [...HARBOR_OBSTACLES, ...placedSceneryFootprints(id)]);
  return createTownNavigation();
}

export function createFallbackNavigation(): NavigationGrid {
  const rectangle = (x: number, y: number, width: number, height: number): Polygon => [[x,y],[x+width,y],[x+width,y+height],[x,y+height]];
  return new NavigationGrid([rectangle(16, 200, 1110, 800)], [
    rectangle(280, 220, 285, 205), rectangle(660, 170, 275, 225),
    rectangle(865, 360, 240, 190), rectangle(175, 680, 245, 195),
    rectangle(790, 730, 275, 215), ellipse(687, 545, 56, 31),
  ]);
}
