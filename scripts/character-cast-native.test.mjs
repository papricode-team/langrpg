import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {indoorCastIds,bakeNativeCastVariant,pruneUnusedNativeCast} from './character-cast.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');

async function fixture(ids) {
  const root=await mkdtemp(resolve(tmpdir(),'character-cast-native-')),files=new Map(),reports=new Map();
  const image=await sharp({create:{width:8,height:12,channels:4,background:'#487768ff'}}).webp({lossless:true}).toBuffer();
  for(const id of ids){
    const runtime=`web/public/assets/character-cast/${id}`,native=`web/public/assets/character-cast/native/${id}`,proof=`art/proofs/character-cast-painted/${id}`;
    const recipe=`art/source/character-kit/cast/${id}.json`,geometry=jsonBytes({frames:{}}),proofBytes=await sharp(image).png().toBuffer();
    const pages=[0,1].map(index=>({path:`${native}${index?'.1':''}.webp`,sha256:hash(image),firstFrame:index*18,frameCount:18}));
    const nativeGeometry=jsonBytes({textures:pages.map(page=>({image:page.path.slice('web/public/assets/character-cast/'.length)+'?v=original',frames:[]}))});
    for(const [path,bytes]of [[recipe,Buffer.from('{}')],[runtime+'.webp',image],[runtime+'.atlas.json',geometry],[proof+'.png',proofBytes],[proof+'.webp',image],[native+'.webp',image],[native+'.1.webp',image],[native+'.atlas.json',nativeGeometry]])files.set(path,bytes);
    const report={id,poseSet:'walk',recipe,recipeSha256:hash(files.get(recipe)),atlas:runtime+'.webp',atlasSha256:hash(image),geometry:runtime+'.atlas.json',geometrySha256:hash(geometry),proof:proof+'.png',proofSha256:hash(proofBytes),editorSha256:hash(image),native:{image:native+'.webp',sha256:hash(image),atlas:native+'.atlas.json',atlasSha256:hash(nativeGeometry),images:pages,sourceSha256:hash(image)}};
    reports.set(id,report);files.set(runtime+'.json',jsonBytes(report));
  }
  files.set('art/source/character-kit/cast/catalogue.json',jsonBytes({entries:ids.map(id=>({id}))}));
  for(const [path,bytes]of files){await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),bytes);}
  return {root,files,reports};
}

test('native cast eligibility follows authored indoor people and skips outdoor source IO',async()=>{
  const actual=await indoorCastIds();
  const {interiors}=await import('../web/src/interiors.ts');
  assert.deepEqual([...actual].sort(),[...new Set(interiors.flatMap(room=>room.npcs.map(person=>person.id)))].sort());
  assert.deepEqual([...actual].sort(),['emil','fritz','greta','lina','marta','schaffner']);
  actual.clear();assert.ok((await indoorCastIds()).has('schaffner'));
  assert.equal(await bakeNativeCastVariant({id:'inspector',mapId:null},{root:'/missing-native-source-test'}),undefined);
});

test('native prune removes only unused native exports while retaining required native and all reviewed masters',async()=>{
  const f=await fixture(['inspector','marta']);
  try {
    const result=await pruneUnusedNativeCast({root:f.root});assert.deepEqual(result.actors,['inspector']);assert.equal(result.files,3);
    const report=f.reports.get('inspector'),removed=[report.native.image,report.native.images[1].path,report.native.atlas];
    assert.equal(result.bytes,removed.reduce((sum,path)=>sum+f.files.get(path).length,0));
    for(const path of removed)await assert.rejects(stat(resolve(f.root,path)),{code:'ENOENT'});
    const reportPath='web/public/assets/character-cast/inspector.json',updated=JSON.parse(await readFile(resolve(f.root,reportPath),'utf8'));
    assert.equal(updated.native,undefined);const original=structuredClone(report);delete original.native;assert.deepEqual(updated,original);
    for(const [path,bytes]of f.files)if(!removed.includes(path)&&path!==reportPath)assert.deepEqual(await readFile(resolve(f.root,path)),bytes,path);
    assert.deepEqual(await pruneUnusedNativeCast({root:f.root}),{actors:[],files:0,bytes:0});
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('native prune validates every actor and page before any mutation and rejects unsafe paths',async()=>{
  for(const unsafePath of [false,true]){
    const f=await fixture(['otto','inspector']);
    try {
      const report=f.reports.get('inspector'),page=report.native.images[1],reportPath='web/public/assets/character-cast/inspector.json';
      let changedPath;
      if(unsafePath){page.path='../outside.webp';changedPath=reportPath;await writeFile(resolve(f.root,reportPath),jsonBytes(report));}
      else {changedPath=page.path;await writeFile(resolve(f.root,page.path),'changed-page');}
      await assert.rejects(pruneUnusedNativeCast({root:f.root}),unsafePath?/Unsafe native cast prune paths/:/Changed native cast prune source/);
      for(const [path,bytes]of f.files)if(path!==changedPath)assert.deepEqual(await readFile(resolve(f.root,path)),bytes,path);
    } finally {await rm(f.root,{recursive:true,force:true});}
  }
});
