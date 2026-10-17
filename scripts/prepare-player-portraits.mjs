/** Enlarged layout references only. These files are never publishable artwork. */
import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {combineMaterials,over} from '../web/src/character-compositor.mjs';
const cat=JSON.parse(await readFile('server/character-kit.json'));
const base='art/source/player-portraits';
await mkdir(`${base}/references`,{recursive:true});await mkdir(`${base}/candidates`,{recursive:true});await mkdir(`${base}/prompts`,{recursive:true});
const keyColors={primary:0x7a5a9a,secondary:0x5a9a6a,skin:0x5a9a9a,detail:0xffffff};
const all=[...cat.components,...Object.values(cat.expressions).flatMap(x=>x.components)];
const cells=new Map(), coverage=[];
for(const part of all){
 const mats=[];
 for(const mat of part.materials){const {data}=await sharp('web/public'+cat.assetBase+part.sheets[mat].editor).extract({left:0,top:0,width:128,height:192}).ensureAlpha().raw().toBuffer({resolveWithObject:true});mats.push({data,tint:keyColors[mat]});}
 const data=combineMaterials(mats);
 const raw=await sharp(Buffer.from(data),{raw:{width:128,height:192,channels:4}}).extract({left:38,top:22,width:52,height:52}).raw().toBuffer();
 const visible=raw.some((v,i)=>i%4===3&&v>8);
 coverage.push({id:part.id,slot:part.slot,build:part.build,visible});
 if(visible)cells.set(part.id,raw);
}
const groups=[['body','body'],['face','face'],['hair','hair'],['headwear','headwear'],['top','top'],['outer','outer'],['accessories','eyewear','facial-hair','markings','neck','bag','held']];
const pages=[];
for(const [name,...slots] of groups){
 const parts=all.filter(p=>slots.includes(p.slot)&&cells.has(p.id));
 for(let start=0;start<parts.length;start+=9){
  const selected=parts.slice(start,start+9), composites=[];
  for(const [i,part]of selected.entries()){
   let data=cells.get(part.id);
   if(part.slot==='face'){data=over(new Uint8ClampedArray(cells.get('body-'+part.build)),data);}
   const image=await sharp(Buffer.from(data),{raw:{width:52,height:52,channels:4}}).resize(384,384).png().toBuffer();
   composites.push({input:image,left:i%3*384,top:Math.floor(i/3)*384});
  }
  const id=`${name}-${start/9}`;
  await sharp({create:{width:1152,height:1152,channels:4,background:'#00000000'}}).composite(composites).png().toFile(`${base}/references/${id}.png`);
  pages.push({id,reference:`${base}/references/${id}.png`,cell:384,columns:3,rows:3,parts:selected.map(p=>({id:p.id,label:p.label,slot:p.slot,build:p.build,materials:p.materials,expression:p.expression??'neutral'}))});
 }
}
await writeFile(`${base}/layout.json`,JSON.stringify({sourceCatalogue:cat.assetVersion,outputCell:256,referenceCrop:{left:38,top:22,width:52,height:52},coverage,pages},null,2)+'\n');
console.log(JSON.stringify({pages:pages.map(p=>[p.id,p.parts.map(x=>x.id)]),outsideCrop:coverage.filter(c=>!c.visible).map(c=>c.id)},null,2));
