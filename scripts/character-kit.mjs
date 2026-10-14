#!/usr/bin/env node
/** Generic component kit. All geometry comes from the shared registration. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { canonical, assertDimensions, visibleDelta } from './character-kit-pixels.mjs';
import { exportComponent, buildCatalogue, syncCharacterLabels, validateMaterialPolicy, poseDefinition } from './character-kit-assets.mjs';
import { execFileSync } from 'node:child_process';
import { resolveComponentRules } from '../web/src/character-rules.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const KIT = 'art/source/character-kit';
const hash = data => createHash('sha256').update(data).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const load = async path => sharp(await readFile(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const png = (data, info, path) => sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(path);
const changed = (a, b, p) => !a.subarray(p, p + 4).equals(b.subarray(p, p + 4));
const KEYS = { primary: '#7a5a9a', secondary: '#5a9a6a', skin: '#5a9a9a' };
export const LIMITS = { alpha: 16, delta: 12, minPixels: 6, minMedianRatio: .25, maxMedianRatio: 4, bodyCoverage: .95, bodyExpansion: .005, poseIoU: .8, anchorDrift: 3 };

export function material(r, g, b) {
  const max = Math.max(r, g, b), chroma = max - Math.min(r, g, b);
  if (chroma <= 7 || chroma / Math.max(1, max) < .12) return 'detail';
  const hue = (((max === r ? (g - b) / chroma : max === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma) * 60) + 360) % 360;
  if (hue >= 250 && hue <= 315) return 'primary';
  if (hue >= 100 && hue <= 155) return 'secondary';
  if (hue >= 165 && hue <= 200) return 'skin';
  return 'detail';
}
const classify = (data, p, materials) => {
  const key = material(data[p], data[p + 1], data[p + 2]);
  return materials.includes(key) ? key : 'detail';
};

/** Eight-connected regions, always bounded to a single registration cell. */
export function regionsIn(data, info, cell, alpha = LIMITS.alpha) {
  const remaining = new Set(), regions = [];
  for (let y = cell.top; y < cell.top + cell.height; y++) for (let x = cell.left; x < cell.left + cell.width; x++)
    if (data[(y * info.width + x) * 4 + 3] > alpha) remaining.add(y * info.width + x);
  while (remaining.size) {
    const stack = [remaining.values().next().value], region = []; remaining.delete(stack[0]);
    while (stack.length) {
      const i = stack.pop(), x = i % info.width, y = Math.floor(i / info.width); region.push(i);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * info.width + nx;
        if (nx >= cell.left && nx < cell.left + cell.width && ny >= cell.top && ny < cell.top + cell.height && remaining.delete(next)) stack.push(next);
      }
    }
    regions.push(region);
  }
  return regions.sort((a, b) => b.length - a.length);
}

/** Pose checks use principal silhouettes, ignoring alpha backing noise. */
export function poseReport(base, locked, frame) {
  const cell = frame.transform.sourceCell, W = base.info.width;
  const a = regionsIn(base.data, base.info, cell, 64)[0] ?? [], b = regionsIn(locked.data, base.info, cell, 64)[0] ?? [];
  const aa = new Set(a), bb = new Set(b), intersection = a.filter(i => bb.has(i)).length;
  const bounds = pixels => {
    if (!pixels.length) return null;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const i of pixels) { left = Math.min(left, i % W); right = Math.max(right, i % W); top = Math.min(top, Math.floor(i / W)); bottom = Math.max(bottom, Math.floor(i / W)); }
    return { left, right, top, bottom };
  };
  const ab = bounds(a), bBounds = bounds(b), scale = frame.transform.scale;
  const headCut = cell.top + (frame.neck.y - frame.transform.offset.y) / scale;
  const ah = a.filter(i => Math.floor(i / W) < headCut), bh = b.filter(i => Math.floor(i / W) < headCut), headIntersection = ah.filter(i => bb.has(i)).length;
  const ahb = bounds(ah), bhb = bounds(bh);
  return {
    silhouetteIoU: intersection / Math.max(1, aa.size + bb.size - intersection),
    headIoU: headIntersection / Math.max(1, ah.length + bh.length - headIntersection),
    crownDrift: ab && bBounds ? Math.abs(ab.top - bBounds.top) * scale : Infinity,
    groundDrift: ab && bBounds ? Math.abs(ab.bottom - bBounds.bottom) * scale : Infinity,
    headHorizontalDrift: ahb && bhb ? Math.abs((ahb.left + ahb.right - bhb.left - bhb.right) / 2) * scale : Infinity,
  };
}

export function validateGrid(manifest, info) {
  if (manifest.columns !== 9 || manifest.rows !== 4 || manifest.cell?.[0] !== 128 || manifest.cell?.[1] !== 192 || manifest.frames?.length !== 36)
    throw new Error('Expected the shared 9×4, 128×192 registration manifest');
  const seen = new Uint8Array(info.width * info.height);
  for (const [index, frame] of manifest.frames.entries()) {
    const { scale, offset, sourceCell: c } = frame.transform ?? {};
    if (!c || ![c.left, c.top, c.width, c.height].every(Number.isInteger) || c.left < 0 || c.top < 0 || c.width <= 0 || c.height <= 0 || c.left + c.width > info.width || c.top + c.height > info.height || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(offset?.x) || !Number.isFinite(offset?.y) || frame.direction !== Math.floor(index / 9) || frame.column !== index % 9)
      throw new Error(`Invalid registration for frame ${index}`);
    for (let y = c.top; y < c.top + c.height; y++) for (let x = c.left; x < c.left + c.width; x++) {
      const i = y * info.width + x;
      if (seen[i]) throw new Error(`Overlapping registration cells at frame ${index}`);
      seen[i] = 1;
    }
  }
  if (seen.includes(0)) throw new Error('Registration cells must cover the source exactly');
}

/** Data-defined mask bounds in canonical coordinates, projected to source cells. */
export function makeMask(info, manifest, spec) {
  const mask = new Uint8Array(info.width * info.height);
  if (spec.facings && (!Array.isArray(spec.facings) || !spec.facings.length || new Set(spec.facings).size !== spec.facings.length || spec.facings.some(facing => !['down', 'right', 'up', 'left'].includes(facing)))) throw new Error('Invalid mask facings');
  for (const f of manifest.frames) {
    if (spec.facings && !spec.facings.includes(['down', 'right', 'up', 'left'][f.direction])) continue;
    const h = f.headBounds, hw = h.right - h.left, c = f.transform.sourceCell;
    let box;
    if (spec.anchor === 'head') box = [h.left - hw * spec.paddingX, h.top - hw * spec.paddingTop, h.right + hw * spec.paddingX, f.neck.y + hw * spec.reach];
    else if (spec.anchor === 'body') box = [0, h.top - spec.padding, 128, f.ground.y + spec.padding];
    else if (spec.anchor === 'lower') box = [0, f.waist.y - spec.padding, 128, f.ground.y + spec.padding];
    else if (spec.anchor === 'span') {
      const edge = value => {
        const from = f[value?.from]?.y, to = value?.to ? f[value.to]?.y : from;
        if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('Unknown mask span landmark');
        return from + (to - from) * (value.fraction ?? 0) + (value.offset ?? 0);
      };
      box = [0, edge(spec.top), 128, edge(spec.bottom)];
    }
    else throw new Error(`Unknown mask anchor ${spec.anchor}`);
    if (!box.every(Number.isFinite) || box[0] > box[2] || box[1] > box[3]) throw new Error('Invalid mask bounds');
    for (let y = c.top; y < c.top + c.height; y++) for (let x = c.left; x < c.left + c.width; x++) {
      const cx = (x - c.left) * f.transform.scale + f.transform.offset.x;
      const cy = (y - c.top) * f.transform.scale + f.transform.offset.y;
      if (cx >= box[0] && cx <= box[2] && cy >= box[1] && cy <= box[3]) mask[y * info.width + x] = 1;
    }
  }
  return mask;
}

