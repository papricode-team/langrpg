import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uiContentFixtures } from './ui-content-fixtures.mjs';
const id='00000000-0000-4000-8000-000000000001';
function fixture() {
  return uiContentFixtures({metadata:{edition:'fixture'},records:{npcs:[],quests:[],units:[],grammar:[],narratives:[{id,body:{id,kind:'interior',exerciseIds:[id]}}],lines:[],lexemes:[{id,body:{id,level:'A1',meaning:{en:'Ticket',tr:'Bilet'}}}],exercises:[{id,body:{id,prompt:'Choose a greeting',answer:'Hello',support:{en:{explanation:'hidden'}},nested:{solution:'hidden'}}}]}});
}
test('screenshot fixtures provide opaque records and seed a bounded vocabulary',()=>{
  const read=fixture();
  assert.deepEqual(read('/api/content/bootstrap').body.previewWordIds,[id]);
  assert.equal(read(`/api/content/lexemes?ids=${id},unknown`).body.lexemes[0].meaning,'Ticket');
  assert.equal(read(`/api/content/lexemes?ids=${id},unknown`).body.lexemes.length,1);
});
test('the empty-practice encounter fixture does not change other preview surfaces',()=>{
  const read=fixture();
  assert.deepEqual(read(`/api/content/narratives/${id}`,'GET','encounter').body.exerciseIds,[]);
  assert.deepEqual(read(`/api/content/narratives/${id}`,'GET','activity').body.exerciseIds,[id]);
});
test('screenshot fixtures cannot grade, mutate, or return answer fields',()=>{
  const read=fixture();
  assert.equal(read('/api/content/bootstrap','POST').status,405);
  assert.equal(read('/api/attempt').status,404);
  assert.equal(read('/api/content/exercises/not-an-id').status,404);
  const body=read(`/api/content/exercises/${id}`).body;
  assert.equal(body.prompt,'Choose a greeting');
  assert.equal(body.answer,undefined);
  assert.deepEqual(body.nested,{});
  assert.deepEqual(body.support.en,{});
});
