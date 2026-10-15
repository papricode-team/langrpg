#!/usr/bin/env node
/** Compile exact construction masks over generated seamless materials. No separately guessed joins. */
import './register-content-loader.mjs';
import sharp from 'sharp';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const {terrainPieces,terrainPieceSurfaces}=await import('../web/src/terrain-pieces.ts');
const size=1152,density=size/256,output='web/public/assets/terrain-pieces';
await mkdir(output,{recursive:true});
const materials=new Map();
for(const piece of terrainPieces){
 const layers=[];
 for(const surface of terrainPieceSurfaces(piece.id)){
  if(!materials.has(surface.material))materials.set(surface.material,await readFile(`web/public/assets/terrain-materials/${surface.material}.webp`));
  const points=surface.polygon.map(([x,y])=>`${x*density},${y*density}`).join(' ');
  const mask=Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><polygon fill="white" points="${points}"/></svg>`);
  layers.push({input:await sharp(materials.get(surface.material)).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer()});
 }
 const path=`${output}/${piece.id}.webp`;
 await sharp({create:{width:size,height:size,channels:4,background:'#00000000'}}).composite(layers).webp({lossless:true,effort:4}).toFile(path);
 await sharp(path).resize(144,144).webp({quality:85}).toFile(`${output}/${piece.id}-thumb.webp`);
}
await writeFile(`${output}/manifest.json`,JSON.stringify({version:1,width:size,height:size,worldSize:256,connectorWidth:96,edgeWidth:12,pieces:terrainPieces},null,2)+'\n');
console.log(`Compiled ${terrainPieces.length} road and stone-bank water pieces at ${size} × ${size}.`);
