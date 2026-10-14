import test from 'node:test';
import assert from 'node:assert/strict';
import {matchTranslation} from './character-kit-hd-alignment.mjs';

test('whole-frame registration recovers integer displacement using the face outline as well as skin',()=>{
  const width=96,height=96,base=Buffer.alloc(width*height*4,255),candidate=Buffer.from(base);
  for(let y=25;y<60;y++)for(let x=30;x<55-(y%7);x++){
    const p=(y*width+x)*4;base[p]=40+y;base[p+1]=110+x;base[p+2]=120+(x*y)%31;
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const nx=x+7,ny=y-9;if(nx>=width||ny<0)continue;
    base.copy(candidate,(ny*width+nx)*4,(y*width+x)*4,(y*width+x)*4+4);
  }
  const match=matchTranslation(base,candidate,width,{left:28,top:23,width:34,height:41},16);
  assert.deepEqual([match.x,match.y],[-7,9]);assert.equal(match.error,0);assert.ok(match.initial>0);
});

test('registration preserves exact alignment and rejects malformed geometry',()=>{
  const base=Buffer.alloc(32*32*4,255),box={left:4,top:4,width:24,height:24};
  assert.deepEqual(matchTranslation(base,base,32,box,16),{x:0,y:0,error:0,initial:0});
  assert.throws(()=>matchTranslation(base,base.subarray(4),32,box),/geometry/);
  assert.throws(()=>matchTranslation(base,base,32,{...box,left:20}),/outside/);
  assert.throws(()=>matchTranslation(base,base,32,{left:0,top:0,width:2,height:2}),/Insufficient/);
});
