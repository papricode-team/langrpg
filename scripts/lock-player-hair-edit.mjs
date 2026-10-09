#!/usr/bin/env node
/** Apply the keyed paint from an ImageGen edit while locking the original art. */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const input = process.argv[2], output = process.argv[3];
if (!input || !output) throw new Error('Usage: node scripts/lock-player-hair-edit.mjs <candidate.png> <hair-id.png>');
const load = async path => sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const base = await load(resolve(root, 'art/source/player-edits/base.png'));
const edit = await load(resolve(input));
if (edit.info.width !== base.info.width || edit.info.height !== base.info.height) throw new Error('Edit dimensions must match the base exactly');
const manifest = JSON.parse(await readFile(resolve(root, 'web/public/assets/player-layers/manifest.json'), 'utf8'));
const locked = Buffer.from(base.data), W = base.info.width;
let kept = 0;
for (const frame of manifest.frames) {
  const { scale, offset, sourceCell } = frame.transform, h = frame.headBounds;
  const headWidth = h.right - h.left;
  const a = { x: sourceCell.left + (h.left - headWidth * 1.15 - offset.x) / scale, y: sourceCell.top + (h.top - headWidth * .75 - offset.y) / scale };
  const b = { x: sourceCell.left + (h.right + headWidth * 1.15 - offset.x) / scale, y: sourceCell.top + (frame.neck.y + headWidth * 2.4 - offset.y) / scale };
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = (b.x - a.x) / 2, ry = (b.y - a.y) / 2;
  for (let y = Math.max(sourceCell.top, Math.floor(a.y)); y < Math.min(sourceCell.top + sourceCell.height, Math.ceil(b.y)); y++) {
    for (let x = Math.max(sourceCell.left, Math.floor(a.x)); x < Math.min(sourceCell.left + sourceCell.width, Math.ceil(b.x)); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1.15) continue;
      const p = (y * W + x) * 4, [r, g, blue, alpha] = edit.data.subarray(p, p + 4);
      const max = Math.max(r, g, blue), min = Math.min(r, g, blue), chroma = max - min;
      const hue = chroma ? ((max === r ? (g - blue) / chroma : max === g ? 2 + (blue - r) / chroma : 4 + (r - g) / chroma) * 60 + 360) % 360 : 0;
      // Only the new violet paint is eligible. Repainted faces, garments and
      // background alpha from the generative edit never enter the final sheet.
      if (!alpha || hue < 245 || hue > 345 || chroma <= 7 || blue < g * 1.04) continue;
      edit.data.copy(locked, p, p, p + 4); kept++;
    }
  }
}
if (!kept) throw new Error('No keyed hair paint found');
await sharp(locked, { raw: { width: W, height: base.info.height, channels: 4 } }).png().toFile(resolve(output));
console.log(JSON.stringify({ input, output, keyedPixels: kept, locked: 'All other source RGBA pixels preserved exactly' }));
