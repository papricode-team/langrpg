#!/usr/bin/env node
/** Split existing paintings into fixed architecture and small registered detail sheets. */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

// Carefully chosen interiors/attached details in the original 256px reference cells.
// Ellipses exclude window frames, masonry, roofs and the building silhouette.
const details = {
  lindenhafen: {
    archive: [[145,139,7,10],[101,150,4,9]], cafe: [[121,135,5,8],[171,125,4,7]],
    station: [[114,122,7,7],[83,171,4,8]], workshop: [[95,165,4,8],[151,185,4,7]],
    house: [[81,140,4,10],[141,145,4,9]], greenhouse: [[151,160,7,18]],
    'house-1': [[63,158,5,10]], 'house-2': [[95,133,4,9],[145,190,4,9]],
    'house-3': [[106,161,5,10],[181,182,5,11]], 'house-4': [[66,160,5,8],[190,143,4,6]],
    arch: [[102,67,4,4],[166,74,4,4]],
  },
  waldruh: {
    archive: [[94,176,3,8],[157,85,3,6]], cafe: [[120,118,3,6],[114,148,3,8]],
    station: [[92,177,4,9],[56,166,3,6]], workshop: [[129,101,8,9],[55,173,3,8]],
    house: [[154,128,5,9],[81,171,4,7]], greenhouse: [[132,87,5,7],[154,190,6,12]],
    'house-1': [[91,189,5,8]], 'house-2': [[88,135,5,8],[146,126,4,8]],
    'house-3': [[81,176,5,7]], 'house-4': [[70,169,4,6],[145,177,4,6]],
    arch: [[112,52,4,4],[182,80,4,4]],
  },
  nebelstadt: {
    archive: [[143,112,3,8],[78,161,3,8]], cafe: [[92,166,4,8],[128,70,5,5]],
    station: [[84,114,3,3],[132,170,4,5]], workshop: [[92,129,3,6],[192,146,4,8]],
    house: [[125,69,6,8],[136,127,2,4]], greenhouse: [[125,174,7,16]],
    'house-1': [[154,116,4,8],[77,174,3,7]], 'house-2': [[110,174,4,7],[176,162,3,7]],
    'house-3': [[109,131,3,4],[160,183,3,7]], 'house-4': [[78,102,3,7],[159,121,3,5]],
    arch: [[50,125,3,5],[206,128,3,5]],
  },
};

function packer() {
  const frames={}, parts=[]; let x=2,y=2,rowHeight=0;
  return {
    async add(name,input,width,height) {
      if(x+width+2>1024){x=2;y+=rowHeight+4;rowHeight=0;}
      parts.push({input,left:x,top:y});
      frames[name]={frame:{x,y,w:width,h:height},rotated:false,trimmed:false,
        spriteSourceSize:{x:0,y:0,w:width,h:height},sourceSize:{w:width,h:height}};
      x+=width+4;rowHeight=Math.max(rowHeight,height);
    },
    async save(key) {
      const height=y+rowHeight+2;
      if(height>2048)throw Error(`${key}: texture budget exceeded`);
      // Copy native RGBA directly; alpha compositing would round translucent edges.
      const pixels=Buffer.alloc(1024*height*4);
      for(const part of parts){
        const {data,info}=await sharp(part.input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        for(let row=0;row<info.height;row++)data.copy(pixels,((part.top+row)*1024+part.left)*4,row*info.width*4,(row+1)*info.width*4);
      }
      await sharp(pixels,{raw:{width:1024,height,channels:4}})
        .webp({lossless:true,effort:6}).toFile(`web/public/assets/${key}.webp`);
      await writeFile(`web/public/assets/${key}.json`,JSON.stringify({frames,meta:{image:`${key}.webp`,size:{w:1024,h:height},scale:'1'}},null,2)+'\n');
    },
  };
}

const args=process.argv.slice(2),setIndex=args.indexOf('--set');
const set=setIndex<0?undefined:args[setIndex+1];
if(set&&!['day','night'].includes(set))throw Error('Set must be day or night');
const maps=args.filter((_,index)=>setIndex<0||index!==setIndex&&index!==setIndex+1);
for(const map of maps.length?maps:Object.keys(details))for(const period of set?[set]:['day','night']){
  const namespace=`${map}-${period}`,path=`web/public/assets/${namespace}-animations.json`;
  const manifest=JSON.parse(await readFile(path)),bases=packer(),overlays=packer();
  const baseKey=`${namespace}-building-bases`,overlayKey=`${namespace}-building-details`;
  for(const [name,regions]of Object.entries(details[map])){
    const entry=manifest.assets[name],atlas=JSON.parse(await readFile(`web/public/assets/${entry.key}.json`));
    const cells=await Promise.all(entry.frames.map(async frame=>{
      const r=atlas.frames[frame].frame;
      return sharp(`web/public/assets/${entry.key}.webp`).extract({left:r.x,top:r.y,width:r.w,height:r.h}).ensureAlpha().raw().toBuffer();
    }));
    await bases.add(name,await sharp(cells[0],{raw:{width:entry.width,height:entry.height,channels:4}}).png().toBuffer(),entry.width,entry.height);
    entry.base={key:baseKey,frame:name};entry.overlays=[];
    const cellLeft=128-entry.originX*entry.width,cellTop=244-entry.originY*entry.height;
    for(const [index,[cx,cy,rx,ry]]of regions.entries()){
      const left=Math.round(cx-rx-cellLeft-1),top=Math.round(cy-ry-cellTop-1),width=rx*2+3,height=ry*2+3;
      if(left<0||top<0||left+width>entry.width||top+height>entry.height)throw Error(`${namespace}/${name}: detail outside base`);
      const frames=[];
      for(let phase=0;phase<6;phase++){
        const pixels=Buffer.alloc(width*height*4);
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          const dst=(y*width+x)*4,src=((top+y)*entry.width+left+x)*4;
          const distance=Math.hypot((x-(width-1)/2)/rx,(y-(height-1)/2)/ry);
          // Fixed soft boundary and base alpha prevent structural edges from changing.
          const mask=Math.min(1,Math.max(0,(1-distance)*4));
          cells[phase].copy(pixels,dst,src,src+3);
          pixels[dst+3]=Math.round(Math.min(cells[0][src+3],cells[phase][src+3])*mask);
        }
        const frame=`${name}-detail-${index}-${phase}`;frames.push(frame);
        await overlays.add(frame,await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer(),width,height);
      }
      entry.overlays.push({id:`detail-${index}`,key:overlayKey,frames,fps:entry.fps,width,height,
        referenceWidth:entry.referenceWidth,originX:.5,originY:.5,
        offsetX:left+width/2-entry.originX*entry.width,offsetY:top+height/2-entry.originY*entry.height});
    }
  }
  manifest.version=2;
  await bases.save(baseKey);await overlays.save(overlayKey);
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
  console.log(`${namespace}: 11 fixed bases with separate detail animations`);
}
