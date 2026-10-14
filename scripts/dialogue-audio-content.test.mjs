import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {jobs} from './dialogue-audio-content.mjs';
import {canVoiceDialogue} from '../web/src/dialogue.ts';
import {buildContent} from './build-content.mjs';
test('voiced authoring corpus contains literal lines and excludes runtime variables and name-free substitutions',()=>{
 assert(jobs.length>500);
 assert(jobs.every(job=>canVoiceDialogue(job.german)));
 assert(jobs.every(job=>!job.clipId.includes('-name-free')));
 const graphs=JSON.parse(readFileSync('web/src/data/dialogue-graphs.json','utf8'));
 const variable=graphs.flatMap(graph=>graph.nodes.flatMap(node=>node.lines)).find(line=>/\{[^{}]+\}/.test(line.german));
 assert(variable);assert(!jobs.some(job=>job.clipId===variable.clipId));
});
test('served source placeholders carry their silent requirement and never advertise recorded audio',()=>{
 const {bundle}=buildContent(),variables=bundle.records.filter(record=>record.kind==='sentence'&&/\{[^{}]+\}/.test(record.body.text));
 assert(variables.length>0);
 for(const record of variables){assert.equal(record.body.audioRequires,true);assert.equal(record.body.audio,undefined);}
});
