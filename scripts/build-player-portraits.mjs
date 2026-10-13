/** Native portrait derivatives. Never reads walking pixels except layout references. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {material} from './character-kit.mjs';
import {splitMaterials} from './character-kit-assets.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const base='art/source/player-portraits';
export function bounds(data,width,height,threshold=32){
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>threshold){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 return right<0?null:{left,top,width:right-left+1,height:bottom-top+1};
}
/** Discard isolated cell-edge slivers and extraction specks, never interior detail. */
export function cleanCell(data,width,height,largestOnly=false){
 const seen=new Uint8Array(width*height),keep=new Uint8Array(width*height);
 let largest=[];
 for(let index=0;index<seen.length;index++){
  if(seen[index]||data[index*4+3]<8)continue;
  const queue=[index];seen[index]=1;let left=width,top=height,right=0,bottom=0;
  for(let n=0;n<queue.length;n++){
   const p=queue[n],x=p%width,y=Math.floor(p/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const next=ny*width+nx;if(!seen[next]&&data[next*4+3]>=8){seen[next]=1;queue.push(next);}}
  }
  const w=right-left+1,h=bottom-top+1;
  const edgeSliver=((top<4||bottom>=height-4)&&h<height*.085&&w>30)||((left<3||right>=width-3)&&w<width*.08&&h>25);
  if(queue.length>=5&&!edgeSliver){if(queue.length>largest.length)largest=queue;if(!largestOnly)for(const p of queue)keep[p]=1;}
 }
 if(largestOnly)for(const p of largest)keep[p]=1;
 const output=Buffer.from(data);
 for(let i=0;i<keep.length;i++)if(!keep[i])output[i*4+3]=0;
 return output;
}
export function validateCoverage(catalogue,manifest){
 const all=[...catalogue.components,...Object.values(catalogue.expressions??{}).flatMap(e=>e.components)];
 for(const part of all){const entry=manifest.components[part.id];if(!entry)throw new Error(`Missing player portrait: ${part.id}`);if(entry.outsideCrop){if(!['bag','bottom','footwear','held'].includes(part.slot))throw new Error(`Visible slot omitted: ${part.id}`);}else if(!entry.materials?.length||entry.cell!==256||entry.nativeCell<256)throw new Error(`Invalid native portrait: ${part.id}`);}
 if(manifest.sourceCatalogue!==catalogue.assetVersion)throw new Error('Player portrait catalogue is stale');
}
export async function buildPlayerPortraits(){
 const layout=JSON.parse(await readFile(`${base}/layout.json`)),cat=JSON.parse(await readFile('web/src/data/character-kit.json'));
 const components={},sources=[];const files=[];
 for(const item of layout.coverage.filter(c=>!c.visible))components[item.id]={outsideCrop:true};
 for(const page of layout.pages){
  const version=page.id==='accessories-0'?'accessories-0-v2':page.id;
  const path=`${base}/candidates/${version}.png`,prompt=`${base}/prompts/${version}.txt`;
  const bytes=await readFile(path),meta=await sharp(bytes).metadata();
  if(!meta.hasAlpha||meta.width!==meta.height||meta.width<768)throw new Error(`Undersized/nontransparent native page: ${page.id}`);
  const nativeCell=Math.floor(meta.width/3),sourceHash=hash(bytes);
  sources.push({page:page.id,path,sha256:sourceHash,prompt,promptSha256:hash(await readFile(prompt)),nativeCell});
  for(const [i,part]of page.parts.entries()){
   const cell={left:Math.floor(i%3*meta.width/3),top:Math.floor(Math.floor(i/3)*meta.height/3),width:nativeCell,height:nativeCell};
   // The long braids extend into otherwise empty space above the next overlay.
   if(page.id==='hair-0'&&i===2)cell.height=Math.round(meta.height*.40);
   if(page.id==='hair-0'&&i===5){cell.top=Math.round(meta.height*.40);cell.height=Math.floor(meta.height*2/3)-cell.top;}
   // Wide sunhat extends into the empty gap before the turban.
   if(page.id==='headwear-0'&&i===6)cell.width=Math.round(meta.width*.38);
   if(page.id==='headwear-0'&&i===7){const end=cell.left+cell.width;cell.left=Math.round(meta.width*.39);cell.width=end-cell.left;}
   const source=await sharp(bytes).extract(cell).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   source.data=cleanCell(source.data,source.info.width,source.info.height,['hair','body','face','headwear'].includes(part.slot));
   const from=bounds(source.data,source.info.width,source.info.height);
   const guide=await sharp(page.reference).extract({left:i%3*384,top:Math.floor(i/3)*384,width:384,height:384}).resize(256,256).ensureAlpha().raw().toBuffer();
   const target=bounds(guide,256,256,64);
   if(!from||!target)throw new Error(`Empty authored portrait ${part.id}`);
   if(part.id==='markings-beauty-mark'){
    target.left+=Math.round((target.width-4)/2);target.top+=Math.round((target.height-4)/2);target.width=target.height=4;
   }
   if(target.width>from.width||target.height>from.height)throw new Error(`Native pixels would be enlarged: ${part.id}`);
   const extracted=await sharp(source.data,{raw:{width:source.info.width,height:source.info.height,channels:4}}).extract(from).raw().toBuffer();
   // Faces include their own full native skin silhouette; no old face pixels survive.
   const materials=[...new Set([...part.materials,...(['body','face'].includes(part.slot)?['skin']:[]),'detail'])];
   const split=splitMaterials(extracted,materials,material);
   const sheets={};
   for(const key of materials){
    const resized=await sharp(split[key],{raw:{width:from.width,height:from.height,channels:4}}).resize(target.width,target.height,{fit:'fill'}).png().toBuffer();
    const output=await sharp({create:{width:256,height:256,channels:4,background:'#00000000'}}).composite([{input:resized,left:target.left,top:target.top}]).webp({lossless:true,effort:6}).toBuffer();
    const filename=`${part.id}.${key}.webp`;files.push([filename,output]);sheets[key]={path:filename,sha256:hash(output)};
   }
   components[part.id]={cell:256,nativeCell,materials,sheets,source:page.id,sourceSha256:sourceHash,registration:{source:cell,paint:from,target},...(part.slot==='face'?{replacesBody:true}:{}),tints:part.slot==='face'?{skin:'skin'}:{}};
  }
 }
 const manifest={schemaVersion:1,sourceCatalogue:cat.assetVersion,cell:256,assetBase:'/assets/player-portraits/',components,sources};
 manifest.assetVersion=hash(JSON.stringify(manifest)).slice(0,16);validateCoverage(cat,manifest);
 await mkdir('web/public/assets/player-portraits',{recursive:true});
 for(const [name,bytes]of files)await writeFile('web/public/assets/player-portraits/'+name,bytes);
 await writeFile('web/src/data/player-portraits.json',JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({version:manifest.assetVersion,components:Object.keys(components).length,native:Object.values(components).filter(x=>!x.outsideCrop).length,sheets:files.length,bytes:files.reduce((n,[,b])=>n+b.length,0)}));
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await buildPlayerPortraits();
