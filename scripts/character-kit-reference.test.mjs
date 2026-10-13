import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { toNative, fitReferenceFrames, makeReference, reprojectCandidate, reprojectPixels, translateCandidate } from './character-kit-reference.mjs';
import { canonical } from './character-kit-pixels.mjs';
import { main } from './character-kit.mjs';

const root = resolve(import.meta.dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path));
const registrationPath = 'web/public/assets/player-layers/manifest.json';

test('direct reprojection preserves identity and samples alpha without neighbour-cell bleed', () => {
  const image = {info:{width:4,height:2},data:Buffer.alloc(4*2*4)};
  image.data.set([255,0,0,255],0);
  image.data.set([0,255,0,255],8);
  const source = {frames:[0,2].map(left=>({transform:{scale:.5,offset:{x:17,y:13},sourceCell:{left,top:0,width:2,height:2}}}))};
  assert.deepEqual(reprojectPixels(image,source,source),image.data);
  // Half a source pixel right: transparent samples must not darken RGB, and
  // the next cell's green pixel must never leak into the first cell.
  const target=structuredClone(source);target.frames[0].transform.offset.x+=.25;
  const result=reprojectPixels(image,source,target);
  assert.deepEqual([...result.subarray(0,4)],[255,0,0,128]);
  assert.deepEqual([...result.subarray(4,8)],[0,0,0,0]);
  assert.deepEqual([...result.subarray(8,12)],[0,255,0,255]);
});

