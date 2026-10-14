import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {packCharacterAtlas,packCharacterAtlasPages} from './character-atlas.mjs';

test('trimmed frames preserve native pixels, soft alpha and the original foot anchor',async()=>{
  const width=16,height=24,columns=3,count=6,data=Buffer.alloc(width*columns*height*2*4);
  for(let frame=0;frame<count;frame++)for(let y=3+frame;y<height-2;y++)for(let x=2+frame;x<width-3;x++){
    const at=(((Math.floor(frame/columns)*height+y)*width*columns)+frame%columns*width+x)*4;
    data.set([x*13,y*7,frame*40,(x+y)%3?255:1],at);
  }
  const input=await sharp(data,{raw:{width:width*columns,height:height*2,channels:4}}).png().toBuffer();
  const packed=await packCharacterAtlas(input,[width,height],{columns,count,pageWidth:40});
  const decoded=await sharp(packed.image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<count;i++){
    const frame=packed.atlas.frames[i];assert.deepEqual(frame.sourceSize,{w:width,h:height});
    const restored=Buffer.alloc(width*height*4),r=frame.frame,s=frame.spriteSourceSize;
    for(let y=0;y<r.h;y++)decoded.data.copy(restored,((s.y+y)*width+s.x)*4,((r.y+y)*decoded.info.width+r.x)*4,((r.y+y)*decoded.info.width+r.x+r.w)*4);
    const original=await sharp(input).extract({left:i%columns*width,top:Math.floor(i/columns)*height,width,height}).raw().toBuffer();
    assert.deepEqual(restored,original,`frame ${i}`);
  }
  assert.ok(packed.textureBytes<data.length);
  await assert.rejects(packCharacterAtlas(input,[width+1,height],{columns,count}),/geometry/);
});

test('compressed atlas pages restore all 36 native frames and anchors across two-row and facing splits',async()=>{
  const width=32,height=48,columns=9,count=36,data=Buffer.alloc(width*columns*height*4*4);
  let seed=913;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24;};
  for(let frame=0;frame<count;frame++)for(let y=4+frame%5;y<height-3;y++)for(let x=2+frame%4;x<width-2;x++){
    const at=((Math.floor(frame/columns)*height+y)*width*columns+frame%columns*width+x)*4;
    data.set([random(),random(),random(),(x+y+frame)%7?255:1],at);
  }
  const input=await sharp(data,{raw:{width:width*columns,height:height*4,channels:4}}).png().toBuffer();
  const full=await packCharacterAtlas(input,[width,height]);
  const untouched=Buffer.from(input);
  for(const [maxBytes,expectedCount]of[[60_000,2],[32_000,4]]){
    assert.ok(full.image.length>maxBytes,'the original complete atlas must exceed the compressed budget');
    const packed=await packCharacterAtlasPages(input,[width,height],{maxBytes});
    assert.equal(packed.pages.length,expectedCount);
    assert.equal(packed.textureBytes,packed.pages.reduce((sum,page)=>sum+page.textureBytes,0));
    const seen=new Set();
    for(const page of packed.pages){
      assert.ok(page.image.length<=maxBytes);
      assert.ok(page.atlas.meta.size.w<=4096&&page.atlas.meta.size.h<=4096);
      assert.equal(page.frameCount,count/expectedCount);
      assert.equal(Object.keys(page.atlas.frames).length,page.frameCount);
      const decoded=await sharp(page.image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      for(let local=0;local<page.frameCount;local++){
        const index=page.firstFrame+local,frame=page.atlas.frames[local];
        assert.equal(seen.has(index),false);seen.add(index);
        assert.deepEqual(frame.sourceSize,{w:width,h:height});
        assert.deepEqual(frame.spriteSourceSize,{x:2+index%4,y:4+index%5,w:width-4-index%4,h:height-7-index%5});
        const restored=Buffer.alloc(width*height*4),r=frame.frame,s=frame.spriteSourceSize;
        for(let y=0;y<r.h;y++)decoded.data.copy(restored,((s.y+y)*width+s.x)*4,((r.y+y)*decoded.info.width+r.x)*4,((r.y+y)*decoded.info.width+r.x+r.w)*4);
        const original=await sharp(input).extract({left:index%columns*width,top:Math.floor(index/columns)*height,width,height}).raw().toBuffer();
        assert.deepEqual(restored,original,`native frame ${index} across ${expectedCount} pages`);
      }
    }
    assert.deepEqual([...seen].sort((a,b)=>a-b),Array.from({length:count},(_,index)=>index));
  }
  assert.deepEqual(input,untouched);
  const single=await packCharacterAtlasPages(input,[width,height],{maxBytes:full.image.length});
  assert.equal(single.pages.length,1);assert.equal(single.pages[0].frameCount,36);
  await assert.rejects(packCharacterAtlasPages(input,[width,height],{maxBytes:1}),/facing page exceeds/);
  await assert.rejects(packCharacterAtlasPages(input,[width,height],{maxBytes:0}),/positive integer/);
  await assert.rejects(packCharacterAtlasPages(input,[width+1,height]),/geometry/);
});
