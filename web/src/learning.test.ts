import { describe, it, expect } from 'vitest';
import { normalizedAnswer, dueItems, practiceExercises, skipListeningExercises } from './learning';
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
