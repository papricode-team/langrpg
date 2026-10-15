import catalogue from './data/terrain-objects.json' with {type:'json'};
import type {SceneScenery,SceneryGeometry} from './scene-schema';
import type * as Phaser from 'phaser';
export type DetailMotion='still'|'sway'|'bob'|'glow'|'flicker';
export interface TerrainObject {
 id:string;name:string;role:SceneScenery['asset'];worldWidth:number;motion:DetailMotion;collidable:boolean;
 width:number;height:number;originX:number;originY:number;asset:string;thumbnail:string;geometry:SceneryGeometry;
}
export const terrainObjects=catalogue.objects as unknown as readonly TerrainObject[];
const lookup=new Map(terrainObjects.map(object=>[object.id,object]));
export const terrainObject=(id:string|undefined)=>id?lookup.get(id):undefined;
export const terrainObjectKey=(map:string,id:string)=>`${map}-terrain-object-${id}`;
export const terrainObjectGeometry=Object.fromEntries(terrainObjects.map(object=>[object.id,object.geometry]));
const pending=new WeakMap<Phaser.Scene,Map<string,Set<(loaded:boolean)=>void>>>();
/** A live edit may introduce artwork after the region has loaded. Coalesce scene-local requests. */
export function ensureTerrainObject(scene:Phaser.Scene,map:string,detail:TerrainObject,ready:(loaded:boolean)=>void):void{
 const key=terrainObjectKey(map,detail.id);if(scene.textures.exists(key)){ready(true);return;}
 let jobs=pending.get(scene);if(!jobs){jobs=new Map();pending.set(scene,jobs);}
 const current=jobs.get(key);if(current){current.add(ready);return;}
 const callbacks=new Set([ready]);jobs.set(key,callbacks);
 const event=`filecomplete-image-${key}`;
 const done=(loaded:boolean)=>{scene.load.off(event,complete);scene.load.off('loaderror',failed);jobs!.delete(key);for(const callback of callbacks)callback(loaded);};
 const complete=()=>done(true),failed=(file:{key:string})=>{if(file.key===key)done(false);};
 scene.load.once(event,complete);scene.load.on('loaderror',failed);scene.load.image(key,detail.asset);
 if(!scene.load.isLoading())scene.load.start();
}
/** Low-amplitude motion around the physical foot pivot; no texture churn or random frame work. */
export function sampleDetailMotion(motion:DetailMotion,id:string,time:number,reduced=false):{angle:number;y:number;alpha:number}{
 const still={angle:0,y:0,alpha:1};if(reduced||motion==='still')return still;
 let hash=2166136261;for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619);
 const phase=(hash>>>0)/4294967296*Math.PI*2;
 if(motion==='sway')return {...still,angle:Math.sin(time*1.2+phase)*.018+Math.sin(time*.41+phase)*.006};
 if(motion==='bob')return {...still,y:Math.sin(time*1.4+phase)*1.2,angle:Math.sin(time*.9+phase)*.012};
 if(motion==='glow')return {...still,alpha:.96+.04*Math.sin(time*1.8+phase)};
 return {...still,alpha:.96+.025*Math.sin(time*11+phase)+.015*Math.sin(time*17+phase)};
}
