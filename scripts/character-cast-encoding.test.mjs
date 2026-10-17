import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {characterCastEncodingId,encodeCharacterCastAtlas,isLosslessWebP} from './character-cast-encoding.mjs';
import {exportCastEntry,castBakeArtifactsCurrent} from './character-cast.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');

async function sample(seed=0) {
  const width=64,height=48,raw=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4;
    raw[p]=(x*13+y*17+seed)%256;raw[p+1]=(x*7+y*29+seed)%256;raw[p+2]=(x*23+y*11+seed)%256;
    raw[p+3]=[0,(x*11+y*23)%256,128,255][(x+y)%4];
  }
  return sharp(raw,{raw:{width,height,channels:4}}).webp({lossless:true}).toBuffer();
}

async function fixture() {
  const root=await mkdtemp(resolve(tmpdir(),'character-cast-encoding-')),id='encoding-test';
  const prefix=`web/public/assets/character-cast/${id}`,proof=`art/proofs/character-cast-painted/${id}`;
  const files=new Map(),runtime=[],native=[];
  for(const [tier,pages]of [['',runtime],['native/',native]])for(let i=0;i<2;i++){
    const path=`web/public/assets/character-cast/${tier}${id}${i?'.1':''}.webp`,bytes=await sample(i+(tier?3:0));
    pages.push({path,sha256:hash(bytes),firstFrame:i*18,frameCount:18});files.set(path,bytes);
  }
  const geometry=pages=>({textures:pages.map((page,index)=>({image:`${page.path.slice('web/public/assets/character-cast/'.length)}?v=${page.sha256.slice(0,16)}`,frames:[{filename:String(index*18),frame:{x:1,y:2,w:20,h:30},sourceSize:{w:384,h:576},spriteSourceSize:{x:10,y:20,w:20,h:30},trimmed:true,rotated:false}],meta:{size:{w:64,h:48}}}))});
  const recipe=`art/source/character-kit/cast/${id}.json`,editor=await sample(9),proofBytes=await sharp(editor).png().toBuffer();
  files.set(recipe,await readFile('art/source/character-kit/cast/schaffner.json'));
  files.set(proof+'.png',proofBytes);files.set(proof+'.webp',editor);
  files.set(prefix+'.atlas.json',jsonBytes(geometry(runtime)));
  const nativeAtlas=`web/public/assets/character-cast/native/${id}.atlas.json`;
  files.set(nativeAtlas,jsonBytes(geometry(native)));
  const report={id,poseSet:'walk',recipe,recipeSha256:hash(files.get(recipe)),atlas:prefix+'.webp',atlasSha256:runtime[0].sha256,
    geometry:prefix+'.atlas.json',geometrySha256:hash(files.get(prefix+'.atlas.json')),multiAtlas:true,images:runtime,
    proof:proof+'.png',proofSha256:hash(proofBytes),editorSha256:hash(editor),frames:36,textureBytes:64*48*4*2,
    native:{image:native[0].path,sha256:native[0].sha256,atlas:nativeAtlas,atlasSha256:hash(files.get(nativeAtlas)),multiAtlas:true,images:native,source:proof+'.webp',sourceSha256:hash(editor),textureBytes:64*48*4*2}};
  files.set(prefix+'.json',jsonBytes(report));
  files.set(prefix+'.webp.json',jsonBytes({sha256:report.atlasSha256,atlasSha256:report.geometrySha256,atlas:report.geometry,images:runtime,recipeSha256:report.recipeSha256,textureBytes:report.textureBytes}));
  for(const [path,bytes]of files){await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),bytes);}
  return {root,entry:{id,mapId:null},report,reportPath:prefix+'.json',files};
}

test('cast near-lossless export preserves geometry and clear pixels with bounded alpha and visible RGB change',async()=>{
  const input=await sample(),encoded=await encodeCharacterCastAtlas(input);
  const before=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const after=await sharp(encoded).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual(after.info,before.info);
  let maxRGBDifference=0,maxAlphaDifference=0;
  for(let p=0;p<before.data.length;p+=4){
    maxAlphaDifference=Math.max(maxAlphaDifference,Math.abs(after.data[p+3]-before.data[p+3]));
    if(before.data[p+3]===0)assert.equal(after.data[p+3],0,`clear pixel ${p/4}`);
    if(before.data[p+3])for(let channel=0;channel<3;channel++)maxRGBDifference=Math.max(maxRGBDifference,Math.abs(after.data[p+channel]-before.data[p+channel]));
  }
  assert.ok(maxAlphaDifference<=8,`alpha difference ${maxAlphaDifference}`);
  assert.ok(maxRGBDifference<=16,`visible RGB difference ${maxRGBDifference}`);
  assert.equal(isLosslessWebP(input),true);assert.equal(isLosslessWebP(encoded),true);
  assert.equal(isLosslessWebP(await sharp(input).webp({quality:80}).toBuffer()),false);
  assert.equal(isLosslessWebP(await sharp(input).png().toBuffer()),false);
  assert.equal(isLosslessWebP(Buffer.from('RIFF')),false);
});

