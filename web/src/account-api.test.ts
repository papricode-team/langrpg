import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, emptyProgress } from './api';

const saved = new Map<string, string>();
const deferredResponse = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
};
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
  it('ignores an older trial heartbeat that arrives after verified payment', async () => {
    saved.set('atlas.token', 'account-token');
    const older = deferredResponse(), newer = deferredResponse();
    const trial = { phase: 'trial', remainingSeconds: 10, playedSeconds: 890, registered: true, billingAvailable: true };
    const paid = { ...trial, phase: 'paid', remainingSeconds: 0, plan: 'lifetime' };
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise));
    const api = new Api();
    api.onAccess = vi.fn();
    const heartbeat = api.accessHeartbeat(true), sync = api.syncBilling();
    newer.resolve(new Response(JSON.stringify({ access: paid })));
    await sync;
    older.resolve(new Response(JSON.stringify({ access: trial })));
    await heartbeat;
    expect(api.onAccess).toHaveBeenCalledExactlyOnceWith(paid);
  });
  it('ignores a response dispatched under the guest token after login changes identity', async () => {
    saved.set('atlas.token', 'guest-token');
    const older = deferredResponse();
    const registered = { phase: 'trial', remainingSeconds: 600, playedSeconds: 300, registered: true, billingAvailable: true };
    const blockedGuest = { ...registered, phase: 'login_required', remainingSeconds: 0, registered: false };
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(older.promise).mockResolvedValueOnce(new Response(JSON.stringify({ ...session('account-token'), access: registered }))));
    const api = new Api();
    api.onAccess = vi.fn();
    const heartbeat = api.accessHeartbeat(true);
    await api.login('juniper@example.com', 'a long lantern password');
    older.resolve(new Response(JSON.stringify({ access: blockedGuest })));
    await heartbeat;
    expect(api.token).toBe('account-token');
    expect(api.onAccess).toHaveBeenCalledExactlyOnceWith(registered);
  });
  it('publishes a server-enforced trial boundary before rejecting a gameplay request', async () => {
    saved.set('atlas.token', 'guest-token');
    const access = { phase: 'login_required', remainingSeconds: 0, playedSeconds: 300, registered: false, billingAvailable: true };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Sign up to continue', access }), { status: 403 })));
    const api = new Api();
    api.onAccess = vi.fn();
    await expect(api.expose({ wordIds: ['hallo'] })).rejects.toThrow('Sign up');
    expect(api.onAccess).toHaveBeenCalledWith(access);
  });
  it('requests billing links with the signed-in identity and an explicit plan', async () => {
    saved.set('atlas.token', 'account-token');
    const fetch = vi.fn().mockResolvedValue(new Response('{"url":"https://www.creem.io/payment/example"}'));
    vi.stubGlobal('fetch', fetch);
    const api = new Api();
    await api.checkout('monthly');
    await api.billingPortal();
    expect(fetch.mock.calls[0][0]).toBe('/api/billing/checkout');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer account-token');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ plan: 'monthly' });
    expect(fetch.mock.calls[1][0]).toBe('/api/billing/portal');
  });
  it('uses server-reconciled payment state to unlock access', async () => {
    saved.set('atlas.token', 'account-token');
    const access = { phase: 'paid', remainingSeconds: 0, playedSeconds: 900, registered: true, billingAvailable: true, plan: 'lifetime' };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access })));
    vi.stubGlobal('fetch', fetch);
    const api = new Api();
    api.onAccess = vi.fn();
    expect(await api.syncBilling()).toEqual({ access });
    expect(fetch.mock.calls[0][0]).toBe('/api/billing/sync');
    expect(api.onAccess).toHaveBeenCalledWith(access);
  });
  it('remembers the character, registered account and fresh allowance after a game reset', async () => {
    saved.set('atlas.token', 'guest-token');
    const access = { phase: 'trial', remainingSeconds: 900, playedSeconds: 0, registered: true, billingAvailable: true };
    const reset = { ...session('guest-token'), access, progress: emptyProgress() };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(reset)));
    vi.stubGlobal('fetch', fetch);
    const api = new Api();
    api.onAccess = vi.fn();
    const result = await api.resetGame();
    expect(fetch.mock.calls[0][0]).toBe('/api/access/reset');
    expect(result.player).toEqual(reset.player);
    expect(result.progress.xp).toBe(0);
    expect(result.account.registered).toBe(true);
    expect(api.onAccess).toHaveBeenCalledWith(access);
    expect(api.token).toBe('guest-token');
    expect(api.selfId).toBe('original-player');
  });
  it('revokes the current session and returns to signed-out state without resetting preferences', async () => {
    saved.set('atlas.token', 'device-token');
    saved.set('atlas.profile', '{"name":"Juniper"}');
    saved.set('atlas.silentMode', 'true');
    const fetch = vi.fn().mockResolvedValue(new Response('{"loggedOut":true}'));
    vi.stubGlobal('fetch', fetch);
    const api = new Api();
    const destroy = vi.spyOn(api, 'destroy');
    api.selfId = 'original-player';
    await api.logout();
    expect(fetch.mock.calls[0][0]).toBe('/api/account/logout');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer device-token');
    expect(destroy).toHaveBeenCalledOnce();
    expect(api.token).toBe('');
    expect(api.selfId).toBe('');
    expect(saved.has('atlas.token')).toBe(false);
    expect(saved.has('atlas.profile')).toBe(false);
    expect(saved.get('atlas.silentMode')).toBe('true');
    expect(await new Api().resume()).toBeUndefined();
  });
  it('keeps the current adventure accessible when logout fails', async () => {
    saved.set('atlas.token', 'device-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"unavailable"}', { status: 503 })));
    const api = new Api();
    const destroy = vi.spyOn(api, 'destroy');
    await expect(api.logout()).rejects.toThrow('unavailable');
    expect(destroy).not.toHaveBeenCalled();
    expect(api.token).toBe('device-token');
    expect(saved.get('atlas.token')).toBe('device-token');
  });
  it('resumes legacy guests when a server omits account metadata', async () => {
    saved.set('atlas.token', 'legacy-token');
    const { account: _account, ...legacy } = session('legacy-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(legacy))));
    const result = await new Api().resume();
    expect(result?.account).toEqual({ registered: false, email: '', admin: false });
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
