#!/usr/bin/env node
/** Build painted character atlases using only rectangular crops, resizing and compositing.
 * Alpha is measured to locate figures, but never replaced, masked or thresholded in output.
 */
import sharp from 'sharp';
import { readFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flags = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index];
  if (!['--npc-source', '--player-source', '--idle-source'].includes(flag) || !process.argv[index + 1]) {
    throw new Error('Usage: node scripts/prepare-character-art.mjs [--npc-source path] [--player-source path] [--idle-source path]');
  }
  flags.set(flag, resolve(process.cwd(), process.argv[index + 1]));
}
const specs = [
  { name: 'NPC', source: flags.get('--npc-source') ?? resolve(root, 'art/source/characters-painted.png'), output: 'characters.webp', columns: 4, rows: 2, cellWidth: 256, cellHeight: 384, bodyHeight: 338 },
  { name: 'Player', source: flags.get('--player-source') ?? resolve(root, 'art/source/player-walk-painted.png'), output: 'player-walk.webp', columns: 8, rows: 4, cellWidth: 192, cellHeight: 288, bodyHeight: 246, idleSource: flags.get('--idle-source') ?? resolve(root, 'art/source/player-idle-painted.png') },
];
const alphaThreshold = 32; // Geometry only. Original pixel alpha is retained in every crop.
const padding = 4;
const footBaseline = 0.9;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function alphaAt(image, x, y) {
  return image.data[(y * image.width + x) * image.channels + image.channels - 1];
}

// Generated sheets are near a regular grid. Find the least opaque line around the
// intended divider so a leaning arm or walking boot stays with its own figure.
// This changes rectangular crop geometry; it does not alter source pixels.
function divider(image, axis, expected, radius, start, end) {
  const length = axis === 'x' ? image.width : image.height;
  let best = Math.round(expected);
  let bestScore = Infinity;
  let visibleAtBest = 0;
  for (let candidate = Math.max(1, Math.round(expected - radius)); candidate <= Math.min(length - 1, Math.round(expected + radius)); candidate++) {
    let opacity = 0;
    let visible = 0;
    for (let position = start; position < end; position++) {
      const alpha = axis === 'x' ? alphaAt(image, candidate, position) : alphaAt(image, position, candidate);
      opacity += alpha;
      if (alpha >= alphaThreshold) visible++;
    }
    const score = opacity + Math.abs(candidate - expected) * 0.001;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
      visibleAtBest = visible;
    }
  }
  if (visibleAtBest > 0) {
    console.warn(`  WARNING: ${axis} divider ${best} crosses ${visibleAtBest} opaque pixels; inspect this source for overlapping figures.`);
  }
  return best;
}

function figureBounds(image, left, top, right, bottom) {
  let minX = right;
  let minY = bottom;
  let maxX = left - 1;
  let maxY = top - 1;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (alphaAt(image, x, y) < alphaThreshold) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX) throw new Error(`Empty character cell at ${left},${top}`);
  return { minX, minY, maxX, maxY, height: maxY - minY + 1 };
}

function headCenter(image, bounds) {
  // The upper 16% contains the head, above the arms that skew a whole-body box.
  const end = Math.min(bounds.maxY + 1, bounds.minY + Math.max(12, Math.round(bounds.height * 0.16)));
  let weightedX = 0;
  let weight = 0;
  for (let y = bounds.minY; y < end; y++) for (let x = bounds.minX; x <= bounds.maxX; x++) {
    const alpha = alphaAt(image, x, y);
    if (alpha < alphaThreshold) continue;
    weightedX += (x + 0.5) * alpha;
    weight += alpha;
  }
  return weightedX / weight;
}

