/**
 * Talks to a glotworld server's world API as an administrator. The server owns
 * the world in PostgreSQL; tools pull it, edit it and push it back.
 *
 *   GLOTWORLD_URL           server origin, default https://glotworld.com
 *   GLOTWORLD_ADMIN_TOKEN   an API token from Admin › API tokens
 */
export const worldExportFormat = 'glotworld-world/1';

export class WorldAPIError extends Error {
  constructor(message, status, problems = []) { super(message); this.status = status; this.problems = problems; }
}

export function worldClient({url = process.env.GLOTWORLD_URL || 'https://glotworld.com', token = process.env.GLOTWORLD_ADMIN_TOKEN, fetcher = fetch} = {}) {
  const origin = url.replace(/\/+$/, '');
  async function call(path, {method = 'GET', body, ifMatch, timeout = 60000} = {}) {
    if (!token) throw new WorldAPIError('Set GLOTWORLD_ADMIN_TOKEN to an API token from Admin › API tokens.', 401);
    const headers = {Authorization: `Bearer ${token}`};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (ifMatch !== undefined) headers['If-Match'] = `"${ifMatch}"`;
    const response = await fetcher(`${origin}/api${path}`, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout)});
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new WorldAPIError(value.error || `${method} ${path} failed (${response.status})`, response.status, value.problems ?? []);
    return value;
  }
  return {
    origin,
    /** The whole editable world: {format, revision, contentVersion, document, story}. */
    export: () => call('/admin/world/export'),
    /** Replaces the world when `revision` is still current. */
    import: (bundle, revision) => call('/admin/world/import', {method: 'PUT', body: bundle, ifMatch: revision, timeout: 120000}),
    /** Checks a whole document without publishing it. */
    validate: document => call('/admin/world/validate', {method: 'POST', body: document, timeout: 120000}),
    /** Applies up to 50 edit operations: {revision, applied, warnings}. */
    applyOps: ops => call('/admin/world/ops', {method: 'POST', body: {ops}}),
    status: map => call(`/admin/world/status${map ? `?map=${encodeURIComponent(map)}` : ''}`),
    edits: ({before = 0, limit = 50} = {}) => call(`/admin/world/edits?before=${before}&limit=${limit}`),
  };
}
