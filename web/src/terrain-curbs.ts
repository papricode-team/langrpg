import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon} from 'polygon-clipping';
import type {ModularTerrain,TerrainSurface} from './modular-terrain';
import type {ScenePolygon} from './scene-schema';
import {terrainMaterial} from './terrain-materials';
import type {TerrainView} from './terrain-residency';

type Point = readonly [number, number];
export interface CurbStone {
  top: ScenePolygon;
  center: Point;
  tangent: Point;
  length: number;
  variant: number;
}
// Measure stones on the ground plane, then project them into the game's camera.
// Vertical screen distances are foreshortened; stones must not grow on N/S paths.
const FORESHORTENING = .62;
const WIDTH = 12;
const HEIGHT = 3.2;
const path = (ctx: CanvasRenderingContext2D, points: ScenePolygon) => {
  ctx.beginPath();
  points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.closePath();
};
const distance = (a: Point,b: Point) => Math.hypot(b[0]-a[0],b[1]-a[1]);
const chamfer = (polygon:ScenePolygon):ScenePolygon => polygon.flatMap((p,i) => {
  const neighbors=[polygon[(i+polygon.length-1)%polygon.length],polygon[(i+1)%polygon.length]];
  return neighbors.map(q => {
    const t=Math.min(.18,.7/(distance(p,q)||1));
    return [p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t] as Point;
  });
});

/** Polygon union preserves garden holes and removes curbs across intersections. */
export function roadCurbRings(polygons: ScenePolygon[]): ScenePolygon[] {
  if (!polygons.length) return [];
  return polygonClipping.union(
    [polygons[0].map(([x,y]): [number,number] => [x,y])],
    ...polygons.slice(1).map(p => [p.map(([x,y]): [number,number] => [x,y])]),
  ).flatMap(p => p.map(ring => ring.slice(0,-1)));
}

/** Respect painted-over gardens/water as well as overlapping street polygons. */
export function visibleRoadCurbRings(surfaces:TerrainSurface[]):ScenePolygon[]{
  let roads:MultiPolygon=[];
  for(const surface of surfaces){
    const polygon:Polygon=[surface.polygon.map(([x,y])=>[x,y])];
    if(terrainMaterial(surface.material)?.edge?.kind==='curb')roads=polygonClipping.union(roads,polygon);
    else if(roads.length)roads=polygonClipping.difference(roads,polygon);
  }
  return roads.flatMap(p=>p.map(ring=>ring.slice(0,-1)));
}

/** Stable world-space stones: chunking/zoom never changes the joints or variants. */
export function curbStones(ring: ScenePolygon): CurbStone[] {
  const points = ring.map(([x,y]): Point => [x,y/FORESHORTENING]);
  if (points.length<3) return [];
  const lengths = points.map((a,i) => distance(a,points[(i+1)%points.length]));
  const stations = [0];
  for (const length of lengths) stations.push(stations.at(-1)!+length);
  const total = stations.at(-1)!;
  if (total<16) return [];
  const normals = points.map((a,i): Point => {
    const b=points[(i+1)%points.length],length=lengths[i]||1;
    // Union rings have land to their left, including clockwise garden holes.
    return [(b[1]-a[1])/length, -(b[0]-a[0])/length];
  });
  const miters = points.map((_,i): Point => {
    const a=normals[(i+points.length-1)%points.length],b=normals[i];
    const divisor=Math.max(.65,1+a[0]*b[0]+a[1]*b[1]);
    return [(a[0]+b[0])/divisor,(a[1]+b[1])/divisor];
  });
  const sample = (at:number,offset:number): Point => {
    let i=0;
    while(i<lengths.length-1 && stations[i+1]<at) i++;
    const t=Math.min(1,(at-stations[i])/(lengths[i]||1)),j=(i+1)%points.length;
    return [points[i][0]*(1-t)+points[j][0]*t+(miters[i][0]*(1-t)+miters[j][0]*t)*offset,
      (points[i][1]*(1-t)+points[j][1]*t+(miters[i][1]*(1-t)+miters[j][1]*t)*offset)*FORESHORTENING-HEIGHT];
  };
  // End a stone at a sharp corner instead of wrapping one block around a junction.
  const breaks=[0,...stations.slice(1,-1).filter((_,i) => {
    const a=normals[i],b=normals[(i+1)%normals.length];
    return a[0]*b[0]+a[1]*b[1]<.8;
  }),total];
  const stones:CurbStone[]=[];
  for(let run=0;run<breaks.length-1;run++){
    const length=breaks[run+1]-breaks[run],count=Math.max(1,Math.round(length/23));
    for(let n=0;n<count;n++){
      const start=breaks[run]+length*n/count+.55,end=breaks[run]+length*(n+1)/count-.55;
      if(end<=start)continue;
      const mid=(start+end)/2,center=sample(mid,WIDTH/2);
      const variant=Math.abs(Math.round(center[0]*13+center[1]*31))%8;
      const width=WIDTH+(variant%3-1)*.55;
      const cuts=[start,...stations.filter(s=>s>start&&s<end),end];
      const a=sample(start,0),b=sample(end,0),dx=b[0]-a[0],dy=(b[1]-a[1])/FORESHORTENING,d=Math.hypot(dx,dy)||1;
      stones.push({top:chamfer([...cuts.map(s=>sample(s,width)),...cuts.reverse().map(s=>sample(s,-.6))]),
        center,tangent:[dx/d,dy/d],length:end-start,variant});
    }
  }
  return stones;
}

