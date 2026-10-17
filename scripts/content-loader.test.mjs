import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
const execute=promisify(execFile),root=resolve(import.meta.dirname,'..');
test('dependency package JSON and the native bundler load without corpus rewriting',async()=>{
  const code=`import './scripts/register-content-loader.mjs';
  import {createRequire} from 'node:module';
  const require=createRequire(import.meta.url);
  const metadata=require('vite/package.json');
  const vite=await import('vite');
  console.log(JSON.stringify({name:metadata.name,bundler:typeof vite.build}));`;
  const {stdout}=await execute(process.execPath,['--input-type=module','-e',code],{cwd:root,maxBuffer:100000});
  assert.deepEqual(JSON.parse(stdout.trim()),{name:'vite',bundler:'function'});
});
test('project CSS side effects are ignored only for Node authoring imports',async()=>{
  const code=`import './scripts/register-content-loader.mjs';
  const css=await import('./web/src/sentence-translations.css');
  const {canVoiceDialogue}=await import('./web/src/dialogue.ts');
  console.log(JSON.stringify({css:Object.keys(css),literal:canVoiceDialogue('Guten Morgen!'),variable:canVoiceDialogue('Hallo, {name}!')}));`;
  const {stdout}=await execute(process.execPath,['--input-type=module','-e',code],{cwd:root,maxBuffer:100000});
  assert.deepEqual(JSON.parse(stdout.trim()),{css:[],literal:true,variable:false});
});
test('tooling sees the complete private corpus while production modules remain slice registries',async()=>{
  const code=`import './scripts/register-content-loader.mjs';
  const [{quests},{courseLexicon,courseExercises},{expeditionRegions},{expeditionGames},{questGraphs},{turkishOverlay}]=await Promise.all([import('./scripts/content-source.mjs'),import('./web/src/course.ts'),import('./web/src/expeditions.ts'),import('./web/src/expedition-games.ts'),import('./web/src/quest-graph.ts'),import('./web/src/i18n-tr.ts')]);
  console.log(JSON.stringify({quests:quests.length,lexemes:courseLexicon.length,exercises:courseExercises.length,encounters:expeditionRegions.flatMap(region=>region.encounters).length,plans:expeditionGames.length,solutions:expeditionGames.every(game=>game.validate(game.solution).length===0),graphs:questGraphs.length,turkish:Object.keys(turkishOverlay.course.lexicon).length}));`;
  const {stdout}=await execute(process.execPath,['--input-type=module','-e',code],{cwd:root,maxBuffer:100000});
  assert.deepEqual(JSON.parse(stdout.trim()),{quests:48,lexemes:3283,exercises:10266,encounters:180,plans:10,solutions:true,graphs:48,turkish:3283});
});
