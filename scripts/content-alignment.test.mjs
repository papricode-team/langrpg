import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {spawn} from 'node:child_process';
import { tokenize, tokenized, tokenTexts } from './content-tokenizer.mjs';
import { alignmentHash, validateAlignment, applyCachedAlignment, alignmentReviewTSV, authorLexicalTemplates, projectAuthoredAlignment } from './content-alignment.mjs';
import { acceptProposals, parseArguments, proposalSchema, codexAlignmentPrompt, codexPreferenceArguments, persistAlignmentCache, authorBatches, pendingAlignmentLines, runAlignment } from './align-content.mjs';

const root=resolve(import.meta.dirname,'..');
const fixtures=JSON.parse(await readFile(resolve(root,'content/alignments/fixtures.json'),'utf8'));
const fixture=name=>structuredClone(fixtures.find(line=>line.fixture===name));

test('tokenization preserves UTF-16 offsets and Unicode compounds',()=>{
  const text="🌙 Café, e\u0301! Lindenhafen'e; someone's Bahnsteig-sieben 12.";
  const value=tokenized(text);
  assert.deepEqual(tokenTexts(value),['Café','e\u0301',"Lindenhafen'e","someone's",'Bahnsteig-sieben','12']);
  assert.equal(value.tokens[0][0],3);
  assert.equal(text.slice(...value.tokens[1]),'e\u0301');
  assert.equal(value.text,text);
});

test('all committed regression fixtures satisfy strict mechanical validation',()=>{
  assert.ok(fixtures.length>=24);
  for (const line of fixtures) assert.deepEqual(validateAlignment(line),[],line.fixture);
});

test('screenshot alignment is authored in both languages, including Turkish suffixes',()=>{
  const line=fixture('screen-records');
  const equivalent=(language,index)=>line.support[language].align.filter(pair=>pair[0]===index).map(pair=>line.support[language].text.slice(...line.support[language].tokens[pair[1]]));
  assert.deepEqual(equivalent('tr',1),['Biletiniz']);
  assert.deepEqual(equivalent('tr',7),['denetlenmesi']);
  assert.deepEqual(equivalent('tr',3),['da']);
  assert.deepEqual(equivalent('en',2),['please']);
});

test('invalid indices, duplicate pairs, missing coverage and overclaimed tokens fail',()=>{
  const invalid=fixture('marta'); invalid.support.en.align.push([99,0],[0,0]);
  assert.ok(validateAlignment(invalid).some(error=>error.includes('out-of-range')));
  assert.ok(validateAlignment(invalid).some(error=>error.includes('duplicate')));
  const missing=fixture('marta'); missing.support.en.align=missing.support.en.align.filter(pair=>pair[0]!==5);
  assert.ok(validateAlignment(missing).some(error=>error.includes('token 5 has no pair')));
  const claims=fixture('marta'); claims.support.en.align=[[0,0],[1,0],[2,0],[3,0],[4,5],[5,6]];
  assert.ok(validateAlignment(claims).some(error=>error.includes('more than three')));
});

test('lexeme references must attest the exact German token',()=>{
  const line=fixture('marta');line.glosses={'5':'coffee'};
  assert.deepEqual(validateAlignment(line,{lexemes:new Map([['coffee',{lemma:'Kaffee',surfaceForms:[]} ]])}),[]);
  assert.ok(validateAlignment(line,{lexemes:new Map([['coffee',{lemma:'Tee'} ]])}).some(error=>error.includes('does not attest')));
  line.de.tokens[0]=[0,4];
  assert.ok(validateAlignment(line,{lexemes:new Map([['coffee',{lemma:'Kaffee'} ]])}).some(error=>error.includes('offsets')));
});

test('hash includes unchanged German and every support language; stale data never highlights',()=>{
  const line=fixture('screen-records'),hash=alignmentHash(line);
  const cache={entries:{[hash]:{status:'reviewed',support:line.support}}};
  assert.equal(applyCachedAlignment(line,cache).alignmentStatus,'reviewed');
  const changed=structuredClone(line);changed.support.tr.text+=' Yeni.';
  assert.notEqual(alignmentHash(changed),hash);
  const pending=applyCachedAlignment(changed,cache);
  assert.equal(pending.alignmentStatus,'pending');
  assert.deepEqual(pending.support.en.align,[]);
  assert.deepEqual(pending.support.tr.align,[]);
});

