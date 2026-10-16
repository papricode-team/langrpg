import { describe, expect, it } from 'vitest';
import { deviceCeiling, QualityGovernor, type QualityTier } from './quality-governor';

/** Feeds `seconds` of frames at a steady `frameMs`, with an optional hitch every `hitchEvery` frames. */
function run(governor: QualityGovernor, clock: { now: number; start: number }, seconds: number, frameMs: number, hitchEvery = 0): QualityTier[] {
  const changes: QualityTier[] = [];
  for (let frame = 1; clock.now < clock.start + seconds * 1000; frame++) {
    const delta = hitchEvery && frame % hitchEvery === 0 ? 120 : frameMs;
    clock.now += delta;
    const tier = governor.sample(delta, clock.now);
    if (tier) changes.push(tier);
  }
  clock.start = clock.now;
  return changes;
}
const clock = () => ({ now: 0, start: 0 });

describe('QualityGovernor', () => {
  it('starts at Low and climbs one tier at a time while frames stay smooth', () => {
    const governor = new QualityGovernor(), time = clock();
    expect(governor.tier).toBe('low');
    expect(run(governor, time, 30, 16.7)).toEqual(['medium', 'high']);
  });

  it('drops a tier when play stutters and never climbs back above it', () => {
    const governor = new QualityGovernor(), time = clock();
    run(governor, time, 30, 16.7);
    expect(run(governor, time, 4, 40)).toEqual(['medium']);
    expect(run(governor, time, 60, 16.7)).toEqual([]);
    expect(governor.tier).toBe('medium');
  });

  it('counts repeated hitches as stutter even when the average is fine', () => {
    const governor = new QualityGovernor(), time = clock();
    run(governor, time, 15, 16.7);
    expect(governor.tier).toBe('medium');
    expect(run(governor, time, 5, 16.7, 20)).toEqual(['low']);
  });

  it('respects the device ceiling and ignores held time and background gaps', () => {
    const governor = new QualityGovernor('medium'), time = clock();
    expect(run(governor, time, 60, 16.7)).toEqual(['medium']);
    const held = new QualityGovernor(), heldTime = clock();
    held.hold(0, 60_000);
    expect(run(held, heldTime, 30, 60)).toEqual([]);
    expect(held.sample(5000, 70_000)).toBeUndefined();
  });

  it('derives a conservative ceiling from device hints', () => {
    expect(deviceCeiling({})).toBe('high');
    expect(deviceCeiling({ saveData: true })).toBe('low');
    expect(deviceCeiling({ effectiveType: 'slow-2g' })).toBe('low');
    expect(deviceCeiling({ deviceMemory: 4 })).toBe('medium');
    expect(deviceCeiling({ deviceMemory: 8, effectiveType: '4g' })).toBe('high');
  });
});
