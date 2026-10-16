#!/usr/bin/env node
/** Rasterize the authored core street traces without changing terrain art. */
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {exportAuthoredWalkableMasks} from './terrain-walkable-mask.mjs';

const root=resolve(import.meta.dirname,'..');
const source=resolve(root,'art/source/terrain-detail');
const traces=JSON.parse(await readFile(resolve(source,'core-ground-traces.json'),'utf8'));
const scenes=JSON.parse(await readFile(resolve(root,'content/world-seed.json'),'utf8'));
for(const [town,trace]of Object.entries(traces.maps)){
  if(scenes.maps[town]?.navigation?.model==='clear-land'){await exportAuthoredWalkableMasks(root,town);continue;}
  const paths=trace.walkable.map(polygon=>`<polygon points="${polygon.map(p=>p.join(',')).join(' ')}" fill="white" stroke="white" stroke-width="2"/>`).join('');
  for(let y=0;y<trace.height;y+=512)for(let x=0;x<trace.width;x+=768){
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="512" viewBox="${x} ${y} 768 512"><rect x="${x}" y="${y}" width="768" height="512" fill="black"/>${paths}</svg>`;
    await sharp(Buffer.from(svg)).removeAlpha().greyscale().threshold(127).png().toFile(resolve(source,`${town}-core-${y/512}-${x/768}-walkable.png`));
  }
  await exportAuthoredWalkableMasks(root,town);
}