function wrappedAlignment(){
  const next=fixture('screen-records'),old=structuredClone(next);
  for(const [language,prefix,suffix]of [['en','Write: ',' Check your answer.'],['tr','Yazın: ',' Yanıtınızı kontrol edin.']]){
    const previous=old.support[language];
    old.support[language]={...tokenized(prefix+previous.text+suffix),align:previous.align.map(([source,target])=>[source,target+1]),untranslated:previous.untranslated??{}};
    next.support[language].align=[];
  }
  const hash=alignmentHash(old),cache={version:1,entries:{[hash]:{status:'reviewed',authorship:'codex',nativeReview:'approved',support:structuredClone(old.support)}}};
  return {old,next,hash,cache};
}

test('literal wrapper projection renumbers accepted bilingual pairs without upgrading native review',()=>{
  const {old,next,hash,cache}=wrappedAlignment(),before=structuredClone(cache);
  const projected=projectAuthoredAlignment(old,next,cache);
  assert.equal(projected.status,'authored');assert.equal(projected.nativeReview,'pending');assert.equal(projected.authorship,'codex');assert.equal(projected.derivedFromHash,hash);
  const expected=fixture('screen-records');
  for(const language of ['en','tr']){
    assert.equal(projected.support[language].text,expected.support[language].text);
    assert.deepEqual(projected.support[language].tokens,expected.support[language].tokens);
    assert.deepEqual(projected.support[language].align,expected.support[language].align);
  }
  assert.deepEqual(cache,before);
  const candidate={...next,support:projected.support,alignmentStatus:'authored'};
  assert.deepEqual(validateAlignment(candidate),[]);
});

test('literal projection preserves linguistic omissions and selects only the claimed occurrence',()=>{
  const old={id:'repeated',de:tokenized('der Kaffee'),support:{en:{...tokenized('coffee. / coffee.'),align:[[1,1]],untranslated:{0:'The lexical meaning omits the grammatical article.'}},tr:{...tokenized('kahve. / kahve.'),align:[[1,1]],untranslated:{0:'Turkish has no corresponding grammatical article.'}}}};
  const next={id:'trimmed',de:old.de,support:{en:{...tokenized('coffee.'),align:[]},tr:{...tokenized('kahve.'),align:[]}}};
  const cache={entries:{[alignmentHash(old)]:{status:'authored',authorship:'codex',support:structuredClone(old.support)}}};
  const projected=projectAuthoredAlignment(old,next,cache);
  for(const language of ['en','tr']){assert.deepEqual(projected.support[language].align,[[1,0]]);assert.deepEqual(projected.support[language].untranslated,old.support[language].untranslated);}
  projected.support.tr.untranslated[0]='Changed';
  assert.equal(cache.entries[alignmentHash(old)].support.tr.untranslated[0],'Turkish has no corresponding grammatical article.');
});

test('projection fails closed for changed text, case, punctuation, token boundaries, languages and claimed removals',()=>{
  for(const change of [
    ({next})=>{next.de=tokenized('Andere deutsche Wörter.');},
    ({next})=>{next.de.tokens[0]=[1,4];},
    ({next})=>{next.support.en= {...tokenized('A different meaning.'),align:[]};},
    ({next})=>{next.support.en= {...tokenized(next.support.en.text.replace('Your','your')),align:[]};},
    ({next})=>{next.support.en= {...tokenized(next.support.en.text.replace('please.','please!')),align:[]};},
    ({next})=>{next.support.en= {...tokenized(next.support.en.text.slice(1)),align:[]};},
    ({next})=>{next.support.en.tokens[0]=[1,4];},
    ({next})=>{delete next.support.tr;},
    ({cache,hash})=>{cache.entries[hash].support.en.align.push([0,0]);},
    ({cache,hash})=>{cache.entries[hash].status='proposed';},
    ({cache,hash})=>{delete cache.entries[hash];},
  ]){const data=wrappedAlignment();change(data);assert.equal(projectAuthoredAlignment(data.old,data.next,data.cache),null);}
});

