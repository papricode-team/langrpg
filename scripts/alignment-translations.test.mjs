import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildContent} from './export-content.mjs';

const root=resolve(import.meta.dirname,'..');
const overlay=JSON.parse(await readFile(resolve(root,'content/source/alignment-translations.json'),'utf8'));
const {artifact}=await buildContent(root);
const lines=new Map(artifact.records.lines.map(record=>[record.slug,record.body]));

test('authored support reaches the exact unchanged German line',()=>{
  for(const [slug,value] of Object.entries(overlay)){
    const line=lines.get(slug);
    assert.ok(line,slug);
    assert.equal(line.de.text,value.de,slug);
    for(const language of ['en','tr'])if(value[language])assert.equal(line.support[language].text,value[language],`${slug}/${language}`);
    for(const index of value.omitGlossTokens??[])assert.equal(line.glosses?.[index],undefined,`${slug}/gloss ${index}`);
  }
});

test('new support covers exercise contexts, activity prompts, cinematics and expeditions',()=>{
  for(const slug of ['exercise:story-lost-hour-event-01','exercise:story-seed-packet-07','exercise:story-17-59-ticket','activity:detective-b1-a-timetable-disagrees','expedition:saffroncourt-encounter-youssef']){
    const line=lines.get(slug);
    assert.ok(line.support.en.text,slug);
    assert.ok(line.support.tr.text,slug);
    assert.notEqual(line.support.en.text,line.de.text,slug);
    assert.notEqual(line.support.tr.text,line.de.text,slug);
  }
  const cinematic=lines.get('cinematic:arrival:lindenhafen:0');
  const arrival=[...lines.entries()].find(([slug,line])=>slug.startsWith('cinematic:')&&line.de.text==='Der Zug ist da. Auf Bahnsteig sieben?')?.[1];
  assert.ok(arrival??cinematic);
  assert.equal(arrival.support.en.text,'The train is here. At platform seven?');
  assert.equal(arrival.support.tr.text,'Tren geldi. Yedinci peronda mı?');
});

test('reading passage support is a translation while the exercise instruction stays intact',()=>{
  const readings=artifact.records.exercises.filter(record=>record.body.support?.en?.english?.startsWith('Read the note.'));
  assert.equal(readings.length,54);
  for(const record of readings){
    const line=artifact.records.lines.find(line=>line.id===record.body.exampleLineId)?.body;
    assert.ok(line,record.slug);
    assert.ok(!line.support.en.text.startsWith('Read the note.'),record.slug);
    assert.ok(!line.support.tr.text.startsWith('Notu oku.'),record.slug);
    assert.ok(!line.support.en.text.includes(line.de.text),record.slug);
    assert.ok(!line.support.tr.text.includes(line.de.text),record.slug);
    assert.ok(record.body.support.en.english.includes(line.de.text),record.slug);
  }
});

test('formal possessives cannot show a her/their glossary, while the authored third person sense remains',()=>{
  const formal=lines.get('a1-arrival-choice-0');
  assert.equal(formal.glosses?.[2],undefined);
  assert.equal(formal.support.en.text,'Certainly. Slowly: your ticket is not valid.');
  assert.equal(formal.support.tr.text,'Memnuniyetle. Yavaşça: Biletiniz geçerli değil.');
  const thirdPerson=lines.get('a1-cafe-choice-2');
  const lexeme=artifact.records.lexemes.find(record=>record.id===thirdPerson.glosses[4]);
  assert.equal(lexeme.slug,'ihr-det');
  assert.equal(thirdPerson.support.en.text,'She was very tired. Her hands were black with ink.');
});

test('past-tense schloss cannot show the castle/lock glossary while the noun retains it',()=>{
  for(const [slug,index] of [['b1-work-gate-6',11],['b1-atlas-intro-8:variant:0',8],['b1-atlas-intro-8',9],['clue:b1-work:letter:1',2],['clue:b1-atlas:text:0',13]]){
    const line=lines.get(slug),[start,end]=line.de.tokens[index];
    assert.equal(line.de.text.slice(start,end),'schloss');
    assert.equal(line.glosses?.[index],undefined,slug);
    assert.match(line.support.en.text,/closed/,slug);
  }
  const noun=lines.get('a2-apartment-request-2'),[start,end]=noun.de.tokens[1];
  assert.equal(noun.de.text.slice(start,end),'Schloss');
  const lexeme=artifact.records.lexemes.find(record=>record.id===noun.glosses[1]);
  assert.equal(lexeme.slug,'schloss-noun');
  assert.equal(lexeme.body.meaning.en,'castle; lock');
  assert.match(noun.support.en.text,/The lock is stuck/);
});

