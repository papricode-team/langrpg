import { describe, expect, it } from 'vitest';
import { canvasSize, cameraScroll, explorationZoom, conversationZoom } from './world-camera';
import { atmosphereProfile } from './world-atmosphere';
import { timeAmbient } from './world-lighting';

describe('world presentation', () => {
  it('preserves CSS person scale on Retina while doubling canvas detail', () => {
    const css = explorationZoom(1920, 1080, 1), retina = explorationZoom(3840, 2160, 2);
    expect(css.zoom * 72).toBeCloseTo(162);
    expect(retina.zoom / 2).toBe(css.zoom);
    expect(canvasSize(1920, 1080, 3)).toEqual({ width: 3840, height: 2160, density: 2 });
  });
  it('frames an outdoor person at 140–180 pixels at 1080p and accounts for the taller indoor bodies', () => {
    for (const [width,height,indoor] of [[1920,1080,false],[1440,900,true],[390,844,false]] as const) {
      const mobile=width<760||width<1000&&height<520;
      const personHeight=Math.max(mobile?88:110,Math.min(indoor?180:162,height*.15));
      const bodyHeight=indoor?132:72;
      const zoom=explorationZoom(width,height,1,indoor).zoom;
      expect(zoom).toBeCloseTo(Math.max(width/1536,height/1024,personHeight/bodyHeight));
      expect(conversationZoom(zoom,true)).toBeCloseTo(zoom*1.12);
      expect(conversationZoom(zoom,false)).toBe(zoom);
      const retina=explorationZoom(width*2,height*2,2,indoor).zoom;
      expect(conversationZoom(retina,true)/2).toBeCloseTo(conversationZoom(zoom,true));
    }
  });
  it('retains map-cover bounds on wide and tall screens', () => {
    for(const [width,height] of [[3840,1080],[1200,2000]]) {
      const zoom=explorationZoom(width,height).zoom;
      expect(width/zoom).toBeLessThanOrEqual(1536);
      expect(height/zoom).toBeLessThanOrEqual(1024);
    }
  });
  it('uses the inn painting scale when framing desktop and mobile rooms', () => {
    for (const [width, height] of [[1920, 1080], [390, 844], [844, 390]]) {
      const zoom = explorationZoom(width, height, 1, true, 240).zoom;
      const mobile = explorationZoom(width, height).mobile;
      const personHeight = Math.max(mobile ? 88 : 110, Math.min(180, height * .15));
      expect(zoom).toBeCloseTo(Math.max(width / 1536, height / 1024, personHeight / 240));
      expect(explorationZoom(width * 2, height * 2, 2, true, 240).zoom / 2).toBeCloseTo(zoom);
    }
  });
  it('keeps the followed person centered when Phaser zooms around a physical camera', () => {
    for (const density of [1, 2]) {
      const width = 1920 * density, zoom = explorationZoom(width, 1080 * density, density).zoom;
      const left = 800 - width / zoom / 2, scroll = cameraScroll(left, width, zoom);
      const worldCenter = scroll + width / 2;
      expect(worldCenter).toBeCloseTo(800);
    }
  });
  it('changes light continuously across both art boundaries', () => {
    for (const hour of [7, 19]) {
      const before = timeAmbient('nebelstadt', hour - .0001, 'day').terrain;
      const after = timeAmbient('nebelstadt', hour + .0001, 'day').terrain;
      for (const shift of [0, 8, 16]) expect(Math.abs((before >> shift & 255) - (after >> shift & 255))).toBeLessThanOrEqual(1);
    }
    expect(atmosphereProfile('nebelstadt', false).fog).toBeGreaterThan(0);
    expect(atmosphereProfile('rainmarket', false).rain).toBeGreaterThan(0);
    expect(atmosphereProfile('lindenhafen', true).rain).toBe(0);
    expect(atmosphereProfile('waldruh', true).rain).toBe(0);
    expect(atmosphereProfile('nebelstadt', true).rain).toBe(1);
  });
});
