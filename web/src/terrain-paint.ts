/** Ground is painted with a round brush. Strokes become simple, hole-free surfaces the scene schema accepts. */
import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon,Ring} from 'polygon-clipping';
import earcut from 'earcut';
import type {ModularTerrain,TerrainSurface} from './modular-terrain';
import {scenePolygonProblem,type ScenePolygon} from './scene-schema';

type Point=[number,number];
interface Bounds {minX:number;minY:number;maxX:number;maxY:number;}
/** The schema allows 256 vertices; leave room for the vertices a split adds. */
const MAX_VERTICES=240;
export const MAX_TERRAIN_SURFACES=512;
/** Split halves overlap slightly so the cut never shows as a seam between two tiles of the same material. */
const OVERLAP=.5;
/** Holes narrower than this are filled rather than cut open. */
const MIN_HOLE=4;
const TOLERANCE=1;

const open=(ring:Ring):Point[]=>ring.length>1&&ring[0][0]===ring.at(-1)![0]&&ring[0][1]===ring.at(-1)![1]?ring.slice(0,-1) as Point[]:ring as Point[];
const ring=(polygon:ScenePolygon):Ring=>polygon.map(([x,y]):Point=>[x,y]);
const area=(points:readonly (readonly [number,number])[])=>Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
function bounds(points:readonly (readonly [number,number])[]):Bounds{
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [x,y]of points){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  return {minX,minY,maxX,maxY};
}
const box=(x0:number,y0:number,x1:number,y1:number):Polygon=>[[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]];
const touches=(a:Bounds,b:Bounds)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
const shapeBounds=(shape:MultiPolygon)=>bounds(shape.flatMap(polygon=>polygon[0]) as Point[]);
function overlaps(polygon:ScenePolygon,shape:MultiPolygon,within=shapeBounds(shape)):boolean{
  return touches(bounds(polygon),within)&&polygonClipping.intersection([ring(polygon)],shape).length>0;
}

/** A round brush dragged through the pointer samples, clipped to the map. */
export function brushStroke(points:readonly (readonly [number,number])[],radius:number,width:number,height:number):MultiPolygon{
  if(!points.length||radius<=0)return [];
  const sides=Math.max(12,Math.min(40,Math.round(radius/3)));
  const arc=([x,y]:readonly [number,number],from:number,steps:number):Point[]=>Array.from({length:steps+1},(_,i):Point=>{
    const angle=from+Math.PI*i/steps;return [x+radius*Math.cos(angle),y+radius*Math.sin(angle)];
  });
  // One capsule per pointer segment keeps the union small however far the pointer travels.
  const capsule=(a:readonly [number,number],b:readonly [number,number]):Polygon=>{
    const angle=a[0]===b[0]&&a[1]===b[1]?0:Math.atan2(b[1]-a[1],b[0]-a[0]),half=Math.ceil(sides/2);
    return [[...arc(b,angle-Math.PI/2,half),...arc(a,angle+Math.PI/2,half)]];
  };
  const parts=points.length===1?[capsule(points[0],points[0])]:points.slice(1).map((b,i)=>capsule(points[i],b));
  const stroke=polygonClipping.union(parts[0],...parts.slice(1));
  return polygonClipping.intersection(stroke,box(0,0,width,height));
}

/** Douglas–Peucker on a closed ring, split at the vertex farthest from the first. */
function simplify(points:Point[],tolerance:number):Point[]{
  if(points.length<=8)return points;
  const reduce=(chain:Point[]):Point[]=>{
    const [a,b]=[chain[0],chain.at(-1)!],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    let index=0,far=0;
    for(let i=1;i<chain.length-1;i++){
      const p=chain[i],d=length?Math.abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/length:Math.hypot(p[0]-a[0],p[1]-a[1]);
      if(d>far){far=d;index=i;}
    }
    return far>tolerance?[...reduce(chain.slice(0,index+1)).slice(0,-1),...reduce(chain.slice(index))]:[a,b];
  };
  let split=0,far=0;
  points.forEach((p,i)=>{const d=Math.hypot(p[0]-points[0][0],p[1]-points[0][1]);if(d>far){far=d;split=i;}});
  return [...reduce(points.slice(0,split+1)).slice(0,-1),...reduce([...points.slice(split),points[0]]).slice(0,-1)];
}