// Reuse geometry across visible chunks and preview cameras, without retaining maps forever.
const cache:{surfaces:TerrainSurface[];stones:CurbStone[]}[]=[];
function geometry(terrain:ModularTerrain):CurbStone[]{
  const surfaces=terrain.surfaces;
  const cached=cache.find(c=>c.surfaces.length===surfaces.length&&c.surfaces.every((s,i)=>s.polygon===surfaces[i].polygon&&s.material===surfaces[i].material));
  if(cached)return cached.stones;
  const stones=visibleRoadCurbRings(surfaces).flatMap(curbStones);
  cache.unshift({surfaces:[...surfaces],stones});if(cache.length>4)cache.pop();return stones;
}

// Interior faces from the existing high-resolution masonry painting, excluding mortar.
// These are source rectangles in canal-masonry.webp, not newly flattened raster borders.
const faces = [[280,264,96,57],[442,267,96,57],[600,265,92,58],[742,265,90,58],
  [900,266,95,57],[510,350,100,56],[660,350,95,56],[810,350,94,56]];

export function paintRoadCurbs(ctx:CanvasRenderingContext2D,terrain:ModularTerrain,view:TerrainView,
  source:(id:string)=>CanvasImageSource|undefined):void{
  paintStoneCourse(ctx,geometry(terrain),view,source);
}

export function paintStoneCourse(ctx:CanvasRenderingContext2D,stones:CurbStone[],view:TerrainView,
  source:(id:string)=>CanvasImageSource|undefined):void{
  const image=source('canal-masonry');
  ctx.save();ctx.lineJoin='round';
  for(const stone of stones){
    const {top,center,tangent,length,variant}=stone;
    if(center[0]<view.x-50||center[0]>view.x+view.width+50||center[1]<view.y-50||center[1]>view.y+view.height+50)continue;
    // Ground contact shadow and small raised front faces, lit from upper-left.
    path(ctx,top.map(([x,y]):Point=>[x+1.3,y+HEIGHT+1.6]));
    ctx.fillStyle='#07171e88';ctx.fill();ctx.strokeStyle='#07171e55';ctx.lineWidth=2;ctx.stroke();
    for(let i=0;i<top.length;i++){
      const a=top[i],b=top[(i+1)%top.length];
      if(b[0]>=a[0])continue;
      path(ctx,[a,b,[b[0],b[1]+HEIGHT],[a[0],a[1]+HEIGHT]]);
      ctx.fillStyle=variant%2?'#2c4253':'#344d60';ctx.fill();
    }
    path(ctx,top);ctx.fillStyle='#617b91';ctx.fill();
    if(image){
      ctx.save();ctx.clip();
      const [tx,ty]=tangent;
      ctx.transform(tx,ty*FORESHORTENING,-ty,tx*FORESHORTENING,center[0],center[1]);
      const [sx,sy,sw,sh]=faces[variant];
      ctx.drawImage(image,sx,sy,sw,sh,-length/2-2,-WIDTH/2-3,length+4,WIDTH+6);
      ctx.fillStyle=`rgba(155,184,210,${.20+(variant%3)*.025})`;ctx.fillRect(-length/2-2,-WIDTH/2-3,length+4,WIDTH+6);
      ctx.restore();
    }
    // Each stone has its own bevel, uneven mineral face and dark mortar joint.
    path(ctx,top);ctx.strokeStyle='#213747';ctx.lineWidth=.7;ctx.stroke();
    const inset=top.map(([x,y]):Point=>[center[0]+(x-center[0])*.89,center[1]+(y-center[1])*.80]);
    for(let i=0;i<inset.length;i++){
      const a=inset[i],b=inset[(i+1)%inset.length];
      ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);
      ctx.strokeStyle=b[0]>a[0]?'#a1b6c4a8':'#1a304861';ctx.lineWidth=.7;ctx.stroke();
    }
  }
  ctx.restore();
}
