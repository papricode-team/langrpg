import test from 'node:test';
import assert from 'node:assert/strict';
import {createLexemeMapper} from './course-word-mapping.mjs';

const words = [
  {id:'ich',lemma:'ich',pos:'pron',surfaceForms:['du','sie','wir']},
  {id:'du',lemma:'du',pos:'pron',surfaceForms:['ich','sie','wir']},
  {id:'sie',lemma:'sie',pos:'pron',surfaceForms:['ich','du','wir']},
  {id:'formal',lemma:'Sie',pos:'pron'},
  {id:'heissen',lemma:'heißen',pos:'verb',surfaceForms:['heiße','heißt']},
  {id:'heiss',lemma:'heiß',pos:'adj',surfaceForms:['heiße']},
  {id:'suppe',lemma:'Suppe',pos:'noun'},
  {id:'morning',lemma:'Morgen',pos:'noun'},
  {id:'tomorrow',lemma:'morgen',pos:'adv'},
  {id:'good',lemma:'gut',pos:'adj',surfaceForms:['Guten']},
  {id:'pickup',lemma:'abholen',pos:'verb',surfaceForms:['holt ab']},
];
const map = createLexemeMapper(words);
test('a greeting exposes its own pronoun and naming verb', () => {
  assert.deepEqual(map('Ich heiße Alex.'), ['heissen','ich']);
  assert.deepEqual(map('du'), ['du']);
});
test('unresolved homographs do not credit every possible headword', () => {
  assert.deepEqual(map('die heiße Suppe'), ['suppe']);
});
test('capitalization and context keep genuine meanings separate', () => {
  assert.deepEqual(map('Guten Morgen!'), ['good','morning']);
  assert.deepEqual(map('Morgen kommt Alex.'), ['tomorrow']);
  assert.deepEqual(map('Sie heißt Alex.'), ['heissen','sie']);
  assert.deepEqual(map('Wie heißen Sie?'), ['formal','heissen']);
});
test('separated verbs retain their own lexical context', () => {
  assert.deepEqual(map('Sie holt das Paket ab.'), ['pickup','sie']);
});
