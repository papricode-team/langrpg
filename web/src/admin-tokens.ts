import { escapeHtml as e } from './icons';

/** API tokens let tools act as an administrator, such as the world MCP server in tools/world-mcp. */
export interface AdminToken { id: string; accountId: string; name: string; createdAt: string; lastUsedAt?: string; revokedAt?: string }
type Request = <T>(path: string, body?: unknown) => Promise<T>;
export interface TokensHandle { destroy(): void }

const date = (value?: string) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function renderTokenRows(tokens: AdminToken[]): string {
  if (!tokens.length) return '<p class="data-note">No tokens yet.</p>';
  return `<table class="token-table"><thead><tr><th>Name</th><th>Created</th><th>Last used</th><th>Status</th><th aria-label="Actions"></th></tr></thead><tbody>${tokens.map(token => `<tr><td>${e(token.name)}</td><td>${e(date(token.createdAt))}</td><td>${e(date(token.lastUsedAt))}</td><td>${token.revokedAt ? `Revoked ${e(date(token.revokedAt))}` : 'Active'}</td><td>${token.revokedAt ? '' : `<button class="danger" data-revoke-token="${e(token.id)}">Revoke</button>`}</td></tr>`).join('')}</tbody></table>`;
}

export function mountTokens(host: HTMLElement, request: Request, onAuthError: (error: unknown) => boolean): TokensHandle {
  let disposed = false;
  host.innerHTML = `<header class="topbar"><div><strong>API tokens</strong><span class="user-subtitle">Let tools and agents edit the world for you</span></div></header><main class="users-workspace" id="tokens-dashboard" tabindex="-1"><div class="section-heading"><div><h1>API tokens</h1><p>A token acts with your administrator access. It can edit the world and story lines, but cannot create or revoke tokens. Revoke tokens you no longer use.</p></div></div><p id="tokens-message" class="users-message" role="status" hidden></p><section class="panel token-panel"><form id="token-create" class="users-filters"><label>Token name<input name="name" maxlength="60" required placeholder="World MCP on my laptop"></label><button type="submit" class="primary">Create token</button></form><div id="token-secret" hidden></div><div id="token-list" aria-busy="true"><div class="loading-state">Loading tokens…</div></div></section></main>`;
  const list = host.querySelector<HTMLElement>('#token-list')!, secret = host.querySelector<HTMLElement>('#token-secret')!, message = host.querySelector<HTMLElement>('#tokens-message')!;
  const notify = (text: string, error = false) => { message.textContent = text; message.hidden = false; message.classList.toggle('error', error); message.setAttribute('role', error ? 'alert' : 'status'); };
  const fail = (error: unknown) => { if (!onAuthError(error)) notify(error instanceof Error ? error.message : 'The request failed.', true); };
  async function load(): Promise<void> {
    list.setAttribute('aria-busy', 'true');
    try { const { tokens } = await request<{ tokens: AdminToken[] }>('/admin/tokens'); if (!disposed) list.innerHTML = renderTokenRows(tokens); }
    catch (error) { if (!disposed) fail(error); }
    finally { list.setAttribute('aria-busy', 'false'); }
  }
  host.querySelector<HTMLFormElement>('#token-create')!.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement, name = String(new FormData(form).get('name') ?? '').trim();
    try {
      const { token } = await request<{ token: string }>('/admin/tokens', { name });
      form.reset();
      secret.hidden = false;
      secret.innerHTML = `<p><strong>Copy this token now.</strong> It is shown once.</p><code class="token-secret">${e(token)}</code><p class="data-note">Use it as GLOTWORLD_ADMIN_TOKEN with npm run world:pull, world:push or the world MCP server.</p>`;
      await load();
    } catch (error) { fail(error); }
  });
  list.addEventListener('click', async event => {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-revoke-token]')?.dataset.revokeToken;
    if (!id || !confirm('Revoke this token? Tools using it stop working at once.')) return;
    try { await request(`/admin/tokens/${encodeURIComponent(id)}/revoke`, {}); notify('Token revoked.'); await load(); }
    catch (error) { fail(error); }
  });
  void load();
  return { destroy() { disposed = true; host.innerHTML = ''; } };
}
