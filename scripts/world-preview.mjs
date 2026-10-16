#!/usr/bin/env node
/**
 * Draws a town as a labelled plan: painted ground, blocked terrain, object
 * footprints, story characters and evidence, residents' homes and the spawn,
 * over a grid in world units. Agents use it to see what they edit.
 *
 *   node scripts/world-preview.mjs <town> <out.png> [--file .world/world.json] [--region x,y,w,h] [--no-labels]
 */
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import './register-content-loader.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const {sceneNavigationGeometry} = await import('../web/src/scene-navigation.ts');
const {parseWorldSceneDocument} = await import('../web/src/scene-schema.ts');
const {groundColorPixels} = await import('../web/src/ground.ts');
const {featureBounds, terrainFeature} = await import('../web/src/terrain-features.ts');

const xml = value => String(value).replace(/[&<>"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[char]);
const path = polygon => `M${polygon.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;

/** The painted ground as a PNG data URL, one pixel per ground sample. */
async function groundImage(scene) {
  const {columns, rows, pixels} = groundColorPixels(scene.ground, scene.width, scene.height);
  const png = await sharp(Buffer.from(pixels), {raw: {width: columns, height: rows, channels: 4}}).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** SVG of one town. `region` crops to {x, y, width, height} in world units. */
export async function scenePreviewSVG(scene, {region, labels = true, maxSize = 1600} = {}) {
  const view = region ?? {x: 0, y: 0, width: scene.width, height: scene.height};
  const scale = Math.min(maxSize / view.width, maxSize / view.height, 4);
  const unit = 1 / scale, font = 11 * unit, parts = [];
  const cell = scene.ground.cell;
  parts.push(`<image href="${await groundImage(scene)}" x="${-cell / 2}" y="${-cell / 2}" width="${scene.width + cell}" height="${scene.height + cell}" preserveAspectRatio="none"/>`);
  for (const feature of scene.ground.features ?? []) {
    const bounds = featureBounds(feature);
    parts.push(`<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#d9c9a3" fill-opacity=".35" stroke="#7a6845" stroke-width="${unit}"/>`);
    if (labels) parts.push(`<text x="${bounds.x + 4 * unit}" y="${bounds.y + 12 * unit}" font-size="${font}" fill="#3a2d16">${xml(terrainFeature(feature.asset)?.name ?? feature.asset)}</text>`);
  }
  const geometry = sceneNavigationGeometry(scene);
  for (const polygon of geometry.terrain) parts.push(`<path d="${path(polygon)}" fill="none" stroke="#9fd2ff" stroke-opacity=".7" stroke-width="${unit}"/>`);
  for (const district of scene.districts ?? []) {
    parts.push(`<path d="${path(district.polygon)}" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-dasharray="${8 * unit}" stroke-width="${1.5 * unit}"/>`);
    if (labels) parts.push(`<text x="${district.polygon[0][0] + 6 * unit}" y="${district.polygon[0][1] + 16 * unit}" font-size="${font * 1.3}" fill="#fff" font-weight="700">${xml(district.label)}</text>`);
  }
  const step = view.width > 1200 ? 256 : 64;
  for (let x = 0; x <= scene.width; x += step) parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${scene.height}" stroke="#000" stroke-opacity=".15" stroke-width="${unit}"/><text x="${x + 3 * unit}" y="${view.y + font}" font-size="${font}" fill="#000" fill-opacity=".6">${x}</text>`);
  for (let y = 0; y <= scene.height; y += step) parts.push(`<line x1="0" y1="${y}" x2="${scene.width}" y2="${y}" stroke="#000" stroke-opacity=".15" stroke-width="${unit}"/><text x="${view.x + 3 * unit}" y="${y - 3 * unit}" font-size="${font}" fill="#000" fill-opacity=".6">${y}</text>`);
  for (const polygon of geometry.objects) parts.push(`<path d="${path(polygon)}" fill="#5a3b24" fill-opacity=".75" stroke="#2b1a0e" stroke-width="${unit}"/>`);
  for (const item of scene.scenery) {
    parts.push(`<circle cx="${item.x}" cy="${item.y}" r="${2.5 * unit}" fill="#f5ead2" stroke="#2b1a0e" stroke-width="${unit}"/>`);
    if (labels) parts.push(`<text x="${item.x + 4 * unit}" y="${item.y - 3 * unit}" font-size="${font * .85}" fill="#1b130a" paint-order="stroke" stroke="#f5ead2" stroke-width="${2.5 * unit}">${xml(item.id)}</text>`);
  }
  const marker = (x, y, color, label, shape = 'circle') => {
    parts.push(shape === 'square' ? `<rect x="${x - 5 * unit}" y="${y - 5 * unit}" width="${10 * unit}" height="${10 * unit}" fill="${color}" stroke="#000" stroke-width="${unit}"/>`
      : `<circle cx="${x}" cy="${y}" r="${6 * unit}" fill="${color}" stroke="#000" stroke-width="${unit}"/>`);
    if (labels) parts.push(`<text x="${x + 8 * unit}" y="${y + 4 * unit}" font-size="${font}" font-weight="700" fill="${color}" paint-order="stroke" stroke="#000" stroke-width="${2.5 * unit}">${xml(label)}</text>`);
  };
  for (const npc of scene.npcs) marker(npc.x, npc.y, '#ff5a4f', npc.id);
  for (const object of scene.objects) marker(object.x, object.y, '#ffb238', object.id, 'square');
  for (const resident of scene.residents ?? []) marker(resident.home.x, resident.home.y, '#c58cff', `${resident.name} (home)`);
  marker(scene.spawn.x, scene.spawn.y, '#5df07a', 'spawn');
  const width = Math.round(view.width * scale), height = Math.round(view.height * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${view.x} ${view.y} ${view.width} ${view.height}" font-family="Helvetica, Arial, sans-serif">${parts.join('')}</svg>`;
}

export async function scenePreviewPNG(scene, options) {
  return sharp(Buffer.from(await scenePreviewSVG(scene, options))).png().toBuffer();
}

export function parseRegion(value) {
  if (!value) return undefined;
  const [x, y, width, height] = value.split(',').map(Number);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error('A region is x,y,width,height in world units.');
  return {x, y, width, height};
}

async function main() {
  const [town, out, ...args] = process.argv.slice(2);
  if (!town || !out) throw new Error('Usage: node scripts/world-preview.mjs <town> <out.png> [--file .world/world.json] [--region x,y,w,h] [--no-labels]');
  const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const raw = JSON.parse(await readFile(resolve(option('--file') ?? resolve(root, 'content/world-seed.json')), 'utf8'));
  const document = parseWorldSceneDocument(raw.format ? raw.document : raw);
  const scene = document.maps[town];
  if (!scene) throw new Error(`There is no town called ${town}. Towns: ${Object.keys(document.maps).join(', ')}.`);
  await writeFile(out, await scenePreviewPNG(scene, {region: parseRegion(option('--region')), labels: !args.includes('--no-labels')}));
  console.log(`Wrote ${out}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
