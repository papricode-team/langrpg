import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tokenize, tokenized, tokenTexts } from './content-tokenizer.mjs';
import { alignmentHash, validateAlignment, applyCachedAlignment, alignmentReviewTSV, authorLexicalTemplates } from './content-alignment.mjs';
import { acceptProposals, parseArguments } from './align-content.mjs';

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
});
