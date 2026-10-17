#!/usr/bin/env node
/** Offline style proofs, composed from real masters, never live-world data.
 * node scripts/check-terrain-style.mjs --before /path/to/saved/terrain-families
 * Without --before, refresh only the runtime size audit and repeat proof.
 */
import sharp from 'sharp';
import {readFile,writeFile,readdir,stat,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const out='docs/audits/visual-style';
const beforeIndex=process.argv.indexOf('--before');
const before=beforeIndex<0?undefined:resolve(process.argv[beforeIndex+1]);
const {features}=JSON.parse(await readFile('art/source/terrain-features/requests.json','utf8'));
const {materials}=JSON.parse(await readFile('art/source/terrain-materials/manifest.json','utf8'));
const source=(family,id,old=false)=>`${old?before:'art/source'}/${family}/${id}.png`;
const svg=(width,height,content)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content}</svg>`);
const label=(width,title,subtitle='')=>svg(width,62,`<rect width="100%" height="100%" fill="#efe5cd"/><text x="18" y="26" font-family="sans-serif" font-size="20" fill="#3c473a">${title}</text><text x="18" y="49" font-family="sans-serif" font-size="13" fill="#59634e">${subtitle}</text>`);
await mkdir(out,{recursive:true});

const budget=[];
for(const family of ['terrain-features','terrain-materials','terrain-objects']){
 const files=(await readdir(`web/public/assets/${family}`)).filter(file=>file.endsWith('.webp'));
 for(const file of files){
  const bytes=(await stat(`web/public/assets/${family}/${file}`)).size;
  if(bytes>=2_000_000)throw Error(`${family}/${file}: ${bytes} bytes exceeds 2 MB`);
  budget.push({family,file,bytes});
 }
}
await writeFile('docs/audits/terrain-style-budget.json',JSON.stringify(budget,null,2)+'\n');

async function sheet(family,ids,old,columns,size){
 const width=columns*size,rows=Math.ceil(ids.length/columns),height=rows*(size+22)+62;
 const parts=[{input:label(width,old?'Before':'After',`${family} · actual painted masters · same framing and scale`),left:0,top:0}];
 for(let i=0;i<ids.length;i++){
  const id=ids[i],left=i%columns*size,top=62+Math.floor(i/columns)*(size+22);
  parts.push({input:await sharp(source(family,id,old)).resize(size-10,size-10).png().toBuffer(),left:left+5,top:top+5});
  parts.push({input:svg(size,22,`<text x="8" y="16" font-family="sans-serif" font-size="12" fill="#f7efd9">${id}</text>`),left,top:top+size});
 }
 return sharp({create:{width,height,channels:3,background:'#89936b'}}).composite(parts).png().toBuffer();
}
async function comparison(family,ids,columns,size,name){
 const left=await sheet(family,ids,true,columns,size),right=await sheet(family,ids,false,columns,size);
 const {width,height}=await sharp(left).metadata();
 await sharp({create:{width:width*2+8,height,channels:3,background:'#efe5cd'}}).composite([{input:left,left:0,top:0},{input:right,left:width+8,top:0}]).jpeg({quality:88}).toFile(`${out}/terrain-after-${name}.jpg`);
}

async function tiled(path,width,height,tileSize){
 const tile=await sharp(path).resize(tileSize,tileSize).png().toBuffer(),parts=[];
 for(let top=0;top<height;top+=tileSize)for(let left=0;left<width;left+=tileSize)parts.push({input:tile,left,top});
 // Composite on complete tiles, then crop; sharp does not accept overlays past the canvas.
 return sharp({create:{width:Math.ceil(width/tileSize)*tileSize,height:Math.ceil(height/tileSize)*tileSize,channels:4,background:'#00000000'}}).composite(parts).extract({left:0,top:0,width,height}).png().toBuffer();
}
async function patch(old){
 const width=900,height=720;
 const grass=await tiled(source('terrain-materials','canal-grass',old),width,height,384);
 const water=await tiled(source('terrain-materials','canal-water',old),width,height,512);
 const mask=svg(width,height,'<path d="M700,-80 L890,-80 L370,840 L180,840 Z" fill="white"/>');
 const canal=await sharp(water).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
 const parts=[{input:canal,left:0,top:0}];
 const art=async(family,id,left,top,size)=>parts.push({input:await sharp(source(family,id,old)).resize(size,size).png().toBuffer(),left,top});
 await art('terrain-features','diagonal-lane',0,180,420);
 await art('terrain-features','canal-arch-bridge',360,160,430);
 const cafe=await sharp('web/public/assets/lindenhafen-day-building-cafe.webp').resize(300,340,{fit:'inside'}).png().toBuffer();
 parts.push({input:cafe,left:55,top:12});
 // Existing catalogue IDs, grouped with gaps for walking; placements are proof-only.
 for(const [id,x,y,size] of [
  ['detail-wildflowers',96,331,55],['detail-wildflowers',139,342,43],
  ['detail-grass-tuft',245,593,42],['detail-grass-tuft',278,607,36],
  ['detail-grass-tuft',223,612,30],['detail-wildflowers',203,563,52],
  ['detail-wildflowers',748,563,61],['detail-grass-tuft',798,609,48],
  ['detail-grass-tuft',769,623,35],['detail-fern',67,563,58],
  ['detail-river-rocks',43,607,76],['detail-fern',87,614,42],
 ])await art('terrain-objects',id,x,y,size);
 return sharp(grass).composite(parts).png().toBuffer();
}
if(before){
 const registration=[];
 for(const {id} of features){
  const previous=await sharp(source('terrain-features',id,true)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const current=await sharp(source('terrain-features',id)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(previous.info.width!==current.info.width||previous.info.height!==current.info.height)throw Error(`${id}: registered canvas dimensions changed`);
  let intersection=0,union=0;
  for(let index=3;index<current.data.length;index+=4){
   const a=previous.data[index]>128,b=current.data[index]>128;
   if(a&&b)intersection++;if(a||b)union++;
  }
  const overlap=intersection/union;
  if(overlap<.97)throw Error(`${id}: repaint no longer follows its registered silhouette (${overlap})`);
  registration.push({id,width:current.info.width,height:current.info.height,paintedSilhouetteIntersectionOverUnion:overlap});
 }
 await writeFile('docs/audits/terrain-style-registration.json',JSON.stringify(registration,null,2)+'\n');
 await comparison('terrain-features',features.map(item=>item.id),5,230,'features');
 await comparison('terrain-materials',[...new Set(materials.map(item=>item.source?.replace(/\.png$/,'')??item.id))],6,155,'materials');
 await comparison('terrain-objects',['detail-grass-tuft','detail-wildflowers'],2,310,'dressing');
 const left=await patch(true),right=await patch(false);
 await sharp({create:{width:1808,height:782,channels:3,background:'#efe5cd'}}).composite([
  {input:label(900,'Before','Representative offline asset composite · not a live-town screenshot'),left:0,top:0},
  {input:label(900,'After','Same café, layout and scale · warm terrain and painted dressing'),left:908,top:0},
  {input:left,left:0,top:62},{input:right,left:908,top:62},
 ]).jpeg({quality:90}).toFile(`${out}/terrain-after-lindenhafen-patch.jpg`);
}

const repeats=[];
for(const [index,id] of ['town-cobble','canal-water','canal-grass'].entries()){
 const material=materials.find(item=>item.id===id),path=`web/public/assets/terrain-materials/${material.outputName??id}.webp`;
 repeats.push({input:await tiled(path,480,480,240),left:index*488,top:62});
 repeats.push({input:label(480,id,'2 × 2 actual runtime texture repeats'),left:index*488,top:0});
}
await sharp({create:{width:1456,height:542,channels:3,background:'#efe5cd'}}).composite(repeats).jpeg({quality:90}).toFile(`${out}/terrain-after-repeat.jpg`);
console.log(`PASS: ${budget.length} terrain WebPs below 2 MB; ${before?'comparisons and ':''}runtime repeat proof exported.`);
