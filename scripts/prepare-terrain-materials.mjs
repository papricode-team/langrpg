#!/usr/bin/env node
/**
 * Compile generated material sources into periodic game textures. Near-lossless WebP moves an
 * interior texel by at most one level and leaves the outer edge exact, so repeat seams still match
 * and every texture stays under the 2 MB asset budget.
 */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {WEBP_QUALITY} from './webp-quality.mjs';
const source='art/source/terrain-materials',output='web/public/assets/terrain-materials';
const manifest=JSON.parse(await readFile(`${source}/manifest.json`,'utf8'));
await mkdir(output,{recursive:true});
const smooth=value=>value*value*(3-2*value);
/** Wrap overlapping texels with smooth periodic weights; no mirroring or enlargement. */
export function periodicTexture(data,width,height,channels){
 const size=Math.floor(Math.min(width,height)*.92/16)*16,overlapX=width-size,overlapY=height-size;
 const out=Buffer.alloc(size*size*channels);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const wx=x<overlapX?smooth((x+.5)/overlapX):1,wy=y<overlapY?smooth((y+.5)/overlapY):1;
  const xx=x<overlapX?x+size:x,yy=y<overlapY?y+size:y;
  for(let c=0;c<channels;c++)out[(y*size+x)*channels+c]=Math.round(
   data[(y*width+x)*channels+c]*wx*wy+data[(y*width+xx)*channels+c]*(1-wx)*wy+
   data[(yy*width+x)*channels+c]*wx*(1-wy)+data[(yy*width+xx)*channels+c]*(1-wx)*(1-wy));
 }
 // Quantization guard: exact boundary texels agree after lossless decoding.
 for(let y=0;y<size;y++)for(let c=0;c<channels;c++){const a=(y*size)*channels+c,b=(y*size+size-1)*channels+c;out[a]=out[b]=Math.round((out[a]+out[b])/2);}
 for(let x=0;x<size;x++)for(let c=0;c<channels;c++){const a=x*channels+c,b=((size-1)*size+x)*channels+c;out[a]=out[b]=Math.round((out[a]+out[b])/2);}
 return {data:out,width:size,height:size,channels};
}
const materials=[];
for(const item of manifest.materials){
 const outputName=item.outputName??item.id;
 const input=`${source}/${item.source??`${item.id}.png`}`,{data,info}=await sharp(input).removeAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.width<1024||info.height<1024)throw new Error(`${item.id}: source is not high resolution`);
 const periodic=periodicTexture(data,info.width,info.height,info.channels);
 await sharp(periodic.data,{raw:periodic}).webp({nearLossless:true,quality:80,effort:6}).toFile(`${output}/${outputName}.webp`);
 await sharp(`${output}/${outputName}.webp`).resize(160,160).webp({quality: WEBP_QUALITY}).toFile(`${output}/${outputName}-thumb.webp`);
 materials.push({id:item.id,name:item.name,group:item.group,color:item.color,blocked:!!item.blocked,
  asset:`/assets/terrain-materials/${outputName}.webp`,thumbnail:`/assets/terrain-materials/${outputName}-thumb.webp`,
  width:periodic.width,height:periodic.height,sourceWidth:info.width,sourceHeight:info.height,worldSize:item.worldSize??256,repeat:'periodic-overlap',...(item.edge?{edge:item.edge}:{})});
}
await writeFile('web/src/data/terrain-materials.json',JSON.stringify({version:1,materials},null,2)+'\n');
console.log(`Exported ${materials.length} near-lossless periodic materials without mirroring or upscaling.`);
