import { describe, expect, it, vi } from 'vitest';
import { emptyProgress, type Progress, type WordMemory, type WordEvidence } from '../api';
import type { CourseLexeme } from '../course';
import { distractors, gameItemPool } from './pool';

vi.mock('./item-manifest', () => ({ itemSpriteFor: (id: string) => id === 'picture' ? 'painted-picture' : undefined }));

const word = (id: string, extra: Partial<CourseLexeme> = {}): CourseLexeme => ({ id, lemma: id, english: id, level: 'A1', pos: 'noun', article: 'der', topic: 'food', sourceId: 'test', sourceUrl: 'test', ...extra });
const progress = (ids: string[]): Progress => ({ ...emptyProgress(), intake: { version: 1, activeSeconds: 0, creditSeconds: 0, lastBeatAt: '', wordIds: ids } });
const evidence = (stabilityDays: number, dueAt: string, attempts = 2): WordEvidence => ({ attempts, correct: attempts, unaidedSuccesses: attempts, stabilityDays, dueAt, status: 'learning' });
const memory = (id: string, modes: Partial<WordMemory['evidence']>, stabilityDays = 0): WordMemory => ({ wordId: id, exposures: 1, contextExposures: 0, directAttempts: 1, stabilityDays, difficulty: 5, repetitions: 1, lapses: 0, lastSeenAt: '', dueAt: '', modeStats: {}, mastery: 'learning', evidence: modes as WordMemory['evidence'] });

describe('restored mini-game vocabulary pools', () => {
  it('uses intake permission rather than exposure and applies topic, level, fixed-pool and art filters', () => {
    const words = [word('picture'), word('unpainted'), word('verb', { pos: 'verb' }), word('late', { level: 'B1' }), word('travel', { topic: 'travel' }), word('unrestored')];
    const saved = progress(['picture', 'unpainted', 'verb', 'late', 'travel']);
    saved.words.unrestored = memory('unrestored', { recognition: evidence(20, '2020-01-01') });
    expect(gameItemPool(words, saved, { modality: 'recognition', level: 'A2', topics: ['food'], nouns: true }).map(item => item.lexemeId).sort()).toEqual(['picture', 'unpainted']);
    expect(gameItemPool(words, saved, { modality: 'listening', sprites: true }).map(item => item.lexemeId)).toEqual(['picture']);
    expect(gameItemPool(words, saved, { modality: 'production', fixedPool: ['late', 'unrestored'] }).map(item => item.lexemeId)).toEqual(['late']);
    expect(gameItemPool(words, emptyProgress(), { modality: 'recognition' })).toEqual([]);
  });

  it('ranks due cards before unseen modality cards, then increasing modality-specific stability', () => {
    const ids = ['stable', 'due', 'unseen', 'fresh'], saved = progress(ids);
    saved.words.stable = memory('stable', { listening: evidence(30, '2030-01-01') });
    saved.words.due = memory('due', { listening: evidence(10, '2020-01-01') });
    saved.words.fresh = memory('fresh', { listening: evidence(1, '2030-01-01') });
    saved.words.unseen = memory('unseen', { recognition: evidence(80, '2020-01-01') }, 80);
    const items = gameItemPool(ids.map(id => word(id)), saved, { modality: 'listening', seed: 12 }, Date.parse('2026-10-12'));
    expect(items.map(item => item.lexemeId)).toEqual(['due', 'unseen', 'fresh', 'stable']);
    expect(items[1].stability).toBe(0);
    expect(items[1].due.recognition).toBe(true);
    expect(items[1].due.listening).toBe(false);
    expect(items[1].seen.listening).toBe(false);
    expect(items[1].recalls.listening).toBe(0);
  });

  it('retains legacy mode evidence while zero and invalid due dates never jump the queue', () => {
    const saved = progress(['legacy', 'zero', 'invalid']);
    saved.words.legacy = memory('legacy', {}, 70);
    saved.words.legacy.modeStats.production = { attempts: 3, correct: 2, unaidedSuccesses: 1 };
    saved.words.zero = memory('zero', { production: evidence(0, '0001-01-01T00:00:00Z') });
    saved.words.invalid = memory('invalid', { production: evidence(0, 'not-a-date') });
    const items = gameItemPool(['legacy', 'zero', 'invalid'].map(id => word(id)), saved, { modality: 'production' });
    expect(items.every(item => !item.due.production)).toBe(true);
    const legacy = items.find(item => item.lexemeId === 'legacy')!;
    expect(legacy.seen.production).toBe(true);
    expect(legacy.recalls.production).toBe(1);
    expect(legacy.stability).toBe(0);
  });

  it('uses reproducible seeds and favors same-topic then same-article distractors without leaking the solution position', () => {
    const words = [word('target'), word('peer'), word('gender', { topic: 'home' }), word('other', { topic: 'home', article: 'die' }), word('homograph', { lemma: 'target' })];
    const items = gameItemPool(words, progress(words.map(word => word.id)), { modality: 'recognition', seed: 3 });
    const target = items.find(item => item.lexemeId === 'target')!;
    const choices = distractors(target, items, 3, 3);
    expect(choices).toEqual(distractors(target, items, 3, 3));
    expect(choices.map(item => item.lexemeId).sort()).toEqual(['gender', 'peer', 'target']);
    const positions = new Set(Array.from({ length: 12 }, (_, seed) => distractors(target, items, seed, 3).findIndex(item => item.lexemeId === 'target')));
    expect(positions.size).toBeGreaterThan(1);
    expect(gameItemPool(words, progress(words.map(word => word.id)), { modality: 'recognition', limit: 0 })).toEqual([]);
  });
});
