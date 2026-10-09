import { describe, it, expect } from 'vitest';
import { normalizedAnswer, dueItems, modeFor, practiceExercises, remainingQuestExercises, skipListeningExercises } from './learning';
import { emptyProgress } from './api';
import { quests } from './content';

describe('silent mode', () => {
  const exercises = quests.flatMap(quest => quest.exercises);
  const listening = exercises.find(exercise => exercise.mode === 'listen')!;
  const reading = exercises.find(exercise => exercise.mode === 'choice')!;
  const writing = exercises.find(exercise => exercise.mode === 'sentence')!;

  it('skips listening across story content and keeps the original exercises available when disabled', () => {
    const queue = practiceExercises(exercises, true);
    expect(queue).toEqual(exercises.filter(exercise => exercise.mode !== 'listen'));
    expect(practiceExercises(exercises, false)).toEqual(exercises);
    expect(practiceExercises([listening], true)).toEqual([]);
  });

  it('moves straight to the next silent exercise without losing answered history or counting retries twice', () => {
    const session = { queue: [reading, listening, writing, listening], index: 1, targetCount: 3 };
    skipListeningExercises(session);
    expect(session).toEqual({ queue: [reading, writing], index: 1, targetCount: 2 });
    skipListeningExercises(session);
    expect(session.targetCount).toBe(2);
  });

  it('ends the session when only listening remains', () => {
    const session = { queue: [reading, listening], index: 1, targetCount: 2 };
    skipListeningExercises(session);
    expect(session.index).toBe(session.queue.length);
    expect(session.targetCount).toBe(1);
  });

  it.each(quests.map(quest => [quest.id, quest] as const))('finishes %s after saved reading and writing answers without claiming listening success', (_, quest) => {
    const progress = emptyProgress();
    for (const exercise of practiceExercises(quest.exercises, true)) {
      progress.items[exercise.itemId] = {
        itemId: exercise.itemId, stabilityDays: 1, difficulty: 5, repetitions: 1, lapses: 0,
        lastSeenAt: '2026-10-09T12:00:00Z', dueAt: '2026-10-10T12:00:00Z',
        modeStats: { [modeFor(exercise)]: { attempts: 1, correct: 1, unaidedSuccesses: 0 } },
      };
    }
    expect(remainingQuestExercises(quest.exercises, progress, true)).toEqual([]);
    expect(remainingQuestExercises(quest.exercises, progress, false)).toEqual(quest.exercises.filter(exercise => exercise.mode === 'listen'));
    for (const exercise of quest.exercises.filter(exercise => exercise.mode === 'listen')) {
      expect(progress.items[exercise.itemId]).toBeUndefined();
    }
  });

  it('still requires unanswered reading and writing exercises in silent mode', () => {
    expect(remainingQuestExercises([reading, listening, writing], emptyProgress(), true)).toEqual([reading, writing]);
  });
});

describe('language answers', () => {
  it('preserves significant German orthography while accepting case and punctuation', () => {
    expect(normalizedAnswer('  Ich  möchte einen Kaffee! ')).toBe('ich möchte einen kaffee');
    expect(normalizedAnswer('schön')).not.toBe(normalizedAnswer('schon'));
    expect(normalizedAnswer('Straße')).not.toBe(normalizedAnswer('Strasse'));
  });
});
describe('review selection', () => {
  it('selects overdue material in order and lets future reviews rest', () => {
    const progress = emptyProgress();
    const base = { stabilityDays: 1, difficulty: 5, repetitions: 1, lapses: 0, lastSeenAt: '', modeStats: {} };
    progress.items = {
      later: { ...base, itemId: 'later', dueAt: '2030-01-01T00:00:00Z' },
      second: { ...base, itemId: 'second', dueAt: '2026-10-07T00:00:00Z' },
      first: { ...base, itemId: 'first', dueAt: '2026-10-06T00:00:00Z' },
    };
    expect(dueItems(progress, Date.parse('2026-10-08T00:00:00Z'))).toEqual(['first', 'second']);
  });
});
