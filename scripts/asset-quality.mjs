/**
 * Graphics quality tiers for the shipped art. `web/public/assets` keeps the lossless masters; the
 * production build replaces each eligible image in `dist/assets` with a lossy full-resolution copy
 * (the High tier) and writes reduced copies under `dist/assets/q/<tier>/`. The game loads Low first
 * and swaps to the chosen tier in place, so every tier keeps the master's logical size, listed in
 * `assets/q/manifest.json`. Encodes are cached by content hash outside the checkout, so worktrees
 * and repeated builds share them.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { availableParallelism, homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { WEBP_QUALITY } from './webp-quality.mjs';

/** Scales relative to the master. High is the master's resolution, encoded lossy. */
export const QUALITY_TIERS = Object.freeze({ low: 0.5, medium: 0.75, high: 1 });
export const REDUCED_TIERS = Object.freeze(['low', 'medium']);
export const MANIFEST_PATH = 'q/manifest.json';
// Alpha stays lossless: the world compiler and contact tracing read silhouettes from it.
const ENCODER = Object.freeze({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 4 });
const ENCODER_ID = createHash('sha1').update(JSON.stringify([ENCODER, sharp.versions?.vips, 2])).digest('hex').slice(0, 10);
/**
 * Tooling-only sheets and layers that compositors read as exact pixels ship untouched. The avatar kit
 * (character-kit-hd) is tiered: its cells divide by four and the baker composes at the tier's cell.
 */
