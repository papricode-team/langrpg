import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { splitMaterials, compileCatalogue, validateCatalogue, verifyApproval, exportComponent, requireCompleteHDReplacement } from './character-kit-assets.mjs';
import { material } from './character-kit.mjs';
import { normalizeAvatar, recipeErrors, resolveRecipe, avatarTextureKey } from '../web/src/character-recipe.mjs';
import { combineMaterials, composeFrame, over } from '../web/src/character-compositor.mjs';
import { characterSheetPages } from '../web/src/character-sheets.mjs';
const root = resolve(import.meta.dirname, '..');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
test('HD publication retains walking options, action poses and expressions',()=>{
 const published={components:[{id:'body-regular'},{id:'top-shirt'}],poseSets:{wave:{components:[{id:'body-wave'}]}},expressions:{smile:{components:[{id:'face-smile'}]}}};
 const entries=['body-regular','top-shirt','body-wave','face-smile'].map(id=>({id,status:'approved',authoring:{kind:'native-repaint'}}));
 assert.doesNotThrow(()=>requireCompleteHDReplacement({highResolution:true,entries},published));
 for(const id of entries.map(e=>e.id))assert.throws(()=>requireCompleteHDReplacement({highResolution:true,entries:entries.filter(e=>e.id!==id)},published),new RegExp(id));
 assert.throws(()=>requireCompleteHDReplacement({highResolution:true,entries:entries.map(e=>({...e,status:'candidate'}))},published),/incomplete/);
});
const fixture = () => {
  const slots = ['body','hair','headwear','top','bottom','outer','neck','bag','held'].map((id,index)=>({id,label:id,optional:id!=='body',zOrder:{default:index*10}}));
  const component=(slot,optionId,props={})=>({id:`${slot}-${optionId}`,slot,optionId,build:'regular',label:optionId,materials:['primary'],tints:{primary:`${slot}.primary`},zOrder:{default:slots.find(s=>s.id===slot).zOrder.default},occupies:[],hides:[],excludes:[],covers:{},...props});
  return {schemaVersion:1,assetVersion:'v1',builds:['regular'],slots,colorKeys:['top.primary','bottom.primary','outer.primary','headwear.primary'],defaultColors:{skin:'#d6a07d',hair:'#48372e','outer.primary':'#326a65','bottom.primary':'#44464d'},components:[
    component('body','regular',{materials:['skin'],tints:{skin:'skin'},zOrder:{default:20}}),component('hair','waves',{tints:{primary:'hair'}}),component('hair','bun',{excludes:['headwear'],tints:{primary:'hair'}}),component('headwear','cap',{hides:['hair']}),component('headwear','open',{hides:['hairCrown']}),component('top','dress',{occupies:['top','bottom']}),component('bottom','straight'),component('outer','travel',{covers:{bottom:'upper'}}),component('neck','scarf',{zOrder:{default:65}}),component('bag','satchel',{zOrder:{default:10,up:85}}),component('held','lantern',{zOrder:{default:90,up:5}})
  ]};
};

test('material split is disjoint, preserves source alpha, normalizes keys and keeps detail colour',()=>{
  const raw=Buffer.from([122,90,154,255,90,154,154,128,200,80,30,255]);
  const layers=splitMaterials(raw,['primary','skin','detail'],material);
  for(let p=0;p<raw.length;p+=4)assert.equal(Object.values(layers).reduce((sum,data)=>sum+data[p+3],0),raw[p+3]);
  assert.equal(layers.primary[0],layers.primary[1]);assert.equal(layers.primary[1],layers.primary[2]);
  assert.deepEqual(layers.detail.subarray(8),raw.subarray(8));
  assert.throws(()=>splitMaterials(raw,['primary','skin'],material),/Undeclared detail/);
});

test('material boundaries add coverage rather than punching a transparent seam',()=>{
  const mixed=combineMaterials([{data:Uint8Array.from([180,180,180,128]),tint:0xff0000},{data:Uint8Array.from([180,180,180,127]),tint:0x0000ff}]);
  assert.deepEqual([...mixed],[90,0,90,255]);
  const output=over(Uint8ClampedArray.from([0,255,0,255]),mixed);
  assert.deepEqual([...output],[90,0,90,255]);
  assert.throws(()=>combineMaterials([{data:new Uint8Array(4)},{data:new Uint8Array(8)}]),/dimensions/);
});

