import { describe, expect, it } from 'vitest';
import { beginnerGateChoices, beginnerReplyMeaning, needsBeginnerStorySupport } from './beginner-dialogue';
import { emptyProgress, type Progress } from './api';
import { quests } from './content';
import { answerMatches } from './learning';
import { questGraphs } from './quest-graph';

describe('beginner dialogue replies', () => {
  const a1Graphs = questGraphs.filter(graph => graph.level === 'A1');

  it('covers every A1 story gate with two short, translated replies', () => {
    expect(a1Graphs).toHaveLength(quests.filter(quest => quest.level === 'A1').length);
    for (const graph of a1Graphs) {
      const replies = beginnerGateChoices(graph.gateExerciseId);
      expect(replies).toHaveLength(2);
      expect(new Set(replies.map(reply => reply.id)).size).toBe(2);
      for (const reply of replies) {
        expect(reply.id).toBe(reply.german);
        expect(reply.german.trim().length).toBeGreaterThan(0);
        expect(reply.german.split(/\s+/).length).toBeLessThanOrEqual(5);
        expect(reply.english.trim().length).toBeGreaterThan(0);
        expect(reply.english).not.toBe(reply.german);
        expect(reply.next).toBe('');
        expect(reply.effects).toEqual([]);
      }
    }
  });

  it('offers exactly one canonical answer accepted by existing grading for each gate', () => {
    for (const graph of a1Graphs) {
      const exercise = quests.find(quest => quest.id === graph.questId)!
        .exercises.find(candidate => candidate.id === graph.gateExerciseId)!;
      const replies = beginnerGateChoices(graph.gateExerciseId);
      const correct = replies.filter(reply => answerMatches(exercise, reply.id));
      expect(correct).toHaveLength(1);
      expect(correct[0].id).toBe(exercise.answer);
      expect(correct[0].english).toBe(exercise.english);
    }
  });

  it('leaves later levels and unknown exercises without replacement replies', () => {
    for (const graph of questGraphs.filter(graph => graph.level !== 'A1')) {
      expect(beginnerGateChoices(graph.gateExerciseId)).toEqual([]);
    }
    expect(beginnerGateChoices('unknown')).toEqual([]);
  });

  it('returns fresh choices so a rendered scene cannot modify the next encounter', () => {
    const first = beginnerGateChoices(a1Graphs[0].gateExerciseId);
    first[0].english = 'Changed';
    first[0].effects.push({ flag: 'changed' });
    const next = beginnerGateChoices(a1Graphs[0].gateExerciseId);
    expect(next[0].english).toBe('Once again, please.');
    expect(next[0].effects).toEqual([]);
  });

  it('gives an English meaning for every arrival greeting option', () => {
    const greeting = quests.find(quest => quest.id === 'a1-arrival')!.exercises
      .find(exercise => exercise.id === 'a1-arrival-exercise-1')!;
    for (const option of greeting.options!) {
      expect(beginnerReplyMeaning(option)?.trim().length).toBeGreaterThan(0);
      expect(beginnerReplyMeaning(option)).not.toBe(option);
    }
    expect(beginnerReplyMeaning(greeting.answer)).toBe(greeting.english);
    expect(beginnerReplyMeaning('Guten Abend!')).toBe('Good evening!');
    expect(beginnerReplyMeaning('unknown')).toBeUndefined();
  });
});

describe('story support follows independent learning', () => {
  function practiced(): Progress {
    const progress = emptyProgress();
    progress.completedQuestIds = ['a1-arrival', 'a1-cafe', 'a1-market'];
    for (let index = 0; index < 12; index++) {
      progress.recentAttempts[String(index)] = {
        id: String(index), itemId: `item-${index}`, exerciseId: `exercise-${index}`,
        mode: index < 4 ? 'production' : 'recognition', correct: true, hinted: false,
        at: new Date(Date.UTC(2026, 9, 11, 12, index)).toISOString(),
      };
    }
    return progress;
  }

  it('keeps a new learner supported, even after completing the whole story with help', () => {
    const progress = emptyProgress();
    expect(needsBeginnerStorySupport(progress)).toBe(true);
    progress.completedQuestIds = quests.map(quest => quest.id);
    progress.xp = 10000;
    expect(needsBeginnerStorySupport(progress)).toBe(true);
    const helped = practiced();
    Object.values(helped.recentAttempts).forEach(attempt => { attempt.hinted = true; });
    expect(needsBeginnerStorySupport(helped)).toBe(true);
  });

  it('requires the three foundation quests and varied independent recognition and writing', () => {
    const progress = practiced();
    expect(needsBeginnerStorySupport(progress)).toBe(false);
    progress.completedQuestIds.pop();
    expect(needsBeginnerStorySupport(progress)).toBe(true);
    const recognitionOnly = practiced();
    Object.values(recognitionOnly.recentAttempts).forEach(attempt => { attempt.mode = 'recognition'; });
    expect(needsBeginnerStorySupport(recognitionOnly)).toBe(true);
    const repeated = practiced();
    Object.values(repeated.recentAttempts).forEach(attempt => { attempt.itemId = 'same-item'; });
    expect(needsBeginnerStorySupport(repeated)).toBe(true);
  });

  it('restores support when recent independent answers show difficulty', () => {
    const progress = practiced();
    for (let index = 12; index < 24; index++) {
      progress.recentAttempts[String(index)] = {
        ...progress.recentAttempts['0'], id: String(index), correct: false,
        at: new Date(Date.UTC(2026, 9, 11, 12, index)).toISOString(),
      };
    }
    expect(needsBeginnerStorySupport(progress)).toBe(true);
  });
});
