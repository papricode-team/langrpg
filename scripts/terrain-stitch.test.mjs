import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stitchPair, stitchTerrain } from './terrain-stitch.mjs';

test('four overlapping sections reconstruct a coordinate-labelled terrain without offsets', () => {
  const width = 56, height = 40, data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    data[i] = x * 4; data[i + 1] = y * 6; data[i + 2] = (x + y) * 2;
  }
  const crop = (left, top) => {
    const pixels = Buffer.alloc(32 * 24 * 3);
    for (let y = 0; y < 24; y++) data.copy(pixels, y * 32 * 3, ((top + y) * width + left) * 3, ((top + y) * width + left + 32) * 3);
    return { width: 32, height: 24, data: pixels };
  };
  const result = stitchTerrain({ nw: crop(0, 0), ne: crop(24, 0), sw: crop(0, 16), se: crop(24, 16) }, 8);
  assert.equal(result.width, width); assert.equal(result.height, height);
  assert.deepEqual(result.data, data);
});

test('stitching retains every pixel outside the overlap', () => {
  const a = { width: 40, height: 30, data: Buffer.alloc(40 * 30 * 3, 35) };
  const b = { ...a, data: Buffer.alloc(40 * 30 * 3, 210) };
  const result = stitchPair(a, b, 16);
  for (let y = 0; y < 30; y++) {
    assert.ok(result.data.subarray(y * 64 * 3, (y * 64 + 24) * 3).every(c => c === 35));
    assert.ok(result.data.subarray((y * 64 + 40) * 3, (y + 1) * 64 * 3).every(c => c === 210));
  }
  assert.throws(() => stitchPair(a, { ...b, height: 29 }, 16), /matching edges/);
});
