import test from 'node:test';
import assert from 'node:assert/strict';
import {matchTranslation,coverCrown} from './character-kit-hd-alignment.mjs';

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

test('crown coverage registers the broad scalp covering below a tall bun without altering source pixels',()=>{
 const width=128,height=128,base=Buffer.alloc(width*height*4,255),candidate=Buffer.from(base);
 const fill=(data,left,top,w,h,color)=>{for(let y=top;y<top+h;y++)for(let x=left;x<left+w;x++){const p=(y*width+x)*4;data[p]=color[0];data[p+1]=color[1];data[p+2]=color[2];}};
 fill(base,40,40,48,50,[90,154,154]);
 fill(candidate,40,57,48,42,[122,90,154]);
 fill(candidate,58,24,12,40,[122,90,154]);
 const frame={headBounds:{left:40,top:40,right:88,bottom:90},transform:{scale:1,offset:{x:0,y:0},sourceCell:{left:0,top:0,width,height}}};
 const before=Buffer.from(candidate),match=coverCrown(base,candidate,width,frame,{x:0,y:0,error:1,initial:2});
 assert.equal(match.x,0);assert.equal(match.y,-14);assert.equal(match.crownCoverage.after,1);
 assert.deepEqual(candidate,before);
 assert.equal(coverCrown(base,candidate,width,frame,{x:0,y:-20,error:1,initial:2}).y,-20);
});

test('crown coverage counts keyed hat bands and leaves an unresolved anchor for visual review',()=>{
 const width=128,height=128,base=Buffer.alloc(width*height*4,255),candidate=Buffer.from(base);
 for(let y=40;y<85;y++)for(let x=40;x<88;x++){const p=(y*width+x)*4;base[p]=90;base[p+1]=154;base[p+2]=154;candidate[p]=90;candidate[p+1]=154;candidate[p+2]=106;}
 const frame={headBounds:{left:40,top:40,right:88,bottom:85},transform:{scale:1,offset:{x:0,y:0},sourceCell:{left:0,top:0,width,height}}},match={x:0,y:0,error:1,initial:2};
 assert.deepEqual(coverCrown(base,candidate,width,frame,match),match);
 const unresolved=coverCrown(base,Buffer.alloc(base.length,255),width,frame,match);
 assert.equal(unresolved.y,0);assert.equal(unresolved.crownCoverage.unresolved,true);
});