function materialMask(info, manifest, spec) {
  if (!spec) return new Uint8Array(info.width * info.height).fill(1);
  if (!manifest) throw new Error('Material regions require registration');
  const out = new Uint8Array(info.width * info.height);
  for (const f of manifest.frames) {
    const c = f.transform.sourceCell, start = f[spec.from]?.y, end = f[spec.to]?.y;
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Unknown material region anchor');
    const lo = start + (end - start) * spec.start, hi = start + (end - start) * (spec.end ?? 1.1);
    for (let y = c.top; y < c.top + c.height; y++) {
      const cy = (y - c.top) * f.transform.scale + f.transform.offset.y;
      if (cy >= lo && cy <= hi) out.fill(1, y * info.width + c.left, y * info.width + c.left + c.width);
    }
  }
  return out;
}

/** Edge-connected input matte is background by default. Enclosed white details
 * remain paint unless the asset explicitly declares enclosed background holes. */
export function candidateMatte(candidate, manifest, spec) {
  if (!manifest || !/^#[0-9a-f]{6}$/i.test(spec?.color ?? '') || !Number.isInteger(spec.tolerance) || spec.tolerance < 0 || spec.tolerance > 64) throw new Error('Matte needs registration, a hex colour and tolerance in 0..64');
  if (spec.includeEnclosed !== undefined && typeof spec.includeEnclosed !== 'boolean') throw new Error('Matte includeEnclosed must be boolean');
  const rgb = [1, 3, 5].map(start => Number.parseInt(spec.color.slice(start, start + 2), 16));
  const { data, info } = candidate, mask = new Uint8Array(info.width * info.height);
  const matches = i => data[i * 4 + 3] <= LIMITS.alpha || rgb.every((color, channel) => Math.abs(data[i * 4 + channel] - color) <= spec.tolerance);
  for (const { transform: { sourceCell: c } } of manifest.frames) {
    if (spec.includeEnclosed) {
      for (let y = c.top; y < c.top + c.height; y++) for (let x = c.left; x < c.left + c.width; x++) {
        const i = y * info.width + x;
        if (matches(i)) mask[i] = 1;
      }
      continue;
    }
    const queue = new Int32Array(c.width * c.height); let count = 0;
    const add = (x, y) => {
      if (x < c.left || x >= c.left + c.width || y < c.top || y >= c.top + c.height) return;
      const i = y * info.width + x;
      if (mask[i] || !matches(i)) return;
      mask[i] = 1; queue[count++] = i;
    };
    for (let x = c.left; x < c.left + c.width; x++) { add(x, c.top); add(x, c.top + c.height - 1); }
    for (let y = c.top; y < c.top + c.height; y++) { add(c.left, y); add(c.left + c.width - 1, y); }
    for (let at = 0; at < count; at++) {
      const i = queue[at], x = i % info.width, y = Math.floor(i / info.width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(x + dx, y + dy);
    }
  }
  return mask;
}

/** Natural details such as buttons can be enclosed by a keyed fabric. Reject
 * exterior antialias colour fringe instead of exporting it as untinted trim. */
function enclosedDetails(candidate, manifest, key) {
  const { data, info } = candidate, exterior = new Uint8Array(info.width * info.height);
  for (const { transform: { sourceCell: c } } of manifest.frames) {
    const queue = new Int32Array(c.width * c.height); let count = 0;
    const add = (x, y) => {
      if (x < c.left || x >= c.left + c.width || y < c.top || y >= c.top + c.height) return;
      const i = y * info.width + x, p = i * 4;
      if (exterior[i] || (data[p + 3] > LIMITS.alpha && material(...data.subarray(p, p + 3)) === key)) return;
      exterior[i] = 1; queue[count++] = i;
    };
    for (let x = c.left; x < c.left + c.width; x++) { add(x, c.top); add(x, c.top + c.height - 1); }
    for (let y = c.top; y < c.top + c.height; y++) { add(c.left, y); add(c.left + c.width - 1, y); }
    for (let at = 0; at < count; at++) {
      const i = queue[at], x = i % info.width, y = Math.floor(i / info.width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(x + dx, y + dy);
    }
  }
  return exterior;
}

/** Recover a declared single-colour ink painted over an opaque reference.
 * Solve candidate = shadedInk * alpha + base * (1 - alpha). The two RGB
 * basis vectors recover both painted luminance and coverage; this is not a
 * guessed hue segmentation or a spatial filter. Reject colours that do not fit.
 */
export function recoverInk(base, candidate, ink, tolerance) {
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const bb = dot(base, base), ii = dot(ink, ink), bi = dot(base, ink);
  const determinant = bb * ii - bi * bi;
  if (determinant < 1) return null;
  const bc = dot(base, candidate), ic = dot(ink, candidate);
  const background = (bc * ii - ic * bi) / determinant;
  const pigment = (ic * bb - bc * bi) / determinant;
  const alpha = Math.min(1, 1 - background);
  if (alpha * 255 <= LIMITS.alpha || pigment <= 0) return null;
  const rgb = ink.map(channel => channel * pigment / alpha);
  if (rgb.some(channel => channel > 255 || channel < 0) || Math.max(...rgb) < 12) return null;
  if (candidate.some((channel, i) => Math.abs(channel - (rgb[i] * alpha + base[i] * (1 - alpha))) > tolerance)) return null;
  return [...rgb.map(Math.round), Math.round(alpha * 255)];
}

/** Registered replacement or overlay, with explicit retained material regions. */
export function lockPixels(base, candidate, mask, materials, policy = {}, manifest) {
  if (policy.detailMaxChroma !== undefined && (!Number.isFinite(policy.detailMaxChroma) || policy.detailMaxChroma < 0 || policy.detailMaxChroma > 1 || !materials.includes('detail'))) throw new Error('Detail chroma requires detail and a fraction in 0..1');
  const rejectedDetail = p => policy.detailMaxChroma !== undefined && classify(candidate.data, p, materials) === 'detail' && (Math.max(...candidate.data.subarray(p, p + 3)) - Math.min(...candidate.data.subarray(p, p + 3))) / Math.max(1, ...candidate.data.subarray(p, p + 3)) > policy.detailMaxChroma;
  if (policy.detailMaterial !== undefined && (!materials.includes('detail') || policy.detailMaterial === 'detail' || !materials.includes(policy.detailMaterial))) throw new Error('Detail tint material must be a declared key material');
  assertDimensions(candidate, base.info, 'Candidate');
  if (policy.minFramePaintPixels !== undefined && (!manifest || !Number.isInteger(policy.minFramePaintPixels) || policy.minFramePaintPixels < 1 || policy.minFramePaintPixels > LIMITS.minPixels)) throw new Error('Frame noise cleanup requires registration and a threshold within the minimum paint size');
  if (policy.ignoreKeys && (!Array.isArray(policy.ignoreKeys) || policy.ignoreKeys.some(key => !Object.hasOwn(KEYS, key) || materials.includes(key)))) throw new Error('Ignored keys must be known and absent from component materials');
  if (policy.preserveMaterials && (policy.operation==='replace' || !Array.isArray(policy.preserveMaterials) || policy.preserveMaterials.some(key=>!Object.hasOwn(KEYS,key)||!materials.includes(key)||!policy.keepMaterials?.includes(key)||!policy.materialRegions?.[key]))) throw new Error('Preserved materials require an overlay and explicit retained regions');
  if (policy.minBaseAlpha !== undefined && (!Number.isInteger(policy.minBaseAlpha) || policy.minBaseAlpha < 0 || policy.minBaseAlpha > 255 || policy.operation === 'replace')) throw new Error('Base alpha clipping requires an overlay and a byte threshold');
  if (policy.detailEnclosedBy !== undefined && (!manifest || !Object.hasOwn(KEYS, policy.detailEnclosedBy) || !materials.includes(policy.detailEnclosedBy) || !materials.includes('detail'))) throw new Error('Enclosed detail requires registration, detail and a declared enclosing key material');
  const detailExterior = policy.detailEnclosedBy ? enclosedDetails(candidate, manifest, policy.detailEnclosedBy) : null;
  let ink, inkBackdrop;
  if (policy.detailInk) {
    if (!/^#[0-9a-f]{6}$/i.test(policy.detailInk.color ?? '') || !/^#[0-9a-f]{6}$/i.test(policy.matte?.color ?? '') || (policy.minBaseAlpha ?? 0) < 240 || !Number.isInteger(policy.detailInk.tolerance) || policy.detailInk.tolerance < 0 || policy.detailInk.tolerance > 16 || materials.length !== 1 || materials[0] !== 'detail' || policy.operation === 'replace' || policy.detailReach) throw new Error('Ink recovery requires a detail-only overlay, declared matte, opaque base clipping, hex ink and tolerance in 0..16');
    ink = [1, 3, 5].map(start => Number.parseInt(policy.detailInk.color.slice(start, start + 2), 16));
    inkBackdrop = [1, 3, 5].map(start => Number.parseInt(policy.matte.color.slice(start, start + 2), 16));
    if (material(...ink) !== 'detail') throw new Error('Detail ink must not use a reserved material key');
    if (policy.detailInk.opacity !== undefined && (!Number.isFinite(policy.detailInk.opacity) || policy.detailInk.opacity <= 0 || policy.detailInk.opacity > 1)) throw new Error('Ink opacity must be greater than zero and at most one');
  }
  const locked = Buffer.from(base.data);
  const matte = policy.matte ? candidateMatte(candidate, manifest, policy.matte) : null;
  const seeds = new Uint8Array(mask.length), areas = Object.fromEntries(materials.map(key => [key, materialMask(base.info, manifest, policy.materialRegions?.[key])]));
  const fringeMaterials = policy.fringeMaterials ?? ['detail'];
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    if (mask[i] && policy.operation === 'replace') locked.fill(0, p, p + 4);
    if (!mask[i] || matte?.[i] || base.data[p + 3] < (policy.minBaseAlpha ?? 0) || candidate.data[p + 3] <= LIMITS.alpha || policy.ignoreKeys?.includes(material(...candidate.data.subarray(p, p + 3)))) continue;
    if (ink) {
      if (candidate.data[p + 3] < policy.minBaseAlpha || visibleDelta(base.data, candidate.data, p) <= LIMITS.delta) continue;
      const a = base.data[p + 3] / 255;
      const underpaint = inkBackdrop.map((backdrop, channel) => base.data[p + channel] * a + backdrop * (1 - a));
      // Whole-frame re-registration can retain near-opaque alpha. Compare both
      // images over the declared matte so this coverage does not become pigment.
      const candidateAlpha = candidate.data[p + 3] / 255;
      const painted = inkBackdrop.map((backdrop, channel) => candidate.data[p + channel] * candidateAlpha + backdrop * (1 - candidateAlpha));
      const rgba = recoverInk(underpaint, painted, ink, policy.detailInk.tolerance);
      if (rgba) {
        rgba[3] = Math.round(rgba[3] * (policy.detailInk.opacity ?? 1));
        if (rgba[3] > LIMITS.alpha) { locked.set(rgba, p); count++; seeds[i] = 1; }
      }
      continue;
    }
    const key = classify(candidate.data, p, materials);
    if (policy.preserveMaterials?.includes(key)) continue;
    if (key === 'detail' && (detailExterior?.[i] || rejectedDetail(p))) continue;
    if (!materials.includes(key) || !areas[key][i] || (fringeMaterials.includes(key) && policy.detailReach)) continue;
    if (policy.operation !== 'replace' && !policy.keepMaterials?.includes(key) && visibleDelta(base.data, candidate.data, p) <= LIMITS.delta) continue;
    candidate.data.copy(locked, p, p, p + 4); count++;
    seeds[i] = 1;
  }
  // Adjacent natural seams are paint; unrelated face/body edits are protected.
  if (policy.detailReach) {
    if (!manifest || !materials.includes('detail')) throw new Error('Detail fringe requires registration and detail material');
    for (const f of manifest.frames) {
      const c = f.transform.sourceCell;
      for (let y = c.top; y < c.top + c.height; y++) for (let x = c.left; x < c.left + c.width; x++) {
        const i = y * base.info.width + x, p = i * 4;
        if (classify(candidate.data, p, materials) === 'detail' && (detailExterior?.[i] || rejectedDetail(p))) continue;
        if (policy.preserveMaterials?.includes(classify(candidate.data,p,materials))) continue;
        if (!mask[i] || matte?.[i] || seeds[i] || base.data[p + 3] < (policy.minBaseAlpha ?? 0) || candidate.data[p + 3] <= LIMITS.alpha || policy.ignoreKeys?.includes(material(...candidate.data.subarray(p, p + 3))) || !fringeMaterials.includes(classify(candidate.data, p, materials))) continue;
        let near = false;
        for (let dy = -policy.detailReach; dy <= policy.detailReach && !near; dy++) for (let dx = -policy.detailReach; dx <= policy.detailReach; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= c.left && nx < c.left + c.width && ny >= c.top && ny < c.top + c.height && seeds[ny * base.info.width + nx]) { near = true; break; }
        }
        if (near) { candidate.data.copy(locked, p, p, p + 4); count++; }
      }
    }
  }
  if (!count) throw new Error('No eligible changed paint inside mask');
  if (policy.minFramePaintPixels) {
    const component = extract(base, { info: base.info, data: locked }, mask, policy, manifest);
    for (const frame of manifest.frames) {
      const regions = regionsIn(component, base.info, frame.transform.sourceCell);
      if (regions.reduce((sum, region) => sum + region.length, 0) >= policy.minFramePaintPixels) continue;
      for (const region of regions) for (const i of region) {
        if (policy.operation === 'replace') locked.fill(0, i * 4, i * 4 + 4);
        else base.data.copy(locked, i * 4, i * 4, i * 4 + 4);
      }
    }
  }
  if (policy.maxSpeckPixels || policy.anchorMaterial) {
    if (!manifest) throw new Error('Speck cleanup requires registration');
    const component = extract(base, { info: base.info, data: locked }, mask, policy, manifest);
    for (const frame of manifest.frames) for (const region of regionsIn(component, base.info, frame.transform.sourceCell).slice(1)) {
      const lacksAnchor = policy.anchorMaterial && !region.some(i => material(candidate.data[i * 4], candidate.data[i * 4 + 1], candidate.data[i * 4 + 2]) === policy.anchorMaterial);
      if (!lacksAnchor && region.length > (policy.maxSpeckPixels ?? 0)) continue; // substantial paint islands must fail check
      for (const i of region) {
        if (policy.operation === 'replace') locked.fill(0, i * 4, i * 4 + 4);
        else base.data.copy(locked, i * 4, i * 4, i * 4 + 4);
      }
    }
  }
  return locked;
}

export function extract(base, locked, mask, policy = {}, manifest) {
  assertDimensions(locked, base.info, 'Locked sheet');
  const component = Buffer.alloc(base.data.length);
  const retained = Object.fromEntries((policy.keepMaterials ?? []).map(key => [key, materialMask(base.info, manifest, policy.materialRegions?.[key])]));
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4, key = material(locked.data[p], locked.data[p + 1], locked.data[p + 2]);
    if (mask[i] && (policy.operation === 'replace' || changed(base.data, locked.data, p) || retained[key]?.[i])) locked.data.copy(component, p, p, p + 4);
  }
  return component;
}

export function checkPixels(base, locked, mask, manifest, entry) {
  assertDimensions(locked, base.info, 'Locked sheet');
  validateMaterialPolicy(entry);
  const cellMargin = entry.validation?.cellMargin ?? 0;
  if (!Number.isInteger(cellMargin) || cellMargin < 0 || cellMargin > 8) throw new Error('Cell margin must be an integer in 0..8 source pixels');
  const maxRegions = entry.validation?.maxRegions ?? 1;
  const regionLimit = entry.slot === 'markings' ? 16 : entry.slot === 'face' ? 8 : entry.slot === 'outer' ? 6 : 4;
  if (!Number.isInteger(maxRegions) || maxRegions < 1 || maxRegions > regionLimit || (entry.slot === 'body' && maxRegions !== 1) || (maxRegions > 1 && !entry.validation?.regionReason?.trim())) throw new Error('Multiple regions require a bounded, explained component policy; mannequins must stay connected');
  const facingRegions = entry.validation?.maxRegionsByFacing ?? {};
  if (!facingRegions || Array.isArray(facingRegions) || typeof facingRegions !== 'object' || Object.entries(facingRegions).some(([facing, count]) => !['down', 'right', 'up', 'left'].includes(facing) || !Number.isInteger(count) || count < 1 || count > regionLimit || (entry.slot === 'body' && count !== 1) || (count > 1 && !entry.validation?.regionReason?.trim()))) throw new Error('Facing regions require valid facings and bounded, explained counts; mannequins must stay connected');
  const visibleFacings = entry.validation?.visibleFacings ?? ['down', 'right', 'up', 'left'];
  if (!Array.isArray(visibleFacings) || !visibleFacings.length || new Set(visibleFacings).size !== visibleFacings.length || visibleFacings.some(facing => !['down', 'right', 'up', 'left'].includes(facing)) || (visibleFacings.length < 4 && (entry.slot === 'body' || !entry.validation?.visibilityReason?.trim()))) throw new Error('Partial facing visibility requires an explained policy; mannequins must be visible in all facings');
  const component = extract(base, locked, mask, entry.lock, manifest), errors = [], frames = [], W = base.info.width;
  let protectedDrift = 0;
  for (let i = 0; i < mask.length; i++) if (!mask[i] && changed(base.data, locked.data, i * 4)) protectedDrift++;
  if (protectedDrift) errors.push(`${protectedDrift} protected RGBA pixels changed outside mask`);
  for (const [index, f] of manifest.frames.entries()) {
    const c = f.transform.sourceCell, occupied = new Set(), counts = Object.fromEntries(entry.materials.map(key => [key, 0]));
    let bodyPixels = 0, skinPixels = 0, outsideSilhouette = 0, cellEdgePaint = 0;
    for (let y = c.top; y < c.top + c.height; y++) for (let x = c.left; x < c.left + c.width; x++) {
      const i = y * W + x, p = i * 4;
      const reference = entry.lock?.operation === 'replace' ? locked.data : base.data;
      if (reference[p + 3] > LIMITS.alpha) {
        bodyPixels++;
        if (component[p + 3] > LIMITS.alpha && material(...component.subarray(p, p + 3)) === 'skin') skinPixels++;
      }
      if (component[p + 3] <= LIMITS.alpha) continue;
      if (cellMargin && (x < c.left + cellMargin || x >= c.left + c.width - cellMargin || y < c.top + cellMargin || y >= c.top + c.height - cellMargin)) cellEdgePaint++;
      if (base.data[p + 3] <= LIMITS.alpha) outsideSilhouette++;
      occupied.add(i);
      const key = classify(component, p, entry.materials);
      if (!(key in counts)) errors.push(`Frame ${index}: undeclared material ${key}`);
      else counts[key]++;
    }
    let regions = 0, detached = 0;
    const remaining = new Set(occupied);
    while (remaining.size) {
      const stack = [remaining.values().next().value]; remaining.delete(stack[0]);
      let touches = false; regions++;
      while (stack.length) {
        const i = stack.pop(), x = i % W, y = Math.floor(i / W);
        if (base.data[i * 4 + 3] > LIMITS.alpha) touches = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, next = ny * W + nx;
          if (nx < c.left || nx >= c.left + c.width || ny < c.top || ny >= c.top + c.height) continue;
          if (base.data[next * 4 + 3] > LIMITS.alpha) touches = true;
          if (remaining.delete(next)) stack.push(next);
        }
      }
      if (!touches) detached++;
    }
    const visible = visibleFacings.includes(['down', 'right', 'up', 'left'][f.direction]);
    if (!visible && occupied.size) errors.push(`Frame ${index}: paint in a declared invisible facing`);
    if (visible && occupied.size < LIMITS.minPixels) errors.push(`Frame ${index}: missing paint`);
    const regionLimit = facingRegions[['down', 'right', 'up', 'left'][f.direction]] ?? maxRegions;
    if (visible && (regions < 1 || regions > regionLimit)) errors.push(`Frame ${index}: expected ${regionLimit === 1 ? 'one connected paint region' : `1–${regionLimit} connected paint regions`}, found ${regions}`);
    if (detached) errors.push(`Frame ${index}: ${detached} floating paint regions`);
    if (cellEdgePaint) errors.push(`Frame ${index}: ${cellEdgePaint} paint pixels violate ${cellMargin}-pixel cell clearance`);
    for (const key of entry.materials.filter(key => key !== 'detail')) {
      const materialVisible = visible && (entry.validation?.materialFacings?.[key] ?? visibleFacings).includes(['down', 'right', 'up', 'left'][f.direction]);
      if (materialVisible && !entry.validation?.optionalMaterialFacings?.[key]?.includes(['down','right','up','left'][f.direction]) && counts[key] < LIMITS.minPixels) errors.push(`Frame ${index}: missing ${key} key paint`);
      if (!materialVisible && counts[key]) errors.push(`Frame ${index}: ${key} paint in a declared invisible material facing`);
    }
    const coverage = bodyPixels ? skinPixels / bodyPixels : 0;
    if (entry.slot === 'body' && coverage < LIMITS.bodyCoverage) errors.push(`Frame ${index}: full-body skin coverage ${(coverage * 100).toFixed(1)}% below 95%`);
    let pose;
    if (entry.lock?.operation === 'replace') {
      pose = poseReport(base, locked, f);
      if (pose.silhouetteIoU < LIMITS.poseIoU || pose.headIoU < LIMITS.poseIoU) errors.push(`Frame ${index}: pose/head silhouette overlap below ${LIMITS.poseIoU}`);
      for (const key of ['crownDrift', 'groundDrift', 'headHorizontalDrift']) if (pose[key] > LIMITS.anchorDrift) errors.push(`Frame ${index}: ${key} ${pose[key].toFixed(2)} exceeds ${LIMITS.anchorDrift} editor pixels`);
    } else if (entry.slot === 'body' && outsideSilhouette > bodyPixels * LIMITS.bodyExpansion) errors.push(`Frame ${index}: ${outsideSilhouette} paint pixels outside the reference silhouette`);
    frames.push({ index, direction: f.direction, column: f.column, counts, regions, detached, coverage, outsideSilhouette, ...(cellMargin ? { cellEdgePaint } : {}), pose });
  }
  for (const key of entry.materials.filter(key => key !== 'detail')) {
    const materialFacings = entry.validation?.materialFacings?.[key] ?? visibleFacings;
    const visibleFrames = frames.filter(f => materialFacings.includes(['down', 'right', 'up', 'left'][f.direction]));
    const groups = entry.validation?.materialCountByFacing?.includes(key)
      ? [0, 1, 2, 3].map(direction => visibleFrames.filter(f => f.direction === direction)).filter(group => group.length)
      : [visibleFrames];
    for (const group of groups) {
      const values = group.filter(f => f.counts[key] || !entry.validation?.optionalMaterialFacings?.[key]?.includes(['down','right','up','left'][f.direction])).map(f => f.counts[key]).sort((a, b) => a - b), median = values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : 0;
      for (const f of group) if ((!entry.validation?.optionalMaterialFacings?.[key]?.includes(['down','right','up','left'][f.direction]) && f.counts[key] < median * LIMITS.minMedianRatio) || f.counts[key] > median * LIMITS.maxMedianRatio)
        errors.push(`Frame ${f.index}: ${key} count ${f.counts[key]} outside 0.25–4× median ${median}${groups.length > 1 ? ' for this facing' : ''}`);
    }
  }
  return { id: entry.id, valid: !errors.length, protectedDrift, frames, errors };
}

