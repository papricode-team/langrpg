import {roomLayoutFingerprint} from './room-layout';
import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { getInterior, type InteriorId } from './interiors';
import { WorldInterior } from './world-interior';
import furniture from '../public/assets/interior-animations.json';
import details from '../public/assets/interior-effect-animations.json';
import stills from '../public/assets/interior-stills.json';
import trainStills from '../public/assets/interior-train-stills.json';

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
function fixture(id: InteriorId) {
  const sprites: Sprite[] = [];
  const create = (x: number, y: number, key: string, frame?: string) => {
    const sprite = new Sprite(x, y, key, frame); sprites.push(sprite); return sprite;
  };
  const removeTexture = vi.fn();
  const scene = {
    add: { image: create, sprite: create },
    tweens: { add: (config: { targets: Sprite; alpha: number }) => config.targets.setAlpha(config.alpha), killTweensOf: () => undefined },
    textures: { remove: removeTexture, exists: () => true, get: () => ({ has: () => true, customData: {layout:`1:${roomLayoutFingerprint(undefined)}`} }) },
    cache: { json: { get: (key: string) => key === 'interior-animations' ? furniture
      : key === 'interior-stills' ? stills : key === 'interior-train-stills' ? trainStills : key === 'interior-effect-animations' ? details : undefined } },
  } as unknown as Phaser.Scene;
  const room = new WorldInterior(scene, getInterior(id));
  const bodies = sprites.filter(sprite => sprite.key !== 'interior-effects');
  const effects = sprites.filter(sprite => sprite.key === 'interior-effects');
  return { room, sprites, bodies, effects, removeTexture };
}
const pose = (sprite: Sprite) => [sprite.x, sprite.y, sprite.frame, sprite.scale, sprite.depth, sprite.originX, sprite.originY];
const appearance = (sprite: Sprite) => [sprite.frame, sprite.alpha];

describe('stable interior rendering', () => {
  it('paints the carriage, restores the ticket, serves tea and crossfades to dawn without moving the room', () => {
    const {room,sprites}=fixture('train-compartment');
    const [night,dawn]=sprites.filter(sprite=>sprite.key.startsWith('interior-train-compartment-'));
    expect([night.key,dawn.key]).toEqual(['interior-train-compartment-room','interior-train-compartment-dawn']);
    expect(sprites.some(sprite=>sprite.key==='room-kit-furniture')).toBe(false);
    const ticket=sprites.find(sprite=>sprite.frame==='train-ticket-pale')!, tea=sprites.find(sprite=>sprite.frame==='train-tea')!;
    const anchors=sprites.map(pose);
    room.update(1,roomView);
    expect(dawn.alpha).toBe(0); expect(tea.visible).toBe(false);
    room.restoreTicket(true); room.serveTea(true); room.setDawn(true); room.update(2,roomView);
    expect(ticket.frame).toBe('train-ticket-dark'); expect(tea.visible).toBe(true); expect(dawn.alpha).toBe(1);
    expect(sprites.map(sprite=>pose(sprite).filter((_,index)=>index!==2))).toEqual(anchors.map(values=>values.filter((_,index)=>index!==2)));
    room.setVisible(false); expect(dawn.visible).toBe(false);
    room.destroy(); expect(dawn.destroyed && night.destroyed).toBe(true);
  });
  it.each(['cafe', 'bakery', 'supermarket', 'inn'] as const)('keeps %s furniture and its anchors identical throughout an idle cycle', id => {
    const { room, bodies } = fixture(id);
    const initial = bodies.map(pose);
    for (const seconds of [0, .15, .4, .8, 1.6, 10, 100]) {
      room.update(seconds, roomView);
      expect(bodies.map(pose)).toEqual(initial);
    }
  });
  it('dims window pools at night and keeps a warm lamp lit without animation', () => {
    const { room, sprites } = fixture('cafe');
    const pools = sprites.filter(sprite => sprite.key === 'atmo-pool');
    const halo = sprites.find(sprite => sprite.key === 'atmo-glow');
    expect(pools.length).toBeGreaterThan(0);
    expect(halo).toBeDefined();
    room.setReducedMotion(true);
    room.update(0, roomView, 12);
    const dayPools = pools.map(sprite => sprite.alpha), dayHalo = halo!.alpha;
    room.update(2, roomView, 22);
    expect(pools.some((sprite, index) => sprite.alpha < dayPools[index])).toBe(true);
    expect(halo!.alpha).toBeGreaterThan(dayHalo);
    room.update(8, roomView, 22);
    expect(halo!.alpha).toBeCloseTo(.105);
  });

  it('gives the inn a stable tea table with steam confined to the kettle', () => {
    const { room, bodies, effects } = fixture('inn');
    expect(room.objectCount).toBe(6);
    expect(bodies.filter(sprite => sprite.key === 'room-kit-furniture').map(sprite => sprite.frame)).toEqual(['bed', 'desk', 'lamp']);
    expect(room.animatedObjectCount).toBe(1);
    expect(bodies.some(sprite => sprite.frame === 'cafe-table-still')).toBe(true);
    expect(effects).toHaveLength(2);
    const anchors = effects.map(sprite => [sprite.x, sprite.y, sprite.depth]);
    room.update(.2, roomView); room.update(.3, roomView);
    expect(effects.map(sprite => [sprite.x, sprite.y, sprite.depth])).toEqual(anchors);
    expect(effects.every(sprite => sprite.frame.startsWith('steam-'))).toBe(true);
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
    const { room, sprites, effects, removeTexture } = fixture('bakery');
    room.update(0, roomView);
    room.setVisible(false);
    expect(sprites.every(sprite => !sprite.visible)).toBe(true);
    room.setVisible(true);
    room.update(1, roomView);
    expect(sprites.every(sprite => sprite.visible)).toBe(true);
    room.update(2, { x: 3000, y: 3000, right: 4000, bottom: 4000 });
    expect(effects.every(sprite => !sprite.visible)).toBe(true);
    room.destroy();
    expect(removeTexture).toHaveBeenCalledWith('room-kit-bakery');
    expect(sprites.every(sprite => sprite.destroyed)).toBe(true);
    expect(room.objectCount).toBe(0);
    expect(room.animatedObjectCount).toBe(0);
  });
});
