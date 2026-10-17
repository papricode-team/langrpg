#!/usr/bin/env node
/** Render each painted-ground town's card and minimap image with the game's own renderer.
 * Usage: node scripts/capture-town-previews.mjs [town...]. Needs Chrome (or Playwright's Chromium). */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { townViewPNG, closeWorldView } from './world-view.mjs';
import { WEBP_QUALITY } from './webp-quality.mjs';

const root = resolve(import.meta.dirname, '..');
const seed = JSON.parse(await readFile(resolve(root, 'content/world-seed.json'), 'utf8'));
const requested = process.argv.slice(2);
const towns = (requested.length ? requested : Object.keys(seed.maps)).filter(town => seed.maps[town]?.ground);
try {
  for (const town of towns) {
    const scene = seed.maps[town];
    // Cards stay within 1536 × 1024 like the composed previews they replace, keeping the world's aspect ratio.
    const scale = Math.min(1, 1536 / scene.width, 1024 / scene.height);
    const png = await townViewPNG(seed, town, { scale });
    const output = resolve(root, `web/public/assets/${town}-preview.webp`);
    await sharp(png).resize(Math.round(scene.width * scale), Math.round(scene.height * scale)).webp({ quality: WEBP_QUALITY, effort: 4 }).toFile(output);
    console.log(`${town}: captured preview ${Math.round(scene.width * scale)}×${Math.round(scene.height * scale)} from the seed world`);
  }
} finally {
  await closeWorldView();
}
