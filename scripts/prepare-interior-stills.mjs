#!/usr/bin/env node
/** Export the six corrected, human-scale ImageGen fixtures as single stills. */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd(), key = 'interior-proportioned';
const source = resolve(root, 'art/source/interiors/interior-proportioned.png');
const destination = resolve(root, 'web/public/assets');
const names = ['bakery-counter', 'cafe-table', 'pastry-case', 'checkout', 'oven', 'scales'];
// The generated sheet's third row starts early; use the clear valleys between
// fixtures so the oven chimney never leaks into the pastry display's crop.
const rowStarts = [0, 520, 950, 1536];
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== 1024 || info.height !== 1536) throw Error('Expected a 1024 × 1536 two-column/three-row sheet');
const parts = [], frames = {}, assets = {};
let packX = 2, packY = 2, rowHeight = 0;
for (const [index, name] of names.entries()) {
  const row = Math.floor(index / 2), cellX = index % 2 * 512, cellY = rowStarts[row];
  const cellHeight = rowStarts[row + 1] - cellY;
  let left = 511, right = 0, top = cellHeight - 1, bottom = 0, clear = 0;
  for (let y = 0; y < cellHeight; y++) for (let x = 0; x < 512; x++) {
    const alpha = data[((cellY + y) * info.width + cellX + x) * 4 + 3];
    if (alpha === 0) clear++;
    if (alpha > 32) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  if (clear < 512 * cellHeight * .1 || bottom <= top) throw Error(`${name}: isolated native-alpha furniture required`);
  left = Math.max(0, left - 3); right = Math.min(511, right + 3);
  top = Math.max(0, top - 3); bottom = Math.min(cellHeight - 1, bottom + 3);
  const width = right - left + 1, height = bottom - top + 1;
  if (packX + width + 2 > 1024) { packX = 2; packY += rowHeight + 4; rowHeight = 0; }
  const input = await sharp(source).extract({ left: cellX + left, top: cellY + top, width, height }).png().toBuffer();
  parts.push({ input, left: packX, top: packY });
  const frame = `${name}-still`;
  frames[frame] = { frame: { x: packX, y: packY, w: width, h: height }, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: width, h: height }, sourceSize: { w: width, h: height } };
  assets[name] = { key, frames: [frame], fps: 0, width, height, referenceWidth: width,
    originX: (256 - left) / width, originY: (height - 4) / height };
  packX += width + 4; rowHeight = Math.max(rowHeight, height);
}
const height = packY + rowHeight + 2;
await sharp({ create: { width: 1024, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(parts).webp({ quality: 93, alphaQuality: 100, effort: 6 }).toFile(resolve(destination, `${key}.webp`));
await writeFile(resolve(destination, `${key}.json`), JSON.stringify({ frames, meta: { image: `${key}.webp`, size: { w: 1024, h: height }, scale: '1' } }, null, 2) + '\n');
await writeFile(resolve(destination, 'interior-stills.json'), JSON.stringify({ version: 1, framesPerAsset: 1, assets }, null, 2) + '\n');
console.log('Packed six corrected furniture stills with floor anchors.');
