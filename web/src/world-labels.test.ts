import { describe, expect, it } from 'vitest';
import { storyLabelAlpha } from './world-labels';
import { shadowPoint, CAST_SHADOW_DEPTH } from './world-cast-shadow';
import { worldDepth } from './world-depth';

describe('town labels and shadow projection', () => {
  it('fades distant story labels while retaining readable names on screen', () => {
    expect(storyLabelAlpha(50,false)).toBe(1);
    expect(storyLabelAlpha(500,false)).toBeLessThan(1);
    expect(storyLabelAlpha(2000,false)).toBe(.45);
    expect(storyLabelAlpha(2000,true)).toBe(1);
  });
  it('pins the feet and casts heads down and right, below upright scenery', () => {
    expect(shadowPoint(0,0)).toEqual({x:0,y:-0});
    expect(shadowPoint(0,-100)).toEqual({x:62,y:34});
    expect(CAST_SHADOW_DEPTH).toBeGreaterThan(worldDepth(0));
    expect(CAST_SHADOW_DEPTH).toBeLessThan(worldDepth(1));
  });
});
