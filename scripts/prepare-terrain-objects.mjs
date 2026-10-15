#!/usr/bin/env node
/** Keep generated alpha and native resolution; describe pivots and physical bases explicitly. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {WEBP_QUALITY} from './webp-quality.mjs';
const source='art/source/terrain-objects',output='web/public/assets/terrain-objects';
const requests=JSON.parse(await readFile(`${source}/requests.json`,'utf8'));
await mkdir(output,{recursive:true});
const objects=[];
for(const request of requests.objects){
 const input=`${source}/${request.id}.png`;
 try{await access(input);}catch{continue;}
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width,height}=info;let left=width,right=0,top=height,bottom=0,transparent=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(data[(y*width+x)*4+3]<8){transparent++;continue;}
  left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);
 }
 if(Math.min(width,height)<1024||transparent<width*height*.05)throw new Error(`${request.id}: expected native HD art with genuine transparent background`);
 await sharp(input).webp({lossless:true,effort:6}).toFile(`${output}/${request.id}.webp`);
 await sharp(input).resize(160,160,{fit:'inside',withoutEnlargement:true}).webp({quality: WEBP_QUALITY}).toFile(`${output}/${request.id}-thumb.webp`);
 const collidable=['river-rocks','barrels','crates','birdbath','firepit'].some(id=>request.id===`detail-${id}`);
 const footprint=collidable?Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4)*width*.22,-width*.04+Math.sin(i*Math.PI/4)*width*.07]):[];
 objects.push({id:request.id,name:request.name,role:request.asset,worldWidth:request.worldWidth,motion:request.motion,collidable,
  width,height,originX:.5,originY:bottom/height,
  asset:`/assets/terrain-objects/${request.id}.webp`,thumbnail:`/assets/terrain-objects/${request.id}-thumb.webp`,
  geometry:{referenceWidth:width,visualBounds:{left:left-width/2,top:top-bottom,right:right-width/2,bottom:0},footprint},
  source:`${request.id}.png`,prompt:`docs/prompts/terrain-objects/${request.id}.txt`});
}
await writeFile('web/src/data/terrain-objects.json',JSON.stringify({version:1,generator:'built-in image_gen',objects},null,2)+'\n');
console.log(`Exported ${objects.length}/${requests.objects.length} native-resolution transparent objects.`);
