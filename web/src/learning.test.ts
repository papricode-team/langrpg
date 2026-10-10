import { describe, it, expect } from 'vitest';
import { normalizedAnswer, answerMatches, gradeFeedback, sentenceTiles, dueItems, modeFor, practiceExercises, remainingQuestExercises, skipListeningExercises } from './learning';
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
  const typed = {id:'test',itemId:'test',mode:'type' as const,prompt:'Write in German',german:'',english:'',answer:'Ich möchte einen Kaffee',hint:'',explanation:'A café order.'};
  it('preserves significant German orthography while accepting case and punctuation', () => {
    expect(normalizedAnswer('  Ich  möchte einen Kaffee! ')).toBe('ich möchte einen kaffee');
    expect(normalizedAnswer('schön')).not.toBe(normalizedAnswer('schon'));
    expect(normalizedAnswer('Straße')).not.toBe(normalizedAnswer('Strasse'));
  });
  it('accepts umlaut keyboard spellings and one mechanical typing slip in production', () => {
    expect(answerMatches(typed, 'Ich moechte einen Kafefe')).toBe(true);
    expect(answerMatches(typed, 'Ich möchte einen Kafffee')).toBe(true);
    expect(answerMatches(typed, 'Ich möchte einen Kaffe')).toBe(true);
    expect(answerMatches({...typed, answer:'schön'}, 'schoen')).toBe(true);
  });
  it('keeps grammar, significant orthography, short words and multiple mistakes strict', () => {
    for (const answer of ['Ich mochte einen Kaffee','Ich möchte ein Kaffee','Ich möchte einen Koffee','Ich möcthe einen Kafefe']) expect(answerMatches(typed, answer)).toBe(false);
    expect(answerMatches({...typed, answer:'schön'}, 'schon')).toBe(false);
    expect(answerMatches({...typed, answer:'Straße'}, 'Strasse')).toBe(false);
    expect(answerMatches({...typed, answer:'der Bahnhof',caseSensitive:true}, 'der bahnhof')).toBe(false);
    expect(answerMatches({...typed,mode:'choice',answer:'schön'}, 'schoen')).toBe(false);
    expect(answerMatches({...typed,mode:'listen',answer:'Kaffee'}, 'Kafefe')).toBe(false);
  });
  it('names article, capitalization and word-order errors', () => {
    expect(gradeFeedback({...typed,answer:'der Bahnhof'},'die Bahnhof')).toContain('article');
    expect(gradeFeedback({...typed,answer:'Bahnhof',caseSensitive:true},'bahnhof')).toContain('capitalization');
    expect(gradeFeedback({...typed,answer:'Ich trinke Kaffee'},'Ich Kaffee trinke')).toContain('word order');
  });
  it('keeps every story sentence solvable while adding plausible grammar distractors',()=>{
    for(const exercise of quests.flatMap(quest=>quest.exercises).filter(exercise=>exercise.mode==='sentence')) {
      const tiles=sentenceTiles(exercise);
      expect(tiles.slice(0,exercise.tokens!.length)).toEqual(exercise.tokens);
      expect(tiles.length).toBeGreaterThan(exercise.tokens!.length);
      expect(tiles.slice(exercise.tokens!.length).every(tile=>!exercise.tokens!.includes(tile))).toBe(true);
    }
  });
  it('keeps meaningful noun and formal Sie capitals in authored story production',()=>{
    const exercise=quests.flatMap(quest=>quest.exercises).find(exercise=>exercise.id==='a2-apartment-exercise-6')!;
    expect(answerMatches(exercise,'Könnten sie das bitte reparieren?')).toBe(false);
    expect(gradeFeedback(exercise,'Könnten sie das bitte reparieren?')).toContain('capitalization');
    expect(gradeFeedback(exercise,'Koennten sie das bitte reparieren?')).toContain('capitalization');
    const address=quests.flatMap(quest=>quest.exercises).find(exercise=>exercise.id==='a1-lost-parcel-exercise-2')!;
    expect(answerMatches(address,'Wie ist die adresse?')).toBe(false);
    expect(answerMatches(address,address.answer)).toBe(true);
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
