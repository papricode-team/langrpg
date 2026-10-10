#!/usr/bin/env node
/** Rectangular export of ImageGen-authored transparent assets. Source alpha stays intact. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roles = ['archive','cafe','station','workshop','house','tree','cypress','lamp','stall','fountain','arch','greenhouse','boat','bench','planter','sign'];
const regions = process.argv.slice(2);
for (const map of regions.length ? regions : ['lindenhafen','waldruh','nebelstadt']) {
  if (!['lindenhafen','waldruh','nebelstadt'].includes(map)) throw new Error(`Unknown region ${map}`);
  const source = await readFile(resolve(root, `art/source/${map}-props.png`));
  const meta = await sharp(source).metadata();
  if (!meta.hasAlpha) throw new Error(`${map}: transparent source required`);
  const boxes = JSON.parse(await readFile(resolve(root, `art/source/${map}-props-crops.json`), 'utf8'));
  const frames = {}, images = [];
  let x = 2, y = 2, rowHeight = 0;
  for (const role of roles) {
    const box = boxes[role];
    if (!box || box.left < 0 || box.top < 0 || box.left + box.width > meta.width || box.top + box.height > meta.height) throw new Error(`${map}: invalid ${role} crop`);
    // Size is proportional; each instance specifies its physical displayed width.
    const scale = Math.min(1, 360 / Math.max(box.width, box.height));
    const width = Math.round(box.width * scale), height = Math.round(box.height * scale);
    const pixels = await sharp(source).extract(box).resize(width, height).ensureAlpha().raw().toBuffer();
    let transparent = 0, opaque = 0;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] === 0) transparent++;
      if (pixels[offset] > 128) opaque++;
    }
    if (transparent < width * height * .03 || opaque < 10) throw new Error(`${map}: ${role} is not isolated transparent artwork`);
    if (x + width + 2 > 1024) { x = 2; y += rowHeight + 4; rowHeight = 0; }
    frames[role] = { frame: { x, y, w: width, h: height }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: width, h: height }, sourceSize: { w: width, h: height } };
    images.push({ input: await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer(), left: x, top: y });
    x += width + 4; rowHeight = Math.max(rowHeight, height);
  }
  const height = y + rowHeight + 2;
  if (height > 2048) throw new Error(`${map}: atlas exceeds 1024×2048`);
  const out = resolve(root, 'web/public/assets');
  await mkdir(out, { recursive: true });
  await sharp({ create: { width: 1024, height, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
    .composite(images).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(resolve(out, `${map}-props.webp`));
  await writeFile(resolve(out, `${map}-props.json`), JSON.stringify({ frames, meta: { image: `${map}-props.webp`, size: { w:1024,h:height }, scale:'1' } }, null, 2) + '\n');
  console.log(`${map}: 16 isolated frames → 1024×${height} atlas`);
}

// UI previews use the runtime stills and their actual foot pivots.
execFileSync(process.execPath, ['scripts/prepare-scenery-previews.mjs', ...regions], {stdio:'inherit'});
