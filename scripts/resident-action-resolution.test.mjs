import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {RESIDENT_ACTION_ART} from '../web/src/resident-action-art.ts';
import {explorationZoom,conversationZoom} from '../web/src/world-camera.ts';
import {isTransparentChromaNoise,removeTransparentChromaNoise} from './prepare-resident-action-art.mjs';

test('matte cleanup clears quantized transparent chroma while retaining real paint and antialiasing',()=>{
  const source=Buffer.from([
    255,0,0,1, 255,255,0,4, 0,255,255,2, 255,0,255,3,
    238,197,156,3, 87,70,56,2, 210,174,86,4,
    255,0,0,5, 255,255,0,255, 235,185,144,255,
  ]);
  const original=Buffer.from(source),clean=removeTransparentChromaNoise(source);
  assert.deepEqual(source,original,'the original source remains untouched');
  assert.deepEqual(clean.data.subarray(0,16),Buffer.alloc(16));
  assert.deepEqual(clean.data.subarray(16),original.subarray(16),'skin, hair, cloth and ordinary feathering remain exact');
  assert.deepEqual(clean.report,{removedPixels:4,removedAlphaTotal:10,maxRemovedAlpha:4});
});

test('all native action matte repairs preserve painted pixels and remove their source artifacts',async()=>{
  for(const look of ['anne','ella','karl','mila']){
    const {data}=await sharp(`art/source/resident-actions/${look}.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const clean=removeTransparentChromaNoise(data);
    assert.ok(clean.report.removedPixels>0,`${look}: source contains the reported matte contamination`);
    for(let p=0;p<data.length;p+=4){
      if(isTransparentChromaNoise(...data.subarray(p,p+4))){
        assert.equal(clean.data.readUInt32LE(p),0,`${look}: contaminated pixel ${p/4} is transparent`);
      }else{
        assert.equal(clean.data.readUInt32LE(p),data.readUInt32LE(p),`${look}: painted or ordinary antialiased pixel ${p/4} is unchanged`);
      }
    }
    const report=JSON.parse(await readFile(`art/source/resident-actions/${look}-export.json`,'utf8'));
    assert.deepEqual(report.matte.native,clean.report);
  }
});

test('all 48 activity poses retain native detail and cover their actual outdoor display sizes',async()=>{
  const art=RESIDENT_ACTION_ART;
  for(const [width,height] of [[390,844],[1440,900],[1920,1080],[2560,1440]]){
    const zoom=conversationZoom(explorationZoom(width*2,height*2,2).zoom,true);
    assert.ok(art.bodyHeight>=72*zoom,`${width}×${height} Retina`);
  }
  for(const look of ['anne','ella','karl','mila']){
    const report=JSON.parse(await readFile(`art/source/resident-actions/${look}-export.json`,'utf8'));
    assert.equal(report.sourceSha256,createHash('sha256').update(await readFile(report.source)).digest('hex'));
    assert.equal(report.frames.length,12);
    assert.ok(report.frames.every(frame=>frame.registration.scale<=1));
    assert.deepEqual(report.runtimeSize,[art.width*4,art.height*3]);
    const atlas=JSON.parse(await readFile(`web/public/assets/resident-actions/${look}.json`,'utf8'));
    const image=await sharp(`web/public/assets/resident-actions/${look}.webp`).metadata();
    assert.deepEqual([image.width,image.height],report.runtimeSize);
    for(const frame of Object.values(atlas.frames))assert.deepEqual(frame.sourceSize,{w:art.width,h:art.height});
    const rgba=await sharp(`web/public/assets/resident-actions/${look}.webp`).ensureAlpha().raw().toBuffer();
    for(const [name,{frame}]of Object.entries(atlas.frames)){
      let coverage=0,chromaNoise=0;
      for(let y=frame.y;y<frame.y+frame.h;y++)for(let x=frame.x;x<frame.x+frame.w;x++){
        const p=(y*image.width+x)*4;
        if(rgba[p+3]>=96)coverage++;
        if(isTransparentChromaNoise(...rgba.subarray(p,p+4)))chromaNoise++;
      }
      assert.ok(coverage>15000,`${look}/${name}: native figure retains substantial painted coverage`);
      assert.equal(chromaNoise,0,`${look}/${name}: runtime matte contains no saturated transparent fringe`);
    }
  }
});
