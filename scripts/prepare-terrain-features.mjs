#!/usr/bin/env node
/** Export native painted terrain, retaining generated alpha and artist-authored geometry. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const source='art/source/terrain-features',output='web/public/assets/terrain-features';
const {features:requests}=JSON.parse(await readFile(`${source}/requests.json`,'utf8'));
const {features:geometry}=JSON.parse(await readFile(`${source}/geometry.json`,'utf8'));
await mkdir(output,{recursive:true});
const features=[];
const normalize=points=>points.map(([x,y])=>[x/100,y/100]);
for(const request of requests){
 const input=`${source}/${request.id}.png`,g=geometry[request.id],size=await sharp(input).metadata();
 if(!g||!size.hasAlpha||Math.min(size.width,size.height)<1024)throw Error(`Missing HD art or traced geometry for ${request.id}`);
 await sharp(input).webp({lossless:true,effort:6}).toFile(`${output}/${request.id}.webp`);
 await sharp(input).resize(320,320,{fit:'inside',withoutEnlargement:true}).webp({quality:90}).toFile(`${output}/${request.id}-thumb.webp`);
 const outline=normalize(g.outline),material=g.material??'cobble';
 features.push({id:request.id,name:request.id==='market-fork'?'Asymmetric market junction':request.label,category:request.category,
   width:size.width,height:size.height,worldWidth:request.width,asset:`/assets/terrain-features/${request.id}.webp`,thumbnail:`/assets/terrain-features/${request.id}-thumb.webp`,
   outline,surfaces:[...(g.raised?[{material:g.material??'slate',blocked:true,polygon:outline}]:[]),{material,blocked:false,polygon:normalize(g.deck??g.outline)}],
   source:`${request.id}.png`,prompt:`docs/prompts/terrain-features/${request.id}.txt`});
}
await writeFile('web/src/data/terrain-features.json',JSON.stringify({version:1,generator:'built-in image_gen',features},null,2)+'\n');
console.log(`Exported ${features.length} independent painted terrain pieces at native resolution.`);
