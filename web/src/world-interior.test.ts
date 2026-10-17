import {roomLighting} from './room-kit';
import {roomLayoutFingerprint} from './room-layout';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { getInterior, type InteriorId } from './interiors';
import { WorldInterior } from './world-interior';
import furniture from '../public/assets/interior-animations.json';
import details from '../public/assets/interior-effect-animations.json';
import stills from '../public/assets/interior-stills.json';
import trainStills from '../public/assets/interior-train-stills.json';

const quality = vi.hoisted(() => ({tier: 'high'}));
vi.mock('./quality-state', () => ({graphicsQualityTier: () => quality.tier}));
beforeEach(() => { quality.tier = 'high'; });

class Sprite {
  originX = .5; originY = .5; scale = 1; depth = 0; alpha = 1; visible = true; destroyed = false;
  constructor(public x: number, public y: number, public key: string, public frame = '') {}
  setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; }
  setScale(scale: number) { this.scale = scale; return this; }
  setDepth(depth: number) { this.depth = depth; return this; }
  blendMode = ''; tint = 0xffffff;
  setDisplaySize() { return this; }
  setBlendMode(mode: string) { this.blendMode = mode; return this; }
  setTint(tint: number) { this.tint = tint; return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  setTexture(key: string) { this.key = key; return this; }
  setFrame(frame: string) { this.frame = frame; return this; }
  destroy() { this.destroyed = true; }
}

const roomView = { x: 0, y: 0, right: 1536, bottom: 1024 };
function fixture(id: InteriorId, missingAtmosphere = false) {
  const sprites: Sprite[] = [];
  const create = (x: number, y: number, key: string, frame?: string) => {
    const sprite = new Sprite(x, y, key, frame); sprites.push(sprite); return sprite;
  };
  const removeTexture = vi.fn();
  const context = new Proxy({createRadialGradient: () => ({addColorStop: vi.fn()}),
    createLinearGradient: () => ({addColorStop: vi.fn()})}, {get: (target, key) => key in target ? target[key as keyof typeof target] : vi.fn()});
  const createdTextures = new Set<string>();
  const createCanvas = vi.fn((key: string) => { createdTextures.add(key); return {context, refresh: vi.fn()}; });
  const scene = {
    add: { image: create, sprite: create },
    tweens: { add: (config: { targets: Sprite; alpha: number }) => config.targets.setAlpha(config.alpha), killTweensOf: () => undefined },
    textures: { createCanvas, remove: removeTexture, exists: (key: string) => !missingAtmosphere || !key.startsWith('atmo-') || createdTextures.has(key), get: () => ({ getSourceImage: () => undefined, has: () => true, customData: {layout:`1:${roomLayoutFingerprint(undefined)}`} }) },
    cache: { json: { get: (key: string) => key === 'interior-animations' ? furniture
      : key === 'interior-stills' ? stills : key === 'interior-train-stills' ? trainStills : key === 'interior-effect-animations' ? details : undefined } },
  } as unknown as Phaser.Scene;
  const room = new WorldInterior(scene, getInterior(id));
  const bodies = sprites.filter(sprite => sprite.key !== 'interior-effects');
  const effects = sprites.filter(sprite => sprite.key === 'interior-effects');
  return { room, sprites, bodies, effects, removeTexture, createCanvas };
}
const pose = (sprite: Sprite) => [sprite.x, sprite.y, sprite.frame, sprite.scale, sprite.depth, sprite.originX, sprite.originY];
const appearance = (sprite: Sprite) => [sprite.frame, sprite.alpha];

