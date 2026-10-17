import {defaultRoomFixtures, layoutFixtures} from './room-layout-runtime';
import {roomWallSegments} from './room-layout';
import furnitureFrames from './data/room-kit-furniture.json';
import polygonClipping from 'polygon-clipping';
import type {InteriorPolygon, InteriorSpec} from './interiors';
import {roomKind} from './room-kind';

export interface RoomFloor {polygon: InteriorPolygon; material: 'timber' | 'limestone' | 'slate';}
export interface RoomWall {from: readonly [number, number]; to: readonly [number, number]; height: number; window: boolean;}
export interface RoomKit {floors: RoomFloor[]; walls: RoomWall[]; fixtures: {kind: 'bed' | 'desk' | 'lamp'; x: number; y: number; width: number; height: number}[];}
export interface RoomWindow {x: number; bottom: number; width: number; height: number; floorY: number;}
export interface RoomLamp {x: number; y: number; floorX: number; floorY: number; radius: number;}
export interface RoomLighting {windows: RoomWindow[]; lamps: RoomLamp[];}
export const ROOM_LIGHT_LAYERS = ['shade', 'windows', 'lamps'] as const;
export type RoomLightLayer = typeof ROOM_LIGHT_LAYERS[number];
export const roomMaterials = ['timber', 'limestone', 'slate', 'canal-masonry'] as const;

/** The same floor polygons drive walking and assembly: no separate painted collision outline. */
export function roomKit(spec: InteriorSpec): RoomKit {
  const kind = roomKind(spec.id);
  const floors: RoomFloor[] = spec.floorAreas.map((polygon, index) => ({polygon,
    material: kind === 'supermarket' || kind === 'greenhouse' ? 'limestone'
      : kind === 'bakery' && index === 1 || kind === 'station' ? 'slate' : 'timber'}));
  const polygons = spec.floorAreas.map(polygon => [[...polygon.map(point => [...point] as [number, number])]] as polygonClipping.Polygon);
  const union = polygons.length ? polygonClipping.union(polygons[0], ...polygons.slice(1)) : [];
  const walls: RoomWall[] = [];
  for (const polygon of union) for (const ring of polygon) for (let index = 1; index < ring.length; index++) {
    const from = ring[index - 1], to = ring[index];
    // The union's outer ring runs clockwise in screen coordinates: east-facing edges are back walls.
    const partition = (spec.barriers ?? []).some(barrier => Math.abs(Math.max(...barrier.map(point => point[1])) - from[1]) <= 24 && to[0] > Math.min(...barrier.map(point => point[0])) && from[0] < Math.max(...barrier.map(point => point[0])));
    const back = !partition && to[0] > from[0] && Math.abs(to[1] - from[1]) < to[0] - from[0];
    const dx=to[0]-from[0],dy=to[1]-from[1],length=Math.hypot(dx,dy);
    // A relocated travel marker near the outline leaves a visible doorway in that edge.
    const portals=spec.layout ? [spec.layout.spawn,spec.layout.exit,...(spec.layout.links ?? []).filter(link=>link.kind!=='stairs')].filter((p):p is {x:number;y:number}=>!!p) : [];
    const gaps=portals.flatMap(p=>{
      const t=((p.x-from[0])*dx+(p.y-from[1])*dy)/(length*length);
      if(t<0||t>1||Math.hypot(p.x-from[0]-dx*t,p.y-from[1]-dy*t)>60)return [];
      return [[Math.max(0,t-55/length),Math.min(1,t+55/length)]];
    }).sort((a,b)=>a[0]-b[0]);
    let start=0;
    for(const [gap,end] of [...gaps,[1,1]]){
      if(gap>start)walls.push({from:[from[0]+dx*start,from[1]+dy*start],to:[from[0]+dx*gap,from[1]+dy*gap],height:back?140:12,window:back&&length*(gap-start)>300});
      start=Math.max(start,end);
    }
  }
  const partitions = spec.layout ? roomWallSegments(spec.layout).map(w => [[w.x,w.y],[w.x+w.width,w.y],[w.x+w.width,w.y+w.height],[w.x,w.y+w.height]] as const) : spec.barriers ?? [];
  for (const polygon of partitions) {
    // Inn barriers belong to its bed and desk; these are separate fixtures below.
    if (kind === 'inn' && !spec.layout) continue;
    const xs = polygon.map(point => point[0]), ys = polygon.map(point => point[1]);
    walls.push({from: [Math.min(...xs), Math.max(...ys)], to: [Math.max(...xs), Math.max(...ys)], height: 76, window: false});
    if (spec.layout) walls.push({from:[Math.max(...xs),Math.min(...ys)],to:[Math.max(...xs),Math.max(...ys)],height:76,window:false});
  }
  const fixtures: RoomKit['fixtures'] = spec.layout ? layoutFixtures(spec.layout) : defaultRoomFixtures(spec);
  // One small painted lamp sits against a back wall, outside the walking route.
  // Authored lamps keep their own positions; the inn already has one.
  if (!fixtures.some(fixture => fixture.kind === 'lamp')) {
    const wall = walls.find(wall => wall.window) ?? walls.find(wall => wall.height > 12);
    if (wall) fixtures.push({kind:'lamp', x:wall.from[0]+24, y:wall.from[1]-50, width:32, height:54});
  }
  return {floors, walls, fixtures};
}

