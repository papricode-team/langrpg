#!/usr/bin/env node
/** Keep full-size editor sheets and make matching half-size runtime atlases. */
import sharp from 'sharp';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=resolve(import.meta.dirname,'../web/public/assets/player-layers');
const manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8'));
for(const {id} of manifest.assets) {
 const path=resolve(dir,`${id}.webp`),preview=resolve(dir,`${id}-preview.webp`);
 const metadata=await sharp(path).metadata();
 if(metadata.width===manifest.columns*128){await copyFile(path,preview);}
 const data=await sharp(preview).resize(manifest.columns*64,manifest.rows*96,{fit:'fill'}).webp({lossless:true}).toBuffer();
 await writeFile(path,data);
}
manifest.runtimeCell=[64,96];manifest.previewCell=[128,192];
// Separate hand/head skin masks are rebuild inputs; gameplay loads body-skin.
manifest.runtimeMemoryBytes=manifest.assets.filter(asset=>!['hands-skin','head-skin'].includes(asset.id)).length*manifest.columns*64*manifest.rows*96*4;
await writeFile(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Full-size previews and matching half-size shared runtime sprite layers saved.');
