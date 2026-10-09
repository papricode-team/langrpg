#!/usr/bin/env node
import sharp from 'sharp';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=process.cwd();
const batches=[['archive','cafe','station','workshop'],['house','greenhouse','fountain','boat'],['tree','cypress','lamp','arch'],['stall','bench','planter','sign'],['house-1','house-2','house-3','house-4'],['tree-1','tree-2','tree-3','tree-4'],['stall-1','stall-2','stall-3','stall-4'],['planter-1','planter-2','garden-1','garden-2']];
await mkdir(resolve(root,'art/animation-references'),{recursive:true});
for(const map of ['lindenhafen','waldruh','nebelstadt']){
 const atlases=await Promise.all(['props','variations'].map(async type=>({pixels:await readFile(resolve(root,`web/public/assets/${map}-${type}.webp`)),frames:JSON.parse(await readFile(resolve(root,`web/public/assets/${map}-${type}.json`),'utf8')).frames})));
 const manifest={width:1536,height:1024,columns:6,rows:4,cell:256,baseline:244,batches:[]};
 for(let batch=0;batch<batches.length;batch++){
  const images=[],entries=[];
  for(let row=0;row<4;row++){
   const name=batches[batch][row];const atlas=atlases[batch<4?0:1],rect=atlas.frames[name].frame;
   const factor=224/Math.max(rect.w,rect.h),width=Math.round(rect.w*factor),height=Math.round(rect.h*factor);
   const left=Math.round((256-width)/2),top=244-height;
   const input=await sharp(atlas.pixels).extract({left:rect.x,top:rect.y,width:rect.w,height:rect.h}).resize(width,height).png().toBuffer();
   for(let col=0;col<6;col++)images.push({input,left:col*256+left,top:row*256+top});
   entries.push({name,width,height,left,top,baseline:244});
  }
  const path=`art/animation-references/${map}-${batch}.png`;
  await sharp({create:{width:1536,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(images).png().toFile(resolve(root,path));
  manifest.batches.push({batch,path,entries});
 }
 await writeFile(resolve(root,`art/animation-references/${map}.json`),JSON.stringify(manifest,null,2)+'\n');
 console.log(`${map}: 8 registered reference grids, 32 assets, 6 cells per asset`);
}
