#!/usr/bin/env node
/** Pack native alpha, verify every authored grid cell, and refuse guessed frames. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createItemArtPlan, projectRoot } from './item-art-plan.mjs';
import {WEBP_QUALITY} from './webp-quality.mjs';

const root=projectRoot, source=resolve(root,'art/source/minigames'), output=resolve(root,'web/public/assets/minigames');
const allowMissing=process.argv.includes('--allow-missing');
const plan=await createItemArtPlan(root);
await mkdir(output,{recursive:true}); await mkdir(resolve(output,'sprites'),{recursive:true}); await mkdir(resolve(source,'masters'),{recursive:true});
const sprites=[], missing=[];
for(const sheet of plan.sheets){
  const filename=resolve(source,`${sheet.id}.png`);
  try { await access(filename); } catch {
    missing.push(...sheet.frames.map(frame=>({frame:frame.name,lexemeId:frame.lexemeId,sheet:sheet.id,reason:'source sheet not generated'})));
    continue;
  }
  const {data,info}=await sharp(filename).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==info.height || info.width<1024) throw Error(`${sheet.id}: expected square 4 × 4 sheet, at least 1024 pixels`);
  // Sheet spacing is approximate. Find connected alpha islands globally instead
  // of chopping an object that happens to cross a nominal grid boundary.
  const visited=new Uint8Array(info.width*info.height), queue=new Int32Array(info.width*info.height), islands=[];
  for(let pixel=0;pixel<visited.length;pixel++){
    if(visited[pixel] || data[pixel*4+3]<=32)continue;
    let head=0,tail=1;queue[0]=pixel;visited[pixel]=1;
    let minX=info.width,minY=info.height,maxX=0,maxY=0,sumX=0,sumY=0;
    while(head<tail){
      const pos=queue[head++],x=pos%info.width,y=Math.floor(pos/info.width);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sumX+=x;sumY+=y;
      for(const next of [x>0?pos-1:-1,x<info.width-1?pos+1:-1,y>0?pos-info.width:-1,y<info.height-1?pos+info.width:-1]){
        if(next>=0&&!visited[next]&&data[next*4+3]>32){visited[next]=1;queue[tail++]=next;}
      }
    }
    if(tail>=24)islands.push({minX,minY,maxX,maxY,area:tail,cx:sumX/tail,cy:sumY/tail});
  }
  let clear=0;for(let pixel=0;pixel<info.width*info.height;pixel++)if(data[pixel*4+3]===0)clear++;
  if(clear<info.width*info.height*.08)throw Error(`${sheet.id}: native transparent alpha required; painted backgrounds are not sprites`);
  const groups=sheet.frames.map(()=>[]);
  for(const island of islands){
    const col=Math.min(3,Math.floor(island.cx/info.width*4)),row=Math.min(3,Math.floor(island.cy/info.height*4)),index=row*4+col;
    if(groups[index])groups[index].push(island);
  }
  for(let index=0;index<sheet.frames.length;index++){
    const frame=sheet.frames[index], parts=groups[index];
    if(!parts.length || Math.max(...parts.map(part=>part.area))<info.width*info.height/16*.005)throw Error(`${sheet.id}/${frame.name}: missing alpha island`);
    const minX=Math.min(...parts.map(part=>part.minX)), minY=Math.min(...parts.map(part=>part.minY)), maxX=Math.max(...parts.map(part=>part.maxX)),maxY=Math.max(...parts.map(part=>part.maxY));
    const left=Math.max(0,minX-2), top=Math.max(0,minY-2),width=Math.min(info.width-1,maxX+2)-left+1,height=Math.min(info.height-1,maxY+2)-top+1;
    if(width>info.width/4*1.5 || height>info.height/4*1.5)throw Error(`${sheet.id}/${frame.name}: merged or misaligned alpha islands; repair source`);
    const native=await sharp(filename).extract({left,top,width,height}).png().toBuffer();
    const master=await sharp(native).resize(480,480,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({top:16,bottom:16,left:16,right:16,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    await writeFile(resolve(source,`masters/${frame.name}.png`),master);
    const buffer=await sharp(master).resize(256,256).webp({quality: WEBP_QUALITY,alphaQuality:100,effort:5}).toBuffer();
    await writeFile(resolve(output,`sprites/${frame.name}.webp`),buffer);
    sprites.push({...frame,sheet:sheet.id,source:`art/source/minigames/${sheet.id}.png`,url:`/assets/minigames/sprites/${frame.name}.webp`,buffer});
  }
}
if(missing.length&&!allowMissing)throw Error(`${missing.length} missing frames. Generate every planned source sheet, or use --allow-missing to publish an explicitly incomplete library.`);
if(!sprites.length)throw Error('No item sprites to export');
const atlasFrames={}, atlasKeys={}, atlases=[];
for(const size of [256,128]){
  const chunks=size===256?Array.from({length:Math.ceil(sprites.length/72)},(_,index)=>sprites.slice(index*72,(index+1)*72)):[sprites];
  for(let page=0;page<chunks.length;page++){
    const pageSprites=chunks[page],columns=size===256?8:16,rows=Math.ceil(pageSprites.length/columns),width=columns*size,height=rows*size,parts=[],frames={};
    for(let index=0;index<pageSprites.length;index++){
      const sprite=pageSprites[index],x=(index%columns)*size,y=Math.floor(index/columns)*size;
      parts.push({input:await sharp(sprite.buffer).resize(size,size).png().toBuffer(),left:x,top:y});
      frames[sprite.name]={frame:{x,y,w:size,h:size},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:size,h:size},sourceSize:{w:size,h:size},pivot:{x:.5,y:.5}};
    }
    const name=size===256?(page===0?'items':`items-${page+1}`):'items-128',key=page===0?'minigame-items':`minigame-items-${page+1}`;
    const encoded=await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(parts).webp({quality: WEBP_QUALITY,alphaQuality:100,effort:6}).toBuffer();
    if(encoded.length>2*1024*1024)throw Error(`${name}: atlas exceeds the 2 MiB download budget`);
    await writeFile(resolve(output,`${name}.webp`),encoded);
    await writeFile(resolve(output,`${name}.json`),`${JSON.stringify({frames,meta:{app:'glotworld prepare-item-art',image:`${name}.webp`,size:{w:width,h:height},scale:String(size/256)}},null,2)}\n`);
    if(size===256){Object.assign(atlasFrames,frames);for(const sprite of pageSprites)atlasKeys[sprite.name]=key;atlases.push({key,image:`/assets/minigames/${name}.webp`,data:`/assets/minigames/${name}.json`});}
  }
}
const frames=Object.fromEntries(sprites.map(({buffer,...sprite})=>[sprite.name,{...sprite,atlasKey:atlasKeys[sprite.name],atlasFrame:atlasFrames[sprite.name].frame}]));
const manifest={version:1,nounTarget:plan.nounCount,propTarget:plan.propCount,atlas:atlases[0].image,atlasData:atlases[0].data,atlases,atlas128:'/assets/minigames/items-128.webp',frames,missing,provenance:{mode:'built-in image_gen',prompts:'docs/prompts/minigames/',styleReferences:plan.styleReferences,nativeAlpha:true}};
await writeFile(resolve(output,'items-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
await writeFile(resolve(root,'web/src/minigames/item-data.json'),`${JSON.stringify(manifest,null,2)}\n`);
console.log(`${sprites.filter(sprite=>sprite.kind==='noun').length}/${plan.nounCount} distinct noun sprites; ${sprites.filter(sprite=>sprite.kind==='prop').length}/${plan.propCount} props; ${missing.length} missing frames. Packed 256 and 128 pixel atlases.`);
