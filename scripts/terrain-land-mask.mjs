/** Terrain-only masks: every pixel starts as land; named hazards subtract it.
 * Object footprints are deliberately absent so moving a prop never leaves a wall. */
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';

export async function exportClearLandMasks(root,scene){
  if(scene.navigation?.model!=='clear-land')throw Error(`${scene.id}: expected clear-land navigation`);
  const source=resolve(root,'art/source/terrain-detail'),output=resolve(root,'web/public/assets/walkable-masks');
  await Promise.all([mkdir(source,{recursive:true}),mkdir(output,{recursive:true})]);
  const hazards=scene.navigation.terrainCollision.map(hazard=>`<polygon points="${hazard.polygon.map(point=>point.join(',')).join(' ')}" fill="black"/>`).join('');
  const tiles=[];
  for(const tile of scene.terrain){
    const file=`${scene.id}-${tile.id}.png`,sourcePath=resolve(source,`${scene.id}-${tile.id}-walkable.png`);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${tile.width}" height="${tile.height}" viewBox="${tile.x} ${tile.y} ${tile.width} ${tile.height}"><rect x="${tile.x}" y="${tile.y}" width="${tile.width}" height="${tile.height}" fill="white"/>${hazards}</svg>`;
    const bytes=await sharp(Buffer.from(svg)).removeAlpha().greyscale().threshold(127).png().toBuffer();
    await writeFile(sourcePath,bytes);await writeFile(resolve(output,file),bytes);
    tile.walkableMaskAsset=`/assets/walkable-masks/${file}`;
    tiles.push({id:tile.id,x:tile.x,y:tile.y,width:tile.width,height:tile.height,pixelDensity:1,asset:tile.walkableMaskAsset,source:relative(root,sourcePath)});
  }
  await writeFile(resolve(source,`${scene.id}-walkable-masks.json`),JSON.stringify({version:2,town:scene.id,model:'clear-land',worldSize:{width:scene.width,height:scene.height},format:'white = land; black = water, cliffs, rocks or walls; object collision stays with its owner',terrainCollision:scene.navigation.terrainCollision,tiles},null,2)+'\n');
  return tiles;
}
