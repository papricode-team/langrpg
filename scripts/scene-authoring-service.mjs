import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const revisionOf = text => createHash('sha256').update(text).digest('hex');
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const localAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const failure = (status, message) => Object.assign(new Error(message), { status });

/** Development-only, fixed-destination authoring. No request can choose a filesystem path. */
export function createSceneAuthoringMiddleware({ root, loadCompiler, maxBytes = 2 * 1024 * 1024 }) {
  const source = resolve(root, 'web/src/data/world-scenes.json');
  const compiler = loadCompiler ?? (() => import(pathToFileURL(resolve(root, 'scripts/scene-compiler.mjs')).href));
  let writes = Promise.resolve();
  const snapshot = async () => { const text = await readFile(source, 'utf8'); return { document: JSON.parse(text), revision: revisionOf(text) }; };
  return async (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!['/__authoring/world', '/__authoring/validate'].includes(url.pathname)) return next();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    const send = (status, value) => { response.statusCode = status; response.end(JSON.stringify(value)); };
    try {
      const host = new URL(`http://${request.headers.host ?? ''}`);
      if (!localHosts.has(host.hostname) || !localAddresses.has(request.socket.remoteAddress)) throw failure(403, 'The level editor save service is available only on localhost.');
      const mutation = request.method !== 'GET';
      if (mutation && request.headers.origin !== host.origin) throw failure(403, 'Save requests must originate from this editor on the same localhost address.');
      if (request.headers['sec-fetch-site'] === 'cross-site') throw failure(403, 'Cross-site authoring requests are not allowed.');
      if (request.method === 'GET' && url.pathname === '/__authoring/world') {
        const current = await snapshot(); response.setHeader('ETag', `"${current.revision}"`); return send(200, current);
      }
      const validating = request.method === 'POST' && url.pathname === '/__authoring/validate';
      if (!validating && !(request.method === 'PUT' && url.pathname === '/__authoring/world')) throw failure(405, 'Use GET to read, POST to validate, or PUT to save.');
      if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) throw failure(415, 'Authoring requests require application/json.');
      const body = await new Promise((accept, reject) => {
        let bytes = 0, chunks = [], rejected = false;
        request.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maxBytes) { if (!rejected) reject(failure(413, 'Scene document exceeds the authoring request limit.')); rejected = true; chunks = []; }
          else if (!rejected) chunks.push(Buffer.from(chunk));
        });
        request.on('end', () => { if (!rejected) { try { accept(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(failure(400, 'The scene document is not valid JSON.')); } } });
        request.on('error', reject);
      });
      const api = await compiler();
      if (validating) {
        const result = await api.compileSceneDocument(body, { root });
        return send(200, { valid: true, contentVersion: result.contentVersion, diagnostics: [] });
      }
      // Serialize the revision check and save together: two tabs cannot both win.
      const operation = writes.then(async () => {
        const current = await snapshot();
        if (request.headers['if-match'] !== `"${current.revision}"`) throw failure(409, 'This world changed on disk. Reload the saved world before applying your draft again. Your local draft has been retained.');
        await api.saveSceneDocument(body, { root });
        return snapshot();
      });
      writes = operation.catch(() => {});
      const saved = await operation;
      response.setHeader('ETag', `"${saved.revision}"`);
      return send(200, { ...saved, diagnostics: [] });
    } catch (error) {
      return send(error.status ?? (error.code === 'ENOENT' ? 503 : 422), { error: error.message ?? 'Unable to validate or save the world.', diagnostics: String(error.message ?? error).split('\n').filter(Boolean) });
    }
  };
}

/** Vite excludes this plugin from build and preview; it is not a production API. */
export function sceneAuthoringPlugin(root) {
  return { name: 'scene-authoring', apply: 'serve', configureServer(server) {
    server.middlewares.use(createSceneAuthoringMiddleware({ root }));
  } };
}
