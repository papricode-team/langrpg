import { describe, expect, it } from 'vitest';
import { NpcRoutineWalk, npcTravelSeconds } from './npc-motion';

describe('autonomous NPC movement', () => {
  it.each([20, 60, 120])('finishes a one-second leg before responding to changing targets at %i fps', fps => {
    const walk = new NpcRoutineWalk(), position = { x: 0, y: 0 };
    const seconds = 1 / fps;
    for (let frame = 0; frame < fps; frame++) {
      const target = frame === 0 ? { x: 4, y: 0 } : { x: -20, y: frame % 2 ? 20 : -20 };
      const step = walk.step(position, target, seconds, () => true);
      expect(step.x).toBeGreaterThan(0);
      expect(step.y).toBe(0);
      position.x += step.x;
      expect(position.x).toBeCloseTo(4 * (frame + 1) / fps);
    }
    // Arrival pauses are deliberate; no immediate reversal at the endpoint.
    for (let frame = 0; frame < fps; frame++) {
      const step = walk.step(position, { x: -20, y: 0 }, seconds, () => true);
      expect(Math.hypot(step.x, step.y)).toBeLessThan(1e-10);
    }
    let resumed = 0;
    for (let frame = 0; frame < 3; frame++) {
      const step = walk.step(position, { x: -20, y: 0 }, seconds, () => true);
      position.x += step.x; resumed += step.x;
    }
    expect(resumed).toBeLessThan(0);
  });

  it('slows short route legs and preserves the speed limit on longer ones', () => {
    expect(npcTravelSeconds(4, 72)).toBe(1);
    expect(npcTravelSeconds(144, 72)).toBe(2);
  });

  it('waits for meaningful schedule travel and stops if committed ground becomes blocked', () => {
    const walk = new NpcRoutineWalk(), position = { x: 0, y: 0 };
    expect(walk.step(position, { x: .5, y: 0 }, .1, () => true)).toEqual({ x: 0, y: 0 });
    expect(walk.step(position, { x: 4, y: 0 }, .1, () => false)).toEqual({ x: 0, y: 0 });
    const step = walk.step(position, { x: 4, y: 0 }, .1, () => true);
    position.x += step.x;
    expect(position.x).toBeCloseTo(.4);
    expect(walk.step(position, { x: -4, y: 0 }, .1, () => false)).toEqual({ x: 0, y: 0 });
  });
});
