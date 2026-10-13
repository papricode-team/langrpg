/** Exact one-pixel-per-world-unit mask export; no inference from terrain colours. */
import sharp from 'sharp';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {exportClearLandMasks} from './terrain-land-mask.mjs';

const exists=async path=>{try{await access(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
/** Merge identical horizontal runs between rows into exact non-overlapping rectangles. */
export function walkableMaskPolygons(data,width,height,offsetX=0,offsetY=0){
  if(data.length!==width*height)throw Error('Mask requires one byte per pixel');
  const rectangles=[],active=new Map();
  for(let y=0;y<height;y++){
    const runs=new Map();
    for(let x=0;x<width;){
      if(data[y*width+x]<128){x++;continue;}
      const left=x;while(x<width&&data[y*width+x]>=128)x++;
      const key=`${left}:${x}`,prior=active.get(key);
      runs.set(key,prior?{...prior,bottom:y+1}:{left,right:x,top:y,bottom:y+1});
    }
    for(const [key,rectangle]of active)if(!runs.has(key))rectangles.push(rectangle);
    active.clear();for(const [key,rectangle]of runs)active.set(key,rectangle);
  }
  rectangles.push(...active.values());
  return rectangles.map(({left,right,top,bottom})=>[[left+offsetX,top+offsetY],[right+offsetX,top+offsetY],[right+offsetX,bottom+offsetY],[left+offsetX,bottom+offsetY]]);
}
export async function exportAuthoredWalkableMasks(root,town){
  const scene=JSON.parse(await readFile(resolve(root,'web/src/data/world-scenes.json'),'utf8')).maps[town];
  if(!scene)throw Error(`Unknown mask town ${town}`);
  if(scene.navigation?.model==='clear-land')return exportClearLandMasks(root,scene);
  const source=resolve(root,'art/source/terrain-detail'),out=resolve(root,'web/public/assets/walkable-masks');
  const wholePath=resolve(source,`${town}-walkable.png`),wholeExists=await exists(wholePath),tiles=[];
  if(wholeExists){const size=await sharp(wholePath).metadata();if(size.width!==scene.width||size.height!==scene.height)throw Error(`${town}: walkable mask must match ${scene.width} × ${scene.height} world units exactly`);}
  for(const tile of scene.terrain){
    const tilePath=resolve(source,`${town}-${tile.id}-walkable.png`);
    let path=tilePath,painting;
    if(await exists(tilePath)){
      const size=await sharp(tilePath).metadata();if(size.width!==tile.width||size.height!==tile.height)throw Error(`${tile.id}: mask must be ${tile.width} × ${tile.height} pixels`);
      painting=sharp(tilePath);
    }else if(wholeExists){path=wholePath;painting=sharp(wholePath).extract({left:tile.x,top:tile.y,width:tile.width,height:tile.height});}
    else continue;
    await mkdir(out,{recursive:true});
    const mask=painting.flatten({background:'#000000'}).greyscale().threshold(127),file=`${town}-${tile.id}.png`;
    const {data,info}=await mask.clone().raw().toBuffer({resolveWithObject:true});
    if(info.channels!==1)throw Error('Mask export must resolve to a single channel');
    await mask.png().toFile(resolve(out,file));
    const walkable=walkableMaskPolygons(data,tile.width,tile.height,tile.x,tile.y);
    tiles.push({id:tile.id,x:tile.x,y:tile.y,width:tile.width,height:tile.height,pixelDensity:1,asset:`/assets/walkable-masks/${file}`,source:relative(root,path),walkable});
  }
  if(tiles.length){
    await writeFile(resolve(source,`${town}-walkable-masks.json`),JSON.stringify({version:1,town,worldSize:{width:scene.width,height:scene.height},format:'white = walkable, black = blocked; one source pixel per world unit',tiles},null,2)+'\n');
    console.log(`${town}: exported ${tiles.length} authored walkable masks and exact polygons`);
  }
  return tiles;
}
