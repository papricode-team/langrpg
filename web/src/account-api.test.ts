import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, emptyProgress } from './api';

const saved = new Map<string, string>();
const session = (token: string, id = 'original-player') => ({
  token,
  player: { id, name: 'Juniper', mapId: 'lindenhafen', x: .52, y: .61, avatar: { hair: '#48372e', skin: '#d8a077', outfit: '#326a65' } },
  progress: { ...emptyProgress(), xp: 40 },
  account: { registered: true, email: 'juniper@example.com' },
});
beforeEach(() => {
  saved.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());

describe('account session lifecycle', () => {
  it('resumes legacy guests when a server omits account metadata', async () => {
    saved.set('atlas.token', 'legacy-token');
    const { account: _account, ...legacy } = session('legacy-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(legacy))));
    const result = await new Api().resume();
    expect(result?.account).toEqual({ registered: false, email: '' });
    expect(result?.player.id).toBe('original-player');
    expect(saved.get('atlas.token')).toBe('legacy-token');
  });
  it('resumes the server profile without overwriting it with this device’s defaults', async () => {
    saved.set('atlas.token', 'existing-device-token');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(session('existing-device-token'))));
    vi.stubGlobal('fetch', fetch);
    const api = new Api();
    const result = await api.resume();
    expect(result?.player.name).toBe('Juniper');
    expect(result?.progress.xp).toBe(40);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({});
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer existing-device-token');
  });
  it('allows a new name choice after an expired token, but keeps tokens on outages', async () => {
    saved.set('atlas.token', 'expired-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const api = new Api();
    expect(await api.resume()).toBeUndefined();
    expect(saved.has('atlas.token')).toBe(false);
    saved.set('atlas.token', 'valid-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"unavailable"}', { status: 503 })));
    const offline = new Api();
    await expect(offline.resume()).rejects.toThrow('unavailable');
    expect(saved.get('atlas.token')).toBe('valid-token');
  });
  it('switches to the returned identity only after successful login', async () => {
    saved.set('atlas.token', 'guest-token');
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"email or password is incorrect"}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(session('new-device-token'))));
    vi.stubGlobal('fetch', fetch);
    const api = new Api();
    await expect(api.login('juniper@example.com', 'wrong password')).rejects.toThrow('incorrect');
    expect(api.token).toBe('guest-token');
    const result = await api.login('juniper@example.com', 'a long lantern password');
    expect(result.player.id).toBe('original-player');
    expect(api.selfId).toBe('original-player');
    expect(saved.get('atlas.token')).toBe('new-device-token');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ email: 'juniper@example.com', password: 'a long lantern password' });
    expect([...saved.keys()]).toEqual(['atlas.token']);
  });
});
