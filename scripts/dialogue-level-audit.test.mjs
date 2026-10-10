import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditDialogueCorpus } from './dialogue-level-audit.mjs';
import { quests, npcs } from '../web/src/content.ts';

const course = JSON.parse(await readFile(new URL('../web/src/data/course.json', import.meta.url), 'utf8'));
const graphs = JSON.parse(await readFile(new URL('../web/src/data/dialogue-graphs.json', import.meta.url), 'utf8'));
const savedReport = JSON.parse(await readFile(new URL('../docs/audits/dialogue-levels.json', import.meta.url), 'utf8'));
const { storyMaps } = await import('../web/src/maps.ts');
const properNames = [...npcs.map(npc => npc.name), ...storyMaps.map(map => map.name)];
const options = { lexicon: course.lexicon, properNames };
const fixture = (questId, german, introducedWords = {}) => ({
  questId, level: 'A1', introducedWords, investigations: [],
  nodes: [{ id: 'intro', lines: [{ id: `${questId}-line`, speaker: 'otto', german }] }],
});

test('Act I is comprehensible on every authored surface while retaining raw evidence', () => {
  const result = auditDialogueCorpus({ ...options, graphs, questOrder: quests.map(quest => quest.id) });
  assert.deepEqual(result.actOneGate.violations, []);
  assert.equal(result.actOneGate.passed, true);
  assert.ok(result.actOneGate.checkedEntries > result.entries.filter(entry => entry.level === 'A1' && entry.kind === 'line').length, 'the gate must inspect more than NPC lines');
  assert.ok(result.rawSummary.A1.linesWithAboveLevelWords > 0, 'raw demands must remain visible');
  assert.equal(result.adjustedSummary.A1.linesWithAboveLevelWords, 0);
  assert.equal(result.adjustedSummary.A1.linesWithUnmappedWords, 0);
  for (const key of ['rawSummary', 'adjustedSummary', 'introductions', 'actOneGate']) assert.deepEqual(savedReport[key], result[key], `checked-in audit drift: ${key}`);
  for (const introduction of result.introductions.filter(item => item.level === 'A1')) {
    assert.ok(introduction.newWords.length <= 2, introduction.questId);
    for (const word of introduction.newWords) assert.ok(word.english.trim());
  }
  assert.deepEqual(new Set(result.entries.filter(entry => entry.level === 'A1').map(entry => entry.kind)), new Set(['line', 'variant', 'correction', 'choice', 'investigation']));
});

test('introduced vocabulary carries forward in canonical quest order and never backwards', () => {
  const first = fixture('first', 'Die Laterne ist hell.', { Laterne: 'lantern' });
  const second = fixture('second', 'Die Laterne ist hell.');
  const result = auditDialogueCorpus({ ...options, graphs: [second, first], questOrder: ['first', 'second'] });
  assert.equal(result.actOneGate.passed, true);
  assert.ok(result.entries.find(entry => entry.questId === 'second').resolutions.some(word => word.word === 'Laterne' && word.introducedIn === 'first' && word.english === 'lantern'));
  const backwards = auditDialogueCorpus({ ...options, graphs: [first, second], questOrder: ['second', 'first'] });
  assert.ok(backwards.actOneGate.violations.some(error => error.includes('second/line') && error.includes('Laterne')));
});

test('an English gloss and a two-word budget are required before vocabulary is approved', () => {
  const missing = auditDialogueCorpus({ ...options, graphs: [fixture('missing', 'Die Laterne ist hell.', { Laterne: '' })] });
  assert.ok(missing.actOneGate.violations.some(error => error.includes('explicit English gloss')));
  assert.ok(missing.actOneGate.violations.some(error => error.includes('unapproved above-level word Laterne')));
  const excessive = auditDialogueCorpus({ ...options, graphs: [fixture('excessive', 'Laterne. Glocke. Siegel.', { Laterne: 'lantern', Glocke: 'bell', Siegel: 'seal' })] });
  assert.ok(excessive.actOneGate.violations.some(error => error.includes('at most 2')));
  const unused = auditDialogueCorpus({ ...options, graphs: [fixture('unused', 'Ich helfe dir.', { Laterne: 'lantern' })] });
  assert.ok(unused.actOneGate.violations.some(error => error.includes('never presented')));
});