describe('stable interior rendering', () => {
  it('paints the carriage, restores the ticket, serves tea and crossfades to dawn without moving the room', () => {
    const {room,sprites}=fixture('train-compartment');
    const [night,dawn]=sprites.filter(sprite=>sprite.key.startsWith('interior-train-compartment-'));
    expect([night.key,dawn.key]).toEqual(['interior-train-compartment-room','interior-train-compartment-dawn']);
    expect(sprites.some(sprite=>sprite.key==='room-kit-furniture' || sprite.key.includes('-light-') || sprite.key.startsWith('atmo-'))).toBe(false);
    expect(room.peopleTint(0xfff0d9, 822, 448, 22)).toBe(0xfff0d9);
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
  it('creates visible screen-blended pools above the inn floor and anchors the halo to the painted shade', () => {
    const {room, sprites, createCanvas} = fixture('inn', true);
    expect(createCanvas).toHaveBeenCalledWith('atmo-glow', 64, 64);
    expect(createCanvas).toHaveBeenCalledWith('atmo-core', 16, 16);
    const overlays = sprites.filter(sprite => sprite.key.includes('-light-v2-'));
    expect(overlays.map(sprite => [sprite.key, sprite.depth, sprite.blendMode])).toEqual([
      ['room-kit-inn-light-v2-shade', -999, 'NORMAL'],
      ['room-kit-inn-light-v2-windows', -998, 'SCREEN'],
      ['room-kit-inn-light-v2-lamps', -997, 'SCREEN'],
    ]);
    for (const sprite of overlays) expect(createCanvas).toHaveBeenCalledWith(sprite.key, 768, 512);
    const halo = sprites.find(sprite => sprite.key === 'atmo-glow')!;
    // The lamp's 45-unit collision box is much shorter than its 199-unit painted image.
    expect(halo.depth).toBeGreaterThan(sprites.find(sprite => sprite.key === 'room-kit-furniture' && sprite.frame === 'lamp')!.depth);
    expect(halo.x).toBe(822);
    expect(halo.y).toBeCloseTo(410 - 120 * 435 / 262 * .79);
    room.update(0, roomView, 12);
    expect(overlays.every(sprite => sprite.visible && sprite.alpha > .4)).toBe(true);
    expect(halo.visible && halo.alpha > .25).toBe(true);
    const day = overlays.map(sprite => sprite.alpha), floor = sprites.find(sprite => sprite.key === 'room-kit-inn')!;
    const dayTint = floor.tint;
    room.update(2, roomView, 22);
    expect(overlays[1].alpha).toBeLessThan(day[1] / 10);
    expect(overlays[2].alpha).toBeGreaterThan(day[2]);
    expect(floor.tint).not.toBe(dayTint);
    expect(floor.tint & 255).toBeGreaterThan(floor.tint >> 16 & 255);
  });

  it('flickers gently, freezes under reduced motion, and retains floor lighting on Low', () => {
    const {room, sprites} = fixture('cafe');
    const halo = sprites.find(sprite => sprite.key === 'atmo-glow')!;
    room.update(0, roomView, 22); const initial = halo.alpha;
    room.update(.5, roomView, 22);
    expect(halo.alpha).not.toBe(initial);
    expect(Math.abs(halo.alpha - initial)).toBeLessThan(.02);
    room.setReducedMotion(true); room.update(2, roomView, 22); const frozen = halo.alpha;
    room.update(8, roomView, 22); expect(halo.alpha).toBe(frozen);
    quality.tier = 'low'; room.update(10, roomView, 22);
    expect(sprites.filter(sprite => sprite.key === 'atmo-glow').every(sprite => !sprite.visible)).toBe(true);
    expect(sprites.filter(sprite => sprite.key === 'atmo-core').every(sprite => sprite.visible)).toBe(true);
    expect(sprites.filter(sprite => sprite.key.includes('-light-v2-')).every(sprite => sprite.visible && sprite.alpha > 0)).toBe(true);
    quality.tier = 'high'; room.update(11, roomView, 22); expect(halo.visible).toBe(true);
  });

  it('warms people near each lamp and cools unlit people at night', () => {
    const {room} = fixture('inn');
    const lamp = roomLighting(getInterior('inn')).lamps[0], base = 0xfff0d9;
    const near = room.peopleTint(base, lamp.floorX, lamp.floorY, 22);
    const far = room.peopleTint(base, 300, 800, 22);
    expect(near >> 16 & 255).toBeGreaterThan(far >> 16 & 255);
    expect(near & 255).toBeLessThan(far & 255);
    expect(room.peopleTint(base, 300, 800, 12)).toBe(base);
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
    for (const layer of ['shade', 'windows', 'lamps']) expect(removeTexture).toHaveBeenCalledWith(`room-kit-bakery-light-v2-${layer}`);
    expect(sprites.every(sprite => sprite.destroyed)).toBe(true);
    expect(room.objectCount).toBe(0);
    expect(room.animatedObjectCount).toBe(0);
  });
});
