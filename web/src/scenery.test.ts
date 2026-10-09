import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { maps } from './maps';
import { getScenery, packScenery, sceneryDepth } from './scenery';
import { WorldScenery } from './world-scenery';

describe('painted foreground scenery', () => {
  for (const map of maps) {
    it(`packs ${map.name} into a bounded atlas without crop overlap`, () => {
      const specs = getScenery(map.id);
      expect(specs.length).toBeGreaterThan(10);
      expect(new Set(specs.map(spec => spec.id)).size).toBe(specs.length);
      const atlas = packScenery(specs);
      expect(atlas.width).toBeLessThanOrEqual(1024);
      expect(atlas.height).toBeLessThanOrEqual(2048);
      for (let index = 0; index < atlas.frames.length; index++) {
        const frame = atlas.frames[index];
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(1536);
        expect(frame.y + frame.height).toBeLessThanOrEqual(1024);
        expect(Number.isFinite(frame.spec.baseY)).toBe(true);
        expect(frame.spec.outline.length).toBeGreaterThanOrEqual(3);
        for (const other of atlas.frames.slice(index + 1)) {
          const overlaps = frame.atlasX < other.atlasX + other.width && frame.atlasX + frame.width > other.atlasX
            && frame.atlasY < other.atlasY + other.height && frame.atlasY + frame.height > other.atlasY;
          expect(overlaps, `${frame.spec.id} overlaps ${other.spec.id}`).toBe(false);
        }
      }
    });
  }

  it('changes foreground order at the physical base rather than the canopy top', () => {
    const baseY = 609;
    const characterDepth = (feetY: number): number => feetY + 10;
    expect(sceneryDepth(baseY)).toBeGreaterThan(characterDepth(590));
    expect(sceneryDepth(baseY)).toBeLessThan(characterDepth(630));
  });

  it('uploads once, culls by the whole silhouette, and releases its atlas on travel', () => {
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      translate: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), drawImage: vi.fn() };
    const texture = { context: ctx, add: vi.fn(), refresh: vi.fn() };
    const sprites: { setVisible: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = [];
    const order: string[] = [];
    const scene = {
      textures: {
        exists: vi.fn(() => true), get: vi.fn(() => ({ getSourceImage: () => ({}) })),
        createCanvas: vi.fn(() => texture), remove: vi.fn(() => order.push('texture')),
      },
      add: { image: vi.fn(() => {
        const sprite = { setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
          setVisible: vi.fn().mockReturnThis(), destroy: vi.fn(() => order.push('sprite')) };
        sprites.push(sprite);
        return sprite;
      }) },
    };
    const scenery = new WorldScenery(scene as unknown as Phaser.Scene, 'lindenhafen');
    expect(scene.textures.createCanvas).toHaveBeenCalledTimes(1);
    expect(texture.refresh).toHaveBeenCalledTimes(1);
    const draws = ctx.drawImage.mock.calls.length;
    const atlas = packScenery(getScenery('lindenhafen'));
    const first = atlas.frames[0];
    scenery.update({ x: first.x, y: first.y, right: first.x + 1, bottom: first.y + 1 });
    expect(sprites[0].setVisible).toHaveBeenLastCalledWith(true);
    for (let frame = 0; frame < 100; frame++) scenery.update({ x: 2000, y: 2000, right: 2100, bottom: 2100 });
    expect(sprites.every(sprite => sprite.setVisible.mock.lastCall?.[0] === false)).toBe(true);
    expect(ctx.drawImage).toHaveBeenCalledTimes(draws);
    expect(texture.refresh).toHaveBeenCalledTimes(1);
    scenery.destroy();
    expect(sprites.every(sprite => sprite.destroy.mock.calls.length === 1)).toBe(true);
    expect(scene.textures.remove).toHaveBeenCalledWith('scenery-lindenhafen');
    expect(order.at(-1)).toBe('texture');
  });
});
