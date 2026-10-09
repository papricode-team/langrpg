#!/usr/bin/env node
/** Optimize ImageGen-painted time-of-day terrain without changing its geometry. */
import sharp from 'sharp';
import { access, readFile, writeFile } from 'node:fs/promises';
const maps = process.argv.slice(2);
for (const map of maps.length ? maps : ['lindenhafen', 'waldruh', 'nebelstadt']) {
  for (const period of ['day', 'night']) {
    const source = `art/source/${map}-${period}-terrain.png`;
    try { await access(source); }
    catch (error) { if (period === 'day' && error.code === 'ENOENT') continue; throw error; }
    const output = `web/public/assets/${map}-${period}-terrain.webp`;
    await sharp(source).resize(1536, 1024).webp({ quality: 90, effort: 6 }).toFile(output);
    const manifestPath = `web/public/assets/${map}-${period}-animations.json`;
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.terrain = `${map}-${period}-terrain`;
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    console.log(output);
  }
}
