#!/usr/bin/env node
/**
 * Export the game's painted characters as independent public-site WebP sheets.
 * No generated pixels: preserve source alpha, atlas registration and identities.
 * Rebuild: node scripts/prepare-site-sprites.mjs
 *
 * Player source: prepare-character-art.mjs output from player-{walk,idle}-painted.png.
 * Residents: residents-animation-0.png via its runtime atlas (six authored poses).
 * Animals: art/source/animals/{cat,chicken}.png via runtime atlases.
 * Cast: story-cast portrait exports and main-cast-directions.png (south-facing busts).
 * Prompts remain beside those existing masters; these exports add no new masters.
 */
import sharp from 'sharp';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'site/public/images/sprites');
const assets = resolve(root, 'web/public/assets');
const maxBytes = 550 * 1024;
await mkdir(out, { recursive: true });
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const json = async path => JSON.parse(await readFile(path, 'utf8'));

async function write(image, name) {
  const path = resolve(out, `${name}.webp`);
  await image.webp({ quality: 80, alphaQuality: 100, effort: 6 }).toFile(path);
  const { size } = await stat(path);
  if (size > maxBytes) throw new Error(`${name} exceeds the unchanged 550 KiB site image budget`);
  console.log(`${name}.webp: ${(size / 1024).toFixed(1)} KiB`);
}

async function sheet(name, imagePath, frames, width, height) {
  const source = await readFile(imagePath);
  const images = [];
  for (const [index, entry] of frames.entries()) {
    if (!entry) throw new Error(`Missing authored atlas frame: ${name}:${index}`);
    if (entry.rotated) throw new Error(`Rotated atlas frame is not supported: ${name}:${index}`);
    const frame = entry.frame ?? entry;
    let image = sharp(source).extract({ left: frame.x, top: frame.y, width: frame.w, height: frame.h });
    if (entry.trimmed) {
      const pixels = await image.png().toBuffer();
      const registered = await sharp({ create: { width: entry.sourceSize.w, height: entry.sourceSize.h, channels: 4, background: transparent } })
        .composite([{ input: pixels, left: entry.spriteSourceSize.x, top: entry.spriteSourceSize.y }]).png().toBuffer();
      image = sharp(registered);
    }
    const input = await image.resize(width, height, { fit: 'contain', background: transparent }).png().toBuffer();
    images.push({ input, left: index * width, top: 0 });
  }
  await write(sharp({ create: { width: frames.length * width, height, channels: 4, background: transparent } }).composite(images), name);
}

// The last row contains four distinct idle directions, not an animation. Export
// its south-facing pose once; CSS supplies a restrained breathing movement.
await sheet('player-idle', resolve(assets, 'player-walk.webp'), [{ x: 0, y: 1152, w: 192, h: 288 }], 128, 192);
await sheet('player-walk', resolve(assets, 'player-walk.webp'), Array.from({ length: 8 }, (_, i) => ({ x: i * 192, y: 288, w: 192, h: 288 })), 128, 192);

const residentAtlas = await json(resolve(assets, 'residents-animation-0.json'));
for (const person of ['marta', 'otto']) {
  await sheet(person, resolve(assets, 'residents-animation-0.webp'), Array.from({ length: 6 }, (_, i) => residentAtlas.frames[`${person}-${i}`]), 128, 192);
  const walkAtlas = await json(resolve(assets, `character-cast/${person}.atlas.json`));
  // Character-kit direction east is row one: idle frame 9, walk frames 10–17.
  await sheet(`${person}-walk`, resolve(assets, `character-cast/${person}.webp`), Array.from({ length: 8 }, (_, i) => walkAtlas.frames[String(i + 10)]), 128, 192);
}
for (const animal of ['cat', 'chicken']) {
  const atlas = await json(resolve(assets, `animals/${animal}.json`));
  await sheet(animal, resolve(assets, `animals/${animal}.webp`), Array.from({ length: 4 }, (_, i) => atlas.frames[`0-walk-${i}`]), 128, 128);
}

for (const person of ['inspector', 'elise']) {
  await write(sharp(resolve(assets, `story-cast/${person}-portrait.webp`)).resize(256, 256), `${person}-portrait`);
}
for (const [row, person] of ['marta', 'otto'].entries()) {
  await write(sharp(resolve(assets, 'story-cast/main-directions.webp'))
    .extract({ left: 16, top: row * 384 + 22, width: 224, height: 224 })
    .resize(256, 256), `${person}-portrait`);
}