test('looking, charging, humming and did cannot show homographic noun meanings',()=>{
  const contextual=[['a1-directions-complete-0',4,'sucht'],['expedition:kigalights-encounter-grace',14,'laden'],['b1-work-reopen-2',7,'summen'],['clue:b1-council:letter:1',10,'tat']];
  for(const [slug,index,word] of contextual){
    const line=lines.get(slug),[start,end]=line.de.tokens[index];
    assert.equal(line.de.text.slice(start,end),word);
    assert.equal(line.glosses?.[index],undefined,slug);
  }
  for(const word of ['sucht','laden','summe','tat']){
    const line=lines.get(`exercise:lex-${word}-noun-recognition`);
    const lexeme=artifact.records.lexemes.find(record=>record.id===line.glosses[1]);
    assert.equal(lexeme.slug,`${word}-noun`);
  }
});

test('player-name variable slots cannot carry a Name dictionary reference',()=>{
  const variable=lines.get('a1-arrival-intro-9');
  assert.ok(variable.de.text.includes('{name}'));
  assert.equal(variable.glosses?.[2],undefined);
  const noun=lines.get('a1-arrival-intro-10');
  const lexeme=artifact.records.lexemes.find(record=>record.id===noun.glosses[2]);
  assert.equal(lexeme.slug,'name-noun');
});

test('aligned-only labels do not repeat reference questions or writing instructions',()=>{
  for(const slug of ['exercise:course-a1-pronouns-exercise-2','exercise:course-a1-present-exercise-3','exercise:course-a1-reference-forms-1-exercise-1']){
    const line=lines.get(slug);
    assert.ok(!/^(?:Write:|Build:|In a German text,)/.test(line.support.en.text),slug);
    const record=artifact.records.exercises.find(record=>record.body.exampleLineId===line.id);
    assert.ok(/^(?:Write:|Build:|In a German text,)/.test(record.body.support.en.english),slug);
  }
  assert.equal(lines.get('exercise:course-a1-reference-forms-6-exercise-6').support.tr.text,'saniye');
  assert.equal(lines.get('exercise:course-a2-checkpoint-exercise-6').support.en.text,'I have already bought the ticket.');
});

test('listening passages preserve their question outside the aligned translation',()=>{
  const line=lines.get('exercise:course-a1-train-call-exercise-1');
  assert.match(line.support.en.text,/The train to Waldruh/);
  assert.match(line.support.tr.text,/Waldruh/);
  const record=artifact.records.exercises.find(record=>record.body.exampleLineId===line.id);
  assert.equal(record.body.support.en.english,'What is the destination?');
});

test('all nonlexical examples keep instructions outside their aligned support text',()=>{
  const instruction=/^(?:Write:|Build:|Write a clear request:|Complete:|Read:|Read the note\.|Read the new text\.|In a German text,|Choose the )/;
  const nonlexical=artifact.records.lines.filter(record=>record.slug.startsWith('exercise:')&&!record.slug.startsWith('exercise:lex-'));
  assert.ok(nonlexical.length>600);
  for(const record of nonlexical)assert.ok(!instruction.test(record.body.support.en?.text??''),record.slug);
  const grammar=lines.get('exercise:course-a2-perfect-exercise-1');
  assert.ok(grammar.support.en.text.includes('no separate English word'));
  assert.ok(grammar.support.tr.text.includes('ayrı bir sözcükle karşılanmaz'));
  const checkpoint=lines.get('exercise:course-b1-checkpoint-exercise-1');
  assert.ok(checkpoint.support.en.text.startsWith('The city wants to turn a disused hall'));
  const record=artifact.records.exercises.find(record=>record.body.exampleLineId===checkpoint.id);
  assert.ok(record.body.support.en.english.startsWith('Read the new text.'));
});