const LOSSLESS = [/^character-kit\//, /^player-layers\//, /^player-portraits\//, /^character-features\//, /^ui\//, /^player-walk\.webp$/, /^q\//];
/**
 * Images only ever drawn small in the interface. Dialogue portraits appear at 95 CSS px at most and the
 * shared 4x2 roundel sheet at 48 px, so three device pixels per CSS pixel is the ceiling.
 */
const DISPLAY_CAPS = [
  { test: /^character-portraits\//, max: [256, 256] },
  { test: /^portraits\.webp$/, max: [768, 384] },
];
/** Below this, a reduced copy saves too little to be worth a second request. */
const MIN_REDUCED_SIDE = 256;
/**
 * Town scenery was painted at very different densities (2 to 10 source pixels per world unit), so a
 * flat fraction left some buildings much sharper than their neighbours. Placed scenery atlases aim
 * at these densities instead; other art uses the tier's fraction.
 */
export const SCENERY_DENSITY = Object.freeze({ low: 1.6, medium: 2.4 });

const posix = path => path.split(sep).join('/');
const fit = ([width, height], scale) => [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];

/** What the build ships for one master image, or null when it ships untouched. */
export function qualityPlan(rel, width, height, density) {
  if (!rel.endsWith('.webp') || LOSSLESS.some(rule => rule.test(rel))) return null;
  const cap = DISPLAY_CAPS.find(rule => rule.test.test(rel));
  if (cap) {
    const scale = Math.min(1, cap.max[0] / width, cap.max[1] / height);
    return { high: fit([width, height], scale), reduced: {} };
  }
  // Animal sheets pack 128px cells with ~76px figures; halving the whole atlas
  // would reduce each animal below its displayed size even on the low tier.
  const reduced = !rel.startsWith('animals/') && Math.min(width, height) >= MIN_REDUCED_SIDE
    ? Object.fromEntries(REDUCED_TIERS.map(tier => [tier, fit([width, height], density ? Math.min(1, SCENERY_DENSITY[tier] / density) : QUALITY_TIERS[tier])]))
    : {};
  return { high: [width, height], reduced };
}

export function defaultCacheDir() {
  return process.env.ASSET_QUALITY_CACHE || join(homedir(), '.cache', 'glotworld-asset-quality');
}

/** One cached lossy encode of `buffer` at `size`. */
export async function encodeVariant(buffer, hash, [width, height], cacheDir = defaultCacheDir()) {
  const cached = join(cacheDir, hash.slice(0, 2), `${hash}-${width}x${height}-${ENCODER_ID}.webp`);
  try { return await readFile(cached); } catch { /* encode below */ }
  const image = sharp(buffer, { limitInputPixels: false });
  const meta = await image.metadata();
  const output = await (meta.width === width && meta.height === height ? image : image.resize(width, height, { kernel: 'lanczos3', fit: 'fill' }))
    .webp(ENCODER).toBuffer();
  await mkdir(dirname(cached), { recursive: true });
  const temporary = `${cached}.${process.pid}.${Math.random().toString(36).slice(2)}`;
  await writeFile(temporary, output);
  await rename(temporary, cached);
  return output;
}

const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const frameWidths = atlas => {
  const frames = atlas.frames ?? atlas.textures?.flatMap(texture => texture.frames) ?? {};
  const list = Array.isArray(frames) ? frames.map(frame => [frame.filename, frame]) : Object.entries(frames);
  return new Map(list.map(([name, frame]) => [name, frame.sourceSize?.w ?? frame.frame?.w]));
};

/**
 * The lowest source density (pixels per world unit) of each placed scenery atlas, keyed by its
 * image path. Placements come from the seed world; a frame is matched by name in its town's atlases
 * and the shared story atlases, directly or through the town's animation manifests.
 */
export async function sceneryDensities(assetsDir, seedPath) {
  const seed = await readJSON(seedPath).catch(() => null);
  if (!seed?.maps) return new Map();
  const atlases = new Map();
  for (const name of await readdir(assetsDir)) {
    if (!name.endsWith('.json') || name.endsWith('-animations.json')) continue;
    const atlas = await readJSON(join(assetsDir, name)).catch(() => null);
    const image = atlas?.meta?.image;
    if (image) atlases.set(image.split('?')[0], frameWidths(atlas));
  }
  const densities = new Map();
  for (const [town, map] of Object.entries(seed.maps)) {
    const animations = (await Promise.all(['day', 'night'].map(period => readJSON(join(assetsDir, `${town}-${period}-animations.json`)).catch(() => ({}))))).map(manifest => manifest.assets ?? {});
    const placements = [];
    (function collect(value) {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') {
        if (typeof value.asset === 'string' && typeof value.width === 'number' && value.width > 0) placements.push(value);
        Object.values(value).forEach(collect);
      }
    })(map);
    const local = [...atlases].filter(([image]) => image.startsWith(`${town}-`) || image.startsWith('story-quality-'));
    for (const placement of placements) {
      const name = placement.frame ?? placement.asset;
      const names = new Set([name]);
      for (const manifest of animations) {
        const entry = manifest[name];
        if (!entry) continue;
        for (const frame of [...(entry.frames ?? []), entry.base?.frame, ...(entry.overlays ?? []).map(overlay => overlay.frame)]) if (frame) names.add(frame);
      }
      for (const [image, frames] of local) for (const frame of names) {
        const width = frames.get(frame);
        if (!width) continue;
        const density = width / placement.width;
        densities.set(image, Math.min(densities.get(image) ?? Infinity, density));
      }
    }
  }
  return densities;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}

async function pool(items, limit, task) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const item = items[next++]; await task(item); }
  }));
}

/** Manifest entries for every master with reduced tiers: logical [width, height]. */
export async function qualityManifest(assetsDir, densities = new Map()) {
  const files = {};
  await pool((await walk(assetsDir)).filter(path => path.endsWith('.webp')), 16, async path => {
    const rel = posix(relative(assetsDir, path));
    if (LOSSLESS.some(rule => rule.test(rel))) return;
    const { width, height } = await sharp(path).metadata();
    const plan = qualityPlan(rel, width, height, densities.get(rel));
    if (plan && Object.keys(plan.reduced).length) files[rel] = [width, height];
  });
  return manifestFrom(files);
}

function manifestFrom(files) {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  return { version: 1, tiers: Object.fromEntries(REDUCED_TIERS.map(tier => [tier, QUALITY_TIERS[tier]])), files: sorted };
}

