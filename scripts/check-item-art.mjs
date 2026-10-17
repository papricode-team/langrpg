#!/usr/bin/env node
/** Verify shipped art, not merely the existence of placeholder manifest entries. */
import sharp from 'sharp';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createItemArtPlan, projectRoot } from './item-art-plan.mjs';
import { minigameAudioJobs } from './minigame-audio-content.mjs';
import { minigameSfxNames } from './generate-minigame-sfx.mjs';

export async function auditItemArt(root=projectRoot, {allowMissing=false,lexemeIds=[]}={}) {
  const plan=await createItemArtPlan(root), assetDir=resolve(root,'web/public/assets/minigames');
  const manifest=JSON.parse(await readFile(resolve(assetDir,'items-manifest.json'),'utf8'));
  const atlasPages=new Map();
  for(const page of manifest.atlases){
    const atlas=JSON.parse(await readFile(resolve(root,'web/public',page.data.slice(1)),'utf8'));
    const image=await readFile(resolve(root,'web/public',page.image.slice(1))),atlasImage=await sharp(image).metadata();
    if(image.length>2*1024*1024)throw Error(`${page.key}: atlas exceeds 2 MiB download budget`);
    if(!atlasImage.hasAlpha)throw Error('Item atlas has lost native alpha');
    if(atlasImage.width!==atlas.meta.size.w || atlasImage.height!==atlas.meta.size.h)throw Error('Item atlas size does not match its JSON');
    atlasPages.set(page.key,{atlas,atlasImage});
  }
  const expected=new Map(plan.sheets.flatMap(sheet=>sheet.frames.map(frame=>[frame.name,frame]))), missing=new Map(manifest.missing.map(row=>[row.frame,row]));
  const nounIds=new Set(), hashes=new Map(); let nouns=0,props=0;
  for(const [name,frame] of expected){
    const entry=manifest.frames[name];
    if(!entry){if(!allowMissing || !missing.has(name))throw Error(`Missing required item frame: ${name}`);continue;}
    if(missing.has(name))throw Error(`${name}: simultaneously marked available and missing`);
    if(entry.lexemeId!==frame.lexemeId || entry.subject!==frame.subject || entry.pictureable!==frame.pictureable)throw Error(`${name}: manifest changed the authored semantic identity`);
    if(entry.lexemeId){if(nounIds.has(entry.lexemeId))throw Error(`Duplicate noun mapping: ${entry.lexemeId}`);nounIds.add(entry.lexemeId);nouns++;}else props++;
    const page=atlasPages.get(entry.atlasKey);if(!page)throw Error(`${name}: unknown atlas page`);
    const {atlas,atlasImage}=page,area=atlas.frames[name]?.frame;
    if(!area || area.w!==256 || area.h!==256 || area.x<0 || area.y<0 || area.x+area.w>atlasImage.width || area.y+area.h>atlasImage.height)throw Error(`${name}: absent or invalid TexturePacker bounds`);
    if(!entry.url.startsWith('/assets/minigames/sprites/') || !entry.source.startsWith('art/source/minigames/'))throw Error(`${name}: invalid provenance or sprite path`);
    await access(resolve(root,entry.source));
    const master=await sharp(resolve(root,`art/source/minigames/masters/${name}.png`)).metadata();
    if(master.width!==512 || master.height!==512 || !master.hasAlpha)throw Error(`${name}: invalid 512px master`);
    const buffer=await readFile(resolve(root,'web/public',entry.url.slice(1))), meta=await sharp(buffer).metadata();
    if(!meta.hasAlpha || meta.width!==256 || meta.height!==256)throw Error(`${name}: standalone sprite must be 256px native alpha`);
    const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let clear=0,solid=0;for(let offset=3;offset<data.length;offset+=info.channels){if(data[offset]===0)clear++;if(data[offset]>32)solid++;}
    if(clear<256*256*.05 || solid<256*256*.002)throw Error(`${name}: empty sprite or painted backdrop`);
    const hash=createHash('sha256').update(buffer).digest('hex');
    if(hashes.has(hash))throw Error(`${name}: identical pixels reused for ${hashes.get(hash)}`); hashes.set(hash,name);
  }
  for(const name of Object.keys(manifest.frames))if(!expected.has(name))throw Error(`Unplanned sprite: ${name}`);
  for(const id of lexemeIds)if(!nounIds.has(id))throw Error(`Picture game references an unpainted lexeme: ${id}`);
  if(!allowMissing && (nouns!==plan.nounCount || props!==plan.propCount))throw Error('Incomplete noun or prop coverage');
  const small=JSON.parse(await readFile(resolve(assetDir,'items-128.json'),'utf8')), smallMeta=await sharp(resolve(assetDir,'items-128.webp')).metadata();
  if(smallMeta.width!==small.meta.size.w || smallMeta.height!==small.meta.size.h || !smallMeta.hasAlpha)throw Error('128px atlas dimensions/alpha do not match');
  for(const name of Object.keys(manifest.frames))if(small.frames[name]?.frame.w!==128)throw Error(`${name}: missing 128px export`);
  const runtime=JSON.parse(await readFile(resolve(root,'web/src/minigames/item-data.json'),'utf8'));
  if(JSON.stringify(runtime)!==JSON.stringify(manifest))throw Error('Runtime item manifest differs from audited public manifest');
  const scene=JSON.parse(await readFile(resolve(assetDir,'scene-art-manifest.json'),'utf8'));
  const sceneAtlas=JSON.parse(await readFile(resolve(assetDir,'actions.json'),'utf8'));
  const actionMeta=await sharp(resolve(assetDir,'actions.webp')).metadata();
  if(actionMeta.width!==sceneAtlas.meta.size.w || actionMeta.height!==sceneAtlas.meta.size.h || !actionMeta.hasAlpha)throw Error('Invalid character action atlas');
  for(const name of ['fritz-pointing','otto-watch','voss-stamping','lina-sorting','ada-filing','greta-watering']){
    for(const prefix of ['action','portrait']){
      const key=`${prefix}-${name}`, entry=scene.frames[key], frame=sceneAtlas.frames[key]?.frame;
      if(!entry || !frame)throw Error(`Missing game character frame: ${key}`);
      const meta=await sharp(resolve(root,'web/public',entry.url.slice(1))).metadata();
      if(meta.width!==256 || meta.height!==(prefix==='action'?384:256) || !meta.hasAlpha)throw Error(`Invalid native-alpha game character frame: ${key}`);
      if(frame.x+frame.w>actionMeta.width || frame.y+frame.h>actionMeta.height)throw Error(`Invalid game character atlas bounds: ${key}`);
    }
  }
  const workbench=await sharp(resolve(root,'web/public',scene.backdrops.workbench.slice(1))).metadata();
  if(workbench.width!==1536 || workbench.height!==1024)throw Error('Invalid workbench painting dimensions');
  for(const name of ['station','market','archive','garden','clock','council','listening','workshop']){
    const url=scene.backdrops[name];
    if(!url)throw Error(`Missing mechanic stage: ${name}`);
    const buffer=await readFile(resolve(root,'web/public',url.slice(1))),meta=await sharp(buffer).metadata();
    if(meta.width!==1920 || meta.height!==1080 || buffer.length>2*1024*1024)throw Error(`Invalid 16:9 mechanic stage: ${name}`);
    await access(resolve(root,`art/source/minigames/scenes/${name}.png`));
    await access(resolve(root,`art/source/minigames/scenes/${name}.txt`));
  }
  const sceneRuntime=JSON.parse(await readFile(resolve(root,'web/src/minigames/scene-art-data.json'),'utf8'));
  if(JSON.stringify(sceneRuntime)!==JSON.stringify(scene))throw Error('Runtime scene art manifest differs from public manifest');
  const speech=JSON.parse(await readFile(resolve(root,'web/public/audio/minigames-manifest.json'),'utf8'));
  const runtimeSpeech=JSON.parse(await readFile(resolve(root,'web/src/minigames/audio-data.json'),'utf8'));
  if(JSON.stringify(speech)!==JSON.stringify(runtimeSpeech))throw Error('Runtime speech manifest differs from public manifest');
  const clips=new Map(speech.clips.map(clip=>[clip.id,clip]));
  for(const job of await minigameAudioJobs()){
    const clip=clips.get(job.id);
    if(!clip || clip.text!==job.text)throw Error(`Spoken instruction is stale or missing: ${job.id}; run generate-audio.mjs --minigames-only`);
    if((await readFile(resolve(root,'web/public',clip.path.slice(1)))).length<500)throw Error(`Empty spoken instruction: ${job.id}`);
  }
  for(const name of minigameSfxNames){
    const clip=await readFile(resolve(root,`web/public/audio/ui/${name}.ogg`));
    if(clip.length<500 || clip.toString('ascii',0,4)!=='OggS')throw Error(`Missing mini-game foley: ${name}`);
  }
  return {nouns,props,missing:manifest.missing.length,targetNouns:plan.nounCount,targetProps:plan.propCount};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const lexemeIds=process.argv.find(arg=>arg.startsWith('--lexemes='))?.slice(10).split(',')??[];
  const summary=await auditItemArt(projectRoot,{allowMissing:process.argv.includes('--allow-missing'),lexemeIds});
  console.log(`Item art audit passed: ${summary.nouns}/${summary.targetNouns} distinct noun sprites, ${summary.props}/${summary.targetProps} props, ${summary.missing} missing.`);
}
