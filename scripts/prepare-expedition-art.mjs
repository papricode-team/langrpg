#!/usr/bin/env node
/** Export ImageGen artwork by rectangular crops. Never draws or removes backgrounds. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { expeditionArt, propFrames } from './expedition-art-plan.mjs';
const root=resolve(import.meta.dirname,'..'), sourceDir=resolve(root,'art/source/expeditions'), out=resolve(root,'web/public/assets');
await mkdir(out,{recursive:true});
const compiled=ts.transpileModule(await readFile(resolve(root,'web/src/expeditions.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const data=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const selected=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const partial=process.argv.includes('--partial');
const frameSpec=(x,y,w,h)=>({frame:{x,y,w,h},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w,h},sourceSize:{w,h}});

async function cells(path,cols,rows,registered=false){
 const image=sharp(path),meta=await image.metadata();
 if(!meta.hasAlpha)throw Error(`${path}: actual alpha required`);
 const width=Math.floor(meta.width/cols),nominalHeight=meta.height/rows,result=[];
 const whole=await sharp(path).ensureAlpha().raw().toBuffer();
 const counts=Array.from({length:meta.height},(_,y)=>{let count=0;for(let x=0;x<meta.width;x++)if(whole[(y*meta.width+x)*4+3]>128)count++;return count;});
 const rowBounds=[0];
 for(let row=1;row<rows;row++){
  const expected=Math.round(row*nominalHeight),radius=Math.min(48,Math.floor(nominalHeight*.16));let best=expected;
  for(let y=expected-radius;y<=expected+radius;y++)if(counts[y]<counts[best]||(counts[y]===counts[best]&&Math.abs(y-expected)<Math.abs(best-expected)))best=y;
  rowBounds.push(best);
 }
 rowBounds.push(meta.height);
 for(let row=0;row<rows;row++){
  const rowTop=rowBounds[row],height=rowBounds[row+1]-rowTop;
  const columnBounds=[0];
  if(!registered){
   const columnCounts=Array.from({length:meta.width},(_,x)=>{let count=0;for(let y=rowTop;y<rowBounds[row+1];y++)if(whole[(y*meta.width+x)*4+3]>128)count++;return count;});
   for(let col=1;col<cols;col++){const expected=col*width,radius=Math.min(50,Math.floor(width*.2));let best=expected;for(let x=expected-radius;x<=expected+radius;x++)if(columnCounts[x]<columnCounts[best]||(columnCounts[x]===columnCounts[best]&&Math.abs(x-expected)<Math.abs(best-expected)))best=x;columnBounds.push(best);}
  }else for(let col=1;col<cols;col++)columnBounds.push(col*width);
  columnBounds.push(meta.width);
  const rawCells=[],rawWidths=[],bounds=[];
  for(let col=0;col<cols;col++){
   const cellWidth=columnBounds[col+1]-columnBounds[col];
   const raw=await sharp(path).extract({left:columnBounds[col],top:rowTop,width:cellWidth,height}).ensureAlpha().raw().toBuffer();
   let left=cellWidth,top=height,right=-1,bottom=-1,clear=0;
   for(let y=0;y<height;y++)for(let x=0;x<cellWidth;x++){
    const alpha=raw[(y*cellWidth+x)*4+3];if(alpha===0)clear++;
    if(alpha>24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
   }
   if(right<0||clear<cellWidth*height*.015)throw Error(`${path}: row${row} col${col} not isolated transparent sprite`);
   rawCells.push(raw);rawWidths.push(cellWidth);bounds.push({left,top,right,bottom});
  }
  const shared=registered?{left:Math.min(...bounds.map(b=>b.left)),top:Math.min(...bounds.map(b=>b.top)),right:Math.max(...bounds.map(b=>b.right)),bottom:Math.max(...bounds.map(b=>b.bottom))}:undefined;
  for(let col=0;col<cols;col++){
   const b=shared??bounds[col],left=Math.max(0,b.left-2),top=Math.max(0,b.top-2),right=Math.min(rawWidths[col]-1,b.right+2),bottom=Math.min(height-1,b.bottom+2);
   const crop=await sharp(rawCells[col],{raw:{width:rawWidths[col],height,channels:4}}).extract({left,top,width:right-left+1,height:bottom-top+1}).png().toBuffer();
   result.push({row,col,buffer:crop,width:right-left+1,height:bottom-top+1});
  }
 }
 return result;
}

async function pack(id,kind,items,names){
 const width=1024,frames={},layers=[];let x=2,y=2,rowHeight=0;
 for(let i=0;i<items.length;i++){
  const item=items[i],scale=Math.min(1,280/Math.max(item.width,item.height)),w=Math.round(item.width*scale),h=Math.round(item.height*scale);
  if(x+w+2>width){x=2;y+=rowHeight+4;rowHeight=0;}
  const buffer=await sharp(item.buffer).resize(w,h).png().toBuffer();
  frames[names[i]]=frameSpec(x,y,w,h);layers.push({input:buffer,left:x,top:y});x+=w+4;rowHeight=Math.max(rowHeight,h);
 }
 const height=y+rowHeight+2;if(height>2048)throw Error(`${id}-${kind}: atlas too tall`);
 await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).webp({quality:90,alphaQuality:100,effort:4}).toFile(resolve(out,`${id}-${kind}.webp`));
 const atlas={frames,meta:{image:`${id}-${kind}.webp`,size:{w:width,h:height},scale:'1'}};
 await writeFile(resolve(out,`${id}-${kind}.json`),JSON.stringify(atlas,null,2)+'\n');return atlas;
}

if(!process.argv.includes('--previews-only')) for(const region of expeditionArt.filter(r=>!selected.length||selected.includes(r.id))){
 const id=region.id;
 async function perform(kind,fn){try{await readFile(resolve(sourceDir,`${id}-${kind}.png`));await fn();}catch(error){if(partial&&error.code==='ENOENT')return;throw error;}}
 await perform('props',async()=>{const sprites=await cells(resolve(sourceDir,`${id}-props.png`),6,4);await pack(id,'props',sprites,propFrames);});
 await perform('motions',async()=>{
  const sprites=await cells(resolve(sourceDir,`${id}-motions.png`),6,4,true),types=['motion-tree','motion-cloth','motion-lamp','motion-water'];
  const atlas=await pack(id,'motions',sprites,sprites.map(s=>`${types[s.row]}-${s.col}`));
  const assets=Object.fromEntries(types.map((name,row)=>{const f=atlas.frames[`${name}-0`].frame;return [name,{key:`${id}-motions`,frames:Array.from({length:6},(_,i)=>`${name}-${i}`),fps:row===2?3:4,width:f.w,height:f.h,referenceWidth:f.w,originX:.5,originY:1}];}));
  for(const period of ['day','night'])await writeFile(resolve(out,`${id}-${period}-animations.json`),JSON.stringify({version:1,framesPerAsset:6,terrain:`${id}-terrain`,assets},null,2)+'\n');
 });
 await perform('people',async()=>{
  const sprites=await cells(resolve(sourceDir,`${id}-people.png`),4,4,true);await pack(id,'people',sprites,sprites.map(s=>`person-${s.row}-${s.col}`));
  const portraits=[];
  for(let row=0;row<4;row++){
   const sprite=sprites[row*4],cropHeight=Math.max(1,Math.round(sprite.height*.43));
   const portrait=await sharp(sprite.buffer).extract({left:0,top:0,width:sprite.width,height:cropHeight}).resize(244,244,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
   portraits.push({input:portrait,left:row*256+6,top:6});
  }
  await sharp({create:{width:1024,height:256,channels:4,background:{r:244,g:238,b:225,alpha:1}}}).composite(portraits).webp({quality:90,effort:4}).toFile(resolve(out,`${id}-portraits.webp`));
 });
 await perform('terrain',async()=>{await sharp(resolve(sourceDir,`${id}-terrain.png`)).resize(1536,1024,{fit:'fill'}).webp({quality:89,effort:4}).toFile(resolve(out,`${id}-terrain.webp`));});
 console.log(`${id}: exported available generated terrain /24 props /24 motion frames /16 character frames`);
}

// Assemble atlas card previews from exactly the runtime foot anchors and frames.
for(const region of expeditionArt.filter(r=>!selected.length||selected.includes(r.id))){
 const id=region.id;let props,motions,terrain;
 try{props=JSON.parse(await readFile(resolve(out,`${id}-props.json`),'utf8'));motions=JSON.parse(await readFile(resolve(out,`${id}-motions.json`),'utf8'));terrain=await readFile(resolve(out,`${id}-terrain.webp`));}catch(error){if(partial&&error.code==='ENOENT')continue;throw error;}
 const placements=data.expeditionPlacements[id],images=[];
 if(!placements)throw Error(`${id}: missing authored placements`);
 for(const spec of [...placements].sort((a,b)=>(a.depth??a.y+10.5)-(b.depth??b.y+10.5))){
  const name=spec.frame??spec.asset,isMotion=name.startsWith('motion-'),atlas=isMotion?motions:props,frame=atlas.frames[isMotion?`${name}-0`:name]?.frame;
  if(!frame)throw Error(`${id}: missing ${name}`);
  const w=Math.round(spec.width),h=Math.round(frame.h*w/frame.w),left=Math.round(spec.x-w/2),top=Math.round(spec.y-h),clipX=Math.max(0,-left),clipY=Math.max(0,-top),clipW=Math.min(w-clipX,1536-Math.max(0,left)),clipH=Math.min(h-clipY,1024-Math.max(0,top));
  if(clipW<=0||clipH<=0)continue;
  let image=sharp(resolve(out,`${id}-${isMotion?'motions':'props'}.webp`)).extract({left:frame.x,top:frame.y,width:frame.w,height:frame.h}).resize(w,h);
  if(spec.flipX)image=image.flop();const buffer=await sharp(await image.png().toBuffer()).extract({left:clipX,top:clipY,width:clipW,height:clipH}).png().toBuffer();
  images.push({input:buffer,left:Math.max(0,left),top:Math.max(0,top)});
 }
 await sharp(terrain).composite(images).webp({quality:86,effort:4}).toFile(resolve(out,`${id}-preview.webp`));console.log(`${id}: preview of${placements.length} independent scenery objects`);
}
