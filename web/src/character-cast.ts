import type { AvatarRecipe } from './character-recipe.mjs';
import data from './data/character-cast.json';

export interface CastAsset {
  key:string; image:string; sha256:string; recipeSha256:string;
}
export interface CastActor extends CastAsset {
  id:string; name:string; mapId:string|null; recipe?:AvatarRecipe;
  poses?:Record<string,CastAsset & {frameDurations:readonly number[]}>;
}
export const castActors:readonly CastActor[]=data.actors as CastActor[];
export const castCell = [data.cell[0],data.cell[1]] as const;
const byId=new Map(castActors.map(actor=>[actor.id,actor]));
export const castActor=(id:string):CastActor|undefined=>byId.get(id);
export const castActorsForMap=(mapId:string|null):readonly CastActor[]=>castActors.filter(actor=>actor.mapId===mapId);
/** Per-file versioning keeps an unchanged recipe cached across wardrobe growth. */
export const castAssetUrl=(actor:CastAsset):string=>`${actor.image}?v=${actor.sha256.slice(0,16)}`;
export const castAssets=(actor:CastActor):readonly CastAsset[]=>[actor,...Object.values(actor.poses??{})];
