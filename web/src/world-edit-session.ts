/**
 * Client side of world editing, shared by in-game edit mode and the admin map
 * editor. Every committed edit publishes immediately; undo sends the inverse.
 */
import type {WorldSceneDocument} from './scene-schema';
import {applyEditOps,inverseEditOps,type WorldEditOp} from './world-edit-ops';
import type {WorldProblem} from './world-edit-rules';
import type {StoryLexeme,StoryListing,StoryScene,StoryWord} from './admin-story-model';

export interface WorldLock { map: string; id: string; adminId: string; adminName: string; expires: string; }
/** `from` is the published version the edit was applied on top of. */
export interface EditResult { revision: string; from: string; contentVersion: string; applied: WorldEditOp[]; warnings: WorldProblem[]; }
export interface AdminWorld { document: WorldSceneDocument; revision: string; }
/** One change to a story line: hide or restore it, rewrite it, or drop the rewrite. */
export type StoryLineChange = {hidden: boolean} | {text: string; translations: Record<string, string>} | {reset: true};
export interface StoryDraftCheck { words: StoryWord[]; lexemes: Record<string, StoryLexeme>; problems: string[]; }

export class WorldEditRequestError extends Error {
  readonly status: number;
  readonly problems: WorldProblem[];
  constructor(message: string, status: number, problems: WorldProblem[] = []) { super(message); this.status = status; this.problems = problems; }
}

const UNDO_LIMIT = 20;
const LOCK_RENEW_MS = 10_000;

export class WorldEditSession {
  private undoStack: WorldEditOp[][] = [];
  private held = new Map<string, {map: string; id: string}>();
  private cancelled = new Set<string>();
  private renewTimer?: number;
  private readonly token: () => string;
  private readonly document: () => WorldSceneDocument;
  /** Called with the server's applied operations, for editors that do not receive socket patches. */
  onApplied?: (result: EditResult) => void;

