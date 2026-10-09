#!/usr/bin/env node
import sharp from 'sharp';
import {readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
let sequences=0,frames=0;
let bases=0,detailFrames=0;
const dayManifests=new Map(),dayHashes=new Map();
const requested=process.argv.slice(2);
for(const map of requested.length?requested:['lindenhafen','waldruh','nebelstadt'])for(const period of ['day','night']){
 const namespace=`${map}-${period}`;
 const manifest=JSON.parse(await readFile(`web/public/assets/${namespace}-animations.json`,'utf8'));
 if(Object.keys(manifest.assets).length!==32)throw Error(`${namespace}: 32 sequences required`);
 if(period==='night'&&!manifest.terrain)throw Error(`${namespace}: painted night terrain required`);
 if(manifest.terrain)await readFile(`web/public/assets/${manifest.terrain}.webp`);
 if(period==='day')dayManifests.set(map,manifest);
 const pages=new Map();
 for(const [asset,entry] of Object.entries(manifest.assets)){
  if(period==='night'&&entry.key===dayManifests.get(map).assets[asset].key)throw Error(`${namespace}/${asset}: separate painted night sequence required`);
  if(entry.frames.length!==6||entry.referenceWidth<=0||entry.originY<0||entry.originY>1||entry.fps>4)throw Error(`${map}:badsequencegeometry`);
  if(!pages.has(entry.key)){
   const atlas=JSON.parse(await readFile(`web/public/assets/${entry.key}.json`,'utf8'));
   const pixels=await sharp(`web/public/assets/${entry.key}.webp`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   if(pixels.info.width>2048||pixels.info.height>2048)throw Error(`${entry.key}:texturebudgetexceeded`);
   pages.set(entry.key,{atlas,...pixels});
  }
  const page=pages.get(entry.key),hashes=[];
  for(const name of entry.frames){
   const rect=page.atlas.frames[name].frame;
   if(rect.w!==entry.width||rect.h!==entry.height)throw Error(`${name}:unregisteredframe`);
   const normalized=Buffer.alloc(rect.w*rect.h*4);let opaque=0,clear=0;
   for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++){
    const src=((rect.y+y)*page.info.width+rect.x+x)*4,dst=(y*rect.w+x)*4,alpha=page.data[src+3];
    for(let c=0;c<3;c++)normalized[dst+c]=Math.round(page.data[src+c]*alpha/255);
    normalized[dst+3]=alpha;if(alpha===0)clear++;if(alpha>128)opaque++;
   }
   if(opaque<30||clear<rect.w*rect.h*.01)throw Error(`${name}:nativealphaartrequired`);
   hashes.push(createHash('sha256').update(normalized).digest('hex'));frames++;
  }
  if(new Set(hashes).size<4)throw Error(`${map}:${entry.frames[0]}:paintedmotionmissing`);
  if(['archive','cafe','station','workshop','house','greenhouse','arch'].includes(asset)||asset.startsWith('house-')){
   if(!entry.base||!entry.overlays?.length)throw Error(`${namespace}/${asset}: fixed base and separate details required`);
   const baseAtlas=JSON.parse(await readFile(`web/public/assets/${entry.base.key}.json`,'utf8'));
   const baseRect=baseAtlas.frames[entry.base.frame].frame;
   if(baseRect.w!==entry.width||baseRect.h!==entry.height)throw Error(`${asset}: base geometry changed`);
   const basePixels=await sharp(`web/public/assets/${entry.base.key}.webp`).extract({left:baseRect.x,top:baseRect.y,width:baseRect.w,height:baseRect.h}).ensureAlpha().raw().toBuffer();
   for(let i=0;i<basePixels.length;i+=4)for(let c=0;c<3;c++)basePixels[i+c]=Math.round(basePixels[i+c]*basePixels[i+3]/255);
   if(createHash('sha256').update(basePixels).digest('hex')!==hashes[0])throw Error(`${asset}: base differs from the fixed first painting`);
   bases++;
   for(const detail of entry.overlays){
    if(detail.key===entry.base.key||detail.frames.length!==6||detail.referenceWidth!==entry.referenceWidth)throw Error(`${asset}: separate registered detail sheet required`);
    if(detail.width*detail.height>=entry.width*entry.height*.05)throw Error(`${asset}: detail covers architecture`);
    const left=detail.offsetX+entry.originX*entry.width-detail.width/2,top=detail.offsetY+entry.originY*entry.height-detail.height/2;
    if(left<0||top<0||left+detail.width>entry.width||top+detail.height>entry.height)throw Error(`${asset}: detail outside base`);
    const detailAtlas=JSON.parse(await readFile(`web/public/assets/${detail.key}.json`,'utf8'));
    const detailHashes=[];
    for(const name of detail.frames){
     const rect=detailAtlas.frames[name].frame;
     if(rect.w!==detail.width||rect.h!==detail.height)throw Error(`${name}: detail geometry changed`);
     const pixels=await sharp(`web/public/assets/${detail.key}.webp`).extract({left:rect.x,top:rect.y,width:rect.w,height:rect.h}).ensureAlpha().raw().toBuffer();
     if(!pixels.some((value,index)=>index%4===3&&value>0))throw Error(`${name}: empty detail`);
     // Every crop has a transparent perimeter, so frame seams cannot repaint walls.
     for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++)if((x===0||y===0||x===rect.w-1||y===rect.h-1)&&pixels[(y*rect.w+x)*4+3]!==0)throw Error(`${name}: hard detail seam`);
     detailHashes.push(createHash('sha256').update(pixels).digest('hex'));detailFrames++;
    }
    if(new Set(detailHashes).size<4)throw Error(`${asset}/${detail.id}: missing detail animation`);
   }
  }
  const identity=`${map}/${asset}`;
  if(period==='day')dayHashes.set(identity,hashes[0]);
  else if(dayHashes.get(identity)===hashes[0])throw Error(`${identity}: night artwork must differ`);
  sequences++;
 }
 console.log(`${namespace}: 32 authored sequences, 192 transparent frames verified`);
}
console.log(`${sequences} sequences, ${frames} frames verified`);
console.log(`${bases} static building bases, ${detailFrames} localized detail frames verified`);
