import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import { atmosphereProfile, WEATHER_DEPTH, WorldAtmosphere } from './world-atmosphere';
import { nightIntensity } from './world-clock';

class Graphics {
  depth = 0;
  alpha = 0;
  ellipses: { alpha: number; width: number }[] = [];
  circles: { x: number; y: number; alpha: number; radius: number }[] = [];
  setDepth(depth: number) { this.depth = depth; return this; }
  setBlendMode() { return this; }
  setVisible() { return this; }
  fillStyle(_color: number, alpha: number) { this.alpha = alpha; return this; }
  fillEllipse(_x: number, _y: number, width: number) { this.ellipses.push({ alpha: this.alpha, width }); return this; }
  fillCircle(x: number, y: number, radius: number) { this.circles.push({ x, y, alpha: this.alpha, radius }); return this; }
  lineStyle() { return this; }
  lineBetween() { return this; }
  clear() { this.ellipses = []; this.circles = []; return this; }
  destroy() {}
}

const view = { x: 0, y: 0, right: 1536, bottom: 1024 };
function fixture(renderer = 1) {
  const layers: Graphics[] = [];
  const scene = { sys: { game: { renderer: { type: renderer } } },
    add: { graphics: () => { const graphics = new Graphics(); layers.push(graphics); return graphics; } } } as unknown as Phaser.Scene;
  return { layers, atmosphere: new WorldAtmosphere(scene, 'nebelstadt', [{x:200,y:300,footY:380,width:27}]) };
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
      expect(layers[1].circles.at(-1)?.alpha).toBeCloseTo(nightIntensity(hour) * .16);
    }
    atmosphere.destroy();
  });

  it('bounds the halo opacity and radius equally in Canvas and WebGL', () => {
    for (const renderer of [1, 2]) {
      const { layers, atmosphere } = fixture(renderer);
      atmosphere.update(10, 22, view, false, false);
      const circles = layers[1].circles;
      expect(circles).toHaveLength(5);
      expect(circles.reduce((sum, circle) => sum + circle.alpha, 0)).toBeLessThan(.24);
      expect(Math.max(...circles.map(circle => circle.radius))).toBeLessThan(25);
      expect(circles.every(circle => circle.x === 200 && circle.y === 300)).toBe(true);
      atmosphere.setLampLights([{x:400,y:250,footY:350,width:20}]);
      atmosphere.update(10, 22, view, true, false);
      expect(layers[1].circles.every(circle => circle.x === 400 && circle.y === 250)).toBe(true);
      atmosphere.update(10, 22, {x:800,y:800,right:900,bottom:900}, false, false);
      expect(layers[1].circles).toHaveLength(0);
      atmosphere.destroy();
    }
  });

  it('limits the story storm to Nebelstadt while Rain Arcade keeps its own rain', () => {
    expect(atmosphereProfile('nebelstadt', true).rain).toBe(1);
    for (const town of ['lindenhafen', 'waldruh', 'cedarbay'] as const) expect(atmosphereProfile(town, true).rain).toBe(0);
    expect(atmosphereProfile('rainmarket', true).rain).toBe(atmosphereProfile('rainmarket', false).rain);
  });
});
