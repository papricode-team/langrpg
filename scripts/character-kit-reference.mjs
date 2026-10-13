/** Assemble a versioned painting reference from registered editor-size sheets.
 * This imports complete frames, never articulates or transforms a limb. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { over } from '../web/src/character-compositor.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const W = 128, H = 192, COLS = 9, ROWS = 4;

/** Inverse of the shared full-frame affine registration, using premultiplied
 * bilinear sampling. Transparent neighbour cells never contribute. */
export function toNative(atlas, manifest, width, height) {
  if (atlas.length !== W * COLS * H * ROWS * 4 || manifest.frames.length !== 36) throw new Error('Expected a 36-frame editor atlas');
  const output = Buffer.alloc(width * height * 4);
  for (const [index, frame] of manifest.frames.entries()) {
    const { scale, offset, sourceCell: cell } = frame.transform;
    for (let y = 0; y < cell.height; y++) for (let x = 0; x < cell.width; x++) {
      const sx = x * scale + offset.x, sy = y * scale + offset.y, x0 = Math.floor(sx), y0 = Math.floor(sy);
      let alpha = 0; const rgb = [0, 0, 0];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const nx = x0 + dx, ny = y0 + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const p = ((Math.floor(index / COLS) * H + ny) * W * COLS + index % COLS * W + nx) * 4;
        const weight = (dx ? sx - x0 : 1 - sx + x0) * (dy ? sy - y0 : 1 - sy + y0), contribution = atlas[p + 3] * weight;
        alpha += contribution;
        for (let channel = 0; channel < 3; channel++) rgb[channel] += atlas[p + channel] * contribution;
      }
      const p = ((cell.top + y) * width + cell.left + x) * 4;
      if (!Math.round(alpha)) continue;
      for (let channel = 0; channel < 3; channel++) output[p + channel] = Math.round(rgb[channel] / alpha);
      output[p + 3] = Math.round(alpha);
    }
  }
  return output;
}

/** Keep the original whole-frame transform where it fits; expand/translate
 * that same transform only when the imported painted outline needs more room. */
export function fitReferenceFrames(atlas, registration) {
  const manifest = structuredClone(registration), adjustments = [];
  for (const [index, frame] of manifest.frames.entries()) {
    let left = W, right = -1, top = H, bottom = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = ((Math.floor(index / COLS) * H + y) * W * COLS + index % COLS * W + x) * 4;
      if (atlas[p + 3] <= 16) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) throw new Error(`Reference frame ${index} is empty`);
    const before = structuredClone(frame.transform), cell = before.sourceCell;
    const scale = Math.max(before.scale, (right - left + 2) / (cell.width - 2), (bottom - top + 2) / (cell.height - 2));
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const offset = { x: clamp(before.offset.x, right + 1 - (cell.width - 1) * scale, left - 1), y: clamp(before.offset.y, bottom + 1 - (cell.height - 1) * scale, top - 1) };
    frame.transform = { ...before, scale, offset };
    if (scale !== before.scale || offset.x !== before.offset.x || offset.y !== before.offset.y) adjustments.push({ index, before, after: structuredClone(frame.transform) });
  }
  return { manifest, adjustments };
}

export async function makeReference(specPath, out, root) {
  const specBytes = await readFile(resolve(root, specPath)), spec = JSON.parse(specBytes);
  if (!Array.isArray(spec.layers) || !spec.layers.length) throw new Error('Reference needs ordered source layers');
  const registrationBytes = await readFile(resolve(root, spec.registration)), registration = JSON.parse(registrationBytes);
  const { validateGrid } = await import('./character-kit.mjs');
  const width = 1536, height = 1024;
  validateGrid(registration, { width, height });
  const atlas = new Uint8ClampedArray(W * COLS * H * ROWS * 4), sources = [];
  for (const layer of spec.layers) {
    const bytes = await readFile(resolve(root, layer.path));
    if (hash(bytes) !== layer.sha256) throw new Error(`Changed reference source: ${layer.path}`);
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== W * COLS || info.height !== H * ROWS) throw new Error(`Reference source is not an editor atlas: ${layer.path}`);
    if (layer.tint !== undefined && !/^#[0-9a-f]{6}$/i.test(layer.tint)) throw new Error(`Invalid reference tint: ${layer.tint}`);
    if (layer.tint) {
      const color = Number.parseInt(layer.tint.slice(1), 16);
      for (let p = 0; p < data.length; p += 4) for (let channel = 0; channel < 3; channel++) data[p + channel] = Math.round(data[p + channel] * ((color >> ((2 - channel) * 8)) & 255) / 255);
    }
    over(atlas, data); sources.push(layer);
  }
  const { manifest, adjustments } = fitReferenceFrames(atlas, registration);
  const data = toNative(atlas, manifest, width, height);
  const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const path = resolve(root, out), source = relative(root, path);
  const provenance = { spec: specPath, specSha256: hash(specBytes), registration: spec.registration, registrationSha256: hash(registrationBytes), sources, adjustments, sourceSha256: hash(png), note: 'Painting reference imported through one whole-frame affine transform. No per-limb transforms. This is not an approved component.' };
  const outputManifest = { version: 1, cell: [W, H], columns: COLS, rows: ROWS, source, sourceSha256: hash(png),
    registration: 'One shared isotropic transform per complete frame; imported registered editor sheets.',
    frames: manifest.frames, reference: provenance };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, png);
  await writeFile(`${path}.json`, JSON.stringify(provenance, null, 2) + '\n');
  await writeFile(path.replace(/\.png$/, '.registration.json'), JSON.stringify(outputManifest, null, 2) + '\n');
  await sharp(png).flatten({ background: '#fafafa' }).png().toFile(path.replace(/\.png$/, '.visible.png'));
  return { path, adjustments: adjustments.map(({ index }) => index), sourceSha256: hash(png) };
}

