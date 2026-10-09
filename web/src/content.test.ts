import { describe, expect, it } from 'vitest';
import { chapters, npcs, quests, vocabulary } from './content';
import { answerMatches, modeFor } from './learning';
import manifest from '../../server/curriculum.json';

const questIds = [
  'a1-arrival', 'a1-cafe', 'a1-market', 'a1-station', 'a1-workshop', 'a1-lost-parcel',
  'a2-apartment', 'a2-evening-plans', 'a2-rail-trip', 'a2-broken-clock', 'a2-clinic', 'a2-archive',
  'b1-witness', 'b1-new-route', 'b1-work', 'b1-council', 'b1-storm', 'b1-atlas',
];
const exercises = quests.flatMap(quest => quest.exercises);

describe('canonical language content', () => {
  it('preserves the saved quest identities and complete chapter structure', () => {
    expect(quests.map(quest => quest.id)).toEqual(questIds);
    expect(chapters.map(chapter => chapter.level)).toEqual(['A1', 'A2', 'B1']);
    for (const chapter of chapters) {
      expect(quests.filter(quest => quest.level === chapter.level)).toHaveLength(6);
    }
    for (const quest of quests) {
      expect(quest.exercises).toHaveLength(7);
      expect(npcs.some(npc => npc.id === quest.npcId)).toBe(true);
      expect(quest.story.map(sentence => sentence.german).join(' ').trim().length).toBeGreaterThan(50);
    }
  });

  it('provides an English translation for every German narrative sentence', () => {
    for (const quest of quests) {
      expect(quest.story.length).toBeGreaterThanOrEqual(5);
      for (const sentence of quest.story) {
        expect(sentence.german.trim()).toBe(sentence.german);
        expect(sentence.english.trim()).toBe(sentence.english);
        expect(sentence.german).toMatch(/[.!?][“”„"]?$/u);
        expect(sentence.english).toMatch(/[.!?][“”„"]?$/u);
        expect(sentence.german).not.toBe(sentence.english);
      }
    }
    const arrival = quests.find(quest => quest.id === 'a1-arrival')!.story;
    expect(arrival.some(sentence => sentence.german.includes('vierzig Tauben') && sentence.english.includes('Forty pigeons'))).toBe(true);
    expect(arrival.some(sentence => sentence.german.includes('siebte Glocke') && sentence.english.includes('seventh bell'))).toBe(true);
    expect(arrival.some(sentence => sentence.german.includes('ohne Deutschkenntnisse') && sentence.english.includes('no German'))).toBe(true);
    const conclusion = quests.find(quest => quest.id === 'b1-atlas')!.story;
    expect(conclusion.some(sentence => sentence.german.includes('ohne Schaden') && sentence.english.includes('harmlessly'))).toBe(true);
  });

  it('pairs every greeting sentence with a translation without changing the spoken greeting', () => {
    for (const npc of npcs) {
      expect(npc.greetingSentences).toBeDefined();
      expect(npc.greetingSentences!.map(sentence => sentence.german).join(' ')).toBe(npc.greeting);
      for (const sentence of npc.greetingSentences!) {
        expect(sentence.english.trim().length).toBeGreaterThan(0);
        expect(sentence.german).not.toBe(sentence.english);
      }
    }
  });

  it('has one stable unique exercise and contextual target per encounter', () => {
    expect(exercises).toHaveLength(126);
    expect(new Set(exercises.map(exercise => exercise.id)).size).toBe(126);
    expect(new Set(exercises.map(exercise => exercise.itemId)).size).toBe(126);
    expect(vocabulary.map(item => item.id)).toEqual(exercises.map(exercise => exercise.itemId));
    for (const quest of quests) {
      quest.exercises.forEach((exercise, index) => {
        expect(exercise.id).toBe(`${quest.id}-exercise-${index + 1}`);
        expect(exercise.itemId).toBe(`${quest.id}-item-${index + 1}`);
        for (const text of [exercise.prompt, exercise.german, exercise.english, exercise.hint, exercise.explanation]) {
          expect(text.trim().length).toBeGreaterThan(0);
        }
      });
    }
  });

  it('keeps every offered answer and sentence tile assembly solvable', () => {
    for (const exercise of exercises) {
      expect(answerMatches(exercise, exercise.answer)).toBe(true);
      for (const accepted of exercise.acceptedAnswers ?? []) {
        expect(answerMatches(exercise, accepted)).toBe(true);
      }
      if (exercise.mode === 'choice' || exercise.mode === 'listen') {
        expect(exercise.options).toContain(exercise.answer);
        expect(exercise.options!.length).toBeGreaterThanOrEqual(3);
        expect(new Set(exercise.options).size).toBe(exercise.options!.length);
      }
      if (exercise.mode === 'sentence') {
        expect(exercise.tokens!.join(' ')).toBe(exercise.answer);
      }
    }
  });

  it('matches authoritative server grading and quest completion requirements', () => {
    expect(manifest.quests).toHaveLength(quests.length);
    expect(manifest.items).toHaveLength(vocabulary.length);
    expect(manifest.exercises).toHaveLength(exercises.length);
    expect(new Set(manifest.exercises.map(exercise => exercise.id)).size).toBe(exercises.length);
    for (const quest of quests) {
      expect(manifest.quests.find(serverQuest => serverQuest.id === quest.id)).toEqual({
        id: quest.id,
        reward: quest.reward,
        requiredItemIds: quest.exercises.map(exercise => exercise.itemId),
      });
      for (const exercise of quest.exercises) {
        const serverExercise = manifest.exercises.find(value => value.id === exercise.id);
        expect(serverExercise).toBeDefined();
        expect(serverExercise!.itemId).toBe(exercise.itemId);
        expect(serverExercise!.mode).toBe(modeFor(exercise));
        expect(serverExercise!.answer).toBe(exercise.answer);
        expect(serverExercise!.acceptedAnswers ?? []).toEqual(exercise.acceptedAnswers ?? []);
        expect(manifest.items.find(item => item.id === exercise.itemId)?.level).toBe(quest.level);
      }
    }
  });

  it('preserves portrait atlas order and usable normalized map positions', () => {
    expect(npcs.map(npc => npc.id)).toEqual(['marta', 'otto', 'lina', 'emil', 'ada', 'fritz', 'greta']);
    for (const npc of npcs) {
      expect(npc.x).toBeGreaterThan(0);
      expect(npc.x).toBeLessThan(1);
      expect(npc.y).toBeGreaterThan(0);
      expect(npc.y).toBeLessThan(1);
    }
  });
});
