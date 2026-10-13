// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import * as avatarBaker from './avatar-baker';
import type { TextureLease } from './avatar-texture-cache';
import { bootWorld } from './test-support/world-fixture';
import { seedTexture } from './test-support/phaser-harness';
import { castActor } from './character-cast';
import { MODULAR_ART } from './avatar-options';

const frames = Array.from({ length: 36 }, (_, index) => index);
describe('component characters in the Phaser scenes', () => {
  it('walks a cast bake in all four directions using one sprite', async () => {
    const actor = castActor('marta')!;
    const { town } = await bootWorld({ seed: game => seedTexture(game, actor.key, frames, MODULAR_ART.width, MODULAR_ART.height) });
    const person = town.characters.get('marta');
    expect(person.componentCast).toBe(true);
    expect(person.layers).toHaveLength(1);
    expect(person.figure.texture.key).toBe(actor.key);
    expect(person.artScale * MODULAR_ART.bodyHeight).toBeCloseTo(MODULAR_ART.worldHeight);
    for (const [facing, velocityX, velocityY] of [[0, 0, 1], [1, 1, 0], [2, 0, -1], [3, -1, 0]]) {
      town.animateCharacter(person, 0, 0, 1, Infinity, { moving: true, distance: 40, velocityX, velocityY });
      expect(person.facing).toBe(facing);
      expect(Math.floor(Number(person.figure.frame.name) / 9)).toBe(facing);
      expect(person.figure.flipX).toBe(false);
    }
  });
  it('keeps the current facing, rejects stale bakes and releases the active texture on departure', async () => {
    const { town, game } = await bootWorld();
    const pending: ((lease: TextureLease<string>) => void)[] = [];
    vi.mocked(avatarBaker.bakeAvatarTexture).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const person = town.createCharacter('test-peer', 'Test', 300, 300, town.local.avatar);
    town.setCharacterFrame(person, 27);
    expect(person.figure.visible).toBe(false);
    person.avatar = { ...person.avatar, skin: '#445566' };
    town.tintCharacter(person);
    const stale = { value: 'stale-avatar', release: vi.fn() }, current = { value: 'current-avatar', release: vi.fn() };
    seedTexture(game, current.value, frames, MODULAR_ART.width, MODULAR_ART.height);
    pending[1](current); await Promise.resolve(); await Promise.resolve();
    expect(person.figure.texture.key).toBe(current.value);
    expect(person.figure.frame.name).toBe(27);
    expect(person.figure.visible).toBe(true);
    pending[0](stale); await Promise.resolve(); await Promise.resolve();
    expect(stale.release).toHaveBeenCalledWith(true);
    expect(person.figure.texture.key).toBe(current.value);
    person.root.destroy();
    expect(current.release).toHaveBeenCalledWith(true);
  });
  it('releases an unfinished bake when its character is destroyed', async () => {
    const { town } = await bootWorld();
    let finish!: (lease: TextureLease<string>) => void;
    vi.mocked(avatarBaker.bakeAvatarTexture).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const person = town.createCharacter('departed-peer', 'Test', 300, 300, town.local.avatar);
    const lease = { value: 'late-avatar', release: vi.fn() };
    person.root.destroy(); finish(lease); await Promise.resolve(); await Promise.resolve();
    expect(lease.release).toHaveBeenCalledWith(true);
  });
  it('ignores a late narration callback after teardown', async () => {
    const { world } = await bootWorld();
    world.destroy();
    expect(() => world.setNarrationActive(false)).not.toThrow();
  });
});
