import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import './register-content-loader.mjs';
import {buildExpeditionLearning,writeExpeditionLearning} from './expedition-learning.mjs';
const [{expeditionRegions},{expeditionGames},{courseLexicon}]=await Promise.all([import('../web/src/expeditions.ts'),import('../web/src/expedition-games.ts'),import('../web/src/course.ts')]);

const manifest=await buildExpeditionLearning();
const targets=JSON.parse(await readFile(new URL('./expedition-learning-targets.json',import.meta.url),'utf8')).encounters;
const lexemes=new Set(courseLexicon.map(word=>word.id));
const exercises=new Map(manifest.exercises.map(row=>[row.id,row]));

test('every encounter uses its reviewed primary target, two modalities and exact canonical answer',()=>{
 assert.equal(manifest.encounters.length,180);
 assert.equal(Object.keys(targets).length,180);
 assert.deepEqual(new Set(manifest.encounters.map(row=>row.encounterId)),new Set(Object.keys(targets)));
 for(const region of expeditionRegions)for(const encounter of region.encounters){
  const row=manifest.encounters.find(row=>row.encounterId===encounter.id);
  assert.equal(row.targetWordId,targets[encounter.id].targetWordId);
  assert.equal(row.rationale,targets[encounter.id].rationale);
  assert.equal(row.level,encounter.difficulty);
  assert.equal(row.audio,`/audio/expedition-${encounter.id}.mp3`);
  assert(row.wordIds.includes(row.targetWordId));
  assert(row.rationale.length>20);
  for(const mode of ['recognition','listening']){
   const exercise=exercises.get(row.exerciseIds[mode]);
   assert.equal(exercise.mode,mode);
   assert.equal(exercise.answer,encounter.choices.find(choice=>choice.correct).text);
   assert.equal(exercise.regionId,region.id);
   assert.equal(exercise.contentId,encounter.id);
   assert.equal(exercise.itemId,`word-${row.targetWordId}`);
  }
 }
});

test('contrast words are targeted and a cast member is not mistaken for a calendar month',()=>{
 const row=id=>manifest.encounters.find(row=>row.encounterId===id);
 assert.equal(row('saffroncourt-encounter-salma').targetWordId,'hinter-prep');
 assert.equal(row('saffroncourt-encounter-amina').targetWordId,'bevor-conj');
 assert.equal(row('windplain-encounter-hill-map').targetWordId,'zwischen-prep');
 assert(expeditionRegions.find(region=>region.id==='windplain').encounters.find(encounter=>encounter.id==='windplain-encounter-hill-map').choices[0].text.includes('zwischen'));
 assert(manifest.encounters.filter(row=>row.mapId==='riverweave').every(row=>!row.wordIds.includes('mai-noun')));
 assert(manifest.placements.filter(row=>row.mapId==='riverweave').every(row=>!row.wordIds.includes('mai-noun')));
 assert.equal(manifest.authoredAliases.Bildkabel,'kabel-noun');
 assert.equal(manifest.authoredAliases.Ladekabel,'kabel-noun');
 for(const row of manifest.encounters.filter(row=>/Bildkabel|Ladekabel/.test(row.sourceGerman)))assert(row.wordIds.includes('kabel-noun'));
});

