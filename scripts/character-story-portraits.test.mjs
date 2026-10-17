import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

test('Voss and Elise export dedicated native square portraits with bound provenance', async () => {
  const manifest = JSON.parse(await readFile('web/public/assets/story-cast/portraits-manifest.json', 'utf8'));
  assert.deepEqual(manifest.actors.map(actor => actor.id), ['inspector', 'elise']);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const actor of manifest.actors) {
    const [source, prompt, output] = await Promise.all([
      readFile(actor.source), readFile(actor.prompt), readFile(`web/public${actor.image}`),
    ]);
    assert.equal(hash(source), actor.sourceSha256);
    assert.equal(hash(prompt), actor.promptSha256);
    assert.equal(hash(output), actor.sha256);
    const native = await sharp(source).metadata(), runtime = await sharp(output).metadata();
    assert.ok(native.width >= 1024 && native.height >= 1024, 'retain the generated native master');
    assert.ok(actor.crop.width >= 724 && actor.crop.height >= 724, 'portrait crops never upscale tiny direction art');
    assert.ok(actor.crop.left + actor.crop.width <= native.width && actor.crop.top + actor.crop.height <= native.height);
    assert.deepEqual([runtime.width, runtime.height, runtime.format], [724, 724, 'webp']);
    assert.ok(output.length < 2 * 1024 * 1024);
    assert.match(prompt.toString(), /built-in image_gen/i);
    assert.match(prompt.toString(), /portraits.webp/);
  }
});
