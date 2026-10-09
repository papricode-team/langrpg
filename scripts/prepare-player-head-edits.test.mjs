import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { assertDimensions, cleanDetachedSkin, combineDisjointSkin, drift, driftErrors, editableGeometry, hairLayer, hairReport, isEditable } from './prepare-player-head-edits.mjs';

const frame={headBounds:{left:54,right:74,top:30,bottom:54},neck:{x:64,y:54},transform:{scale:1,offset:{x:0,y:0},sourceCell:{left:0,top:0,width:128,height:192}}};
const image=()=>({data:Buffer.alloc(128*192*4),info:{width:128,height:192}});
const paint=(data,x,y,color)=>data.set(color,(y*128+x)*4);

test('long editable masks cannot enter another native grid cell',()=>{
  const small={headBounds:{left:6,right:10,top:2,bottom:14},neck:{x:8,y:14},transform:{scale:1,offset:{x:0,y:0},sourceCell:{left:0,top:0,width:16,height:16}}};
  const mask=editableGeometry(small);
  assert.equal(isEditable(mask,8,15),true);
  assert.equal(isEditable(mask,8,16),false);
  assert.equal(isEditable(mask,8,20),false);
  assert.equal(isEditable(mask,-1,8),false);
});

test('output dimensions must match exactly instead of stretching the grid',()=>{
  assert.throws(()=>assertDimensions({info:{width:1536,height:1000}},{width:1536,height:1024}),/registration grid cannot be resized/);
});

test('RGB body changes are detected outside the actual ellipse even with identical alpha',()=>{
  const base=image(),edit=image();
  paint(base.data,32,100,[80,90,100,255]);paint(edit.data,32,100,[200,10,20,255]);
  // This point is inside the old rectangular head box, outside its edit ellipse.
  assert.equal(isEditable(editableGeometry(frame),32,100),false);
  paint(base.data,64,30,[100,100,100,255]);paint(edit.data,64,30,[250,30,230,255]);
  const report=drift(frame,edit,base);
  assert.equal(report.visiblePixels,1);
  assert.equal(report.meanAlpha,0);
  assert.ok(report.meanPremultipliedRGB>80);
  assert.ok(driftErrors(report).length>0);
});

test('transparent backing RGB and small visible compression noise are tolerated',()=>{
  const base=image(),edit=image();
  paint(base.data,20,140,[255,220,180,0]);paint(edit.data,20,140,[0,10,230,0]);
  assert.equal(drift(frame,edit,base).visiblePixels,0);
  for(let y=120;y<150;y++)for(let x=30;x<60;x++){paint(base.data,x,y,[80,90,100,255]);paint(edit.data,x,y,[82,93,101,255]);}
  assert.deepEqual(driftErrors(drift(frame,edit,base)),[]);
});

test('protected alpha changes are detected even when the stored RGB is unchanged',()=>{
  const base=image(),edit=image();
  paint(base.data,40,130,[80,90,100,255]);paint(edit.data,40,130,[80,90,100,80]);
  const report=drift(frame,edit,base);
  assert.equal(report.meanAlpha,175);
  assert.ok(driftErrors(report).length>0);
});

test('hair extraction keeps keyed scalp paint and attached neutral shading, excluding facial edits and detached paint',()=>{
  const base=image(),edit=image();
  for(let y=30;y<55;y++)for(let x=54;x<74;x++)paint(base.data,x,y,[180,125,90,255]);
  base.data.copy(edit.data);
  for(let y=27;y<31;y++)for(let x=54;x<75;x++)paint(edit.data,x,y,[140,40,200,255]);
  for(let y=31;y<35;y++)for(let x=56;x<60;x++)paint(edit.data,x,y,[35,35,35,255]);
  for(let y=44;y<47;y++)for(let x=61;x<65;x++)paint(edit.data,x,y,[25,25,25,255]);
  paint(edit.data,64,39,[150,100,65,255]);
  for(let y=90;y<94;y++)for(let x=54;x<58;x++)paint(edit.data,x,y,[140,40,200,255]);
  const hair=hairLayer(frame,edit.data,base.data),alpha=(x,y)=>hair[(y*128+x)*4+3];
  assert.equal(alpha(60,28),255);
  assert.equal(alpha(57,33),255);
  assert.equal(alpha(63,45),0);
  assert.equal(alpha(64,39),0);
  assert.equal(alpha(55,92),0);
  assert.equal(hairReport(frame,hair).valid,true);
  assert.equal(hairReport(frame,Buffer.alloc(hair.length)).valid,false);
});

test('skin masks merge without altering source color, alpha, or silhouette',()=>{
  const head=Buffer.from([0,0,0,0,110,110,110,252,0,0,0,0]);
  const hands=Buffer.from([0,0,0,0,0,0,0,0,180,180,180,249]);
  assert.deepEqual(combineDisjointSkin(head,hands),Buffer.from([0,0,0,0,110,110,110,252,180,180,180,249]));
  assert.throws(()=>combineDisjointSkin(head,head),/overlap/);
});

test('merging skin before downsampling preserves the opaque neck boundary',async()=>{
  const head=Buffer.alloc(2*2*4),hands=Buffer.alloc(head.length);
  for(let x=0;x<2;x++){
    head.set([170,170,170,252],x*4);
    hands.set([170,170,170,252],(2+x)*4);
  }
  const sample=data=>sharp(data,{raw:{width:2,height:2,channels:4}}).resize(1,1,{kernel:'cubic'}).raw().toBuffer();
  const [separateHead,separateHands,joined]=await Promise.all([sample(head),sample(hands),sample(combineDisjointSkin(head,hands))]);
  const separateAlpha=separateHead[3]+separateHands[3]*(1-separateHead[3]/255);
  assert.ok(separateAlpha<200,'independently interpolated masks reproduce the visible coverage loss');
  assert.equal(joined[3],252,'the merged atlas retains the original painted coverage');
  assert.equal(joined[0],170,'the common skin shading is unchanged');
});

test('the identified detached boot fragment is removed while actual hands and face pixels remain exact',async()=>{
  const image=await sharp(new URL('../web/public/assets/player-layers/hands-skin-preview.webp',import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true}),manifest=JSON.parse(await readFile(new URL('../web/public/assets/player-layers/manifest.json',import.meta.url),'utf8')),cell=Buffer.alloc(128*192*4);
  for(let y=0;y<192;y++){const at=((3*192+y)*image.info.width+4*128)*4;image.data.copy(cell,y*128*4,at,at+128*4);}
  paint(cell,64,42,[45,45,45,250]);
  const result=cleanDetachedSkin(manifest.frames[31],cell,31);
  assert.equal(result.removed.positiveAlphaPixels,65);
  assert.equal(result.removed.highAlphaPixels,41);
  for(let p=0;p<cell.length;p+=4){const x=p/4%128,y=Math.floor(p/4/128);if(x>=107&&x<=118&&y>=133&&y<=140&&cell[p+3])assert.deepEqual(Array.from(result.data.subarray(p,p+4)),[0,0,0,0]);else assert.deepEqual(result.data.subarray(p,p+4),cell.subarray(p,p+4));}
  assert.deepEqual(cleanDetachedSkin(manifest.frames[31],result.data,31).data,result.data);
  assert.throws(()=>cleanDetachedSkin(manifest.frames[31],cell,30),/requires review/);
  paint(cell,90,150,[100,100,100,250]);
  assert.throws(()=>cleanDetachedSkin(manifest.frames[31],cell,31),/requires review/);
});