export function promptFor(entry, mask, version, pose) {
  const rowDescription = pose?.rowDescription ?? 'standing then eight walking poses';
  return `Prompt version ${version}. Use case: precise-object-edit.\nEdit target: base.png. Supporting input: mask-${entry.mask}-bw.png (white is editable).\nPreserve the exact 1536×1024 canvas, all 36 figures in their original 9×4 cells, and the source transparency. Rows: down, right, up, left. Each row: ${rowDescription}. Do not move, scale, crop, flip or redraw the figures. Keep painterly shading and upper-left lighting. No text, grid lines, shadows on the background, or additional objects.\nEdit only ${mask.region}. Everything outside the mask must stay unchanged.\n${entry.materials.filter(key => KEYS[key]).map(key => `Paint ${key} in the ${KEYS[key]} key-colour family, preserving hue in highlights and shadows.`).join(' ')}${entry.materials.includes('detail') ? ' Natural-colour detail is allowed only where explicitly described.' : ' No natural-colour detail; use only the requested keys.'}\n${entry.prompt}\n`;
}

async function context(id, root = ROOT, catalogue, poseSet) {
  catalogue ??= await json(resolve(root, KIT, 'catalogue.json'));
  const entry = catalogue.entries.find(e => e.id === id);
  if (!entry) throw new Error(`Unknown component ${id}`);
  if (poseSet !== undefined && (entry.poseSet ?? 'walk') !== poseSet) throw new Error(`Component ${id} belongs to pose set ${entry.poseSet ?? 'walk'}, not ${poseSet}`);
  return contextForEntry(entry, catalogue, root);
}

