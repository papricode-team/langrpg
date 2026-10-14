import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceTokens,selectorRange,compileTranslation,personalizeSentence,stableId,uuidPattern } from './content-model.mjs';
import { buildContent,root } from './build-content.mjs';
import { exportSheet,importSheet,validateBundle,validateReviews } from './word-map.mjs';
import { resolve } from 'node:path';

const words = sourceTokens('Sie sieht Sie.');
test('published v4 progress identities keep a complete canonical bridge without replacing existing IDs',()=>{
  const {bundle}=buildContent();
  const published=JSON.parse(readFileSync(resolve(root,'content/published-content-ids.json'),'utf8'));
  assert.deepEqual(bundle.publishedIds,published);
  const kinds={quests:'quest',exercises:'exercise',items:'item',lexemes:'lexeme',units:'unit',nodes:'node',choices:'choice',expeditions:'expedition',minigames:'minigame'};
  for(const key of Object.keys(published)) {
    const split=key.indexOf(':'),kind=kinds[key.slice(0,split)];if(kind)assert(uuidPattern.test(bundle.ids[`${kind}:${key.slice(split+1)}`]),key);
  }
  const committed=JSON.parse(readFileSync(resolve(root,'content_ids.json'),'utf8'));
  for(const [key,value]of Object.entries(committed))assert.equal(bundle.ids[key],value,key);
});
test('interior conversations use scoped node contexts with exact support translations and pending review',()=>{
  const {bundle,source}=buildContent();
  const authored=source.interiorConversations[0],contexts=bundle.records.filter(record=>record.kind==='context'&&record.body.category==='interiorConversation'&&record.body.data.objectId===authored.objectId);
  assert.equal(contexts.length,Object.keys(authored.nodes).length);
  const start=contexts.find(record=>record.body.data.nodes[record.body.data.start]);
  assert(start);assert.equal(Object.keys(start.body.data.nodes).length,1);
  const node=start.body.data.nodes[start.body.data.start];
  assert(uuidPattern.test(node.id));assert(node.choices.every(choice=>uuidPattern.test(choice.id)&&uuidPattern.test(choice.next)));
  const line=bundle.records.find(record=>record.id===node.line.sentenceId);
  assert.equal(line.body.text,authored.nodes[authored.start].line.german);
  assert.equal(line.body.translations.en.text,authored.nodes[authored.start].line.english);
  assert.equal(line.body.translations.tr.text,authored.nodes[authored.start].line.turkish);
  assert.equal(line.body.authoring.review.status,'pending-native-speaker-review');
  const facts=bundle.records.find(record=>record.kind==='context'&&record.body.category==='interiorWordFacts'&&record.body.owners[0].id==='inn');
  assert(facts.body.data.examples.Bett.sentenceId);
  assert.equal(facts.body.data.meanings.tr.Bett,'yatak');
  assert.deepEqual(Object.keys(facts.body.data.meanings),['tr']);
});
test('story exercises inherit authored contextual vocabulary as canonical UUID references',()=>{
  const {bundle,source}=buildContent();
  for(const slug of ['a1-cafe-exercise-1','a1-workshop-exercise-1','b1-witness-exercise-1']) {
    const expected=source.legacyServer.course.contextWordIds[slug];
    assert(expected.length>0,slug);
    const record=bundle.records.find(record=>record.kind==='exercise'&&record.slug===slug);
    assert.deepEqual(record.body.wordIds,expected.map(word=>bundle.ids[`lexeme:${word}`]),slug);
    assert(record.body.wordIds.every(word=>uuidPattern.test(word)&&bundle.records.some(lexeme=>lexeme.kind==='lexeme'&&lexeme.id===word)),slug);
  }
});
test('product metadata uses glotworld while fictional Atlas references stay authored',()=>{
  const {bundle,source}=buildContent();
  assert.equal(bundle.courses.find(course=>course.target==='de').title,'German · glotworld');
  assert.equal(source.course.sources.find(row=>row.id==='project-lexical-editorial').title,'glotworld lexical editing and original instructional content');
  assert.equal(source.miniGameScripts.authoring,'Hand-authored glotworld story scripts; canonical context-bound exercises');
  assert(source.storyMaps.find(map=>map.id==='nebelstadt').description.includes('Lantern Atlas'));
  assert.equal(source.overlays.story['item:restored-atlas:title'].en,'The restored Lantern Atlas');
  assert.equal(source.overlays.ui['Follow the story'],'Hikâyeyi takip et');
});
test('exact selectors distinguish occurrences and reject substring matches',()=>{
  assert.deepEqual(selectorRange('Sie sieht Sie.',{text:'Sie',occurrence:2}),{start:10,end:13});
  assert.throws(()=>selectorRange('Anna is at a_name cash.',{text:'a',occurrence:1}),/does not resolve/);
  assert.throws(()=>selectorRange('I am helpful.',{text:'help',occurrence:1}),/does not resolve/);
  assert.deepEqual(selectorRange('Use C++ (not CCC).',{text:'C++',occurrence:1}),{start:4,end:7});
  assert.throws(()=>selectorRange('ticket',{text:'ticket',occurrence:0}),/positive occurrence/);
});
test('authored repeated sources select independent targets',()=>{
  const translation=compileTranslation('Sie sieht Sie.',{text:'She sees you.',words:[
    {source:{text:'Sie',occurrence:1},targets:[{text:'She',occurrence:1}]},
    {source:{text:'sieht',occurrence:1},targets:[{text:'sees',occurrence:1}]},
    {source:{text:'Sie',occurrence:2},targets:[{text:'you',occurrence:1}]},
  ]},words);
  assert.deepEqual(translation.words.map(word=>word.targetRanges.map(range=>translation.text.slice(range.start,range.end))),[['She'],['sees'],['you']]);
});
test('a missing map fails; explicit no-counterpart preserves the tappable source',()=>{
  const source=sourceTokens('werden');
  assert.throws(()=>compileTranslation('werden',{text:'checked',words:[]},source),/missing alignments/);
  const translation=compileTranslation('werden',{text:'checked',words:[{source:{text:'werden',occurrence:1},targets:[]}]},source);
  assert.deepEqual(translation.words[0].targetRanges,[]);
  assert.equal(source[0].source.text,'werden');
});
test('multiple target spans exclude the intervening pronoun',()=>{
  const translation=compileTranslation('Möchtest',{text:'Would you like a coffee?',words:[{source:{text:'Möchtest',occurrence:1},targets:[{text:'Would',occurrence:1},{text:'like',occurrence:1}]}]},sourceTokens('Möchtest'));
  assert.deepEqual(translation.words[0].targetRanges.map(range=>translation.text.slice(range.start,range.end)),['Would','like']);
  assert.throws(()=>compileTranslation('Möchtest',{text:'Would you like',words:[{source:{text:'Möchtest',occurrence:1},targets:[{text:'Would you',occurrence:1},{text:'you like',occurrence:1}]}]},sourceTokens('Möchtest')),/overlapping/);
});
test('template substitution preserves UTF-16 spans when the name contains a mapped word',()=>{
  const text='Hallo, {name}! Möchtest du einen Kaffee?';
  const source=sourceTokens(text);
  const entries=[['Hallo','Hello'],['Möchtest',['Would','like']],['du','you'],['einen','a'],['Kaffee','coffee']].map(([from,to])=>({source:{text:from,occurrence:1},targets:(Array.isArray(to)?to:[to]).map(text=>({text,occurrence:1}))}));
  const sentence={text,words:source,translations:{en:compileTranslation(text,{text:'Hello, {name}! Would you like a coffee?',words:entries},source)}};
  const rendered=personalizeSentence(sentence,{name:'🌙 coffee <Ada & Bo>'});
  const coffee=rendered.words.find(word=>word.source.text==='Kaffee');
  assert.equal(rendered.text.slice(coffee.range.start,coffee.range.end),'Kaffee');
  const range=rendered.translations.en.words.find(word=>word.source.text==='Kaffee').targetRanges[0];
  assert.equal(rendered.translations.en.text.slice(range.start,range.end),'coffee');
  assert.equal(range.start,rendered.translations.en.text.lastIndexOf('coffee'));
  assert(!rendered.text.includes('{name}'));
});
test('committed identity is stable and invalid identity cannot be overwritten',()=>{
  const ids={};const value=stableId('sentence:a',ids);
  assert(uuidPattern.test(value));assert.equal(stableId('sentence:a',{}),value);
  assert.equal(stableId('sentence:a',ids),value);
  assert.throws(()=>stableId('sentence:a',{'sentence:a':'bad'}),/Invalid committed UUID/);
});