/** Match the actual window exception and atlas dimensions, never collision-box heights. */
export function roomWindows(spec: InteriorSpec, kit = roomKit(spec)): RoomWindow[] {
  return kit.walls.filter(wall => wall.window).map(wall => ({
    x: roomKind(spec.id) === 'inn' && !spec.layout?.floors ? 1000 : (wall.from[0] + wall.to[0]) / 2,
    bottom: (wall.from[1] + wall.to[1]) / 2 - 20,
    width: 120, height: 120 * furnitureFrames.window.height / furnitureFrames.window.width,
    floorY: (wall.from[1] + wall.to[1]) / 2,
  }));
}

/** One compiled plan serves canvas pools, halos and character sampling, including edited rooms. */
export function roomLighting(spec: InteriorSpec, kit = roomKit(spec)): RoomLighting {
  const lamps = kit.fixtures.filter(fixture => fixture.kind === 'lamp').map(fixture => {
    const height = fixture.width * furnitureFrames.lamp.height / furnitureFrames.lamp.width;
    const bottom = fixture.y + fixture.height;
    return {x: fixture.x + fixture.width * .60, y: bottom - height * .79,
      floorX: fixture.x + fixture.width * .60 + 24, floorY: bottom + 38,
      radius: Math.max(140, fixture.width * 2.1)};
  });
  // Table candles (and authored sconces with a flame detail) use the same emitter contract.
  for (const prop of spec.props) for (const effect of prop.effects ?? []) if (effect.asset === 'flame') {
    lamps.push({x: prop.x + effect.x, y: prop.y + effect.y,
      floorX: prop.x + 22, floorY: prop.y + 24, radius: Math.max(110, prop.width * 2.5)});
  }
  return {windows: roomWindows(spec, kit), lamps};
}

/** Low-resolution transparent overlays. Baked once, clipped to the walkable floor union. */
export function paintRoomLightLayer(context: CanvasRenderingContext2D, spec: InteriorSpec, layer: RoomLightLayer,
  lighting = roomLighting(spec)): void {
  context.save();
  context.beginPath();
  for (const polygon of spec.floorAreas) {
    polygon.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath();
  }
  context.clip();
  if (layer === 'shade') {
    const gradient = context.createRadialGradient(spec.width * .50, spec.height * .53, 60,
      spec.width * .50, spec.height * .53, spec.width * .60);
    gradient.addColorStop(0, '#3e453900');
    gradient.addColorStop(.45, '#3e453912');
    gradient.addColorStop(1, '#26382fd0');
    context.fillStyle = gradient; context.fillRect(0, 0, spec.width, spec.height);
  } else if (layer === 'windows') {
    for (const window of lighting.windows) {
      // Upper-left sunlight travels down/right. Feathering is baked, never a runtime blur.
      context.save();
      const gradient = context.createLinearGradient(window.x, window.floorY, window.x + 100, window.floorY + 290);
      gradient.addColorStop(0, '#fff0c7d9'); gradient.addColorStop(.48, '#ffe2a46e'); gradient.addColorStop(1, '#edce8a00');
      context.fillStyle = gradient;
      context.shadowColor = '#ffe4ac80'; context.shadowBlur = 12;
      context.beginPath();
      context.moveTo(window.x - 51, window.floorY - 4); context.lineTo(window.x + 51, window.floorY - 4);
      context.lineTo(window.x + 220, window.floorY + 290); context.lineTo(window.x + 25, window.floorY + 290);
      context.closePath(); context.fill();
      // Soft mullion gaps stop the shaft reading as one flat oval.
      context.globalCompositeOperation = 'destination-out'; context.shadowBlur = 7;
      context.fillStyle = '#00000038';
      context.beginPath(); context.moveTo(window.x - 3, window.floorY); context.lineTo(window.x + 4, window.floorY);
      context.lineTo(window.x + 135, window.floorY + 285); context.lineTo(window.x + 119, window.floorY + 285);
      context.closePath(); context.fill(); context.restore();
    }
  } else {
    for (const lamp of lighting.lamps) {
      context.save(); context.translate(lamp.floorX, lamp.floorY); context.scale(1, .48);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, lamp.radius);
      gradient.addColorStop(0, '#ffdfa5e6'); gradient.addColorStop(.25, '#ffd08bb3');
      gradient.addColorStop(.65, '#eab26740'); gradient.addColorStop(1, '#dfa55800');
      context.fillStyle = gradient; context.fillRect(-lamp.radius, -lamp.radius, lamp.radius * 2, lamp.radius * 2);
      context.restore();
    }
  }
  context.restore();
}

