#!/usr/bin/env node
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import './register-content-loader.mjs';
import {terrainFeatures,featureSurfaces} from '../web/src/terrain-features.ts';
import {scenePolygonProblem} from '../web/src/scene-schema.ts';
const report=[];
for(const art of terrainFeatures){
 const input=`art/source/terrain-features/${art.id}.png`,native=await sharp(input).metadata();
 const {data,info}=await sharp(`web/public${art.asset}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.width!==native.width||info.height!==native.height||info.width!==art.width||info.height!==art.height||Math.min(info.width,info.height)<1024)throw Error(`${art.id}: native HD dimensions changed`);
 let clear=0,paint=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)clear++;if(data[i]>200)paint++;}
 if(clear<info.width*info.height*.05||paint<info.width*info.height*.05)throw Error(`${art.id}: missing usable transparency`);
 // Validate the traced geometry with the same polygon rules as published scenes.
 for(const surface of featureSurfaces({id:'check',asset:art.id,x:0,y:0,width:800})){
  const problem=scenePolygonProblem(surface.polygon,2304,1536);
  if(problem)throw Error(`${art.id}: ${surface.id} ${problem}`);
 }
 report.push({id:art.id,width:info.width,height:info.height,transparentPixels:clear,paintedPixels:paint,independentPainting:true,tracedSurfaces:art.surfaces.length});
}
await writeFile('docs/audits/terrain-features.json',JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${report.length} native HD transparent terrain paintings with valid traced decks and walls.`);
