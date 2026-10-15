#!/usr/bin/env node
/** Preserve the core painting while adding the registered terrain bridge spur. */
import sharp from 'sharp';
import {access,mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {WEBP_QUALITY, MIN_WEBP_QUALITY} from './webp-quality.mjs';

const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'web/public/assets');
const source=resolve(root,'art/source/terrain-expansion/nebelstadt');
const archive=resolve(root,'art/archive/unused-terrain/nebelstadt');
const exists=async path=>{try{await access(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const records=[];
async function boundedWebP(painting){
  for(let quality=WEBP_QUALITY;quality>=MIN_WEBP_QUALITY;quality--){
    const buffer=await painting.clone().webp({quality,effort:6}).toBuffer();
    if(buffer.length<=2*1024*1024)return {buffer,quality};
  }
  throw Error('Harbour bridge terrain exceeds2MiB');
}
for(const period of ['day','night']){
  const path=resolve(source,`harbour-bridge-${period}-patch.png`),metadata=await sharp(path).metadata();
  if(metadata.width<504||metadata.height<500||Math.abs(metadata.width/metadata.height-504/500)>.03)throw Error(`Invalid ${period} bridge patch source dimensions`);
  const data=await sharp(path).resize(504,500,{fit:'fill'}).ensureAlpha().raw().toBuffer();
  // Keep the original source pixels at the three interior patch boundaries.
  // The east edge stays opaque: the visible deck must reach the next chunk.
  for(let y=0;y<500;y++)for(let x=0;x<504;x++)data[(y*504+x)*4+3]=Math.round(255*Math.min(1,x/12,y/12,(499-y)/12));
  const patch=await sharp(data,{raw:{width:504,height:500,channels:4}}).png().toBuffer();
  const key=`nebelstadt-${period}-terrain-detail-0-1-harbour-bridge`;
  const original=`nebelstadt-${period}-terrain-detail-0-1.webp`;
  const base=sharp(await exists(resolve(assets,original))?resolve(assets,original):resolve(archive,original));
  const painting=base.composite([{input:patch,left:2569,top:1300}]);
  const detail=await boundedWebP(painting);
  await writeFile(resolve(assets,`${key}.webp`),detail.buffer);
  const composited=await painting.clone().png().toBuffer();
  const visible=sharp(composited).extract({left:1,top:0,width:3072,height:2048});
  await visible.clone().resize(768,512).webp({quality: WEBP_QUALITY,effort:6}).toFile(resolve(assets,`${key}-overview.webp`));
  // Loading plates use the exact same world position at their own density.
  const fallbackSource=resolve(assets,`nebelstadt-${period}-terrain.webp`),fallbackMetadata=await sharp(fallbackSource).metadata();
  const density=fallbackMetadata.width/1536;
  const fallbackPatch=await sharp(patch).resize(Math.round(126*density),Math.round(125*density)).png().toBuffer();
  const fallbackKey=`nebelstadt-harbour-bridge-${period}-terrain`;
  const fallback=await boundedWebP(sharp(fallbackSource).composite([{input:fallbackPatch,left:Math.round(1410*density),top:Math.round(325*density)}]));
  await writeFile(resolve(assets,`${fallbackKey}.webp`),fallback.buffer);
  const manifestPath=resolve(assets,`nebelstadt-${period}-animations.json`),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  manifest.terrain=fallbackKey;
  const tile=manifest.terrainTiles.find(tile=>tile.x===768&&tile.y===0);
  tile.key=key;tile.crop={x:1,y:0,width:3072,height:2048};
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  // The replaced detail remains available for reproducible builds, outside the
  // shipped public directory so it cannot consume a second terrain allowance.
  await mkdir(archive,{recursive:true});
  for(const name of [original,original.replace('.webp','-overview.webp')]){
    if(await exists(resolve(assets,name)))await rename(resolve(assets,name),resolve(archive,name));
  }
  records.push({period,asset:`/assets/${key}.webp`,overview:`/assets/${key}-overview.webp`,textureKey:key,
    fallbackAsset:`/assets/${fallbackKey}.webp`,fallbackKey,crop:{x:1,y:0,width:3072,height:2048},
    nativePatchSize:{width:metadata.width,height:metadata.height},quality:detail.quality,bytes:detail.buffer.length});
  console.log(`${key}: registered bridge patch, ${detail.buffer.length}bytes`);
}
await writeFile(resolve(source,'harbour-bridge-export.json'),JSON.stringify({worldPatch:{x:1410,y:325,width:126,height:125},
  connector:[[1390,356],[1435,347],[1470,355],[1600,355],[1600,380],[1465,380],[1420,401],[1390,399]],
  method:'Only the bridge crop changes;12 texture-pixel boundary feather preserves all surrounding core pixels; same world patch applies to loading plates.',records},null,2)+'\n');
