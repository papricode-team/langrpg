#!/usr/bin/env node
/** Pack distinct ImageGen-authored objects using exact rectangular crops and original alpha. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const regionIds = ['lindenhafen', 'waldruh', 'nebelstadt'];
const frameNames = [
  'house-1', 'house-2', 'house-3', 'house-4',
  'tree-1', 'tree-2', 'tree-3', 'tree-4',
  'stall-1', 'stall-2', 'stall-3', 'stall-4',
  'planter-1', 'planter-2', 'garden-1', 'garden-2',
];
const requested = process.argv.slice(2);
for (const region of requested.length ? requested : regionIds) {
  if (!regionIds.includes(region)) throw new Error(`Unknown region ${region}`);
  const source = await readFile(resolve(root, `art/source/${region}-variations.png`));
  const sourceMeta = await sharp(source).metadata();
  if (!sourceMeta.hasAlpha) throw new Error(`${region}: transparent source required`);
  const crops = JSON.parse(await readFile(resolve(root, `art/source/${region}-variations-crops.json`), 'utf8'));
  const frames = {};
  const images = [];
  let x = 2, y = 2, rowHeight = 0;
  for (const name of frameNames) {
    const box = crops[name];
    if (!box || box.left < 0 || box.top < 0 || box.width < 1 || box.height < 1
      || box.left + box.width > sourceMeta.width || box.top + box.height > sourceMeta.height) {
      throw new Error(`${region}: invalid ${name} crop`);
    }
    const scale = Math.min(1, 360 / Math.max(box.width, box.height));
    const width = Math.round(box.width * scale), height = Math.round(box.height * scale);
    const pixels = await sharp(source).extract(box).resize(width, height).ensureAlpha().raw().toBuffer();
    let transparent = 0, opaque = 0;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] === 0) transparent++;
      if (pixels[offset] > 128) opaque++;
    }
    if (transparent < width * height * .03 || opaque < 10) throw new Error(`${region}: ${name} is not isolated transparent artwork`);
    if (x + width + 2 > 1024) { x = 2; y += rowHeight + 4; rowHeight = 0; }
    frames[name] = {
      frame: { x, y, w: width, h: height }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: width, h: height }, sourceSize: { w: width, h: height },
    };
    images.push({ input: await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer(), left: x, top: y });
    x += width + 4; rowHeight = Math.max(rowHeight, height);
  }
  const height = y + rowHeight + 2;
  if (height > 2048) throw new Error(`${region}: atlas exceeds 1024×2048`);
  const out = resolve(root, 'web/public/assets');
  await mkdir(out, { recursive: true });
  await sharp({ create: { width: 1024, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(images).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(resolve(out, `${region}-variations.webp`));
  await writeFile(resolve(out, `${region}-variations.json`), JSON.stringify({
    frames, meta: { image: `${region}-variations.webp`, size: { w: 1024, h: height }, scale: '1' },
  }, null, 2) + '\n');
  console.log(`${region}: 16 distinct frames → 1024×${height} atlas`);
}
