import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './register-content-loader.mjs';
import { buildSyllabus, pacingReport, questVocabularyDemand, secondsUntilPosition, syllabusDefaults } from './syllabus.mjs';
import { quests, npcs } from '../web/src/content.ts';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const course = await read('../web/src/data/course.json');
const graphs = await read('../web/src/data/dialogue-graphs.json');
const shipped = await read('../web/src/data/syllabus.json');
const serverCopy = await read('../server/syllabus.json');
const savedReport = await read('../docs/audits/pacing.json');
const { storyMaps } = await import('../web/src/maps.ts');
const questOrder = quests.map(quest => quest.id);
const properNames = [...npcs.map(npc => npc.name), ...storyMaps.map(map => map.name)];
const input = { graphs, lexicon: course.lexicon, questOrder, properNames, edition: course.edition };

test('the checked-in syllabus is the deterministic build of the current lexicon and story', () => {
  const built = buildSyllabus(input);
  assert.deepEqual(buildSyllabus(input), built, 'two builds must agree');
  assert.deepEqual(shipped, built, 'web/src/data/syllabus.json drift: run node scripts/build-syllabus.mjs');
  assert.deepEqual(serverCopy, built, 'server/syllabus.json drift: run node scripts/build-syllabus.mjs');
  assert.equal(built.wordsPerHour, syllabusDefaults.wordsPerHour);
  assert.equal(built.wordIds.length, course.lexicon.length);
  assert.equal(new Set(built.wordIds).size, built.wordIds.length);
});

test('story vocabulary comes first and every vocabulary coverage milestone is monotone in clue order', () => {
  const demand = questVocabularyDemand({ graphs, lexicon: course.lexicon, questOrder, properNames });
  const arrival = new Set(demand.get('a1-arrival').wordIds);
  assert.ok(shipped.wordIds.slice(0, shipped.wordsPerHour).filter(id => arrival.has(id)).length >= shipped.storyShare, 'most opening words belong to the first conversation');
  let previous = 0;
  for (const quest of shipped.quests) {
    const position = new Map(shipped.wordIds.map((id, index) => [id, index]));
    assert.deepEqual(new Set(quest.wordIds), new Set(demand.get(quest.questId).wordIds), quest.questId);
    assert.equal(quest.milestone, Math.max(...quest.wordIds.map(id => position.get(id) + 1)));
    assert.ok(quest.milestone >= previous, `${quest.questId} has vocabulary coverage before an earlier scene`);
    previous = quest.milestone;
  }
  // Names, Frau/Herr surnames and glossed story words never borrow a lexeme.
  const taub = course.lexicon.find(word => word.lemma === 'taub');
  if (taub) assert.ok(!demand.get('a1-arrival').wordIds.includes(taub.id), 'pigeons are a glossed story word, not the adjective taub');
});

test('the pacing audit matches the checked-in report and measures hours at the budget', () => {
  const demand = questVocabularyDemand({ graphs, lexicon: course.lexicon, questOrder, properNames });
  const report = pacingReport({ syllabus: shipped, lexicon: course.lexicon, demand, questOrder });
  for (const key of ['budget', 'totals', 'quests']) assert.deepEqual(savedReport[key], report[key], `docs/audits/pacing.json drift: run node scripts/audit-pacing.mjs (${key})`);
  assert.equal(secondsUntilPosition(shipped, 0), 0);
  assert.equal(secondsUntilPosition(shipped, shipped.openingWords), 360);
  assert.equal(report.totals.wordsAtTarget, Math.min(shipped.wordIds.length, shipped.openingWords + 200 * shipped.wordsPerHour));
  for (const quest of report.quests) {
    assert.equal(quest.vocabularyReadyHour, Number((secondsUntilPosition(shipped, quest.milestone - 1) / 3600).toFixed(2)));
    assert.ok(quest.newLexemes <= quest.lexemes);
  }
});

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
