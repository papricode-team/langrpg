import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditSceneQuality} from './scene-quality.mjs';

test('texture upscaling preserves building scale and native density checks',()=>{
  const scene={id:'lindenhafen',scenery:[{id:'station',asset:'station',x:0,y:0,width:100}]};
  const original={referenceWidth:400,height:1152,footprint:[[0,0],[400,0],[200,100]]};
  const baseline=auditSceneQuality(scene,{assets:{station:original}});
  assert.deepEqual(baseline.issues,[]);
  const upscaled={...original,width:1600,height:4608,base:{referenceWidth:1600}};
  assert.deepEqual(auditSceneQuality(scene,{assets:{station:upscaled}}),baseline);
  const oversized={...scene,scenery:[{...scene.scenery[0],width:200}]};
  assert.ok(auditSceneQuality(oversized,{assets:{station:upscaled}}).issues.some(issue=>issue.includes('height')));
});
