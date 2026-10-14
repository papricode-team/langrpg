// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquisitionContext, AnalyticsClient } from './analytics-client';

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage']) {
    const values = new Map<string, string>();
    vi.stubGlobal(name, { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() });
  }
  localStorage.clear(); sessionStorage.clear();
  vi.stubGlobal('navigator', { userAgent: 'Desktop', doNotTrack: '0' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const sent = () => JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string).events;

describe('first-party browser analytics', () => {
  it('keeps acquisition labels without leaking URL tokens, paths, emails or query strings', () => {
    expect(acquisitionContext('https://game.example/?utm_source=Newsletter&utm_campaign=fall-26&token=secret', 'https://search.example/private?q=secret')).toEqual({ source: 'newsletter', campaign: 'fall-26' });
    expect(acquisitionContext('https://game.example/?utm_source=person@example.com', 'https://search.example/private?q=secret')).toEqual({ source: 'search.example', campaign: '' });
    expect(acquisitionContext('https://game.example/?ref=secret-invite', '')).toEqual({ source: 'referral', campaign: '' });
    expect(acquisitionContext('https://game.example/', 'https://game.example/private?password=secret')).toEqual({ source: 'direct', campaign: '' });
  });
  it('deduplicates paywalls, retries the same IDs and shares one session across reloads', async () => {
    let now = 100000000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const first = new AnalyticsClient(() => 'account-token');
    first.track('paywall_viewed', 'required'); first.track('paywall_viewed', 'required');
    const identity = first.headers();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('response lost'));
    await first.flush(); const original = sent();
    expect(original.map((e: { name: string }) => e.name)).toEqual(['session_started', 'paywall_viewed']);
    await first.flush(); expect(sent()).toEqual(original);
    const reload = new AnalyticsClient(() => 'account-token');
    expect(reload.headers()).toEqual(identity);
    reload.track('page_view', 'game'); await reload.flush();
    expect(sent()).toHaveLength(1);
    now += 31 * 60 * 1000;
    expect(reload.headers()['X-Analytics-Session']).not.toBe(identity['X-Analytics-Session']);
    expect(reload.headers()['X-Analytics-Visitor']).toBe(identity['X-Analytics-Visitor']);
  });
  it('honors privacy signals and opt-out without creating identifiers', async () => {
    for (const privacy of [{ doNotTrack: '1' }, { globalPrivacyControl: true }, {}]) {
      vi.stubGlobal('navigator', { userAgent: 'Desktop', ...privacy });
      if (!Object.keys(privacy).length) localStorage.setItem('glotworld.analytics.disabled', 'true');
      const client = new AnalyticsClient(() => '');
      expect(client.headers()).toEqual({}); client.track('page_view', 'entry'); await client.flush();
      expect(localStorage.getItem('glotworld.analytics.visitor')).toBeNull();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not let tracking failures or blocked storage break the game', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const client = new AnalyticsClient(() => '');
    client.track('page_view', 'entry');
    for (let i = 0; i < 8; i++) await expect(client.flush()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(client.headers()['X-Analytics-Session']).toBeTruthy();
  });
  it('drops pending events on account switch and suppresses admin traffic', async () => {
    const client = new AnalyticsClient(() => '');
    client.track('page_view', 'entry'); const first = client.headers(); client.rotate();
    const second = client.headers(); expect(second['X-Analytics-Session']).not.toBe(first['X-Analytics-Session']);
    client.setAdmin(true); await client.flush(); expect(client.headers()).toEqual({}); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not requeue a failed request from a previous identity', async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const client = new AnalyticsClient(() => 'same-token'); client.track('page_view', 'entry');
    const pending = client.flush(); client.rotate(); reject(new Error('offline')); await pending;
    await client.flush(); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