test('controlled cast export updates runtime and native hashes and cache keys while preserving reviewed masters',async()=>{
  const f=await fixture();
  try {
    assert.equal(await castBakeArtifactsCurrent(f.report,{root:f.root}),true);
    const result=await exportCastEntry(f.entry,{root:f.root}),report=await json(resolve(f.root,f.reportPath));
    assert.equal(result.before,[...f.report.images,...f.report.native.images].reduce((sum,page)=>sum+f.files.get(page.path).length,0));
    let actualAfter=0;
    for(const [previous,asset]of [[{atlas:f.report.geometry,images:f.report.images},{atlas:report.geometry,images:report.images,sha256:report.atlasSha256,atlasSha256:report.geometrySha256}],[f.report.native,report.native]]){
      const geometry=await json(resolve(f.root,asset.atlas)),oldGeometry=JSON.parse(f.files.get(previous.atlas));
      assert.equal(asset.atlasSha256,hash(await readFile(resolve(f.root,asset.atlas))));
      assert.equal(asset.sha256,asset.images[0].sha256);
      for(const [index,page]of asset.images.entries()){
        const bytes=await readFile(resolve(f.root,page.path));actualAfter+=bytes.length;
        assert.equal(page.sha256,hash(bytes));
        assert.equal(geometry.textures[index].image,`${page.path.slice('web/public/assets/character-cast/'.length)}?v=${page.sha256.slice(0,16)}`);
        assert.deepEqual({...geometry.textures[index],image:undefined},{...oldGeometry.textures[index],image:undefined});
        assert.deepEqual({...page,sha256:undefined},{...previous.images[index],sha256:undefined});
      }
    }
    assert.equal(result.after,actualAfter);assert.equal(report.encodingId,characterCastEncodingId);assert.equal(report.native.encodingId,characterCastEncodingId);
    for(const path of [report.recipe,report.proof,report.proof.replace(/\.png$/,'.webp')])assert.deepEqual(await readFile(resolve(f.root,path)),f.files.get(path));
    for(const key of ['recipeSha256','proofSha256','editorSha256','textureBytes'])assert.equal(report[key],f.report[key]);
    assert.equal(report.native.sourceSha256,f.report.native.sourceSha256);
    const sidecar=await json(resolve(f.root,report.atlas+'.json'));
    assert.equal(sidecar.sha256,report.atlasSha256);assert.equal(sidecar.atlasSha256,report.geometrySha256);assert.equal(sidecar.encodingId,characterCastEncodingId);assert.deepEqual(sidecar.images,report.images);
    assert.equal(await castBakeArtifactsCurrent(report,{root:f.root,encodingId:characterCastEncodingId}),true);
    const snapshots=new Map(await Promise.all([...f.files.keys()].map(async path=>[path,await readFile(resolve(f.root,path))])));
    assert.deepEqual(await exportCastEntry(f.entry,{root:f.root}),{id:f.entry.id,poseSet:'walk',reused:true});
    for(const [path,bytes]of snapshots)assert.deepEqual(await readFile(resolve(f.root,path)),bytes,`idempotent ${path}`);
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('cast export rejects tampered runtime and native inputs before writing pending exports',async()=>{
  for(const native of [false,true]){
    const f=await fixture();
    try {
      const page=(native?f.report.native:f.report).images[1];await writeFile(resolve(f.root,page.path),'changed');
      await assert.rejects(exportCastEntry(f.entry,{root:f.root}),/Changed cast export source|intact lossless source/);
      for(const [path,bytes]of f.files)if(path!==page.path)assert.deepEqual(await readFile(resolve(f.root,path)),bytes);
    } finally {await rm(f.root,{recursive:true,force:true});}
  }
});

test('cast export refuses older quantization and lossy sources instead of requantizing them',async()=>{
  const f=await fixture();
  try {
    f.report.encodingId='previous-near-lossless-revision';await writeFile(resolve(f.root,f.reportPath),jsonBytes(f.report));
    await assert.rejects(exportCastEntry(f.entry,{root:f.root}),/Rebake cast for changed encoding/);
    delete f.report.encodingId;
    const first=f.report.images[0],lossy=await sharp(f.files.get(first.path)).webp({quality:80}).toBuffer();
    first.sha256=hash(lossy);f.report.atlasSha256=first.sha256;
    await writeFile(resolve(f.root,first.path),lossy);await writeFile(resolve(f.root,f.reportPath),jsonBytes(f.report));
    await assert.rejects(exportCastEntry(f.entry,{root:f.root}),/intact lossless source/);
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('current encodes still reject a damaged native page before claiming reuse',async()=>{
  const f=await fixture();
  try {
    await exportCastEntry(f.entry,{root:f.root});
    await writeFile(resolve(f.root,f.report.native.images[1].path),'changed-native-page');
    await assert.rejects(exportCastEntry(f.entry,{root:f.root}),/Changed cast export source|intact lossless source/);
  } finally {await rm(f.root,{recursive:true,force:true});}
});
