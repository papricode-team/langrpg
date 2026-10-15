import { describe, expect, it } from 'vitest';
import { gameMode, type GameModeState } from './game-mode';

const playing: GameModeState = { started: true, accessBlocked: false, connected: true, travelling: false, accountOpen: false, cinematic: false,
  menuOpen: false, watching: false, filtersOpen: false, encounterOpen: false, dialogueOpen: false, deliveryHolding: false };

describe('game mode', () => {
  it('lets the player act only when nothing covers the world', () => {
    expect(gameMode(playing)).toBe('world');
    for (const [flag, mode] of [['accessBlocked', 'blocked'], ['travelling', 'travelling'], ['accountOpen', 'account'], ['cinematic', 'cinematic'],
      ['menuOpen', 'menu'], ['watching', 'watching'], ['filtersOpen', 'filters'], ['encounterOpen', 'encounter'], ['dialogueOpen', 'dialogue'],
      ['deliveryHolding', 'delivery']] as const) expect(gameMode({ ...playing, [flag]: true }), flag).toBe(mode);
    expect(gameMode({ ...playing, started: false })).toBe('booting');
    expect(gameMode({ ...playing, connected: false })).toBe('offline');
  });

  it('reports the most important overlay when several coincide', () => {
    expect(gameMode({ ...playing, accessBlocked: true, accountOpen: true, menuOpen: true })).toBe('blocked');
    expect(gameMode({ ...playing, accountOpen: true, encounterOpen: true })).toBe('account');
    expect(gameMode({ ...playing, cinematic: true, dialogueOpen: true })).toBe('cinematic');
    expect(gameMode({ ...playing, started: false, connected: false })).toBe('booting');
  });
});
