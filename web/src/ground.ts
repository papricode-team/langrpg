/**
 * Painted ground, as in Unity's terrain: a grid of samples every `cell` world units, each holding a weight
 * per material layer. The renderer blends the tiled materials by these weights, painting adds weight to one
 * layer with a soft round brush, and samples where blocked materials (water, rock) dominate stop walkers.
 * Features (bridges, inlays) are painted art laid over the ground; a bridge deck opens a crossing.
 */
import polygonClipping from 'polygon-clipping';
import type {MultiPolygon} from 'polygon-clipping';
import earcut,{flatten} from 'earcut';
import {terrainMaterial} from './terrain-materials.ts';
import {featureSurfaces,type TerrainFeature} from './terrain-features.ts';
import type {ScenePolygon} from './scene-schema';

export const GROUND_CELL=8;
/** Two RGBA control textures hold six layers; six materials and two controls fill WebGL1's eight texture units. */
export const MAX_GROUND_LAYERS=6;
export const MAX_BRUSH_RADIUS=512;
export const MAX_STROKE_POINTS=400;
const BARRIER_TILE=256;
/** Blocked materials stop walkers once they clearly dominate; a shore leaves walkers a little leeway. */
const SHORE_LEVEL=.6;

export interface Ground {
  version:1;
  /** World units between samples. */
  cell:number;
  /** Material ids; the first is the ground under everything. */
  layers:string[];
  /** One encoded weight grid per layer (see encodeWeights). */
  weights:string[];
  features?:TerrainFeature[];
}
export interface GroundStroke {material:string;radius:number;strength:number;points:readonly (readonly [number,number])[];}

export const groundGrid=(width:number,height:number,cell:number)=>({columns:Math.floor(width/cell)+1,rows:Math.floor(height/cell)+1});

/** Run-length bytes (value, run − 1) in base64: painted ground is mostly wide even areas. */
export function encodeWeights(values:Uint8Array):string{
  const bytes:number[]=[];
  for(let i=0;i<values.length;){
    let run=1;while(run<256&&i+run<values.length&&values[i+run]===values[i])run++;
    bytes.push(values[i],run-1);i+=run;
  }
  let text='';
  for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.slice(i,i+8192));
  return btoa(text);
}

export function decodeWeights(text:string,length:number):Uint8Array{
  const bytes=atob(text),values=new Uint8Array(length);let at=0;
  if(bytes.length%2)throw new Error('ground weights are malformed');
  for(let i=0;i<bytes.length;i+=2){
    const value=bytes.charCodeAt(i),run=bytes.charCodeAt(i+1)+1;
    if(at+run>length)throw new Error('ground weights are longer than the grid');
    values.fill(value,at,at+run);at+=run;
  }
  if(at!==length)throw new Error('ground weights are shorter than the grid');
  return values;
}

interface Decoded {width:number;height:number;columns:number;rows:number;layers:Uint8Array[];}
const decodedCache=new WeakMap<Ground,Decoded>();
/** Weight grids of a ground for a town of this size; decoded once per ground object. */
export function groundLayers(ground:Ground,width:number,height:number):Decoded{
  const cached=decodedCache.get(ground);
  if(cached&&cached.width===width&&cached.height===height)return cached;
  const {columns,rows}=groundGrid(width,height,ground.cell);
  const decoded={width,height,columns,rows,layers:ground.weights.map(text=>decodeWeights(text,columns*rows))};
  decodedCache.set(ground,decoded);return decoded;
}

/** Ground of one material. */
export function plainGround(material:string,width:number,height:number,cell=GROUND_CELL):Ground{
  const {columns,rows}=groundGrid(width,height,cell);
  return {version:1,cell,layers:[material],weights:[encodeWeights(new Uint8Array(columns*rows).fill(255))]};
}

/** Builds a ground from weight grids, dropping empty layers after the first. */
export function groundFromLayers(materials:readonly string[],layers:readonly Uint8Array[],cell:number,features?:TerrainFeature[]):Ground{
  const kept=materials.map((material,index)=>({material,values:layers[index]})).filter((layer,index)=>index===0||layer.values.some(value=>value>0));
  return {version:1,cell,layers:kept.map(layer=>layer.material),weights:kept.map(layer=>encodeWeights(layer.values)),...(features?.length?{features}:{})};
}