/** Each build owns its registration and masks; legacy catalogues use the
 * original regular-build paths until their references are explicitly declared. */
export function buildReferences(catalogue, buildId, poseSet = 'walk') {
  const build = catalogue.builds[buildId];
  if (!build) throw new Error(`Unknown build ${buildId}`);
  if (poseSet !== 'walk') {
    const pose = build.poseSets?.[poseSet];
    if (!catalogue.poseSets?.[poseSet] || !pose) throw new Error(`Unavailable pose set ${poseSet} for build ${buildId}`);
    if (['master', 'mannequin', 'registration', 'masks'].some(key => typeof pose[key] !== 'string' || !pose[key])) throw new Error(`Incomplete references for ${buildId}/${poseSet}`);
    return { ...pose, defaultProofOutfit: pose.defaultProofOutfit ?? [] };
  }
  return { ...build, registration: build.registration ?? catalogue.registration, masks: build.masks ?? `${KIT}/masks.json` };
}

async function contextForEntry(entry, catalogue, root) {
  entry = { ...entry, zOrder: { ...catalogue.slots?.find(slot => slot.id === entry.slot)?.zOrder, ...entry.zOrder } };
  const build = buildReferences(catalogue, entry.build, entry.poseSet), specs = await json(resolve(root, build.masks)), spec = specs[entry.mask];
  if (!build || !spec || spec.slot !== entry.slot) throw new Error(`Invalid build or mask for ${entry.id}`);
  const basePath = resolve(root, entry.slot === 'body' ? build.master : build.mannequin);
  const base = await load(basePath), manifest = await json(resolve(root, build.registration));
  const sourceSize = manifest.sourceSize ?? [1536, 1024];
  if (!Array.isArray(sourceSize) || sourceSize.length !== 2 || sourceSize.some(n => !Number.isInteger(n) || n < 1 || n > 8192)) throw new Error('Invalid native source dimensions');
  assertDimensions(base, { width: sourceSize[0], height: sourceSize[1] }, 'Base'); validateGrid(manifest, base.info);
  const master = await readFile(resolve(root, build.master));
  if (hash(master) !== manifest.sourceSha256) throw new Error('Master source hash does not match registration');
  if (manifest.reference) {
    const reference = manifest.reference;
    const sources = [...reference.sources, { path: reference.spec, sha256: reference.specSha256 }, { path: reference.registration, sha256: reference.registrationSha256 }];
    for (const source of sources) if (hash(await readFile(resolve(root, source.path))) !== source.sha256) throw new Error(`Reference source changed: ${source.path}`);
  }
  const generationPrompt = entry.generationPrompt ? await readFile(resolve(root, entry.generationPrompt), 'utf8') : null;
  const preparationBytes = entry.preparedCandidate ? await readFile(resolve(root, entry.preparedCandidate)) : null;
  const preparation = preparationBytes ? JSON.parse(preparationBytes) : null;
  if (preparation) {
    if (preparation.version !== 1 || !preparation.sources?.length || !preparation.outputSha256) throw new Error('Invalid prepared candidate provenance');
    for (const source of preparation.sources) if (hash(await readFile(resolve(root, source.path))) !== source.sha256) throw new Error(`Prepared candidate source changed: ${source.path}`);
  }
  return { root, catalogue, entry, spec, pose: poseDefinition(catalogue, entry.poseSet), basePath, base, manifest, generationPrompt, preparation, preparationSha256: preparationBytes ? hash(preparationBytes) : null, mask: makeMask(base.info, manifest, spec) };
}

