import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {castInventory,validateCastEntries,buildCast,bakeCastEntry} from './character-cast.mjs';

test('inventory includes main, regional, route and activity identities without collisions',async()=>{
  const actors=await castInventory();assert.equal(new Set(actors.map(a=>a.id)).size,actors.length);
  assert.equal(actors.filter(a=>a.mapId===null).length,9);
  for(const id of ['marta','elise','saffroncourt-resident-7','nebelstadt-resident-sailor','waldruh-yard-courier'])assert.ok(actors.some(a=>a.id===id),id);
  const first=actors[0],entry={id:first.id,name:first.name,mapId:first.mapId,status:'candidate',reference:'reference.txt'};
  assert.equal(validateCastEntries([entry],actors).length,actors.length-1);
  assert.throws(()=>validateCastEntries([entry,entry],actors),/duplicate/);
  assert.throws(()=>validateCastEntries([{...entry,mapId:'another-town'}],actors),/identity changed/);
});

test('cast actions require their own current pose artifacts and visual approval',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'character-cast-poses-'));
  try{
    const source=JSON.parse(await readFile('art/source/character-kit/cast/catalogue.json','utf8'));
    const entry=structuredClone(source.entries.find(e=>e.id==='lindenhafen-library-keeper'));
    const catalogue='art/source/character-kit/cast/catalogue.json';
    const poseReportPath=`web/public/assets/character-cast/poses/wave/${entry.id}.json`;
    let poseReport;
    for(const reportPath of [`web/public/assets/character-cast/${entry.id}.json`,poseReportPath]){
      const report=JSON.parse(await readFile(reportPath,'utf8'));if(reportPath===poseReportPath)poseReport=report;
      for(const path of [reportPath,report.recipe,report.atlas,report.proof]){
        await mkdir(dirname(resolve(root,path)),{recursive:true});await copyFile(path,resolve(root,path));
      }
    }
    await mkdir(resolve(root,'web/src/data'),{recursive:true});
    const save=()=>writeFile(resolve(root,catalogue),JSON.stringify({version:1,entries:[entry]}));await save();
    assert.equal((await buildCast({root})).approved,1);
    const manifest=JSON.parse(await readFile(resolve(root,'web/src/data/character-cast.json'),'utf8'));
    assert.equal(manifest.actors[0].poses.wave.key,`character-cast-${entry.id}-wave`);
    assert.equal(manifest.actors[0].poses.wave.frameDurations.length,9);
    entry.poses.wave.status='candidate';await save();await buildCast({root});
    assert.equal(JSON.parse(await readFile(resolve(root,'web/src/data/character-cast.json'),'utf8')).actors[0].poses,undefined);
    entry.poses.wave.status='approved';entry.poses.wave.review=entry.review;await save();
    await assert.rejects(buildCast({root}),/Unreviewed cast.*wave/);
    entry.poses.wave.review=source.entries.find(e=>e.id===entry.id).poses.wave.review;await save();
    await writeFile(resolve(root,poseReport.atlas),'changed');await assert.rejects(buildCast({root}),/Changed cast artifact.*wave/);
    await copyFile(poseReport.atlas,resolve(root,poseReport.atlas));
    await writeFile(resolve(root,poseReportPath),JSON.stringify({...poseReport,poseSet:'seated'}));
    await assert.rejects(buildCast({root}),/Stale cast recipe.*wave/);
    await writeFile(resolve(root,poseReportPath),JSON.stringify({...poseReport,assetVersion:'old'}));
    await assert.rejects(buildCast({root}),/Stale cast recipe.*wave/);
    await assert.rejects(bakeCastEntry(entry,{root,poseSet:'missing'}),/Unavailable pose/);
    await assert.rejects(bakeCastEntry(entry,{root,poseSet:'../wave'}),/Invalid cast id or pose/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('every authored world identity has an approved recipe and compiled walking atlas',async()=>{
  const inventory=await castInventory();
  const source=JSON.parse(await readFile('art/source/character-kit/cast/catalogue.json','utf8'));
  const compiled=JSON.parse(await readFile('web/src/data/character-cast.json','utf8'));
  assert.deepEqual(validateCastEntries(source.entries,inventory),[]);
  assert.ok(source.entries.every(entry=>entry.status==='approved'&&entry.review?.proofSha256));
  assert.deepEqual(compiled.actors.map(a=>a.id).sort(),inventory.map(a=>a.id).sort());
  assert.deepEqual(compiled.cell,[64,96]);assert.equal(compiled.frames,36);
  for(const actor of compiled.actors){
    const entry=source.entries.find(e=>e.id===actor.id);
    assert.equal(actor.recipeSha256,entry.review.recipeSha256,actor.id);
    assert.deepEqual(actor.recipe,JSON.parse(await readFile(`art/source/character-kit/cast/${actor.id}.json`,'utf8')),actor.id);
    assert.equal(actor.mapId,entry.mapId,actor.id);
  }
});

test('cast manifest rejects changed recipes, artifacts and missing visual approval',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'character-cast-'));
  try{
    const source=JSON.parse(await readFile('art/source/character-kit/cast/catalogue.json','utf8'));
    const entry=source.entries.find(e=>e.id==='marta');
    const catalogue='art/source/character-kit/cast/catalogue.json';
    const reportPath='web/public/assets/character-cast/marta.json';
    const report=JSON.parse(await readFile(reportPath,'utf8'));
    for(const path of [reportPath,report.recipe,report.atlas,report.proof]){
      await mkdir(dirname(resolve(root,path)),{recursive:true});await copyFile(path,resolve(root,path));
    }
    await mkdir(resolve(root,'web/src/data'),{recursive:true});
    const save=()=>writeFile(resolve(root,catalogue),JSON.stringify({version:1,entries:[entry]}));await save();
    assert.equal((await buildCast({root})).approved,1);
    const bytes=await readFile(resolve(root,report.recipe));
    await writeFile(resolve(root,report.recipe),bytes+' ');
    await assert.rejects(buildCast({root}),/Stale cast recipe/);await writeFile(resolve(root,report.recipe),bytes);
    await writeFile(resolve(root,report.atlas),'changed');
    await assert.rejects(buildCast({root}),/Changed cast artifact/);await copyFile(report.atlas,resolve(root,report.atlas));
    entry.review.proofSha256='changed';await save();await assert.rejects(buildCast({root}),/Unreviewed cast/);
  }finally{await rm(root,{recursive:true,force:true});}
});