async function prepareSheet(spec) {
  console.log(`${spec.name}: ${spec.source}`);
  const source = await readFile(spec.source); // One immutable source snapshot per run.
  const metadata = await sharp(source).metadata();
  if (!metadata.hasAlpha) throw new Error(`${spec.name} source must have genuine transparent alpha.`);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const image = { data, width: info.width, height: info.height, channels: info.channels };
  let transparentPixels = 0;
  for (let offset = info.channels - 1; offset < data.length; offset += info.channels) if (data[offset] === 0) transparentPixels++;
  if (!transparentPixels) throw new Error(`${spec.name} source has no fully transparent pixels; refusing an opaque/checkerboard sheet.`);

  const rowBoundaries = [0];
  for (let row = 1; row < spec.rows; row++) {
    rowBoundaries.push(divider(image, 'y', info.height * row / spec.rows, info.height / spec.rows * 0.08, 0, info.width));
  }
  rowBoundaries.push(info.height);
  const composites = [];
  const report = [];
  for (let row = 0; row < spec.rows; row++) {
    const top = rowBoundaries[row];
    const bottom = rowBoundaries[row + 1];
    // First locate heads inside the nominal columns. Heads fit even where stride
    // silhouettes extend across the old divider. Then divide between those heads.
    const heads = [];
    for (let column = 0; column < spec.columns; column++) {
      const bounds = figureBounds(image, Math.round(info.width * column / spec.columns), top, Math.round(info.width * (column + 1) / spec.columns), bottom);
      heads.push(headCenter(image, bounds));
    }
    const columns = [0];
    for (let column = 1; column < spec.columns; column++) {
      columns.push(divider(image, 'x', (heads[column - 1] + heads[column]) / 2, info.width / spec.columns * 0.2, top, bottom));
    }
    columns.push(info.width);
    const figures = [];
    for (let column = 0; column < spec.columns; column++) {
      const left = columns[column];
      const right = columns[column + 1];
      const bounds = figureBounds(image, left, top, right, bottom);
      const centerX = headCenter(image, bounds);
      const crop = {
        left: Math.max(left, bounds.minX - padding),
        top: Math.max(top, bounds.minY - padding),
        width: Math.min(right, bounds.maxX + padding + 1) - Math.max(left, bounds.minX - padding),
        height: Math.min(bottom, bounds.maxY + padding + 1) - Math.max(top, bounds.minY - padding),
      };
      if (bounds.minX === left || bounds.maxX === right - 1 || bounds.minY === top || bounds.maxY === bottom - 1) {
        console.warn(`  WARNING: row ${row + 1}, column ${column + 1} touches a source edge; no neighboring pixels were borrowed.`);
      }
      figures.push({ bounds, centerX, crop });
    }
    const medianHeight = median(figures.map(figure => figure.bounds.height));
    const desiredScale = spec.bodyHeight / medianHeight;
    const maximumSide = Math.max(...figures.flatMap(figure => [figure.centerX - figure.crop.left, figure.crop.left + figure.crop.width - figure.centerX]));
    // A wide stride can need a little more horizontal room. Reduce the entire
    // row uniformly rather than moving its head pivot or shrinking one frame.
    const scale = Math.min(desiredScale, (spec.cellWidth / 2 - 2) / maximumSide);
    const normalizedHeight = medianHeight * scale;
    const headTop = spec.cellHeight * footBaseline - normalizedHeight;
    if (scale < desiredScale) console.log(`  Row ${row + 1}: width-limited common scale; median body ${normalizedHeight.toFixed(1)}px (target ${spec.bodyHeight}px).`);
    for (let column = 0; column < figures.length; column++) {
      const { bounds, centerX, crop } = figures[column];
      const width = Math.round(crop.width * scale);
      const height = Math.round(crop.height * scale);
      const left = Math.round(spec.cellWidth / 2 - (centerX - crop.left) * scale);
      const topOffset = Math.round(headTop - (bounds.minY - crop.top) * scale);
      if (left < 0 || topOffset < 0 || left + width > spec.cellWidth || topOffset + height > spec.cellHeight) {
        throw new Error(`${spec.name} row ${row + 1}, column ${column + 1} does not fit its target cell: ${JSON.stringify({ crop, centerX, scale, left, topOffset, width, height, bounds, columns })}. Adjust the source spacing rather than clipping painted art.`);
      }
      const input = await sharp(source).extract(crop).resize(width, height, { kernel: sharp.kernel.lanczos3 }).png().toBuffer();
      composites.push({ input, left: column * spec.cellWidth + left, top: row * spec.cellHeight + topOffset });
    }
    report.push({ row: row + 1, sourceY: [top, bottom], sourceX: columns, scale: +scale.toFixed(4), headTop: +headTop.toFixed(1), bodyHeightRange: [Math.min(...figures.map(figure => figure.bounds.height * scale)), Math.max(...figures.map(figure => figure.bounds.height * scale))].map(value => +value.toFixed(1)) });
  }
  return { composites, report };
}

async function buildAtlas(spec) {
  const { composites, report } = await prepareSheet(spec);
  let outputRows = spec.rows;
  let idleReport;
  if (spec.idleSource) {
    const idle = await prepareSheet({ ...spec, name: 'Player idle', source: spec.idleSource, columns: 2, rows: 2 });
    // Flatten S/E/N/W from the 2x2 source into row five, first four cells.
    // Keep all 32 walking cells exactly where they were; cells 36-39 stay empty.
    for (const frame of idle.composites) {
      const sourceRow = Math.floor(frame.top / spec.cellHeight);
      const sourceColumn = Math.floor(frame.left / spec.cellWidth);
      composites.push({
        input: frame.input,
        left: (sourceRow * 2 + sourceColumn) * spec.cellWidth + frame.left % spec.cellWidth,
        top: spec.rows * spec.cellHeight + frame.top % spec.cellHeight,
      });
    }
    outputRows++;
    idleReport = { source: spec.idleSource, frames: [32, 33, 34, 35], directions: ['down', 'right', 'up', 'left'], rows: idle.report };
  }
  const outputDirectory = resolve(root, 'web/public/assets');
  await mkdir(outputDirectory, { recursive: true });
  const destination = resolve(outputDirectory, spec.output);
  const temporary = `${destination}.tmp`;
  await sharp({ create: { width: spec.columns * spec.cellWidth, height: outputRows * spec.cellHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(temporary);
  await rename(temporary, destination);
  console.log(JSON.stringify({ output: destination, dimensions: [spec.columns * spec.cellWidth, outputRows * spec.cellHeight], cell: [spec.cellWidth, spec.cellHeight], footAnchor: [0.5, footBaseline], targetBodyHeight: spec.bodyHeight, bytes: (await stat(destination)).size, rows: report, idle: idleReport }, null, 2));
}

for (const spec of specs) await buildAtlas(spec);
