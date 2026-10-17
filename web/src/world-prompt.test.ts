import { describe, expect, it } from 'vitest';
import { interactionPromptAlpha, interactionPromptDepth, interactionPromptLayout, interactionPromptVariant, PROMPT_FONT_SIZE } from './world-prompt';
import { worldDepth } from './world-depth';
import { WORLD_UI } from './world-ui';

describe('painted interaction prompt', () => {
  it('fits measured text with clear side padding at the 12 CSS px floor', () => {
    const layout = interactionPromptLayout(49.3, 72);
    expect(PROMPT_FONT_SIZE).toBeGreaterThanOrEqual(12);
    expect(layout.stacked).toBe(false);
    expect(layout.height).toBe(24);
    expect(layout.tabWidth).toBe(58);
    expect(layout.width).toBeLessThanOrEqual(72 * 1.2);
    expect(layout.keyX + layout.keySize / 2 + 2).toBeCloseTo(layout.tabX - layout.tabWidth / 2);
    expect(layout.tabX + layout.tabWidth / 2).toBe(layout.width / 2);
  });

  it('keeps text readable on small sprites by moving the key above the tab', () => {
    const layout = interactionPromptLayout(49.3, 52);
    expect(layout.stacked).toBe(true);
    expect(layout.width).toBeLessThanOrEqual(52 * 1.2);
    expect(layout.tabWidth).toBeGreaterThan(49.3 + 7);
    expect(layout.keyY + layout.keySize / 2 + 2).toBe(layout.tabY - layout.tabHeight / 2);
    // Longer binding/localised labels expand their text canvas instead of clipping.
    expect(interactionPromptLayout(90, 72).tabWidth).toBe(98);
  });

  it('keeps a short desktop adult on one row without shrinking the 12px text', () => {
    const layout = interactionPromptLayout(54, 65);
    expect(layout.height).toBe(24);
    expect(layout.keySize).toBe(14);
    expect(layout.width).toBeLessThanOrEqual(65 * 1.2);
    expect(layout.tabWidth).toBe(62);
    const phone = interactionPromptLayout(54, 54);
    expect(phone.keySize).toBe(24);
    expect(phone.stacked).toBe(true);
  });

  it.each([[1, 1], [2, 1.4], [2, 3]])('retains CSS dimensions at density %s, zoom %s', (density, zoom) => {
    const scale = density / zoom;
    const layout = interactionPromptLayout(49.3, 72);
    expect(layout.height * scale * zoom / density).toBeCloseTo(24, 10);
  });

  it('puts the detached container above every character and upright prop', () => {
    for (const y of [0, 512, 1024]) {
      expect(interactionPromptDepth(1024)).toBeGreaterThan(worldDepth(y, 'character'));
      expect(interactionPromptDepth(1024)).toBeGreaterThan(worldDepth(y, 'prop'));
    }
    expect(interactionPromptDepth(1024)).toBe(worldDepth(1124, 'label'));
  });

  it('uses a blank keycap and live binding on keyboard, a speech icon without a letter on touch', () => {
    expect(interactionPromptVariant(false)).toEqual({ texture: WORLD_UI.promptKeycap, key: 'E' });
    expect(interactionPromptVariant(false, 'F').key).toBe('F');
    expect(interactionPromptVariant(true)).toEqual({ texture: WORLD_UI.promptTouch, key: '' });
  });

  it('fades both directions in 120 ms, reverses cleanly and snaps for reduced motion', () => {
    expect(interactionPromptAlpha(0, true, .06, false)).toBe(.5);
    expect(interactionPromptAlpha(.5, false, .03, false)).toBe(.25);
    expect(interactionPromptAlpha(0, true, .12, false)).toBe(1);
    expect(interactionPromptAlpha(1, false, .12, false)).toBe(0);
    expect(interactionPromptAlpha(.2, true, 0, true)).toBe(1);
    expect(interactionPromptAlpha(.8, false, 0, true)).toBe(0);
  });
});
