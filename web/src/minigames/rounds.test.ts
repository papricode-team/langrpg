import { describe, expect, it } from 'vitest';
import { RoundQueue, optionCount, responseLimit } from './rounds';
import type { GameItem } from './types';

const item = (id: string, extra: Partial<GameItem> = {}): GameItem => ({ lexemeId: id, lemma: id, english: id, topic: 'food', level: 'A1', pos: 'noun', audio: '', exerciseIds: { recognition: '', listening: '', production: '' }, stability: 0, due: { recognition: false, listening: false, production: false }, seen: { recognition: false, listening: false, production: false }, recalls: { recognition: 0, listening: 0, production: 0 }, ...extra });

describe('mini-game spaced retries and scaffolds', () => {
  it('returns a missed item after two other cues and marks every repeated cue supported', () => {
    const [a, b, c] = ['a', 'b', 'c'].map(id => item(id)), queue = new RoundQueue([a, b, c], 5);
    expect(queue.next()).toEqual({ item: a, retry: false });
    queue.miss(a);
    expect(queue.next()).toEqual({ item: b, retry: false });
    expect(queue.next()).toEqual({ item: c, retry: false });
    expect(queue.next()).toEqual({ item: a, retry: true });
    expect(queue.next()).toEqual({ item: a, retry: true });
    expect(queue.next()).toEqual({ item: b, retry: true });
    expect(queue.remaining).toBe(0);
    expect(queue.next()).toBeUndefined();
  });

  it('retests at the end when fewer than two cues remain, without inventing an empty-pool round', () => {
    const a = item('a'), queue = new RoundQueue([a], 1);
    queue.next(); queue.miss(a);
    expect(queue.next()).toEqual({ item: a, retry: true });
    expect(new RoundQueue([], 30).next()).toBeUndefined();
  });

  it('adapts options and production timers without borrowing another modality’s stability', () => {
    const a = item('a', { stability: 30, stabilityByMode: { recognition: 30, listening: 2, production: 0 }, recalls: { recognition: 3, listening: 1, production: 0 } });
    expect(optionCount(a, 'recognition')).toBe(6);
    expect(optionCount(a, 'listening')).toBe(4);
    expect(optionCount(a, 'production')).toBe(2);
    expect(responseLimit(a, true)).toBe(18000);
    expect(responseLimit(a, false)).toBe(6000);
  });
});
