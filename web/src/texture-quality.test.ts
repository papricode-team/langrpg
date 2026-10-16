// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it } from 'vitest';
import { qualityUrl, setQualityManifest, tieredAsset } from './texture-quality';
import { frameImageRect } from './texture-frame';
import type * as Phaser from 'phaser';

describe('texture quality URLs', () => {
  setQualityManifest({ version: 1, tiers: { low: .5, medium: .75 }, files: { 'character-cast/ada.webp': [1904, 906], 'lindenhafen.webp': [1536, 1024] } });

  it('maps tiered masters to each tier and keeps cache-busting queries', () => {
    expect(qualityUrl('/assets/character-cast/ada.webp?v=abc', 'low')).toBe('/assets/q/low/character-cast/ada.webp?v=abc');
    expect(qualityUrl('/assets/q/low/character-cast/ada.webp?v=abc', 'medium')).toBe('/assets/q/medium/character-cast/ada.webp?v=abc');
    expect(qualityUrl('/assets/q/medium/lindenhafen.webp', 'high')).toBe('/assets/lindenhafen.webp');
    expect(tieredAsset(`${location.origin}/assets/q/low/lindenhafen.webp`)).toEqual({ rel: 'lindenhafen.webp', query: '', tier: 'low' });
  });

  it('leaves untiered and foreign URLs alone', () => {
    expect(qualityUrl('/assets/character-kit-hd/body.webp', 'low')).toBe('/assets/character-kit-hd/body.webp');
    expect(qualityUrl('data:image/png;base64,AAAA', 'low')).toBe('data:image/png;base64,AAAA');
    setQualityManifest(null);
    expect(qualityUrl('/assets/lindenhafen.webp', 'low')).toBe('/assets/lindenhafen.webp');
  });

  it('scales frame rectangles from logical size to image pixels', () => {
    const frame = { cutX: 100, cutY: 40, cutWidth: 200, cutHeight: 80, source: { width: 1000, image: { naturalWidth: 500, width: 500 } } } as unknown as Phaser.Textures.Frame;
    expect(frameImageRect(frame)).toEqual([50, 20, 100, 40]);
  });
});
