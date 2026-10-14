import { parseWorldSceneDocument, type WorldSceneDocument } from './scene-schema';

export class WorldEditorError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

export interface PublishedWorld { document: WorldSceneDocument; revision: string; contentVersion?: string; }
export interface WorldValidation { valid: boolean; contentVersion?: string; diagnostics?: string[]; }

/** Every authoring request is checked against the server's current admin allowlist. */
export class WorldEditorApi {
  constructor(private token: string) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.token) throw new WorldEditorError('Log in with an admin account to open World Studio.', 401);
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}`, ...options.headers },
      signal: AbortSignal.timeout(60000),
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = [value.error, ...(Array.isArray(value.diagnostics) ? value.diagnostics : [])].filter((message): message is string => typeof message === 'string');
      throw new WorldEditorError(messages.join('\n') || `World Studio request failed (${response.status}).`, response.status);
    }
    return value as T;
  }

  async authenticate(): Promise<void> {
    const session = await this.request<{ account?: { admin?: unknown }; token?: unknown }>('/session', { method: 'POST', body: '{}' });
    if (session.account?.admin !== true) throw new WorldEditorError('This account is not an admin. Log in with an email listed in ADMIN_EMAILS.', 403);
    if (typeof session.token === 'string' && session.token) {
      this.token = session.token;
      localStorage.setItem('atlas.token', this.token);
    }
  }

  async load(): Promise<PublishedWorld> {
    return this.published(await this.request<PublishedWorld>('/admin/world'));
  }

  async validate(document: WorldSceneDocument): Promise<WorldValidation> {
    const result = await this.request<WorldValidation>('/admin/world/validate', { method: 'POST', body: JSON.stringify(document) });
    if (result.valid !== true) throw new WorldEditorError(result.diagnostics?.join('\n') || 'The imported world did not pass validation.');
    return result;
  }

  async save(document: WorldSceneDocument, revision: string): Promise<PublishedWorld> {
    return this.published(await this.request<PublishedWorld>('/admin/world', {
      method: 'PUT', headers: { 'If-Match': `"${revision}"` }, body: JSON.stringify(document),
    }));
  }

  private published(value: PublishedWorld): PublishedWorld {
    if (typeof value.revision !== 'string' || !value.revision) throw new WorldEditorError('The server did not return the world revision. Reload World Studio before saving.');
    return { document: parseWorldSceneDocument(value.document), revision: value.revision, contentVersion: value.contentVersion };
  }
}

/** Imported files become drafts only after both schema and server checks succeed. */
export async function validatedWorldImport(text: string, validate: (document: WorldSceneDocument) => Promise<WorldValidation>): Promise<WorldSceneDocument> {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new WorldEditorError('Choose a valid world JSON file exported from World Studio.'); }
  const document = parseWorldSceneDocument(value);
  const result = await validate(document);
  if (result.valid !== true) throw new WorldEditorError(result.diagnostics?.join('\n') || 'The imported world did not pass validation.');
  return document;
}

export const worldExportJSON = (document: WorldSceneDocument): string => `${JSON.stringify(document, null, 2)}\n`;
