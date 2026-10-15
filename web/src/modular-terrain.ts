import authoredNavigation from './data/world-navigation.json' with {type:'json'};
/** Editable vector geometry and material art are independent. Last surface wins. */
import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon} from 'polygon-clipping';
import earcut,{flatten} from 'earcut';
import {terrainMaterial} from './terrain-materials.ts';
import type {ScenePolygon,WorldScene} from './scene-schema';
export interface TerrainSurface {id:string;material:string;polygon:ScenePolygon;blocked?:boolean;}
export interface ModularTerrain {version:1;base:string;surfaces:TerrainSurface[];}
export function surfaceBlocks(surface:TerrainSurface):boolean{return surface.blocked??terrainMaterial(surface.material)?.blocked??false;}
const polygon=(shape:ScenePolygon):Polygon=>[shape.map(([x,y])=>[x,y])];
const cache=new WeakMap<ModularTerrain,{width:number;height:number;polygons:ScenePolygon[]}>();
/** Subtract later land/bridges from earlier water. Triangulation preserves islands/holes. */
export function modularTerrainBarriers(terrain:ModularTerrain,width:number,height:number):ScenePolygon[]{
  const cached=cache.get(terrain);if(cached?.width===width&&cached.height===height)return cached.polygons;
  let blocked:MultiPolygon=terrainMaterial(terrain.base)?.blocked?[[[[0,0],[width,0],[width,height],[0,height],[0,0]]]]:[];
  for(const surface of terrain.surfaces){
    const shape=polygon(surface.polygon);
    blocked=surfaceBlocks(surface)?polygonClipping.union(blocked,shape):blocked.length?polygonClipping.difference(blocked,shape):blocked;
  }
  const result:ScenePolygon[]=[];
  for(const shape of blocked){
    if(shape.length===1){result.push(shape[0].slice(0,-1));continue;}
    const data=flatten(shape),indices=earcut(data.vertices,data.holes,data.dimensions);
    for(let i=0;i<indices.length;i+=3)result.push(indices.slice(i,i+3).map(index=>[data.vertices[index*2],data.vertices[index*2+1]] as const));
  }
  cache.set(terrain,{width,height,polygons:result});return result;
}
export function terrainContains(polygon:ScenePolygon,x:number,y:number):boolean{
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [a,b]=polygon[i],[c,d]=polygon[j];
    if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
  }
  return inside;
}
export function surfaceAt(terrain:ModularTerrain,x:number,y:number):TerrainSurface|undefined{
  for(let i=terrain.surfaces.length-1;i>=0;i--)if(terrainContains(terrain.surfaces[i].polygon,x,y))return terrain.surfaces[i];
  return undefined;
}
/** Preserve the exact existing water/cliff outlines during conversion. */
export function editableTerrainFromScene(scene:WorldScene):ModularTerrain{
  if(scene.modularTerrain)return structuredClone(scene.modularTerrain);
  const forest=scene.id==='waldruh';
  const authored=authoredNavigation.maps[scene.id as keyof typeof authoredNavigation.maps];
  const offset=scene.legacyOffset??{x:0,y:0};
  const paths:TerrainSurface[]=(authored?.walkable??[]).map((polygon,index)=>({id:`historic-path-${index+1}`,material:forest?'earth':scene.id==='nebelstadt'?'slate':'cobble',polygon:polygon.map(([x,y])=>[x+offset.x,y+offset.y] as const)}));
  return {version:1,base:forest?'forest-floor':'meadow',surfaces:[...paths,...(scene.navigation?.terrainCollision??[]).map(hazard=>({
    id:`surface-${hazard.id}`,material:hazard.kind==='water'?(forest?'shallow-water':'deep-water'):'rock',polygon:structuredClone(hazard.polygon),blocked:true,
  }))]};
}
export function rectangleSurface(id:string,material:string,x:number,y:number,width:number,height:number):TerrainSurface{
  return {id,material,polygon:[[x,y],[x+width,y],[x+width,y+height],[x,y+height]]};
}

/** Optimistic concurrency for the whole terrain layer, including undo. */
export function terrainFingerprint(terrain:ModularTerrain|undefined|null):string{
  const text=JSON.stringify(terrain??null);let a=2166136261,b=5381;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  return `${(a>>>0).toString(16)}-${(b>>>0).toString(16)}`;
}
