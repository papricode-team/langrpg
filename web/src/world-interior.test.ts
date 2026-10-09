import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import { getInterior } from './interiors';
import { WorldInterior } from './world-interior';
import furniture from '../public/assets/interior-animations.json';
import details from '../public/assets/interior-effect-animations.json';
import stills from '../public/assets/interior-stills.json';

class Sprite {
  originX = .5; originY = .5; scale = 1; depth = 0; alpha = 1; visible = true; destroyed = false;
  constructor(public x: number, public y: number, public key: string, public frame = '') {}
  setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; }
  setScale(scale: number) { this.scale = scale; return this; }
  setDepth(depth: number) { this.depth = depth; return this; }
  setDisplaySize() { return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  setFrame(frame: string) { this.frame = frame; return this; }
  destroy() { this.destroyed = true; }
}

const roomView = { x: 0, y: 0, right: 1536, bottom: 1024 };
function fixture(id: 'cafe' | 'bakery' | 'supermarket') {
  const sprites: Sprite[] = [];
  const create = (x: number, y: number, key: string, frame?: string) => {
    const sprite = new Sprite(x, y, key, frame); sprites.push(sprite); return sprite;
  };
  const scene = {
    add: { image: create, sprite: create },
    textures: { exists: () => true, get: () => ({ has: () => true }) },
    cache: { json: { get: (key: string) => key === 'interior-animations' ? furniture
      : key === 'interior-stills' ? stills : key === 'interior-effect-animations' ? details : undefined } },
  } as unknown as Phaser.Scene;
  const room = new WorldInterior(scene, getInterior(id));
  const bodies = sprites.filter(sprite => sprite.key !== 'interior-effects');
  const effects = sprites.filter(sprite => sprite.key === 'interior-effects');
  return { room, sprites, bodies, effects };
}
const pose = (sprite: Sprite) => [sprite.x, sprite.y, sprite.frame, sprite.scale, sprite.depth, sprite.originX, sprite.originY];
const appearance = (sprite: Sprite) => [sprite.frame, sprite.alpha];

describe('stable interior rendering', () => {
  it.each(['cafe', 'bakery', 'supermarket'] as const)('keeps %s furniture and its anchors identical throughout an idle cycle', id => {
    const { room, bodies } = fixture(id);
    const initial = bodies.map(pose);
    for (const seconds of [0, .15, .4, .8, 1.6, 10, 100]) {
      room.update(seconds, roomView);
      expect(bodies.map(pose)).toEqual(initial);
    }
  });

  it('uses the corrected stills for counters and tables while preserving their floor anchors', () => {
    const { bodies } = fixture('bakery');
    const checkout = bodies.find(sprite => sprite.frame === 'bakery-counter-still' && sprite.x === 1060)!;
    expect(checkout).toBeDefined();
    expect([checkout.x, checkout.y]).toEqual([1060, 735]);
    expect(checkout.key).toBe('interior-proportioned');
  });

  it('animates only the detail layers, smoothly, without changing their emitter anchors', () => {
    const { room, effects } = fixture('bakery');
    const positions = effects.map(sprite => [sprite.x, sprite.y, sprite.scale, sprite.depth]);
    room.update(0, roomView);
    const initial = effects.map(appearance);
    room.update(.01, roomView);
    expect(effects.map(appearance)).not.toEqual(initial);
    expect(effects.map(sprite => [sprite.x, sprite.y, sprite.scale, sprite.depth])).toEqual(positions);
    for (let index = 0; index < effects.length; index += 2) {
      // A tiny time step cannot flash the brightness or jump the source point.
      expect(effects[index].alpha + effects[index + 1].alpha).toBeCloseTo(Number(initial[index][1]) + Number(initial[index + 1][1]));
      expect(Math.abs(effects[index].alpha - Number(initial[index][1]))).toBeLessThan(.02);
    }
    expect(room.animatedObjectCount).toBe(4);
  });

  it('freezes both detail frames and their blend when reduced motion is enabled', () => {
    const { room, effects } = fixture('bakery');
    room.update(.3, roomView);
    const frozen = effects.map(appearance);
    room.setReducedMotion(true);
    room.update(20, roomView);
    expect(effects.map(appearance)).toEqual(frozen);
    room.setReducedMotion(false);
    room.update(20.1, roomView);
    expect(effects.map(appearance)).not.toEqual(frozen);
  });

  it('hides, culls and destroys detail sprites alongside the room', () => {
    const { room, sprites, effects } = fixture('bakery');
    room.update(0, roomView);
    room.setVisible(false);
    expect(sprites.every(sprite => !sprite.visible)).toBe(true);
    room.setVisible(true);
    room.update(1, roomView);
    expect(sprites.every(sprite => sprite.visible)).toBe(true);
    room.update(2, { x: 3000, y: 3000, right: 4000, bottom: 4000 });
    expect(effects.every(sprite => !sprite.visible)).toBe(true);
    room.destroy();
    expect(sprites.every(sprite => sprite.destroyed)).toBe(true);
    expect(room.objectCount).toBe(0);
    expect(room.animatedObjectCount).toBe(0);
  });
});