/** Canvas assembly is shared by Phaser and the standalone room preview. */
export function paintRoomKit(context: CanvasRenderingContext2D, spec: InteriorSpec,
  materialImage: (id: string) => CanvasImageSource | undefined): void {
  const kit = roomKit(spec);
  const furniture = materialImage('room-kit-furniture');
  const drawFixture = (kind: keyof typeof furnitureFrames, x: number, bottom: number, width: number) => {
    if (!furniture) return;
    const frame = furnitureFrames[kind], height = width * frame.height / frame.width;
    context.drawImage(furniture, frame.x, frame.y, frame.width, frame.height, x, bottom - height, width, height);
  };
  const path = (polygon: InteriorPolygon) => {
    context.beginPath(); polygon.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y)); context.closePath();
  };
  const fillMaterial = (id: string, fallback: string) => {
    const image = materialImage(id), pattern = image ? context.createPattern(image, 'repeat') : undefined;
    if (pattern && image) {
      const width = Number((image as {width?: number}).width ?? 1152);
      pattern.setTransform(new DOMMatrix().scale(256 / width));
    }
    context.fillStyle = pattern ?? fallback;
  };
  context.fillStyle = '#282d2a'; context.fillRect(0, 0, spec.width, spec.height);
  for (const floor of kit.floors) {
    path(floor.polygon); context.save(); context.shadowColor = '#111b'; context.shadowBlur = 35;
    context.fillStyle = '#111'; context.fill(); context.restore();
  }
  for (const floor of kit.floors) { path(floor.polygon); fillMaterial(floor.material, '#a38c69'); context.fill(); }
  // A warm wash keeps the terrain materials in the same palette as the painted indoor furniture.
  for (const floor of kit.floors) { path(floor.polygon); context.fillStyle = '#edce8a18'; context.fill(); }
  for (const wall of kit.walls) {
    const [x, y] = wall.from, [endX, endY] = wall.to;
    path([[x, y], [endX, endY], [endX, endY - wall.height], [x, y - wall.height]]);
    fillMaterial('canal-masonry', '#b8ad91'); context.fill();
    context.fillStyle = '#e9d6a766'; context.fill();
    context.strokeStyle = '#655e4a'; context.lineWidth = 8; context.stroke();
    context.beginPath(); context.moveTo(x, y - wall.height); context.lineTo(endX, endY - wall.height);
    context.strokeStyle = '#e2d8b7'; context.lineWidth = 6; context.stroke();
    if (wall.window) {
      const window = roomWindows(spec, { ...kit, walls: [wall] })[0];
      drawFixture('window', window.x - window.width / 2, window.bottom, window.width);
    }
  }

  if(spec.layout?.spawn){
    const {x,y}=spec.layout.spawn;
    context.fillStyle='#a9c7ba';context.fillRect(x-35,y-6,70,12);
    context.strokeStyle='#58786b';context.lineWidth=2;context.strokeRect(x-35,y-6,70,12);
  }
  for(const door of spec.layout?.links ?? []) {
    const {x,y}=door;
    if(door.kind==='stairs'){
      const up=spec.stairDirections?.[door.id]==='up';
      context.fillStyle='#302d28';context.fillRect(x-48,y-110,96,118);
      for(let step=0;step<7;step++){
        const top=y-104+step*15,shade=up?step:6-step;
        context.fillStyle=`rgb(${128+shade*10},${108+shade*8},${78+shade*6})`;context.fillRect(x-40,top,80,13);
        context.fillStyle='#e7c991';context.fillRect(x-40,top,80,2);
      }
      context.fillStyle='#a88150';context.fillRect(x-48,y-114,8,122);context.fillRect(x+40,y-114,8,122);
      context.fillStyle='#ead7a8';context.fillRect(x-48,y+4,96,5);
      context.strokeStyle='#fff1cf';context.lineWidth=4;context.beginPath();context.moveTo(x,y-30);context.lineTo(x,y-76);
      const tip=up?y-76:y-30;context.moveTo(x-9,tip+(up?10:-10));context.lineTo(x,tip);context.lineTo(x+9,tip+(up?10:-10));context.stroke();
      continue;
    }
    context.fillStyle='#332f27';context.fillRect(x-31,y-75,62,75);
    context.fillStyle='#a88150';context.fillRect(x-43,y-84,12,88);context.fillRect(x+31,y-84,12,88);context.fillRect(x-43,y-90,86,12);
    context.fillStyle='#ddbd81';context.fillRect(x-43,y-2,86,8);context.fillRect(x-40,y-87,80,3);
  }
  // The exit is an opening, rather than a wall hidden under a portal.
  const ex = spec.exit.x * spec.width, ey = spec.exit.y * spec.height;
  context.fillStyle = '#c2a676'; context.fillRect(ex - 55, ey - 8, 110, 18);
  context.fillStyle = '#ead7a8'; context.fillRect(ex - 55, ey + 8, 110, 4);
}
