#!/usr/bin/env node
/** Pack authored interior pixels without replacing alpha or shifting individual frames. */
import sharp from 'sharp';
import { access, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const sourceDir = resolve(root, 'art/source/interiors');
const assetDir = resolve(root, 'web/public/assets');
const sheets = {
  'interior-cafe-objects': ['espresso', 'grinder', 'kettle', 'cup', 'pastry-case', 'cafe-table'],
  'interior-bakery-objects': ['oven', 'mixer', 'bread-rack', 'pastry-tray', 'dough-bench', 'bakery-counter'],
  'interior-supermarket-objects': ['produce', 'grocery-shelf', 'refrigerator', 'checkout', 'basket', 'scales'],
  'interior-decor': ['plant', 'pendulum-clock', 'candle', 'aquarium', 'bookshelf', 'coat-stand'],
  'interior-furniture': ['coffee-bar', 'prep-bench', 'banquette', 'pantry', 'sink', 'menu-board'],
};
// ImageGen keeps the columns regular, but its object rows occupy unequal bands.
// These boundaries follow transparent valleys inspected across all four poses.
const rowStarts = {
  'interior-cafe-objects': [0, 255, 509, 764, 992, 1240, 1536],
  'interior-bakery-objects': [0, 270, 500, 775, 1023, 1258, 1536],
  'interior-supermarket-objects': [0, 234, 458, 725, 953, 1202, 1536],
  'interior-decor': [0, 205, 463, 690, 929, 1214, 1536],
  'interior-furniture': [0, 245, 470, 697, 965, 1197, 1536],
};
const manifest = { version: 1, framesPerAsset: 4, assets: {} };
await mkdir(assetDir, { recursive: true });
for (const [key, names] of Object.entries(sheets)) {
  const source = resolve(sourceDir, `${key}.png`);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 1024 || info.height !== 1536) throw Error(`${key}: expected a 1024 × 1536 sheet`);
  const frames = {}, parts = [];
  let packX = 2, packY = 2, rowHeight = 0;
  for (let row = 0; row < names.length; row++) {
    const rowStart = rowStarts[key][row], rowEnd = rowStarts[key][row + 1];
    const cellHeight = rowEnd - rowStart;
    let left = 255, top = cellHeight - 1, right = 0, bottom = 0;
    const clear = [0, 0, 0, 0];
    for (let col = 0; col < 4; col++) {
      for (let y = 0; y < cellHeight; y++) for (let x = 0; x < 256; x++) {
        const alpha = data[((rowStart + y) * info.width + col * 256 + x) * 4 + 3];
        if (alpha === 0) clear[col]++;
        if (alpha > 32) {
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
    }
    if (clear.some(count => count < 256 * cellHeight * .02)) throw Error(`${key}/${names[row]}: native transparency required`);
    left = Math.max(0, left - 3); top = Math.max(0, top - 3);
    right = Math.min(255, right + 3); bottom = Math.min(cellHeight - 1, bottom + 3);
    const width = right - left + 1, height = bottom - top + 1;
    const cycle = [];
    for (let col = 0; col < 4; col++) {
      if (packX + width + 2 > 1024) { packX = 2; packY += rowHeight + 4; rowHeight = 0; }
      const name = `${names[row]}-${col}`;
      const input = await sharp(source).extract({ left: col * 256 + left, top: rowStart + top, width, height }).png().toBuffer();
      parts.push({ input, left: packX, top: packY });
      frames[name] = { frame: { x: packX, y: packY, w: width, h: height }, rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: width, h: height }, sourceSize: { w: width, h: height } };
      cycle.push(name); packX += width + 4; rowHeight = Math.max(rowHeight, height);
    }
    manifest.assets[names[row]] = { key, frames: cycle, fps: names[row] === 'aquarium' ? 2 : 2.5,
      width, height, referenceWidth: width, originX: (128 - left) / width, originY: (bottom - top - 2) / height };
  }
  const height = packY + rowHeight + 2;
  await sharp({ create: { width: 1024, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(parts).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(resolve(assetDir, `${key}.webp`));
  await writeFile(resolve(assetDir, `${key}.json`), JSON.stringify({ frames, meta: { image: `${key}.webp`, size: { w: 1024, h: height }, scale: '1' } }, null, 2) + '\n');
  console.log(`${key}: ${names.length} objects × 4 frames, 1024 × ${height}`);
}
await writeFile(resolve(assetDir, 'interior-animations.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const id of ['cafe', 'bakery', 'supermarket']) {
  const source = resolve(sourceDir, `interior-${id}-room-v2.png`);
  await access(source);
  const metadata = await sharp(source).metadata();
  if (metadata.width !== 1536 || metadata.height !== 1024) throw Error(`${id}: unexpected room dimensions`);
  await sharp(source).webp({ quality: 91, effort: 6 }).toFile(resolve(assetDir, `interior-${id}-room.webp`));
}
console.log('Three distinct room paintings and 120 authored animation frames exported.');
