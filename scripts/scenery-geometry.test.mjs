import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {geometryFromManifest,sceneryFrameSizes,validateSceneryGeometry} from './scenery-geometry.mjs';

test('compiler geometry guard catches a painted footprint export the runtime snapshot missed',()=>{
  const manifest={assets:{house:{referenceWidth:1024,footprint:[[-100,0],[100,0],[100,-80]],sortLine:[[-100,0],[100,-20]],door:{x:-30,y:-400,width:120,height:350},key:'day-art',frames:['house']}}};
  const snapshot={town:geometryFromManifest(manifest)};
  assert.deepEqual(validateSceneryGeometry('town',manifest,snapshot),[]);
  const revised=structuredClone(manifest);revised.assets.house.footprint[1][0]=150;
  assert.match(validateSceneryGeometry('town',revised,snapshot)[0],/runtime scenery geometry differs/);
  assert.match(validateSceneryGeometry('missing',manifest,snapshot)[0],/run node scripts\/scenery-geometry.mjs/);
});

test('normalizes day and night rendered pivots and base resolution into one visual envelope',()=>{
  const day={assets:{house:{referenceWidth:200,width:200,height:300,originX:.25,originY:1}}};
  const night={assets:{house:{referenceWidth:100,width:120,height:180,originX:.5,originY:1,
    base:{referenceWidth:100,originX:.4,originY:.9}}}};
  const snapshot={town:geometryFromManifest(day,night)};
  assert.deepEqual(snapshot.town.assets.house.visualBounds,{left:-96,top:-324,right:150,bottom:35.99999999999999});
  assert.deepEqual(validateSceneryGeometry('town',day,snapshot,night),[]);
  const revised=structuredClone(night);revised.assets.house.height=200;
  assert.match(validateSceneryGeometry('town',day,snapshot,revised)[0],/runtime scenery geometry differs/);
});

test('measures actual base atlas frames instead of cached animation dimensions',async()=>{
  const manifest={assets:{house:{referenceWidth:200,width:40,height:60,originX:.5,originY:1,
    key:'old-details',frames:['house'],base:{key:'native-base',frame:'house-base',referenceWidth:400,originX:.25,originY:1}}}};
  const keys=[];
  const sizes=await sceneryFrameSizes([manifest,manifest],async key=>{
    keys.push(key);return {frames:{'house-base':{frame:{x:10,y:20,w:400,h:600}}}};
  });
  assert.deepEqual(keys,['native-base']);
  assert.deepEqual(geometryFromManifest(manifest,undefined,sizes).assets.house.visualBounds,
    {left:-50,top:-300,right:150,bottom:0});
});

test('all committed playable-town geometry matches its compiler art manifest',async()=>{
  const snapshot=JSON.parse(await readFile(new URL('../web/src/data/scenery-geometry.json',import.meta.url),'utf8'));
  for(const town of ['lindenhafen','waldruh','nebelstadt']){
    const [manifest,night]=await Promise.all(['day','night'].map(async period=>
      JSON.parse(await readFile(new URL(`../web/public/assets/${town}-${period}-animations.json`,import.meta.url),'utf8'))));
    const sizes=await sceneryFrameSizes([manifest,night],async key=>
      JSON.parse(await readFile(new URL(`../web/public/assets/${key}.json`,import.meta.url),'utf8')));
    assert.deepEqual(validateSceneryGeometry(town,manifest,snapshot,night,sizes),[]);
  }
});
