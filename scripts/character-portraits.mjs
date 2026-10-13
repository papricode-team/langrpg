/** Dedicated portrait sources are cropped losslessly, never enlarged from walk sprites. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {characterResolutionErrors} from '../web/src/character-resolution.mjs';
const ROOT=resolve(import.meta.dirname,'..');
const hash=value=>createHash('sha256').update(value).digest('hex');

export function validatePortrait(actor,meta) {
  if(!/^[a-z][a-z0-9-]*$/.test(actor.id)||actor.nativeRepaint!==true||!actor.review?.approved||!actor.promptSha256)throw new Error('Reviewed native portrait and prompt provenance required');
  if(!actor.crops?.neutral)throw new Error('Neutral portrait required');
  for(const [name,crop] of Object.entries(actor.crops)) {
    if(!/^[a-z][a-z0-9-]*$/.test(name)||Object.values(crop).some(n=>!Number.isInteger(n)||n<0)||crop.width!==crop.height||crop.left+crop.width>meta.width||crop.top+crop.height>meta.height)throw new Error('Invalid portrait crop');
    const errors=characterResolutionErrors({nativeCell:[crop.width,crop.height],outputCell:[crop.width,crop.height],surface:'portrait',authored:actor.nativeRepaint});
    if(errors.length)throw new Error(errors.join('; '));
  }
}

export async function exportPortraits({root=ROOT}={}) {
  const manifest=JSON.parse(await readFile(resolve(root,'art/source/character-portraits/manifest.json'),'utf8'));
  const actors={},outputs=[];
  for(const actor of manifest.actors) {
    const source=await readFile(resolve(root,actor.source));
    if(hash(source)!==actor.sourceSha256||hash(await readFile(resolve(root,actor.prompt)))!==actor.promptSha256)throw new Error(`${actor.id}: changed portrait source or prompt`);
    validatePortrait(actor,await sharp(source).metadata());
    if(actors[actor.id])throw new Error('Duplicate portrait identity');
    const expressions={};
    for(const [expression,crop] of Object.entries(actor.crops)) {
      const bytes=await sharp(source).extract(crop).webp({lossless:true}).toBuffer();
      const name=`${actor.id}-${expression}.webp`;
      outputs.push([name,bytes]);expressions[expression]=`/assets/character-portraits/${name}?v=${hash(bytes).slice(0,12)}`;
    }
    actors[actor.id]={width:actor.crops.neutral.width,height:actor.crops.neutral.height,expressions};
  }
  const out=resolve(root,'web/public/assets/character-portraits');await mkdir(out,{recursive:true});
  for(const [name,bytes] of outputs)await writeFile(resolve(out,name),bytes);
  const compiled={version:1,actors};
  await writeFile(resolve(root,'web/src/data/character-portraits.json'),JSON.stringify(compiled,null,2)+'\n');
  return {actors:Object.keys(actors).length,portraits:outputs.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)exportPortraits().then(console.log).catch(error=>{console.error(error.message);process.exitCode=1;});
