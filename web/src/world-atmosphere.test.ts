// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { afterEach, describe, expect, it } from 'vitest';
import * as Phaser from 'phaser';
import { phaserHarness, trackGame, type PhaserHarness } from './test-support/phaser-harness';
import { atmosphereProfile, LAMP_CORE_ALPHA, LAMP_HALO_ALPHA, MIST_TEXTURE_ALPHA, WEATHER_DEPTH, WorldAtmosphere } from './world-atmosphere';
import { nightIntensity } from './world-clock';
import type { MapId } from './maps';
import { getWorldScene } from './scene-data';

let harness: PhaserHarness | undefined;
afterEach(() => { harness?.restore(); harness = undefined; });

const view = { x: 0, y: 0, right: 1536, bottom: 1024 };
async function fixture(id: MapId = 'nebelstadt') {
  harness = phaserHarness();
  const scene = new Phaser.Scene({ key: 'weather' });
  const game = trackGame(new Phaser.Game({ type: Phaser.CANVAS, width: 300, height: 200, scene: [scene], banner: false, audio: { noAudio: true } }));
  if (!game.isBooted) await new Promise<void>(resolve => game.events.once(Phaser.Core.Events.READY, () => resolve()));
  game.loop.stop();
  harness.step(2);
  const atmosphere = new WorldAtmosphere(scene, id, [{ x: 200, y: 300, footY: 380, width: 27 }]);
  return { scene, atmosphere, lamps: () => (atmosphere as any).lamps as any[], parts: atmosphere as any };
}

describe('readable world weather', () => {
  it('keeps mist and rain below character and object labels and makes mist visible as a drifting band', async () => {
    const { atmosphere, parts } = await fixture();
    atmosphere.update(0, 12, view, false, false);
    expect(parts.mist.depth).toBe(WEATHER_DEPTH);
    expect(parts.rain.depth).toBe(WEATHER_DEPTH);
    expect(WEATHER_DEPTH).toBeLessThan(8); // Objects start at y + 8.
    expect(parts.mist.visible).toBe(true);
    expect(parts.mist.alpha * MIST_TEXTURE_ALPHA).toBeGreaterThan(.09);
    expect(parts.mist.alpha * MIST_TEXTURE_ALPHA).toBeLessThan(.12);
    atmosphere.update(20, 12, view, false, false);
    expect(parts.mist.tilePositionX).toBe(100);
    atmosphere.update(40, 12, view, true, false);
    expect(parts.mist.tilePositionX).toBe(100);
  });

  it('shows no mist where a region has none', async () => {
    const { atmosphere, parts } = await fixture('lindenhafen');
    atmosphere.update(0, 12, view, false, false);
    expect(parts.mist.visible).toBe(false);
  });

  it('uses the clock night strength for lamp glow instead of a separate night interval', async () => {
    const { atmosphere, lamps } = await fixture();
    for (const hour of [6, 7, 7.5, 12, 18.5, 19, 23]) {
      atmosphere.update(0, hour, view, true, false);
      expect(lamps()[0].core.alpha).toBeCloseTo(nightIntensity(hour) * LAMP_CORE_ALPHA);
    }
  });

  it('bounds halo opacity and radius, follows new lamps and culls lamps outside the view', async () => {
    const { atmosphere, lamps, scene } = await fixture();
    atmosphere.update(10, 22, view, false, false);
    const [lamp] = lamps();
    expect(lamp.halo.alpha + lamp.core.alpha).toBeLessThan(.24);
    expect(lamp.halo.alpha).toBeLessThanOrEqual(LAMP_HALO_ALPHA);
    expect(lamp.halo.displayWidth / 2).toBeLessThan(25);
    expect([lamp.halo.x, lamp.halo.y]).toEqual([200, 300]);
    atmosphere.setLampLights([{ x: 400, y: 250, footY: 350, width: 20 }]);
    atmosphere.update(10, 22, view, true, false);
    expect(lamps()).toHaveLength(1);
    expect([lamps()[0].halo.x, lamps()[0].halo.y]).toEqual([400, 250]);
    expect(scene.children.list.filter(child => (child as Phaser.GameObjects.Image).texture?.key === 'atmo-glow')).toHaveLength(1);
    atmosphere.update(10, 22, { x: 800, y: 800, right: 900, bottom: 900 }, false, false);
    expect(lamps()[0].halo.visible).toBe(false);
  });

  it('emits rain at the authored density for the visible share of the map and stops it when dry', async () => {
    const { atmosphere, parts } = await fixture();
    atmosphere.update(0, 12, view, false, true);
    expect(parts.rain.emitting).toBe(true);
    // 130 drops across the whole map; this view shows its share of them.
    const { width, height } = getWorldScene('nebelstadt');
    expect(parts.rain.frequency).toBeCloseTo(600 / (130 * (1536 * 1024) / (width * height)), 1);
    harness!.advance(1000);
    expect(parts.rain.getAliveParticleCount()).toBeGreaterThan(0);
    atmosphere.update(0, 12, view, false, false, 0);
    expect(parts.rain.emitting).toBe(false);
  });

  it('limits the story storm to Nebelstadt while Rain Arcade keeps its own rain', () => {
    expect(atmosphereProfile('nebelstadt', true).rain).toBe(1);
    for (const town of ['lindenhafen', 'waldruh', 'cedarbay'] as const) expect(atmosphereProfile(town, true).rain).toBe(0);
    expect(atmosphereProfile('rainmarket', true).rain).toBe(atmosphereProfile('rainmarket', false).rain);
  });

  it('uses shared regional weather for rain while retaining the authored story storm', () => {
    expect(atmosphereProfile('lindenhafen', false, .75).rain).toBe(.75);
    expect(atmosphereProfile('rainmarket', false, 0).rain).toBe(0);
    expect(atmosphereProfile('nebelstadt', true, 0).rain).toBe(1);
  });
});