function provenance(ctx, candidateHash) {
  if (ctx.preparation && ctx.preparation.outputSha256 !== candidateHash) throw new Error('Prepared candidate pixels changed');
  return { version: 2, ...(ctx.entry.expression ? {expression:ctx.entry.expression} : {}), ...(ctx.entry.poseSet && ctx.entry.poseSet !== 'walk' ? {poseSet:ctx.entry.poseSet,poseDefinitionSha256:hash(JSON.stringify(ctx.pose))} : {}), candidateSha256: candidateHash, baseSha256: hash(ctx.base.data), registrationSha256: hash(JSON.stringify(ctx.manifest)), maskSha256: hash(ctx.mask), promptSha256: hash(promptFor(ctx.entry, ctx.spec, ctx.catalogue.promptVersion, ctx.pose)), generationPromptSha256: ctx.generationPrompt === null ? null : hash(ctx.generationPrompt), materials: ctx.entry.materials, lock: ctx.entry.lock ?? {}, ...(ctx.entry.validation ? { validation: ctx.entry.validation } : {}), ...(ctx.preparationSha256 ? { preparationSha256: ctx.preparationSha256 } : {}) };
}
async function readLocked(ctx) {
  const path = resolve(ctx.root, ctx.entry.locked), locked = await load(path), stored = await json(`${path}.json`);
  const expected = provenance(ctx, hash(await readFile(resolve(ctx.root, stored.candidate))));
  for (const key of Object.keys(expected)) if (JSON.stringify(stored[key]) !== JSON.stringify(expected[key])) throw new Error(`Stale provenance: ${key}; lock again`);
  if (stored.lockedSha256 !== hash(locked.data)) throw new Error('Locked pixels changed since lock; lock again');
  return locked;
}

