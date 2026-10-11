import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSceneAuthoringMiddleware } from './scene-authoring-service.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'atlas-authoring-'));
  const source = join(root, 'web/src/data/world-scenes.json');
  await mkdir(join(root, 'web/src/data'), { recursive: true });
  await writeFile(source, JSON.stringify({ version: 2, maps: {} }));
  const compile = async document => { if (document.invalid) throw Error('lindenhafen: spawn cannot reach the station'); return { document, contentVersion: 'content' }; };
  const middleware = createSceneAuthoringMiddleware({ root, maxBytes: 1024, loadCompiler: async () => ({
    compileSceneDocument: compile, saveSceneDocument: async document => { await compile(document); await writeFile(source, JSON.stringify(document)); },
  }) });
  const origin = 'http://localhost:5197';
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const invoke = async (path, method = 'GET', body, extra = {}) => {
    const request = new PassThrough();
    request.url = path; request.method = method; request.socket = { remoteAddress: '127.0.0.1' };
    request.headers = { host: 'localhost:5197', 'content-type': 'application/json', origin, ...extra };
    return new Promise(resolve => {
      const response = { statusCode: 200, setHeader() {}, end(value = '{}') { resolve({ status: this.statusCode, json: async () => JSON.parse(value) }); } };
      void middleware(request, response, () => { response.statusCode = 404; response.end(); });
      request.end(body === undefined ? '' : JSON.stringify(body));
    });
  };
  const get = () => invoke('/__authoring/world');
  const put = (document, revision, extra = {}) => invoke('/__authoring/world', 'PUT', document, { 'if-match': `"${revision}"`, ...extra });
  return { source, origin, get, put, invoke };
}

test('authoring saves only the expected revision and preserves files after failed validation', async t => {
  const api = await fixture(t), initial = await (await api.get()).json();
  const saved = await api.put({ version: 2, maps: { test: {} } }, initial.revision);
  assert.equal(saved.status, 200);
  const next = await saved.json(); assert.notEqual(next.revision, initial.revision);
  assert.equal((await api.put({ version: 2, maps: {} }, initial.revision)).status, 409);
  const failed = await api.put({ invalid: true }, next.revision); assert.equal(failed.status, 422);
  assert.match((await failed.json()).diagnostics[0], /cannot reach/);
  assert.deepEqual(JSON.parse(await readFile(api.source, 'utf8')), next.document);
});

test('authoring rejects other origins, oversized requests, and arbitrary paths', async t => {
  const api = await fixture(t), initial = await (await api.get()).json();
  assert.equal((await api.put({}, initial.revision, { origin: 'https://example.com' })).status, 403);
  assert.equal((await api.put({ text: 'x'.repeat(1100) }, initial.revision)).status, 413);
  assert.equal((await api.invoke('/__authoring/arbitrary')).status, 404);
});

test('concurrent saves with one revision permit exactly one writer', async t => {
  const api = await fixture(t), initial = await (await api.get()).json();
  const results = await Promise.all([api.put({ version: 2, maps: { one: {} } }, initial.revision), api.put({ version: 2, maps: { two: {} } }, initial.revision)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});
