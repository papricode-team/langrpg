#!/usr/bin/env node
/** Pack native transparent paintings. Preserve alpha and use one scale per look. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),source=resolve(root,'art/source/resident-actions'),out=resolve(root,'web/public/assets/resident-actions');
const frames=['idle','read','read-turn','sit','work','work-down','serve','greet','carry','carry-left','carry-pass','carry-right'];
await mkdir(out,{recursive:true});
for(const look of ['anne','ella','karl','mila']){
  const input=await readFile(resolve(source,`${look}.png`)),image=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(image.info.width<1000||image.info.height<1000)throw Error(`${look}: native painting is too small`);
  // Models retain the requested row order but can vary transparent row padding.
  // Find actual empty separators, never crop through the neighboring figure.
  const rowCuts=[0];
  for(const row of [1,2]){
    const expected=image.info.height*row/3,runs=[];let run;
    for(let y=Math.floor(expected-image.info.height*.08);y<=Math.ceil(expected+image.info.height*.08);y++){
      let count=0;for(let x=0;x<image.info.width;x++)if(image.data[(y*image.info.width+x)*4+3]>=96)count++;
      if(!count){run??={start:y,end:y};run.end=y;}else if(run){runs.push(run);run=undefined;}
    }
    if(run)runs.push(run);
    const gap=runs.sort((a,b)=>(b.end-b.start)-(a.end-a.start))[0];
    if(!gap||gap.end-gap.start<4)throw Error(`${look}: row ${row} has no transparent separator`);
    rowCuts.push(Math.round((gap.start+gap.end)/2));
  }
  rowCuts.push(image.info.height);
  const cells=[];
  for(let index=0;index<12;index++){
    const left=Math.round(index%4*image.info.width/4),top=rowCuts[Math.floor(index/4)];
    const width=Math.round((index%4+1)*image.info.width/4)-left,height=rowCuts[Math.floor(index/4)+1]-top;
    const crop=await sharp(input).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
    let x0=width,y0=height,x1=-1,y1=-1,pixels=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(crop[(y*width+x)*4+3]>=96){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);pixels++;}
    if(pixels<2000||x0<2||x1>width-3||y0<2||y1>height-3)throw Error(`${look}/${frames[index]}: missing or clipped figure`);
    let footLeft=width,footRight=0;
    for(let y=y1-8;y<=y1;y++)for(let x=0;x<width;x++)if(crop[(y*width+x)*4+3]>=96){footLeft=Math.min(footLeft,x);footRight=Math.max(footRight,x);}
    cells.push({left,top,width,height,bounds:{x0,y0,x1,y1},footX:(footLeft+footRight)/2,ground:y1,pixels});
  }
  const scale=142/(cells[0].bounds.y1-cells[0].bounds.y0+1),composites=[],atlas={frames:{},meta:{image:`${look}.webp`,size:{w:512,h:576},scale:'1'}};
  for(const [index,cell]of cells.entries()){
    const {bounds:b}=cell,pad=3,left=Math.max(0,b.x0-pad),top=Math.max(0,b.y0-pad),width=Math.min(cell.width,b.x1+pad+1)-left,height=Math.min(cell.height,b.y1+pad+1)-top;
    const targetWidth=Math.round(width*scale),targetHeight=Math.round(height*scale),x=Math.round(64-(cell.footX-left)*scale),y=Math.round(172.8-(cell.ground-top)*scale);
    if(x<0||y<0||x+targetWidth>128||y+targetHeight>192)throw Error(`${look}/${frames[index]}: registered figure exceeds runtime cell`);
    const buffer=await sharp(input).extract({left:cell.left+left,top:cell.top+top,width,height}).resize(targetWidth,targetHeight,{fit:'fill'}).png().toBuffer();
    composites.push({input:buffer,left:index%4*128+x,top:Math.floor(index/4)*192+y});
    atlas.frames[frames[index]]={frame:{x:index%4*128,y:Math.floor(index/4)*192,w:128,h:192},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:128,h:192},sourceSize:{w:128,h:192}};
    cell.registration={scale,x,y,targetWidth,targetHeight};
  }
  await sharp({create:{width:512,height:576,channels:4,background:'#00000000'}}).composite(composites).webp({lossless:true,exact:true}).toFile(resolve(out,`${look}.webp`));
  await writeFile(resolve(out,`${look}.json`),JSON.stringify(atlas,null,2)+'\n');
  await writeFile(resolve(source,`${look}-export.json`),JSON.stringify({source:`art/source/resident-actions/${look}.png`,sourceSha256:createHash('sha256').update(input).digest('hex'),sourceSize:[image.info.width,image.info.height],runtimeSize:[512,576],alpha:'Preserved; alpha threshold is used for registration bounds only.',frames:cells.map((cell,index)=>({name:frames[index],...cell}))},null,2)+'\n');
  console.log(`${look}: 12 registered poses from ${image.info.width} × ${image.info.height}`);
}
