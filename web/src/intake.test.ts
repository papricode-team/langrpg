import { describe, expect, it } from 'vitest';
import { emptyProgress, type Progress, type WordMemory } from './api';
import { IntakeClock, intakeStatus, missingWordCount, questVocabulary, secondsPerWord, syllabus, syllabusPosition, todaysWords, wordScheduled } from './intake';
import { courseLexicon, courseUnits, lexemeById } from './course';
import { quests } from './content';
import { questGraphs } from './quest-graph';
import serverSyllabus from '../../server/syllabus.json';

const words = (ids: readonly string[], creditSeconds = ids.length * secondsPerWord()): Progress => ({ ...emptyProgress(), intake: { version: 1, activeSeconds: 0, creditSeconds, lastBeatAt: '', wordIds: [...ids] } });
const settled = (progress: Progress, ...ids: string[]): Progress => {
  const memory: Record<string, WordMemory> = { ...progress.words };
  for (const id of ids) memory[id] = { wordId: id, exposures: 1, contextExposures: 0, directAttempts: 1, lastSeenAt: '', dueAt: '2099-01-01T00:00:00Z', mastery: 'learning', stabilityDays: 1, difficulty: 5, repetitions: 1, lapses: 0, modeStats: { recognition: { attempts: 1, correct: 1, unaidedSuccesses: 1 } }, evidence: {} as WordMemory['evidence'] };
  return { ...progress, words: memory };
};

describe('the vocabulary syllabus', () => {
  it('schedules every course lexeme exactly once and ships the same order to the server', () => {
    expect(syllabus.wordIds).toHaveLength(courseLexicon.length);
    expect(new Set(syllabus.wordIds).size).toBe(syllabus.wordIds.length);
    for (const id of syllabus.wordIds) expect(lexemeById.has(id), id).toBe(true);
    expect(serverSyllabus.wordIds).toEqual(syllabus.wordIds);
    expect(serverSyllabus.version).toBe(syllabus.version);
    expect(syllabus.wordsPerHour).toBe(10);
    expect(secondsPerWord()).toBe(360);
  });

  it('records vocabulary coverage milestones in clue order for every story conversation', () => {
    let previous = 0;
    for (const quest of quests) {
      const gate = questVocabulary(quest.id);
      expect(gate, quest.id).toBeDefined();
      expect(gate!.wordIds.length).toBeGreaterThan(0);
      const milestone = Math.max(...gate!.wordIds.map(id => syllabusPosition.get(id)! + 1));
      expect(milestone).toBe(gate!.milestone);
      expect(milestone).toBeGreaterThanOrEqual(previous);
      previous = milestone;
    }
    // Story-first ordering: most of every block serves the earliest scene's vocabulary; the rest are core words.
    const openingWords = syllabus.quests.filter(quest => quest.level === 'A0').flatMap(quest => quest.wordIds);
    expect(syllabus.wordIds.slice(0, syllabus.wordsPerHour).filter(id => openingWords.includes(id)).length).toBeGreaterThanOrEqual(syllabus.storyShare);
  });

  it('keeps the story graphs inside their declared vocabulary (names and glossed story words aside)', () => {
    // Every vocabulary entry must match the graphs that ship.
    for (const graph of questGraphs) expect(questVocabulary(graph.questId)!.level).toBe(graph.level);
  });
});

describe('intake status', () => {
  it('starts an adventure with the opening allowance and then earns one word every six minutes', () => {
    const fresh = words([], syllabus.openingWords * secondsPerWord());
    expect(intakeStatus(fresh).pending).toBe(syllabus.openingWords);
    const opened = words(syllabus.wordIds.slice(0, 10), 3600);
    const status = intakeStatus(opened);
    expect(status).toMatchObject({ introduced: 10, pending: 0, nextWordInSeconds: 360, paused: '', unsettled: 10 });
    expect(intakeStatus(words(syllabus.wordIds.slice(0, 10), 3600 + 359)).nextWordInSeconds).toBe(1);
    expect(intakeStatus(words(syllabus.wordIds.slice(0, 10), 3600 + 360)).pending).toBe(1);
  });

  it('pauses intake while twelve restored words are still unrecognised, and again under review pressure', () => {
    const twelve = words(syllabus.wordIds.slice(0, 12), 12 * 360 + 3600);
    expect(intakeStatus(twelve)).toMatchObject({ paused: 'practise', pending: 0, nextWordInSeconds: 0, unsettled: 12 });
    const practised = settled(twelve, ...syllabus.wordIds.slice(0, 12));
    expect(intakeStatus(practised)).toMatchObject({ paused: '', pending: 10, unsettled: 0 });
    const overdue: Progress = { ...practised, words: Object.fromEntries(Object.entries(practised.words).map(([id, word]) => [id, { ...word, dueAt: '2020-01-01T00:00:00Z' }])) };
    const twenty = words(syllabus.wordIds.slice(0, 20), 30 * 360);
    const due = { ...twenty, words: Object.fromEntries(syllabus.wordIds.slice(0, 20).map(id => [id, { ...overdue.words[syllabus.wordIds[0]], wordId: id }])) };
    expect(intakeStatus(due)).toMatchObject({ paused: 'review', due: 20, pending: 0 });
  });

  it('lists today\'s words oldest first and stops counting them once recognised', () => {
    const progress = words(syllabus.wordIds.slice(0, 15));
    expect(todaysWords(progress)).toEqual(syllabus.wordIds.slice(0, 12));
    expect(todaysWords(settled(progress, syllabus.wordIds[0], syllabus.wordIds[3]))).toEqual(syllabus.wordIds.slice(0, 15).filter((_, index) => index !== 0 && index !== 3).slice(0, 12));
  });
});

describe('what the restored vocabulary opens for optional practice', () => {
  it('counts the scheduled words a learning route still needs, ignoring story-only words', () => {
    const unit = courseUnits.find(item => item.id === 'course-a1-food-1')!;
    expect(missingWordCount(unit.wordIds, words([]))).toBe(unit.wordIds.length);
    expect(missingWordCount(unit.wordIds, words(unit.wordIds))).toBe(0);
    expect(missingWordCount(['not-a-lexeme', unit.wordIds[0]], words([]))).toBe(1);
    expect(wordScheduled('not-a-lexeme')).toBe(false);
  });
});

describe('the intake clock', () => {
  it('counts only active visible time, beats once a minute and never sends more than two minutes', () => {
    const clock = new IntakeClock();
    expect(clock.tick(0, true)).toBe(false);
    for (let second = 1; second <= 59; second++) expect(clock.tick(second * 1000, true)).toBe(false);
    expect(clock.tick(60_000, true)).toBe(true);
    expect(clock.consume()).toBe(60);
    expect(clock.pendingSeconds).toBe(0);
    clock.tick(60_000, false);
    clock.tick(600_000, false);
    expect(clock.pendingSeconds).toBe(0);
    clock.tick(600_000, true);
    clock.tick(900_000, true);
    // A long gap between ticks credits at most two seconds, like the account reminder.
    expect(clock.pendingSeconds).toBe(2);
    for (let i = 0; i < 400; i++) clock.tick(900_000 + i * 1000, true);
    expect(clock.consume()).toBe(120);
  });
});
