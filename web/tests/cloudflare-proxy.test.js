import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/[[path]].js';

const SITE = 'https://lantern-atlas-lernen01.pages.dev';
const ORIGIN = 'https://game-backend.example.com';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function proxy(request, origin = ORIGIN) {
  return onRequest({ request, env: { BACKEND_ORIGIN: origin } });
}

function expectNoStore(response) {
  for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) {
    expect(response.headers.get(name)).toBe('no-store');
  }
}

describe('Cloudflare Pages API proxy', () => {
  it.each([undefined, '', '  ', null])('returns useful uncached JSON when backend configuration is missing: %s', async origin => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const response = await onRequest({ request: new Request(`${SITE}/api/health`), env: { BACKEND_ORIGIN: origin } });
    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expectNoStore(response);
    expect(await response.json()).toEqual({
      error: 'The multiplayer server has not been connected to this site yet.', code: 'backend_not_configured',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    'http://game-backend.example.com', 'ftp://game-backend.example.com', 'not a URL',
    'https://user:secret@game-backend.example.com', 'https://@game-backend.example.com',
    'https://game-backend.example.com/backend', 'https://game-backend.example.com/../',
    'https://game-backend.example.com?token=secret', 'https://game-backend.example.com?',
    'https://game-backend.example.com/#secret', 'https://game-backend.example.com#',
    'https://game-backend.example.com\\unwanted',
    SITE, `${SITE}/`, 'https://LANTERN-ATLAS-LERNEN01.pages.dev:8443',
    'https://lantern-atlas-lernen01.pages.dev.',
  ])('rejects invalid or looping backend origins without fetching: %s', async origin => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const response = await proxy(new Request(`${SITE}/api/health`), origin);
    expect(response.status).toBe(503);
    expectNoStore(response);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('preserves the exact API route, encoded query, external Origin, authorization and streamed request body', async () => {
    const body = JSON.stringify({ name: 'Überraschung', avatar: { outfit: '#326a65' } });
    const upstream = new Response('{"token":"test-session"}', {
      status: 201, statusText: 'Created',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', 'X-Request-Id': 'receipt-1' },
    });
    const fetcher = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal('fetch', fetcher);
    const request = new Request(`${SITE}/api/session?next=a%2Fb&token=a%2Bb%3D&tag=1&tag=2`, {
      method: 'POST',
      headers: { Origin: SITE, Authorization: 'Bearer test-secret', 'Content-Type': 'application/json', Host: 'ignored.example' },
      body,
    });
    const response = await proxy(request, `${ORIGIN}/`);
    expect(fetcher).toHaveBeenCalledOnce();
    const [forwarded, options] = fetcher.mock.calls[0];
    expect(forwarded.url).toBe(`${ORIGIN}/api/session?next=a%2Fb&token=a%2Bb%3D&tag=1&tag=2`);
    expect(forwarded.method).toBe('POST');
    expect(forwarded.headers.get('Origin')).toBe(SITE);
    expect(forwarded.headers.get('Authorization')).toBe('Bearer test-secret');
    expect(forwarded.headers.get('Content-Type')).toBe('application/json');
    expect(forwarded.headers.has('Host')).toBe(false);
    expect(await forwarded.text()).toBe(body);
    expect(options).toEqual({ redirect: 'manual', cache: 'no-store' });
    expect(response.status).toBe(201);
    expect(response.statusText).toBe('Created');
    expect(response.headers.get('X-Request-Id')).toBe('receipt-1');
    expectNoStore(response);
    expect(await response.json()).toEqual({ token: 'test-session' });
  });

  it('preserves the Go health path and keeps double-slash paths on the fixed backend', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"status":"ok"}')));
    vi.stubGlobal('fetch', fetcher);
    await proxy(new Request(`${SITE}/api/health`));
    await proxy(new Request(`${SITE}/api//other.example/health?x=1`), ' https://game-backend.example.com:8443/ ');
    expect(fetcher.mock.calls[0][0].url).toBe(`${ORIGIN}/api/health`);
    expect(fetcher.mock.calls[1][0].url).toBe('https://game-backend.example.com:8443/api//other.example/health?x=1');
  });

  it('passes backend authentication failures and redirects through without following them', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"session is invalid"}', { status: 401, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { Location: 'https://other.example/' } }));
    vi.stubGlobal('fetch', fetcher);
    const denied = await proxy(new Request(`${SITE}/api/progress`));
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({ error: 'session is invalid' });
    expectNoStore(denied);
    const redirected = await proxy(new Request(`${SITE}/api/session`));
    expect(redirected.status).toBe(307);
    expect(redirected.headers.get('Location')).toBe('https://other.example/');
    expectNoStore(redirected);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, options]) => options.redirect === 'manual')).toBe(true);
  });

  it('returns the original 101 response and WebSocket attachment without wrapping it', async () => {
    // Node's standard Response constructor excludes 101; model the Workers
    // response explicitly so this test verifies attachment and object identity.
    const upgraded = { status: 101, headers: new Headers({ Upgrade: 'websocket' }), webSocket: { socket: 'upstream' } };
    const fetcher = vi.fn().mockResolvedValue(upgraded);
    vi.stubGlobal('fetch', fetcher);
    const request = new Request(`${SITE}/api/world?token=encoded%2Bsecret`, {
      headers: { Origin: SITE, Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Protocol': 'world-v1' },
    });
    const result = await proxy(request);
    expect(result).toBe(upgraded);
    expect(result.webSocket).toBe(upgraded.webSocket);
    const forwarded = fetcher.mock.calls[0][0];
    expect(forwarded.url).toBe(`${ORIGIN}/api/world?token=encoded%2Bsecret`);
    expect(forwarded.headers.get('Origin')).toBe(SITE);
    expect(forwarded.headers.get('Upgrade')).toBe('websocket');
    expect(forwarded.headers.get('Sec-WebSocket-Protocol')).toBe('world-v1');
  });

  it('returns a safe uncached 502 for network failures without exposing or logging token-bearing errors', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = vi.fn().mockRejectedValue(new Error('Failed https://private.example/api/world?token=do-not-expose'));
    vi.stubGlobal('fetch', fetcher);
    const response = await proxy(new Request(`${SITE}/api/world?token=do-not-expose`));
    expect(response.status).toBe(502);
    expectNoStore(response);
    expect(await response.json()).toEqual({
      error: 'The multiplayer server is temporarily unreachable. Please try again shortly.', code: 'backend_unreachable',
    });
    expect(logger).not.toHaveBeenCalled();
  });
});