const {bundle}=buildContent();
const english=bundle.courses.find(course=>course.target==='en');
const proof={...bundle,records:bundle.records.filter(record=>record.courseId===english.id)};
test('English proof has ten fully authored sentences in Turkish and German',()=>{
  assert.deepEqual(english.supportLanguages,['tr','de']);
  assert.equal(proof.records.filter(record=>record.kind==='sentence').length,10);
  assert.deepEqual(validateBundle(proof),[]);
  assert(proof.records.some(record=>record.kind==='graph'));
  assert(proof.records.some(record=>record.kind==='unit'));
  assert(proof.records.some(record=>record.kind==='exercise' && record.body.targetWordId));
  assert(proof.records.filter(record=>record.kind==='sentence').every(record=>record.body.authoring.review.status==='pending-native-speaker-review'));
});
test('review sheet round-trips maps and refuses stale text or duplicate rows',()=>{
  const sheet=exportSheet(proof), next=importSheet(proof,sheet);
  assert.equal(Object.keys(next).length,10);
  const stale=sheet.replace('"Hello!"','"Hello there!"');
  assert.throws(()=>importSheet(proof,stale),/source text changed/);
  const rows=sheet.trimEnd().split('\n');
  assert.throws(()=>importSheet(proof,sheet+rows[1]+'\n'),/Duplicate sentence/);
  assert.equal(Object.values(next)[0].review.status,'pending');
});
test('the entire inventory reports pending maps without claiming they have no counterpart',()=>{
  assert.deepEqual(validateBundle(bundle,{strict:false}),[]);
  const errors=validateBundle(bundle);
  assert(errors.length>0);
  const pending=bundle.records.find(record=>record.kind==='sentence'&&record.body.authoring.status==='pending');
  assert(pending);
  assert(Object.values(pending.body.translations).every(translation=>translation.words.length===0));
});
test('imported expedition replies retain authored translations and stable published sentence aliases',()=>{
  const encounter=bundle.records.find(record=>record.kind==='expedition'&&record.body.choices?.length);
  const choice=encounter.body.choices[0],line=bundle.records.find(record=>record.id===choice.sentenceId);
  assert.equal(line.id,bundle.ids[`sentence:expedition:${encounter.slug}:choice:0`]);
  assert.equal(line.body.text,choice.text);
  assert(line.body.translations.en.words.length>0);assert(line.body.translations.tr.words.length>0);
  assert.equal(line.body.authoring.review.status,'pending-native-speaker-review');
});
test('wrong-sense omissions suppress dictionary glosses across canonical context aliases',()=>{
  const imported=JSON.parse(readFileSync(resolve(root,'content/imported-alignment-drafts.json'),'utf8'));
  let checked=0;
  for(const entry of imported.entries.filter(entry=>entry.omitGlossSources.length))for(const record of bundle.records.filter(record=>record.kind==='sentence'&&record.body.text===entry.text))for(const source of entry.omitGlossSources) {
    const word=record.body.words.find(word=>word.source.text===source.text&&word.source.occurrence===source.occurrence);
    if(!word)continue;
    assert.equal(word.lexemeId,undefined,record.slug);assert.deepEqual(word.glosses,{},record.slug);checked++;
  }
  assert(checked>26);
});
test('special item and ending prose is server-owned with exact existing Turkish metadata',()=>{
  const records=bundle.records.filter(record=>record.kind==='context'&&['specialItem','storyEnding'].includes(record.body.category));
  assert.equal(records.length,7);
  for(const record of records) {
    assert(record.body.data.title);assert(record.body.data.text);
    assert(record.body.data.support.tr.title);assert(record.body.data.support.tr.text);
    assert.equal(record.body.owners[0].kind,record.body.category);
  }
  const letter=records.find(record=>record.slug==='special-item:successor-letter');
  assert.equal(letter.body.owners[0].id,bundle.ids['item:successor-letter']);
});
test('placement remains one bounded course-owned context with eight exact authored cues',()=>{
  const {source}=buildContent(),placement=bundle.records.find(record=>record.kind==='context'&&record.body.category==='placement');
  assert(placement);assert.equal(placement.body.data.questions.length,8);assert.equal(placement.body.data.exerciseIds.length,8);
  assert.deepEqual(placement.body.owners,[{kind:'placement',id:bundle.courses.find(course=>course.target==='de').id}]);
  for(const [index,question]of placement.body.data.questions.entries()) {
    const slug=source.placement.exerciseIds[index],cue=source.placement.dialogue[slug],sentence=bundle.records.find(record=>record.id===question.turn.sentenceId);
    assert.equal(question.exerciseId,bundle.ids[`exercise:${slug}`]);assert.equal(question.turn.speaker,cue.speaker);
    assert.equal(sentence.body.text,cue.german);assert.equal(sentence.body.translations.en.text,cue.english);
    assert.deepEqual(sentence.body.owners,placement.body.owners);assert(sentence.body.translations.tr.words.length>0);
    assert.equal(sentence.body.authoring.review.status,'pending-native-speaker-review');
  }
});
test('inspector acceptance maps highlight Turkish inflections and retain no-counterpart words',()=>{
  const sentence=bundle.records.find(record=>record.kind==='sentence'&&record.body.text==='Ihre Fahrkarte, bitte. Auch meine Akten müssen geprüft werden.').body;
  const tr=sentence.translations.tr;
  const select=text=>tr.words.find(word=>word.source.text===text).targetRanges.map(range=>tr.text.slice(range.start,range.end));
  assert.deepEqual(select('Fahrkarte'),['Biletiniz']);assert.deepEqual(select('geprüft'),['denetlenmesi']);assert.deepEqual(select('Auch'),['da']);assert.deepEqual(select('werden'),[]);
  assert(sentence.words.some(word=>word.source.text==='werden'));
  assert.deepEqual(sentence.translations.en.words.find(word=>word.source.text==='bitte').targetRanges.map(range=>sentence.translations.en.text.slice(range.start,range.end)),['please']);
});
test('legacy authoring and generated private grading agree on answers',()=>{
  const source=JSON.parse(readFileSync(resolve(root,'content/source.json'),'utf8'));
  const canonical=new Map(source.course.exercises.map(exercise=>[exercise.id,exercise]));
  for(const exercise of source.legacyServer.course.exercises)assert.equal(exercise.answer,canonical.get(exercise.id)?.answer,exercise.id);
});
test('repeated story choice names keep quest-specific identities and sentences',()=>{
  const arrival=bundle.records.find(row=>row.kind==='graph'&&row.slug==='a1-arrival').body;
  const cafe=bundle.records.find(row=>row.kind==='graph'&&row.slug==='a1-cafe').body;
  const first=arrival.nodes.find(node=>node.stage==='choice').choices[0];
  const second=cafe.nodes.find(node=>node.stage==='choice').choices[0];
  assert.notEqual(first.id,second.id);assert.notEqual(first.sentenceId,second.sentenceId);
  assert.equal(first.id,bundle.ids['choice:a1-arrival:report']);
  assert.equal(second.id,bundle.ids['choice:a1-cafe:report']);
  assert.notEqual(bundle.records.find(row=>row.id===first.sentenceId).body.text,bundle.records.find(row=>row.id===second.sentenceId).body.text);
});
test('authorized game audio contains sentence references and every referenced exercise exists',()=>{
  const byId=new Map(bundle.records.map(row=>[row.id,row]));
  for(const game of bundle.records.filter(row=>row.kind==='minigame')) {
    for(const exerciseId of game.body.exerciseIds)assert.equal(byId.get(exerciseId)?.kind,'exercise');
    for(const clip of game.body.audio.clips) {
      assert.equal(clip.text,undefined);
      assert.equal(byId.get(clip.sentenceId)?.kind,'sentence');
      assert.equal(byId.get(clip.sentenceId).body.audio.path,clip.path);
      assert(byId.get(clip.sentenceId).body.owners.some(owner=>owner.kind==='minigame'&&owner.id===game.id));
    }
  }
});
test('visible metadata folds existing Turkish support without inventing missing labels',()=>{
  const source=JSON.parse(readFileSync(resolve(root,'content/source.json'),'utf8'));
  const bootstrap=bundle.records.find(row=>row.kind==='bootstrap'&&row.slug==='legacy').body;
  const act=bootstrap.acts.find(act=>act.mapId==='lindenhafen');
  assert.equal(act.support.tr.title,source.overlays.story['act:lindenhafen:title'].tr);
  assert.equal(act.support.tr.title,'Silinen isimler');
  const quest=bootstrap.quests.find(quest=>quest.worldId==='a1-arrival');
  assert.equal(quest.support.tr.location,source.overlays.story['quest:a1-arrival:location'].tr);
  const inn=bundle.records.find(row=>row.kind==='context'&&row.body.category==='interior'&&row.body.data.id==='inn').body.data;
  assert.equal(inn.support.tr.name,source.overlays.ui['Your room at the inn']);
  const cafe=bundle.records.find(row=>row.kind==='context'&&row.body.category==='interior'&&row.body.data.id==='cafe').body.data;
  assert.equal(cafe.support?.tr?.name,undefined);
});