/** Rewrites a built `assets` directory in place. Returns byte totals per tier. */
export async function buildQualityTiers(assetsDir, { cacheDir = defaultCacheDir(), log = () => {}, densities = new Map() } = {}) {
  assetsDir = resolve(assetsDir);
  const masters = (await walk(assetsDir)).filter(path => path.endsWith('.webp') && !posix(relative(assetsDir, path)).startsWith('q/'));
  const files = {};
  const totals = { master: 0, high: 0, low: 0, medium: 0, untouched: 0 };
  let done = 0;
  await pool(masters, Math.max(2, availableParallelism() - 1), async path => {
    const rel = posix(relative(assetsDir, path));
    const buffer = await readFile(path);
    totals.master += buffer.length;
    const { width, height } = await sharp(buffer).metadata();
    const plan = qualityPlan(rel, width, height, densities.get(rel));
    if (!plan) { totals.untouched += buffer.length; totals.high += buffer.length; done++; return; }
    const hash = createHash('sha1').update(buffer).digest('hex');
    const high = await encodeVariant(buffer, hash, plan.high, cacheDir);
    // A capped image always ships reduced; a full-size one only when lossy actually saves bytes.
    const resized = plan.high[0] !== width || plan.high[1] !== height;
    if (resized || high.length < buffer.length) await writeFile(path, high);
    totals.high += resized || high.length < buffer.length ? high.length : buffer.length;
    for (const [tier, size] of Object.entries(plan.reduced)) {
      const output = await encodeVariant(buffer, hash, size, cacheDir);
      const target = join(assetsDir, 'q', tier, rel);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, output);
      totals[tier] += output.length;
    }
    if (Object.keys(plan.reduced).length) files[rel] = [width, height];
    if (++done % 1000 === 0) log(`asset quality: ${done}/${masters.length}`);
  });
  await mkdir(join(assetsDir, 'q'), { recursive: true });
  await writeFile(join(assetsDir, MANIFEST_PATH), JSON.stringify(manifestFrom(files)));
  return { ...totals, files: Object.keys(files).length };
}

const MB = bytes => `${(bytes / 1048576).toFixed(1)} MiB`;

/**
 * Production builds rewrite `dist/assets`; the dev server serves the manifest and reduced copies on
 * demand from the masters, so every tier can be tried without a build.
 */
export function assetQualityPlugin(root) {
  const publicAssets = resolve(root, 'web/public/assets');
  let outDir, manifest, densities;
  const seedPath = resolve(root, 'content/world-seed.json');
  return {
    name: 'asset-quality',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = decodeURIComponent((request.url || '').split('?')[0]);
        if (!path.startsWith('/assets/q/')) return next();
        try {
          if (path === `/assets/${MANIFEST_PATH}`) {
            densities ??= sceneryDensities(publicAssets, seedPath);
            manifest ??= densities.then(known => qualityManifest(publicAssets, known));
            response.setHeader('Content-Type', 'application/json');
            return response.end(JSON.stringify(await manifest));
          }
          const match = /^\/assets\/q\/(low|medium)\/(.+\.webp)$/.exec(path);
          const source = match && resolve(publicAssets, match[2]);
          if (!match || !source.startsWith(publicAssets + sep)) return next();
          const buffer = await readFile(source);
          const { width, height } = await sharp(buffer).metadata();
          densities ??= sceneryDensities(publicAssets, seedPath);
          const size = qualityPlan(match[2], width, height, (await densities).get(match[2]))?.reduced[match[1]];
          if (!size) return next();
          const output = await encodeVariant(buffer, createHash('sha1').update(buffer).digest('hex'), size);
          response.setHeader('Content-Type', 'image/webp');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(output);
        } catch (error) { next(error); }
      });
    },
    async closeBundle() {
      if (!outDir) return;
      const assets = join(outDir, 'assets');
      try { await stat(assets); } catch { return; }
      const started = Date.now();
      const totals = await buildQualityTiers(assets, { log: message => this.info?.(message), densities: await sceneryDensities(publicAssets, seedPath) });
      console.log(`Asset quality: ${totals.files} tiered images in ${((Date.now() - started) / 1000).toFixed(1)} s; masters ${MB(totals.master)} -> high ${MB(totals.high)}, medium ${MB(totals.medium)}, low ${MB(totals.low)} (${MB(totals.untouched)} shipped untouched).`);
    },
  };
}