test('all thirty plan scaffolds accept exactly the per-field projections of complete valid allocations',()=>{
 assert.equal(manifest.placements.length,129);
 const scaffoldKeys=new Set();
 for(const game of expeditionGames){
  const valid=[];
  const enumerate=(index,values)=>{
   if(index===game.fields.length){if(!game.validate(values).length)valid.push({...values});return;}
   for(const option of game.fields[index].options)enumerate(index+1,{...values,[game.fields[index].id]:option.value});
  };
  enumerate(0,{});assert(valid.length>=2&&valid.length<=3,`${game.id} has ${valid.length} valid allocations`);
  for(const level of ['A1','A2','B1'])for(const field of game.fields){
   scaffoldKeys.add(`${game.id}:${level}`);
   const row=manifest.placements.find(row=>row.mapId===game.id&&row.level===level&&row.fieldId===field.id);
   const exercise=exercises.get(row.exerciseId);
   const allowed=[...new Set(valid.map(values=>values[field.id]))].sort((a,b)=>a-b);
   assert.deepEqual(row.allowedValues,allowed);
   assert.deepEqual(row.labels,field.options.map(option=>({value:option.value,label:option.label})));
   assert.deepEqual([exercise.answer,...exercise.acceptedAnswers],field.options.filter(option=>allowed.includes(option.value)).map(option=>option.label));
   assert(row.prompt&&row.rationale.includes('Supported contextual recognition'));
   assert.equal(row.supported,true);
   assert.equal(exercise.mode,'recognition');
   assert.equal(exercise.miniGameId,'neighborhood-boards');
   assert.equal(exercise.regionId,game.id);assert.equal(exercise.contentId,field.id);
  }
 }
 assert.equal(scaffoldKeys.size,30);
 for(const [mapId,fieldId,target] of [['terracielo','count','drei-num'],['terracielo','width','vierzig-num'],['terracielo','height','sechzig-num'],['cedarbay','people','vier-num'],['dunegarden','reserve','zwei-num'],['riverweave','rice','zwei-num'],['riverweave','route','drei-num'],['sunpatch','time','acht-num']]){
  for(const row of manifest.placements.filter(row=>row.mapId===mapId&&row.fieldId===fieldId))assert.equal(row.targetWordId,target,`${mapId}/${row.level}/${fieldId} tests its actual quantity`);
 }
 assert.equal(manifest.placements.find(row=>row.mapId==='saffroncourt'&&row.fieldId==='gate').targetWordId,'offen-adv');
 assert.equal(manifest.placements.find(row=>row.mapId==='windplain'&&row.fieldId==='radio').targetWordId,'mitnehmen-verb');
});

test('all evidence references active lexemes and client/server generated copies remain identical and current',async()=>{
 assert.equal(manifest.exercises.length,489);
 assert.equal(exercises.size,489);
 for(const exercise of manifest.exercises){
  assert(lexemes.has(exercise.targetWordId),exercise.id);
  assert(exercise.wordIds.length>0);
  assert(exercise.wordIds.every(id=>lexemes.has(id)),exercise.id);
  assert(exercise.wordIds.includes(exercise.targetWordId));
  assert.equal(new Set(exercise.wordIds).size,exercise.wordIds.length);
 }
 await writeExpeditionLearning(true);
 assert.equal(await readFile(new URL('../web/src/data/expedition-learning.json',import.meta.url),'utf8'),await readFile(new URL('../server/expedition_learning.json',import.meta.url),'utf8'));
});

test('compact runtime retains every submission/restoration/presentation field without shipping grading or review prose',async()=>{
 const source=await readFile(new URL('../web/src/data/expedition-learning-runtime.json',import.meta.url),'utf8'),runtime=JSON.parse(source);
 assert.equal(runtime.version,manifest.version);
 assert.deepEqual(runtime.exercises,manifest.exercises.map(({id,itemId,mode,level,wordIds,miniGameId,regionId,contentId})=>({id,itemId,mode,level,wordIds,miniGameId,regionId,contentId})));
 assert.deepEqual(runtime.encounters,manifest.encounters.map(({encounterId,exerciseIds,audio,supported})=>({encounterId,exerciseIds,audio,supported})));
 assert.deepEqual(runtime.placements,manifest.placements.map(({mapId,level,fieldId,exerciseId,prompt})=>({mapId,level,fieldId,exerciseId,prompt})));
 for(const row of [...runtime.exercises,...runtime.encounters,...runtime.placements])for(const field of ['answer','acceptedAnswers','explanation','rationale','sourceGerman','allowedValues','labels'])assert(!Object.hasOwn(row,field));
 assert(source.length<JSON.stringify(manifest).length*.6,'the runtime must avoid carrying the repeated audit payload');
});