export async function main(args, root) {
  const i = args.indexOf('--out');
  if (!args[0] || i < 0 || !args[i + 1]?.endsWith('.png')) throw new Error('Usage: reference <layers.json> --out <reference.png>');
  console.log(JSON.stringify(await makeReference(args[0], args[i + 1], root)));
}

/** Re-register an existing candidate as complete frames when the shared source
 * registration changes. Its raw generated PNG remains untouched. */
export function reprojectPixels(image, source, target) {
  const output = Buffer.alloc(image.data.length), width = image.info.width;
  for (const [index, frame] of target.frames.entries()) {
    const to = frame.transform, from = source.frames[index].transform, c = to.sourceCell, input = from.sourceCell;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const sx = (x * to.scale + to.offset.x - from.offset.x) / from.scale;
      const sy = (y * to.scale + to.offset.y - from.offset.y) / from.scale;
      const x0 = Math.floor(sx), y0 = Math.floor(sy); let alpha = 0; const rgb = [0, 0, 0];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const nx = x0 + dx, ny = y0 + dy;
        if (nx < 0 || ny < 0 || nx >= input.width || ny >= input.height) continue;
        const p = ((input.top + ny) * width + input.left + nx) * 4;
        const weight = (dx ? sx - x0 : 1 - sx + x0) * (dy ? sy - y0 : 1 - sy + y0);
        const contribution = image.data[p + 3] * weight; alpha += contribution;
        for (let channel = 0; channel < 3; channel++) rgb[channel] += image.data[p + channel] * contribution;
      }
      if (!Math.round(alpha)) continue;
      const p = ((c.top + y) * width + c.left + x) * 4;
      for (let channel = 0; channel < 3; channel++) output[p + channel] = Math.round(rgb[channel] / alpha);
      output[p + 3] = Math.round(alpha);
    }
  }
  return output;
}

export async function reprojectCandidate(input, from, to, out, root) {
  const paths = [input, from, to], bytes = await Promise.all(paths.map(path => readFile(resolve(root, path))));
  const image = await sharp(bytes[0]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const source = JSON.parse(bytes[1]), target = JSON.parse(bytes[2]);
  const { validateGrid } = await import('./character-kit.mjs');
  if (image.info.width !== 1536 || image.info.height !== 1024) throw new Error('Candidate must retain its 1536×1024 source size');
  validateGrid(source, image.info); validateGrid(target, image.info);
  // Compose the two affine maps before sampling. An editor-atlas intermediate
  // would resample twice and erode small silhouettes and facial features.
  const native = reprojectPixels(image, source, target);
  const png = await sharp(native, { raw: { width: image.info.width, height: image.info.height, channels: 4 } }).png().toBuffer();
  const path = resolve(root, out);
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, png);
  const report = { version: 1, operation: 'whole-frame-registration', sources: paths.map((path, index) => ({ path, sha256: hash(bytes[index]) })), output: out, outputSha256: hash(png) };
  await writeFile(`${path}.json`, JSON.stringify(report, null, 2) + '\n');
  return report;
}

/** Correct integer registration drift without resampling or articulating paint.
 * Every moved pixel receives the same translation for its complete frame. */
export async function translateCandidate(input, registration, offsetsPath, out, root) {
  const paths = [input, registration, offsetsPath], bytes = await Promise.all(paths.map(path => readFile(resolve(root, path))));
  const image = await sharp(bytes[0]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const manifest = JSON.parse(bytes[1]), offsets = JSON.parse(bytes[2]);
  const { validateGrid } = await import('./character-kit.mjs');
  validateGrid(manifest, image.info);
  if (image.info.width !== 1536 || image.info.height !== 1024 || !Array.isArray(offsets) || offsets.length !== 36 || offsets.some(offset => !offset || Object.keys(offset).some(key => !['x', 'y'].includes(key)) || ![offset.x, offset.y].every(n => Number.isInteger(n) && Math.abs(n) <= 8))) throw new Error('Translation needs 36 bounded integer offsets and a 1536×1024 candidate');
  const data = Buffer.alloc(image.data.length);
  for (const [index, frame] of manifest.frames.entries()) {
    const c = frame.transform.sourceCell, offset = offsets[index];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const p = ((c.top + y) * image.info.width + c.left + x) * 4;
      const nx = x + offset.x, ny = y + offset.y;
      if (nx < 0 || nx >= c.width || ny < 0 || ny >= c.height) {
        if (image.data[p + 3] > 16) throw new Error(`Translation would clip visible paint in frame ${index}`);
        continue;
      }
      image.data.copy(data, ((c.top + ny) * image.info.width + c.left + nx) * 4, p, p + 4);
    }
  }
  const png = await sharp(data, { raw: { width: image.info.width, height: image.info.height, channels: 4 } }).png().toBuffer();
  const path = resolve(root, out);
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, png);
  const report = { version: 1, operation: 'whole-frame-translation', sources: paths.map((path, index) => ({ path, sha256: hash(bytes[index]) })), offsets, output: out, outputSha256: hash(png) };
  await writeFile(`${path}.json`, JSON.stringify(report, null, 2) + '\n');
  return report;
}
