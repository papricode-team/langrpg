import { escapeHtml as e } from './icons';
import { startSupportSession } from './support-session';
import type { GameAccess } from './game-access';

export interface AdminUser {
  id: string; name: string; email: string; registered: boolean; admin: boolean; createdAt: string; courseId: string; courseName?: string;
  access: GameAccess; grant: { lifetime: boolean; until: string };
  billing: { plan: string; customerId: string; subscriptionId: string; status: string; paidUntil: string; verifiedAt: string };
  xp?: number; resetPending?: boolean;
  audit?: { at: string; actorId: string; actorEmail: string; action: string; reason: string }[];
}
interface Directory { users: AdminUser[]; total: number; offset: number; limit: number; billingAvailable: boolean }
interface ActionResult { user: AdminUser; token?: string; expiresAt?: string; resetPath?: string }
type Request = <T>(path: string, body?: unknown) => Promise<T>;
export interface UsersHandle { destroy(): void }
const labels: Record<string, string> = { 'rename': 'Update name', 'grant-access': 'Grant complimentary access', 'revoke-grant': 'Remove complimentary access', 'reset-password': 'Create password reset link', 'revoke-sessions': 'Sign out all devices', 'impersonate': 'Log in as user', 'sync-billing': 'Sync with Creem', 'cancel-subscription': 'Cancel renewal', 'password-reset-completed': 'Password reset completed' };
const date = (value?: string) => value && !value.startsWith('0001-') ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const granted = (user: AdminUser) => user.grant.lifetime || Date.parse(user.grant.until) > Date.now();
const accessLabel = (user: AdminUser) => granted(user) ? 'Complimentary' : ({ free: 'Free play', paid: 'Paid access', guest: 'Guest trial', trial: 'Trial', login_required: 'Registration needed', payment_required: 'Trial ended' })[user.access.phase];
const badge = (user: AdminUser) => `<span class="user-badge ${['paid', 'free', 'trial', 'guest'].includes(user.access.phase) ? 'good' : ''}">${e(accessLabel(user))}</span>`;

export function renderUserDetail(user: AdminUser, billingAvailable: boolean): string {
  const action = (id: string, disabled = false, danger = false) => `<button data-user-action="${id}" ${disabled || user.admin ? 'disabled' : ''} ${danger ? 'class="danger"' : ''}>${labels[id]}</button>`;
  const grant = user.grant.lifetime ? 'Lifetime' : granted(user) ? `Until ${date(user.grant.until)}` : 'None';
  return `<div class="user-detail-heading"><div><h2>${e(user.name)}</h2><p>${e(user.email || 'Guest · no email address')}</p></div><button data-close-user aria-label="Close user details">✕</button></div>
    <div class="user-badges">${badge(user)}${user.admin ? '<span class="user-badge">Administrator</span>' : ''}</div>
    ${user.admin ? '<p class="user-notice">Administrator accounts are read-only here. Manage your credentials in account settings. Admin roles are configured by the deployment.</p>' : ''}
    <dl class="user-facts"><div><dt>User ID</dt><dd>${e(user.id)}</dd></div><div><dt>Joined</dt><dd>${e(date(user.createdAt))}</dd></div><div><dt>Active course</dt><dd>${e(user.courseName || user.courseId || 'Not enrolled')}</dd></div><div><dt>Learning XP</dt><dd>${user.xp ?? 0}</dd></div></dl>
    <section class="user-section"><h3>Account support</h3><p>Login-as lasts 30 minutes. Actions in the game affect this user’s saved progress.</p><div class="user-actions">${action('impersonate')}${action('rename')}${action('reset-password', !user.registered)}${action('revoke-sessions', !user.registered, true)}</div>${!user.registered ? '<p class="data-note">Guests need to register before password resets or signing out all devices.</p>' : ''}${user.resetPending ? '<p class="data-note">An unused password reset link is active. Creating another invalidates it.</p>' : ''}</section>
    <section class="user-section"><h3>Subscription</h3><dl class="user-facts"><div><dt>Creem plan</dt><dd>${e(user.billing.plan || 'No paid plan')}</dd></div><div><dt>Subscription status</dt><dd>${e(user.billing.status || '—')}</dd></div><div><dt>Paid through</dt><dd>${e(date(user.billing.paidUntil))}</dd></div><div><dt>Last verified</dt><dd>${e(date(user.billing.verifiedAt))}</dd></div>${user.billing.subscriptionId ? `<div><dt>Subscription ID</dt><dd>${e(user.billing.subscriptionId)}</dd></div>` : ''}${user.billing.customerId ? `<div><dt>Customer ID</dt><dd>${e(user.billing.customerId)}</dd></div>` : ''}</dl><div class="user-actions">${action('sync-billing', !billingAvailable || !user.registered)}${action('cancel-subscription', !billingAvailable || !user.billing.subscriptionId || ['scheduled_cancel', 'canceled'].includes(user.billing.status), true)}</div><p class="data-note">${billingAvailable ? 'Creem is the source of truth. Cancellation stops renewal at the end of the paid period.' : 'Creem billing is not configured in this environment.'}</p></section>
    <section class="user-section"><h3>Complimentary access</h3><p>${e(grant)}</p><p class="data-note">Grants access without charging the user. Existing Creem payments and renewals continue unless canceled separately.</p><div class="user-actions">${action('grant-access', !user.registered)}${action('revoke-grant', !granted(user), true)}</div></section>
    <section class="user-section"><h3>Recent admin activity</h3><p class="data-note">Latest 100 actions · times shown in your local timezone</p>${user.audit?.length ? `<ol class="user-audit">${[...user.audit].reverse().map(entry => `<li><strong>${e(labels[entry.action] || entry.action)}</strong><p>${e(entry.reason)}</p><span>${e(entry.actorEmail || entry.actorId)} · ${e(date(entry.at))}</span></li>`).join('')}</ol>` : '<p>No admin actions recorded.</p>'}</section>`;
}

