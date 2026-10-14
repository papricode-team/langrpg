import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = new URL('../web/src/data/world-scenes.json', import.meta.url);
const sourceText = await readFile(sourcePath, 'utf8');
const source = JSON.parse(sourceText);

function compile(input, args = ['--root', root]) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, ['scripts/admin-world-compiler.mjs', ...args], {cwd: root, stdio: ['pipe', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {stdout += chunk;});
    child.stderr.on('data', chunk => {stderr += chunk;});
    child.on('error', reject);
    child.stdin.on('error', error => {if (error.code !== 'EPIPE') reject(error);});
    child.on('close', code => accept({code, stdout, stderr}));
    child.stdin.end(input);
  });
}

test('publication bridge compiles canonical scenes and authority without source writes', async () => {
  const paths = ['server/world_maps.json', 'server/story_rules.json', 'server/expeditions.json', 'web/src/data/world-scene-version.json'];
  const before = await Promise.all(paths.map(path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
  const draft = structuredClone(source);
  draft.maps.lindenhafen.objects[0].x += 3;
  const result = await compile(JSON.stringify(draft));
  assert.equal(result.code, 0, result.stderr);
  const bundle = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(bundle).sort(), ['document', 'worldMaps', 'investigations', 'expeditions', 'contentVersion', 'diagnostics'].sort());
  assert.equal(bundle.contentVersion, bundle.worldMaps.contentVersion);
  assert.deepEqual(bundle.worldMaps.maps.lindenhafen.spawn, {x: draft.maps.lindenhafen.spawn.x / draft.maps.lindenhafen.width, y: draft.maps.lindenhafen.spawn.y / draft.maps.lindenhafen.height});
  for (const rule of bundle.investigations.rules) {
    const scene = draft.maps[rule.mapId];
    for (const target of [rule.npc, ...rule.objects]) {
      const anchor = [...scene.npcs, ...scene.objects].find(item => item.id === target.id);
      assert.deepEqual(target, {id: anchor.id, x: anchor.x / scene.width, y: anchor.y / scene.height});
    }
  }
  assert.deepEqual(bundle.expeditions, JSON.parse(before[2]));
  assert.ok(Array.isArray(bundle.diagnostics));
  assert.equal(await readFile(sourcePath, 'utf8'), sourceText);
  assert.deepEqual(await Promise.all(paths.map(path => readFile(new URL(`../${path}`, import.meta.url), 'utf8'))), before);
});

test('publication bridge rejects malformed JSON, oversized documents and unknown arguments', async () => {
  for (const [input, args, expected] of [
    ['{', undefined, /not valid JSON/],
    [' '.repeat(2 * 1024 * 1024 + 1), undefined, /2 MiB/],
    [sourceText, ['--write'], /Usage:/],
  ]) {
    const result = await compile(input, args);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    const failure = JSON.parse(result.stderr);
    assert.match(failure.error, expected);
    assert.ok(failure.diagnostics.length);
  }
});

test('publication bridge rejects path traversal and incomplete map content', async () => {
  const unsafe = structuredClone(source);
  unsafe.maps.lindenhafen.terrain[0].dayAsset = '/assets/../../etc/passwd.png';
  const traversal = await compile(JSON.stringify(unsafe));
  assert.equal(traversal.code, 1);
  assert.equal(traversal.stdout, '');
  assert.match(JSON.parse(traversal.stderr).error, /local \/assets image path/);

  const missing = structuredClone(source);
  delete missing.maps.waldruh;
  const invalid = await compile(JSON.stringify(missing));
  assert.equal(invalid.code, 1);
  assert.equal(invalid.stdout, '');
  assert.match(JSON.parse(invalid.stderr).error, /missing required map waldruh/);
});
