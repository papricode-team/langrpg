import { describe, expect, it } from 'vitest';
import { beginnerGateChoices, beginnerReplyMeaning } from './beginner-dialogue';
import { quests } from './content';
import { answerMatches } from './learning';
import { questGraphs } from './quest-graph';

describe('beginner dialogue replies', () => {
  const a1Graphs = questGraphs.filter(graph => graph.level === 'A1');

  it('covers every A1 story gate with two short, translated replies', () => {
    expect(a1Graphs).toHaveLength(6);
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
