import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSyllabus, openingPacingViolations, syllabusDefaults } from './syllabus.mjs';

test('each block of ten mixes story words with high-frequency core words and excludes names', () => {
  const lexicon = [
    ...['ich', 'sein', 'und', 'nicht', 'der', 'haben', 'es', 'zu', 'in', 'mit', 'auf', 'wir'].map((lemma, index) => ({ id: `${lemma}-core`, lemma, english: lemma, level: 'A1', pos: 'adv', topic: 'connections', frequencyRank: index + 1, surfaceForms: lemma === 'haben' ? ['hat'] : lemma === 'der' ? ['die', 'das', 'den'] : [] })),
    { id: 'lampe-noun', lemma: 'Lampe', english: 'lamp', level: 'A1', pos: 'noun', topic: 'home', article: 'die', plural: 'Lampen', frequencyRank: 5000 },
    { id: 'zug-noun', lemma: 'Zug', english: 'train', level: 'A1', pos: 'noun', topic: 'travel', article: 'der', frequencyRank: 4000 },
    { id: 'spaet-adj', lemma: 'spät', english: 'late', level: 'A2', pos: 'adj', topic: 'time', frequencyRank: 900 },
    { id: 'otto-noun', lemma: 'Otto', english: 'a motor', level: 'B1', pos: 'noun', topic: 'everyday' },
  ];
  const graph = (questId, german, level = 'A1', introducedWords = {}) => ({ questId, level, introducedWords, investigations: [], nodes: [{ id: 'intro', lines: [{ id: `${questId}-0`, speaker: 'otto', german }] }] });
  const graphs = [graph('first', 'Otto hat die Lampe. Die Tauben schlafen.', 'A1', { Tauben: 'pigeons' }), graph('second', 'Der Zug ist spät.', 'A2')];
  const syllabus = buildSyllabus({ graphs, lexicon, questOrder: ['first', 'second'], properNames: ['Otto'], options: { wordsPerHour: 4, storyShare: 2, openingWords: 2 } });
  assert.deepEqual(syllabus.quests.map(quest => quest.questId), ['first', 'second']);
  assert.ok(!syllabus.quests[0].wordIds.includes('otto-noun'), 'a character name must not become vocabulary');
  assert.deepEqual(syllabus.quests[0].wordIds, ['der-core', 'haben-core', 'lampe-noun']);
  // Block one: two story words by frequency, then the two most frequent core words.
  assert.deepEqual(syllabus.wordIds.slice(0, 4), ['der-core', 'haben-core', 'ich-core', 'sein-core']);
  // Block two: the first scene's last word, then the second scene's most frequent word, then core words.
  assert.deepEqual(syllabus.wordIds.slice(4, 8), ['lampe-noun', 'spaet-adj', 'und-core', 'nicht-core']);
  assert.equal(syllabus.wordIds.length, lexicon.length);
  assert.equal(syllabus.quests[0].milestone, 5);
  assert.ok(syllabus.quests[1].milestone > syllabus.quests[0].milestone);
  assert.throws(() => buildSyllabus({ graphs, lexicon, questOrder: ['first', 'second'], options: { storyShare: 9, wordsPerHour: 4 } }));
});


test('opening budgets retain individual intake and reject regressions in the full scene totals', () => {
  assert.deepEqual(syllabusDefaults,{wordsPerHour:10,openingWords:10,bankCap:15,storyShare:8,brake:{maxUnsettled:12,maxDue:20}});
  const report={quests:[{questId:'a0-morgen',level:'A0',newWordsAboveBudget:0,vocabularyReadyHour:2.9},{questId:'a1-arrival',level:'A1',lexemes:40,newWordsAboveBudget:10,requiredPathLexemes:20}]};
  assert.deepEqual(openingPacingViolations(report),[]);
  report.quests[0].vocabularyReadyHour=3;
  report.quests[0].newWordsAboveBudget=1;
  report.quests[1].lexemes=41;
  assert.equal(openingPacingViolations(report).length,3);
  report.quests[1].lexemes=40;report.quests[1].newWordsAboveBudget=11;
  assert.ok(openingPacingViolations(report).some(message=>message.includes('including optional topics')));
});
