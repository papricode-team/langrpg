#!/usr/bin/env node
/** Export native4px/unit terrain-only harbour sources without changing layout. */
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {stitchTerrainGrid} from './terrain-stitch.mjs';

const root=resolve(import.meta.dirname,'..');
const source=resolve(root,'art/source/terrain-expansion/nebelstadt');
const out=resolve(root,'web/public/assets/world-expansions/nebelstadt');
await mkdir(out,{recursive:true});
const runtime=[];
for(const chunk of ['harbour-front','harbour-supply'])for(const period of ['day','night']){
  const rows=[],sections=[];
  for(let row=0;row<2;row++){
    const strip=[];
    for(let col=0;col<2;col++){
      const file=`${chunk}-${period}-${row}-${col}.png`,path=resolve(source,file),metadata=await sharp(path).metadata();
      if(metadata.width!==1536||metadata.height!==1024)throw Error(`Harbour section ${file} must be native1536 ×1024 for384 ×256 world units`);
      // Copied edge strips give the seam solver a small blending region while
      // retaining every authored source pixel at its original world position.
      const data=await sharp(path).removeAlpha().toColourspace('srgb').extend({top:16,bottom:16,left:16,right:16,extendWith:'copy'}).raw().toBuffer();
      strip.push({width:1568,height:1056,data});
      sections.push({file,x:col*384,y:row*256,width:384,height:256,nativeWidth:1536,nativeHeight:1024,nativePixelDensity:4});
    }
    rows.push(strip);
  }
  const merged=stitchTerrainGrid(rows,32);
  const painting=sharp(merged.data,{raw:{width:merged.width,height:merged.height,channels:3}}).extract({left:16,top:16,width:3072,height:2048});
  const key=`nebelstadt-${chunk}-${period}-terrain`;
  const guarded=painting.clone().extend({top:1,bottom:1,left:1,right:1,extendWith:'copy'});
  let quality=94,buffer=await guarded.clone().webp({quality,effort:6}).toBuffer();
  while(buffer.length>2*1024*1024&&quality>70){quality-=2;buffer=await guarded.clone().webp({quality,effort:6}).toBuffer();}
  if(buffer.length>2*1024*1024)throw Error(`${key} exceeds the2MiB texture download budget`);
  await writeFile(resolve(out,`${key}.webp`),buffer);
  await painting.clone().resize(768,512).webp({quality:90,effort:6}).toFile(resolve(out,`${key}-overview.webp`));
  const record={id:chunk,period,dayOrNightAsset:`/assets/world-expansions/nebelstadt/${key}.webp`,
    previewAsset:`/assets/world-expansions/nebelstadt/${key}-overview.webp`,crop:{x:1,y:1,width:3072,height:2048},
    width:768,height:512,pixelDensity:4,nativePixelDensity:4,outputWidth:3074,outputHeight:2050,
    quality,bytes:buffer.length,terrainOnly:true,sections};
  runtime.push(record);
  console.log(`${key}: native4px/unit → guarded3074×2050, ${buffer.length}bytes`);
}
await writeFile(resolve(source,'harbour-export.json'),JSON.stringify({generator:'Codex built-in ImageGen',
  method:'Four native1536×1024 sections per768×512 world chunk;32-pixel copied seam strips; exact authored world layout; one-pixel copied runtime guard.',runtime},null,2)+'\n');
