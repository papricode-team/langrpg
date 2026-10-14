import type { Avatar, WorldPlayer } from './world';
import {parseSharedWorldTime, type SharedWorldTime} from './shared-world-time';
import { isStoryMap, type MapId } from './maps';
import { buildingEntrances, getInterior, type InteriorId } from './interiors';
import {getWorldScene,sceneContentVersion} from './scene-data';
import type { StoryState } from './dialogue';
import { isBaseLanguage, type BaseLanguage } from './i18n';
import type { BillingPlan, GameAccess } from './game-access';

export type LearningMode = 'recognition' | 'production' | 'listening';
export type CourseLevel = 'A1' | 'A2' | 'B1';
export type ActivityId = 'cafe' | 'market' | 'detective' | 'delivery';
export interface ModeEvidence { attempts: number; correct: number; unaidedSuccesses: number; timedAttempts?:number; responseTimeMs?:number; }
export interface MemoryItem {
  itemId: string; stabilityDays: number; difficulty: number; repetitions: number; lapses: number;
  lastSeenAt: string; dueAt: string;
  modeStats: Record<string, ModeEvidence>;
}
export interface WordEvidence extends ModeEvidence {
  status: 'unseen' | 'learning' | 'retained'; dueAt: string; stabilityDays: number;
}
export interface WordMemory extends Omit<MemoryItem, 'itemId'> {
  wordId: string; exposures: number; contextExposures: number; directAttempts: number;
  mastery: 'exposed' | 'learning' | 'retained'; evidence: Record<LearningMode, WordEvidence>;
}
export interface ExerciseEvidence extends ModeEvidence { lastAttemptAt: string; lastCorrectAt: string; }
export interface AttemptEvidence {
  id: string; exerciseId: string; itemId: string; mode: LearningMode; correct: boolean; hinted: boolean;
  miniGameId?: string; answerKind?: LexicalAnswerKind; contextExerciseId?: string;
  contentId?: string; regionId?: string; level?: CourseLevel; selectedValue?: number;
  activityId?: ActivityId; runId?: string; at: string;
}
export interface ActivityProgress {
  activityId: ActivityId; level: CourseLevel; completions: number; completedAt: string; lastCompletedAt: string;
  exerciseIds: string[]; correctedAnswers: number;
}
/** Vocabulary intake: credited play and the syllabus words the server has introduced (see intake.ts). */
export interface IntakeState { version: number; activeSeconds: number; creditSeconds: number; lastBeatAt: string; wordIds: string[]; }
export interface Progress {
  revision: number;
  xp: number; completedQuestIds: string[]; attempts: number; correctAttempts: number;
  items: Record<string, MemoryItem>;
  words: Record<string, WordMemory>; completedUnitIds: string[]; activities: Record<string, ActivityProgress>;
  exerciseStats: Record<string, ExerciseEvidence>; recentAttempts: Record<string, AttemptEvidence>;
  miniGameStats?: Record<string, ModeEvidence>;
  formStats?: Record<string, Partial<Record<LexicalAnswerKind, ModeEvidence>>>;
  intake?: IntakeState;
  story?: StoryState;
}
export interface AttemptResult {
  attemptId: string; correct: boolean; xpAdded: number; duplicate: boolean; correctedAnswer: string; reason: string; progress: Progress;
}
export type LexicalAnswerKind = 'lexeme' | 'article' | 'plural' | 'initial' | 'topic' | 'surface';
export interface RetrievalMetrics {
  graded: number; correct: number; unaided: number; creditedSeconds: number; perCreditedHour: number | null;
  modalities: Partial<Record<LearningMode, ModeEvidence>>; miniGames: Record<string, ModeEvidence>;
}
export interface ActivityCompletionInput { id: string; activityId: ActivityId; level: CourseLevel; exerciseIds: string[]; attemptIds: string[]; }
export interface CompletionResult { xpAdded: number; duplicate: boolean; progress: Progress; }
export interface ActivityCompletionResult extends CompletionResult { reason: string; activity: ActivityProgress; }
export interface ExposureInput { exerciseId?: string; unitId?: string; activityId?: ActivityId; scenarioId?: string; npcId?: string; level?: CourseLevel; wordIds?: string[]; }
export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'replaced' | 'incompatible';
export interface AccountStatus { registered: boolean; email: string; admin?: boolean; access?: GameAccess; }
/** Account-wide settings that follow the player across devices. */
export interface Preferences { baseLanguage: BaseLanguage; }
export interface SessionResult { token: string; player: WorldPlayer; progress: Progress; account: AccountStatus; preferences: Preferences; access?: GameAccess; activeCourseId?: string; }
export interface StoryResult { story: StoryState; progress: Progress; xpAdded?: number; duplicate?: boolean; saves?: { slot: string; name: string; at: string }[]; rules?: { questId: string; gateExerciseId: string; choiceIds: string[]; investigationObjectIds?: string[] }[]; }
export interface ExpeditionAnswerResult { progress: Progress; feedback?: string; duplicate?: boolean; }
/** Older servers omitted account metadata and preferences. Normalize at the boundary. */
export function normalizeSession(result: SessionResult): SessionResult {
  const metadata = result.account, language = result.preferences?.baseLanguage;
  return { ...result, account: { registered: metadata?.registered === true, email: typeof metadata?.email === 'string' ? metadata.email : '', admin: metadata?.admin === true, ...(metadata?.access ? { access: metadata.access } : {}) }, preferences: { baseLanguage: isBaseLanguage(language) ? language : 'en' } };
}
export const emptyProgress = (): Progress => ({ revision: 0, xp: 0, completedQuestIds: [], completedUnitIds: [], attempts: 0, correctAttempts: 0, items: {}, words: {}, activities: {}, exerciseStats: {}, recentAttempts: {} });