/** Cut holes open and keep each piece under the vertex limit. */
function solid(polygon:Polygon,depth=0):Polygon[]{
  const [outer,...rest]=polygon,holes=rest.filter(hole=>{const b=bounds(hole);return b.maxX-b.minX>=MIN_HOLE&&b.maxY-b.minY>=MIN_HOLE;});
  if(!holes.length&&open(outer).length<=MAX_VERTICES)return [[outer]];
  if(depth>16)return [];
  const o=bounds(outer),target=holes.length?bounds(holes[0]):o;
  const vertical=holes.length>0||o.maxX-o.minX>=o.maxY-o.minY;
  const cut=vertical?(target.minX+target.maxX)/2:(target.minY+target.maxY)/2;
  const halves=vertical
    ?[box(o.minX-1,o.minY-1,cut+OVERLAP,o.maxY+1),box(cut-OVERLAP,o.minY-1,o.maxX+1,o.maxY+1)]
    :[box(o.minX-1,o.minY-1,o.maxX+1,cut+OVERLAP),box(o.minX-1,cut-OVERLAP,o.maxX+1,o.maxY+1)];
  return halves.flatMap(half=>polygonClipping.intersection([outer,...holes],half)).flatMap(piece=>solid(piece,depth+1));
}

function tidy(points:Point[],width:number,height:number):ScenePolygon{
  const result:Point[]=[];
  for(const [x,y]of points){
    const p:Point=[Math.round(Math.max(0,Math.min(width,x))*10)/10,Math.round(Math.max(0,Math.min(height,y))*10)/10];
    const last=result.at(-1);if(!last||last[0]!==p[0]||last[1]!==p[1])result.push(p);
  }
  while(result.length>1&&result[0][0]===result.at(-1)![0]&&result[0][1]===result.at(-1)![1])result.pop();
  return result;
}

/** Every polygon passes the scene schema; rounding that folds a thin spike falls back to triangles. */
export function scenePieces(shape:MultiPolygon,width:number,height:number,tolerance=TOLERANCE):ScenePolygon[]{
  const result:ScenePolygon[]=[];
  for(const polygon of shape){
    const [outer,...holes]=polygon.map(r=>simplify(open(r),tolerance));
    if(outer.length<3||area(outer)<1)continue;
    // Simplifying can make a ring touch itself; a union restores a valid shape.
    for(const cleaned of polygonClipping.union([outer,...holes.filter(h=>h.length>=3)]))for(const piece of solid(cleaned)){
      const points=tidy(open(piece[0]),width,height);
      if(points.length<3||area(points)<1)continue;
      if(!scenePolygonProblem(points,width,height)){result.push(points);continue;}
      const indices=earcut(points.flat());
      for(let i=0;i<indices.length;i+=3){
        const triangle=[points[indices[i]],points[indices[i+1]],points[indices[i+2]]];
        if(!scenePolygonProblem(triangle,width,height))result.push(triangle);
      }
    }
  }
  return result;
}

const newSurfaceId=()=>`terrain-${crypto.randomUUID()}`;

/**
 * Paint a stroke of one material on top of the ground. Earlier strokes of that material
 * merge with it when nothing lies above them, and surfaces the stroke hides completely go away,
 * so repeated painting does not pile up surfaces.
 */
export function paintGround(terrain:ModularTerrain,stroke:MultiPolygon,material:string,width:number,height:number,newId=newSurfaceId):ModularTerrain{
  if(!stroke.length)return terrain;
  const surfaces=terrain.surfaces,within=shapeBounds(stroke);
  const merged=new Set<number>();
  surfaces.forEach((surface,index)=>{
    if(surface.groupId||surface.blocked!==undefined||surface.material!==material||!overlaps(surface.polygon,stroke,within))return;
    const own:MultiPolygon=[[ring(surface.polygon)]],ownBounds=bounds(surface.polygon);
    if(!surfaces.slice(index+1).some(other=>overlaps(other.polygon,own,ownBounds)))merged.add(index);
  });
  const top=merged.size?polygonClipping.union(stroke,...[...merged].map(index=>[ring(surfaces[index].polygon)] as Polygon)):stroke;
  const topBounds=shapeBounds(top);
  const hidden=(surface:TerrainSurface)=>{
    const b=bounds(surface.polygon);
    return b.minX>=topBounds.minX&&b.maxX<=topBounds.maxX&&b.minY>=topBounds.minY&&b.maxY<=topBounds.maxY
      &&!polygonClipping.difference([ring(surface.polygon)],top).length;
  };
  const kept=surfaces.filter((surface,index)=>!merged.has(index)&&!hidden(surface));
  return {...terrain,surfaces:[...kept,...scenePieces(top,width,height).map(polygon=>({id:newId(),material,polygon}))]};
}

/** Erasing reveals the base ground. Surfaces keep their material, blocking and group. */
export function eraseGround(terrain:ModularTerrain,stroke:MultiPolygon,width:number,height:number,newId=newSurfaceId):ModularTerrain{
  if(!stroke.length)return terrain;
  const within=shapeBounds(stroke);
  return {...terrain,surfaces:terrain.surfaces.flatMap(surface=>{
    if(!overlaps(surface.polygon,stroke,within))return [surface];
    return scenePieces(polygonClipping.difference([ring(surface.polygon)],stroke),width,height)
      .map((polygon,index)=>({...surface,id:index?newId():surface.id,polygon}));
  })};
}
