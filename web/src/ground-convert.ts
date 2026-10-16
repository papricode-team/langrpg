/**
 * Converts the earlier terrain models into painted ground: vector surfaces ("modular terrain") are
 * sampled exactly; towns that only had painted image plates keep their water and cliff outlines over a
 * plain ground, or get a ground classified from the plate art by scripts/convert-ground.mjs.
 */
import {GROUND_CELL,MAX_GROUND_LAYERS,groundFromLayers,groundGrid,type Ground} from './ground.ts';
import {terrainMaterial} from './terrain-materials.ts';
import type {TerrainFeature} from './terrain-features.ts';
import type {ScenePolygon} from './scene-schema';

interface LegacySurface {material:string;polygon:ScenePolygon;blocked?:boolean;}
export interface LegacyModularTerrain {base:string;surfaces:LegacySurface[];features?:TerrainFeature[];}
interface LegacyHazard {kind:string;polygon:ScenePolygon;}

function contains(polygon:ScenePolygon,x:number,y:number):boolean{
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [a,b]=polygon[i],[c,d]=polygon[j];
    if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
  }
  return inside;
}
function box(polygon:ScenePolygon){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [x,y]of polygon){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  return {minX,minY,maxX,maxY};
}

const hex=(color:string)=>[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16));
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

/**
 * Weight grids from a material per sample. At most six materials survive; rarer ones join the closest
 * surviving material of the same walkability. A light blur softens the stair-steps of hard edges.
 */
export function groundFromSamples(materials:readonly string[],width:number,height:number,cell=GROUND_CELL,features?:TerrainFeature[]):Ground{
  const {columns,rows}=groundGrid(width,height,cell);
  if(materials.length!==columns*rows)throw new Error('one material per ground sample is required');
  const counts=new Map<string,number>();
  for(const material of materials)counts.set(material,(counts.get(material)??0)+1);
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([material])=>material);
  const kept=ranked.slice(0,MAX_GROUND_LAYERS),blocked=(id:string)=>terrainMaterial(id)?.blocked??false;
  const replacement=new Map(ranked.map(material=>[material,kept.includes(material)?material:kept.filter(other=>blocked(other)===blocked(material))
    .sort((a,b)=>distance(hex(terrainMaterial(a)?.color??'#000'),hex(terrainMaterial(material)?.color??'#000'))-distance(hex(terrainMaterial(b)?.color??'#000'),hex(terrainMaterial(material)?.color??'#000')))[0]??kept[0]]));
  const layers=kept.map(()=>new Float32Array(columns*rows));
  materials.forEach((material,index)=>{layers[kept.indexOf(replacement.get(material)!)][index]=255;});
  const softened=layers.map(layer=>{
    const out=new Uint8Array(layer.length);
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      let sum=0,weight=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const x=column+dx,y=row+dy;if(x<0||y<0||x>=columns||y>=rows)continue;
        const w=(dx?1:2)*(dy?1:2);sum+=layer[y*columns+x]*w;weight+=w;
      }
      out[row*columns+column]=Math.round(sum/weight);
    }
    return out;
  });
  // The blur softens edges for the eye but never moves a sample across walkability: a narrow quay or bridge
  // landing stays as walkable, and a thin wall as blocked, as it was drawn.
  const blocks=kept.map(blocked);
  for(let index=0;index<columns*rows;index++){
    const own=kept.indexOf(replacement.get(materials[index])!),total=softened.reduce((sum,layer)=>sum+layer[index],0);
    const stop=softened.reduce((sum,layer,l)=>sum+(blocks[l]?layer[index]:0),0);
    // Walkers are stopped at a 0.6 blocked share (ground.ts); keep each sample clearly on its own side.
    if(blocks[own]?stop>=.65*total:stop<=.45*total)continue;
    // Move just enough weight from the other side to the sample's own material.
    const need=blocks[own]?Math.ceil(.65*total-stop):Math.ceil(stop-.45*total);
    let moved=0;
    softened.forEach((layer,l)=>{if(blocks[l]!==blocks[own]&&moved<need){const take=Math.min(layer[index],need-moved);layer[index]-=take;moved+=take;}});
    softened[own][index]+=moved;
  }
  return groundFromLayers(kept,softened,cell,features);
}

/** Exact conversion of vector terrain: the last surface containing a sample wins, as it was drawn. */
export function groundFromModularTerrain(terrain:LegacyModularTerrain,width:number,height:number,cell=GROUND_CELL):Ground{
  const {columns,rows}=groundGrid(width,height,cell),surfaces=terrain.surfaces.map(surface=>({surface,bounds:box(surface.polygon)}));
  const materials:string[]=[];
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const x=Math.min(width,column*cell),y=Math.min(height,row*cell);
    let material=terrain.base;
    for(let i=surfaces.length-1;i>=0;i--){
      const {surface,bounds}=surfaces[i];
      if(x<bounds.minX||x>bounds.maxX||y<bounds.minY||y>bounds.maxY||!contains(surface.polygon,x,y))continue;
      material=surface.material;break;
    }
    materials.push(material);
  }
  return groundFromSamples(materials,width,height,cell,terrain.features);
}

/** Ground for a town that had only image plates: its water and cliffs over one base material. */
export function groundFromHazards(base:string,hazards:readonly LegacyHazard[],width:number,height:number,{water='deep-water',rock='cliff',cell=GROUND_CELL,sample}:{water?:string;rock?:string;cell?:number;sample?:(x:number,y:number)=>string}={}):Ground{
  const {columns,rows}=groundGrid(width,height,cell),shapes=hazards.map(hazard=>({hazard,bounds:box(hazard.polygon)}));
  const materials:string[]=[];
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const x=Math.min(width,column*cell),y=Math.min(height,row*cell);
    const hit=shapes.find(({hazard,bounds})=>x>=bounds.minX&&x<=bounds.maxX&&y>=bounds.minY&&y<=bounds.maxY&&contains(hazard.polygon,x,y))?.hazard;
    materials.push(hit?(hit.kind==='water'?water:rock):sample?.(x,y)??base);
  }
  return groundFromSamples(materials,width,height,cell);
}

/** Base ground and water by town character, for towns converted without their plate art. */
export const legacyGroundStyle:Record<string,{base:string;water:string}>={
  waldruh:{base:'forest-floor',water:'shallow-water'},
  nebelstadt:{base:'slate',water:'deep-water'},
};
