import { describe, expect, it } from 'vitest';
import { cinematicImageSize, roomRenderDensity, worldGrade } from './world-grade';

describe('world presentation limits', () => {
  it('keeps town palettes distinct and retains a gentler warm highlight at night', () => {
    const day = worldGrade('lindenhafen', 12), night = worldGrade('lindenhafen', 22);
    expect(day.lift).not.toEqual(worldGrade('nebelstadt', 12).lift);
    expect(day.lift).not.toEqual(worldGrade('waldruh', 12).lift);
    expect(day.highlights[0]).toBeGreaterThan(night.highlights[0]);
    expect(night.highlights[0]).toBeGreaterThan(0);
    expect(night.vignette).toBeGreaterThan(day.vignette);
    expect(worldGrade('lindenhafen', 22, true).highlights).toEqual(day.highlights);
  });

  it('renders normal rooms at 2x, while Low and very large rooms respect memory and GPU limits', () => {
    expect(roomRenderDensity(1536, 1024, 'high')).toBe(2);
    expect(roomRenderDensity(1536, 1024, 'low')).toBe(1);
    for (const tier of ['low', 'medium', 'high']) {
      const density = roomRenderDensity(8000, 6000, tier, 4096);
      expect(8000 * density).toBeLessThanOrEqual(4096);
      expect(8000 * 6000 * density ** 2).toBeLessThanOrEqual(tier === 'high' ? 16_777_216 : 8_388_608);
    }
  });

  it('never magnifies the actual decoded train image, including on a 2x display', () => {
    expect(cinematicImageSize(1536, 1024, 3000, 2000)).toEqual({width:1536, height:1024});
    expect(cinematicImageSize(768, 512, 3000, 2000)).toEqual({width:768, height:512});
    expect(cinematicImageSize(1536, 1024, 900, 400)).toEqual({width:600, height:400});
  });
});