test('source lexical labels author whole meanings and explicitly omit noun articles',()=>{
  const line={id:'line',de:tokenized('der Kaffee'),support:{en:{...tokenized('coffee'),align:[]},tr:{...tokenized('kahve'),align:[]}},glosses:{'1':'word'},alignmentStatus:'pending'};
  const word={lemma:'Kaffee',article:'der',surfaceForms:['Kaffees'],meaning:{en:'coffee',tr:'kahve'}};
  const artifact={records:{lines:[{id:'line',body:line}],lexemes:[{id:'word',body:word}],exercises:[{slug:'lex-kaffee-noun-recognition',body:{kind:'word',targetWordId:'word',exampleLineId:'line'}}]}};
  const authored=authorLexicalTemplates(artifact,{entries:{}});
  assert.equal(authored.authored,1);
  const accepted=applyCachedAlignment(line,authored.cache);
  assert.equal(accepted.alignmentStatus,'authored');
  assert.deepEqual(accepted.support.tr.align,[[1,0]]);
  assert.ok(accepted.support.tr.untranslated[0]);
  assert.equal(authored.cache.entries[alignmentHash(line)].nativeReview,'pending');
  artifact.records.lines[0].body={...line,de:tokenized('Kaffees')};
  assert.equal(authorLexicalTemplates(artifact,{entries:{}}).authored,0,'attested inflection alone does not establish a template relation');
});

test('proposal acceptance is explicit and fails invalid batches without cache mutation',()=>{
  const line=fixture('marta'),proposals={lines:[{id:line.id,support:{en:{align:line.support.en.align,untranslated:{}}}}]};
  const cache={version:1,entries:{}};
  const proposed=acceptProposals([line],proposals,cache);
  assert.equal(proposed.entries[alignmentHash(line)].status,'proposed');
  assert.equal(applyCachedAlignment(line,proposed).alignmentStatus,'pending');
  const accepted=acceptProposals([line],proposals,cache,{accept:true});
  assert.equal(accepted.entries[alignmentHash(line)].status,'authored');
  proposals.lines[0].support.en.align=[[0,99]];
  assert.throws(()=>acceptProposals([line],proposals,cache,{accept:true}),/out-of-range/);
  assert.deepEqual(cache.entries,{});
});

test('review TSV includes raw text, index pairs, omissions and both languages',()=>{
  const tsv=alignmentReviewTSV([fixture('screen-records')]);
  assert.equal(tsv.trim().split('\n').length,3);
  assert.ok(tsv.includes('Biletiniz, lütfen.'));
  assert.ok(tsv.includes('1:Fahrkarte'));
  assert.ok(tsv.includes('0:Biletiniz'));
});

test('CLI supports bounded Codex batches and strict pending checks',()=>{
  assert.deepEqual(parseArguments(['--check','--allow-pending','--propose','--codex','/tmp/codex','--filter','story','--batch-size','6','--limit','12','--accept']),{check:true,allowPending:true,propose:true,codexBin:'/tmp/codex',filter:'story',batchSize:6,limit:12,accept:true});
  assert.throws(()=>parseArguments(['--batch-size','0']),/Invalid/);
  assert.throws(()=>parseArguments(['--claude']),/Unknown/);
  assert.deepEqual(parseArguments(['--concurrency','4','--timeout-ms','300000','--retries','0']),{concurrency:4,timeoutMs:300000,retries:0});
  assert.throws(()=>parseArguments(['--concurrency','17']),/Invalid/);
  assert.throws(()=>parseArguments(['--retries','4']),/Invalid/);
});

const proposalFor=line=>({id:line.id,support:Object.fromEntries(['en','tr'].map(language=>[language,line.support[language]?{
  align:line.support[language].align,
  untranslated:Object.entries(line.support[language].untranslated??{}).map(([index,reason])=>({index:Number(index),reason})),
}:null]))});

test('strict provider schema declares all keys and encodes omissions without arbitrary properties',()=>{
  const visit=value=>{
    if(!value||typeof value!=='object')return;
    if(value.type==='object'){
      assert.equal(value.additionalProperties,false);
      assert.deepEqual([...value.required].sort(),Object.keys(value.properties).sort());
    }
    for(const child of Object.values(value))if(Array.isArray(child))child.forEach(visit);else visit(child);
  };
  visit(proposalSchema);
  const line=fixture('marta'),prompt=codexAlignmentPrompt([line]);
  assert.ok(prompt.includes('Do not use tools, read files, inspect projects, access the network'));
  assert.ok(prompt.includes('every requested line exactly once'));
  assert.ok(prompt.includes(line.de.text));
  assert.ok(prompt.includes('Use null only when that language is absent'));
});

