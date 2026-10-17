#!/usr/bin/env node
/**
 * Record the landing page's muted gameplay loop from the real game.
 *
 *   npm run build                                   # the recorder plays the production build
 *   node scripts/record-site-gameplay.mjs           # record a new take, cut and encode it
 *   node scripts/record-site-gameplay.mjs --cut     # re-cut and re-encode the last take only
 *
 * It boots the Go server on web/dist with a throwaway JSON store (or uses
 * GAMEPLAY_URL if a server is already running), starts a new guest and films
 * three moments: the train arriving in Lindenhafen, answering Otto in German,
 * and walking across the station square. Frames come from the DevTools
 * screencast at 1.5× pixel density. The cut points are markers logged during
 * play; the cutscene, which is drawn on the canvas, is found by its letterbox.
 * Segments are joined with short dissolves, dip through black at both ends so
 * the loop restarts softly, and are encoded to WebM (VP9) and MP4 (H.264) in
 * site/public/video/. The full-quality take stays in output/gameplay-recording/
 * for review. Requires ffmpeg with libvpx-vp9 and libx264; ATLAS_CHROMIUM_PATH
 * selects a local Chrome when Playwright's own browser is not installed.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, 'output/gameplay-recording');
const frames = join(work, 'frames');
const outDir = join(root, 'site/public/video');
// Keep in step with the video budget in scripts/check-site.mjs.
const maxBytes = 1.5 * 1024 * 1024;
const viewport = { width: 1280, height: 720 };
const fps = 30;
const encoding = { width: 1280, height: 720, webmCrf: 42, mp4Crf: 30 };

function ffmpeg(args) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`ffmpeg failed: ffmpeg ${args.join(' ')}`);
}
const freePort = () => new Promise((ok, fail) => {
  const server = createServer().listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => ok(port)); }).on('error', fail);
});

async function startServer() {
  if (process.env.GAMEPLAY_URL) return { origin: process.env.GAMEPLAY_URL.replace(/\/$/, ''), stop: async () => {} };
  await stat(join(root, 'web/dist/game/index.html')).catch(() => { throw new Error('Run npm run build first: web/dist/game/index.html is missing.'); });
  const port = await freePort(), data = await mkdtemp(join(tmpdir(), 'glotworld-gameplay-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn('go', ['run', '.'], {
    cwd: join(root, 'server'), stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32',
    env: { ...process.env, PORT: String(port), STATIC_DIR: join(root, 'web/dist'), DATA_PATH: join(data, 'state.json'), ALLOWED_ORIGINS: origin, DATABASE_URL: '' },
  });
  let log = '';
  child.stderr.on('data', chunk => { log = (log + chunk).slice(-4000); });
  const stop = async () => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    await rm(data, { recursive: true, force: true });
  };
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(`${origin}/api/health`)).ok) return { origin, stop }; } catch { /* still compiling */ }
    if (child.exitCode !== null || attempt >= 120) { await stop(); throw new Error(`The game server did not become healthy:\n${log}`); }
    await new Promise(r => setTimeout(r, 1000));
  }
}

// A visible pointer so viewers can follow the reply choice; Playwright moves no real cursor.
function installPresentation() {
  addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div');
    cursor.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 24 L9 18.5 L13.5 28 L17.5 26.2 L13 16.8 L21 16.8 Z" fill="#fff8ea" stroke="#1d2a26" stroke-width="2" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', opacity: '0', transition: 'opacity .25s', filter: 'drop-shadow(0 2px 3px #0008)' });
    document.body.append(cursor);
    addEventListener('mousemove', event => { cursor.style.transform = `translate(${event.clientX - 3}px, ${event.clientY - 2}px)`; }, true);
    addEventListener('mousedown', () => { cursor.animate([{ scale: 1 }, { scale: .82 }, { scale: 1 }], { duration: 260 }); }, true);
    window.__recordingCursor = visible => { cursor.style.opacity = visible ? '1' : '0'; };
    // Notifications that would cover the cutscene or the reply are dismissed as a player would.
    setInterval(() => document.querySelectorAll('.notification-dismiss').forEach(button => button.getClientRects().length && button.click()), 120);
  });
}