export async function writeKit(ctx, rows = false) {
  const dir = resolve(ctx.root, KIT, 'kits', ctx.entry.build, ...(ctx.entry.poseSet && ctx.entry.poseSet !== 'walk' ? [ctx.entry.poseSet] : []), ctx.entry.mask);
  await mkdir(dir, { recursive: true });
  await png(ctx.base.data, ctx.base.info, resolve(dir, 'base.png'));
  await sharp(ctx.base.data, { raw: { width: ctx.base.info.width, height: ctx.base.info.height, channels: 4 } }).flatten({ background: '#fafafa' }).png().toFile(resolve(dir, 'base-visible.png'));
  const alpha = Buffer.alloc(ctx.base.data.length), bw = Buffer.alloc(ctx.base.data.length);
  for (let i = 0; i < ctx.mask.length; i++) {
    alpha[i * 4 + 3] = ctx.mask[i] ? 0 : 255;
    bw.fill(ctx.mask[i] ? 255 : 0, i * 4, i * 4 + 3); bw[i * 4 + 3] = 255;
  }
  await png(alpha, ctx.base.info, resolve(dir, `mask-${ctx.entry.mask}.png`));
  await png(bw, ctx.base.info, resolve(dir, `mask-${ctx.entry.mask}-bw.png`));
  await writeFile(resolve(dir, 'prompt.txt'), promptFor(ctx.entry, ctx.spec, ctx.catalogue.promptVersion, ctx.pose));
  if (rows) {
    const geometry = [];
    for (let row = 0; row < 4; row++) {
      const cells = ctx.manifest.frames.slice(row * 9, row * 9 + 9).map(f => f.transform.sourceCell);
      const top = cells[0].top, height = cells[0].height;
      if (cells.some(c => c.top !== top || c.height !== height)) throw new Error('Row kit requires aligned source cells');
      const rectangle = { left: 0, top, width: ctx.base.info.width, height };
      for (const filename of ['base', `mask-${ctx.entry.mask}`, `mask-${ctx.entry.mask}-bw`])
        await sharp(resolve(dir, `${filename}.png`)).extract(rectangle).png().toFile(resolve(dir, `${filename}-row-${row}.png`));
      geometry.push({ row, facing: ['down', 'right', 'up', 'left'][row], ...rectangle });
    }
    await writeFile(resolve(dir, 'rows.json'), JSON.stringify({ note: 'Reassemble with exact rectangular copies at these coordinates; never resize a returned row.', rows: geometry }, null, 2) + '\n');
  }
  return dir;
}

/** Tint all materials before resampling so shared boundaries retain coverage. */
export function tintComponent(data, colors, materials = ['primary', 'secondary', 'skin', 'detail'], detailMaterial) {
  const out = Buffer.from(data);
  for (let p = 0; p < out.length; p += 4) {
    if (!out[p + 3]) continue;
    const detected = classify(data, p, materials), key = detected === 'detail' && detailMaterial ? detailMaterial : detected, color = colors[key];
    if (!color) continue;
    const gray = Math.min(255, Math.round((data[p] * .2126 + data[p + 1] * .7152 + data[p + 2] * .0722) * 255 / 180));
    for (let channel = 0; channel < 3; channel++) out[p + channel] = Math.round(gray * color[channel] / 255);
  }
  return out;
}

export function resolveProofPieces(pieces, facing) {
  const byEntry = new Map(pieces.map(piece => [piece.entry, piece]));
  return resolveComponentRules(pieces.map(piece => piece.entry), facing).visible.map(entry => byEntry.get(entry));
}

function fixtureCell(sheet, index) {
  const out = Buffer.alloc(128 * 192 * 4), column = index % 9, row = Math.floor(index / 9);
  for (let y = 0; y < 192; y++) { const p = ((row * 192 + y) * 1152 + column * 128) * 4; sheet.copy(out, y * 128 * 4, p, p + 128 * 4); }
  return out;
}

