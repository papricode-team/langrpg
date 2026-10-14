import test from 'node:test';
import assert from 'node:assert/strict';
import {characterResolutionErrors as errors, CHARACTER_RESOLUTION as policy} from '../web/src/character-resolution.mjs';
import {canonical} from './character-kit-pixels.mjs';
import {requireNativeDetail} from './character-kit-assets.mjs';

test('resolution gate rejects the former runtime, editor and enlarged portrait',()=>{
  assert.match(errors({nativeCell:[171,256],outputCell:[64,96],paintedHeight:71,surface:'world',authored:true}).join(),/404/);
  assert.match(errors({nativeCell:[171,256],outputCell:[128,192],surface:'editor',authored:true}).join(),/400/);
  assert.match(errors({nativeCell:[51,51],outputCell:[128,128],surface:'portrait',authored:true}).join(),/enlarge/);
  assert.match(errors({nativeCell:[1024,1024],outputCell:[512,512],surface:'portrait'}).join(),/authored/);
});

test('native detailed pages cover world zoom, Retina editor and dialogue portraits',()=>{
  assert.deepEqual(errors({nativeCell:policy.sourceCell,outputCell:policy.runtimeCell,paintedHeight:426,surface:'world',authored:true}),[]);
  assert.deepEqual(errors({nativeCell:policy.sourceCell,outputCell:policy.editorCell,surface:'editor',authored:true}),[]);
  assert.deepEqual(errors({nativeCell:[724,724],outputCell:[724,724],surface:'portrait',authored:true}),[]);
});

test('high-density sampling reads distinct native pixels instead of enlarging the legacy sample',()=>{
  const data=Buffer.alloc(512*768*4);
  for(let y=0;y<768;y++)for(let x=0;x<512;x++)data.set([x%2?240:20,y%2?220:30,0,255],(y*512+x)*4);
  const frame={transform:{scale:.25,offset:{x:0,y:0},sourceCell:{left:0,top:0,width:512,height:768}}};
  const sampled=canonical({data,info:{width:512,height:768}},frame,[512,768]);
  assert.deepEqual(sampled,data);
  assert.throws(()=>canonical({data,info:{width:512,height:768}},frame,[512,512]),/aspect/);
  assert.throws(()=>requireNativeDetail({id:'body',authoring:{kind:'resized-guide',pages:['guide']}},{frames:[frame]}),/native repaint/);
  assert.throws(()=>requireNativeDetail({id:'body',authoring:{kind:'native-repaint',pages:['paint']}},{frames:[{transform:{scale:.5}}]}),/enlarged/);
});

test('seated poses retain the same device-pixel density at their shorter registered height',()=>{
  const worldHeightRatio=110/policy.registeredStandingHeight;
  assert.deepEqual(errors({nativeCell:[640,896],outputCell:policy.runtimeCell,paintedHeight:330,worldHeightRatio,surface:'world',authored:true}),[]);
  assert.match(errors({nativeCell:[640,896],outputCell:[192,288],paintedHeight:165,worldHeightRatio,surface:'world',authored:true}).join(),/exported painted pixels/);
  assert.match(errors({nativeCell:[640,896],outputCell:policy.runtimeCell,paintedHeight:330,worldHeightRatio:0,surface:'world',authored:true}).join(),/Invalid/);
});
