import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {acceptedAnswersFor} from './answer-patterns.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const source = read('content/source.json');

test('the grading snapshot in content/source.json matches the generated server manifests', () => {
  // build-content.mjs grades from this snapshot; a hand edit to one copy would grade differently in production.
  assert.deepEqual(source.legacyServer.curriculum, read('server/curriculum.json'));
  assert.deepEqual(source.legacyServer.course, read('server/course.json'));
});

test('every authored answer pattern is valid and expanded into the server curriculum', () => {
  const manifest = new Map(read('server/curriculum.json').exercises.map(exercise => [exercise.id, exercise]));
  const patterned = source.quests.flatMap(quest => quest.exercises).filter(exercise => exercise.answerPattern !== undefined);
  assert.ok(patterned.length > 0);
  for (const exercise of patterned) {
    assert.ok(['type', 'sentence'].includes(exercise.mode), `${exercise.id} is not a production exercise`);
    assert.deepEqual(manifest.get(exercise.id).acceptedAnswers ?? [], acceptedAnswersFor(exercise), exercise.id);
  }
});
