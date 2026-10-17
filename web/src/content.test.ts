import { describe, expect, it } from 'vitest';
import { chapters, npcs, quests, vocabulary } from './content';
import { answerMatches, modeFor } from './learning';
import manifest from '../../server/curriculum.json';

// Act I is one path of 22 scenes; Act II has ten and Act III nine.
const questIds = [
  'a0-ticket', 'a0-name', 'a0-wagen', 'a0-tee', 'a0-wo', 'a0-langsam', 'a0-morgen',
  'a1-arrival', 'a1-cafe', 'a1-timetable', 'a1-notice', 'a1-shopping', 'a1-room', 'a1-market', 'a1-chalk',
  'a1-neighbour', 'a1-pharmacy', 'a1-directions', 'a1-bench', 'a1-station', 'a1-phone', 'a1-weather', 'a1-workshop',
  'a1-office-window', 'a1-bike', 'a1-lost-found', 'a1-invitation', 'a1-lost-parcel', 'a1-departure',
  'a2-apartment', 'a2-upstairs', 'a2-evening-plans', 'a2-ink-seller', 'a2-rail-trip', 'a2-forest-rails',
  'a2-broken-clock', 'a2-clinic', 'a2-cellar', 'a2-archive',
  'b1-witness', 'b1-record-room', 'b1-new-route', 'b1-signalman', 'b1-work', 'b1-council',
  'b1-temptation', 'b1-storm', 'b1-atlas',
];
const exercises = quests.flatMap(quest => quest.exercises);

describe('canonical language content', () => {
  it('preserves the saved quest identities and complete chapter structure', () => {
    expect(quests.map(quest => quest.id)).toEqual(questIds);
    expect(chapters.map(chapter => chapter.level)).toEqual(['A0', 'A1', 'A2', 'B1']);
    const scenesPerAct = { A0: 7, A1: 22, A2: 10, B1: 9 };
    for (const chapter of chapters) {
      expect(quests.filter(quest => quest.level === chapter.level)).toHaveLength(scenesPerAct[chapter.level]);
    }
    for (const quest of quests) {
      expect(quest.exercises).toHaveLength(7);
      expect(npcs.some(npc => npc.id === quest.npcId)).toBe(true);
      if (quest.level !== 'A0' && quest.id !== 'a1-arrival') expect(quest.story.map(sentence => sentence.german).join(' ').trim().length).toBeGreaterThan(50);
    }
  });

  it('provides an English translation for every German narrative sentence', () => {
    for (const quest of quests) {
      expect(quest.story.length).toBeGreaterThanOrEqual(2);
      for (const sentence of quest.story) {
        expect(sentence.german.trim()).toBe(sentence.german);
        expect(sentence.english.trim()).toBe(sentence.english);
        expect(sentence.german).toMatch(/[.!?][“”„"]?$/u);
        expect(sentence.english).toMatch(/[.!?][“”„"]?$/u);
        expect(sentence.german).not.toBe(sentence.english);
      }
    }
    const arrival = quests.find(quest => quest.id === 'a1-arrival')!.story;
    expect(arrival.some(sentence => sentence.german.includes('Bahnsteig sieben') && sentence.english.toLowerCase().includes('platform seven'))).toBe(true);
    expect(arrival.map(sentence => sentence.german).join(' ')).not.toMatch(/Elise|siebte Glocke/);
    const conclusion = quests.find(quest => quest.id === 'b1-atlas')!.story;
    expect(conclusion.some(sentence => sentence.german.includes('Schlüssel') && sentence.english.includes('key'))).toBe(true);
    expect(conclusion.map(sentence => sentence.german).join(' ')).not.toContain('Küste');
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
    expect(exercises).toHaveLength(questIds.length * 7);
    expect(new Set(exercises.map(exercise => exercise.id)).size).toBe(exercises.length);
    expect(new Set(exercises.map(exercise => exercise.itemId)).size).toBe(exercises.length);
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
        // Authored literal answers come first; an answerPattern adds its expansions after them
        // (scripts/legacy-server-sync.test.mjs checks the exact expansion).
        const accepted = serverExercise!.acceptedAnswers ?? [];
        expect(accepted.slice(0, exercise.acceptedAnswers?.length ?? 0)).toEqual(exercise.acceptedAnswers ?? []);
        if (!exercise.answerPattern) expect(accepted).toEqual(exercise.acceptedAnswers ?? []);
        expect(manifest.items.find(item => item.id === exercise.itemId)?.level).toBe(quest.level);
      }
    }
  });

  it('preserves portrait atlas order and usable normalized map positions', () => {
    expect(npcs.slice(0, 7).map(npc => npc.id)).toEqual(['marta', 'otto', 'lina', 'emil', 'ada', 'fritz', 'greta']);
    for (const npc of npcs) {
      expect(npc.x).toBeGreaterThan(0);
      expect(npc.x).toBeLessThan(1);
      expect(npc.y).toBeGreaterThan(0);
      expect(npc.y).toBeLessThan(1);
    }
  });
});