/**
 * Paint one stroke. Each dab adds `strength` (0–1) of the material under a smooth round falloff and
 * removes the same share from the other layers, so weights keep summing to 255. A material joins as a new
 * layer; a town holds at most six, reusing a layer nothing shows any more.
 */
export function paintGround(ground:Ground,width:number,height:number,stroke:GroundStroke):Ground{
  const {columns,rows,layers}=groundLayers(ground,width,height),cell=ground.cell;
  const materials=[...ground.layers],values=layers.map(layer=>Float32Array.from(layer));
  let target=materials.indexOf(stroke.material);
  if(target<0){
    const spare=materials.findIndex((_,index)=>index>0&&values[index].every(value=>value<.5));
    if(spare>0){target=spare;materials[spare]=stroke.material;values[spare].fill(0);}
    else if(materials.length<MAX_GROUND_LAYERS){target=materials.length;materials.push(stroke.material);values.push(new Float32Array(columns*rows));}
    else throw new Error(`A town can use ${MAX_GROUND_LAYERS} ground materials. Paint over one of ${materials.join(', ')} completely to free it.`);
  }
  const radius=stroke.radius,strength=Math.min(1,Math.max(0,stroke.strength)),spacing=Math.max(cell/2,radius/4);
  const dab=(cx:number,cy:number):void=>{
    const x0=Math.max(0,Math.ceil((cx-radius)/cell)),x1=Math.min(columns-1,Math.floor((cx+radius)/cell));
    const y0=Math.max(0,Math.ceil((cy-radius)/cell)),y1=Math.min(rows-1,Math.floor((cy+radius)/cell));
    for(let row=y0;row<=y1;row++)for(let column=x0;column<=x1;column++){
      const distance=Math.hypot(column*cell-cx,row*cell-cy)/radius;
      if(distance>=1)continue;
      const falloff=(1-distance*distance)**2,amount=strength*falloff,index=row*columns+column;
      for(let layer=0;layer<values.length;layer++){
        const weights=values[layer];
        weights[index]=layer===target?weights[index]+amount*(255-weights[index]):weights[index]*(1-amount);
      }
    }
  };
  const points=stroke.points;
  if(points.length)dab(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++){
    const [ax,ay]=points[i-1],[bx,by]=points[i],steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)/spacing));
    for(let step=1;step<=steps;step++)dab(ax+(bx-ax)*step/steps,ay+(by-ay)*step/steps);
  }
  return groundFromLayers(materials,values.map(weights=>Uint8Array.from(weights,value=>Math.round(value))),cell,ground.features);
}

/** Normalized material weights at a world point, blended between the nearest samples. */
export function groundWeightsAt(ground:Ground,width:number,height:number,x:number,y:number):number[]{
  const {columns,rows,layers}=groundLayers(ground,width,height);
  const gx=Math.min(columns-1,Math.max(0,x/ground.cell)),gy=Math.min(rows-1,Math.max(0,y/ground.cell));
  const x0=Math.floor(gx),y0=Math.floor(gy),x1=Math.min(columns-1,x0+1),y1=Math.min(rows-1,y0+1),fx=gx-x0,fy=gy-y0;
  const weights=layers.map(layer=>(layer[y0*columns+x0]*(1-fx)+layer[y0*columns+x1]*fx)*(1-fy)+(layer[y1*columns+x0]*(1-fx)+layer[y1*columns+x1]*fx)*fy);
  const total=weights.reduce((sum,value)=>sum+value,0);
  return total>0?weights.map(value=>value/total):weights.map((_,index)=>index===0?1:0);
}

/** The material that shows most at a point. */
export function groundMaterialAt(ground:Ground,width:number,height:number,x:number,y:number):string{
  const weights=groundWeightsAt(ground,width,height,x,y);
  return ground.layers[weights.indexOf(Math.max(...weights))];
}

