#!/usr/bin/env node
/** Crop references or stitch the selected ImageGen paintings. Does not generate art. */
import sharp from 'sharp';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { stitchTerrain } from './terrain-stitch.mjs';
import {WEBP_QUALITY, MIN_WEBP_QUALITY} from './webp-quality.mjs';

const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, 'art/source/terrain-hd');
const args = process.argv.slice(2);
const valid = new Set(['lindenhafen', 'waldruh', 'nebelstadt', '--day', '--night', '--references']);
for (const arg of args) if (!valid.has(arg)) throw Error(`Unknown terrain selection: ${arg}`);
if (args.includes('--day') && args.includes('--night')) throw Error('Select one period or omit both to export day and night');
const towns = args.filter(arg => ['lindenhafen', 'waldruh', 'nebelstadt'].includes(arg));
const periods = args.includes('--day') ? ['day'] : args.includes('--night') ? ['night'] : ['day', 'night'];
const corners = { nw: { left: 0, top: 0 }, ne: { left: 704, top: 0 }, sw: { left: 0, top: 448 }, se: { left: 704, top: 448 } };
await mkdir(directory, { recursive: true });
for (const town of towns.length ? towns : ['lindenhafen', 'waldruh', 'nebelstadt']) for (const period of periods) {
  if (!args.includes('--references')) {
    try {
      await access(resolve(root, `art/source/terrain-detail/${town}-${period}.json`));
      execFileSync(process.execPath, [resolve(root, 'scripts/prepare-terrain-detail.mjs'), town, `--${period}`], { stdio: 'inherit' });
      continue;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const name = `${town}-${period}`;
  const original = `${town}${period === 'night' || town === 'nebelstadt' ? `-${period}` : ''}-terrain`;
  const manifest = { version: 1, generator: 'Codex built-in ImageGen', original: `art/source/${original}.png`,
    worldSize: { width: 1536, height: 1024 }, outputSize: { width: 3072, height: 2048 },
    sourceCropSize: { width: 832, height: 576 }, overlap: 128,
    tiles: Object.fromEntries(Object.entries(corners).map(([corner, position]) => [corner, { ...position }])) };
  if (args.includes('--references')) {
    for (const [corner, position] of Object.entries(corners)) {
      await sharp(resolve(root, manifest.original)).extract({ ...position, ...manifest.sourceCropSize })
        .png().toFile(resolve(directory, `${name}-${corner}-reference.png`));
    }
  } else {
    const tiles = {};
    for (const corner of Object.keys(corners)) {
      const path = resolve(directory, `${name}-${corner}.png`);
      const metadata = await sharp(path).metadata();
      if (metadata.width < 1450 || metadata.height < 1000 || Math.abs(metadata.width / metadata.height - 832 / 576) > .03) {
        throw Error(`${name}/${corner}: a high-resolution, correctly framed painting is required`);
      }
      const data = await sharp(path).resize(1664, 1152, { fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
      tiles[corner] = { data, width: 1664, height: 1152 };
      manifest.tiles[corner] = { ...corners[corner], file: `${name}-${corner}.png`, nativeSize: { width: metadata.width, height: metadata.height } };
    }
    const stitched = stitchTerrain(tiles, 256);
    const runtime = sharp(stitched.data, { raw: { width: stitched.width, height: stitched.height, channels: 3 } });
    let encoded;
    for (let quality = WEBP_QUALITY; quality >= MIN_WEBP_QUALITY; quality--) {
      encoded = await runtime.clone().webp({ quality, effort: 6 }).toBuffer();
      if (encoded.length <= 2 * 1024 * 1024) { manifest.quality = quality; break; }
    }
    if (encoded.length > 2 * 1024 * 1024) throw Error(`${name}: runtime terrain exceeds the art budget`);
    await writeFile(resolve(root, `web/public/assets/${original}.webp`), encoded);
    // The story's initial Nebelstadt base uses its day plate too.
    if (town === 'nebelstadt' && period === 'day') await writeFile(resolve(root, 'web/public/assets/nebelstadt-terrain.webp'), encoded);
    await writeFile(resolve(directory, `${name}.json`), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${name}: four overlapping paintings → ${stitched.width}×${stitched.height}, ${(encoded.length / 1024).toFixed(0)} KiB`);
  }
}
