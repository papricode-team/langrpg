#!/usr/bin/env node
/** Painted mechanic stages and game-only character poses: deliberately independent from world walk registration. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './item-art-plan.mjs';
import {WEBP_QUALITY} from './webp-quality.mjs';
const output=resolve(projectRoot,'web/public/assets/minigames'), source='art/source/minigames/scenes/action-poses.png';
const names=['fritz-pointing','otto-watch','voss-stamping','lina-sorting','ada-filing','greta-watering'];
const stageNames=['station','market','archive','garden','clock','council','listening','workshop'];
async function exportStages(manifest) {
  for(const name of stageNames){
    const source=`art/source/minigames/scenes/${name}.png`;
    const encoded=await sharp(resolve(projectRoot,source)).resize(1920,1080,{fit:'cover'}).webp({quality:WEBP_QUALITY,effort:5}).toBuffer();
    if(encoded.length>2*1024*1024)throw Error(`${name}: stage exceeds 2 MiB`);
    await writeFile(resolve(output,`${name}.webp`),encoded);
    manifest.backdrops[name]=`/assets/minigames/${name}.webp`;
  }
  manifest.provenance.stages={tool:'Built-in image_gen',sources:stageNames.map(name=>`art/source/minigames/scenes/${name}.png`),prompts:stageNames.map(name=>`art/source/minigames/scenes/${name}.txt`),reference:'web/public/assets/minigames/workbench.webp'};
  await writeFile(resolve(output,'scene-art-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
  await writeFile(resolve(projectRoot,'web/src/minigames/scene-art-data.json'),`${JSON.stringify(manifest,null,2)}\n`);
}
if(process.argv.includes('--stages-only')){
  await exportStages(JSON.parse(await readFile(resolve(output,'scene-art-manifest.json'),'utf8')));
  console.log('Exported eight painted 16:9 mechanic stages.');
  process.exit(0);
}
await mkdir(resolve(output,'sprites'),{recursive:true});
const {data,info}=await sharp(resolve(projectRoot,source)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let clear=0;for(let pixel=0;pixel<info.width*info.height;pixel++)if(data[pixel*4+3]===0)clear++;
if(clear<info.width*info.height*.12)throw Error('Action poses require genuine native alpha');
const visited=new Uint8Array(info.width*info.height),queue=new Int32Array(info.width*info.height),groups=names.map(()=>[]);
for(let pixel=0;pixel<visited.length;pixel++){
  if(visited[pixel]||data[pixel*4+3]<=32)continue;
  let head=0,tail=1;queue[0]=pixel;visited[pixel]=1;
  let minX=info.width,minY=info.height,maxX=0,maxY=0,sumX=0,sumY=0;
  while(head<tail){
    const pos=queue[head++],x=pos%info.width,y=Math.floor(pos/info.width);
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sumX+=x;sumY+=y;
    for(const next of [x>0?pos-1:-1,x<info.width-1?pos+1:-1,y>0?pos-info.width:-1,y<info.height-1?pos+info.width:-1])if(next>=0&&!visited[next]&&data[next*4+3]>32){visited[next]=1;queue[tail++]=next;}
  }
  if(tail<32)continue;
  const index=Math.min(1,Math.floor(sumY/tail/info.height*2))*3+Math.min(2,Math.floor(sumX/tail/info.width*3));
  groups[index].push({minX,minY,maxX,maxY,area:tail});
}
const frames={},entries={},parts=[];
for(let index=0;index<names.length;index++){
  const islands=groups[index];if(!islands.length)throw Error(`Missing action pose ${names[index]}`);
  const left=Math.max(0,Math.min(...islands.map(part=>part.minX))-2),top=Math.max(0,Math.min(...islands.map(part=>part.minY))-2);
  const right=Math.min(info.width-1,Math.max(...islands.map(part=>part.maxX))+2),bottom=Math.min(info.height-1,Math.max(...islands.map(part=>part.maxY))+2),width=right-left+1,height=bottom-top+1;
  if(width>info.width/3*1.3||height>info.height/2*1.3)throw Error(`${names[index]}: merged alpha islands`);
  const cropped=await sharp(resolve(projectRoot,source)).extract({left,top,width,height}).png().toBuffer();
  const pose=await sharp(cropped).resize(240,360,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({top:12,bottom:12,left:8,right:8,background:{r:0,g:0,b:0,alpha:0}}).webp({quality: WEBP_QUALITY,alphaQuality:100,effort:5}).toBuffer();
  const portrait=await sharp(cropped).extract({left:0,top:0,width,height:Math.min(height,Math.round(height*.43))}).resize(256,256,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality: WEBP_QUALITY,alphaQuality:100,effort:5}).toBuffer();
  for(const [prefix,buffer,y,h]of [['action',pose,0,384],['portrait',portrait,384,256]]){
    const name=`${prefix}-${names[index]}`,x=index*256;await writeFile(resolve(output,`sprites/${name}.webp`),buffer);
    parts.push({input:buffer,left:x,top:y});frames[name]={frame:{x,y,w:256,h},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:256,h},sourceSize:{w:256,h},pivot:{x:.5,y:1}};
    entries[name]={name,subject:names[index],kind:'character',source,sheet:'action-poses',url:`/assets/minigames/sprites/${name}.webp`,atlasKey:'minigame-actions',atlasFrame:frames[name].frame};
  }
}
await sharp({create:{width:1536,height:640,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(parts).webp({quality: WEBP_QUALITY,alphaQuality:100,effort:5}).toFile(resolve(output,'actions.webp'));
await writeFile(resolve(output,'actions.json'),`${JSON.stringify({frames,meta:{image:'actions.webp',size:{w:1536,h:640},scale:'1'}},null,2)}\n`);
await sharp(resolve(projectRoot,'art/source/minigames/scenes/workbench.png')).resize(1536,1024,{fit:'cover'}).webp({quality: WEBP_QUALITY,effort:5}).toFile(resolve(output,'workbench.webp'));
const manifest={version:1,atlas:{key:'minigame-actions',image:'/assets/minigames/actions.webp',data:'/assets/minigames/actions.json'},backdrops:{workbench:'/assets/minigames/workbench.webp','prologue-sounds':'/assets/minigames/prologue-sounds.webp'},frames:entries,provenance:{tool:'Built-in image_gen',source,backdropSource:'art/source/minigames/scenes/workbench.png',prompts:['docs/prompts/minigames/action-poses.txt','docs/prompts/minigames/workbench.txt'],references:['art/source/characters-painted.png','web/public/assets/story-cast/inspector-portrait.webp'],worldRegistration:'unchanged; game-only action sprites'}};
await writeFile(resolve(output,'scene-art-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
await writeFile(resolve(projectRoot,'web/src/minigames/scene-art-data.json'),`${JSON.stringify(manifest,null,2)}\n`);
await exportStages(manifest);
console.log('Exported eight mechanic stages, six cast action poses, six action portraits, and Emil’s painted workbench.');
