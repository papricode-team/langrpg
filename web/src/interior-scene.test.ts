// @vitest-environment happy-dom
import './test-support/phaser-dom';
import {describe, expect, it, vi} from 'vitest';
import {InteriorScene} from './interior-scene';
import {getInterior, type InteriorSpec} from './interiors';
import {roomLighting} from './room-kit';
import {interiorLitPeopleTint, interiorPeopleTint} from './world-lighting';
import {WorldClock} from './world-clock';
import type {Character} from './explore-scene';

class Probe extends InteriorScene {
  step() { this.updateScene(); }
  ambient(character: Character) { this.setCharacterAmbient(character, 0xffffff); }
}
const actor = (x: number, y: number) => ({x, y, componentCast: true, figure: {
  tintTopLeft: 0xffffff,
  setTint(tint: number) { this.tintTopLeft = tint; },
}} as unknown as Character);

function probe(spec: InteriorSpec = getInterior('inn')) {
  const scene = new Probe(), lighting = roomLighting(getInterior('inn'));
  const lamp = lighting.lamps[0];
  const local = actor(300, 800), npc = actor(lamp.floorX, lamp.floorY), peer = actor(300, 800);
  const peopleTint = vi.fn((base: number, x: number, y: number, hour: number) => interiorLitPeopleTint(base, lighting, x, y, hour));
  const clock = new WorldClock({mode: 'manual', hour: 22});
  Object.assign(scene, {spec, clock, room: {update: vi.fn(), peopleTint},
    cameras: {main: {worldView: {x:0,y:0,right:1536,bottom:1024}}},
    local, characters: new Map([['npc', npc]]), peers: new Map([['peer', peer]]),
  });
  return {scene, local, npc, peer, lamp, clock, peopleTint};
}

describe('room character illumination without booting Phaser', () => {
  it('updates local, story and remote figures as they walk and the room clock changes', () => {
    const {scene, local, npc, peer, lamp, clock} = probe();
    scene.step();
    expect(local.figure.tintTopLeft).toBe(peer.figure.tintTopLeft);
    expect(local.figure.tintTopLeft).not.toBe(npc.figure.tintTopLeft);
    local.x = lamp.floorX; local.y = lamp.floorY; scene.step();
    expect(local.figure.tintTopLeft).toBe(npc.figure.tintTopLeft);
    // A freshly baked avatar must receive the same positional tint immediately.
    scene.ambient(local); expect(local.figure.tintTopLeft).toBe(npc.figure.tintTopLeft);
    clock.configure({mode:'manual',hour:12}); scene.step();
    expect(peer.figure.tintTopLeft).toBe(interiorPeopleTint('lindenhafen', 'inn'));
  });
  it('leaves painted-room figures on their existing fixed tint path', () => {
    const {scene, local, peopleTint} = probe({...getInterior('inn'), presentation: 'painted'});
    scene.ambient(local); const original = local.figure.tintTopLeft;
    scene.step();
    expect(peopleTint).not.toHaveBeenCalled();
    expect(local.figure.tintTopLeft).toBe(original);
  });
});
