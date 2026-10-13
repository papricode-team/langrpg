import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {characterCatalogue as cat,normalizeAvatar,availableFaceExpressions} from '../web/src/character-recipe.mjs';
import {playerPortraitPixels,playerPortraitPlan} from '../web/src/player-portrait-compositor.mjs';
import {validateCoverage,cleanCell} from './build-player-portraits.mjs';
const art=JSON.parse(await readFile('web/src/data/player-portraits.json'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const cache=new Map();
async function load(url,width,height){
 assert.ok(url.startsWith('/assets/player-portraits/'),'Portrait must never load a walking sheet');assert.equal(width,256);assert.equal(height,256);
 if(!cache.has(url)){const {data,info}=await sharp('web/public'+url.split('?')[0]).ensureAlpha().raw().toBuffer({resolveWithObject:true});cache.set(url,{data,width:info.width,height:info.height});}return cache.get(url);
}
const recipe=parts=>normalizeAvatar({v:2,build:'regular',parts:{face:'oval',hair:'waves',outer:'travel',...parts}});
const render=(value,expression='neutral')=>playerPortraitPixels(value,expression,load);
test('every customizable component and expression has explicit portrait coverage',()=>{
 validateCoverage(cat,art);assert.equal(Object.keys(art.components).length,102);
 const missing=structuredClone(art);delete missing.components['hair-bob'];assert.throws(()=>validateCoverage(cat,missing),/Missing.*hair-bob/);
 const undersized=structuredClone(art);undersized.components['face-oval'].nativeCell=51;assert.throws(()=>validateCoverage(cat,undersized),/Invalid native/);
 assert.throws(()=>validateCoverage(cat,{...art,sourceCatalogue:'old'}),/stale/);
});
test('published sheets are exact 256px derivatives with retained native sources and prompts',async()=>{
 for(const source of art.sources){assert.equal(hash(await readFile(source.path)),source.sha256);assert.equal(hash(await readFile(source.prompt)),source.promptSha256);assert.ok(source.path.includes('/candidates/'));assert.ok(source.nativeCell>=256);}
 for(const part of Object.values(art.components).filter(p=>!p.outsideCrop)){
  assert.ok(part.registration.paint.width>=part.registration.target.width);assert.ok(part.registration.paint.height>=part.registration.target.height);
  for(const sheet of Object.values(part.sheets)){const bytes=await readFile('web/public/assets/player-portraits/'+sheet.path);assert.equal(hash(bytes),sheet.sha256);const info=await sharp(bytes).metadata();assert.equal(info.width,256);assert.equal(info.height,256);assert.equal(info.hasAlpha,true);}
 }
});
test('all builds, all options and authored expressions compose without walking assets or recipe mutation',async()=>{
 for(const part of cat.components){const value=normalizeAvatar({v:2,build:part.build,parts:{[part.slot]:part.optionId}});const before=JSON.stringify(value);const pixels=await render(value);assert.equal(pixels.width,256);assert.equal(pixels.height,256);assert.ok(pixels.data.some((v,i)=>i%4===3&&v>0));assert.equal(JSON.stringify(value),before);}
 const value=recipe({face:'soft'}),results=[];for(const expression of ['neutral',...availableFaceExpressions(value)])results.push(hash((await render(value,expression)).data));assert.equal(new Set(results).size,3);
});
test('full hat hides and hairstyle exclusions match world recipes',async()=>{
 const cap=recipe({headwear:'cap'}),baldCap=recipe({headwear:'cap',hair:null});assert.deepEqual((await render(cap)).data,(await render(baldCap)).data);
 const bun=recipe({hair:'bun',headwear:'cap'}),bareBun=recipe({hair:'bun'});assert.deepEqual((await render(bun)).data,(await render(bareBun)).data);
 for(const hair of cat.components.filter(p=>p.build==='regular'&&p.slot==='hair'))for(const hat of cat.components.filter(p=>p.slot==='headwear')){
  const value=recipe({hair:hair.optionId,headwear:hat.optionId});const layers=playerPortraitPlan(value);const pixels=await render(value);assert.equal(pixels.data.length,256*256*4);if(layers.some(l=>l.slot==='headwear'&&l.hides.includes('hair')))assert.ok(!layers.some(l=>l.slot==='hair'));
 }
});
test('skin, hair and both garment material colors affect their detailed portrait layers',async()=>{
 const value=recipe({top:'blouse',outer:null}),original=(await render(value)).data;
 for(const mutate of [v=>v.skin='#452312',v=>v.hair='#ccac44',v=>v.colors['top.primary']='#d02a2a',v=>v.colors['top.secondary']='#1672dc']){const changed=structuredClone(value);mutate(changed);assert.notDeepEqual((await render(changed)).data,original);}
 const withoutBag=recipe({bag:null}),belt=recipe({bag:'belt-pouch'});assert.deepEqual((await render(withoutBag)).data,(await render(belt)).data);
});
test('cell cleanup removes adjacent boundary strips while preserving interior marks',()=>{
 const data=Buffer.alloc(40*40*4);for(let x=0;x<40;x++)data[(x)*4+3]=255;
 for(let y=18;y<21;y++)for(let x=18;x<21;x++)data[(y*40+x)*4+3]=255;
 const result=cleanCell(data,40,40);assert.equal(result[3],0);assert.equal(result[(19*40+19)*4+3],255);
});
