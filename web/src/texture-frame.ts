import type * as Phaser from 'phaser';

/**
 * A frame's rectangle in its source image's pixels. Tiered textures keep the master's logical size
 * while the image may be smaller (see texture-quality.ts), so code that reads pixels scales here.
 */
export function frameImageRect(frame: Phaser.Textures.Frame): [number, number, number, number] {
  const image = frame.source.image as HTMLImageElement | HTMLCanvasElement;
  const natural = (image as HTMLImageElement).naturalWidth || image.width;
  const scale = natural && frame.source.width ? natural / frame.source.width : 1;
  return [frame.cutX * scale, frame.cutY * scale, frame.cutWidth * scale, frame.cutHeight * scale];
}

/** Emitted on the texture manager with the texture key after a source changes quality tier. */
export const QUALITY_SWAP_EVENT = 'qualityswap';
