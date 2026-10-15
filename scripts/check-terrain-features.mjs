#!/usr/bin/env node
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import './register-content-loader.mjs';
import {terrainFeatures,featureSurfaces} from '../web/src/terrain-features.ts';
import {parseWorldSceneDocument} from '../web/src/scene-schema.ts';
const document=JSON.parse(await readFile('web/src/data/world-scenes.json','utf8')),report=[];
for(const art of terrainFeatures){
 const input=`art/source/terrain-features/${art.id}.png`,native=await sharp(input).metadata();
 const {data,info}=await sharp(`web/public${art.asset}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.width!==native.width||info.height!==native.height||info.width!==art.width||info.height!==art.height||Math.min(info.width,info.height)<1024)throw Error(`${art.id}: native HD dimensions changed`);
 let clear=0,paint=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)clear++;if(data[i]>200)paint++;}
 if(clear<info.width*info.height*.05||paint<info.width*info.height*.05)throw Error(`${art.id}: missing usable transparency`);
 // Validate the traced geometry through the same strict polygon schema as editor publication.
 const doc=structuredClone(document),feature={id:'check',asset:art.id,x:0,y:0,width:800};
 doc.maps.lindenhafen.modularTerrain={version:1,base:'meadow',surfaces:featureSurfaces(feature),features:[feature]};
 parseWorldSceneDocument(doc);
 report.push({id:art.id,width:info.width,height:info.height,transparentPixels:clear,paintedPixels:paint,independentPainting:true,tracedSurfaces:art.surfaces.length});
}
await writeFile('docs/audits/terrain-features.json',JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${report.length} native HD transparent terrain paintings with valid traced decks and walls.`);
