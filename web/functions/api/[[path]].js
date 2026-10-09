const NO_STORE = {
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
};

function errorResponse(status, error, code) {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function backendOrigin(value, incoming) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const source = value.trim();
  // Only an origin is configurable. Check before URL normalization so paths
  // such as /../ and empty query/fragment markers cannot slip through.
  if (!/^https:\/\/[^/?#\\\s]+\/?$/i.test(source)) return undefined;
  try {
    const backend = new URL(source);
    const sameHost = backend.hostname.toLowerCase().replace(/\.$/, '') === incoming.hostname.toLowerCase().replace(/\.$/, '');
    if (backend.protocol !== 'https:' || !backend.hostname || source.includes('@')
      || backend.username || backend.password || backend.pathname !== '/'
      || backend.search || backend.hash || sameHost) return undefined;
    return backend;
  } catch {
    return undefined;
  }
}

export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  const backend = backendOrigin(env?.BACKEND_ORIGIN, incoming);
  if (!backend) {
    return errorResponse(503, 'The multiplayer server has not been connected to this site yet.', 'backend_not_configured');
  }

  // Assign path/query onto the fixed origin rather than resolving a supplied
  // path as a URL. This keeps even double-slash paths on the configured host.
  backend.pathname = incoming.pathname;
  backend.search = incoming.search;
  try {
    const forwarded = new Request(backend.toString(), request);
    forwarded.headers.delete('Host');
    // Never follow an origin redirect with bearer credentials. API traffic
    // also bypasses Cloudflare's fetch cache, including authenticated GETs.
    const response = await fetch(forwarded, { redirect: 'manual', cache: 'no-store' });
    // A replacement Response would discard the Workers WebSocket attachment.
    // Successful upgrades are never cached and must retain their identity.
    if (response.status === 101) return response;
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(NO_STORE)) headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    // Error objects may contain URLs or credentials; do not log or expose them.
    return errorResponse(502, 'The multiplayer server is temporarily unreachable. Please try again shortly.', 'backend_unreachable');
  }
}
