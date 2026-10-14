#!/usr/bin/env node
/** Pack native transparent paintings with one scale per look and a clean matte. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=resolve(import.meta.dirname,'..'),source=resolve(root,'art/source/resident-actions'),out=resolve(root,'web/public/assets/resident-actions');
const frames=['idle','read','read-turn','sit','work','work-down','serve','greet','carry','carry-left','carry-pass','carry-right'];

export function isTransparentChromaNoise(r,g,b,a){
  const brightest=Math.max(r,g,b),darkest=Math.min(r,g,b);
  return a>0&&a<=4&&brightest>=220&&darkest<=80&&brightest-darkest>=180;
}

/**
 * The native PNGs contain quantized primary colors in their almost-transparent
 * fringe (alpha 1–4/255). They are not painted cloth, skin, or hair. Clear only
 * those pixels; retain all ordinary antialiasing and every pixel above alpha 4.
 * Do this before scaling and again after compositing, which can quantize RGB in
 * very low coverage pixels. Neither operation erodes the painted silhouette.
 */
export function removeTransparentChromaNoise(rgba){
  if(rgba.length%4)throw Error('Matte cleanup requires RGBA pixels');
  const data=Buffer.from(rgba);let removedPixels=0,removedAlphaTotal=0,maxRemovedAlpha=0;
  for(let p=0;p<data.length;p+=4){
    if(!isTransparentChromaNoise(data[p],data[p+1],data[p+2],data[p+3]))continue;
    removedPixels++;removedAlphaTotal+=data[p+3];maxRemovedAlpha=Math.max(maxRemovedAlpha,data[p+3]);
    data.fill(0,p,p+4);
  }
  return {data,report:{removedPixels,removedAlphaTotal,maxRemovedAlpha}};
}

export async function prepareResidentActionArt(){
await mkdir(out,{recursive:true});
for(const look of ['anne','ella','karl','mila']){
  const input=await readFile(resolve(source,`${look}.png`)),image=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(image.info.width<1000||image.info.height<1000)throw Error(`${look}: native painting is too small`);
  const nativeMatte=removeTransparentChromaNoise(image.data);
  const prepared=await sharp(nativeMatte.data,{raw:image.info}).png().toBuffer();
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
  const scale=376/(cells[0].bounds.y1-cells[0].bounds.y0+1),composites=[],atlas={frames:{},meta:{image:`${look}.webp`,size:{w:1536,h:1728},scale:'1'}};
  if(scale>1)throw Error(`${look}: export would enlarge native artwork`);
  for(const [index,cell]of cells.entries()){
    const {bounds:b}=cell,pad=3,left=Math.max(0,b.x0-pad),top=Math.max(0,b.y0-pad),width=Math.min(cell.width,b.x1+pad+1)-left,height=Math.min(cell.height,b.y1+pad+1)-top;
    const targetWidth=Math.round(width*scale),targetHeight=Math.round(height*scale),x=Math.round(192-(cell.footX-left)*scale),y=Math.round(518.4-(cell.ground-top)*scale);
    if(x<0||y<0||x+targetWidth>384||y+targetHeight>576)throw Error(`${look}/${frames[index]}: registered figure exceeds runtime cell`);
    const buffer=await sharp(prepared).extract({left:cell.left+left,top:cell.top+top,width,height}).resize(targetWidth,targetHeight,{fit:'fill'}).png().toBuffer();
    composites.push({input:buffer,left:index%4*384+x,top:Math.floor(index/4)*576+y});
    atlas.frames[frames[index]]={frame:{x:index%4*384,y:Math.floor(index/4)*576,w:384,h:576},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:384,h:576},sourceSize:{w:384,h:576}};
    cell.registration={scale,x,y,targetWidth,targetHeight};
  }
  const composed=await sharp({create:{width:1536,height:1728,channels:4,background:'#00000000'}}).composite(composites).raw().toBuffer();
  const runtimeMatte=removeTransparentChromaNoise(composed);
  await sharp(runtimeMatte.data,{raw:{width:1536,height:1728,channels:4}}).webp({lossless:true,exact:true}).toFile(resolve(out,`${look}.webp`));
  await writeFile(resolve(out,`${look}.json`),JSON.stringify(atlas,null,2)+'\n');
  await writeFile(resolve(source,`${look}-export.json`),JSON.stringify({source:`art/source/resident-actions/${look}.png`,sourceSha256:createHash('sha256').update(input).digest('hex'),sourceSize:[image.info.width,image.info.height],runtimeSize:[1536,1728],alpha:'Normal antialiasing and all painted coverage above alpha 4/255 are preserved. Only saturated primary-color noise at alpha 1–4/255 is cleared before scaling and after compositing. Registration uses the unchanged native alpha-96 silhouette.',matte:{alphaCeiling:4,minimumBrightestChannel:220,maximumDarkestChannel:80,minimumChannelRange:180,native:nativeMatte.report,runtime:runtimeMatte.report},frames:cells.map((cell,index)=>({name:frames[index],...cell}))},null,2)+'\n');
  console.log(`${look}: 12 registered poses from ${image.info.width} × ${image.info.height}; cleaned ${nativeMatte.report.removedPixels} native matte pixels`);
}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareResidentActionArt();
