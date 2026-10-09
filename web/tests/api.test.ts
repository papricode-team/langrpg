import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, emptyProgress } from '../src/api';
import type { MapId } from '../src/maps';

class MockSocket {
  static OPEN = 1;
  static instances: MockSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  sent: unknown[] = [];
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  constructor(readonly url: string) { MockSocket.instances.push(this); }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  open() { this.readyState = MockSocket.OPEN; this.onopen?.(); }
  receive(value: unknown) { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) }); }
  close() { this.readyState = 3; queueMicrotask(() => this.onclose?.()); }
}

let storage: Map<string, string>;
let clients: Api[];
function createApi() { const api = new Api(); clients.push(api); return api; }
function latestSocket() { return MockSocket.instances.at(-1)!; }
function packet(mapId: MapId = 'lindenhafen', type = 'welcome') {
  return { type, selfId: 'self', mapId, spawn: { x: .52, y: .61 }, players: [{ id: 'self', mapId }], messages: [] };
}
function onlineApi(mapId: MapId = 'lindenhafen') {
  const api = createApi(); api.connect(); const socket = latestSocket(); socket.open(); socket.receive(packet(mapId));
  return { api, socket };
}

beforeEach(() => {
  vi.useFakeTimers();
  storage = new Map([['atlas.token', 'mock-token']]); clients = []; MockSocket.instances = [];
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal('location', { protocol: 'https:', host: 'mock-game.example' });
  vi.stubGlobal('window', { setTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay) });
  vi.stubGlobal('WebSocket', MockSocket);
});
afterEach(async () => {
  clients.forEach(api => api.destroy()); await Promise.resolve();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('map-aware multiplayer API', () => {
  it('restores only a valid saved map and uses same-origin WSS with that selection', () => {
    storage.set('atlas.map', 'nebelstadt');
    const api = createApi(); api.connect();
    const url = new URL(latestSocket().url);
    expect(api.mapId).toBe('nebelstadt'); expect(url.protocol).toBe('wss:'); expect(url.host).toBe('mock-game.example');
    expect(url.pathname).toBe('/api/world'); expect(url.searchParams.get('mapId')).toBe('nebelstadt'); expect(url.searchParams.get('token')).toBe('mock-token');
  });

  it.each(['unknown', '', 'https://evil.example', 'WALDRUH'])('ignores an invalid stored map: %s', value => {
    storage.set('atlas.map', value); expect(createApi().mapId).toBe('lindenhafen');
  });

  it('acknowledges the map before presence and replays only its chat history', () => {
    const api = createApi(); const order: string[] = [];
    api.onMap = (id, spawn) => { expect(id).toBe('waldruh'); expect(spawn).toEqual({ x: .52, y: .54 }); order.push('map'); };
    api.onPlayers = (_players, selfId) => { expect(selfId).toBe('self'); order.push('players'); };
    api.onChat = message => { expect(message.id).toBe('local'); order.push('chat'); };
    api.connect(); const socket = latestSocket(); socket.open();
    socket.receive({ ...packet('waldruh'), spawn: { x: .52, y: .54 }, messages: [{ id: 'foreign', mapId: 'nebelstadt' }, { id: 'local', mapId: 'waldruh' }] });
    expect(order).toEqual(['map', 'players', 'chat']); expect(storage.get('atlas.map')).toBe('waldruh');
  });

  it('waits for an authoritative join acknowledgement and pauses movement/chat meanwhile', () => {
    const { api, socket } = onlineApi();
    expect(api.joinMap('waldruh')).toBe(true); expect(socket.sent).toEqual([{ type: 'joinMap', mapId: 'waldruh' }]);
    expect(api.mapId).toBe('lindenhafen'); expect(api.joinMap('nebelstadt')).toBe(false);
    api.move(.7, .7); expect(socket.sent).toHaveLength(1); expect(() => api.chat('hello')).toThrow(/Arriving/);
    socket.receive(packet('waldruh', 'map')); expect(api.mapId).toBe('waldruh');
    api.move(.7, .7); expect(socket.sent.at(-1)).toEqual({ type: 'move', mapId: 'waldruh', x: .7, y: .7 });
    api.chat('hello'); expect(socket.sent.at(-1)).toEqual({ type: 'chat', mapId: 'waldruh', message: 'hello' });
  });

  it('does not request invalid maps, offline joins or joins through a congested socket', () => {
    const api = createApi(); expect(api.joinMap('waldruh')).toBe(false); api.connect(); const socket = latestSocket(); socket.open();
    expect(api.joinMap('invalid' as MapId)).toBe(false); socket.bufferedAmount = 32768;
    expect(api.joinMap('waldruh')).toBe(false); expect(socket.sent).toEqual([]); expect(api.mapId).toBe('lindenhafen');
  });

  it('ignores malformed acknowledgements without changing the selected map', () => {
    const { api, socket } = onlineApi(); const onMap = vi.fn(); api.onMap = onMap;
    for (const value of [
      { ...packet('waldruh', 'map'), mapId: 'unknown' },
      { ...packet('waldruh', 'map'), spawn: { x: 2, y: .5 } },
      { ...packet('waldruh', 'map'), spawn: { x: '0.5', y: .5 } },
      { ...packet('waldruh', 'map'), players: {} },
      '{invalid',
    ]) socket.receive(value);
    expect(api.mapId).toBe('lindenhafen'); expect(onMap).not.toHaveBeenCalled();
  });

  it('filters stale presence/chat packets from the previous map', () => {
    const { api, socket } = onlineApi('waldruh'); const onPlayers = vi.fn(), onChat = vi.fn(); api.onPlayers = onPlayers; api.onChat = onChat;
    socket.receive({ type: 'players', mapId: 'lindenhafen', players: [] });
    socket.receive({ type: 'chat', mapId: 'lindenhafen', message: { mapId: 'lindenhafen' } });
    socket.receive({ type: 'chat', mapId: 'waldruh', message: { mapId: 'nebelstadt' } });
    expect(onPlayers).not.toHaveBeenCalled(); expect(onChat).not.toHaveBeenCalled();
    socket.receive({ type: 'players', mapId: 'waldruh', players: [] });
    socket.receive({ type: 'chat', mapId: 'waldruh', message: { mapId: 'waldruh', id: 'local' } });
    expect(onPlayers).toHaveBeenCalledOnce(); expect(onChat).toHaveBeenCalledOnce();
  });

  it('releases pending state after rejection while keeping the acknowledged map', () => {
    const { api, socket } = onlineApi(); const onError = vi.fn(); api.onError = onError;
    api.joinMap('waldruh'); socket.receive({ type: 'error', error: 'this map is full' });
    expect(onError).toHaveBeenCalledWith('this map is full'); expect(api.mapId).toBe('lindenhafen'); expect(api.joinMap('nebelstadt')).toBe(true);
  });

  it('reconnects to the last acknowledged map and cancels an unacknowledged join', async () => {
    const { api, socket } = onlineApi('waldruh'); api.joinMap('nebelstadt'); socket.close(); await Promise.resolve();
    expect(api.mapId).toBe('waldruh'); expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(800); const reconnected = latestSocket(); expect(reconnected).not.toBe(socket);
    expect(new URL(reconnected.url).searchParams.get('mapId')).toBe('waldruh'); reconnected.open(); reconnected.receive(packet('waldruh'));
    expect(api.joinMap('nebelstadt')).toBe(true);
  });

  it('ignores late messages and close events from a replaced socket', async () => {
    const { api, socket } = onlineApi('waldruh'); const onMap = vi.fn(), onStatus = vi.fn(); api.onMap = onMap; api.onStatus = onStatus;
    api.connect(); const replacement = latestSocket(); socket.receive(packet('nebelstadt')); socket.open(); await Promise.resolve();
    expect(api.mapId).toBe('waldruh'); expect(onMap).not.toHaveBeenCalled(); expect(onStatus).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0); replacement.open(); replacement.receive(packet('waldruh')); expect(onMap).toHaveBeenCalledOnce();
  });

  it('preserves the client chat guard through map switches', () => {
    const { api, socket } = onlineApi(); for (const text of ['one', 'two', 'three']) api.chat(text);
    api.joinMap('waldruh'); socket.receive(packet('waldruh', 'map')); expect(() => api.chat('four')).toThrow(/moment to reply/);
    vi.advanceTimersByTime(10000); expect(() => api.chat('four')).not.toThrow();
  });

  it('stops reconnects and ignores late map acknowledgements after destruction', async () => {
    const { api, socket } = onlineApi(); const onMap = vi.fn(); api.onMap = onMap; api.destroy(); socket.receive(packet('waldruh')); await Promise.resolve();
    expect(onMap).not.toHaveBeenCalled(); expect(api.mapId).toBe('lindenhafen'); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('session request compatibility', () => {
  it('preserves the bearer and JSON body for requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"xp":6}', { headers: { 'Content-Type': 'application/json' } })); vi.stubGlobal('fetch', fetcher);
    const api = createApi(); expect(await api.request('/attempt', { answer: 'Guten Tag' })).toEqual({ xp: 6 });
    const [url, options] = fetcher.mock.calls[0]; expect(url).toBe('/api/attempt'); expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer mock-token'); expect(JSON.parse(options.body)).toEqual({ answer: 'Guten Tag' });
  });

  it('recovers an expired guest token without changing the map selection', async () => {
    storage.set('atlas.map', 'nebelstadt');
    const response = { token: 'new-mock-token', player: { id: 'new-self' }, progress: { xp: 0 } };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"error":"expired"}', { status: 401 })).mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 201 })); vi.stubGlobal('fetch', fetcher);
    const api = createApi(); await api.session('Ada', { hair: '#302020', skin: '#edcaaa', outfit: '#456789' });
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer mock-token'); expect(fetcher.mock.calls[1][1].headers.Authorization).toBeUndefined();
    expect(api.token).toBe('new-mock-token'); expect(storage.get('atlas.token')).toBe('new-mock-token'); expect(api.mapId).toBe('nebelstadt');
  });

  it('retains the previous token when guest recovery fails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"error":"expired"}', { status: 401 })).mockResolvedValueOnce(new Response('{"error":"offline"}', { status: 503 })); vi.stubGlobal('fetch', fetcher);
    const api = createApi(); await expect(api.session('Ada', { hair: '#302020', skin: '#edcaaa', outfit: '#456789' })).rejects.toThrow('offline');
    expect(api.token).toBe('mock-token'); expect(storage.get('atlas.token')).toBe('mock-token');
  });
});