export function mountUsers(host: HTMLElement, request: Request, onAuthError: (error: unknown) => boolean, onLogout: () => void = () => {}): UsersHandle {
  let disposed = false, listRevision = 0, detailRevision = 0, offset = 0, query = '', kind = '', directory: Directory | undefined, selected: AdminUser | undefined;
  host.innerHTML = `<header class="topbar"><div><strong>Users</strong><span class="user-subtitle">Accounts, subscriptions and support</span></div><div class="toolbar"><a href="/" class="mobile-admin-link">Back to game</a><button id="users-refresh">Refresh</button><button class="mobile-admin-link" id="users-sign-out">Sign out</button></div></header><main class="users-workspace" id="users-dashboard" tabindex="-1"><div class="section-heading"><div><h1>User management</h1><p>Find a learner, manage their access, and help them get back into the world.</p></div><span class="environment" id="users-count">Loading…</span></div><p id="users-message" class="users-message" role="status" hidden></p><div class="users-grid"><section class="panel users-directory"><form id="users-search" class="users-filters" role="search"><label class="user-search">Find a user<input name="q" type="search" placeholder="Name, email or user ID" maxlength="254"></label><label>Account type<select name="kind"><option value="">All users</option><option value="registered">Registered</option><option value="guest">Guests</option></select></label><button type="submit" class="primary">Search</button></form><div id="users-list" aria-busy="true"><div class="loading-state">Loading users…</div></div><nav class="users-pagination" aria-label="User pages"><button id="users-previous" disabled>Previous</button><span id="users-page"></span><button id="users-next" disabled>Next</button></nav></section><aside class="panel user-detail" id="user-detail" tabindex="-1" aria-label="User details"><div class="user-placeholder"><span class="user-placeholder-icon" aria-hidden="true">◎</span><h2>A little help goes a long way.</h2><p>Select a user to view their account, subscription and support actions.</p></div></aside></div></main>`;
  const list = host.querySelector<HTMLElement>('#users-list')!, detail = host.querySelector<HTMLElement>('#user-detail')!, message = host.querySelector<HTMLElement>('#users-message')!;
  const modal = document.createElement('dialog'); modal.className = 'user-action-dialog'; host.append(modal);
  function notify(text: string, error = false) { message.textContent = text; message.hidden = false; message.classList.toggle('error', error); message.setAttribute('role', error ? 'alert' : 'status'); }
  function fail(error: unknown) { if (!disposed && !onAuthError(error)) notify(error instanceof Error ? error.message : 'The request failed. Try again.', true); }
  function paintDetail(user: AdminUser) { selected = user; detail.innerHTML = renderUserDetail(user, directory?.billingAvailable ?? false); detail.querySelector<HTMLButtonElement>('[data-close-user]')!.onclick = () => { ++detailRevision; selected = undefined; detail.innerHTML = '<div class="user-placeholder"><h2>Select a user</h2><p>Account details will appear here.</p></div>'; highlight(); }; highlight(); }
  function highlight() { list.querySelectorAll<HTMLButtonElement>('[data-user-id]').forEach(button => { const active = button.dataset.userId === selected?.id; button.setAttribute('aria-pressed', String(active)); button.closest('tr')?.classList.toggle('selected', active); }); }
  async function openUser(id: string) {
    const revision = ++detailRevision; detail.setAttribute('aria-busy', 'true');
    try { const result = await request<{user: AdminUser}>(`/admin/users/${encodeURIComponent(id)}`); if (!disposed && revision === detailRevision) { paintDetail(result.user); detail.focus({ preventScroll: true }); if (detail.getBoundingClientRect().left <= list.getBoundingClientRect().left) detail.scrollIntoView({ block: 'start' }); } }
    catch (error) { if (revision === detailRevision) fail(error); }
    finally { if (revision === detailRevision) detail.setAttribute('aria-busy', 'false'); }
  }
  async function load() {
    const revision = ++listRevision; list.setAttribute('aria-busy', 'true');
    host.querySelector<HTMLButtonElement>('#users-refresh')!.disabled = true;
    host.querySelectorAll<HTMLButtonElement>('.users-pagination button').forEach(button => { button.disabled = true; });
    try {
      const result = await request<Directory>(`/admin/users?${new URLSearchParams({ q: query, kind, offset: String(offset) })}`);
      if (disposed || revision !== listRevision) return;
      directory = result;
      list.innerHTML = `<div class="table-scroll"><table class="users-table"><thead><tr><th scope="col">User</th><th scope="col">Access</th><th scope="col">Joined</th></tr></thead><tbody>${result.users.length ? result.users.map(user => `<tr><td><button class="user-row-button" data-user-id="${e(user.id)}" aria-pressed="false"><strong>${e(user.name)}${user.admin ? ' <span class="user-admin-label">ADMIN</span>' : ''}</strong><span>${e(user.email || 'Guest account')}</span></button></td><td>${badge(user)}<span class="user-plan">${e(user.billing.plan ? `${user.billing.plan} plan` : 'No paid plan')}</span></td><td>${e(new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }))}</td></tr>`).join('') : '<tr><td class="empty-cell" colspan="3">No users match your search. Try another name or email.</td></tr>'}</tbody></table></div>`;
      host.querySelector('#users-count')!.textContent = `${result.total.toLocaleString()} ${result.total === 1 ? 'user' : 'users'}`;
      host.querySelector('#users-page')!.textContent = result.total ? `${Math.min(offset + 1, result.total)}–${Math.min(offset + result.limit, result.total)} of ${result.total}` : 'No results';
      host.querySelector<HTMLButtonElement>('#users-previous')!.disabled = offset === 0;
      host.querySelector<HTMLButtonElement>('#users-next')!.disabled = offset + result.limit >= result.total;
      highlight();
    } catch (error) { if (revision === listRevision) { fail(error); if (!directory) list.innerHTML = '<p class="loading-state">Users could not be loaded. Use Refresh to try again.</p>'; } }
    finally { if (!disposed && revision === listRevision) { list.setAttribute('aria-busy', 'false'); host.querySelector<HTMLButtonElement>('#users-refresh')!.disabled = false; } }
  }
  host.querySelector<HTMLFormElement>('#users-search')!.onsubmit = event => { event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); query = String(data.get('q') || '').trim(); kind = String(data.get('kind') || ''); offset = 0; void load(); };
  host.querySelector<HTMLButtonElement>('#users-sign-out')!.onclick = onLogout;
  host.querySelector<HTMLButtonElement>('#users-refresh')!.onclick = () => { void load(); if (selected) void openUser(selected.id); };
  host.querySelector<HTMLButtonElement>('#users-previous')!.onclick = () => { offset = Math.max(0, offset - 30); void load(); };
  host.querySelector<HTMLButtonElement>('#users-next')!.onclick = () => { offset += 30; void load(); };
  list.onclick = event => { const id = (event.target as Element).closest<HTMLButtonElement>('[data-user-id]')?.dataset.userId; if (id) void openUser(id); };
  detail.onclick = event => { const action = (event.target as Element).closest<HTMLButtonElement>('[data-user-action]')?.dataset.userAction; if (action && selected) confirmAction(action, selected); };
  function confirmAction(action: string, user: AdminUser) {
    const descriptions: Record<string, string> = {
      'rename': 'Update the name shown in the game and in saved courses.',
      'grant-access': 'Set a complimentary access period starting now. This replaces any existing grant and does not change Creem charges.',
      'revoke-grant': 'Remove this support grant. Any paid subscription and remaining trial time still apply.',
      'reset-password': 'Create a single-use link that expires in one hour. Share it securely with the account holder. It is not emailed automatically. Their password changes and devices sign out only when they use the link.',
      'revoke-sessions': 'Sign this user out on every device, including support sessions, and invalidate pending reset links. They can sign back in with their password.',
      'impersonate': 'Open the game as this user in this tab for up to 30 minutes. Gameplay changes are saved to their account. Your admin sign-in stays available through Return to Admin.',
      'sync-billing': 'Read the latest verified subscription and payment status from Creem.',
      'cancel-subscription': 'Stop automatic renewal through Creem. The user keeps access for the remainder of their paid period. This does not issue a refund.',
    };
    modal.innerHTML = `<form><p>${e(user.email || user.name)}</p><h2 id="user-action-title">${e(labels[action])}</h2><p>${e(descriptions[action])}</p>${action === 'rename' ? `<label>Display name<input name="name" required minlength="2" maxlength="24" value="${e(user.name)}"></label>` : ''}${action === 'grant-access' ? '<label>Duration<select name="duration"><option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="lifetime">Lifetime</option></select></label>' : ''}<label>Reason for this action<textarea name="reason" required minlength="3" maxlength="500" rows="3" placeholder="For example: helping with a support request"></textarea></label><p class="user-action-error" role="alert"></p><div class="user-actions"><button type="button" data-cancel>Cancel</button><button type="submit" class="primary">${e(labels[action])}</button></div></form>`;
    modal.setAttribute('aria-labelledby', 'user-action-title'); modal.showModal();
    const form = modal.querySelector('form')!, cancel = modal.querySelector<HTMLButtonElement>('[data-cancel]')!;
    let busy = false; modal.oncancel = event => { if (busy) event.preventDefault(); }; cancel.onclick = () => modal.close();
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return; busy = true;
      const data = new FormData(form), duration = data.get('duration');
      form.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
      try {
        const result = await request<ActionResult>(`/admin/users/${encodeURIComponent(user.id)}/${action}`, { reason: data.get('reason'), ...(action === 'rename' ? { name: data.get('name') } : {}), ...(action === 'grant-access' ? { lifetime: duration === 'lifetime', days: duration === 'lifetime' ? 0 : Number(duration) } : {}) });
        if (disposed) return;
        if (action === 'impersonate' && result.token && result.expiresAt) { startSupportSession(result.token, user.name, result.expiresAt); location.assign('/'); return; }
        ++detailRevision; paintDetail(result.user); void load();
        if (result.resetPath) {
          const resetURL = new URL(result.resetPath, location.origin).href;
          modal.innerHTML = `<h2 id="user-action-title">Password reset link ready</h2><p>Share this link securely with ${e(user.email)}. It expires ${e(date(result.expiresAt))} and can be used once.</p><label>Reset link<input readonly aria-label="Password reset link" value="${e(resetURL)}"></label><p class="user-action-error" role="status"></p><div class="user-actions"><button data-copy>Copy link</button><button data-done class="primary">Done</button></div>`;
          modal.querySelector<HTMLButtonElement>('[data-copy]')!.onclick = async () => { try { await navigator.clipboard.writeText(resetURL); modal.querySelector('[role="status"]')!.textContent = 'Link copied.'; } catch { modal.querySelector('input')!.select(); modal.querySelector('[role="status"]')!.textContent = 'Select and copy the link above.'; } };
          modal.querySelector<HTMLButtonElement>('[data-done]')!.onclick = () => modal.close();
        } else { modal.close(); notify(`${labels[action]} completed for ${user.name}.`); }
      } catch (error) { if (!disposed && !onAuthError(error)) form.querySelector('.user-action-error')!.textContent = error instanceof Error ? error.message : 'The action failed. Try again.'; }
      finally { busy = false; form.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = false; }); }
    };
  }
  void load();
  return { destroy() { disposed = true; ++listRevision; ++detailRevision; modal.close(); modal.remove(); } };
}