test('release review requires a named reviewer, independently of valid ranges', () => {
  const bundle = { records: [
    { id: 'draft', kind: 'sentence', body: { authoring: { review: { status: 'pending' } } } },
    { id: 'anonymous', kind: 'sentence', body: { authoring: { review: { status: 'reviewed' } } } },
    { id: 'reviewed', kind: 'sentence', body: { authoring: { review: { status: 'reviewed', reviewedBy: 'Native reviewer' } } } },
    { id: 'exercise', kind: 'exercise', body: {} },
  ] };
  assert.deepEqual(validateReviews(bundle), ['draft: native-speaker review pending', 'anonymous: native-speaker review pending']);
});


test('English proof exposes bounded pacing metadata and localized word feedback', () => {
  const bootstrap = proof.records.find(record => record.kind === 'bootstrap').body;
  assert.equal(bootstrap.syllabus.totalWords, 4);
  assert.deepEqual(bootstrap.syllabus.wordIds, []);
  assert.equal(bootstrap.units[0].support.de.title, 'Erste Gespräche');
  for (const word of proof.records.filter(record => record.kind === 'lexeme')) {
    assert(Number.isInteger(word.body.syllabusIndex) && word.body.syllabusIndex >= 0);
    const exercise = proof.records.find(record => record.kind === 'exercise' && record.body.targetWordId === word.id);
    for (const language of ['tr', 'de']) assert.equal(exercise.body.support[language].explanation, `${word.body.lemma} — ${word.body.meanings[language]}`);
  }
});
