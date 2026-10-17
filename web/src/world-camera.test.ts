import { describe, expect, it } from 'vitest';
import { canvasSize, explorationZoom, conversationZoom, CameraRig, smoothDamp } from './world-camera';
import { atmosphereProfile } from './world-atmosphere';
import { timeAmbient } from './world-lighting';

describe('world presentation', () => {
  it('preserves CSS person scale on Retina while doubling canvas detail', () => {
    const css = explorationZoom(1920, 1080, 1), retina = explorationZoom(3840, 2160, 2);
    expect(css.zoom * 72).toBeCloseTo(108);
    expect(retina.zoom / 2).toBe(css.zoom);
    expect(canvasSize(1920, 1080, 3)).toEqual({ width: 3840, height: 2160, density: 2 });
  });
  it('frames outdoor adults at 10% with readable floors and slightly closer rooms', () => {
    for (const [width,height,indoor] of [[1920,1080,false],[1440,900,true],[390,844,false]] as const) {
      const mobile=width<760||width<1000&&height<520;
      const personHeight=Math.max(mobile?60:72,Math.min(indoor?144:120,height*(indoor?.12:.10)));
      const bodyHeight=indoor?132:72;
      const zoom=explorationZoom(width,height,1,indoor).zoom;
      expect(zoom).toBeCloseTo(Math.max(width/1536,height/1024,personHeight/bodyHeight));
      expect(conversationZoom(zoom,true)).toBeCloseTo(zoom*1.12);
      expect(conversationZoom(zoom,false)).toBe(zoom);
      const retina=explorationZoom(width*2,height*2,2,indoor).zoom;
      expect(conversationZoom(retina,true)/2).toBeCloseTo(conversationZoom(zoom,true));
    }
  });
  it('keeps a 60px adult on landscape phones and 72px on short desktop windows', () => {
    const bounds = {width:6000,height:4000};
    expect(explorationZoom(844,390,1,false,132,bounds).zoom*72).toBe(60);
    expect(explorationZoom(1280,600,1,false,132,bounds).zoom*72).toBe(72);
    expect(explorationZoom(1280,720,1,false,132,bounds).zoom*72).toBe(72);
    expect(explorationZoom(390,844,1,false,132,bounds).zoom*72).toBeCloseTo(84.4);
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
      const personHeight = Math.max(mobile ? 60 : 72, Math.min(144, height * .12));
      expect(zoom).toBeCloseTo(Math.max(width / 1536, height / 1024, personHeight / 240));
      expect(explorationZoom(width * 2, height * 2, 2, true, 240).zoom / 2).toBeCloseTo(zoom);
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
  it('eases the camera in and out instead of stepping with the player', () => {
    const screen = { width: 1600, height: 900 }, world = { width: 6000, height: 4000 };
    const rig = new CameraRig().snap({ x: 1000, y: 1000, zoom: 1, settle: .28 }, screen, world);
    const speeds: number[] = [];
    let x = 1000, previous = rig.x;
    for (let frame = 0; frame < 180; frame++) {
      x += frame < 60 ? 225 / 60 : 0;
      rig.step({ x, y: 1000, zoom: 1, settle: .28, deadzone: { width: 200, height: 100 } }, 1 / 60, screen, world);
      speeds.push((rig.x - previous) * 60); previous = rig.x;
    }
    // Held still inside the dead zone, then a gradual start, no frame-to-frame jumps, and a settled stop.
    expect(speeds[0]).toBe(0);
    for (let i = 1; i < speeds.length; i++) expect(Math.abs(speeds[i] - speeds[i - 1])).toBeLessThan(12);
    expect(Math.abs(speeds.at(-1)!)).toBeLessThan(1);
    expect(x - rig.x).toBeLessThanOrEqual(100.5);
  });
  it('keeps the camera inside the map without winding up past an edge', () => {
    const screen = { width: 1600, height: 900 }, world = { width: 3000, height: 2000 };
    const rig = new CameraRig().snap({ x: -500, y: 5000, zoom: 1, settle: .3 }, screen, world);
    expect([rig.x, rig.y]).toEqual([800, 1550]);
    for (let i = 0; i < 30; i++) rig.step({ x: -500, y: 1000, zoom: 1, settle: .3 }, 1 / 60, screen, world);
    expect(rig.x).toBe(800);
    rig.step({ x: 1500, y: 1000, zoom: 1, settle: .3 }, 1 / 60, screen, world);
    expect(rig.x).toBeGreaterThan(800);
    expect(new CameraRig().snap({ x: 0, y: 0, zoom: .25, settle: .3 }, screen, world).x).toBe(1500);
  });
  it('approaches the same point regardless of frame rate', () => {
    const run = (fps: number) => { let x = 0, v = 0; for (let i = 0; i < fps / 2; i++) [x, v] = smoothDamp(x, 100, v, .28, 1 / fps); return x; };
    expect(run(30)).toBeCloseTo(run(144), 0);
  });
});
