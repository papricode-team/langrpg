/** Small daylight colour/material samples keep foundation dressing stable at night
 * and independent of streamed GPU terrain residency. Rebuild after terrain edits. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
const root=resolve(import.meta.dirname,'..');
const document=JSON.parse(await readFile(resolve(root,'web/src/data/world-scenes.json'),'utf8'));
const tiles={};
for(const world of Object.values(document.maps))for(const tile of world.terrain??[]){
  const source=tile.dayPreviewAsset??tile.dayAsset;
  if(tiles[source])continue;
  const width=Math.ceil(tile.width/16),height=Math.ceil(tile.height/16);
  let input=sharp(resolve(root,'web/public'+source));
  if(!tile.dayPreviewAsset&&tile.dayCrop){const c=tile.dayCrop;input=input.extract({left:c.x,top:c.y,width:c.width,height:c.height});}
  const {data,info}=await input.resize(width*4,height*4,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const samples=Buffer.alloc(width*height*5);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let red=0,green=0,blue=0,plants=0,water=0;
    for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){
      const i=((y*4+dy)*info.width+x*4+dx)*info.channels,[r,g,b]=data.subarray(i,i+3);
      red+=r;green+=g;blue+=b;
      if(g>b*1.35&&g>r*.82&&r<185)plants++;
      if(b>r*1.12&&g>r*1.08)water++;
    }
    const i=(y*width+x)*5;
    samples.set([Math.round(red/16),Math.round(green/16),Math.round(blue/16),Math.round(plants/16*255),Math.round(water/16*255)],i);
  }
  tiles[source]={width,height,pixels:samples.toString('base64')};
}
await writeFile(resolve(root,'web/src/data/foundation-terrain.json'),JSON.stringify({version:1,tiles})+'\n');
console.log(`Sampled ${Object.keys(tiles).length} daylight terrain tiles for foundation dressing.`);
