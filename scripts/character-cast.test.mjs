import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {castInventory,validateCastEntries,buildCast,bakeCastEntry,bakeNativeCastVariant,castSourceSignature,castBakeArtifactsCurrent} from './character-cast.mjs';

test('cast input signature includes rendering rules as well as resolved component pixels and contracts',async()=>{
  const catalogue=JSON.parse(await readFile('art/source/character-kit/cast/component-catalogue.json','utf8'));
  const recipe=JSON.parse(await readFile('art/source/character-kit/cast/marta.json','utf8'));
  const signature=castSourceSignature(recipe,catalogue),next=structuredClone(catalogue);
  next.assetVersion='new-wardrobe';
  assert.equal(castSourceSignature(recipe,next),signature);
  assert.notEqual(castSourceSignature(recipe,catalogue,'walk','updated-transparency-rules'),signature);
  next.components.find(p=>p.id==='headwear-beanie').sheets.primary.runtimePages[0].sha256='unused-change';
  assert.equal(castSourceSignature(recipe,next),signature);
  next.components.find(p=>p.id==='body-regular').sheets.skin.runtimePages[0].sha256='paint-change';
  assert.notEqual(castSourceSignature(recipe,next),signature);
});

test('inventory includes main, regional, route and activity identities without collisions',async()=>{
  const actors=await castInventory();assert.equal(new Set(actors.map(a=>a.id)).size,actors.length);
  assert.equal(actors.filter(a=>a.mapId===null).length,17);
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
      for(const path of [reportPath,report.recipe,report.atlas,report.geometry,report.proof,report.proof.replace(/\.png$/,'.webp'),...(report.images??[]).map(i=>i.path),...(report.native?[report.native.image,report.native.atlas,...(report.native.images??[]).map(i=>i.path)]:[])]){
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
  assert.deepEqual(compiled.cell,[384,576]);assert.equal(compiled.frames,36);
  for(const actor of compiled.actors){
    const entry=source.entries.find(e=>e.id===actor.id);
    assert.equal(actor.recipeSha256,entry.review.recipeSha256,actor.id);
    assert.deepEqual(actor.recipe,JSON.parse(await readFile(`art/source/character-kit/cast/${actor.id}.json`,'utf8')),actor.id);
    assert.equal(actor.mapId,entry.mapId,actor.id);
    const atlas=JSON.parse(await readFile(`web/public${actor.atlas}`,'utf8'));
    const pages=atlas.textures??[{frames:Object.values(atlas.frames),meta:atlas.meta}];
    assert.equal(pages.reduce((n,page)=>n+(Array.isArray(page.frames)?page.frames.length:Object.keys(page.frames).length),0),36,actor.id);
    assert.equal(actor.textureBytes,pages.reduce((n,page)=>n+page.meta.size.w*page.meta.size.h*4,0),actor.id);
    assert.ok(actor.textureBytes<384*576*36*4,actor.id);
    for(const page of pages)for(const frame of Object.values(page.frames)){
      assert.deepEqual(frame.sourceSize,{w:384,h:576});
      assert.ok(frame.trimmed&&!frame.rotated);
      assert.ok(frame.frame.x+frame.frame.w<=page.meta.size.w&&frame.frame.y+frame.frame.h<=page.meta.size.h);
    }
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
    for(const path of [reportPath,report.recipe,report.atlas,report.geometry,report.proof,report.proof.replace(/\.png$/,'.webp'),...(report.images??[]).map(i=>i.path),...(report.native?[report.native.image,report.native.atlas,...(report.native.images??[]).map(i=>i.path)]:[])]){
      await mkdir(dirname(resolve(root,path)),{recursive:true});await copyFile(path,resolve(root,path));
    }
    await mkdir(resolve(root,'web/src/data'),{recursive:true});
    const save=()=>writeFile(resolve(root,catalogue),JSON.stringify({version:1,entries:[entry]}));await save();
    assert.equal((await buildCast({root})).approved,1);
    const editorPath=report.proof.replace(/\.png$/,'.webp'),editorBytes=await readFile(resolve(root,editorPath));
    await writeFile(resolve(root,editorPath),Buffer.concat([editorBytes,Buffer.from('changed')]));
    await assert.rejects(buildCast({root}),/Changed cast artifact/);await writeFile(resolve(root,editorPath),editorBytes);
    const bytes=await readFile(resolve(root,report.recipe));
    await writeFile(resolve(root,report.recipe),bytes+' ');
    await assert.rejects(buildCast({root}),/Stale cast recipe/);await writeFile(resolve(root,report.recipe),bytes);
    await writeFile(resolve(root,report.atlas),'changed');
    await assert.rejects(buildCast({root}),/Changed cast artifact/);await copyFile(report.atlas,resolve(root,report.atlas));
    entry.review.proofSha256='changed';await save();await assert.rejects(buildCast({root}),/Unreviewed cast/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('native cast bakes reject unsafe ids before accessing a source path',async()=>{
  await assert.rejects(bakeNativeCastVariant({id:'../marta',mapId:null},{root:'/missing-native-cast-test'}),/Invalid native cast id/);
  await assert.rejects(bakeNativeCastVariant({id:'/tmp/marta',mapId:null},{root:'/missing-native-cast-test'}),/Invalid native cast id/);
});

test('unchanged cast reuse verifies every page hash and byte limit, retained editor pixels and missing artifacts',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'character-cast-reuse-')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  try{
    const prefix='web/public/assets/character-cast/reuse-test',proof='art/proofs/character-cast/reuse-test';
    const report={id:'reuse-test',poseSet:'walk',recipe:'art/source/character-kit/cast/reuse-test.json',atlas:prefix+'.webp',geometry:prefix+'.atlas.json',proof:proof+'.png',multiAtlas:true};
    const data=new Map([[report.recipe,Buffer.from('{}')],[report.atlas,Buffer.from('page-zero')],[prefix+'.1.webp',Buffer.from('page-one')],[report.geometry,Buffer.from('{}')],[report.proof,Buffer.from('review')],[proof+'.webp',Buffer.from('native-editor')]]);
    for(const [path,bytes]of data){await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),bytes);}
    report.recipeSha256=hash(data.get(report.recipe));report.atlasSha256=hash(data.get(report.atlas));report.geometrySha256=hash(data.get(report.geometry));report.proofSha256=hash(data.get(report.proof));report.editorSha256=hash(data.get(proof+'.webp'));
    report.images=[{path:report.atlas,sha256:report.atlasSha256,firstFrame:0,frameCount:18},{path:prefix+'.1.webp',sha256:hash(data.get(prefix+'.1.webp')),firstFrame:18,frameCount:18}];
    assert.equal(await castBakeArtifactsCurrent(report,{root}),true);
    // Intact files and an unchanged assetVersion cannot validate an old renderer.
    assert.equal(await castBakeArtifactsCurrent(report,{root,sourceComponentsSha256:'current-renderer'}),false);
    report.sourceComponentsSha256='old-renderer';
    assert.equal(await castBakeArtifactsCurrent(report,{root,sourceComponentsSha256:'current-renderer'}),false);
    report.sourceComponentsSha256='current-renderer';
    assert.equal(await castBakeArtifactsCurrent(report,{root,sourceComponentsSha256:'current-renderer'}),true);
    const extra=report.images[1];await writeFile(resolve(root,extra.path),'damaged-extra-page');
    assert.equal(await castBakeArtifactsCurrent(report,{root}),false);
    await writeFile(resolve(root,extra.path),data.get(extra.path));
    const oversized=Buffer.alloc(2*1024*1024+1);await writeFile(resolve(root,extra.path),oversized);extra.sha256=hash(oversized);
    assert.equal(await castBakeArtifactsCurrent(report,{root}),false);
    await writeFile(resolve(root,extra.path),data.get(extra.path));extra.sha256=hash(data.get(extra.path));
    await writeFile(resolve(root,proof+'.webp'),'changed-native-editor');assert.equal(await castBakeArtifactsCurrent(report,{root}),false);
    await writeFile(resolve(root,proof+'.webp'),data.get(proof+'.webp'));
    await rm(resolve(root,extra.path));assert.equal(await castBakeArtifactsCurrent(report,{root}),false);
    const invalid=structuredClone(report);invalid.images[1].path='../outside.webp';assert.equal(await castBakeArtifactsCurrent(invalid,{root}),false);
  }finally{await rm(root,{recursive:true,force:true});}
});
