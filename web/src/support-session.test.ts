// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, emptyProgress } from './api';
import { clearSupportSession, startSupportSession, supportSession } from './support-session';
beforeEach(() => {
  const storage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }; };
  vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage()); localStorage.setItem('atlas.token', 'admin-token');
});
afterEach(() => vi.unstubAllGlobals());
describe('login-as identity isolation', () => {
  it('keeps the administrator token unchanged while resuming and leaving a support session', async () => {
    startSupportSession('support_member-token', 'Juniper', '2026-10-15T12:00:00Z');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'support_member-token', player: { id: 'member' }, progress: emptyProgress(), account: { registered: true, email: 'juniper@example.com' } })));
    vi.stubGlobal('fetch', fetch); const api = new Api(); await api.resume();
    expect(api.token).toBe('support_member-token'); expect(localStorage.getItem('atlas.token')).toBe('admin-token');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer support_member-token');
    fetch.mockResolvedValue(new Response('{"loggedOut":true}')); await api.logout();
    expect(supportSession()).toBeUndefined(); expect(localStorage.getItem('atlas.token')).toBe('admin-token');
    expect(new Api().token).toBe('admin-token');
  });
  it('does not silently create a guest when a support session expires', async () => {
    startSupportSession('support_expired-token', 'Juniper', '2026-10-15T12:00:00Z');
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"error":"session expired"}', { status: 401 }))); vi.stubGlobal('fetch', fetch);
    const api = new Api(); await expect(api.resume()).rejects.toThrow('session expired');
    await expect(api.session('Juniper', { hair: '#000000', skin: '#ffffff', outfit: '#123456' })).rejects.toThrow('session expired');
    expect(fetch).toHaveBeenCalledTimes(2); expect(localStorage.getItem('atlas.token')).toBe('admin-token');
    clearSupportSession(); expect(new Api().token).toBe('admin-token');
  });
});
