import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditDialogueCorpus } from './dialogue-level-audit.mjs';
import { beginnerGateTranslations } from '../web/src/beginner-dialogue.ts';
import { npcs } from './content-source.mjs';

const course = JSON.parse(await readFile(new URL('../web/src/data/course.json', import.meta.url), 'utf8'));
const graphs = JSON.parse(await readFile(new URL('../web/src/data/dialogue-graphs.json', import.meta.url), 'utf8'));
const { storyMaps } = await import('../web/src/maps.ts');
const properNames = [...npcs.map(npc => npc.name), ...storyMaps.map(map => map.name)];
const options = { lexicon: course.lexicon, properNames };
const fixture = (questId, german, introducedWords = {}) => ({
  questId, level: 'A1', introducedWords, investigations: [],
  nodes: [{ id: 'intro', lines: [{ id: `${questId}-line`, speaker: 'otto', german }] }],
});

test('the optional practice introduction cannot bypass the Act I lexical gate', () => {
  const graph = fixture('a1-arrival', 'Ich helfe dir.');
  const result = auditDialogueCorpus({ ...options, graphs: [graph], quests: [{ id: graph.questId, story: [{ german: 'Die Wahrheit fehlt.' }] }] });
  assert.ok(result.actOneGate.violations.some(error => error.includes('/quest-intro/') && error.includes('Wahrheit')));
});

test('only the exact parcel quotation with an on-demand meaning has a supported-artifact exception', () => {
  const graph = fixture('a1-lost-parcel', 'Bevor du uns wieder auslöschst, komm.');
  const line = graph.nodes[0].lines[0];
  Object.assign(line, { id: 'a1-lost-parcel-complete-1', english: 'Before you erase us again, come.' });
  const audit = () => auditDialogueCorpus({ ...options, graphs: [graph] });
  assert.equal(audit().actOneGate.passed, true);
  assert.ok(audit().entries[0].aboveLevelWords.includes('Bevor'), 'preserve raw difficulty');
  assert.equal(audit().entries[0].supportedArtifact, true);
  delete line.english;
  assert.equal(audit().actOneGate.passed, false);
  line.english = 'Before you erase us again, come.';
  line.german = 'Bevor du uns wieder auslöschst, warte.';
  assert.equal(audit().actOneGate.passed, false);
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

test('the opening has a smaller word budget than the later A1 scenes on every surface', () => {
  const text = 'Ich habe eine Fahrkarte. Die Fahrkarte ist für dich.';
  for (const kind of ['line', 'variant', 'correction', 'investigation', 'choice']) {
    const graph = fixture('a1-arrival', 'Ich helfe dir.');
    const line = graph.nodes[0].lines[0];
    if (kind === 'line') line.german = text;
    if (kind === 'variant') line.variants = [{ german: text }];
    if (kind === 'correction') line.reply = { correction: { id: 'correction', german: text } };
    if (kind === 'investigation') graph.investigations = [{ objectId: 'evidence', german: text }];
    if (kind === 'choice') graph.nodes[0].choices = [{ id: 'reply', german: text }];
    const result = auditDialogueCorpus({ ...options, graphs: [graph] });
    assert.ok(result.actOneGate.violations.some(error => error.includes(`/${kind}/`) && error.includes('8-word')), kind);
    graph.questId = 'a1-workshop';
    assert.equal(auditDialogueCorpus({ ...options, graphs: [graph] }).actOneGate.passed, true);
  }
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
    // A first-person introduction, including Voss offering his name, is not narration.
    const spoken = line.german.replace(new RegExp(`(Ich bin|Ich heiße|Hier spricht|Mein Name ist) ${name}\\b`, 'g'), '');
    assert.ok(!new RegExp(`\\b${name}\\b`).test(spoken), `${line.id}: third-person self-narration`);
    for (const variant of line.variants ?? []) assert.ok(variant.english.trim() && variant.clipId, `${line.id}: incomplete translation or voice reference`);
  }
});

test('A0 requires approved vocabulary, short turns, translated gates and actual clips on every surface', () => {
  const original = graphs.find(graph => graph.questId === 'a0-ticket');
  const audit = graph => auditDialogueCorpus({...options, graphs:[graph], hasClip:id=>!!id});
  assert.equal(audit(original).a0Gate.passed, true);
  const missing = structuredClone(original); delete missing.allowedWords;
  assert.equal(audit(missing).a0Gate.passed, false);
  const long = structuredClone(original); long.nodes[0].lines[0].german = 'Bitte bitte bitte bitte bitte.';
  assert.ok(audit(long).a0Gate.violations.some(message=>message.includes('four-word')));
  const unfamiliar = structuredClone(original); unfamiliar.investigations[0].german = 'Geheimverordnung.';
  assert.ok(audit(unfamiliar).a0Gate.violations.some(message=>message.includes('unapproved')));
  assert.ok(auditDialogueCorpus({...options,graphs:[original],hasClip:()=>false}).a0Gate.violations.some(message=>message.includes('missing clip')));
  assert.ok(auditDialogueCorpus({...options,graphs:[original],gateTranslations:{},hasClip:()=>true}).a0Gate.violations.some(message=>message.includes('gate translations')));
});

test('A0 requires a player reply that is not a conductor line and a separate task prompt', () => {
  const graph=structuredClone(graphs.find(g=>g.questId==='a0-ticket'));
  const audit=()=>auditDialogueCorpus({...options,graphs:[graph],hasClip:()=>true});
  const intro=graph.nodes[0].lines.length;
  // The conductor speaking every offered reply turns the task into an echo.
  for (const [german,english] of beginnerGateTranslations[graph.gateExerciseId]) graph.nodes[0].lines.push({id:`echo-${german}`,speaker:'schaffner',german,english,clipId:'echo'});
  assert.ok(audit().a0Gate.violations.some(message=>message.includes('reply')));
  graph.nodes[0].lines.length=intro;graph.gatePrompt=graph.nodes[0].lines[0].english;
  assert.ok(audit().a0Gate.violations.some(message=>message.includes('prompt')));
});
test('A0 reports seven individual numbers but excludes them from the six-new limit', () => {
  const selected=graphs.filter(g=>g.level==='A0').slice(0,3);
  const result=auditDialogueCorpus({...options,graphs:selected,hasClip:()=>true});
  const wagen=result.a0Gate.scenes.find(g=>g.questId==='a0-wagen');
  assert.equal(wagen.numbers.length,7);
  assert.ok(wagen.lexemes>=7);
  assert.ok(wagen.newLexemes<=6);
});
