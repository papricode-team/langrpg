import type { Avatar, WorldPlayer } from './world';
import type { MapId } from './maps';

export type LearningMode = 'recognition' | 'production' | 'listening';
export type CourseLevel = 'A1' | 'A2' | 'B1';
export type ActivityId = 'cafe' | 'market' | 'detective' | 'delivery';
export interface ModeEvidence { attempts: number; correct: number; unaidedSuccesses: number; }
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
  activityId?: ActivityId; runId?: string; at: string;
}
export interface ActivityProgress {
  activityId: ActivityId; level: CourseLevel; completions: number; completedAt: string; lastCompletedAt: string;
  exerciseIds: string[]; correctedAnswers: number;
}
export interface Progress {
  revision: number;
  xp: number; completedQuestIds: string[]; attempts: number; correctAttempts: number;
  items: Record<string, MemoryItem>;
  words: Record<string, WordMemory>; completedUnitIds: string[]; activities: Record<string, ActivityProgress>;
  exerciseStats: Record<string, ExerciseEvidence>; recentAttempts: Record<string, AttemptEvidence>;
}
export interface AttemptResult {
  attemptId: string; correct: boolean; xpAdded: number; duplicate: boolean; correctedAnswer: string; reason: string; progress: Progress;
}
export interface ActivityCompletionInput { id: string; activityId: ActivityId; level: CourseLevel; exerciseIds: string[]; attemptIds: string[]; }
export interface CompletionResult { xpAdded: number; duplicate: boolean; progress: Progress; }
export interface ActivityCompletionResult extends CompletionResult { reason: string; activity: ActivityProgress; }
export interface ExposureInput { exerciseId?: string; unitId?: string; activityId?: ActivityId; scenarioId?: string; npcId?: string; level?: CourseLevel; wordIds?: string[]; }
export interface ChatMessage { mapId?: MapId; id: string; playerId: string; name: string; text: string; at: string; }
export const emptyProgress = (): Progress => ({ revision: 0, xp: 0, completedQuestIds: [], completedUnitIds: [], attempts: 0, correctAttempts: 0, items: {}, words: {}, activities: {}, exerciseStats: {}, recentAttempts: {} });

const isMapId = (value: unknown): value is MapId => value === 'lindenhafen' || value === 'waldruh' || value === 'nebelstadt';
const validSpawn = (value: unknown): value is { x: number; y: number } => {
  if (!value || typeof value !== 'object') return false;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === 'number' && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1
    && typeof point.y === 'number' && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1;
};
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
  private pendingMap?: MapId;
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private reconnectCount = 0;
  private stopped = false;
  private chatTimes: number[] = [];
  onMap?: (mapId: MapId, spawn: { x: number; y: number }) => void;
  onPlayers?: (players: WorldPlayer[], selfId: string) => void;
  onChat?: (message: ChatMessage) => void;
  onStatus?: (status: 'connecting' | 'online' | 'offline') => void;
  onError?: (message: string) => void;
  selfId = '';

  async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(value.error ?? `Request failed (${response.status})`, response.status);
    return value as T;
  }
  async session(name: string, avatar: Avatar) {
    let result: { token: string; player: WorldPlayer; progress: Progress };
    try { result = await this.request('/session', { name, avatar }); }
    catch (error) {
      if (!this.token || !(error instanceof ApiError) || error.status !== 401) throw error;
      const oldToken = this.token;
      this.token = '';
      try { result = await this.request('/session', { name, avatar }); }
      catch (retryError) { this.token = oldToken; throw retryError; }
    }
    this.token = result.token;
    this.selfId = result.player.id;
    localStorage.setItem('atlas.token', this.token);
    return result;
  }
  completeUnit(unitId: string) { return this.request<CompletionResult>('/course/complete', { unitId }); }
  completeActivity(input: ActivityCompletionInput) { return this.request<ActivityCompletionResult>('/activity/complete', input); }
  expose(input: ExposureInput) { return this.request<CompletionResult>('/exposure', input); }
  connect() {
    this.stopped = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.pendingMap = undefined;
    this.onStatus?.('connecting');
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/world?token=${encodeURIComponent(this.token)}&mapId=${encodeURIComponent(this.mapId)}`);
    this.socket = ws;
    ws.onopen = () => { if (this.stopped || this.socket !== ws) return; this.reconnectCount = 0; this.onStatus?.('online'); };
    ws.onmessage = event => {
      if (this.stopped || this.socket !== ws) return;
      try {
        const value = JSON.parse(event.data);
        if (value.type === 'welcome' || value.type === 'map') {
          if (!isMapId(value.mapId) || !validSpawn(value.spawn) || !Array.isArray(value.players)) return;
          if (typeof value.selfId === 'string') this.selfId = value.selfId;
          this.mapId = value.mapId;
          if (value.type === 'map' || this.pendingMap === value.mapId) this.pendingMap = undefined;
          try { localStorage.setItem('atlas.map', this.mapId); } catch { /* Storage availability must not prevent entering a map. */ }
          this.onMap?.(this.mapId, value.spawn);
          this.onPlayers?.(value.players, this.selfId);
          for (const message of Array.isArray(value.messages) ? value.messages : []) {
            if (message?.mapId === this.mapId) this.onChat?.(message);
          }
        } else if (value.type === 'players' && value.mapId === this.mapId && Array.isArray(value.players)) {
          this.onPlayers?.(value.players, this.selfId);
        } else if (value.type === 'chat' && value.mapId === this.mapId && value.message?.mapId === this.mapId) {
          this.onChat?.(value.message);
        } else if (value.type === 'error') {
          this.pendingMap = undefined;
          this.onError?.(value.error ?? value.message ?? 'The town could not process that action.');
        }
      } catch { /* A malformed frame cannot alter application state. */ }
    };
    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.pendingMap = undefined;
      this.onStatus?.('offline');
      if (!this.stopped) this.reconnectTimer = window.setTimeout(() => this.connect(), Math.min(15000, 800 * 2 ** this.reconnectCount++));
    };
    ws.onerror = () => { if (this.socket === ws) ws.close(); };
  }
  /** Enter only after the server confirms the map. Reconnect keeps the last acknowledgement. */
  joinMap(mapId: MapId): boolean {
    if (!isMapId(mapId) || this.pendingMap) return false;
    if (!this.send({ type: 'joinMap', mapId })) return false;
    this.pendingMap = mapId;
    return true;
  }
  move(x: number, y: number) { if (!this.pendingMap) this.send({ type: 'move', mapId: this.mapId, x, y }); }
  chat(message: string) {
    if (this.pendingMap) throw new Error('Arriving in the next region. Your message is still here.');
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Chat reconnecting. Please try again in a moment.');
    const now = Date.now();
    this.chatTimes = this.chatTimes.filter(at => now - at < 10000);
    if (this.chatTimes.length >= 3) throw new Error('Give the town a moment to reply. Your message is still here.');
    if (!this.send({ type: 'chat', mapId: this.mapId, message })) throw new Error('The connection is busy. Your message is still here; try again in a moment.');
    this.chatTimes.push(now);
  }
  private send(message: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount >= 32768) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
  destroy() { this.stopped = true; clearTimeout(this.reconnectTimer); this.socket?.close(); }
}
