#!/usr/bin/env node
import sharp from 'sharp';
import {readFile,writeFile,stat} from 'node:fs/promises';
const {objects}=JSON.parse(await readFile('web/src/data/terrain-objects.json','utf8'));
const report=[];
for(const object of objects){
 if((await stat(`web/public${object.asset}`)).size>=2_000_000)throw Error(`${object.id}: runtime object exceeds 2 MB`);
 const {data,info}=await sharp(`web/public${object.asset}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.width!==object.width||info.height!==object.height||Math.min(info.width,info.height)<1024)throw Error(`${object.id}: invalid native HD export`);
 let transparent=0,painted=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)transparent++;if(data[i]>200)painted++;}
 if(transparent<info.width*info.height*.05||painted<info.width*info.height*.05)throw Error(`${object.id}: missing usable cutout alpha`);
 report.push({id:object.id,width:info.width,height:info.height,transparentPixels:transparent,paintedPixels:painted,motion:object.motion});
}
await writeFile('docs/audits/terrain-objects.json',JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${objects.length} native HD transparent objects, ${objects.filter(o=>o.motion!=='still').length} with procedural motion.`);