async function proof(ctx, locked, withIds, compareRules = false, output) {
  const report = checkPixels(ctx.base, locked, ctx.mask, ctx.manifest, ctx.entry);
  const others = [], checks = [report], sources = {};
  sources[ctx.entry.id] = { path: ctx.entry.locked, sha256: hash(await readFile(resolve(ctx.root, ctx.entry.locked))) };
  const readFixture = async id => {
    const entry = ctx.catalogue.proofFixtures?.[id];
    if (!entry) throw new Error(`Unknown proof fixture ${id}`);
    if ((entry.poseSet ?? 'walk') !== (ctx.entry.poseSet ?? 'walk')) throw new Error('Proof fixtures must share a pose set');
    const path = resolve(ctx.root, entry.path), sheet = await load(path);
    assertDimensions(sheet, { width: 1152, height: 768 }, 'Proof fixture');
    sources[id] = { path: entry.path, sha256: hash(await readFile(path)) };
    return { entry: { id, ...entry }, data: sheet.data, canonical: true };
  };
  for (const id of withIds) {
    if (!ctx.catalogue.entries.some(entry => entry.id === id) && ctx.catalogue.proofFixtures?.[id]) { others.push(await readFixture(id)); continue; }
    const other = await context(id, ctx.root, ctx.catalogue);
    if (other.entry.build !== ctx.entry.build) throw new Error('Proof pieces must share a build');
    if ((other.entry.poseSet ?? 'walk') !== (ctx.entry.poseSet ?? 'walk')) throw new Error('Proof pieces must share a pose set');
    const sheet = await readLocked(other);
    sources[id] = { path: other.entry.locked, sha256: hash(await readFile(resolve(ctx.root, other.entry.locked))) };
    checks.push(checkPixels(other.base, sheet, other.mask, other.manifest, other.entry));
    others.push({ entry: other.entry, data: extract(other.base, sheet, other.mask, other.entry.lock, other.manifest) });
  }
  const palettes = [ { primary: [180, 65, 55], secondary: [210, 185, 110], skin: [214, 160, 125] }, { primary: [60, 100, 190], secondary: [85, 150, 95], skin: [130, 87, 65] } ];
  const panels = [], nativePanels = [], component = extract(ctx.base, locked, ctx.mask, ctx.entry.lock, ctx.manifest);
  // Occupied slots must also suppress legacy fixtures. Otherwise a dress hides
  // the default trousers after their partial legacy body has replaced the full
  // mannequin, leaving transparent calves in the outfit comparison board.
  const slots = new Set([ctx.entry, ...others.map(p => p.entry)].flatMap(entry => [entry.slot, ...(entry.occupies ?? [])])), outfit = [];
  for (const id of buildReferences(ctx.catalogue, ctx.entry.build, ctx.entry.poseSet).defaultProofOutfit ?? ctx.catalogue.defaultProofOutfit ?? []) {
    const fixture = ctx.catalogue.proofFixtures[id];
    if (!slots.has(fixture.slot)) outfit.push(await readFixture(id));
  }
  const legacyBody = [];
  if (outfit.some(p => p.entry.slot === 'bottom')) for (const id of ctx.catalogue.defaultProofBody ?? []) legacyBody.push(await readFixture(id));
  const ruleTrace = [];
  for (let board = 0; board < 4; board++) {
    const colors = palettes[board % 2];
    const withOutfit = board >= 2 && !compareRules && ctx.entry.slot !== 'body';
    const proofBase = ctx.entry.lock?.operation === 'replace' || (withOutfit && legacyBody.length) ? { info: ctx.base.info, data: Buffer.alloc(ctx.base.data.length) } : { info: ctx.base.info, data: tintComponent(ctx.base.data, colors, ['skin', 'detail']) };
    const selected = [...(compareRules && board < 2 ? [] : [{ entry: ctx.entry, data: component }]), ...others, ...(withOutfit ? [...legacyBody, ...outfit] : [])];
    const tinted = selected.map(piece => {
      if (!piece.canonical) return { ...piece, data: tintComponent(piece.data, colors, piece.entry.materials, piece.entry.lock?.detailMaterial) };
      const data = Buffer.from(piece.data), tint = piece.entry.tintMaterial ? colors[piece.entry.tintMaterial] : piece.entry.tint;
      if (tint) for (let p = 0; p < data.length; p += 4) for (let channel = 0; channel < 3; channel++) data[p + channel] = Math.round(data[p + channel] * tint[channel] / 255);
      return { ...piece, data };
    });
    for (const [index, frame] of ctx.manifest.frames.entries()) {
      const base = canonical(proofBase, frame);
      const facing = ['down', 'right', 'up', 'left'][frame.direction], pieces = resolveProofPieces(tinted, facing);
      if (index % 9 === 0) ruleTrace.push({ board, facing, visible: pieces.map(p => p.entry.id), hidden: tinted.filter(p => !pieces.includes(p)).map(p => p.entry.id) });
      const canvas = sharp(base, { raw: { width: 128, height: 192, channels: 4 } });
      const overlays = pieces.map(piece => ({ input: piece.canonical ? fixtureCell(piece.data, index) : canonical({ info: ctx.base.info, data: piece.data }, frame), raw: { width: 128, height: 192, channels: 4 } }));
      const cell = await canvas.composite(overlays).png().toBuffer();
      panels.push({ input: cell, left: (board % 2) * 1152 + (index % 9) * 128, top: Math.floor(board / 2) * 768 + Math.floor(index / 9) * 192 });
      // Rule comparisons begin with companions alone. Native approval pages
      // must show the component under review, not just that control board.
      if(ctx.catalogue.highResolution && (compareRules ? board>=2 : board<2)) {
        if(pieces.some(piece=>piece.canonical))throw new Error('Native proofs cannot use legacy fixtures');
        const raw={width:512,height:768,channels:4};
        const input=await sharp(canonical(proofBase,frame,[512,768]),{raw}).composite(pieces.map(piece=>({input:canonical({info:ctx.base.info,data:piece.data},frame,[512,768]),raw}))).png().toBuffer();
        nativePanels.push(input);
      }
    }
  }
  const path = output ? resolve(ctx.root, output) : resolve(ctx.root, ctx.catalogue.proofDirectory ?? 'art/proofs', `${ctx.entry.id}${withIds.length ? '--' + withIds.join('--') : ''}${compareRules ? '--rules' : ''}.png`);
  if (!path.endsWith('.png')) throw new Error('Proof output must be a PNG path');
  await mkdir(dirname(path), { recursive: true });
  await sharp({ create: { width: 2304, height: 1536, channels: 4, background: '#ece8df' } }).composite(panels).png().toFile(path);
  const nativeProofs=[];
  for(let page=0;page<nativePanels.length/4;page++) {
    const image=path.replace(/\.png$/,`.native-${page}.png`);
    await sharp({create:{width:1024,height:1536,channels:4,background:'#ece8df'}}).composite(nativePanels.slice(page*4,page*4+4).map((input,i)=>({input,left:i%2*512,top:Math.floor(i/2)*768}))).png().toFile(image);
    nativeProofs.push({image:image.slice(ctx.root.length+1),imageSha256:hash(await readFile(image)),frames:[0,1,2,3].map(i=>(page*4+i)%36),board:Math.floor(page/9)+(compareRules?2:0),palette:page<9?'warm':'cool',cell:[512,768]});
  }
  const walk = Buffer.alloc(512 * 192 * 9 * 4);
  for (let column = 0; column < 9; column++) for (let row = 0; row < 4; row++) {
    const cell = await sharp(panels[108 + row * 9 + column].input).flatten({ background: '#ece8df' }).ensureAlpha().raw().toBuffer();
    for (let y = 0; y < 192; y++) cell.copy(walk, ((column * 192 + y) * 512 + row * 128) * 4, y * 128 * 4, (y + 1) * 128 * 4);
  }
  await sharp(walk, { raw: { width: 512, height: 192 * 9, channels: 4, pageHeight: 192 } }).gif({ loop: 0, delay: ctx.pose?.frameDurations ?? [650, 130, 130, 130, 130, 130, 130, 130, 130] }).toFile(path.replace(/\.png$/, '.gif'));
  const valid = checks.every(c => c.valid);
  await writeFile(path.replace(/\.png$/, '.json'), JSON.stringify({ ...report, ...(nativeProofs.length ? {nativeProofs} : {}), ...(ctx.entry.poseSet && ctx.entry.poseSet !== 'walk' ? {poseSet:ctx.entry.poseSet} : {}), valid, checks: checks.map(c => ({ id: c.id, valid: c.valid, errors: c.errors })), boards: compareRules ? ['companions only · warm', 'companions only · cool', 'component + companions · warm', 'component + companions · cool'] : ['base · warm', 'base · cool', 'existing outfit · warm', 'existing outfit · cool'], with: withIds, sources, ruleTrace, approved: false, note: 'Diagnostic proof; visual review and a passing check are required before approval.' }, null, 2) + '\n');
  return { path, valid, errors: checks.reduce((sum, c) => sum + c.errors.length, 0) };
}

