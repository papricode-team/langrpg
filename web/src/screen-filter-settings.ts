export type ScreenFilterPreset = 'original' | 'soft' | 'crt' | 'pixel';
export const DEFAULT_SCREEN_FILTER_PRESET: ScreenFilterPreset = 'original';

export interface ScreenFilterSettings {
  preset: ScreenFilterPreset;
  softness: number;
  scanlines: number;
  grain: number;
  warmth: number;
  vignette: number;
  pixelSize: number;
}

export const SCREEN_FILTER_PRESETS: { id: ScreenFilterPreset; name: string; description: string; settings: ScreenFilterSettings }[] = [
  { id: 'original', name: 'Original', description: 'The painted world without a screen filter.', settings: { preset: 'original', softness: 0, scanlines: 0, grain: 0, warmth: 0, vignette: 0, pixelSize: 1 } },
  { id: 'soft', name: 'Soft paint', description: 'A subtle paper texture and warm finish.', settings: { preset: 'soft', softness: 8, scanlines: 0, grain: 4, warmth: 6, vignette: 0, pixelSize: 1 } },
  { id: 'crt', name: 'CRT', description: 'A soft, warm screen with subtle scanlines.', settings: { preset: 'crt', softness: 38, scanlines: 28, grain: 10, warmth: 18, vignette: 8, pixelSize: 1 } },
  { id: 'pixel', name: 'Pixel CRT', description: 'A shared pixel grid and stronger scanlines for a retro look.', settings: { preset: 'pixel', softness: 24, scanlines: 42, grain: 8, warmth: 14, vignette: 12, pixelSize: 2.5 } },
];

/** Storage is untrusted: restore only known presets and finite, bounded values. */
export function normalizeScreenFilterSettings(value: unknown): ScreenFilterSettings {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const preset = SCREEN_FILTER_PRESETS.find(item => item.id === input.preset)
    ?? SCREEN_FILTER_PRESETS.find(item => item.id === DEFAULT_SCREEN_FILTER_PRESET)!;
  const result = { ...preset.settings };
  for (const key of ['softness', 'scanlines', 'grain', 'warmth', 'vignette', 'pixelSize'] as const) {
    const number = input[key];
    if (typeof number === 'number' && Number.isFinite(number)) {
      result[key] = Math.min(key === 'pixelSize' ? 4 : 100, Math.max(key === 'pixelSize' ? 1 : 0, number));
    }
  }
  return result;
}

export function screenFilterActive(settings: ScreenFilterSettings): boolean {
  return settings.softness > 0 || settings.scanlines > 0 || settings.grain > 0
    || settings.warmth > 0 || settings.vignette > 0 || settings.pixelSize > 1;
}
