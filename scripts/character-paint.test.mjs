import test from 'node:test';
import assert from 'node:assert/strict';
import { combineMaterials, composeFrame } from '../web/src/character-compositor.mjs';

test('native fabric normalization preserves untinted detail and material coverage', () => {
  const fabric = Uint8Array.from([180, 180, 180, 127]);
  const detail = Uint8Array.from([160, 100, 40, 128]);
  const result = combineMaterials([
    { data: fabric, tint: 0xffe0b0, material: 'primary' },
    { data: detail, material: 'detail' },
  ], 180);
  assert.equal(result[3], 255);
  for (const [c, pigment] of [255, 224, 176].entries()) {
    assert.equal(result[c], Math.round((pigment * 127 + detail[c] * 128) / 255));
  }
});

test('paint finish preserves every alpha byte and repeats identically across registered frames', () => {
  const width = 64, height = 96, frame = new Uint8Array(width * height * 4);
  for (let y = 10; y < 90; y++) for (let x = 16; x < 48; x++) {
    frame.set([100, 130, 110, x === 16 ? 96 : 255], (y * width + x) * 4);
  }
  const images = new Map();
  for (const index of [0, 1, 9, 35]) images.set(`body.skin.${index}`, {
    data: frame, width, height, firstFrame: index, frameCount: 1, columns: 1,
  });
  const layers = [{ id: 'body', slot: 'body', materials: ['skin'], tints: { skin: 0xffffff } }];
  const painted = composeFrame(layers, images, 0, width, height);
  assert.notDeepEqual(painted, frame);
  for (let p = 0; p < frame.length; p += 4) {
    assert.equal(painted[p + 3], frame[p + 3], `alpha at ${p / 4}`);
    if (!frame[p + 3]) assert.deepEqual([...painted.slice(p, p + 4)], [...frame.slice(p, p + 4)]);
  }
  for (const index of [1, 9, 35]) assert.deepEqual(composeFrame(layers, images, index, width, height), painted);
});

test('paint gives a warm exposed upper-left edge and darker lower-right contour', () => {
  const width = 64, height = 96, data = new Uint8Array(width * height * 4);
  for (let y = 10; y < 90; y++) for (let x = 16; x < 48; x++) data.set([120, 120, 120, 255], (y * width + x) * 4);
  const painted = composeFrame([{ id: 'body', slot: 'body', materials: ['skin'], tints: { skin: 0xffffff } }],
    new Map([['body.skin.0', { data, width, height, firstFrame: 0, frameCount: 1, columns: 1 }]]), 0, width, height);
  const upper = (10 * width + 16) * 4, lower = (89 * width + 47) * 4;
  assert.ok(painted[upper] > painted[lower]);
  assert.ok(painted[upper] > painted[upper + 2]);
});
