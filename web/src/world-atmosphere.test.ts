import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import { atmosphereProfile, WEATHER_DEPTH, WorldAtmosphere } from './world-atmosphere';
import { nightIntensity } from './world-clock';

class Graphics {
  depth = 0;
  alpha = 0;
  ellipses: { alpha: number; width: number }[] = [];
  circles: { alpha: number; radius: number }[] = [];
  setDepth(depth: number) { this.depth = depth; return this; }
  setBlendMode() { return this; }
  setVisible() { return this; }
  fillStyle(_color: number, alpha: number) { this.alpha = alpha; return this; }
  fillEllipse(_x: number, _y: number, width: number) { this.ellipses.push({ alpha: this.alpha, width }); return this; }
  fillCircle(_x: number, _y: number, radius: number) { this.circles.push({ alpha: this.alpha, radius }); return this; }
  lineStyle() { return this; }
  lineBetween() { return this; }
  clear() { this.ellipses = []; this.circles = []; return this; }
  destroy() {}
}

const view = { x: 0, y: 0, right: 1536, bottom: 1024 };
function fixture() {
  const layers: Graphics[] = [];
  const scene = { sys: { game: { renderer: { type: 1 } } },
    add: { graphics: () => { const graphics = new Graphics(); layers.push(graphics); return graphics; } } } as unknown as Phaser.Scene;
  return { layers, atmosphere: new WorldAtmosphere(scene, 'nebelstadt') };
}

describe('readable world weather', () => {
  it('keeps fog and rain below character and object labels and makes mist visible in layered bands', () => {
    const { layers, atmosphere } = fixture();
    atmosphere.update(0, 12, view, false, false);
    expect(layers[0].depth).toBe(WEATHER_DEPTH);
    expect(layers[0].depth).toBeLessThan(8); // Objects start at y + 8.
    const mist = layers[0].ellipses.filter(ellipse => ellipse.width > 500);
    expect(mist).toHaveLength(36);
    expect(mist[0].alpha * 3).toBeGreaterThan(.09);
    atmosphere.destroy();
  });

  it('uses the clock night strength for lamp glow instead of a separate night interval', () => {
    const { layers, atmosphere } = fixture();
    for (const hour of [6, 7, 7.5, 12, 18.5, 19, 23]) {
      atmosphere.update(0, hour, view, true, false);
      expect(layers[1].circles.find(circle => circle.radius === 4)?.alpha).toBeCloseTo(nightIntensity(hour) * .4);
    }
    atmosphere.destroy();
  });

  it('limits the story storm to Nebelstadt while Rain Arcade keeps its own rain', () => {
    expect(atmosphereProfile('nebelstadt', true).rain).toBe(1);
    for (const town of ['lindenhafen', 'waldruh', 'cedarbay'] as const) expect(atmosphereProfile(town, true).rain).toBe(0);
    expect(atmosphereProfile('rainmarket', true).rain).toBe(atmosphereProfile('rainmarket', false).rain);
  });
});
