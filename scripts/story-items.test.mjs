import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContent} from './build-content.mjs';
test('the bootstrap publishes the public IDs of both lamps, the same IDs story inventory carries',()=>{
 const {bundle}=buildContent(),bootstrap=bundle.records.find(record=>record.kind==='bootstrap'&&record.slug==='legacy');
 assert.deepEqual(bootstrap.body.storyItems.lamp,['signal-lamp','registered-lamp'].map(slug=>bundle.ids[`item:${slug}`]));
 assert(bootstrap.body.storyItems.lamp.every(id=>/^[0-9a-f-]{36}$/.test(id)));
});