const hex=(color:string)=>[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16));
/** The blended material colour at a point, for ground-tinted shadows and overview maps. */
export function groundColorAt(ground:Ground,width:number,height:number,x:number,y:number):[number,number,number]{
  const weights=groundWeightsAt(ground,width,height,x,y),color=[0,0,0];
  ground.layers.forEach((material,index)=>{const rgb=hex(terrainMaterial(material)?.color??'#7d8660');for(let c=0;c<3;c++)color[c]+=rgb[c]*weights[index];});
  return color.map(Math.round) as [number,number,number];
}

/** RGBA pixels, one per sample, of the blended material colours. */
export function groundColorPixels(ground:Ground,width:number,height:number):{columns:number;rows:number;pixels:Uint8ClampedArray}{
  const {columns,rows,layers}=groundLayers(ground,width,height),colors=ground.layers.map(material=>hex(terrainMaterial(material)?.color??'#7d8660'));
  const pixels=new Uint8ClampedArray(columns*rows*4);
  for(let index=0;index<columns*rows;index++){
    let total=0;const color=[0,0,0];
    layers.forEach((layer,l)=>{const w=layer[index];total+=w;for(let c=0;c<3;c++)color[c]+=colors[l][c]*w;});
    for(let c=0;c<3;c++)pixels[index*4+c]=total?color[c]/total:colors[0][c];
    pixels[index*4+3]=255;
  }
  return {columns,rows,pixels};
}

/** Whether walkers stop at each sample: blocked materials hold most of its weight. */
export function groundBlockedSamples(ground:Ground,width:number,height:number):Uint8Array{
  const {columns,rows,layers}=groundLayers(ground,width,height),blocked=ground.layers.map(material=>terrainMaterial(material)?.blocked??false);
  const result=new Uint8Array(columns*rows);
  for(let index=0;index<result.length;index++){
    let total=0,stop=0;
    layers.forEach((layer,l)=>{total+=layer[index];if(blocked[l])stop+=layer[index];});
    result[index]=total>0?(stop>=SHORE_LEVEL*total?1:0):(blocked[0]?1:0);
  }
  return result;
}

/**
 * Closed outlines of the blocked share's 0.5 level. The grid is padded with open ground, so every outline closes;
 * outlines along the town edge are clipped to it afterwards. Nested outlines combine by even–odd.
 */
