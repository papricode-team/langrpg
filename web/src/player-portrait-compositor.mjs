import portraits from './data/player-portraits.json' with {type:'json'};
import {characterCatalogue,catalogueForExpression,resolveRecipe,recipeErrors} from './character-recipe.mjs';
import {combineMaterials,over} from './character-compositor.mjs';
export const PLAYER_PORTRAIT_SIZE=256;
export const playerPortraitVersion=portraits.assetVersion;
/** Reuse the world's visibility, occupancy, draw order and tint rules. */
export function playerPortraitPlan(recipe,expression='neutral',catalogue=characterCatalogue,art=portraits){
 const errors=recipeErrors(recipe,catalogue);if(errors.length)throw new Error(`Invalid portrait recipe: ${errors.join('; ')}`);
 if(art.sourceCatalogue!==catalogue.assetVersion)throw new Error('Player portrait art is stale');
 const selected=catalogueForExpression(recipe,expression,catalogue);
 const layers=resolveRecipe(recipe,'down',selected).layers.map(layer=>{
  const portrait=art.components[layer.id];
  if(!portrait)throw new Error(`Missing native player portrait ${layer.id}`);
  if(portrait.outsideCrop)return null;
  if(portrait.cell!==256||portrait.nativeCell<256)throw new Error(`Undersized player portrait ${layer.id}`);
  const tints={...layer.tints};
  for(const [material,key]of Object.entries(portrait.tints??{}))tints[material]=Number.parseInt((key==='skin'?recipe.skin:recipe.colors[key]).slice(1),16);
  return {...layer,materials:portrait.materials,tints,portrait};
 }).filter(Boolean);
 const hasFullFace=layers.some(layer=>layer.portrait.replacesBody);
 return layers.filter(layer=>!hasFullFace||layer.slot!=='body');
}
/** Exact 256px composition; no walking atlas, head crop or enlargement. */
export async function playerPortraitPixels(recipe,expression,load,catalogue=characterCatalogue,art=portraits){
 const layers=playerPortraitPlan(globalThis.structuredClone(recipe),expression,catalogue,art);
 const result=new Uint8ClampedArray(256*256*4);
 // Sequential layers keep transient memory bounded even for complex outfits.
 for(const layer of layers){
  const materials=[];
  for(const material of layer.materials){
   const sheet=layer.portrait.sheets[material];
   if(!sheet)throw new Error(`Missing portrait material ${layer.id}.${material}`);
   const image=await load(`${art.assetBase}${sheet.path}?v=${art.assetVersion}`,256,256);
   if(image.width!==256||image.height!==256||image.data.length!==result.length)throw new Error('Malformed player portrait pixels');
   materials.push({data:image.data,tint:layer.tints[material]??0xffffff});
  }
  over(result,combineMaterials(materials));
 }
 return {data:result,width:256,height:256};
}