  constructor(token: () => string, document: () => WorldSceneDocument, private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)) { this.token = token; this.document = document; }

  get canUndo(): boolean { return this.undoStack.length > 0; }

  private async request<T>(path: string, init: {method?: string; body?: unknown} = {}): Promise<T> {
    const token = this.token();
    if (!token) throw new WorldEditRequestError('Log in with an admin account to edit the world.', 401);
    let response: Response;
    try {
      response = await this.fetcher(`/api${path}`, {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers: {Authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : {'Content-Type': 'application/json'})},
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(50_000),
      });
    } catch { throw new WorldEditRequestError('The server could not be reached. Check your connection and try again.', 0); }
    const value = await response.json().catch(() => ({})) as {error?: string; problems?: WorldProblem[]};
    if (!response.ok) throw new WorldEditRequestError(value.problems?.[0]?.message ?? value.error ?? `The edit failed (${response.status}).`, response.status, value.problems ?? []);
    return value as T;
  }

  /** Publish operations. They become undoable once the server accepts them. */
  async commit(ops: WorldEditOp[]): Promise<EditResult> {
    // Each inverse is measured against the document as the previous edit left it.
    let document = this.document();
    const steps: WorldEditOp[][] = [];
    for (const op of ops) { steps.push(inverseEditOps(document, op)); document = applyEditOps(document, [op]).document; }
    const inverse = steps.reverse().flat();
    const result = await this.send(ops);
    this.undoStack.push(inverse);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    return result;
  }

  /** Undo this admin's most recent edit. */
  async undo(): Promise<EditResult | undefined> {
    const ops = this.undoStack.pop();
    if (!ops) return undefined;
    try { return await this.send(ops); }
    catch (error) { if (error instanceof WorldEditRequestError && error.status === 0) this.undoStack.push(ops); throw error; }
  }

  /** Publish operations without recording them for undo; the caller keeps its own history. */
  async send(ops: WorldEditOp[]): Promise<EditResult> {
    const result = await this.request<EditResult>('/admin/world/ops', {body: {ops}});
    this.onApplied?.(result);
    return result;
  }

  /** Take an object so no other admin can change it while it is selected. */
  async lock(map: string, id: string): Promise<WorldLock[]> {
    const key = `${map}/${id}`;
    this.cancelled.delete(key);
    const result = await this.request<{locks: WorldLock[]}>('/admin/world/locks', {body: {map, id, action: 'acquire'}});
    this.held.set(key, {map, id});
    // Released while the request was in flight: hand it straight back.
    if (this.cancelled.delete(key)) { await this.release(map, id); return result.locks.filter(lock => lock.id !== id); }
    this.scheduleRenewal();
    return result.locks;
  }

  async release(map: string, id: string): Promise<void> {
    if (!this.held.delete(`${map}/${id}`)) { this.cancelled.add(`${map}/${id}`); return; }
    await this.request('/admin/world/locks', {body: {map, id, action: 'release'}}).catch(() => undefined);
    if (!this.held.size) this.stopRenewal();
  }

  async releaseAll(): Promise<void> {
    await Promise.all([...this.held.values()].map(lock => this.release(lock.map, lock.id)));
  }

  private scheduleRenewal(): void {
    if (this.renewTimer !== undefined) return;
    this.renewTimer = window.setInterval(() => {
      for (const {map, id} of this.held.values()) void this.request('/admin/world/locks', {body: {map, id, action: 'acquire'}}).catch(() => this.held.delete(`${map}/${id}`));
    }, LOCK_RENEW_MS);
  }
  private stopRenewal(): void { if (this.renewTimer !== undefined) window.clearInterval(this.renewTimer); this.renewTimer = undefined; }

  status(map: string): Promise<{revision: string; contentVersion: string; locks: WorldLock[]}> {
    return this.request(`/admin/world/status?map=${encodeURIComponent(map)}`);
  }
  loadWorld(): Promise<AdminWorld> { return this.request('/admin/world'); }
  validate(document: WorldSceneDocument): Promise<{valid: boolean; problems?: WorldProblem[]; diagnostics: string[]}> {
    return this.request('/admin/world/validate', {body: document});
  }
  /** Replace the whole world, for imports. Undo history no longer applies afterwards. */
  async replaceWorld(document: WorldSceneDocument, revision: string): Promise<AdminWorld> {
    const token = this.token();
    const response = await this.fetcher('/api/admin/world', {method: 'PUT', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'If-Match': `"${revision}"`},
      body: JSON.stringify(document), signal: AbortSignal.timeout(60_000)}).catch(() => undefined);
    if (!response) throw new WorldEditRequestError('The server could not be reached. Check your connection and try again.', 0);
    const value = await response.json().catch(() => ({})) as {error?: string; problems?: WorldProblem[]} & Partial<AdminWorld>;
    if (!response.ok) throw new WorldEditRequestError(value.problems?.[0]?.message ?? value.error ?? `The import failed (${response.status}).`, response.status, value.problems ?? []);
    this.undoStack = [];
    return value as AdminWorld;
  }
  clearHistory(): void { this.undoStack = []; }

  /** The whole story in play order, with every admin change to it. */
  story(): Promise<StoryListing> { return this.request('/admin/story'); }
  /** Hide or restore one monologue line for every player. */
  setStoryLine(lineId: string, hidden: boolean): Promise<{scene?: StoryScene}> { return this.changeStoryLine(lineId, {hidden}); }
  changeStoryLine(lineId: string, change: StoryLineChange): Promise<{scene?: StoryScene}> { return this.request('/admin/story/lines', {body: {lineId, ...change}}); }
  /** Links a draft line's words to the lexicon before it is saved. */
  checkStoryText(text: string, authored: string): Promise<StoryDraftCheck> { return this.request('/admin/story/check', {body: {text, authored}}); }
  dispose(): void { void this.releaseAll(); this.stopRenewal(); }
}
