import { describe, expect, it } from 'vitest';
import { Pace, paceSettings, startingPace } from './adaptive';
import type { GameItem } from './types';

const item = (recalls: number, stability: number): GameItem => ({ lexemeId: `w${recalls}-${stability}`, lemma: 'w', english: 'w', topic: 'food', level: 'A1', pos: 'noun', audio: '', exerciseIds: { recognition: '', listening: '', production: '' }, stability, stabilityByMode: { recognition: stability, listening: 0, production: 0 }, due: { recognition: false, listening: false, production: false }, seen: { recognition: recalls > 0, listening: false, production: false }, recalls: { recognition: recalls, listening: 0, production: 0 } });

describe('adaptive word-game pace', () => {
  it('starts new words at Steady and well-known words faster', () => {
    expect(startingPace([item(0, 0), item(0, 0)], 'recognition', 'A1')).toBe(1);
    expect(startingPace([item(4, 30), item(5, 40)], 'recognition', 'A1')).toBe(3);
    expect(startingPace([item(2, 10), item(3, 12)], 'recognition', 'A1')).toBe(2);
    expect(startingPace([item(0, 0)], 'recognition', 'A2')).toBe(2);
  });

  it('blends in where the last run ended', () => {
    expect(startingPace([item(0, 0)], 'recognition', 'A1', 3)).toBe(2);
    expect(startingPace([item(4, 30)], 'recognition', 'A1', 1)).toBe(2);
  });

  it('speeds up after quick correct answers and slows after misses', () => {
    const pace = new Pace(1);
    expect(pace.record(true, .2)).toBe(0);
    expect(pace.record(true, .2)).toBe(1);
    expect(pace.tier).toBe(2);
    expect(pace.record(false)).toBe(-1);
    expect(pace.tier).toBe(1);
  });

  it('needs more slow answers than quick ones to move up, and stays within the tiers', () => {
    const slow = new Pace(1);
    for (let index = 0; index < 5; index++) expect(slow.record(true, .9)).toBe(0);
    expect(slow.record(true, .9)).toBe(1);
    const floor = new Pace(0);
    expect(floor.record(false)).toBe(0); expect(floor.tier).toBe(0);
    const ceiling = new Pace(3);
    for (let index = 0; index < 4; index++) ceiling.record(true, 0);
    expect(ceiling.tier).toBe(3);
    // Banked points at the ceiling must not shield a struggling player from slowing down.
    expect(ceiling.record(false)).toBe(0);
    expect(ceiling.record(false)).toBe(-1);
  });

  it('makes every knob harder as the tier rises', () => {
    const [gentle, swift] = [paceSettings(0, 'A1'), paceSettings(3, 'A1')];
    expect(swift.options).toBeGreaterThan(gentle.options);
    expect(swift.time).toBeLessThan(gentle.time);
    expect(swift.lives).toBeLessThan(gentle.lives);
    expect(swift.glimpseMs).toBeLessThan(gentle.glimpseMs);
    expect(swift.loomSize * swift.loomWords).toBeGreaterThan(gentle.loomSize * gentle.loomWords);
    expect(paceSettings(1, 'B1').diagonal).toBe(true);
  });
});
