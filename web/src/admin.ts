import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './admin.css';
import { escapeHtml as escape } from './icons';
import { analyticsCSV, bindAnalyticsControls, renderAnalytics, type AnalyticsReport } from './admin-analytics';

const root = document.querySelector<HTMLElement>('#admin-app')!;
let token = localStorage.getItem('atlas.token') ?? '';
let days = 30, revision = 0;
let report: AnalyticsReport | undefined;
class AdminError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new AdminError(value.error || `Request failed (${response.status})`, response.status);
  return value as T;
}
function login(message = ''): void {
  ++revision; report = undefined;
  root.innerHTML = `<main class="login-shell"><a href="/" class="wordmark">glotworld<span>ADMIN</span></a><section class="panel"><h1>Admin sign in</h1><p>Use your Glotworld administrator account.</p><form id="admin-login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><p id="login-error" role="alert">${escape(message)}</p><button class="primary" type="submit">Open analytics</button></form><a href="/">Back to the adventure</a></section></main>`;
  root.querySelector<HTMLFormElement>('form')!.onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement, button = form.querySelector('button')!;
    button.disabled = true;
    try {
      token = '';
      const data = new FormData(form);
      const result = await request<{ token: string; account: { admin?: boolean } }>('/account/login', { email: data.get('email'), password: data.get('password') });
      if (!result.account.admin) throw new Error('This account does not have administrator access.');
      token = result.token; localStorage.setItem('atlas.token', token); shell(); await load();
    } catch (error) { const label = root.querySelector('#login-error'); if (label) label.textContent = error instanceof Error ? error.message : 'Unable to sign in.'; }
    finally { button.disabled = false; }
  };
}
function shell(): void {
  root.innerHTML = `<a class="skip-link" href="#dashboard">Skip to dashboard</a><div class="admin-layout"><aside class="sidebar"><a class="wordmark" href="/admin.html">glotworld<span>ADMIN</span></a><span class="nav-label">WORKSPACE</span><nav aria-label="Admin sections"><a href="#overview">Overview</a><a href="#conversion">Conversion</a><a href="#retention">Retention</a><a href="#acquisition">Acquisition</a><a href="#customers">Customers</a><a href="#events">Product activity</a></nav><div class="sidebar-bottom"><span class="first-party-dot">First-party analytics</span><p>Your app. Your database.</p><a href="/editor.html">Open World Studio ↗</a><a href="/">Back to game ↗</a><button data-admin-logout>Sign out</button></div></aside><div class="admin-main"><header class="topbar"><div><strong>Analytics</strong><span id="last-updated" role="status">Loading your workspace…</span></div><div class="toolbar"><label class="select-label">Period<select id="period"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select></label><button id="refresh">Refresh</button><button id="export" disabled>Export CSV</button></div></header><p id="dashboard-error" class="error-banner" role="alert" hidden></p><main id="dashboard" tabindex="-1" aria-busy="true"><div class="loading-state">Loading analytics…</div></main><footer><span>Glotworld · Built for the first 1,000 customers</span><a href="#definitions">How these numbers work</a><a class="mobile-admin-link" href="/">Back to game</a><button class="mobile-admin-link" data-admin-logout>Sign out</button></footer></div></div>`;
  root.querySelector<HTMLSelectElement>('#period')!.value = String(days);
  root.querySelector<HTMLSelectElement>('#period')!.onchange = event => { days = Number((event.target as HTMLSelectElement).value); void load(); };
  root.querySelector<HTMLButtonElement>('#refresh')!.onclick = () => { void load(); };
  root.querySelector<HTMLButtonElement>('#export')!.onclick = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([analyticsCSV(report)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `glotworld-analytics-${report.from.slice(0, 10)}-${report.to.slice(0, 10)}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  root.querySelectorAll<HTMLButtonElement>('[data-admin-logout]').forEach(button => { button.onclick = async () => {
    try { await request('/account/logout', {}); token = ''; localStorage.removeItem('atlas.token'); login(); }
    catch { const error = root.querySelector<HTMLElement>('#dashboard-error')!; error.hidden = false; error.textContent = 'Could not sign out. Try again.'; }
  }; });
}
async function load(): Promise<void> {
  const current = ++revision, selectedDays = days;
  const dashboard = root.querySelector<HTMLElement>('#dashboard')!, error = root.querySelector<HTMLElement>('#dashboard-error')!;
  const refresh = root.querySelector<HTMLButtonElement>('#refresh')!, exportButton = root.querySelector<HTMLButtonElement>('#export')!;
  dashboard.setAttribute('aria-busy', 'true'); refresh.disabled = true; exportButton.disabled = true; error.hidden = true;
  try {
    const result = await request<AnalyticsReport>(`/admin/analytics?days=${selectedDays}`);
    if (current !== revision) return;
    report = result; dashboard.innerHTML = renderAnalytics(result); bindAnalyticsControls(dashboard, result);
    root.querySelector('#last-updated')!.textContent = `Updated ${new Date(result.generatedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC · ${selectedDays} days`;
    exportButton.disabled = false;
  } catch (failure) {
    if (current !== revision) return;
    if (failure instanceof AdminError && (failure.status === 401 || failure.status === 403)) { login(failure.status === 403 ? 'This account does not have administrator access.' : 'Sign in to view analytics.'); return; }
    error.hidden = false; error.textContent = `${failure instanceof Error ? failure.message : 'Could not load analytics.'}${report ? ' The previous view is still shown.' : ' Use Refresh to try again.'}`;
    root.querySelector('#last-updated')!.textContent = report ? `Showing earlier ${report.days}-day data` : 'Analytics unavailable';
    if (!report) dashboard.innerHTML = '<div class="loading-state">Analytics could not be loaded.</div>';
  } finally { if (current === revision) { dashboard.setAttribute('aria-busy', 'false'); refresh.disabled = false; } }
}
if (token) { shell(); void load(); } else login();
