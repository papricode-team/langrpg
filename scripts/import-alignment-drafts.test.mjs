import test from 'node:test';
import assert from 'node:assert/strict';
import {convertAlignedLine,importAlignedDrafts} from './import-alignment-drafts.mjs';
import {sourceTokens,compileTranslation} from './content-model.mjs';
const tokenized=text=>({text,tokens:sourceTokens(text).map(word=>[word.range.start,word.range.end])});
test('historical pairs preserve repeated occurrences, split spans and authored omissions',()=>{
  const line={de:tokenized('Sie möchte Sie.'),support:{en:{...tokenized('She would like you.'),align:[[0,0],[1,1],[1,2],[2,3]],untranslated:{}}}};
  const converted=convertAlignedLine(line),map=converted.translations.en;
  const compiled=compileTranslation(line.de.text,map,sourceTokens(line.de.text));
  assert.deepEqual(compiled.words.map(word=>word.targetRanges.map(range=>map.text.slice(range.start,range.end))),[['She'],['would','like'],['you']]);
  assert.equal(compiled.words[2].source.occurrence,2);
  const omitted=convertAlignedLine({de:tokenized('werden'),support:{tr:{...tokenized('denetlenmesi'),align:[],untranslated:{0:'Auxiliary is expressed by the translated passive.'}}}});
  assert.deepEqual(omitted.translations.tr.words[0].targets,[]);
  assert.throws(()=>convertAlignedLine({de:tokenized('werden'),support:{tr:{...tokenized('denetlenmesi'),align:[]}}}),/explicit no-counterpart/);
});
test('fixture-reviewed historical status never becomes native signoff and invalid tokens remain reviewer input',()=>{
  const line={de:tokenized('Hallo'),support:{en:{...tokenized('Hello'),align:[[0,0]]}},alignmentStatus:'reviewed'};
  const artifact={records:{lines:[{slug:'greeting:1',body:line},{slug:'broken',body:{...line,de:{text:'Hallo',tokens:[[9,10]]}}}]}};
  const result=importAlignedDrafts(artifact,{cache:{entries:{hash:{status:'reviewed',source:'fixture:hello'}}}});
  assert.equal(result.entries[0].provenance.nativeReview,'pending');
  assert.equal(result.provenance.hash.nativeReview,'not-attested');
  assert.equal(result.rejected.length,1);assert.equal(result.rejected[0].slug,'broken');
});
