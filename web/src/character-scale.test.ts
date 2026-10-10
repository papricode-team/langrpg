import { describe, expect, it } from 'vitest';
import { characterArtScale, INTERIOR_CHARACTER_HEIGHT, NPC_ART, PLAYER_ART } from './character-art';
import { MODULAR_ART } from './avatar-options';
import { getInterior } from './interiors';

describe('interior human proportions', () => {
  it('gives the player and residents the same visible adult height despite different sprite padding', () => {
    const player = characterArtScale(PLAYER_ART.bodyHeight, PLAYER_ART.height, true) * PLAYER_ART.bodyHeight;
    const resident = characterArtScale(NPC_ART.bodyHeight, NPC_ART.height, true) * NPC_ART.bodyHeight;
    const authoredResident = characterArtScale(232, 238, true) * 232;
    expect(player).toBeCloseTo(INTERIOR_CHARACTER_HEIGHT);
    expect(resident).toBeCloseTo(player);
    expect(authoredResident).toBeCloseTo(player);
    expect(characterArtScale(246, 288, true)).toBe(characterArtScale(246, 400, true));
  });

  it('restores the existing outdoor scale after leaving a room', () => {
    expect(characterArtScale(PLAYER_ART.bodyHeight, PLAYER_ART.height, false) * PLAYER_ART.height).toBeCloseTo(82);
    expect(characterArtScale(NPC_ART.bodyHeight, NPC_ART.height, false) * NPC_ART.height).toBeCloseTo(82);
  });

  it('fits the player and host to the larger painted inn furniture', () => {
    const height = getInterior('inn').characterHeight!;
    expect(height).toBeGreaterThan(INTERIOR_CHARACTER_HEIGHT * 1.5);
    for (const art of [MODULAR_ART, NPC_ART, PLAYER_ART]) {
      expect(characterArtScale(art.bodyHeight, art.height, true, height) * art.bodyHeight).toBeCloseTo(height);
      expect(characterArtScale(art.bodyHeight, art.height, false, height)).toBe(characterArtScale(art.bodyHeight, art.height, false));
    }
    expect(getInterior('cafe').characterHeight).toBeUndefined();
  });
});
