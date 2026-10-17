#!/usr/bin/env node
import sharp from 'sharp';
import {readFile,writeFile,stat} from 'node:fs/promises';
const catalogue=JSON.parse(await readFile('web/src/data/terrain-materials.json','utf8'));
const report=[];
for(const material of catalogue.materials){
 if((await stat(`web/public${material.asset}`)).size>=2_000_000)throw new Error(`${material.id}: runtime material exceeds 2 MB`);
 const {data,info}=await sharp(`web/public${material.asset}`).removeAlpha().raw().toBuffer({resolveWithObject:true});
 let horizontal=0,vertical=0;
 for(let y=0;y<info.height;y++)for(let c=0;c<info.channels;c++)horizontal=Math.max(horizontal,Math.abs(data[(y*info.width)*info.channels+c]-data[(y*info.width+info.width-1)*info.channels+c]));
 for(let x=0;x<info.width;x++)for(let c=0;c<info.channels;c++)vertical=Math.max(vertical,Math.abs(data[x*info.channels+c]-data[((info.height-1)*info.width+x)*info.channels+c]));
 if(horizontal||vertical)throw new Error(`${material.id}: repeat seam differs by ${horizontal}/${vertical}`);
 if(info.width!==material.width||info.height!==material.height||material.sourceWidth<1024||material.sourceHeight<1024)throw new Error(`${material.id}: incorrect resolution`);
 report.push({id:material.id,width:info.width,height:info.height,sourcePixelsPerWorldUnit:material.width/material.worldSize,maxHorizontalSeamDifference:horizontal,maxVerticalSeamDifference:vertical});
}
await writeFile(process.argv.find(arg=>arg.startsWith('--report='))?.slice(9)??'docs/audits/terrain-material-seams.json',JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${report.length} high-resolution materials, every decoded outer-edge pixel matches exactly in both directions.`);
