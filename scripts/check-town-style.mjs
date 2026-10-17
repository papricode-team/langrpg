#!/usr/bin/env node
/** Offline evidence from the seed's actual ground weights and placed painted sprites.
 * No browser, game server, lighting simulation or live-world claim.
 * node scripts/check-town-style.mjs [--before /tmp/town-seed-before.json]
 */
import sharp from 'sharp';
import {readFile,writeFile,stat} from 'node:fs/promises';
import './register-content-loader.mjs';
import {scenePreviewPNG} from './world-preview.mjs';
const {groundLayers,groundWeightsAt}=await import('../web/src/ground.ts');
const {terrainMaterial}=await import('../web/src/terrain-materials.ts');
const {terrainObject}=await import('../web/src/terrain-objects.ts');
const {terrainFeature}=await import('../web/src/terrain-features.ts');
const {parseWorldSceneDocument}=await import('../web/src/scene-schema.ts');
const out='docs/audits/visual-style/town-after-',region={x:0,y:260,width:1220,height:1000},scale=1.5;
const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
const document=parseWorldSceneDocument(await readJSON('content/world-seed.json')),town=document.maps.lindenhafen;
function coverage(scene){
 const {layers,columns,rows}=groundLayers(scene.ground,scene.width,scene.height);
 const totals=scene.ground.layers.map((id,i)=>({id,share:layers[i].reduce((sum,w)=>sum+w,0)/(columns*rows*255)}));
 const water=totals.filter(x=>terrainMaterial(x.id).blocked).reduce((sum,x)=>sum+x.share,0);
 const paved=totals.filter(x=>terrainMaterial(x.id).group==='Paving').reduce((sum,x)=>sum+x.share,0);
 return {objects:scene.scenery.length,buildings:scene.scenery.filter(s=>['house','archive','cafe','workshop','station','greenhouse'].includes(s.asset)).length,materials:totals,pavedShareOfDryLand:paved/(1-water)};
}
const seedAudit={after:coverage(town)};
const manifest=await readJSON('web/public/assets/lindenhafen-day-animations.json');
const atlases=new Map();
async function frameArt(item){
 const detail=terrainObject(item.frame);
 if(detail)return {input:`web/public${detail.asset}`,width:detail.width,height:detail.height,referenceWidth:detail.width,originX:detail.originX,originY:detail.originY,ground:detail.layer==='ground'};
 const art=manifest.assets[item.frame??item.asset],key=art.base?.key??art.key,frame=art.base?.frame??art.frames[0];
 if(!atlases.has(key))atlases.set(key,await readJSON(`web/public/assets/${key}.json`));
 const atlas=atlases.get(key),rect=atlas.frames[frame].frame;
 return {input:`web/public/assets/${atlas.meta.image}`,rect:{left:rect.x,top:rect.y,width:rect.w,height:rect.h},width:rect.w,height:rect.h,referenceWidth:art.base?.referenceWidth??art.referenceWidth,originX:art.originX,originY:art.originY};
}
async function compositeTown(scene){
 const width=Math.round(region.width*scale),height=Math.round(region.height*scale),raw=Buffer.alloc(width*height*3);
 const textures=await Promise.all(scene.ground.layers.map(async id=>{
  const m=terrainMaterial(id),size=Math.max(1,Math.round(m.worldSize*scale));
  return {size,...await sharp(`web/public${m.asset}`).resize(size,size).removeAlpha().raw().toBuffer({resolveWithObject:true})};
 }));
 // Bilinear control sampling, identical material world scale; simple colour blend
 // approximates the GPU height blend without pretending to reproduce its lighting.
 groundLayers(scene.ground,scene.width,scene.height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const wx=region.x+x/scale,wy=region.y+y/scale,w=groundWeightsAt(scene.ground,scene.width,scene.height,wx,wy);
  for(let c=0;c<3;c++){let v=0;for(let i=0;i<textures.length;i++){
   const t=textures[i],tx=((Math.floor(wx*scale)%t.size)+t.size)%t.size,ty=((Math.floor(wy*scale)%t.size)+t.size)%t.size;
   v+=w[i]*t.data[(ty*t.size+tx)*3+c];
  }raw[(y*width+x)*3+c]=Math.round(v);}
 }
 const overlays=[];
 async function place(input,rect,x,y,w,h,originX,originY,flip=false){
  let pipeline=sharp(input);if(rect)pipeline=pipeline.extract(rect);if(flip)pipeline=pipeline.flop();
  let resized=await pipeline.resize(Math.max(1,w),Math.max(1,h)).png().toBuffer();
  let left=Math.round((x-region.x)*scale-w*originX),top=Math.round((y-region.y)*scale-h*originY);
  const crop={left:Math.max(0,-left),top:Math.max(0,-top),width:Math.min(w,width-left)-Math.max(0,-left),height:Math.min(h,height-top)-Math.max(0,-top)};
  if(crop.width<=0||crop.height<=0)return;
  if(crop.left||crop.top||crop.width!==w||crop.height!==h)resized=await sharp(resized).extract(crop).png().toBuffer();
  overlays.push({input:resized,left:Math.max(0,left),top:Math.max(0,top)});
 }
 for(const f of scene.ground.features??[]){const a=terrainFeature(f.asset);await place(`web/public${a.asset}`,null,f.x,f.y,Math.round(f.width*scale),Math.round(f.width*a.height/a.width*scale),0,0,f.flipX);}
 const scenery=await Promise.all(scene.scenery.map(async item=>({item,art:await frameArt(item)})));
 scenery.sort((a,b)=>(a.art.ground?-1e6:a.item.y)-(b.art.ground?-1e6:b.item.y));
 for(const {item,art}of scenery){const ratio=item.width/art.referenceWidth*scale;await place(art.input,art.rect,item.x,item.y,Math.round(art.width*ratio),Math.round(art.height*ratio),art.originX,art.originY,item.flipX);}
 return sharp(raw,{raw:{width,height,channels:3}}).composite(overlays).png().toBuffer();
}
const label=(width,text)=>Buffer.from(`<svg width="${width}" height="44"><rect width="100%" height="100%" fill="#243c32"/><text x="18" y="29" font-family="Arial" font-size="20" fill="#f2e5c2">${text}</text></svg>`);
async function labelled(buffer,text,path){const m=await sharp(buffer).metadata();await sharp({create:{width:m.width,height:m.height+44,channels:3,background:'#243c32'}}).composite([{input:label(m.width,text),left:0,top:0},{input:buffer,left:0,top:44}]).jpeg({quality:90}).toFile(path);}
await labelled(await scenePreviewPNG(town,{region,maxSize:1830}),'Lindenhafen seed — after: labelled navigation plan',out+'plan.jpg');
await labelled(await compositeTown(town),'Lindenhafen seed — offline painted composite (no game lighting / characters)',out+'painted.jpg');
const beforeIndex=process.argv.indexOf('--before');
if(beforeIndex>=0){
 const before=parseWorldSceneDocument(await readJSON(process.argv[beforeIndex+1])).maps.lindenhafen;
 const baseline=await readJSON(process.argv[beforeIndex+1]),current=await readJSON('content/world-seed.json');
 for(const id of Object.keys(current.maps).filter(id=>id!=='lindenhafen'))if(JSON.stringify(current.maps[id])!==JSON.stringify(baseline.maps[id]))throw Error(`Town outside scope changed: ${id}`);
 for(const kind of ['npcs','objects','scenery','activities','residents'])for(const item of before[kind]??[])if(!(town[kind]??[]).some(x=>x.id===item.id))throw Error(`Lost existing ${kind} identity: ${item.id}`);
 if(JSON.stringify(before.ground.features)!==JSON.stringify(town.ground.features))throw Error('Existing bridge geometry changed.');
 const water=(scene)=>{const decoded=groundLayers(scene.ground,scene.width,scene.height);return decoded.layers[scene.ground.layers.indexOf('deep-water')];};
 if(!Buffer.from(water(before)).equals(Buffer.from(water(town))))throw Error('Existing canal weights changed.');
 Object.assign(seedAudit,{before:coverage(before),otherTownsUnchanged:true,existingIdentitiesRetained:true,canalWeightsAndBridgesUnchanged:true,
  movedStoryFeet:[...town.npcs,...town.objects].filter(item=>{const old=[...before.npcs,...before.objects].find(x=>x.id===item.id);return old&&(item.x!==old.x||item.y!==old.y);}).map(item=>({id:item.id,x:item.x,y:item.y}))});
 const left=await compositeTown(before),right=await compositeTown(town),m=await sharp(left).metadata();
 await sharp({create:{width:m.width*2,height:m.height+44,channels:3,background:'#243c32'}}).composite([
  {input:label(m.width,'BEFORE composition (same current material library)'),left:0,top:0},{input:left,left:0,top:44},
  {input:label(m.width,'AFTER composition — seed, offline painted composite'),left:m.width,top:0},{input:right,left:m.width,top:44},
 ]).jpeg({quality:88}).toFile(out+'comparison.jpg');
 await labelled(await scenePreviewPNG(before,{region,maxSize:1830}),'Lindenhafen seed — before: labelled navigation plan',out+'before-plan.jpg');
}
const objects=(await readJSON('web/src/data/terrain-objects.json')).objects.filter(o=>o.id.startsWith('town-')),report=[];
for(const o of objects){
 const path=`web/public${o.asset}`,bytes=(await stat(path)).size;if(bytes>=2_000_000)throw Error(`${o.id} exceeds 2 MB`);
 const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let edge=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if((x===0||y===0||x===info.width-1||y===info.height-1)&&data[(y*info.width+x)*4+3]>8)edge++;
 if(edge)throw Error(`${o.id}: painted pixels touch image boundary (${edge})`);
 report.push({id:o.id,bytes,width:info.width,height:info.height,paintedBoundaryPixels:edge});
}
await writeFile(out+'art-check.json',JSON.stringify(report,null,2)+'\n');
await writeFile(out+'seed-audit.json',JSON.stringify(seedAudit,null,2)+'\n');
console.log(`PASS: ${objects.length} new HD scenery paintings, clean alpha gutters, under 2 MB; offline plans/composites written.`);