test('recipes migrate legacy values deterministically and reject unknown v2 values',()=>{
  const catalogue=fixture(),legacy={hair:'#48372E',skin:'#D6A07D',outfit:'#326A65',parts:{hairstyle:'waves',jacket:'travel',bottom:'straight',pants:'#44464d'}};
  const recipe=normalizeAvatar(legacy,catalogue);
  assert.equal(recipe.v,2);assert.equal(recipe.parts.hair,'waves');assert.equal(recipe.parts.outer,'travel');assert.equal(recipe.colors['outer.primary'],'#326a65');
  assert.deepEqual(recipeErrors(recipe,catalogue),[]);assert.deepEqual(normalizeAvatar(recipe,catalogue),recipe);
  assert.match(recipeErrors({...recipe,parts:{...recipe.parts,headwear:'deleted'}},catalogue).join(),/Unknown option/);
  assert.match(recipeErrors({...recipe,colors:{...recipe.colors,'unknown.primary':'#123456'}},catalogue).join(),/Unknown colour key/);
  assert.match(recipeErrors({...recipe,hair:'#nothex'},catalogue).join(),/six-digit/);
  assert.match(recipeErrors({...recipe,parts:{...recipe.parts,bogus:null}},catalogue).join(),/Unknown slot/);
});

test('resolver enforces dresses, bun exclusions, full versus crown hides, coverage and facing order',()=>{
  const catalogue=fixture(),recipe=normalizeAvatar({hair:'#48372e',skin:'#d6a07d'},catalogue);
  recipe.parts={...recipe.parts,hair:'waves',headwear:'cap',top:'dress',bottom:'straight',outer:'travel',neck:'scarf',bag:'satchel',held:'lantern'};
  let resolved=resolveRecipe(recipe,'down',catalogue);
  assert.ok(!resolved.layers.some(p=>p.slot==='hair'||p.slot==='bottom'));
  assert.equal(resolved.disabled.bottom.reason,'occupied');
  assert.equal(normalizeAvatar(recipe,catalogue).parts.bottom,null);
  recipe.parts.hair='bun';resolved=resolveRecipe(recipe,'down',catalogue);
  assert.ok(resolved.layers.some(p=>p.id==='hair-bun'));assert.ok(!resolved.layers.some(p=>p.slot==='headwear'));
  assert.equal(resolved.disabled.headwear.reason,'excluded');
  recipe.parts.hair='waves';recipe.parts.headwear='open';recipe.parts.top=null;
  resolved=resolveRecipe(recipe,'up',catalogue);
  assert.ok(resolved.layers.some(p=>p.id==='hair-waves'));assert.equal(resolved.layers[0].slot,'held');assert.equal(resolved.layers.at(-1).slot,'bag');
  assert.deepEqual(resolved.overlaps,[{by:'outer-travel',slot:'bottom',coverage:'upper'}]);
});

test('texture identity ignores object key order and includes asset version and material colours',()=>{
  const catalogue=fixture(),recipe=normalizeAvatar({},catalogue),reversed={...recipe,parts:Object.fromEntries(Object.entries(recipe.parts).reverse()),colors:Object.fromEntries(Object.entries(recipe.colors).reverse())};
  assert.equal(avatarTextureKey(recipe,catalogue),avatarTextureKey(reversed,catalogue));
  assert.notEqual(avatarTextureKey(recipe,catalogue),avatarTextureKey({...recipe,skin:'#123456'},catalogue));
  assert.notEqual(avatarTextureKey(recipe,catalogue),avatarTextureKey(recipe,{...catalogue,assetVersion:'v2'}));
});

test('compositor selects the same registered frame from each material and rejects malformed sheets',()=>{
  const data=new Uint8Array(9*4*4);for(let i=0;i<36;i++)data.set([i,0,0,255],i*4);
  const layers=[{id:'body',materials:['skin'],tints:{skin:0xffffff}}],images=new Map([['body.skin',{data,width:9,height:4}]]);
  assert.deepEqual([...composeFrame(layers,images,35,1,1)],[35,0,0,255]);
  assert.throws(()=>composeFrame(layers,new Map(),0,1,1),/Missing or malformed/);
  assert.throws(()=>composeFrame(layers,images,36,1,1),/0..35/);
});

