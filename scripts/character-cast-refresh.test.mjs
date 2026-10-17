import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {planCastRefresh} from './refresh-character-cast.mjs';
import {castSourceSignature} from './character-cast.mjs';

test('cast refresh queues a new identity without a previous report and rejects malformed reports',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'character-cast-refresh-'));
  try {
    const catalogue=JSON.parse(await readFile('art/source/character-kit/cast/component-catalogue.json','utf8'));
    const recipePath='art/source/character-kit/cast/schaffner.json',recipeBytes=await readFile(recipePath);
    await mkdir(dirname(resolve(root,recipePath)),{recursive:true});await writeFile(resolve(root,recipePath),recipeBytes);
    const fresh=await planCastRefresh({id:'schaffner'},'walk',catalogue,{root});
    assert.equal(fresh.reusable,false);assert.equal(fresh.report,null);
    assert.equal(fresh.currentInputs,castSourceSignature(JSON.parse(recipeBytes),catalogue));
    await mkdir(dirname(resolve(root,fresh.path)),{recursive:true});
    await writeFile(resolve(root,fresh.path),JSON.stringify({id:'schaffner',proof:'art/proofs/character-cast/schaffner.png'}));
    assert.equal((await planCastRefresh({id:'schaffner'},'walk',catalogue,{root})).reusable,false);
    await writeFile(resolve(root,fresh.path),'{broken');
    await assert.rejects(planCastRefresh({id:'schaffner'},'walk',catalogue,{root}),SyntaxError);
  } finally {await rm(root,{recursive:true,force:true});}
});
