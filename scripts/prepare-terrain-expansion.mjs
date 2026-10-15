#!/usr/bin/env node
/** Review exports for newly painted 768 × 512 expansion chunks at four pixels/unit. */
import sharp from 'sharp';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {stitchTerrainGrid} from './terrain-stitch.mjs';
import {WEBP_QUALITY, MIN_WEBP_QUALITY} from './webp-quality.mjs';

const root = resolve(import.meta.dirname, '..');
const [town = 'lindenhafen', district = 'parcel-yard', period = 'day'] = process.argv.slice(2);
if (![town, district].every(value => /^[a-z][a-z0-9-]*$/.test(value)) || !['day', 'night','--references'].includes(period)) {
  throw Error('Usage: node scripts/prepare-terrain-expansion.mjs <town> <district> [day|night|--references]');
}
const source = resolve(root, 'art/source/terrain-expansion', town);
// Reviewed assets are promoted to public assets by scene authoring. Incomplete
// districts must not inflate the shipped download or be mistaken for playable land.
const out = resolve(root, 'output/terrain-expansion', town);
await mkdir(out, {recursive: true});
const prompts = JSON.parse(await readFile(resolve(source, `${district}-prompts.json`), 'utf8'));
if (prompts.sourceLogicalSize.width !== 432 || prompts.sourceLogicalSize.height !== 304
  || prompts.sourceOverlap !== 96 || prompts.pixelDensity !== 4) throw Error('Unexpected source geometry');
if(period==='--references'){
  const layout=sharp(resolve(source,prompts.layoutSource??`${district}-layout.png`));
  const metadata=await layout.metadata();
  if(Math.abs(metadata.width/metadata.height-1.5)>.01)throw Error('Reference layout must cover exactly 768 × 512 logical units');
  for(let row=0;row<2;row++)for(let col=0;col<2;col++)await layout.clone().resize(1536,1024).extract({left:col*672,top:row*416,width:864,height:608}).toFile(resolve(source,`${district}-day-${row}-${col}-reference.png`));
  console.log(`${town}/${district}: recreated four layout references; these are inputs for native paintings, not final high-resolution terrain`);
  process.exit(0);
}
const grid = [], sections = [];
for (let row = 0; row < 2; row++) {
  const strip = [];
  for (let col = 0; col < 2; col++) {
    const file = `${district}-${period}-${row}-${col}.png`, path = resolve(source, file);
    const metadata = await sharp(path).metadata();
    if (metadata.width < 1450 || metadata.height < 1000
      || Math.abs(metadata.width / metadata.height - 432 / 304) > .03) {
      throw Error(`Insufficient native detail: ${file}`);
    }
    const data = await sharp(path).resize(1728, 1216, {fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
    strip.push({width:1728, height:1216, data});
    sections.push({file, x:col * 336, y:row * 208, width:432, height:304,
      nativeSize:{width:metadata.width, height:metadata.height}});
  }
  grid.push(strip);
}
const stitched = stitchTerrainGrid(grid, 384);
if (stitched.width !== 3072 || stitched.height !== 2048) throw Error('Unexpected stitched size');
const painting = sharp(stitched.data, {raw:{width:stitched.width, height:stitched.height, channels:3}});
const guarded = painting.clone().extend({top:1,bottom:1,left:1,right:1,extendWith:'copy'});
let encoded, quality;
for (quality = WEBP_QUALITY; quality >= MIN_WEBP_QUALITY; quality--) {
  encoded = await guarded.clone().webp({quality,effort:6}).toBuffer();
  if (encoded.length <= 2 * 1024 * 1024) break;
}
if (quality < MIN_WEBP_QUALITY) throw Error('Detailed chunk exceeds 2 MiB even at the approved minimum quality');
const file = `${town}-${district}-${period}-terrain.webp`;
await writeFile(resolve(out, file), encoded);
await painting.clone().resize(768,512).webp({quality: WEBP_QUALITY,effort:6}).toFile(resolve(out,file.replace('.webp','-overview.webp')));
await writeFile(resolve(source, `${district}-${period}.json`), JSON.stringify({
  version:1, status:'review-export', generator:prompts.generator, pixelDensity:4,
  worldSize:{width:768,height:512}, outputSize:{width:3072,height:2048},
  sourceOverlap:96, sections,
  runtime:{file,width:3074,height:2050,crop:{x:1,y:1,width:3072,height:2048},quality,bytes:encoded.length},
},null,2)+'\n');
console.log(`${town}/${district}/${period}: four native sections → 3072×2048, ${(encoded.length/1024/1024).toFixed(2)} MiB, quality ${quality}; review at ${out}`);
