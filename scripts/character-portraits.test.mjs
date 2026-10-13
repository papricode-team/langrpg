import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {validatePortrait} from './character-portraits.mjs';

test('portraits reject sprite-size crops and unreviewed enlarged guides',()=>{
  const actor={id:'test',nativeRepaint:true,review:{approved:true},promptSha256:'hash',crops:{neutral:{left:0,top:0,width:51,height:51}}};
  assert.throws(()=>validatePortrait(actor,{width:1024,height:1024}),/240/);
  actor.crops.neutral.width=actor.crops.neutral.height=724;
  assert.doesNotThrow(()=>validatePortrait(actor,{width:724,height:724}));
  assert.throws(()=>validatePortrait({...actor,nativeRepaint:false},{width:724,height:724}),/native portrait/);
  assert.throws(()=>validatePortrait({...actor,review:{approved:false}},{width:724,height:724}),/Reviewed/);
});

test('published dedicated portraits retain their exact native crop pixels',async()=>{
  const source=JSON.parse(await readFile('art/source/character-portraits/manifest.json','utf8'));
  const published=JSON.parse(await readFile('web/src/data/character-portraits.json','utf8'));
  for(const actor of source.actors)for(const [expression,crop] of Object.entries(actor.crops)) {
    const native=await sharp(actor.source).extract(crop).ensureAlpha().raw().toBuffer();
    const path=published.actors[actor.id].expressions[expression].split('?')[0];
    const exported=await sharp(`web/public${path}`).ensureAlpha().raw().toBuffer();
    assert.deepEqual(exported,native,`${actor.id}/${expression} must not be resized or softened`);
  }
});