test('unsupported words cannot hide in variants, corrections, evidence or choices', () => {
  for (const kind of ['line', 'variant', 'correction', 'investigation', 'choice']) {
    const graph = fixture('regression', 'Ich helfe dir.');
    const line = graph.nodes[0].lines[0];
    if (kind === 'line') line.german = 'Die Wahrheit fehlt.';
    if (kind === 'variant') line.variants = [{ german: 'Die Wahrheit fehlt.' }];
    if (kind === 'correction') line.reply = { correction: { id: 'correction', german: 'Die Wahrheit fehlt.' } };
    if (kind === 'investigation') graph.investigations = [{ objectId: 'evidence', german: 'Die Wahrheit fehlt.' }];
    if (kind === 'choice') graph.nodes[0].choices = [{ id: 'reply', german: 'Die Wahrheit fehlt.' }];
    const result = auditDialogueCorpus({ ...options, graphs: [graph] });
    assert.ok(result.actOneGate.violations.some(error => error.includes(`/${kind}/`) && error.includes('Wahrheit')), kind);
  }
});

test('word approval cannot bypass grammar or sentence complexity checks', () => {
  const graph = fixture('grammar', 'Ich weiß, dass die Laterne hell ist.', { Laterne: 'lantern' });
  const result = auditDialogueCorpus({ ...options, graphs: [graph] });
  assert.ok(result.actOneGate.violations.some(error => error.includes('advanced grammar dass')));
  const indirect = auditDialogueCorpus({ ...options, graphs: [fixture('indirect', 'Sag mir, wie du heißt.')] });
  assert.ok(indirect.actOneGate.violations.some(error => error.includes('indirect-question')));
  const long = auditDialogueCorpus({ ...options, graphs: [fixture('long', `${'Ich helfe dir. '.repeat(6)}`)] });
  assert.ok(long.actOneGate.violations.some(error => error.includes('16-word Act I turn limit')));
});

test('proper-name resolutions do not approve a higher-level common noun elsewhere', () => {
  const person = auditDialogueCorpus({ ...options, graphs: [fixture('person', 'Frau Berg ist hier.')] });
  assert.equal(person.actOneGate.passed, true);
  assert.ok(person.entries[0].aboveLevelWords.includes('Berg'));
  assert.ok(person.entries[0].resolutions.some(word => word.word === 'Berg' && word.reason === 'proper-name'));
  const mountain = auditDialogueCorpus({ ...options, graphs: [fixture('mountain', 'Der Berg ist hier.')] });
  assert.ok(mountain.actOneGate.violations.some(error => error.includes('unapproved above-level word Berg')));
  const unknown = auditDialogueCorpus({ ...options, graphs: [fixture('unknown', 'Die Geheimverordnung fehlt.')] });
  assert.ok(unknown.actOneGate.violations.some(error => error.includes('unresolved word Geheimverordnung')));
});

test('later acts have selective simpler variants and speakers do not narrate themselves', () => {
  const later = graphs.filter(graph => graph.level !== 'A1');
  const result = auditDialogueCorpus({ ...options, graphs: later });
  for (const level of ['A2', 'B1']) {
    const variants = result.entries.filter(entry => entry.kind === 'variant' && entry.level === level);
    assert.ok(variants.length > 0, `${level}: missing learner support`);
    const demand = entry => entry.aboveLevelWords.length + entry.unmappedWords.length;
    const original = variants.map(variant => result.entries.find(entry => entry.kind === 'line' && entry.lineId === variant.lineId));
    assert.ok(variants.reduce((sum, entry) => sum + demand(entry), 0) < original.reduce((sum, entry) => sum + demand(entry), 0), `${level}: variants must reduce lexical demands`);
  }
  const names = Object.fromEntries(npcs.map(npc => [npc.id, npc.id === 'inspector' ? 'Voss' : npc.name.split(' ')[0]]));
  for (const graph of later) for (const node of graph.nodes) for (const line of node.lines) {
    const name = names[line.speaker];
    assert.ok(!new RegExp(`\\b${name}\\b`).test(line.german), `${line.id}: third-person self-narration`);
    for (const variant of line.variants ?? []) assert.ok(variant.english.trim() && variant.clipId, `${line.id}: incomplete translation or voice reference`);
  }
});
