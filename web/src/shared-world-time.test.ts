import {describe, expect, it, vi} from 'vitest';
import {parseSharedWorldTime, type SharedWorldTime} from './shared-world-time';
import {WorldClock} from './world-clock';
import {maps} from './maps';
import {createWorldResidents, sampleResidentMotion, sampleResidentSchedule} from './world-life';

const seed = '0123456789abcdef0123456789abcdef';
function snapshot(elapsedSeconds: number): SharedWorldTime {
  const epoch = '2026-10-11T00:00:00.000Z';
  return {epoch, seed, elapsedSeconds, dayLengthSeconds: 720, day: 1 + Math.floor(elapsedSeconds / 720),
    hour: (7 + elapsedSeconds * 24 / 720) % 24, serverTime: new Date(Date.parse(epoch) + elapsedSeconds * 1000).toISOString()};
}

describe('shared simulation clock', () => {
  it('reconstructs the same residents for clients arriving at different times', () => {
    let firstNow = 0, secondNow = 9000;
    const first = new WorldClock({mode: 'cycle', hour: 12}, () => firstNow);
    const second = new WorldClock({mode: 'cycle', hour: 3}, () => secondNow);
    first.setSharedTime(snapshot(100));
    firstNow = 70_000;
    second.setSharedTime(snapshot(170));
    const resident = createWorldResidents('lindenhafen')[0];
    const state = (clock: WorldClock) => {
      const time = clock.simulationTime()!;
      const routine = sampleResidentSchedule(resident, time);
      return {routine, motion: sampleResidentMotion(resident, routine.sampleSeconds), hour: clock.advance(0).hour};
    };
    expect(state(first)).toEqual(state(second));
    firstNow += 34_560_000; secondNow += 34_560_000;
    expect(state(first)).toEqual(state(second));
  });

  it('blends jitter without reversing and ignores reordered snapshots', () => {
    let now = 0;
    const clock = new WorldClock({mode: 'cycle', hour: 12}, () => now);
    clock.setSharedTime(snapshot(100));
    now = 1000;
    clock.setSharedTime(snapshot(100.8));
    expect(clock.simulationTime()!.elapsedSeconds).toBe(101);
    now = 2000;
    expect(clock.simulationTime()!.elapsedSeconds).toBeCloseTo(101.9);
    clock.setSharedTime(snapshot(100.5));
    expect(clock.simulationTime()!.elapsedSeconds).toBeCloseTo(101.9);
    now = 3000;
    expect(clock.simulationTime()!.elapsedSeconds).toBeCloseTo(102.8);
    clock.setSharedTime(snapshot(900));
    expect(clock.simulationTime()!.elapsedSeconds).toBe(900);
  });

  it('keeps simulation independent of wall-clock changes and visual previews', () => {
    let now = 0;
    const clock = new WorldClock({mode: 'cycle', hour: 12}, () => now);
    clock.setSharedTime(snapshot(360));
    clock.configure({mode: 'manual', hour: 9});
    const wall = vi.spyOn(Date, 'now').mockReturnValue(0);
    try {
      now = 30_000;
      expect(clock.advance(999).hour).toBe(9);
      expect(clock.gameplayHour()).toBe(20);
      expect(clock.simulationTime()!.elapsedSeconds).toBe(390);
      clock.configure({mode: 'local', hour: 12});
      expect(clock.advance(0, new Date(2026, 1, 1, 3)).hour).toBe(3);
      expect(clock.gameplayHour()).toBe(20);
      clock.configure({mode: 'cycle', hour: 12});
      expect(clock.advance(0).hour).toBe(20);
    } finally { wall.mockRestore(); }
  });

  it('validates the whole epoch contract and never downgrades a synchronized world', () => {
    for (const bad of [
      {seed: 'bad'}, {epoch: undefined}, {serverTime: 'yesterday'}, {elapsedSeconds: -1},
      {dayLengthSeconds: 1}, {hour: 9}, {day: 99}, {elapsedSeconds: 200},
    ]) expect(parseSharedWorldTime({...snapshot(100), ...bad})).toBeUndefined();
    const clock = new WorldClock({mode: 'cycle', hour: 12}, () => 0);
    clock.setSharedTime(snapshot(100));
    clock.setSharedTime({hour: 20});
    expect(clock.gameplayHour()).toBeCloseTo(10 + 1 / 3);
    clock.setSharedTime({...snapshot(0), seed: 'fedcba9876543210fedcba9876543210'});
    expect(clock.simulationTime()!.elapsedSeconds).toBe(0);
  });
});

describe('resident schedule reconstruction', () => {
  it.each(maps)('walks continuous loops and returns home before resting for a complete day in $id', map => {
    for (const resident of createWorldResidents(map.id)) {
      const maxStep = Math.max(...resident.segments.map(segment => Math.hypot(segment.velocityX, segment.velocityY))) / 2 + .01;
      let previous: ReturnType<typeof sampleResidentMotion> | undefined;
      for (let tick = 0; tick <= 1440; tick++) {
        const time = {elapsedSeconds: tick / 2, seed, dayLengthSeconds: 720};
        const schedule = sampleResidentSchedule(resident, time);
        const position = sampleResidentMotion(resident, schedule.sampleSeconds);
        if (previous) expect(Math.hypot(position.x - previous.x, position.y - previous.y)).toBeLessThan(maxStep);
        if (schedule.homeReached) {
          expect(position.x).toBeCloseTo(resident.segments[0].from.x, 5);
          expect(position.y).toBeCloseTo(resident.segments[0].from.y, 5);
        }
        previous = position;
      }
    }
  });

  it('retains identity and state regardless of visit order and frame rate', () => {
    const residents = createWorldResidents('lindenhafen');
    const time = {elapsedSeconds: 3333.75, seed, dayLengthSeconds: 720};
    const sample = (resident: typeof residents[number]) => sampleResidentSchedule(resident, time);
    const baseline = residents.map(sample);
    for (let step = 0; step < 240; step++) residents.forEach(resident => sampleResidentSchedule(resident, {...time, elapsedSeconds: step / 30}));
    expect([...residents].reverse().map(sample).reverse()).toEqual(baseline);
    expect(residents.map(resident => sampleResidentSchedule(resident, {...time, seed: seed.split('').reverse().join('')}))).not.toEqual(baseline);
  });
});
