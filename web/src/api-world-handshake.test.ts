import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, compatibleScene } from './api';
import type { MapId } from './maps';
import { getWorldScene } from './scene-data';
import {seedContentVersion} from './test-support/world-seed';
const sceneVersion={contentVersion:seedContentVersion};

class TestSocket {
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  sent: Record<string, unknown>[] = [];
  closes = 0;
  onopen?: () => void;
  onclose?: (event: {code: number}) => void;
  onmessage?: (event: {data: string}) => void;
  onerror?: () => void;
  constructor(readonly url: string) { TestSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(value: unknown) { this.onmessage?.({data: JSON.stringify(value)}); }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close() { this.closes++; this.readyState = 3; this.onclose?.({code: 1000}); }
}

const saved = new Map<string, string>();
beforeEach(() => {
  vi.useFakeTimers();
  TestSocket.instances = [];
  saved.clear();
  vi.stubGlobal('localStorage', {getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value)});
  vi.stubGlobal('WebSocket', TestSocket);
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('location', {protocol: 'http:', host: 'localhost:5187'});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function metadata(mapId: MapId = 'lindenhafen') {
  const {width, height, coordinateVersion} = getWorldScene(mapId);
  return {width, height, coordinateVersion, contentVersion: sceneVersion.contentVersion};
}
function packet(type = 'welcome', mapId: MapId = 'lindenhafen') {
  return {type, mapId, selfId: 'self', spawn: {x: .25, y: .25}, players: [{id: 'self', mapId, x: .25, y: .25}],
    messages: [], scene: metadata(mapId), clock: {hour: 8, day: 1, serverTime: '2026-10-11T12:00:00Z'}};
}
function fixture() {
  const api = new Api();
  const onMap = vi.fn(), onPlayers = vi.fn(), onInterior = vi.fn(), onClock = vi.fn(), onStatus = vi.fn(), onError = vi.fn();
  Object.assign(api, {onMap, onPlayers, onInterior, onClock, onStatus, onError});
  api.connect();
  const socket = TestSocket.instances[0];
  socket.open();
  return {api, socket, onMap, onPlayers, onInterior, onClock, onStatus, onError};
}

describe('compiled world handshake', () => {
  it('refreshes published scenes and resumes the connection without page navigation',async()=>{
    const {api,socket,onStatus,onError}=fixture();
    const refresh=vi.fn().mockResolvedValue(undefined);api.onWorldChanged=refresh;
    socket.receive({...packet(),scene:{...metadata(),contentVersion:'changed-world'}});
    expect(refresh).toHaveBeenCalledOnce();expect(onStatus).toHaveBeenLastCalledWith('incompatible');
    await Promise.resolve();
    expect(TestSocket.instances).toHaveLength(2);expect(onError).not.toHaveBeenCalled();
    const replacement=TestSocket.instances[1];replacement.open();replacement.receive(packet());
    expect(onStatus).toHaveBeenLastCalledWith('online');api.destroy();
  });

  it('does not reconnect after the player pauses during an in-flight scene refresh',async()=>{
    const {api,socket}=fixture();let complete!:()=>void;
    api.onWorldChanged=()=>new Promise<void>(resolve=>{complete=resolve;});
    socket.receive({...packet(),scene:{...metadata(),contentVersion:'changed-world'}});
    api.destroy();complete();await Promise.resolve();
    expect(TestSocket.instances).toHaveLength(1);
  });

  it('publishes durable clock snapshots intact and drops inconsistent simulation data', () => {
    const {api, socket, onClock} = fixture();
    const clock = {epoch:'2026-10-11T11:59:30Z',serverTime:'2026-10-11T12:00:00Z',
      hour:8,day:1,seed:'0123456789abcdef0123456789abcdef',elapsedSeconds:30,dayLengthSeconds:720};
    socket.receive({...packet(), clock});
    expect(onClock).toHaveBeenCalledExactlyOnceWith(clock);
    socket.receive({...packet('players'), clock:{...clock, elapsedSeconds:99}});
    expect(onClock).toHaveBeenCalledOnce();
    api.destroy();
  });

  it('holds movement, travel and presence until a compatible welcome is applied', () => {
    const {api, socket, onMap, onPlayers, onStatus} = fixture();
    expect(onStatus.mock.calls).toEqual([['connecting']]);
    api.move(.3, .3);
    expect(api.joinMap('waldruh')).toBe(false);
    socket.receive(packet('players'));
    socket.receive(packet('map'));
    expect(onMap).not.toHaveBeenCalled();
    expect(onPlayers).not.toHaveBeenCalled();
    expect(socket.sent).toHaveLength(0);
    socket.receive(packet());
    expect(onMap).toHaveBeenCalledOnce();
    expect(onPlayers).toHaveBeenCalledOnce();
    expect(onStatus.mock.calls).toEqual([['connecting'], ['online']]);
    api.move(.3, .4);
    expect(socket.sent.at(-1)).toEqual({type: 'move', mapId: 'lindenhafen', coordinateVersion: metadata().coordinateVersion, x: .3, y: .4});
    api.destroy();
  });

  it.each([
    {contentVersion: 'older-scene-with-moved-evidence'},
    {width: 99},
    {coordinateVersion: 999},
    {contentVersion: undefined},
  ])('quarantines incompatible welcomes and later frames: %j', mismatch => {
    const {api, socket, onMap, onPlayers, onInterior, onClock, onStatus, onError} = fixture();
    socket.receive({...packet(), scene: {...metadata(), ...mismatch}});
    expect(onStatus.mock.calls).toEqual([['connecting'], ['incompatible']]);
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Reload'));
    expect(socket.closes).toBe(1);
    socket.receive(packet());
    socket.receive(packet('players'));
    api.move(.5, .5);
    expect(api.joinMap('waldruh')).toBe(false);
    expect(api.joinInterior('cafe')).toBe(false);
    api.connect();
    vi.advanceTimersByTime(60_000);
    expect(TestSocket.instances).toHaveLength(1);
    expect(socket.sent).toHaveLength(0);
    expect(onMap).not.toHaveBeenCalled();
    expect(onPlayers).not.toHaveBeenCalled();
    expect(onInterior).not.toHaveBeenCalled();
    expect(onClock).not.toHaveBeenCalled();
    expect(saved.has('atlas.map')).toBe(false);
  });

  it('stops after an incompatible travel acknowledgement without applying the destination', () => {
    const {api, socket, onMap, onPlayers, onStatus} = fixture();
    socket.receive(packet());
    expect(api.joinMap('waldruh')).toBe(true);
    const sent = socket.sent.length;
    socket.receive({...packet('map', 'waldruh'), scene: {...metadata('waldruh'), contentVersion: 'different-content'}});
    expect(api.mapId).toBe('lindenhafen');
    expect(saved.get('atlas.map')).toBe('lindenhafen');
    expect(onMap).toHaveBeenCalledOnce();
    socket.receive(packet('players'));
    socket.receive(packet('players', 'waldruh'));
    expect(onPlayers).toHaveBeenCalledOnce();
    api.move(.4, .4);
    expect(socket.sent).toHaveLength(sent);
    expect(onStatus).toHaveBeenLastCalledWith('incompatible');
    vi.advanceTimersByTime(60_000);
    expect(TestSocket.instances).toHaveLength(1);
  });

  it('rejects mismatched interior content even when room dimensions are unchanged', () => {
    const {api, socket, onInterior, onPlayers, onStatus} = fixture();
    socket.receive(packet());
    expect(api.joinInterior('cafe')).toBe(true);
    socket.receive({...packet('interior'), interiorId: 'cafe', scene: {width: 1536, height: 1024, coordinateVersion: 1, contentVersion: 'different-content'}});
    expect(api.interiorId).toBeUndefined();
    expect(onInterior.mock.calls).toEqual([[undefined]]);
    expect(onPlayers).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith('incompatible');
  });

  it('requires a new compatible handshake after an ordinary network reconnect', () => {
    const {api, socket, onPlayers, onStatus} = fixture();
    socket.receive(packet());
    socket.close();
    expect(onStatus).toHaveBeenLastCalledWith('offline');
    vi.advanceTimersByTime(800);
    const replacement = TestSocket.instances[1];
    expect(replacement).toBeDefined();
    replacement.open();
    replacement.receive(packet('players'));
    api.move(.3, .3);
    expect(replacement.sent).toHaveLength(0);
    expect(onPlayers).toHaveBeenCalledOnce();
    replacement.receive(packet());
    expect(onPlayers).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenLastCalledWith('online');
    api.destroy();
  });

  it('supports omitted legacy v1 metadata but rejects incomplete present metadata', () => {
    expect(compatibleScene(undefined, 'lindenhafen', 'cafe')).toBe(true);
    expect(compatibleScene({width: 1536, height: 1024, coordinateVersion: 1}, 'lindenhafen', 'cafe')).toBe(false);
    expect(compatibleScene({width: 1536, height: 1024, coordinateVersion: 1, contentVersion: sceneVersion.contentVersion}, 'lindenhafen', 'cafe')).toBe(true);
  });

  it('merges movement deltas into the roster and keeps its own sent position', () => {
    const {api, socket, onPlayers, onClock} = fixture();
    socket.receive({...packet(), players: [{id: 'self', mapId: 'lindenhafen', x: .25, y: .25}, {id: 'peer', mapId: 'lindenhafen', x: .5, y: .5}]});
    onPlayers.mockClear();
    api.move(.3, .3);
    socket.receive({type: 'moves', mapId: 'lindenhafen', interiorId: '', moves: [['peer', .6, .4], ['ghost', .1, .1], ['self', 2, 0]]});
    expect(onPlayers).toHaveBeenCalledExactlyOnceWith([
      {id: 'self', mapId: 'lindenhafen', x: .3, y: .3}, {id: 'peer', mapId: 'lindenhafen', x: .6, y: .4}], 'self');
    socket.receive({type: 'moves', mapId: 'lindenhafen', interiorId: '', moves: [['peer', .6, .4]]});
    socket.receive({type: 'moves', mapId: 'lindenhafen', interiorId: 'cafe', moves: [['peer', .1, .1]]});
    socket.receive({type: 'moves', mapId: 'waldruh', interiorId: '', moves: [['peer', .1, .1]]});
    expect(onPlayers).toHaveBeenCalledOnce();
    onClock.mockClear();
    socket.receive({type: 'clock', clock: {hour: 9, day: 1, serverTime: '2026-10-11T12:01:00Z'}});
    expect(onClock).toHaveBeenCalledOnce();
    api.destroy();
  });
});
