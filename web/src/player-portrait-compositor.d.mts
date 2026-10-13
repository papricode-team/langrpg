import type {AvatarRecipe,CharacterCatalogue,ResolvedComponent} from './character-recipe.mjs';
import type {PixelSheet} from './character-compositor.mjs';
export const PLAYER_PORTRAIT_SIZE:256;
export const playerPortraitVersion:string;
export function playerPortraitPlan(recipe:AvatarRecipe,expression?:string,catalogue?:CharacterCatalogue,art?:unknown): (ResolvedComponent & {portrait:{replacesBody?:boolean}})[];
export function playerPortraitPixels(recipe:AvatarRecipe,expression:string,load:(url:string,width:number,height:number)=>Promise<PixelSheet>,catalogue?:CharacterCatalogue,art?:unknown):Promise<{data:Uint8ClampedArray<ArrayBuffer>;width:number;height:number}>;