test('compiled catalogue is deterministic, approved-only and refuses duplicate IDs and invalid rules',async()=>{
  const source=await readJSON(resolve(root,'art/source/character-kit/catalogue.json')),manifest=await readJSON(resolve(root,'web/public/assets/character-kit/manifest.json'));
  assert.deepEqual(compileCatalogue(source,manifest),compileCatalogue({...source,entries:[...source.entries].reverse()},manifest));
  const rejected=structuredClone(source);rejected.entries[1].status='rejected';assert.equal(compileCatalogue(rejected,manifest).components.length,source.entries.filter(entry=>entry.status==='approved'&&(entry.poseSet??'walk')==='walk'&&!entry.expression).length-1);
  const bad=structuredClone(source);bad.entries.push(bad.entries[0]);assert.throws(()=>validateCatalogue(bad),/duplicate/);
  bad.entries.pop();bad.entries[0].excludes=['bogus'];assert.throws(()=>validateCatalogue(bad),/excludes/);
  const occluded=structuredClone(source),hair=occluded.entries.find(entry=>entry.slot==='hair');
  hair.validation={maxRegionsByFacing:{down:2},regionReason:'Tail occluded by the head'};
  assert.doesNotThrow(()=>validateCatalogue(occluded));
  for(const policy of [{down:5},{diagonal:2},{right:0},[]]){
    hair.validation.maxRegionsByFacing=policy;
    assert.throws(()=>validateCatalogue(occluded),/facing region/);
  }
  hair.validation={maxRegionsByFacing:{down:2}};
  assert.throws(()=>validateCatalogue(occluded),/facing region/);
  delete hair.validation;
  occluded.entries.find(entry=>entry.slot==='body').validation={maxRegionsByFacing:{down:2},regionReason:'Not allowed for bodies'};
  assert.throws(()=>validateCatalogue(occluded),/facing region/);
  assert.throws(()=>compileCatalogue(source,{...manifest,assets:[]}),/Missing or stale export/);
  const changed=structuredClone(source);changed.entries[0].label='Changed label';assert.notEqual(compileCatalogue(source,manifest).assetVersion,compileCatalogue(changed,manifest).assetVersion);
});

