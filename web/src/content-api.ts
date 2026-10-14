import { clearSentences, registerSentence, type AuthoredSentence } from './translated-sentence';

export interface ContentRecord<T = Record<string, unknown>> { id: string; courseId: string; slug?: string; kind?: string; version: number; body: T; }
export interface ContentCourse { id: string; target: string; supportLanguages: string[]; title: string; grading?: Record<string, unknown>; [key: string]: unknown; }
export interface ContentSession { accountId?: string; courseId?: string; supportLanguage?: string; contentVersion?: number | string; }
export class ContentApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

/** A session-scoped, cancellable cache. Course changes cannot publish old responses. */
export class ContentApi {
  private generation = 0;
  private identity = '';
  private token = '';
  private cache = new Map<string, unknown>();
  private pending = new Map<string, Promise<unknown>>();
  private controllers = new Set<AbortController>();
  private resourceEpochs = new Map<string, number>();
  private resourceControllers = new Map<string, Set<AbortController>>();
  constructor(private tokenForRequest: () => string = () => '', private fetcher: typeof fetch = (...args) => fetch(...args)) {}
  configure(tokenForRequest: () => string, session: ContentSession | string = {}): void {
    this.tokenForRequest = tokenForRequest;
    const identity = typeof session === 'string' ? session : JSON.stringify(session);
    if (identity !== this.identity || this.token !== tokenForRequest()) { this.clear(); this.identity = identity; this.token = tokenForRequest(); }
  }
  clear(): void {
    this.generation++;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear(); this.resourceControllers.clear(); this.resourceEpochs.clear(); this.pending.clear(); this.cache.clear(); clearSentences();
  }
  invalidate(path: string): void {
    const key = path.startsWith('/api/') ? path : `/api/content/${path.replace(/^\//, '')}`;
    this.resourceEpochs.set(key, (this.resourceEpochs.get(key) ?? 0) + 1);
    for (const controller of this.resourceControllers.get(key) ?? []) controller.abort();
    this.resourceControllers.delete(key); this.cache.delete(key); this.pending.delete(key);
  }
  private ensureToken(): string {
    const token = this.tokenForRequest();
    if (this.token !== token) { this.clear(); this.token = token; }
    return token;
  }
  async request<T>(path: string, body?: unknown): Promise<T> {
    const token = this.ensureToken(), generation = this.generation;
    const url = path.startsWith('/api/') ? path : `/api/content/${path.replace(/^\//, '')}`;
    const key = url;
    const epoch = this.resourceEpochs.get(key) ?? 0;
    if (body === undefined && this.cache.has(key)) return this.cache.get(key) as T;
    if (body === undefined && this.pending.has(key)) return this.pending.get(key) as Promise<T>;
    const controller = new AbortController(); this.controllers.add(controller);
    const resourceControllers = this.resourceControllers.get(key) ?? new Set<AbortController>();
    resourceControllers.add(controller); this.resourceControllers.set(key, resourceControllers);
    const promise = (async () => {
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await this.fetcher(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
        const value = await response.json().catch(() => ({}));
        if (generation !== this.generation || epoch !== (this.resourceEpochs.get(key) ?? 0) || token !== this.tokenForRequest() || controller.signal.aborted) throw new DOMException('Content session changed', 'AbortError');
        if (!response.ok) throw new ContentApiError(value.error ?? `Content request failed (${response.status})`, response.status);
        if (body === undefined) this.cache.set(key, value);
        return value as T;
      } finally {
        clearTimeout(timeout); this.controllers.delete(controller);
        resourceControllers.delete(controller);
        if (this.resourceControllers.get(key) === resourceControllers && !resourceControllers.size) this.resourceControllers.delete(key);
        queueMicrotask(() => { if (generation === this.generation && this.pending.get(key) === promise) this.pending.delete(key); });
      }
    })();
    if (body === undefined) this.pending.set(key, promise);
    return promise;
  }
  bootstrap<T = Record<string, unknown>>(): Promise<T> { return this.request('bootstrap'); }
  graph<T = Record<string, unknown>>(id: string): Promise<ContentRecord<T>> { return this.request(`graphs/${encodeURIComponent(id)}`); }
  exercise<T = Record<string, unknown>>(id: string): Promise<ContentRecord<T>> { return this.request(`exercises/${encodeURIComponent(id)}`); }
  unit<T = Record<string, unknown>>(id: string): Promise<ContentRecord<T>> { return this.request(`units/${encodeURIComponent(id)}`); }
  expedition<T = Record<string, unknown>>(id: string): Promise<ContentRecord<T>> { return this.request(`expeditions/${encodeURIComponent(id)}`); }
  minigame<T = Record<string, unknown>>(id: string): Promise<ContentRecord<T>> { return this.request(`minigames/${encodeURIComponent(id)}`); }
  async sentences(ids: readonly string[]): Promise<ContentRecord<AuthoredSentence>[]> {
    this.ensureToken(); const generation = this.generation;
    const records = await this.batch<AuthoredSentence>('sentences', ids, 12);
    if (generation !== this.generation) throw new DOMException('Content session changed', 'AbortError');
    for (const record of records) registerSentence(record);
    return records;
  }
  lexemes<T = Record<string, unknown>>(ids: readonly string[]): Promise<ContentRecord<T>[]> { return this.batch('lexemes', ids, 24); }
  private async batch<T>(kind: string, ids: readonly string[], limit: number): Promise<ContentRecord<T>[]> {
    this.ensureToken();
    const generation = this.generation;
    const unique = [...new Set(ids)];
    if (unique.length > limit) throw new RangeError(`At most ${limit} ${kind} may be requested together`);
    const missing = unique.filter(id => !this.cache.has(`${kind}:${id}`));
    if (missing.length) {
      const path = `${kind}?ids=${missing.slice().sort().map(encodeURIComponent).join(',')}`;
      const result = await this.request<ContentRecord<T>[] | { records?: ContentRecord<T>[]; [key: string]: unknown }>(path);
      if (generation !== this.generation) throw new DOMException('Content session changed', 'AbortError');
      // A locked ID may become readable after a story transition. Cache records,
      // never the batch envelope that happened to omit it at the time of reading.
      this.cache.delete(`/api/content/${path}`);
      const records = Array.isArray(result) ? result : result.records ?? result[kind] as ContentRecord<T>[] ?? [];
      for (const record of records) this.cache.set(`${kind}:${record.id}`, record);
    }
    return unique.map(id => this.cache.get(`${kind}:${id}`) as ContentRecord<T> | undefined).filter((record): record is ContentRecord<T> => !!record);
  }
  courses<T = ContentCourse[] | { courses: ContentCourse[] }>(): Promise<T> { return this.request('courses'); }
  async activate<T = Record<string, unknown>>(courseId: string, supportLanguage: string): Promise<T> {
    const result = await this.request<T>('/api/course/activate', { courseId, supportLanguage });
    this.clear(); return result;
  }
}

export const contentApi = new ContentApi();
export function configureContentSession(tokenForRequest: () => string, session: ContentSession | string = {}): void { contentApi.configure(tokenForRequest, session); }
export function resetContentSession(): void { contentApi.clear(); }
export { registerSentence, getSentence, findSentence } from './translated-sentence';
