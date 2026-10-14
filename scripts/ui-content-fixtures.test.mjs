import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiContentFixtures} from './ui-content-fixtures.mjs';
const fixture=JSON.parse(readFileSync(new URL('../web/src/test-fixtures/content-public.json',import.meta.url),'utf8'));
test('public screenshot fixture uses canonical bounded records and selected-language meanings',()=>{
 const read=uiContentFixtures(fixture,{language:'tr'}),bootstrap=read('/api/content/bootstrap').body;
 assert.equal(bootstrap.id,fixture.bootstrapId);assert(bootstrap.body.previewWordIds.length<=24);
 const record=read(`/api/content/lexemes?ids=${fixture.lexemeId},unknown`).body.records[0];
 assert.equal(record.id,fixture.lexemeId);assert(record.body.meanings.tr);assert.equal(record.body.meanings.en,undefined);
 assert.equal(read(`/api/content/sentences?ids=${Array(13).fill(fixture.lexemeId).join(',')}`).status,400);
 assert.equal(read('/api/content/lines').status,404);
});
test('screenshot fixture cannot mutate, fabricate corpus records, or expose private grading',()=>{
 assert.throws(()=>uiContentFixtures({records:{lines:[]}}),/bounded public/);
 const copy=structuredClone(fixture),exercise=copy.records.find(record=>record.kind==='exercise');
 exercise.body.grading={answer:'PRIVATE'};exercise.body.authoring={review:'PRIVATE'};exercise.body.nested={solution:'PRIVATE'};
 const read=uiContentFixtures(copy),response=read(`/api/content/exercises/${exercise.id}`);
 assert.equal(response.status,200);assert(!JSON.stringify(response.body).includes('PRIVATE'));
 assert.equal(read('/api/content/bootstrap','POST').status,405);assert.equal(read('/api/attempt').status,404);
 assert.equal(read('/api/content/exercises/00000000-0000-4000-8000-000000000000').status,404);
});
