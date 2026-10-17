/** Export the authored train paintings and native-alpha furniture grid. */
import sharp from 'sharp';
import {writeFile,mkdir} from 'node:fs/promises';
const source='art/source/interiors',out='web/public/assets';
for(const room of ['train-compartment','train-dining'])await sharp(`${source}/${room}.png`).webp({quality:85,effort:6}).toFile(`${out}/interior-${room}.webp`);
await sharp('art/source/minigames/prologue/sounds-window.png').webp({quality:85,effort:6}).toFile(`${out}/minigames/prologue-sounds.webp`);
const names=['train-bench-left','train-bench-right','train-rack','train-suitcase','train-table','train-door','train-toilet-door','train-exit','train-samovar','train-tea','train-menu','train-punch','train-carriage','train-ticket-dark','train-ticket-pale','train-ticket-blank'];
const file=`${source}/train-furniture.png`,meta=await sharp(file).metadata(),frames={},assets={};
// Discard the near-transparent border pixels that carry coloured matte fringes.
const pixels = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
for (let i=0;i<pixels.data.length;i+=4) if (pixels.data[i+3]<=32) pixels.data.fill(0,i,i+4);
const clean = await sharp(pixels.data,{raw:pixels.info}).png().toBuffer();
await mkdir(`${out}/train`,{recursive:true});
for(const [index,name]of names.entries()){
 const left=Math.floor(index%4*meta.width/4),top=Math.floor(Math.floor(index/4)*meta.height/4),width=Math.floor((index%4+1)*meta.width/4)-left,height=Math.floor((Math.floor(index/4)+1)*meta.height/4)-top;
 frames[name]={frame:{x:left,y:top,w:width,h:height},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:width,h:height},sourceSize:{w:width,h:height}};
 assets[name]={key:'interior-train-furniture',frames:[name],fps:0,width,height,referenceWidth:width,originX:.5,originY:1};
 await sharp(clean).extract({left,top,width,height}).resize(256,256,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:85}).toFile(`${out}/train/${name}.webp`);
}
await sharp(clean).webp({quality:85,alphaQuality:100,effort:6}).toFile(`${out}/interior-train-furniture.webp`);
await writeFile(`${out}/interior-train-furniture.json`,JSON.stringify({frames,meta:{image:'interior-train-furniture.webp',size:{w:meta.width,h:meta.height},scale:'1'}},null,2)+'\n');
await writeFile(`${out}/interior-train-stills.json`,JSON.stringify({version:1,framesPerAsset:1,assets},null,2)+'\n');
console.log('Exported two train rooms, the sounds window and sixteen train props.');
const nounFrames={};
for(const [lexemeId,asset,lemma,article,english] of [['wagen-noun','train-carriage','Wagen','der','railway carriage'],['ausgang-noun','train-exit','Ausgang','der','exit']]){
 const name=`item-${lexemeId}`;frames[name]=frames[asset];
 nounFrames[name]={name,lexemeId,lemma,article,subject:english,kind:'noun',sheet:'train-furniture',source:file,url:`/assets/train/${asset}.webp`,atlasKey:'interior-train-furniture',atlasFrame:frames[asset].frame};
}
await writeFile(`${out}/interior-train-furniture.json`,JSON.stringify({frames,meta:{image:'interior-train-furniture.webp',size:{w:meta.width,h:meta.height},scale:'1'}},null,2)+'\n');
await writeFile('web/src/minigames/train-item-data.json',JSON.stringify(nounFrames,null,2)+'\n');
const fogSource=`${source}/train-window-fog.png`,fogMeta=await sharp(fogSource).metadata(),fogFrames={};
for(let i=0;i<4;i++){
 const w=fogMeta.width/2,h=fogMeta.height/2;
 fogFrames[`fog-${i}`]={frame:{x:(i%2)*w,y:Math.floor(i/2)*h,w,h},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w,h},sourceSize:{w,h}};
}
await sharp(fogSource).webp({quality:85,alphaQuality:100,effort:6}).toFile(`${out}/interior-train-fog.webp`);
await writeFile(`${out}/interior-train-fog.json`,JSON.stringify({frames:fogFrames,meta:{image:'interior-train-fog.webp',size:{w:fogMeta.width,h:fogMeta.height},scale:'1'}},null,2)+'\n');
await writeFile(`${out}/interior-train-effects.json`,JSON.stringify({version:1,framesPerAsset:4,assets:{fog:{key:'interior-train-fog',frames:Object.keys(fogFrames),fps:.3,width:fogMeta.width/2,height:fogMeta.height/2,referenceWidth:fogMeta.width/2,originX:.5,originY:.5}}},null,2)+'\n');

await sharp('art/source/story-cast/brandt-conductor.png').webp({quality:90,alphaQuality:100,effort:6}).toFile(`${out}/story-cast/brandt-conductor.webp`);