test('integer alignment moves whole frames without resampling, crossing cells or clipping paint', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'character-translate-'));
  try {
    const registration = await json(resolve(root, registrationPath));
    await writeFile(resolve(dir, 'registration.json'), JSON.stringify(registration));
    const offsets = Array.from({ length: 36 }, () => ({ x: 0, y: 0 }));
    offsets[8].y = -2;
    await writeFile(resolve(dir, 'offsets.json'), JSON.stringify(offsets));
    const pixels = Buffer.alloc(1536 * 1024 * 4);
    const c = registration.frames[8].transform.sourceCell;
    const p = ((c.top + 25) * 1536 + c.left + 20) * 4;
    pixels.set([27, 93, 110, 127], p);
    pixels.set([90, 160, 160, 255], p + 4);
    pixels.set([10, 20, 30, 255], 100 * 1536 * 4);
    const writeCandidate = () => sharp(pixels, { raw: { width: 1536, height: 1024, channels: 4 } }).png().toFile(resolve(dir, 'candidate.png'));
    await writeCandidate();
    const original = await readFile(resolve(dir, 'candidate.png'));
    const result = await translateCandidate('candidate.png', 'registration.json', 'offsets.json', 'prepared.png', dir);
    const actual = await sharp(resolve(dir, 'prepared.png')).raw().toBuffer();
    const expected = Buffer.from(pixels);
    expected.fill(0, p, p + 8); expected.set(pixels.subarray(p, p + 8), p - 2 * 1536 * 4);
    assert.deepEqual(actual, expected);
    assert.deepEqual(await readFile(resolve(dir, 'candidate.png')), original);
    assert.equal(result.outputSha256, hash(await readFile(resolve(dir, 'prepared.png'))));
    const before = await readFile(resolve(dir, 'prepared.png'));
    pixels.set([90, 160, 160, 255], (c.top * 1536 + c.left + 20) * 4);
    await writeCandidate();
    await assert.rejects(translateCandidate('candidate.png', 'registration.json', 'offsets.json', 'prepared.png', dir), /clip visible paint/);
    assert.deepEqual(await readFile(resolve(dir, 'prepared.png')), before);
    offsets[8].y = -9; await writeFile(resolve(dir, 'offsets.json'), JSON.stringify(offsets));
    await assert.rejects(translateCandidate('candidate.png', 'registration.json', 'offsets.json', 'prepared.png', dir), /bounded integer offsets/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('inverse registration never samples a neighbouring frame', async () => {
  const manifest = await json(resolve(root, registrationPath)), atlas = Buffer.alloc(1152 * 768 * 4);
  for (let y = 0; y < 192; y++) for (let x = 0; x < 128; x++) atlas.set([255, 0, 0, 255], (y * 1152 + x) * 4);
  const native = toNative(atlas, manifest, 1536, 1024);
  for (const frame of manifest.frames.slice(1)) {
    const c = frame.transform.sourceCell;
    for (let y = c.top; y < c.top + c.height; y++) assert.ok(native.subarray((y * 1536 + c.left) * 4, (y * 1536 + c.left + c.width) * 4).every(byte => byte === 0));
  }
  assert.throws(() => toNative(atlas.subarray(4), manifest, 1536, 1024), /36-frame/);
});

test('reference fitting retains complete painted bounds using whole-frame transforms', async () => {
  const old = await json(resolve(root, registrationPath)), atlas = Buffer.alloc(1152 * 768 * 4);
  for (let i = 0; i < 36; i++) for (let y = 45; y <= 175; y++) for (let x = 12; x <= 120; x++) atlas.set([90, 150, 150, 255], ((Math.floor(i / 9) * 192 + y) * 1152 + i % 9 * 128 + x) * 4);
  const snapshot = JSON.stringify(old), { manifest, adjustments } = fitReferenceFrames(atlas, old);
  assert.equal(JSON.stringify(old), snapshot); assert.ok(adjustments.length);
  const native = { data: toNative(atlas, manifest, 1536, 1024), info: { width: 1536, height: 1024 } };
  for (const [i, frame] of manifest.frames.entries()) {
    assert.deepEqual(frame.transform.sourceCell, old.frames[i].transform.sourceCell);
    const cell = canonical(native, frame);
    for (const [x, y] of [[12, 45], [120, 45], [12, 175], [120, 175], [64, 100]]) assert.ok(cell[(y * 128 + x) * 4 + 3] > 64, `Frame ${i} clips ${x}/${y}`);
  }
});

test('reference import is reproducible and refuses changed source bytes before writing', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'character-reference-'));
  try {
    const specPath = 'art/source/character-kit/references/regular-walk.json', spec = await json(resolve(root, specPath));
    for (const path of [specPath, spec.registration, ...spec.layers.map(layer => layer.path)]) {
      await mkdir(resolve(dir, path, '..'), { recursive: true }); await writeFile(resolve(dir, path), await readFile(resolve(root, path)));
    }
    const result = await makeReference(specPath, 'reference.png', dir), first = await readFile(result.path);
    await makeReference(specPath, 'reference.png', dir); assert.deepEqual(await readFile(result.path), first);
    const metadata = await json(resolve(dir, 'reference.registration.json'));
    assert.equal(metadata.sourceSha256, hash(first)); assert.equal(metadata.frames.length, 36);
    assert.equal(metadata.alpha, undefined); // Never copy obsolete master-alpha claims.
    await writeFile(resolve(dir, spec.layers[0].path), 'changed');
    await assert.rejects(makeReference(specPath, 'reference.png', dir), /Changed reference source/);
    assert.deepEqual(await readFile(result.path), first);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('prepared candidates preserve raw sources and bind their two registrations', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'character-reproject-'));
  try {
    const candidate = 'art/source/character-kit/headwear-cap-candidate-1.png', target = 'art/source/character-kit/references/regular-walk.registration.json';
    for (const path of [candidate, registrationPath, target]) { await mkdir(resolve(dir, path, '..'), { recursive: true }); await writeFile(resolve(dir, path), await readFile(resolve(root, path))); }
    const original = await readFile(resolve(dir, candidate));
    const result = await reprojectCandidate(candidate, registrationPath, target, 'prepared.png', dir);
    assert.deepEqual(await readFile(resolve(dir, candidate)), original);
    assert.equal(result.sources[0].sha256, hash(original)); assert.equal(result.sources.length, 3);
    assert.equal(result.outputSha256, hash(await readFile(resolve(dir, 'prepared.png'))));
    const info = await sharp(resolve(dir, 'prepared.png')).metadata(); assert.equal(info.width, 1536); assert.equal(info.height, 1024);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('staged catalogue checks are read-only and preserve the active catalogue', async t => {
  const path = resolve(root, 'art/source/character-kit/catalogue.json'), before = await readFile(path);
  const output = t.mock.method(console, 'log', () => {});
  await main(['check', 'body-regular', '--catalogue', 'art/source/character-kit/catalogue-walk-staging.json'], root);
  assert.equal(JSON.parse(output.mock.calls[0].arguments[0]).valid, true);
  assert.deepEqual(await readFile(path), before);
});

test('prepared and reference source changes reject lock/check without replacing locked art', async t => {
  const dir = await mkdtemp(resolve(tmpdir(), 'character-prepared-check-'));
  t.mock.method(console, 'log', () => {});
  try {
    const cataloguePath = 'art/source/character-kit/catalogue.json', catalogue = await json(resolve(root, cataloguePath));
    const entry = catalogue.entries.find(entry => entry.id === 'headwear-cap'), build = catalogue.builds.regular;
    const registration = await json(resolve(root, catalogue.registration)), preparation = await json(resolve(root, entry.preparedCandidate));
    const paths = new Set([cataloguePath, catalogue.registration, build.master, build.mannequin, 'art/source/character-kit/masks.json', entry.candidate, entry.preparedCandidate, entry.generationPrompt, entry.locked, `${entry.locked}.json`,
      ...preparation.sources.map(source => source.path), registration.reference.spec, registration.reference.registration, ...registration.reference.sources.map(source => source.path)]);
    for (const path of paths) { await mkdir(resolve(dir, path, '..'), { recursive: true }); await writeFile(resolve(dir, path), await readFile(resolve(root, path))); }
    await main(['check', entry.id], dir);
    const before = await readFile(resolve(dir, entry.locked)), raw = preparation.sources[0].path;
    await writeFile(resolve(dir, raw), 'changed raw candidate');
    await assert.rejects(main(['lock', entry.id], dir), /Prepared candidate source changed/);
    assert.deepEqual(await readFile(resolve(dir, entry.locked)), before);
    await writeFile(resolve(dir, raw), await readFile(resolve(root, raw)));
    await writeFile(resolve(dir, registration.reference.sources[0].path), 'changed reference layer');
    await assert.rejects(main(['check', entry.id], dir), /Reference source changed/);
    assert.deepEqual(await readFile(resolve(dir, entry.locked)), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('revised mannequin follows the existing walk without the old doubled lower legs', async () => {
  const load = path => sharp(resolve(root, path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bottoms = await Promise.all(['bottom-detail', 'bottom-fabric'].map(id => load(`web/public/assets/player-layers/${id}-preview.webp`)));
  const exposed = async (bodyPath, registrationPath) => {
    const body = await load(bodyPath), registration = await json(resolve(root, registrationPath)), counts = [];
    for (const [index, frame] of registration.frames.entries()) {
      const cell = canonical(body, frame); let count = 0;
      for (let y = Math.ceil(frame.waist.y + 25); y < 192; y++) for (let x = 0; x < 128; x++) {
        const p = ((Math.floor(index / 9) * 192 + y) * 1152 + index % 9 * 128 + x) * 4;
        if (cell[(y * 128 + x) * 4 + 3] > 128 && bottoms.every(bottom => bottom.data[p + 3] < 64)) count++;
      }
      counts.push(count);
    }
    return counts;
  };
  const before = await exposed('art/source/character-kit/body-regular.png', registrationPath);
  const after = await exposed('art/source/character-kit/body-regular-walk.png', 'art/source/character-kit/references/regular-walk.registration.json');
  assert.ok(after.every(count => count < 80), 'Only small edge differences may remain under the legacy boots/trousers');
  assert.ok(after.reduce((a, b) => a + b) < before.reduce((a, b) => a + b) * .1, 'Migration must remove the old exposed stride');
});
