import {getWorldScene} from './scene-data';
import type {WorldMapSpec} from './maps';

/** Content map specs take their size, spawn and story anchor positions from the published scene. */
export function applyAuthoredMapPlacements(spec:WorldMapSpec):WorldMapSpec {
  const scene=getWorldScene(spec.id);
  const place=<T extends {id:string;x:number;y:number}>(values:readonly T[],positions:readonly {id:string;x:number;y:number}[]):T[]=>values.map(value=>{
    const position=positions.find(point=>point.id===value.id);
    if(!position)throw new Error(`Missing ${value.id} in canonical scene ${scene.id}`);
    return {...value,x:position.x/scene.width,y:position.y/scene.height};
  });
  return {...spec,width:scene.width,height:scene.height,spawn:{x:scene.spawn.x/scene.width,y:scene.spawn.y/scene.height},npcs:place(spec.npcs,scene.npcs),objects:place(spec.objects,scene.objects)};
}