describe('persistent course and activity API', () => {
  it('starts with independent empty word, course and activity evidence stores', () => {
    const first = emptyProgress(), second = emptyProgress();
    expect(first.words).toEqual({}); expect(first.completedUnitIds).toEqual([]);
    expect(first.activities).toEqual({}); expect(first.exerciseStats).toEqual({}); expect(first.recentAttempts).toEqual({});
    first.completedUnitIds.push('test-unit'); expect(second.completedUnitIds).toEqual([]);
    expect(first.words).not.toBe(second.words);
  });

  it('submits the canonical unit ID and uses the server reward/progress', async () => {
    const progress = { ...emptyProgress(), xp: 26, completedUnitIds: ['unit-station'] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ xpAdded: 20, duplicate: false, progress })));
    vi.stubGlobal('fetch', fetcher);
    const api = createApi(); const result = await api.completeUnit('unit-station');
    expect(fetcher.mock.calls[0][0]).toBe('/api/course/complete');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer mock-token');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ unitId: 'unit-station' });
    expect(result.progress.completedUnitIds).toEqual(['unit-station']); expect(result.xpAdded).toBe(20);
  });

  it('sends current-run proof IDs without inventing a score or outcome', async () => {
    const input = { id: 'run-one', activityId: 'cafe' as const, level: 'A1' as const, exerciseIds: ['one', 'two', 'three'], attemptIds: ['attempt-one', 'attempt-two', 'attempt-three'] };
    const activity = { activityId: 'cafe', level: 'A1', completions: 1, completedAt: '2026-10-08T12:00:00Z', lastCompletedAt: '2026-10-08T12:00:00Z', exerciseIds: input.exerciseIds, correctedAnswers: 2 };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ xpAdded: 20, duplicate: false, reason: 'Validated stored targets.', activity, progress: { ...emptyProgress(), activities: { 'cafe:A1': activity } } })));
    vi.stubGlobal('fetch', fetcher);
    const result = await createApi().completeActivity(input);
    expect(fetcher.mock.calls[0][0]).toBe('/api/activity/complete');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
    expect(result.activity.correctedAnswers).toBe(2); expect(result.reason).toBe('Validated stored targets.');
    expect(result.progress.activities['cafe:A1'].completions).toBe(1);
  });

  it('surfaces authoritative missing-evidence errors instead of completing locally', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"error":"recall the word independently first"}', { status: 409 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(createApi().completeUnit('unit-station')).rejects.toThrow('recall the word independently first');
    expect(storage.has('atlas.course')).toBe(false); expect(storage.has('atlas.words')).toBe(false);
  });

  it('records displayed word IDs through the authenticated exposure endpoint without a score', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ xpAdded: 0, duplicate: false, progress: emptyProgress() })));
    vi.stubGlobal('fetch', fetcher);
    const result = await createApi().expose({ wordIds: ['bahnhof', 'kaffee'] });
    expect(fetcher.mock.calls[0][0]).toBe('/api/exposure');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer mock-token');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ wordIds: ['bahnhof', 'kaffee'] });
    expect(result.xpAdded).toBe(0); expect(result.progress.attempts).toBe(0);
  });

  it('submits exactly the visible activity scene context without exposing future scene IDs', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ xpAdded: 0, duplicate: false, progress: emptyProgress() })));
    vi.stubGlobal('fetch', fetcher);
    await createApi().expose({ activityId: 'cafe', level: 'A1', scenarioId: 'cafe-a1-first-light' });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ activityId: 'cafe', level: 'A1', scenarioId: 'cafe-a1-first-light' });
  });
});
