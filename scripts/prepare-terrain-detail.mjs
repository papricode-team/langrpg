#!/usr/bin/env node
/** Export sixteen generated sections as four GPU-safe pieces and one base plate. */
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stitchTerrainGrid } from './terrain-stitch.mjs';
import { exportAuthoredWalkableMasks } from './terrain-walkable-mask.mjs';
import {WEBP_QUALITY, MIN_WEBP_QUALITY} from './webp-quality.mjs';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'art/source/terrain-detail');
const out = resolve(root, 'web/public/assets');
const args = process.argv.slice(2);
const towns = ['lindenhafen', 'waldruh', 'nebelstadt'];
for (const arg of args) if (![...towns, '--day', '--night', '--references', '--walkable-masks'].includes(arg)) throw Error(`Unknown terrain selection: ${arg}`);
if (args.includes('--day') && args.includes('--night')) throw Error('Select one period or omit both');
const selected = args.filter(arg => towns.includes(arg));
const periods = args.includes('--day') ? ['day'] : args.includes('--night') ? ['night'] : ['day', 'night'];
await mkdir(source, { recursive: true });
// Masks can be re-exported without regenerating or touching any painted terrain.
for (const town of selected.length ? selected : towns) await exportAuthoredWalkableMasks(root, town);
if (args.includes('--walkable-masks')) process.exit(0);
async function webp(painting, minimumQuality = MIN_WEBP_QUALITY) {
  const encode = async quality => ({ data: await painting.clone().webp({ quality, effort: 6 }).toBuffer(), quality });
  const maximum = await encode(WEBP_QUALITY);
  if (maximum.data.length <= 2 * 1024 * 1024) return maximum;
  let best = await encode(minimumQuality);
  if (best.data.length > 2 * 1024 * 1024) throw Error('Terrain piece exceeds the 2 MiB download budget');
  let low = minimumQuality + 1, high = WEBP_QUALITY - 1;
  while (low <= high) {
    const quality = Math.floor((low + high) / 2), candidate = await encode(quality);
    if (candidate.data.length <= 2 * 1024 * 1024) { best = candidate; low = quality + 1; }
    else high = quality - 1;
  }
  return best;
}
for (const town of selected.length ? selected : towns) for (const period of periods) {
  const original = `${town}${period === 'night' || town === 'nebelstadt' ? `-${period}` : ''}-terrain`;
  const manifest = { version: 2, generator: 'Codex built-in ImageGen', worldSize: { width: 1536, height: 1024 },
    outputSize: { width: 6144, height: 4096 }, sourceCropSize: { width: 432, height: 304 }, overlap: 64, tiles: [], runtimeTiles: [] };
  const grid = [];
  for (let row = 0; row < 4; row++) {
    const strip = [];
    for (let col = 0; col < 4; col++) {
      const name = `${town}-${period}-${row}-${col}`;
      const position = { left: col * 368, top: row * 240, width: 432, height: 304 };
      if (args.includes('--references')) {
        await sharp(resolve(root, `art/source/${original}.png`)).extract(position).png().toFile(resolve(source, `${name}-reference.png`));
        continue;
      }
      const path = resolve(source, `${name}.png`), metadata = await sharp(path).metadata();
      if (metadata.width < 1450 || metadata.height < 1000 || Math.abs(metadata.width / metadata.height - 432 / 304) > .03) throw Error(`Invalid native detail section: ${name}`);
      const data = await sharp(path).resize(1728, 1216, { fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
      strip.push({ width: 1728, height: 1216, data });
      manifest.tiles.push({ file: `${name}.png`, ...position, nativeSize: { width: metadata.width, height: metadata.height } });
    }
    grid.push(strip);
  }
  if (args.includes('--references')) continue;
  const stitched = stitchTerrainGrid(grid, 256);
  const painting = sharp(stitched.data, { raw: { width: stitched.width, height: stitched.height, channels: 3 } });
  const terrainTiles = [];
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const key = `${town}-${period}-terrain-detail-${row}-${col}`;
    // Include one shared pixel at each edge. Clamp sampling then cannot create
    // a hairline at a GPU tile boundary when the camera uses fractional zoom.
    const left = Math.max(0, col * 3072 - 1), top = Math.max(0, row * 2048 - 1);
    const width = Math.min(6144, (col + 1) * 3072 + 1) - left;
    const height = Math.min(4096, (row + 1) * 2048 + 1) - top;
    const encoded = await webp(painting.clone().extract({ left, top, width, height }));
    await writeFile(resolve(out, `${key}.webp`), encoded.data);
    const crop = { x: col * 3072 - left, y: row * 2048 - top, width: 3072, height: 2048 };
    terrainTiles.push({ key, x: col * 768, y: row * 512, width: 768, height: 512, crop });
    manifest.runtimeTiles.push({ file: `${key}.webp`, width, height, crop, quality: encoded.quality });
  }
  const base = await webp(painting.clone().resize(3072, 2048), 52);
  await writeFile(resolve(out, `${original}.webp`), base.data);
  if (town === 'nebelstadt' && period === 'day') await writeFile(resolve(out, 'nebelstadt-terrain.webp'), base.data);
  const path = resolve(out, `${town}-${period}-animations.json`);
  const animations = JSON.parse(await readFile(path, 'utf8'));
  animations.terrainTiles = terrainTiles;
  await writeFile(path, JSON.stringify(animations, null, 2) + '\n');
  await writeFile(resolve(source, `${town}-${period}.json`), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${town} ${period}: sixteen paintings → ${stitched.width}×${stitched.height}, four bounded texture pieces`);
}