const isMapId = isStoryMap;
const validInterior = (mapId: MapId, value: unknown): value is InteriorId | '' | undefined =>
  value === undefined || value === '' || buildingEntrances(mapId).some(entrance => entrance.interiorId === value);
const validSpawn = (value: unknown): value is { x: number; y: number } => {
  if (!value || typeof value !== 'object') return false;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === 'number' && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1
    && typeof point.y === 'number' && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1;
};
/** Geometry edits can change authority without changing the coordinate frame. */
export function compatibleScene(value: unknown, mapId: MapId, interiorId?: InteriorId): boolean {
  const expected=interiorId?{...getInterior(interiorId),coordinateVersion:1}:getWorldScene(mapId);
  if(value===undefined)return expected.coordinateVersion===1&&expected.width===1536&&expected.height===1024;
  if(!value||typeof value!=='object')return false;
  const scene=value as {width?:unknown;height?:unknown;coordinateVersion?:unknown;contentVersion?:unknown};
  return scene.width===expected.width&&scene.height===expected.height&&scene.coordinateVersion===expected.coordinateVersion
    &&scene.contentVersion===sceneContentVersion;
}
const initialMap = (): MapId => {
  try { const value = localStorage.getItem('atlas.map'); return isMapId(value) ? value : 'lindenhafen'; }
  catch { return 'lindenhafen'; }
};

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class Api {
  token = localStorage.getItem('atlas.token') ?? '';
  mapId: MapId = initialMap();
  interiorId?: InteriorId;
  private pendingMap?: MapId;
  private pendingInterior?: { id: InteriorId | undefined };
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private reconnectCount = 0;
  private stopped = false;
  private worldReady = false;
  private incompatible = false;
  private worldRefreshSequence = 0;
  private requestSequence = 0;
  private publishedAccessSequence = 0;
  onMap?: (mapId: MapId, spawn: { x: number; y: number }) => void;
  onInterior?: (interiorId: InteriorId | undefined) => void;
  onPlayers?: (players: WorldPlayer[], selfId: string) => void;
  onClock?: (clock: SharedWorldTime) => void;
  onStatus?: (status: ConnectionStatus) => void;
  onError?: (message: string) => void;
  onAccess?: (access: GameAccess) => void;
  onWorldChanged?: () => Promise<void>;
  selfId = '';

  async request<T>(path: string, body?: unknown): Promise<T> {
    const token = this.token, sequence = ++this.requestSequence;
    const response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const value = await response.json().catch(() => ({}));
    if (value.access && token === this.token && sequence >= this.publishedAccessSequence) {
      this.publishedAccessSequence = sequence;
      this.onAccess?.(value.access);
    }
    if (!response.ok) throw new ApiError(value.error ?? `Request failed (${response.status})`, response.status);
    return value as T;
  }
  async session(name: string, avatar: Avatar, baseLanguage?: BaseLanguage) {
    let result: SessionResult;
    // The base language is only sent for a new account; a profile edit keeps the saved preference.
    const body = { name, avatar, ...(baseLanguage ? { baseLanguage } : {}) };
    try { result = await this.request('/session', body); }
    catch (error) {
      if (!this.token || !(error instanceof ApiError) || error.status !== 401) throw error;
      const oldToken = this.token;
      this.token = '';
      try { result = await this.request('/session', body); }
      catch (retryError) { this.token = oldToken; throw retryError; }
    }
    return this.rememberSession(result);
  }
  private rememberSession(result: SessionResult) {
    result = normalizeSession(result);
    this.token = result.token;
    this.selfId = result.player.id;
    localStorage.setItem('atlas.token', this.token);
    return result;
  }
  async resume(): Promise<SessionResult | undefined> {
    if (!this.token) return undefined;
    try {
      const result = await this.request<SessionResult>('/session', {});
      return this.rememberSession(result);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      this.token = ''; this.selfId = ''; localStorage.removeItem('atlas.token');
      return undefined;
    }
  }
  register(email: string, password: string) {
    return this.request<AccountStatus>('/account/register', { email, password });
  }
  access() { return this.request<{ access: GameAccess }>('/access'); }
  accessHeartbeat(active: boolean) { return this.request<{ access: GameAccess }>('/access/heartbeat', { active }); }
  async resetGame(): Promise<SessionResult> {
    const result = await this.request<SessionResult>('/access/reset', {});
    return this.rememberSession(result);
  }
  checkout(plan: BillingPlan) { return this.request<{ url: string }>('/billing/checkout', { plan }); }
  billingPortal() { return this.request<{ url: string }>('/billing/portal', {}); }
  syncBilling() { return this.request<{ access: GameAccess }>('/billing/sync', {}); }
  async login(email: string, password: string): Promise<SessionResult> {
    const result = await this.request<SessionResult>('/account/login', { email, password });
    this.destroy();
    return this.rememberSession(result);
  }
  async logout(): Promise<void> {
    if (this.token) await this.request('/account/logout', {});
    this.destroy();
    this.token = ''; this.selfId = '';
    localStorage.removeItem('atlas.token');
    localStorage.removeItem('atlas.profile');
  }
  async savePreferences(preferences: Preferences): Promise<Preferences> {
    const result = await this.request<{ preferences?: Partial<Preferences> }>('/preferences', preferences);
    const language = result.preferences?.baseLanguage;
    return { baseLanguage: isBaseLanguage(language) ? language : 'en' };
  }
  completeUnit(unitId: string) { return this.request<CompletionResult>('/course/complete', { unitId }); }
  story() { return this.request<StoryResult>('/story'); }
  storyTransition(input: { id: string; questId: string; nodeId: string; choiceId?: string; attemptId?: string }) { return this.request<StoryResult>('/story/transition', input); }
  inspectStory(input: { id: string; questId: string; objectId: string }) { return this.request<StoryResult>('/story/inspect', input); }
  saveStory(slot: string, name: string) { return this.request<StoryResult>('/story/save', { slot, name }); }
  loadStory(slot: string) { return this.request<StoryResult>('/story/load', { slot }); }
  completeActivity(input: ActivityCompletionInput) { return this.request<ActivityCompletionResult>('/activity/complete', input); }
  retrievals() { return this.request<RetrievalMetrics>('/retrievals'); }
  expose(input: ExposureInput) { return this.request<CompletionResult>('/exposure', input); }
  /** Credit up to two minutes of visible play; the server introduces any words the budget now allows. */
  heartbeat(id: string, seconds: number) { return this.request<{ progress: Progress; introduced: string[]; duplicate: boolean }>('/intake/heartbeat', { id, seconds }); }
  connect() {
    // A reload supplies the matching compiled scene. Automatic retries with the
    // same incompatible bundle would only keep replacing the current session.
    if (this.incompatible) return;
    this.stopped = false;
    this.worldReady = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.pendingMap = undefined;
    this.pendingInterior = undefined;
    this.onStatus?.('connecting');
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/world?token=${encodeURIComponent(this.token)}&mapId=${encodeURIComponent(this.mapId)}`);
    this.socket = ws;
    ws.onopen = () => { if (this.stopped || this.socket !== ws) return; this.reconnectCount = 0; };
    ws.onmessage = event => {
      if (this.stopped || this.socket !== ws) return;
      try {
        const value = JSON.parse(event.data);
        if (value.type === 'access' && value.access) { this.onAccess?.(value.access); return; }
        if (!this.worldReady && value.type !== 'welcome' && value.type !== 'error') return;
        const clock = parseSharedWorldTime(value.clock);
        const publishClock = () => { if (clock) this.onClock?.(clock); };
        if (value.type === 'welcome' || value.type === 'map') {
          if (!isMapId(value.mapId) || !validInterior(value.mapId, value.interiorId) || !validSpawn(value.spawn) || !Array.isArray(value.players)) return;
          if(!compatibleScene(value.scene,value.mapId,value.interiorId||undefined)) { this.rejectWorldVersion(); return; }
          if (typeof value.selfId === 'string') this.selfId = value.selfId;
          this.mapId = value.mapId;
          this.interiorId = value.interiorId || undefined;
          this.pendingInterior = undefined;
          if (value.type === 'map' || this.pendingMap === value.mapId) this.pendingMap = undefined;
          this.worldReady = true;
          try { localStorage.setItem('atlas.map', this.mapId); } catch { /* Storage availability must not prevent entering a map. */ }
          this.onMap?.(this.mapId, value.spawn);
          this.onInterior?.(this.interiorId);
          publishClock();
          this.onPlayers?.(value.players, this.selfId);
          if (value.type === 'welcome') this.onStatus?.('online');
        } else if (value.type === 'interior' && value.mapId === this.mapId) {
          if (!validInterior(this.mapId, value.interiorId) || !validSpawn(value.spawn) || !Array.isArray(value.players)) return;
          if(!compatibleScene(value.scene,this.mapId,value.interiorId||undefined)) { this.rejectWorldVersion(); return; }
          const id = value.interiorId || undefined;
          if (this.pendingInterior && this.pendingInterior.id !== id) return;
          this.interiorId = id;
          this.pendingInterior = undefined;
          this.onInterior?.(id);
          publishClock();
          this.onPlayers?.(value.players, this.selfId);
        } else if (value.type === 'players' && value.mapId === this.mapId && Array.isArray(value.players)) {
          publishClock();
          this.onPlayers?.(value.players, this.selfId);

        } else if (value.type === 'error') {
          this.pendingMap = undefined;
          if (this.pendingInterior) {
            this.pendingInterior = undefined;
            this.onInterior?.(this.interiorId);
          }
          this.onError?.(value.error ?? value.message ?? 'The town could not process that action.');
        }
      } catch { /* A malformed frame cannot alter application state. */ }
    };
    ws.onclose = event => {
      if (this.socket !== ws) return;
      this.worldReady = false;
      this.pendingMap = undefined;
      this.pendingInterior = undefined;
      if (this.incompatible) return;
      if (!this.stopped && event.code === 4002) {
        this.stopped = true;
        this.onStatus?.('offline');
        void this.access().catch(() => {});
        return;
      }
      if (!this.stopped && event.code === 4001) {
        this.stopped = true;
        this.onStatus?.('replaced');
        this.onError?.('Your character is active in another tab. Continue there, or close it and reload this page.');
        return;
      }
      this.onStatus?.('offline');
      if (!this.stopped) this.reconnectTimer = window.setTimeout(() => this.connect(), Math.min(15000, 800 * 2 ** this.reconnectCount++));
    };
    ws.onerror = () => { if (this.socket === ws) ws.close(); };
  }
  /** Enter only after the server confirms the map. Reconnect keeps the last acknowledgement. */
  joinMap(mapId: MapId): boolean {
    if (!isMapId(mapId) || this.pendingMap || this.pendingInterior) return false;
    if (!this.send({ type: 'joinMap', mapId })) return false;
    this.pendingMap = mapId;
    return true;
  }
  joinInterior(id?: InteriorId): boolean {
    if (this.pendingMap || !validInterior(this.mapId, id)) return false;
    if (this.pendingInterior ? this.pendingInterior.id === id : this.interiorId === id) return true;
    if (!this.send({ type: 'joinInterior', mapId: this.mapId, interiorId: id ?? '' })) return false;
    this.pendingInterior = { id };
    return true;
  }
  move(x: number, y: number) {
    if (!this.pendingMap && !this.pendingInterior) this.send({ type: 'move', mapId: this.mapId,
      ...(this.interiorId ? { interiorId: this.interiorId } : {}), coordinateVersion:this.interiorId?1:getWorldScene(this.mapId).coordinateVersion, x, y });
  }
  private send(message: unknown) {
    if (!this.worldReady || this.stopped || this.incompatible || this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount >= 32768) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
  private rejectWorldVersion() {
    this.incompatible = true;
    this.stopped = true;
    this.worldReady = false;
    this.pendingMap = undefined;
    this.pendingInterior = undefined;
    clearTimeout(this.reconnectTimer);
    this.onStatus?.('incompatible');
    this.socket?.close();
    if(this.onWorldChanged) {
      const token=this.token,sequence=++this.worldRefreshSequence;
      void this.onWorldChanged().then(()=>{if(sequence===this.worldRefreshSequence&&token===this.token){this.incompatible=false;this.connect();}}).catch(error=>this.onError?.(error instanceof Error?error.message:'The saved world could not be loaded. Reload to try again.'));
    } else this.onError?.('The world has changed. Reload to load the matching map before continuing.');
  }
  destroy() { this.worldRefreshSequence++;this.incompatible=false;this.stopped = true; this.worldReady = false; clearTimeout(this.reconnectTimer); this.socket?.close(); }
}
