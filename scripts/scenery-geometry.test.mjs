import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {geometryFromManifest,validateSceneryGeometry} from './scenery-geometry.mjs';

test('compiler geometry guard catches a painted footprint export the runtime snapshot missed',()=>{
  const manifest={assets:{house:{referenceWidth:1024,footprint:[[-100,0],[100,0],[100,-80]],sortLine:[[-100,0],[100,-20]],door:{x:-30,y:-400,width:120,height:350},key:'day-art',frames:['house']}}};
  const snapshot={town:geometryFromManifest(manifest)};
  assert.deepEqual(validateSceneryGeometry('town',manifest,snapshot),[]);
  const revised=structuredClone(manifest);revised.assets.house.footprint[1][0]=150;
  assert.match(validateSceneryGeometry('town',revised,snapshot)[0],/runtime scenery geometry differs/);
  assert.match(validateSceneryGeometry('missing',manifest,snapshot)[0],/run node scripts\/scenery-geometry.mjs/);
});

test('all committed playable-town geometry matches its compiler art manifest',async()=>{
  const snapshot=JSON.parse(await readFile(new URL('../web/src/data/scenery-geometry.json',import.meta.url),'utf8'));
  for(const town of ['lindenhafen','waldruh','nebelstadt']){
    const manifest=JSON.parse(await readFile(new URL(`../web/public/assets/${town}-day-animations.json`,import.meta.url),'utf8'));
    assert.deepEqual(validateSceneryGeometry(town,manifest,snapshot),[]);
  }
});
