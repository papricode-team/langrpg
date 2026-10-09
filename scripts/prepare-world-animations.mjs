#!/usr/bin/env node
/** Export ImageGen-authored animation cells with common pivots, without repainting their pixels. */
import sharp from 'sharp';
import { readFile,writeFile,mkdir,access } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=process.cwd();
const rawArgs=process.argv.slice(2);
const setIndex=rawArgs.indexOf('--set'), set=setIndex<0?'':rawArgs[setIndex+1];
if(set&&!['day','night'].includes(set))throw Error('Set must be day or night');
const batchIndex=rawArgs.indexOf('--batch'), selectedBatch=batchIndex<0?undefined:Number(rawArgs[batchIndex+1]);
if(selectedBatch!==undefined&&(!Number.isInteger(selectedBatch)||selectedBatch<0||selectedBatch>7))throw Error('Batch must be 0 through 7');
const args=rawArgs.filter((arg,index)=>arg!=='--partial'&&(setIndex<0||index!==setIndex&&index!==setIndex+1)&&(batchIndex<0||index!==batchIndex&&index!==batchIndex+1));
const partial=process.argv.includes('--partial');
const maps=args.length?args:['lindenhafen','waldruh','nebelstadt'];
for(const map of maps){
 const namespace=set?`${map}-${set}`:map;
 const refs=JSON.parse(await readFile(resolve(root,`art/animation-references/${map}.json`),'utf8'));
 const manifest=selectedBatch===undefined?{version:1,framesPerAsset:6,assets:{}}:JSON.parse(await readFile(resolve(root,`web/public/assets/${namespace}-animations.json`),'utf8'));
 if(set){try{await access(resolve(root,`web/public/assets/${namespace}-terrain.webp`));manifest.terrain=`${namespace}-terrain`}catch{}}
 await mkdir(resolve(root,'web/public/assets'),{recursive:true});
 for(const batch of refs.batches){
  if(selectedBatch!==undefined&&batch.batch!==selectedBatch)continue;
  const source=resolve(root,`art/source/${namespace}-animation-${batch.batch}.png`);
  try{await access(source)}catch(error){if(partial&&error.code==='ENOENT')continue;throw error}
  let registration;
  try{registration=JSON.parse(await readFile(resolve(root,`art/source/${namespace}-animation-${batch.batch}-registration.json`),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  const rowStarts=registration?.rowStarts??batch.rowStarts??[0,refs.cell,refs.cell*2,refs.cell*3,refs.height];
  if(rowStarts.length!==5||rowStarts[0]!==0||rowStarts[4]!==refs.height||rowStarts.some((value,index)=>!Number.isInteger(value)||index>0&&value<=rowStarts[index-1]))throw Error(`${source}: five increasing row boundaries required`);
  const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(Math.abs(info.width/info.height-1.5)>.015)throw Error(`${source}: expected6×4grid on3:2canvas, got${info.width}×${info.height}`);
  const cellW=info.width/6;
  const frames={},parts=[];let packX=2,packY=2,rowH=0;
  for(let row=0;row<4;row++){
   const ref=batch.entries[row];const bounds=[];
   const rowStart=rowStarts[row],rowEnd=rowStarts[row+1];
   // Measure native alpha only to choose rectangular bounds. Alpha is never masked.
   for(let col=0;col<6;col++){
    const x0=Math.round(col*cellW),y0=Math.round(rowStart*info.height/refs.height),w=Math.round((col+1)*cellW)-x0,h=Math.round(rowEnd*info.height/refs.height)-y0;
    let left=w,top=h,right=-1,bottom=-1,opaque=0,clear=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const alpha=data[((y0+y)*info.width+x0+x)*4+3];
     if(alpha===0)clear++;
     if(alpha>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);opaque++;}
    }
    if(opaque<100||clear<w*h*.02)throw Error(`${source}:${ref.name}/${col}: isolated alpha frame required`);
    bounds.push({x0,y0,w,h,left:Math.max(0,left-3),right:Math.min(w-1,right+3),top:Math.max(0,top-3),bottom:Math.min(h-1,bottom+3)});
   }
   // One envelope per sequence. No per-frame rescaling or independent trimming.
   const left=Math.min(...bounds.map(b=>b.left)),top=Math.min(...bounds.map(b=>b.top));
   const width=Math.max(...bounds.map(b=>b.right))-left+1,height=Math.max(...bounds.map(b=>b.bottom))-top+1;
   const baseline=Math.min(bounds[0].h-1,(row*refs.cell+ref.baseline-rowStart)*info.height/refs.height);
   const key=`${namespace}-animation-${batch.batch}`;
   const names=[];
   for(let col=0;col<6;col++){
    if(packX+width+2>1024){packX=2;packY+=rowH+4;rowH=0;}
    const b=bounds[col],name=`${ref.name}-${col}`;
    const input=await sharp(source).extract({left:b.x0+left,top:b.y0+top,width:Math.min(width,b.w-left),height:Math.min(height,b.h-top)}).extend({right:Math.max(0,width-(b.w-left)),bottom:Math.max(0,height-(b.h-top)),background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    parts.push({input,left:packX,top:packY});
    frames[name]={frame:{x:packX,y:packY,w:width,h:height},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:width,h:height},sourceSize:{w:width,h:height}};
    packX+=width+4;rowH=Math.max(rowH,height);names.push(name);
   }
   const windyFps=ref.name==='lamp'?7:ref.name.startsWith('tree')||ref.name==='cypress'?4:ref.name.startsWith('stall')||ref.name==='arch'?5:ref.name==='boat'?3:ref.name==='fountain'?6:3;
   const fps=map==='residents'?2.4:set?(ref.name==='lamp'?4:ref.name==='fountain'?3:ref.name.startsWith('stall')?2:set==='night'?1:1.5):windyFps;
   manifest.assets[ref.name]={key,frames:names,fps,width,height,referenceWidth:width,originX:(cellW/2-left)/width,originY:map==='residents'?1:Math.min(1,(baseline-top)/height)};
  }
  const atlasH=packY+rowH+2;
  if(atlasH>2048)throw Error(`${map}/${batch.batch}: atlas too high ${atlasH}`);
  await sharp({create:{width:1024,height:atlasH,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(parts).webp({quality:88,alphaQuality:100,effort:6}).toFile(resolve(root,`web/public/assets/${namespace}-animation-${batch.batch}.webp`));
  await writeFile(resolve(root,`web/public/assets/${namespace}-animation-${batch.batch}.json`),JSON.stringify({frames,meta:{image:`${namespace}-animation-${batch.batch}.webp`,size:{w:1024,h:atlasH},scale:'1'}},null,2)+'\n');
  console.log(`${map}/${batch.batch}:24paintedframes →1024×${atlasH}`);
 }
 await writeFile(resolve(root,`web/public/assets/${namespace}-animations.json`),JSON.stringify(manifest,null,2)+'\n');
 console.log(`${map}:${Object.keys(manifest.assets).length}assets×6framesready`);
}
