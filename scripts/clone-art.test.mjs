import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cloneFiles, objectPath, parseList, plan} from './clone-art.mjs';

const oidA = 'a'.repeat(64), oidB = 'b'.repeat(64), oidC = 'c'.repeat(64);
const pointer = oid => `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize 3\n`;

test('the LFS listing parses candidate pointers and unchanged content', () => {
  const entries = parseList(`${oidA} - art/source/a.png\n${oidB} * art/proofs/b.png\nnoise\n`);
  assert.deepEqual(entries, [{oid: oidA, pointer: true, path: 'art/source/a.png'}, {oid: oidB, pointer: false, path: 'art/proofs/b.png'}]);
});

test('pointers are cloned from the cache, duplicates share one source and missing objects are reported', () => {
  const base = mkdtempSync(join(tmpdir(), 'glotworld-art-'));
  try {
    const cache = join(base, 'cache'), root = join(base, 'work');
    mkdirSync(objectPath(cache, oidA).replace(/[^/]+$/, ''), {recursive: true});
    writeFileSync(objectPath(cache, oidA), 'AAA');
    mkdirSync(join(root, 'art/source/kit'), {recursive: true});
    for (const path of ['art/source/a.png', 'art/source/kit/a-copy.png', 'art/source/kit/c.png']) writeFileSync(join(root, path), pointer(oidA));
    writeFileSync(join(root, 'art/source/kit/c.png'), pointer(oidC));
    const entries = parseList([`${oidA} - art/source/a.png`, `${oidA} - art/source/kit/a-copy.png`, `${oidC} - art/source/kit/c.png`,
      `${oidB} * art/source/b.png`].join('\n'));
    const {clones, missing} = plan(entries, cache, root);
    assert.deepEqual(clones.map(entry => entry.path), ['art/source/a.png', 'art/source/kit/a-copy.png']);
    assert.deepEqual(missing.map(entry => entry.path), ['art/source/kit/c.png']);
    assert.equal(cloneFiles(clones, {cache, root}), 2);
    assert.equal(readFileSync(join(root, 'art/source/a.png'), 'utf8'), 'AAA');
    assert.equal(readFileSync(join(root, 'art/source/kit/a-copy.png'), 'utf8'), 'AAA');
    assert.equal(readFileSync(join(root, 'art/source/kit/c.png'), 'utf8'), pointer(oidC), 'a missing object leaves its pointer alone');
    assert.deepEqual(plan(parseList(`${oidA} * art/source/a.png`), cache), {clones: [], missing: []});
  } finally {
    rmSync(base, {recursive: true, force: true});
  }
});

test('edited art marked with a dash is preserved even when the old object is cached', () => {
  const base = mkdtempSync(join(tmpdir(), 'glotworld-art-edit-'));
  try {
    const cache = join(base, 'cache');
    mkdirSync(join(base, 'art/source'), {recursive: true});
    mkdirSync(objectPath(cache, oidA).replace(/[^/]+$/, ''), {recursive: true});
    writeFileSync(objectPath(cache, oidA), 'OLD');
    const file = join(base, 'art/source/bridge.png');
    const edited = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    writeFileSync(file, edited);
    for (const oid of [oidA, oidB]) {
      const result = plan(parseList(`${oid} - art/source/bridge.png`), cache, base);
      assert.deepEqual(result, {clones: [], missing: []});
      assert.equal(cloneFiles(result.clones, {cache, root: base}), 0);
      assert.deepEqual(readFileSync(file), edited);
    }
  } finally {
    rmSync(base, {recursive: true, force: true});
  }
});