test('provider batches require complete IDs while manual imports allow partial coverage',()=>{
  const first=fixture('marta'),second=fixture('screen-records'),cache={version:1,entries:{}};
  const partial={lines:[proposalFor(first)]};
  assert.equal(Object.keys(acceptProposals([first,second],partial,cache,{accept:true}).entries).length,1);
  assert.throws(()=>acceptProposals([first,second],partial,cache,{accept:true,requireComplete:true}),/Missing proposal/);
  const full=acceptProposals([first,second],{lines:[proposalFor(first),proposalFor(second)]},cache,{accept:true,requireComplete:true});
  const restored=applyCachedAlignment(second,full);
  assert.deepEqual(validateAlignment(restored),[]);
  for(const language of ['en','tr'])assert.deepEqual(restored.support[language].align,second.support[language].align);
  assert.deepEqual(cache.entries,{});
  const bad=proposalFor(first);bad.support.en.untranslated=[{index:0,reason:'a'},{index:0,reason:'b'}];
  assert.throws(()=>acceptProposals([first],{lines:[bad]},cache,{accept:true}),/repeated en omission/);
  assert.throws(()=>acceptProposals([first],{lines:[{id:first.id,support:'invalid'}]},cache),/support object/);
});

test('authoring retries and splits incomplete batches, persists valid lines, and reports isolated failures',async()=>{
  const lines=[fixture('marta'),fixture('screen-records')];lines.push({...fixture('marta'),id:'intentionally-invalid'});
  const accepted=[],calls=[];
  const result=await authorBatches(lines,async(batch,{attempt,diagnostics})=>{
    calls.push({ids:batch.map(line=>line.id),attempt,diagnostics});
    if(batch.length>1)return {lines:[]};
    if(batch[0].id==='intentionally-invalid')return {lines:[{id:batch[0].id,support:{en:null,tr:null}}]};
    return {lines:batch.map(proposalFor)};
  },{batchSize:3,retries:1,onAccepted:async(value,batch)=>accepted.push({value,ids:batch.map(line=>line.id)})});
  assert.equal(result.completed,2);
  assert.equal(result.failures.length,1);
  assert.equal(result.failures[0].id,'intentionally-invalid');
  assert.deepEqual(accepted.flatMap(value=>value.ids),lines.slice(0,2).map(line=>line.id));
  assert.ok(calls.some(call=>call.attempt===1&&call.diagnostics.includes('Missing proposal')));
  for(const value of accepted)for(const entry of Object.values(value.value.entries))assert.equal(entry.status,'authored');
});

test('worker concurrency is bounded and cache-persistence failure stops dispatch',async()=>{
  const lines=Array.from({length:6},(_,index)=>({...fixture('marta'),id:`line-${index}`}));
  let active=0,maximum=0;
  const result=await authorBatches(lines,async batch=>{
    active++;maximum=Math.max(maximum,active);await new Promise(accept=>setTimeout(accept,10));active--;
    return {lines:batch.map(proposalFor)};
  },{batchSize:1,concurrency:2});
  assert.equal(result.completed,6);assert.equal(maximum,2);
  let calls=0;
  await assert.rejects(authorBatches(lines,async batch=>{calls++;return {lines:batch.map(proposalFor)};},{batchSize:1,onAccepted:async()=>{throw new Error('disk unavailable');}}),/disk unavailable/);
  assert.equal(calls,1);
});

test('resuming uses cache hashes rather than stale artifact status and deduplicates triples',()=>{
  const first=fixture('marta'),second=fixture('screen-records');
  const artifact={records:{lines:[{slug:'npc:marta',body:{...first,alignmentStatus:'pending',npcId:'npc'}},{slug:'npc:marta-copy',body:{...first,id:'duplicate',alignmentStatus:'pending',npcId:'npc'}},{slug:'object:screen',body:{...second,alignmentStatus:'authored'}}]}};
  const cache=acceptProposals([first],{lines:[proposalFor(first)]},{entries:{}},{accept:true});
  assert.deepEqual(pendingAlignmentLines(artifact,cache).map(line=>line.id),[second.id]);
  assert.equal(pendingAlignmentLines(artifact,cache,{filter:'story'}).length,0);
  assert.equal(pendingAlignmentLines(artifact,{entries:{}}).length,2);
  assert.equal(pendingAlignmentLines(artifact,{entries:{}},{limit:1}).length,1);
});

