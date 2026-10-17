#!/usr/bin/env node
/**
 * Screenshots a town as the game draws it: painted ground, features and scenery, rendered by the play
 * renderers in headless Chromium through `web/world-view.html`. `world-preview.mjs` draws the labelled plan;
 * this shows what players see.
 *
 *   node scripts/world-view.mjs <town> <out.png> [--file .world/world.json] [--region x,y,w,h] [--scale 0.5] [--period night]
 *
 * Without --file it uses the seed world. The Vite dev server and the browser start once per process and are
 * reused, so tools can call `townViewPNG` repeatedly.
 */
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Screenshots wider than this many pixels are scaled down to it. */
const MAX_PIXELS = 2400;
let session;

async function startSession() {
  const {createServer} = await import('vite');
  const {chromium} = await import('playwright');
  const server = await createServer({configFile: resolve(root, 'web/vite.config.ts'), root: resolve(root, 'web'), logLevel: 'error',
    server: {host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null}});
  await server.listen();
  const address = server.httpServer.address();
  // The installed Chrome when there is one, otherwise Playwright's own browser (npx playwright install chromium).
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({channel: 'chrome', args}).catch(() => chromium.launch({args}));
  return {server, browser, origin: `http://127.0.0.1:${address.port}`};
}

/** Closes the dev server and browser, so a script can exit. */
export async function closeWorldView() {
  const current = await session;
  session = undefined;
  if (!current) return;
  await current.browser.close();
  await current.server.close();
}

/**
 * PNG of one town region as rendered in game. `document` is a version 4 world document (the `document` of a
 * pulled world file). `region` is in world units; `scale` is screen pixels per world unit.
 */
export async function townViewPNG(document, town, {region, scale, period = 'day', timeout = 90000} = {}) {
  const scene = document.maps[town];
  if (!scene) throw new Error(`No town ${town}. Towns: ${Object.keys(document.maps).join(', ')}`);
  const view = region ?? {x: 0, y: 0, width: scene.width, height: scene.height};
  const pixels = scale ?? Math.min(1, MAX_PIXELS / view.width, MAX_PIXELS / view.height);
  session ??= startSession();
  const {browser, origin} = await session;
  const page = await browser.newPage({viewport: {width: Math.round(view.width * pixels), height: Math.round(view.height * pixels)}});
  try {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => { window.__WORLD_DOCUMENT__ = value; }, document);
    const query = new URLSearchParams({town, period, x: view.x, y: view.y, width: view.width, height: view.height, scale: pixels});
    await page.goto(`${origin}/world-view.html?${query}`);
    await page.waitForFunction(() => window.__WORLD_VIEW__?.ready || window.__WORLD_VIEW__?.error, undefined, {timeout});
    const failure = await page.evaluate(() => window.__WORLD_VIEW__?.error);
    if (failure || errors.length) throw new Error(`World view failed: ${failure ?? errors.join('; ')}`);
    return await page.locator('canvas').screenshot();
  } finally {
    await page.close();
  }
}

/** A single room, drawn by the same WorldInterior used during play. */
export async function roomViewPNG(spec,{timeout=90000}={}) {
  session ??= startSession();
  const {browser,origin}=await session;
  const page=await browser.newPage({viewport:{width:1536,height:1024}});
  try {
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(value=>{window.__ROOM_SPEC__=value;},spec);
    await page.goto(`${origin}/room-view.html`);
    await page.waitForFunction(()=>window.__ROOM_VIEW__?.ready || window.__ROOM_VIEW__?.error,undefined,{timeout});
    const failure=await page.evaluate(()=>window.__ROOM_VIEW__?.error);
    if(failure || errors.length)throw new Error(`Room view failed: ${failure ?? errors.join('; ')}`);
    return await page.locator('canvas').screenshot();
  }finally{await page.close();}
}

async function main() {
  const [town, out, ...rest] = process.argv.slice(2);
  if (!town || !out) throw new Error('Usage: node scripts/world-view.mjs <town> <out.png> [--file world.json] [--region x,y,w,h] [--scale s] [--period day|night]');
  const option = name => { const index = rest.indexOf(`--${name}`); return index >= 0 ? rest[index + 1] : undefined; };
  const file = option('file') ?? resolve(root, 'content/world-seed.json');
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  const document = parsed.document ?? parsed;
  const regionText = option('region');
  const [x, y, width, height] = regionText ? regionText.split(',').map(Number) : [];
  const png = await townViewPNG(document, town, {region: regionText ? {x, y, width, height} : undefined,
    scale: option('scale') ? Number(option('scale')) : undefined, period: option('period') ?? 'day'});
  await writeFile(out, png);
  await closeWorldView();
  console.log(`Wrote ${resolve(out)}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
