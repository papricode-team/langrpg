#!/usr/bin/env node
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
const {pieces,width,height}=JSON.parse(await readFile('web/public/assets/terrain-pieces/manifest.json','utf8'));
const borders=new Map(),report=[];
for(const piece of pieces){
 const {data,info}=await sharp(`web/public${piece.asset}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.width!==width||info.height!==height||width<1024)throw new Error(`${piece.id}: incorrect HD dimensions`);
 const edge=(side)=>Buffer.from(Array.from({length:width*4},(_,i)=>{
  const p=Math.floor(i/4),c=i%4,x=side===1||side===4?p:side===8?0:width-1,y=side===2||side===8?p:side===1?0:height-1;
  const offset=(y*width+x)*4;
  // Fully transparent RGB is undefined in WebP; compare visible color and alpha.
  return c<3&&data[offset+3]===0?0:data[offset+c];
 }));
 const signatures={};
 for(const [side,opposite] of [[1,4],[2,8],[4,1],[8,2]]){
  if(!(piece.ports&side))continue;
  const pixels=edge(side),key=`${piece.style}-${side===1||side===4?'vertical':'horizontal'}`;
  const prior=borders.get(key);let maxDifference=0;
  if(prior)for(let i=0;i<pixels.length;i++)maxDifference=Math.max(maxDifference,Math.abs(pixels[i]-prior[i]));
  else borders.set(key,pixels);
  if(maxDifference)throw new Error(`${piece.id}: connector ${side} differs from ${opposite} by ${maxDifference}`);
  signatures[side]=maxDifference;
 }
 report.push({id:piece.id,width,height,connectorMaxDifference:signatures});
}
await writeFile('docs/audits/terrain-piece-seams.json',JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${pieces.length} HD pieces; all matching connector pixels agree exactly, including alpha.`);
