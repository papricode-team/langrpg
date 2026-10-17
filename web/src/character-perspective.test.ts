import { describe, expect, it } from 'vitest';
import { characterArtScale, perspectiveBodyHeight } from './character-art';

describe('painted room perspective', () => {
  const floor = { horizonY: 250, referenceY: 720 };
  it('keeps an upright adult proportional to the floor depth', () => {
    const foreground = perspectiveBodyHeight(440, 720, floor);
    const rear = perspectiveBodyHeight(440, 485, floor);
    expect(foreground).toBe(440);
    expect(rear).toBe(220);
    // Feet and head approach the same horizon as the person recedes.
    expect((485 - rear - 250) / (720 - foreground - 250)).toBe(.5);
    expect(characterArtScale(338, 384, true, rear) * 338).toBe(rear);
  });
  it('preserves the fixed scale of rooms without perspective calibration', () => {
    expect(perspectiveBodyHeight(132, 900)).toBe(132);
    expect(perspectiveBodyHeight(132, 300)).toBe(132);
    expect(perspectiveBodyHeight(132, 300, { horizonY: 250, referenceY: 250 })).toBe(132);
  });
});
