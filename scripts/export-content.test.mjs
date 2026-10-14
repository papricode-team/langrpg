import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildContent, contentID, uuidPattern } from './export-content.mjs';
import { tokenize, tokenTexts } from './content-tokenizer.mjs';
import { validateAlignment } from './content-alignment.mjs';

const root=resolve(import.meta.dirname,'..');
const {artifact,ids,coverage}=await buildContent(root);

test('committed opaque UUIDs are stable and distinct across record namespaces',()=>{
  const map={};const quest=contentID(map,'quests','a1-arrival');
  assert.match(quest,uuidPattern);
  assert.equal(contentID(map,'quests','a1-arrival'),quest);
  assert.notEqual(contentID(map,'graphs','a1-arrival'),quest);
  assert.equal(Object.values(ids).length,new Set(Object.values(ids)).size);
  for (const [kind,records] of Object.entries(artifact.records)) for (const record of records) {
    assert.equal(ids[`${kind}:${record.slug}`],record.id);
    assert.equal(record.body.id,record.id);
    assert.match(record.id,uuidPattern);
  }
});

test('entire authoring corpus exports instead of only regression fixtures',()=>{
  assert.equal(artifact.records.quests.length,30);
  assert.equal(artifact.records.graphs.length,30);
  assert.equal(artifact.records.units.length,405);
  assert.ok(artifact.records.exercises.length>10900);
  assert.ok(coverage.lines>12000);
  assert.ok(coverage.turkish>12000);
  assert.ok(coverage.authored>9800);
  const pending=artifact.records.lines.filter(record=>record.body.alignmentStatus==='pending').length;
  assert.equal(coverage.authored+coverage.reviewed+pending,coverage.lines,'every line has an explicit authoring status');
});

test('line offsets remain unchanged and every exported line has a visibility owner',()=>{
  const lexemes=new Map(artifact.records.lexemes.map(record=>[record.id,record.body]));
  for (const {slug,body} of artifact.records.lines) {
    assert.deepEqual(body.de.tokens,tokenize(body.de.text),slug);
    assert.ok(body.questId||body.unitId||body.exerciseId||body.mapId,`${slug} has no visibility owner`);
    for (const value of Object.values(body.support)) assert.deepEqual(value.tokens,tokenize(value.text),slug);
    if (['authored','reviewed'].includes(body.alignmentStatus)) assert.deepEqual(validateAlignment(body,{lexemes}),[],slug);
    else for (const value of Object.values(body.support)) assert.deepEqual(value.align,[],`${slug} must not present guesses`);
  }
});

test('graphs retain only line references and opaque transition identifiers',()=>{
  const lines=new Set(artifact.records.lines.map(record=>record.id));
  for (const record of artifact.records.graphs) {
    assert.match(record.body.questId,uuidPattern);
    for (const node of record.body.nodes) {
      assert.match(node.id,uuidPattern);
      assert.ok(node.localId);
      for (const id of node.lineIds) assert.ok(lines.has(id));
      for (const reference of node.lineRefs) {
        assert.equal(reference.german,undefined);
        assert.equal(reference.english,undefined);
        if (reference.reply) assert.match(reference.reply.exerciseId,uuidPattern);
      }
      if (node.next) assert.match(node.next,uuidPattern);
    }
  }
});

test('private grading answers use the canonical authoring source and server modes',()=>{
  const exercises=new Map(artifact.grading.exercises.map(exercise=>[exercise.id,exercise]));
  const items=new Set(artifact.grading.items.map(item=>item.id));
  for (const record of artifact.records.exercises) {
    const exercise=exercises.get(record.slug);
    assert.ok(exercise,record.slug);
    assert.equal(exercise.answer,record.body.answer,record.slug);
    assert.ok(['recognition','listening','production'].includes(exercise.mode));
    assert.ok(items.has(exercise.itemId));
  }
});

test('Turkish lexical meanings and exercise support are folded into records',()=>{
  const word=artifact.records.lexemes.find(record=>record.slug==='kaffee-noun');
  assert.equal(word.body.meaning.tr,'kahve');
  assert.ok(word.body.exerciseIds.recognition.every(id=>uuidPattern.test(id)));
  const exercise=artifact.records.exercises.find(record=>record.slug==='lex-kaffee-noun-recognition');
  assert.equal(exercise.body.support.tr.english,'kahve');
  const line=artifact.records.lines.find(record=>record.id===exercise.body.exampleLineId);
  assert.ok(tokenTexts(line.body.support.tr).includes('kahve'));
});

test('expedition replies have independently authored bilingual aligned lines in the current encounter slice',()=>{
  const lines=new Map(artifact.records.lines.map(row=>[row.id,row]));
  const encounters=artifact.records.expeditions.filter(row=>row.body.kind==='encounter');
  assert.equal(encounters.length,180);
  for(const row of encounters){
    assert.equal(row.body.choices.length,2);
    for(const choice of row.body.choices){
      const line=lines.get(choice.lineId);
      assert.ok(line,row.slug);assert.equal(line.body.de.text,choice.text);assert.equal(line.body.mapId,row.body.mapId);
      assert.equal(line.body.alignmentStatus,'authored');assert.ok(line.body.support.en?.text);assert.ok(line.body.support.tr?.text);
    }
  }
});

test('guided and greeting choices reference the existing authored lines without changing grading values',()=>{
  const lines=new Map(artifact.records.lines.map(row=>[row.id,row]));
  let guided=0,greetings=0;
  for(const row of artifact.records.exercises){
    for(const choice of row.body.guidedChoices??[]){guided++;assert.equal(lines.get(choice.lineId)?.body.de.text,choice.german);}
    for(const [german,lineId]of Object.entries(row.body.optionLineIds??{})){greetings++;assert.equal(lines.get(lineId)?.body.de.text,german);assert.ok(row.body.options.includes(german));}
  }
  assert.ok(guided>=36);assert.ok(greetings>=3);
});

test('committed catalogue is reproducible from authoring sources and the UUID map',async()=>{
  const committed=JSON.parse(await readFile(resolve(root,'server/content.json'),'utf8'));
  assert.deepEqual(artifact,committed);
});
