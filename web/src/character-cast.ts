import type { AvatarRecipe } from './character-recipe.mjs';
import data from './data/character-cast.json';

export interface CastAsset {
  key:string; image:string; atlas:string; atlasSha256:string; sha256:string; recipeSha256:string; textureBytes:number; multiAtlas?:boolean;
}
export interface CastActor extends CastAsset {
  id:string; name:string; mapId:string|null; recipe?:AvatarRecipe;
  native?:CastAsset & {cell:readonly [number,number]};
  poses?:Record<string,CastAsset & {frameDurations:readonly number[]}>;
}
export const castActors:readonly CastActor[]=data.actors as CastActor[];
export const castCell = [data.cell[0],data.cell[1]] as const;
/** Offline cast bakes keep their own pixel geometry when player art changes. */
export const CAST_ART = { width:castCell[0],height:castCell[1],bodyHeight:71*castCell[1]/96,footY:.9,worldHeight:72,cycleDistance:192*castCell[1]/96 };
const byId=new Map(castActors.map(actor=>[actor.id,actor]));
export const castActor=(id:string):CastActor|undefined=>byId.get(id);
export const castActorsForMap=(mapId:string|null):readonly CastActor[]=>castActors.filter(actor=>actor.mapId===mapId);
/** Per-file versioning keeps an unchanged recipe cached across wardrobe growth. */
export const castAssetUrl=(actor:CastAsset):string=>`${actor.image}?v=${actor.sha256.slice(0,16)}`;
export const castAtlasUrl=(actor:CastAsset):string=>`${actor.atlas}?v=${actor.atlasSha256.slice(0,16)}`;
export const castAssets=(actor:CastActor):readonly CastAsset[]=>[actor,...Object.values(actor.poses??{})];
