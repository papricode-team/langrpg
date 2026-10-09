#!/usr/bin/env node
/** Pack complete painted cells with exact RGBA copies; never resample a pose. */
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { BOARD_LAYOUT, validateBoard } from './prepare-player-walk-legs.mjs';

const root=resolve(import.meta.dirname,'..');
const sha256=data=>createHash('sha256').update(data).digest('hex');

export function packBoardCells(sources) {
  if(sources.length!==8)throw new Error('A packed walk board requires exactly eight source cells.');
  const {width,height,cellWidth,cellHeight,columns}=BOARD_LAYOUT,out=Buffer.alloc(width*height*4);
  sources.forEach(({image,cell},destination)=>{
    validateBoard(image);
    if(!Number.isInteger(cell)||cell<0||cell>=8)throw new Error('Source cell must be an integer from 0 to 7.');
    const sourceLeft=cell%columns*cellWidth,sourceTop=Math.floor(cell/columns)*cellHeight,destLeft=destination%columns*cellWidth,destTop=Math.floor(destination/columns)*cellHeight;
    for(let y=0;y<cellHeight;y++){
      const start=((sourceTop+y)*width+sourceLeft)*4,target=((destTop+y)*width+destLeft)*4;
      image.data.copy(out,target,start,start+cellWidth*4);
    }
  });
  return out;
}

async function main() {
  const args=process.argv.slice(2);
  if(args[0]!=='--output'||!args[1])throw new Error('Usage: pack-player-walk-board.mjs --output board.png source.png#0 ... source.png#7');
  const output=resolve(args[1]),specifications=args.slice(2),images=new Map(),sources=[],cells=[];
  if(specifications.length!==8)throw new Error('Supply exactly eight source.png#cell selections in destination order.');
  for(const [destination,specification]of specifications.entries()){
    const match=specification.match(/^(.*)#([0-7])$/);if(!match)throw new Error(`Invalid source cell: ${specification}`);
    const file=resolve(match[1]),cell=Number(match[2]);
    if(!images.has(file)){const bytes=await readFile(file);images.set(file,{image:await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sha256:sha256(bytes)});}
    const loaded=images.get(file);sources.push({image:loaded.image,cell});cells.push({cell:destination,source:relative(root,file),sourceCell:cell,sourceSha256:loaded.sha256});
  }
  const pixels=packBoardCells(sources);
  await mkdir(dirname(output),{recursive:true});
  await sharp(pixels,{raw:{width:BOARD_LAYOUT.width,height:BOARD_LAYOUT.height,channels:4}}).png().toFile(output);
  const emitted=await sharp(output).ensureAlpha().raw().toBuffer();
  if(!pixels.equals(emitted))throw new Error('Packed board changed source RGBA.');
  const provenance={version:1,type:'packed-player-walk-board',output:relative(root,output),sha256:sha256(await readFile(output)),layout:BOARD_LAYOUT,rgbaExact:true,cells};
  await writeFile(output.replace(/\.png$/i,'.provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify({output,rgbaExact:true,cells:cells.map(cell=>({cell:cell.cell,source:cell.source,sourceCell:cell.sourceCell}))}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