function blockedContours(ground:Ground,width:number,height:number):[number,number][][]{
  const {columns,rows,layers}=groundLayers(ground,width,height),cell=ground.cell;
  const blocked=ground.layers.map(material=>terrainMaterial(material)?.blocked??false);
  if(!blocked.some(Boolean)&&!ground.features?.length)return [];
  const share=new Float32Array(columns*rows);
  for(let index=0;index<share.length;index++){
    let total=0,stop=0;
    layers.forEach((layer,l)=>{total+=layer[index];if(blocked[l])stop+=layer[index];});
    share[index]=total>0?stop/total:blocked[0]?1:0;
  }
  // Features apply on the same samples, last surface first, so a bridge deck meets the shore it spans
  // without leaving slivers of water between them.
  const surfaces=(ground.features??[]).flatMap(featureSurfaces).map(surface=>({surface,blocks:surface.blocked??terrainMaterial(surface.material)?.blocked??false,bounds:polygonBounds(surface.polygon)}));
  if(surfaces.length)for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
    const x=c*cell,y=r*cell;
    for(let i=surfaces.length-1;i>=0;i--){
      const {surface,blocks,bounds}=surfaces[i];
      if(x<bounds.minX||x>bounds.maxX||y<bounds.minY||y>bounds.maxY||!pointInPolygon(surface.polygon,x,y))continue;
      share[r*columns+c]=blocks?1:0;break;
    }
  }
  const value=(c:number,r:number)=>c<0||r<0||c>=columns||r>=rows?0:share[r*columns+c];
  const point=(c:number,r:number,dc:number,dr:number):[number,number]=>{
    const a=value(c,r),b=value(c+dc,r+dr),t=a===b?.5:Math.min(1,Math.max(0,(SHORE_LEVEL-a)/(b-a)));
    return [(c+dc*t)*cell,(r+dr*t)*cell];
  };
  // Edges are keyed by their lower corner and direction; each crossing joins two segments.
  const key=(c:number,r:number,horizontal:boolean)=>`${c},${r},${horizontal?'h':'v'}`;
  const next=new Map<string,string>(),points=new Map<string,[number,number]>();
  const link=(from:[number,number,boolean],to:[number,number,boolean])=>{
    const a=key(...from),b=key(...to);
    if(!points.has(a))points.set(a,from[2]?point(from[0],from[1],1,0):point(from[0],from[1],0,1));
    if(!points.has(b))points.set(b,to[2]?point(to[0],to[1],1,0):point(to[0],to[1],0,1));
    next.set(a,b);
  };
  for(let r=-1;r<rows;r++)for(let c=-1;c<columns;c++){
    const tl=value(c,r)>=SHORE_LEVEL,tr=value(c+1,r)>=SHORE_LEVEL,br=value(c+1,r+1)>=SHORE_LEVEL,bl=value(c,r+1)>=SHORE_LEVEL;
    const code=(tl?8:0)|(tr?4:0)|(br?2:0)|(bl?1:0);
    if(code===0||code===15)continue;
    const top:[number,number,boolean]=[c,r,true],right:[number,number,boolean]=[c+1,r,false],bottom:[number,number,boolean]=[c,r+1,true],left:[number,number,boolean]=[c,r,false];
    const centre=(value(c,r)+value(c+1,r)+value(c+1,r+1)+value(c,r+1))/4>=SHORE_LEVEL;
    // Segments run with blocked ground on their left.
    switch(code){
      case 1:link(left,bottom);break; case 2:link(bottom,right);break; case 3:link(left,right);break;
      case 4:link(right,top);break; case 6:link(bottom,top);break; case 7:link(left,top);break;
      case 8:link(top,left);break; case 9:link(top,bottom);break; case 11:link(top,right);break;
      case 12:link(right,left);break; case 13:link(right,bottom);break; case 14:link(bottom,left);break;
      case 5:if(centre){link(left,top);link(right,bottom);}else{link(left,bottom);link(right,top);}break;
      case 10:if(centre){link(top,right);link(bottom,left);}else{link(top,left);link(bottom,right);}break;
    }
  }
  const rings:[number,number][][]=[];
  for(const start of next.keys()){
    if(!next.has(start))continue;
    const ring:[number,number][]=[];let at:string|undefined=start;
    while(at&&next.has(at)){const following:string=next.get(at)!;next.delete(at);ring.push(points.get(at)!);at=following;}
    if(ring.length>=3)rings.push(ring);
  }
  return rings;
}

function polygonBounds(polygon:ScenePolygon){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [x,y]of polygon){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  return {minX,minY,maxX,maxY};
}
function pointInPolygon(polygon:ScenePolygon,x:number,y:number):boolean{
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const [a,b]=polygon[i],[c,d]=polygon[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;}
  return inside;
}

/** Douglas–Peucker on a closed ring, split at its two farthest-apart vertices so the ring stays closed. */
function simplifyRing(points:[number,number][],tolerance:number):[number,number][]{
  if(points.length<=4)return points;
  const reduce=(chain:[number,number][]):[number,number][]=>{
    const [a,b]=[chain[0],chain[chain.length-1]],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    let index=0,far=0;
    for(let i=1;i<chain.length-1;i++){
      const p=chain[i],d=length?Math.abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/length:Math.hypot(p[0]-a[0],p[1]-a[1]);
      if(d>far){far=d;index=i;}
    }
    return far>tolerance?[...reduce(chain.slice(0,index+1)).slice(0,-1),...reduce(chain.slice(index))]:[a,b];
  };
  let split=0,best=0;
  for(let i=1;i<points.length;i++){const d=Math.hypot(points[i][0]-points[0][0],points[i][1]-points[0][1]);if(d>best){best=d;split=i;}}
  const first=reduce(points.slice(0,split+1)),second=reduce([...points.slice(split),points[0]]);
  return [...first.slice(0,-1),...second.slice(0,-1)];
}

const barrierCache=new WeakMap<Ground,{width:number;height:number;polygons:ScenePolygon[]}>();
/**
 * Blocked ground as rectangles around blocked samples, merged across rows. Bridge decks are cut out and
 * their parapets added, as the features' authored surfaces say.
 */
