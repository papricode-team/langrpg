import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import { WorldScenery } from './world-scenery';
import { getPlacedScenery } from './placed-scenery';
import { worldAmbient } from './world-lighting';
import type { MapId } from './maps';
import type { WorldPeriod } from './world-clock';

class Sprite {
  tint = 0xffffff; visible = true; scale = 1; depth = 0;
  constructor(public x: number, public y: number, public key: string, public frame: string) {}
  setOrigin() { return this; } setScale(scale: number) { this.scale = scale; return this; }
  setDepth(depth: number) { this.depth = depth; return this; } setFlipX() { return this; }
  setTint(tint: number) { this.tint = tint; return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  setFrame(frame: string) { this.frame = frame; return this; } destroy() {}
}
function fixture(mapId: MapId, period: WorldPeriod) {
  const sprites: Sprite[] = [];
  const assets = Object.fromEntries(['tree','cloth','lamp','water'].map(kind => [`motion-${kind}`, {
    key: `${mapId}-motions`, frames: Array.from({length:6},(_,frame)=>`motion-${kind}-${frame}`),
    fps: 4, width: 120, height: 160, referenceWidth: 120, originX: .5, originY: 1,
  }]));
  const scene = {
    cache: { json: { get: () => ({assets}) } },
    textures: { exists: () => true, get: () => ({has:()=>true,get:()=>({width:120,height:160})}) },
    add: { sprite: (x: number, y: number, key: string, frame: string) => {
      const sprite = new Sprite(x,y,key,frame); sprites.push(sprite); return sprite;
    } },
  } as unknown as Phaser.Scene;
  const scenery = new WorldScenery(scene,mapId,period);
  return {sprites,scenery};
}
const view = {x:0,y:0,right:1536,bottom:1024};
const pose = (sprite: Sprite) => [sprite.x,sprite.y,sprite.scale,sprite.depth,sprite.frame];

describe('steady expedition night lighting', () => {
  it('cools buildings and foliage while retaining warm lantern illumination', () => {
    const {sprites} = fixture('saffroncourt','night');
    const ambient = worldAmbient('saffroncourt','night');
    for(const [index,spec] of getPlacedScenery('saffroncourt').entries()) {
      expect(sprites[index].tint).toBe(spec.asset==='lamp'||spec.frame==='motion-lamp' ? ambient.light : ambient.scenery);
    }
    expect(ambient.terrain).not.toBe(0xffffff);
    expect(ambient.people).not.toBe(ambient.terrain);
    expect(ambient.light>>16&255).toBeGreaterThan(ambient.light&255);
  });
  it('restores daylight without moving foundations or advancing a reduced-motion frame', () => {
    const {sprites,scenery} = fixture('seoulsteps','night');
    scenery.update(.4,view); scenery.setReducedMotion(true);
    const before = sprites.map(pose);
    scenery.update(30,view);
    expect(sprites.map(pose)).toEqual(before);
    expect(sprites.some(sprite=>sprite.tint!==0xffffff)).toBe(true);
    scenery.setAmbientTint(0xffffff);
    expect(sprites.every(sprite=>sprite.tint===0xffffff)).toBe(true);
    expect(sprites.map(pose)).toEqual(before);
  });
  it('leaves native night paintings in the three original towns untinted', () => {
    for(const id of ['lindenhafen','waldruh','nebelstadt'] as const) {
      expect(Object.values(worldAmbient(id,'night')).every(tint=>tint===0xffffff)).toBe(true);
      expect(fixture(id,'night').sprites.every(sprite=>sprite.tint===0xffffff)).toBe(true);
    }
  });
});
