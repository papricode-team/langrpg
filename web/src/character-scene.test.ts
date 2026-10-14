// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import * as avatarBaker from './avatar-baker';
import type { TextureLease } from './avatar-texture-cache';
import { bootWorld } from './test-support/world-fixture';
import { seedTexture } from './test-support/phaser-harness';
import { castActor, CAST_ART } from './character-cast';
import { characterFrame, MODULAR_ART, NATIVE_MODULAR_ART } from './avatar-options';
import { avatarTextureKey } from './character-recipe.mjs';
import { getInterior } from './interiors';
import { INTERIOR_CHARACTER_HEIGHT } from './character-art';

const frames = Array.from({ length: 36 }, (_, index) => index);
describe('component characters in the Phaser scenes', () => {
  it.each([false, true])('keeps the cafe avatar visible and reuses it on later visits (retry native bake: %s)', async failFirstBake => {
    const { world, town, game, room, until, harness } = await bootWorld({ motion: 'reduced' });
    await until(() => !!town.local.avatarLease);
    const recipeKey = avatarTextureKey(town.local.avatar), runtimeKey = town.local.avatarLease.value;
    const runtime = { value: runtimeKey, release: vi.fn() }, native = { value: 'cafe-native-avatar', release: vi.fn() };
    let nativeReady = false, finish!: (lease: TextureLease<string>) => void, fail!: (error: Error) => void;
    vi.spyOn(avatarBaker, 'acquireAvatarTexture').mockImplementation((_scene, recipe, options) => {
      if (avatarTextureKey(recipe) !== recipeKey) return undefined;
      return options?.resolution === 'editor' ? nativeReady ? native : undefined : runtime;
    });
    const bake = vi.mocked(avatarBaker.bakeAvatarTexture), original = bake.getMockImplementation()!;
    bake.mockImplementation((scene, recipe, options) => avatarTextureKey(recipe) === recipeKey && options?.resolution === 'editor'
      ? new Promise((resolve, reject) => { finish = resolve; fail = reject; }) : original(scene, recipe, options));
    world.enterInterior('cafe');
    await until(() => room().ready);
    const local = room().local, height = getInterior('cafe').characterHeight ?? INTERIOR_CHARACTER_HEIGHT;
    expect(local.figure.visible).toBe(true);
    expect(local.figure.texture.key).toBe(runtimeKey);
    expect(local.artScale * MODULAR_ART.bodyHeight).toBeCloseTo(height);
    expect(local.avatarPending).toBe(true);
    if (failFirstBake) {
      fail(new Error('Temporary native sheet failure'));
      await until(() => !local.avatarPending);
      expect(local.figure.visible).toBe(true);
      expect(local.figure.texture.key).toBe(runtimeKey);
      await until(() => local.avatarPending);
      expect(bake.mock.calls.filter(([, recipe, options]) => avatarTextureKey(recipe) === recipeKey && options?.resolution === 'editor')).toHaveLength(2);
    }
    room().setCharacterFrame(local, 27);
    harness.step(4);
    expect(local.figure.visible).toBe(true);
    const currentFrame = local.frame;
    seedTexture(game, native.value, frames, NATIVE_MODULAR_ART.width, NATIVE_MODULAR_ART.height);
    nativeReady = true; finish(native);
    await until(() => !local.avatarPending);
    expect(local.figure.visible).toBe(true);
    expect(local.figure.texture.key).toBe(native.value);
    expect(local.figure.frame.name).toBe(currentFrame);
    expect(local.artScale * NATIVE_MODULAR_ART.bodyHeight).toBeCloseTo(height);
    expect(runtime.release).toHaveBeenCalledOnce();
    world.leaveInterior();
    await until(() => !room().ready);
    expect(native.release).toHaveBeenCalledWith(false);
    expect(town.local.figure.visible).toBe(true);
    expect(town.local.figure.texture.key).toBe(runtimeKey);
    bake.mockClear();
    world.enterInterior('cafe');
    await until(() => room().ready);
    expect(room().local.figure.visible).toBe(true);
    expect(room().local.figure.texture.key).toBe(native.value);
    expect(room().local.avatarPending).toBe(false);
    expect(bake.mock.calls.filter(([, recipe]) => avatarTextureKey(recipe) === recipeKey)).toHaveLength(0);
  });

  it('keeps a completed local bake reusable when the player leaves before it finishes', async () => {
    const { town } = await bootWorld();
    let finish!: (lease: TextureLease<string>) => void;
    vi.mocked(avatarBaker.bakeAvatarTexture).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const person = town.createCharacter('self', 'You', 300, 300, town.local.avatar);
    const lease = { value: 'late-local-avatar', release: vi.fn() };
    person.root.destroy(); finish(lease); await Promise.resolve(); await Promise.resolve();
    expect(lease.release).toHaveBeenCalledWith(false);
  });

  it.each([60, 600])('keeps slow NPC steps walking consistently with the player %i units away', async separation => {
    const actor = castActor('fritz')!;
    const { town } = await bootWorld({ seed: game => seedTexture(game, actor.key, frames, CAST_ART.width, CAST_ART.height) });
    const person = town.characters.get('fritz');
    town.local.x = person.x + separation; town.local.y = person.y;
    for (let index = 0; index < 120; index++) {
      town.animateCharacter(person, -[.01, .04, .08][index % 3], 0, index / 60);
      expect(person.facing).toBe(3);
      expect(person.figure.frame.name).not.toBe(characterFrame(3));
    }
    town.animateCharacter(person, 0, 0, 2);
    expect(person.figure.frame.name).toBe(characterFrame(separation < 170 ? 1 : 3));
  });
  it('walks a cast bake in all four directions using one sprite', async () => {
    const actor = castActor('marta')!;
    const { town } = await bootWorld({ seed: game => seedTexture(game, actor.key, frames, CAST_ART.width, CAST_ART.height) });
    const person = town.characters.get('marta');
    expect(person.componentCast).toBe(true);
    expect(person.layers).toHaveLength(1);
    expect(person.figure.texture.key).toBe(actor.key);
    expect(person.artScale * CAST_ART.bodyHeight).toBeCloseTo(CAST_ART.worldHeight);
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
