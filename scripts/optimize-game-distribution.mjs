#!/usr/bin/env node
/** Production package only: keep authoring plates and streamed close-up art intact. */
import sharp from 'sharp';
import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './item-art-plan.mjs';
import {WEBP_QUALITY} from './webp-quality.mjs';

export const legacyMapPlates=[
  'lindenhafen-terrain.webp','lindenhafen-night-terrain.webp',
  'waldruh-terrain.webp','waldruh-night-terrain.webp',
  'nebelstadt-terrain.webp','nebelstadt-day-terrain.webp','nebelstadt-night-terrain.webp',
];
/** Game and editor pass includeTerrain=false to both old map/animation loaders.
 * StreamedWorldTerrain selects only SceneTerrain detail and overview URLs.
 * Retaining small whole-map plates keeps the legacy URLs usable as fallbacks.
 */
export async function optimizeGameDistribution({root=projectRoot,outputDir=resolve(root,'web/dist')}={}){
  const output=resolve(outputDir),authoring=resolve(root,'web/public');
  if(output===authoring || output.startsWith(authoring+sep))throw Error('Distribution optimizer must never rewrite public authoring art');
  const scenes=JSON.parse(await readFile(resolve(root,'web/src/data/world-scenes.json'),'utf8'));
  const registered=new Set(Object.values(scenes.maps).flatMap(scene=>scene.terrain.flatMap(tile=>[tile.dayAsset,tile.nightAsset,tile.dayPreviewAsset,tile.nightPreviewAsset])).filter(Boolean));
  for(const name of legacyMapPlates)if(registered.has(`/assets/${name}`))throw Error(`Refusing to downsample registered streamed terrain: ${name}`);
  const results=[];
  for(const name of legacyMapPlates){
    const destination=resolve(output,'assets',name),before=await stat(destination),previous=await sharp(destination).metadata();
    if(previous.format==='webp'&&previous.width<=768&&previous.height<=512){results.push({asset:`/assets/${name}`,width:previous.width,height:previous.height,before:before.size,after:before.size});continue;}
    const encoded=await sharp(destination).resize(768,512,{fit:'inside',withoutEnlargement:true}).webp({quality: WEBP_QUALITY,alphaQuality:100,effort:6}).toBuffer();
    // A second packaging pass may be smaller already. Never enlarge an asset.
    if(encoded.length<before.size){await writeFile(`${destination}.tmp`,encoded);await rename(`${destination}.tmp`,destination);}
    const metadata=await sharp(destination).metadata(),after=await stat(destination);
    results.push({asset:`/assets/${name}`,width:metadata.width,height:metadata.height,before:before.size,after:after.size});
  }
  const saved=results.reduce((sum,item)=>sum+item.before-item.after,0);
  console.log(`Production art packaging: ${(saved/1024/1024).toFixed(2)} MiB saved in seven legacy whole-map plates; authoring, streamed details and overviews retained.`);
  return {saved,plates:results};
}
export function gameDistributionPlugin(root){
  let outputDir;
  return {name:'atlas-production-art',apply:'build',configResolved(config){outputDir=resolve(config.root,config.build.outDir);},async closeBundle(){await optimizeGameDistribution({root,outputDir});}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await optimizeGameDistribution();