test('export refuses failed checks without creating output and approvals reject edited reviewed pixels',async()=>{
  const temp=await mkdtemp(resolve(tmpdir(),'character-export-'));
  try{
    await assert.rejects(exportComponent({root:temp},{},{id:'bad',valid:false,errors:['missing frame']},{}),/export refused/);
    const source=await readJSON(resolve(root,'art/source/character-kit/catalogue.json'));
    await verifyApproval(root,source.entries[0]);
    const invalid=structuredClone(source.entries[0]);invalid.review.lockedSha256='bad';await assert.rejects(verifyApproval(root,invalid),/source has changed/);
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('native approval rejects control-only and fully hidden component proofs',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'character-native-review-'));
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  try{
    const bytes=Buffer.from('immutable reviewed fixture');
    for(const path of ['locked.png','proof.png','walk.gif','native.png'])await writeFile(resolve(dir,path),bytes);
    const report={valid:true,checks:[{valid:true}],sources:{},ruleTrace:[{board:0,visible:['companion'],hidden:[]},{board:2,visible:['shirt','companion'],hidden:[]}],nativeProofs:Array.from({length:18},(_,i)=>({image:'native.png',imageSha256:sha(bytes),cell:[512,768],board:0,frames:Array.from({length:4},(_,n)=>(i*4+n)%36)}))};
    const entry={id:'shirt',status:'approved',locked:'locked.png',authoring:{kind:'native-repaint'},review:{result:'approved',lockedSha256:sha(bytes),proofs:[{image:'proof.png',imageSha256:sha(bytes),walk:'walk.gif',walkSha256:sha(bytes),report:'proof.json'}]}};
    const save=async()=>{const data=JSON.stringify(report);await writeFile(resolve(dir,'proof.json'),data);entry.review.proofs[0].reportSha256=sha(data);};
    await save();await assert.rejects(verifyApproval(dir,entry),/does not include the reviewed component/);
    for(const page of report.nativeProofs)page.board=2;
    await save();await verifyApproval(dir,entry);
    report.ruleTrace[1]={board:2,visible:['companion'],hidden:['shirt']};
    await save();await assert.rejects(verifyApproval(dir,entry),/component visible/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('catalogue validates material-facing exceptions before compilation',async()=>{
  const source=await readJSON(resolve(root,'art/source/character-kit/catalogue.json'));
  const outer=source.entries.find(entry=>entry.id==='outer-travel');
  outer.validation={materialFacings:{primary:['down','right','left']},materialCountByFacing:['secondary'],materialReason:'Front-only cloth and a smaller rear collar.'};
  assert.doesNotThrow(()=>validateCatalogue(source));
  for(const change of [
    {materialFacings:{unknown:['down']}},
    {materialFacings:{primary:['diagonal']}},
    {materialFacings:{primary:[]}},
    {materialCountByFacing:['secondary','secondary']},
    {materialReason:''},
    {visibleFacings:['down'],visibilityReason:'Front only',materialFacings:{primary:['up']}},
  ]){
    const invalid=structuredClone(source);
    Object.assign(invalid.entries.find(entry=>entry.id===outer.id).validation,change);
    assert.throws(()=>validateCatalogue(invalid),/material visibility/);
  }
  const body=source.entries.find(entry=>entry.slot==='body');
  body.validation={materialCountByFacing:['skin'],materialReason:'Forbidden relaxation of mannequin validation'};
  assert.throws(()=>validateCatalogue(source),/mannequins/);
});

test('runtime/editor sheets have all 36 frames',async()=>{
  const catalogue=JSON.parse(await readFile(resolve(root,'server/character-kit.json')));
  assert.deepEqual(catalogue.format.runtimeCell,[384,576]);
  assert.deepEqual(catalogue.format.editorCell,[512,768]);
  for(const component of [...catalogue.components,...Object.values(catalogue.poseSets??{}).flatMap(pose=>pose.components),...Object.values(catalogue.expressions??{}).flatMap(expression=>expression.components)])for(const sheet of Object.values(component.sheets)){
    for(const resolution of ['runtime','editor'])for(const page of characterSheetPages(sheet,resolution,catalogue.format[`${resolution}Cell`])){
      const bytes=await readFile(resolve(root,'web/public',catalogue.assetBase.slice(1),page.path));
      const image=await sharp(bytes).metadata();
      assert.deepEqual([image.width,image.height],[page.width,page.height]);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),page.sha256);
    }
  }
});

test('dress outfit proofs keep mannequin legs when occupancy suppresses legacy trousers',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'character-dress-proof-')),out=resolve(dir,'dress.png');
  try{
    execFileSync(process.execPath,[resolve(root,'scripts/character-kit.mjs'),'proof','top-dress-day','--with','face-soft,hair-bob,footwear-boots','--out',out],{cwd:root,stdio:'pipe'});
    const report=await readJSON(out.replace('.png','.json'));
    assert.equal(report.valid,true);
    const sheet=await sharp(out).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    // The default jacket may change the upper body only. Every calf/boot pixel
    // must match the full mannequin board in both palettes, through the walk.
    for(let row=0;row<4;row++)for(let y=140;y<192;y++){
      const start=((row*192+y)*sheet.info.width)*4;
      const lower=start+768*sheet.info.width*4;
      assert.deepEqual(sheet.data.subarray(start,start+sheet.info.width*4),sheet.data.subarray(lower,lower+sheet.info.width*4));
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('pose variants compile separately from walking options and require matching pose exports and mannequins',async()=>{
  const source=await readJSON(resolve(root,'art/source/character-kit/catalogue.json'));
  source.entries=source.entries.filter(e=>(e.poseSet??'walk')==='walk');
  const manifest=await readJSON(resolve(root,'web/public/assets/character-kit/manifest.json'));
  const before=compileCatalogue(source,manifest);
  source.poseSets={wave:{label:'Wave',rowDescription:'rest, lift, five waves, lower, rest',frameDurations:[650,130,130,130,130,130,130,130,650]}};
  source.builds.regular.poseSets={wave:{master:'wave-master.png',mannequin:'wave-body.png',registration:'wave-registration.json',masks:'wave-masks.json'}};
  manifest.poseSets={wave:source.poseSets.wave};
  for(const id of ['body-regular','top-shirt']){
    const entry=structuredClone(source.entries.find(e=>e.id===id));entry.id+='-wave';entry.poseSet='wave';source.entries.push(entry);
    const asset=structuredClone(manifest.assets.find(e=>e.id===id));asset.id+='-wave';asset.poseSet='wave';manifest.assets.push(asset);
  }
  const compiled=compileCatalogue(source,manifest);
  assert.deepEqual(compiled.components,before.components);
  assert.deepEqual(compiled.poseSets.wave.components.map(p=>p.id),['body-regular-wave','top-shirt-wave']);
  assert.deepEqual(compiled.poseSets.wave.builds,['regular']);
  assert.notEqual(compiled.assetVersion,before.assetVersion);
  const wrong=structuredClone(manifest);delete wrong.assets.at(-1).poseSet;
  assert.throws(()=>compileCatalogue(source,wrong),/Missing or stale export/);
  const missingBody=structuredClone(source);missingBody.entries.find(e=>e.id==='body-regular-wave').status='candidate';
  assert.throws(()=>compileCatalogue(missingBody,manifest),/No approved mannequin.*regular\/wave/);
  const invalid=structuredClone(source);invalid.poseSets.wave.frameDurations=[130];
  assert.throws(()=>validateCatalogue(invalid),/Invalid pose set/);
  for(const requiredParts of [null,[],{body:'regular'},{unknown:'lantern'},{held:'../lantern'}]) {
    const invalidRequirement=structuredClone(source);invalidRequirement.poseSets.wave.requiredParts=requiredParts;
    assert.throws(()=>validateCatalogue(invalidRequirement),/Invalid required parts/);
  }
  delete source.builds.regular.poseSets.wave.masks;
  assert.throws(()=>validateCatalogue(source),/Incomplete references/);
});

test('native action faces share global skin colour without introducing new piece colours',async()=>{
  const source=await readJSON(resolve(root,'art/source/character-kit/hd/catalogue.json'));
  const manifest=await readJSON(resolve(root,'web/public/assets/character-kit-hd/manifest.json'));
  const compiled=compileCatalogue(source,manifest);
  const face=compiled.poseSets.wave.components.find(p=>p.slot==='face');
  assert.equal(face.tints.skin,'skin');
  assert.ok(!compiled.colorKeys.includes('face.skin'));
  const changed=structuredClone(manifest);
  changed.assets.find(p=>p.id===face.id).materials.push('primary');
  assert.throws(()=>compileCatalogue(source,changed),/Pose materials change the recipe contract/);
});

test('expression exports stay separate from face identities and bind to a neutral face contract',async()=>{
  const source=await readJSON(resolve(root,'art/source/character-kit/catalogue.json')),manifest=await readJSON(resolve(root,'web/public/assets/character-kit/manifest.json'));
  const compiled=compileCatalogue(source,manifest),smile=compiled.expressions.smile.components.find(p=>p.optionId==='soft');
  assert.equal(smile.id,'face-soft-smile');assert.ok(!compiled.components.some(p=>p.expression));
  assert.ok(Object.values(compiled.poseSets).every(p=>p.components.every(c=>!c.expression)));
  const candidate=structuredClone(source);candidate.entries.find(e=>e.id===smile.id).status='candidate';
  assert.equal(compileCatalogue(candidate,manifest).expressions.smile,undefined);
  const stale=structuredClone(manifest);delete stale.assets.find(e=>e.id===smile.id).expression;
  assert.throws(()=>compileCatalogue(source,stale),/stale export/);
  for(const change of [{slot:'hair'},{poseSet:'wave'},{materials:['primary']},{expression:'neutral'},{expression:'unknown'}]){
    const invalid=structuredClone(source);Object.assign(invalid.entries.find(e=>e.id===smile.id),change);
    assert.throws(()=>validateCatalogue(invalid),/expression|Expressions/i);
  }
  const changed=structuredClone(source);changed.entries.find(e=>e.id===smile.id).hides=['hair'];
  assert.throws(()=>compileCatalogue(changed,manifest),/Expression changes face contract/);
  const orphan=structuredClone(source);orphan.entries.find(e=>e.id==='face-soft').status='candidate';
  assert.throws(()=>compileCatalogue(orphan,manifest),/No approved neutral face/);
});

test('declared hair shadows share the tint mask without losing authored luminance or alpha',()=>{
  const paint=Buffer.from([28,30,55,255,122,90,154,180]);
  const split=splitMaterials(paint,['primary','detail'],material,'primary');
  assert.equal(split.primary[3],255);assert.equal(split.primary[7],180);
  assert.equal(split.primary[0],split.primary[1]);assert.equal(split.primary[1],split.primary[2]);
  assert.ok(split.primary[0]<split.primary[4]);assert.ok(split.detail.every(value=>value===0));
  const neutral=splitMaterials(paint,['primary','detail'],material);
  assert.deepEqual([...neutral.detail.subarray(0,4)],[28,30,55,255]);
});
