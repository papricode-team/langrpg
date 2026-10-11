#!/usr/bin/env node
/** Lightweight LOD exports share the exact cropped geometry of detailed terrain. */
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
const root = resolve(import.meta.dirname,'..');
const document = JSON.parse(await readFile(resolve(root,'web/src/data/world-scenes.json'),'utf8'));
let count=0, bytes=0;
for (const scene of Object.values(document.maps)) for (const tile of scene.terrain) {
  for (const period of ['day','night']) {
    const destination = tile[`${period}PreviewAsset`];
    if (!destination) continue;
    const asset = tile[`${period}Asset`], crop = tile[`${period}Crop`];
    if (!asset) throw new Error(`${scene.id}/${tile.id}: overview has no matching ${period} artwork`);
    let pipeline=sharp(resolve(root,'web/public',asset.slice(1)));
    if (crop) pipeline=pipeline.extract({left:crop.x,top:crop.y,width:crop.width,height:crop.height});
    const data=await pipeline.resize(tile.width,tile.height,{fit:'fill'}).webp({quality:78,effort:6}).toBuffer();
    await writeFile(resolve(root,'web/public',destination.slice(1)),data);
    count++;bytes+=data.length;
  }
}
console.log(`Exported ${count} terrain overview pieces (${(bytes/1024/1024).toFixed(2)} MiB).`);
