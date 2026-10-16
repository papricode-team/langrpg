import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { legacyMapPlates, optimizeGameDistribution } from './optimize-game-distribution.mjs';

async function fixture(){
  const root=await mkdtemp(resolve(tmpdir(),'atlas-production-art-')),assets=resolve(root,'web/dist/assets'),source=resolve(root,'web/public/assets');
  await mkdir(assets,{recursive:true});await mkdir(source,{recursive:true});await mkdir(resolve(root,'content'),{recursive:true});
  const image=await sharp({create:{width:1536,height:1024,channels:3,background:'#436151'}}).png().toBuffer();
  for(const name of legacyMapPlates){await writeFile(resolve(source,name),image);await copyFile(resolve(source,name),resolve(assets,name));}
  await writeFile(resolve(assets,'lindenhafen-day-terrain-detail-0-0.webp'),image);
  await writeFile(resolve(root,'content/world-seed.json'),JSON.stringify({maps:{lindenhafen:{terrain:[{dayAsset:'/assets/lindenhafen-day-terrain-detail-0-0.webp'}]}}}));
  return {root,assets,source};
}
test('production packaging keeps public masters and streamed detail bytes unchanged',async()=>{
  const {root,assets,source}=await fixture();
  try{
    const before=await readFile(resolve(source,legacyMapPlates[0])),detail=await readFile(resolve(assets,'lindenhafen-day-terrain-detail-0-0.webp'));
    const result=await optimizeGameDistribution({root});assert.ok(result.saved>0);assert.equal(result.plates.length,7);
    for(const plate of result.plates){assert.equal(plate.width,768);assert.equal(plate.height,512);assert.ok(plate.after<plate.before);}
    assert.equal((await sharp(resolve(assets,legacyMapPlates[0])).metadata()).format,'webp');
    const packed=await readFile(resolve(assets,legacyMapPlates[0]));
    assert.equal((await optimizeGameDistribution({root})).saved,0);
    assert.deepEqual(await readFile(resolve(assets,legacyMapPlates[0])),packed);
    assert.deepEqual(await readFile(resolve(source,legacyMapPlates[0])),before);
    assert.deepEqual(await readFile(resolve(assets,'lindenhafen-day-terrain-detail-0-0.webp')),detail);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('registered terrain and authoring directories are guarded before any write',async()=>{
  const {root,assets}=await fixture();
  try{
    const before=await readFile(resolve(assets,legacyMapPlates[0]));
    await assert.rejects(optimizeGameDistribution({root,outputDir:resolve(root,'web/public')}),/never rewrite/);
    await writeFile(resolve(root,'content/world-seed.json'),JSON.stringify({maps:{lindenhafen:{terrain:[{dayAsset:`/assets/${legacyMapPlates[0]}`}]}}}));
    await assert.rejects(optimizeGameDistribution({root}),/registered streamed terrain/);
    assert.deepEqual(await readFile(resolve(assets,legacyMapPlates[0])),before);
  }finally{await rm(root,{recursive:true,force:true});}
});