export function groundBarriers(ground:Ground,width:number,height:number):ScenePolygon[]{
  const cached=barrierCache.get(ground);if(cached?.width===width&&cached.height===height)return cached.polygons;
  // Shores follow the half-blocked line between samples (marching squares), so a converted outline keeps its
  // place within a fraction of a cell and a narrow passage stays as wide as it was painted.
  let shape:MultiPolygon=blockedContours(ground,width,height).map(ring=>[[...simplifyRing(ring,Math.min(1.5,ground.cell*.2)),ring[0]]]).filter(polygon=>polygon[0].length>=4);
  if(shape.length)shape=polygonClipping.xor(shape[0],...shape.slice(1));
  // Then the features again, exactly: a deck is often barely wider than a walker, so its edges must be the
  // traced ones, not the sampled ones. Surfaces apply in order: masonry blocks, the deck above it opens.
  for(const surface of (ground.features??[]).flatMap(featureSurfaces)){
    const piece:[number,number][][]=[surface.polygon.map(([x,y]):[number,number]=>[x,y])];
    if(surface.blocked??terrainMaterial(surface.material)?.blocked??false)shape=polygonClipping.union(shape,piece);
    else if(shape.length)shape=polygonClipping.difference(shape,piece);
  }
  // Cut into tiles: walkers test only the barriers near them, and a small piece has few edges.
  const tiled:MultiPolygon=[];
  for(let y=0;y<height&&shape.length;y+=BARRIER_TILE)for(let x=0;x<width;x+=BARRIER_TILE){
    const tile:[number,number][][]=[[[x,y],[Math.min(width,x+BARRIER_TILE),y],[Math.min(width,x+BARRIER_TILE),Math.min(height,y+BARRIER_TILE)],[x,Math.min(height,y+BARRIER_TILE)],[x,y]]];
    tiled.push(...polygonClipping.intersection(shape,tile));
  }
  const polygons:ScenePolygon[]=[];
  for(const piece of tiled){
    if(piece.length===1){polygons.push(piece[0].slice(0,-1));continue;}
    const data=flatten(piece),indices=earcut(data.vertices,data.holes,data.dimensions);
    for(let i=0;i<indices.length;i+=3)polygons.push(indices.slice(i,i+3).map(index=>[data.vertices[index*2],data.vertices[index*2+1]] as const));
  }
  barrierCache.set(ground,{width,height,polygons});return polygons;
}

/** Shape checks for the scene schema; material ids are checked against the catalogue. */
export function groundProblem(value:unknown,width:number,height:number):string|undefined{
  if(!value||typeof value!=='object')return 'ground must be an object';
  const ground=value as Partial<Ground>;
  if(ground.version!==1)return 'ground needs version 1';
  if(!Number.isInteger(ground.cell)||ground.cell!<4||ground.cell!>32)return 'ground cell must be 4–32 world units';
  if(!Array.isArray(ground.layers)||!ground.layers.length||ground.layers.length>MAX_GROUND_LAYERS)return `ground needs 1–${MAX_GROUND_LAYERS} layers`;
  if(new Set(ground.layers).size!==ground.layers.length||ground.layers.some(id=>typeof id!=='string'||!terrainMaterial(id)))return 'ground layers must be distinct known materials';
  if(!Array.isArray(ground.weights)||ground.weights.length!==ground.layers.length||ground.weights.some(text=>typeof text!=='string'))return 'ground needs one weight grid per layer';
  const {columns,rows}=groundGrid(width,height,ground.cell!);
  try{for(const text of ground.weights)decodeWeights(text,columns*rows);}catch(error){return String((error as Error).message);}
  return undefined;
}

/** JSON with object keys in sorted order, so storage that reorders keys (PostgreSQL jsonb) hashes the same. */
function canonicalJSON(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonicalJSON).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value as object).sort().map(key=>`${JSON.stringify(key)}:${canonicalJSON((value as Record<string,unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value)??'null';
}

/**
 * Optimistic concurrency for the whole ground, including undo. The fingerprint depends on the ground's
 * content only, not on key order: the editor hashes the document it loaded, while the server hashes its
 * own copy, which may have been through the database since.
 */
export function groundFingerprint(ground:Ground|undefined|null):string{
  const text=canonicalJSON(ground??null);let a=2166136261,b=5381;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  return `${(a>>>0).toString(16)}-${(b>>>0).toString(16)}`;
}
