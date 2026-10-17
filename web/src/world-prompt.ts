import { worldDepth } from './world-depth';
import { WORLD_UI } from './world-ui';

export const PROMPT_FONT_SIZE = 12;
export const PROMPT_FADE_SECONDS = .12;

/** CSS pixels throughout; the owning container takes density / camera zoom. */
export function interactionPromptLayout(textWidth: number, spriteWidth: number) {
  const tabWidth = Math.ceil(Math.max(0, textWidth)) + 8;
  const maxWidth = spriteWidth * 1.2;
  // A 14px bezel still has room for the 12px E's ~8px painted glyph.
  // This keeps the normal 72px desktop adult on one 24px-high row.
  const fittedKeySize = Math.max(14, Math.min(24, maxWidth - tabWidth - 2));
  // Small children / phones cannot fit a key and eight letters on one line.
  // Keep the font floor and use the space above the name instead of squeezing text.
  const stacked = fittedKeySize + 2 + tabWidth > maxWidth + .5;
  // Stacking frees the full 24px icon size, especially useful for speech on touch.
  const keySize = stacked ? 24 : fittedKeySize;
  const width = stacked ? Math.max(tabWidth, keySize) : keySize + 2 + tabWidth;
  const height = stacked ? keySize + 2 + 24 : 24;
  return {
    width, height, tabWidth, tabHeight: 24, keySize, stacked,
    keyX: stacked ? 0 : -width / 2 + keySize / 2,
    keyY: stacked ? -height / 2 + keySize / 2 : 0,
    tabX: stacked ? 0 : width / 2 - tabWidth / 2,
    tabY: stacked ? height / 2 - 12 : 0,
  };
}

/** A global label band, above even scenery whose feet are below this NPC. */
export const interactionPromptDepth = (worldHeight: number): number => worldDepth(worldHeight + 100, 'label');

/** Gamepad currently exposes an action index but no button-name/glyph binding. */
export function interactionPromptVariant(touch: boolean, keyboardKey = 'E') {
  return { texture: touch ? WORLD_UI.promptTouch : WORLD_UI.promptKeycap, key: touch ? '' : keyboardKey };
}

export function interactionPromptAlpha(alpha: number, focused: boolean, seconds: number, reduced: boolean): number {
  return reduced ? Number(focused) : Math.max(0, Math.min(1, alpha + Math.max(0, seconds) / PROMPT_FADE_SECONDS * (focused ? 1 : -1)));
}
