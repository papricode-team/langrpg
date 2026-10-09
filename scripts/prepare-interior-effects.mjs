#!/usr/bin/env node
/** Pack ImageGen detail layers; rigid furniture never enters these animations. */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const source = resolve(root, 'art/source/interiors/interior-effects.png');
const assetDir = resolve(root, 'web/public/assets');
const key = 'interior-effects';
// Normalize the generated sheet to its requested four-column/two-row grid.
const { data, info } = await sharp(source).resize(1024, 1024).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const effects = [{ name: 'steam', sourceY: 483 }, { name: 'flame', sourceY: 380 }];
const frames = {}, parts = [], assets = {};
let packY = 2;
for (const [row, effect] of effects.entries()) {
  let left = 128, right = 128, top = effect.sourceY, bottom = effect.sourceY;
  for (let column = 0; column < 4; column++) {
    let transparent = 0;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 256; x++) {
      const alpha = data[((row * 512 + y) * info.width + column * 256 + x) * 4 + 3];
      if (alpha === 0) transparent++;
      if (alpha > 16) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (transparent < 256 * 512 * .2) throw Error(`${effect.name}: native transparent surroundings required`);
  }
  left = Math.max(0, left - 3); right = Math.min(255, right + 3);
  top = Math.max(0, top - 3); bottom = Math.min(511, bottom + 3);
  const width = right - left + 1, height = bottom - top + 1, cycle = [];
  for (let column = 0; column < 4; column++) {
    const frame = `${effect.name}-${column}`, packX = 2 + column * (width + 4);
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      const offset = ((row * 512 + top + y) * info.width + column * 256 + left) * 4;
      data.copy(rgba, y * width * 4, offset, offset + width * 4);
    }
    const input = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
    parts.push({ input, left: packX, top: packY });
    frames[frame] = { frame: { x: packX, y: packY, w: width, h: height }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: width, h: height }, sourceSize: { w: width, h: height } };
    cycle.push(frame);
  }
  assets[effect.name] = { key, frames: cycle, fps: 2.5, width, height, referenceWidth: width,
    originX: (128 - left) / width, originY: (effect.sourceY - top) / height };
  packY += height + 4;
}
await sharp({ create: { width: 1040, height: packY, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(parts).webp({ lossless: true, effort: 6 }).toFile(resolve(assetDir, `${key}.webp`));
await writeFile(resolve(assetDir, `${key}.json`), JSON.stringify({ frames, meta: { image: `${key}.webp`, size: { w: 1040, h: packY }, scale: '1' } }, null, 2) + '\n');
await writeFile(resolve(assetDir, 'interior-effect-animations.json'), JSON.stringify({ version: 1, framesPerAsset: 4, assets }, null, 2) + '\n');
console.log('Packed eight transparent steam/flame frames with shared emitter anchors.');