test('concurrent atomic cache writes retain all hashes and protect reviewed entries',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'alignment-cache-test-'));
  try{
    const path=resolve(directory,'nested','reviewed.json');
    await persistAlignmentCache(path,{entries:{reviewed:{status:'reviewed',support:{}}}});
    await Promise.all(Array.from({length:6},(_,index)=>persistAlignmentCache(path,{entries:{[`hash-${index}`]:{status:'authored',support:{}},reviewed:{status:'proposed',support:{discard:true}}}})));
    const cache=JSON.parse(await readFile(path,'utf8'));
    assert.equal(Object.keys(cache.entries).length,7);
    assert.deepEqual(cache.entries.reviewed,{status:'reviewed',support:{}});
    assert.deepEqual(await readdir(resolve(directory,'nested')),['reviewed.json']);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('concurrent stale-lock observations fail closed without deleting a lock or saved data',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'alignment-stale-lock-test-'));
  try{
    const pid=await new Promise((accept,reject)=>{const child=spawn(process.execPath,['-e','process.exit(0)']);child.on('error',reject);child.on('close',()=>accept(child.pid));});
    const path=resolve(directory,'cache.json'),saved=JSON.stringify({version:1,entries:{saved:{status:'authored'}}}),owner=JSON.stringify({pid});
    await writeFile(path,saved);await writeFile(path+'.lock',owner);
    const results=await Promise.allSettled([persistAlignmentCache(path,{entries:{first:{status:'authored'}}}),persistAlignmentCache(path,{entries:{second:{status:'authored'}}})]);
    for(const result of results){assert.equal(result.status,'rejected');assert.match(result.reason.message,/Stale alignment cache lock.*remove only the lock file/);}
    assert.equal(await readFile(path,'utf8'),saved);assert.equal(await readFile(path+'.lock','utf8'),owner);
    await writeFile(path+'.lock',JSON.stringify({pid:process.pid}));
    await assert.rejects(persistAlignmentCache(path,{entries:{}},{lockWaitMs:0}),/lock did not clear.*Verify whether its writer is running/);
    assert.deepEqual(await readdir(directory),['cache.json','cache.json.lock']);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('authoring checks and review use the returned export after sources change',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'alignment-fresh-export-test-'));
  try{
    const old=fixture('screen-records'),changed={...fixture('screen-ticket'),id:old.id,alignmentStatus:'pending'},added={...fixture('cloud'),alignmentStatus:'pending'};
    for(const line of [changed,added])for(const support of Object.values(line.support))support.align=[];
    const artifact=lines=>({records:{lines:lines.map(body=>({id:body.id,slug:body.id,body})),lexemes:[],exercises:[]}});
    await mkdir(resolve(directory,'server'),{recursive:true});await mkdir(resolve(directory,'content/alignments'),{recursive:true});
    await writeFile(resolve(directory,'server/content.json'),JSON.stringify(artifact([old])));
    await writeFile(resolve(directory,'content/alignments/reviewed.json'),JSON.stringify({version:1,entries:{[alignmentHash(old)]:{status:'authored',support:old.support}}}));
    const exporter=async()=>({artifact:artifact([changed,added])});
    await assert.rejects(runAlignment({root:directory,authorTemplates:true,check:true,exporter}),/2 of 2 lines have missing authored alignment/);
    const summary=await runAlignment({root:directory,authorTemplates:true,review:true,exporter});
    assert.deepEqual(summary,{lines:2,reviewed:0,authored:0,pending:2});
    const review=await readFile(resolve(directory,'content/review/alignment.tsv'),'utf8');
    assert.ok(review.includes(changed.support.en.text));assert.ok(review.includes(added.support.en.text));assert.ok(!review.includes(old.support.en.text));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('isolated authoring inherits only root model and effort preferences',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'alignment-preferences-test-'));
  try{
    const path=resolve(directory,'config.toml');
    await writeFile(path,'model = "gpt-6-astra"\nmodel_reasoning_effort = "high"\nmodel_provider = "private"\n[mcp_servers.private]\ncommand = "private-data"\nmodel = "do-not-forward"\n');
    assert.deepEqual(await codexPreferenceArguments(path),['--model','gpt-6-astra','-c','model_reasoning_effort="high"']);
    assert.deepEqual(await codexPreferenceArguments(resolve(directory,'absent.toml')),[]);
  }finally{await rm(directory,{recursive:true,force:true});}
});
