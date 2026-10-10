import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createListeningDistractorPicker, spokenWord } from './course-listening-distractors.mjs';

const course = JSON.parse(await readFile(new URL('../web/src/data/course.json', import.meta.url), 'utf8'));
const lexicon = course.lexicon;
const pick = createListeningDistractorPicker(lexicon);
const levels = ['A1', 'A2', 'B1'];
const normalized = text => text.normalize('NFC').toLowerCase().replaceAll('ß', 'ss');

test('listening distractors use distinct German forms and known-level vocabulary', () => {
  for (const word of lexicon) {
    const choices = pick(word);
    assert.equal(choices.length, 3, word.id);
    const forms = choices.map(choice => normalized(spokenWord(choice)));
    assert.equal(new Set(forms).size, 3, `${word.id}: duplicate options`);
    assert.ok(!forms.includes(normalized(spokenWord(word))), `${word.id}: target repeated`);
    for (const choice of choices) {
      assert.ok(levels.indexOf(choice.level) <= levels.indexOf(word.level), `${word.id}: untaught ${choice.level} distractor`);
      assert.ok(choice.pos === word.pos || ['article', 'det', 'pron'].includes(word.pos) && ['article', 'det', 'pron'].includes(choice.pos), `${word.id}: unrelated grammatical shape`);
    }
    const topicPeers = lexicon.filter(other => other.id !== word.id && other.level === word.level
      && other.pos === word.pos && other.topic === word.topic
      && normalized(spokenWord(other)) !== normalized(spokenWord(word)));
    if (new Set(topicPeers.map(spokenWord)).size >= 3) {
      assert.ok(choices.every(choice => choice.topic === word.topic && choice.pos === word.pos && choice.level === word.level), `${word.id}: ignored plausible topic peers`);
    }
  }
});

test('per-item distractors are deterministic, varied and independent of source ordering', () => {
  const reordered = createListeningDistractorPicker([...lexicon].reverse());
  const sets = new Map();
  for (const word of lexicon) {
    const choices = pick(word).map(spokenWord);
    assert.deepEqual(reordered(word).map(spokenWord), choices, `${word.id}: source order changed choices`);
    const key = [...choices].sort().join('|');
    sets.set(key, (sets.get(key) ?? 0) + 1);
  }
  assert.ok(sets.size > lexicon.length * .75, `Only ${sets.size} distinct sets for ${lexicon.length} items`);
  assert.ok(Math.max(...sets.values()) < 25, 'A common distractor set makes listening solvable by elimination');
});

test('generated listening items use the current picker', () => {
  const byId = new Map(lexicon.map(word => [word.id, word]));
  for (const exercise of course.exercises.filter(exercise => exercise.id.startsWith('lex-') && exercise.mode === 'listen')) {
    assert.deepEqual(exercise.options.slice(1), pick(byId.get(exercise.targetWordId)).map(spokenWord), exercise.id);
    assert.equal(exercise.options[0], exercise.answer);
    assert.equal(new Set(exercise.options).size, 4, exercise.id);
  }
});