async function record(origin) {
  const browser = await chromium.launch({ ...(process.env.ATLAS_CHROMIUM_PATH ? { executablePath: process.env.ATLAS_CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1.5 });
    await context.addInitScript(installPresentation);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/game/`, { waitUntil: 'networkidle' });
    await page.locator('.primary-button').first().click();
    await page.locator('#confirm-languages').click();
    await page.locator('#name-entry-form [type=submit]').waitFor();

    const cdp = await context.newCDPSession(page);
    const captured = [];
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      captured.push({ at: Date.now(), data });
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    const markers = {};
    const mark = name => { markers[name] = Date.now(); };
    const glide = async (locator, steps = 28) => {
      const box = await locator.boundingBox();
      if (!box) throw new Error('A recording target is not visible.');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
    };

    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    await page.waitForTimeout(300);
    await page.locator('#name-entry-form [type=submit]').click();
    mark('start');

    const reply = page.locator('.dialogue-choice-submit').first();
    await reply.waitFor({ state: 'visible', timeout: 45_000 });
    await page.mouse.move(1150, 640);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__recordingCursor(true));
    mark('dialogue');
    await page.waitForTimeout(450);
    await glide(reply);
    await page.waitForTimeout(350);
    await reply.click();
    await page.getByText('Du kommst von Bahnsteig sieben?').first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    mark('dialogueEnd');
    const close = page.locator('.dialogue-close').first();
    await glide(close, 18);
    await close.click();
    await page.evaluate(() => window.__recordingCursor(false));
    await page.waitForTimeout(500);
    mark('walk');
    for (const [key, ms] of [['d', 1300], ['s', 1000]]) {
      await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
    }
    await page.waitForTimeout(450);
    mark('walkEnd');
    await cdp.send('Page.stopScreencast');
    if (errors.length) throw new Error(`The game reported errors while recording:\n${errors.join('\n')}`);
    if (captured.length < 200) throw new Error(`Only ${captured.length} frames were captured; the take would stutter.`);
    return { captured, markers };
  } finally {
    await browser.close();
  }
}

/** The cutscene draws a dark letterbox over the lit world; the character builder is dark at the edges too. */
async function cutsceneStart(list, after) {
  for (const frame of list) {
    if (frame.t < after) continue;
    const { data } = await sharp(join(frames, frame.file)).resize(160, 90, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const lum = (x, y) => { const o = (y * 160 + x) * 3; return 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]; };
    let dark = 0, side = 0;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 160; x++) if (lum(x, y) < 50) dark++;
    for (let y = 32; y < 62; y++) for (let x = 0; x < 24; x++) side += lum(x, y);
    if (dark / 960 >= 0.97 && side / 720 >= 45) return frame.t;
  }
  throw new Error('The arrival cutscene was not found in the take.');
}

async function saveTake({ captured, markers }) {
  await rm(work, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  const start = captured[0].at;
  const list = [];
  let concat = '';
  for (const [index, frame] of captured.entries()) {
    const file = `${String(index).padStart(6, '0')}.jpg`;
    await writeFile(join(frames, file), Buffer.from(frame.data, 'base64'));
    list.push({ file, t: (frame.at - start) / 1000 });
    const next = captured[index + 1]?.at ?? frame.at + 1000 / fps;
    concat += `file '${file}'\nduration ${((next - frame.at) / 1000).toFixed(4)}\n`;
  }
  // The concat demuxer needs the last file repeated to honour its duration.
  concat += `file '${list.at(-1).file}'\n`;
  await writeFile(join(frames, 'list.txt'), concat);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'), '-vf', `fps=${fps},scale=1920:1080:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', join(work, 'master.mp4')]);
  const at = Object.fromEntries(Object.entries(markers).map(([name, time]) => [name, (time - start) / 1000]));
  at.cutscene = await cutsceneStart(list, at.start);
  await writeFile(join(work, 'take.json'), JSON.stringify({ frames: captured.length, seconds: list.at(-1).t, markers: at }, null, 2) + '\n');
}

async function cut() {
  const { markers: at } = JSON.parse(await readFile(join(work, 'take.json'), 'utf8'));
  const segments = [
    [at.cutscene + 0.15, at.cutscene + 4.6], // the train pulls in under “Der Zug ist da.”
    [at.dialogue, at.dialogueEnd],            // choose “Guten Morgen!”, Otto replies
    [at.walk - 0.1, at.walkEnd],              // walk the station square
  ];
  const dissolve = 0.35, dip = 0.3;
  const lengths = segments.map(([a, b]) => b - a);
  const total = lengths.reduce((sum, length) => sum + length, 0) - dissolve * (segments.length - 1);
  const filters = segments.map(([a, b], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[s${i}]`);
  filters.push(`[s0][s1]xfade=transition=fade:duration=${dissolve}:offset=${(lengths[0] - dissolve).toFixed(3)}[j1]`);
  filters.push(`[j1][s2]xfade=transition=fade:duration=${dissolve}:offset=${(lengths[0] + lengths[1] - 2 * dissolve).toFixed(3)}[j2]`);
  // Dip through black at both ends so the loop restarts without a hard cut.
  filters.push(`[j2]fade=t=in:st=0:d=${dip},fade=t=out:st=${(total - dip).toFixed(3)}:d=${dip},scale=${encoding.width}:${encoding.height}:flags=lanczos,format=yuv420p[out]`);
  const graph = filters.join(';'), master = join(work, 'master.mp4');
  await mkdir(outDir, { recursive: true });
  const webm = join(outDir, 'gameplay.webm'), mp4 = join(outDir, 'gameplay.mp4');
  ffmpeg(['-i', master, '-filter_complex', graph, '-map', '[out]', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(encoding.webmCrf), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '1', webm]);
  ffmpeg(['-i', master, '-filter_complex', graph, '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(encoding.mp4Crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  for (const file of [webm, mp4]) {
    const { size } = await stat(file);
    console.log(`${file.replace(root + '/', '')}: ${(size / 1024).toFixed(0)} KiB`);
    if (size > maxBytes) throw new Error(`${file} exceeds the 1.5 MiB video budget; raise the CRF in this script or shorten a segment.`);
  }
  console.log(`Loop length ${total.toFixed(1)} s. Review the take in output/gameplay-recording/master.mp4.`);
}

if (!process.argv.includes('--cut')) {
  const server = await startServer();
  try { await saveTake(await record(server.origin)); }
  finally { await server.stop(); }
}
await cut();
