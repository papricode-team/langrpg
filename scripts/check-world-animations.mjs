#!/usr/bin/env node
import sharp from 'sharp';
import {readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
let sequences=0,frames=0;
let bases=0;
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
  const building=['archive','cafe','station','workshop','house','greenhouse','arch'].includes(asset)||asset.startsWith('house-');
  if(entry.frames.length!==(building?1:6)||entry.referenceWidth<=0||entry.originY<0||entry.originY>1||entry.fps>4)throw Error(`${map}:badsequencegeometry`);
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
  if(!building&&new Set(hashes).size<4)throw Error(`${map}:${entry.frames[0]}:paintedmotionmissing`);
  if(building){
   if(!entry.base||entry.fps!==0||entry.overlays?.length)throw Error(`${namespace}/${asset}: single static base required`);
   const frame=page.atlas.frames[entry.base.frame];
   if(entry.base.key!==entry.key||entry.frames[0]!==entry.base.frame)throw Error(`${asset}: static frame mismatch`);
   if(Math.max(frame.frame.w,frame.frame.h)<400)throw Error(`${asset}: native resolution below 400px`);
   if(frame.source?.standalone&&(Object.keys(page.atlas.frames).length!==1||Math.max(frame.frame.w,frame.frame.h)<800))throw Error(`${asset}: large buildings require an individual high-resolution image`);
   if(!frame.source?.path?.startsWith('art/source/buildings/'))throw Error(`${asset}: dedicated master provenance missing`);
   const sourceMeta=await sharp(frame.source.path).metadata(),crop=frame.source.crop;
   if(!sourceMeta.hasAlpha||crop.width!==entry.width||crop.height!==entry.height||crop.left+crop.width>sourceMeta.width||crop.top+crop.height>sourceMeta.height)throw Error(`${asset}: native rectangular crop required`);
   const sourcePixels=await sharp(frame.source.path).extract(crop).ensureAlpha().raw().toBuffer();
   const runtimePixels=await sharp(`web/public/assets/${entry.key}.webp`).extract({left:frame.frame.x,top:frame.frame.y,width:frame.frame.w,height:frame.frame.h}).ensureAlpha().raw().toBuffer();
   for(let i=3;i<sourcePixels.length;i+=4)if(sourcePixels[i]!==runtimePixels[i])throw Error(`${asset}: source alpha changed`);
   bases++;
  }
  const identity=`${map}/${asset}`;
  if(period==='day')dayHashes.set(identity,hashes[0]);
  else if(dayHashes.get(identity)===hashes[0])throw Error(`${identity}: night artwork must differ`);
  sequences++;
 }
 console.log(`${namespace}: 11 static buildings, 21 animated scenery families verified`);
}
console.log(`${sequences} sequences, ${frames} frames verified`);
console.log(`${bases} high resolution static building bases verified`);