export async function main(args = process.argv.slice(2), root = ROOT) {
  const [command, ...rest] = args;
  if (command === 'bake') { await (await import('./bake-character-sheet.mjs')).main(rest, root); return; }
  if (command === 'reference') { await (await import('./character-kit-reference.mjs')).main(rest, root); return; }
  const option = name => { const i = rest.indexOf(name); return i < 0 ? undefined : rest[i + 1]; };
  if (command === 'translate') {
    if (!rest[0] || !option('--registration') || !option('--offsets') || !option('--out')) throw new Error('Usage: translate <candidate.png> --registration <registration.json> --offsets <offsets.json> --out <prepared.png>');
    console.log(JSON.stringify(await (await import('./character-kit-reference.mjs')).translateCandidate(rest[0], option('--registration'), option('--offsets'), option('--out'), root))); return;
  }
  if (command === 'reproject') {
    if (!rest[0] || !option('--from') || !option('--to') || !option('--out')) throw new Error('Usage: reproject <candidate.png> --from <registration.json> --to <registration.json> --out <prepared.png>');
    console.log(JSON.stringify(await (await import('./character-kit-reference.mjs')).reprojectCandidate(rest[0], option('--from'), option('--to'), option('--out'), root))); return;
  }
  const requestedPose = option('--pose-set');
  if (rest.includes('--pose-set') && (!requestedPose || requestedPose.startsWith('--'))) throw new Error('--pose-set needs a value');
  const cataloguePath = option('--catalogue') ?? `${KIT}/catalogue.json`;
  const catalogue = await json(resolve(root, cataloguePath));
  if (requestedPose) poseDefinition(catalogue, requestedPose);
  const helpers = { extract, material, tintComponent };
  const verify = async id => {
    const ctx = await context(id, root, catalogue), locked = await readLocked(ctx);
    const report = checkPixels(ctx.base, locked, ctx.mask, ctx.manifest, ctx.entry);
    if(command==='build-catalogue'&&catalogue.highResolution)console.error(`Checked ${id}: ${report.valid?'valid':'invalid'}`);
    return { ctx, locked, report };
  };
  if (command === 'build-catalogue') {
    const compiled = await buildCatalogue(root, catalogue, verify);
    await syncCharacterLabels(root, catalogue);
    const coverage = execFileSync(process.execPath, [resolve(root, 'scripts/i18n-coverage.mjs'), '--write'], { cwd: root, encoding: 'utf8' });
    console.log(coverage.trim());
    const actionCount = Object.values(compiled.poseSets ?? {}).reduce((count, pose) => count + pose.components.length, 0);
    const expressionCount = Object.values(compiled.expressions ?? {}).reduce((count, expression) => count + expression.components.length, 0);
    console.log(`Compiled ${compiled.components.length} walking components, ${actionCount} action components and ${expressionCount} expression components; asset version ${compiled.assetVersion}`); return;
  }
  if (command === 'batch') {
    const selected = catalogue.entries.filter(entry => (entry.poseSet ?? 'walk') === (requestedPose ?? 'walk') && entry.status === (option('--status') ?? 'candidate') && (!option('--slot') || entry.slot === option('--slot')) && (!option('--build') || entry.build === option('--build')));
    const results = [];
    for (const entry of selected) {
      try {
        await main(['lock', entry.id, '--catalogue', cataloguePath], root);
        const { ctx, locked, report } = await verify(entry.id);
        await exportComponent(ctx, locked, report, helpers);
        const result = await proof(ctx, locked, []);
        results.push({ id: entry.id, result: result.valid ? 'exported; proof needs review' : 'proof failed' });
      } catch (error) { results.push({ id: entry.id, result: error.message }); process.exitCode = 1; }
    }
    console.table(results); return;
  }
  if (command === 'status') { console.table(catalogue.entries.filter(entry => !requestedPose || (entry.poseSet ?? 'walk') === requestedPose).map(({ id, slot, build, poseSet = 'walk', status }) => ({ id, slot, build, poseSet, status }))); return; }
  if (command === 'prompt') {
    const entry = catalogue.entries.find(e => e.id === rest[0]);
    if (!entry) throw new Error(`Unknown component ${rest[0]}`);
    const specs = await json(resolve(root, buildReferences(catalogue, entry.build, entry.poseSet).masks));
    if (requestedPose && (entry.poseSet ?? 'walk') !== requestedPose) throw new Error('Component pose set does not match --pose-set');
    console.log(promptFor(entry, specs[entry.mask], catalogue.promptVersion, catalogue.poseSets?.[entry.poseSet ?? 'walk'])); return;
  }
  if (command === 'kit') {
    const slot = option('--slot'), build = option('--build') ?? 'regular', mask = option('--mask');
    const specs = await json(resolve(root, buildReferences(catalogue, build, requestedPose).masks));
    const selected = Object.entries(specs).filter(([id, spec]) => spec.slot === slot && (!mask || id === mask));
    if (!catalogue.slots.some(s => s.id === slot) || !catalogue.builds[build] || !selected.length)
      throw new Error('Usage: kit --slot <catalogue slot> [--build regular] [--mask <slot mask>] [--rows] [--pose-set walk]');
    for (const [id, spec] of selected) {
      const entry = { id: `kit-${id}`, slot, build, ...(requestedPose && requestedPose !== 'walk' ? {poseSet:requestedPose} : {}), mask: id, materials: spec.materials ?? ['primary', 'secondary', 'skin', 'detail'], prompt: 'Paint only the selected component in this region. Choose a catalogue entry and run prompt <id> for its complete design instructions.' };
      console.log(await writeKit(await contextForEntry(entry, catalogue, root), rest.includes('--rows')));
    }
    return;
  }
  if (!['lock', 'check', 'proof', 'export'].includes(command)) throw new Error('Usage: character-kit.mjs kit|prompt|lock|check|proof|export|batch|build-catalogue|bake|reference|reproject|translate|status');
  const ctx = await context(rest[0], root, catalogue, requestedPose);
  if (command === 'lock') {
    const candidateInput = rest[1] && !rest[1].startsWith('--') ? rest[1] : ctx.entry.candidate;
    const candidatePath = resolve(root, candidateInput), candidate = await load(candidatePath);
    const locked = lockPixels(ctx.base, candidate, ctx.mask, ctx.entry.materials, ctx.entry.lock, ctx.manifest), output = resolve(root, ctx.entry.locked);
    const metadata = { ...provenance(ctx, hash(await readFile(candidatePath))), candidate: candidateInput, lockedSha256: hash(locked) };
    await mkdir(dirname(output), { recursive: true }); await png(locked, ctx.base.info, output);
    await writeFile(`${output}.json`, JSON.stringify(metadata, null, 2) + '\n');
    await writeFile(output.replace(/\.png$/, '.prompt.txt'), promptFor(ctx.entry, ctx.spec, ctx.catalogue.promptVersion, ctx.pose));
    console.log(output); return;
  }
  const locked = await readLocked(ctx);
  if (command === 'export') {
    const report = checkPixels(ctx.base, locked, ctx.mask, ctx.manifest, ctx.entry);
    console.log(JSON.stringify(await exportComponent(ctx, locked, report, helpers))); return;
  }
  if (command === 'check') {
    const report = checkPixels(ctx.base, locked, ctx.mask, ctx.manifest, ctx.entry);
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 1;
  } else console.log(JSON.stringify(await proof(ctx, locked, (option('--with') ?? '').split(',').filter(Boolean), rest.includes('--rules'), option('--out'))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
