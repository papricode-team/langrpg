const key = 'atlas.support-session';
interface SupportState { token: string; name: string; expiresAt: string }
export function supportSession(): SupportState | undefined {
  try { const value = JSON.parse(sessionStorage.getItem(key) || 'null') as SupportState | null; if (value?.token?.startsWith('support_') && typeof value.name === 'string' && typeof value.expiresAt === 'string') return value; } catch { /* No support session in this tab. */ }
  return undefined;
}
export function startSupportSession(token: string, name: string, expiresAt: string): void { sessionStorage.setItem(key, JSON.stringify({ token, name, expiresAt })); }
export function clearSupportSession(): void { sessionStorage.removeItem(key); }
export function mountSupportBanner(): void {
  const state = supportSession(); if (!state) return;
  const banner = document.createElement('aside'); banner.className = 'support-session-banner'; banner.setAttribute('aria-label', 'Admin support session');
  const label = document.createElement('span');
  label.textContent = `Logged in as ${state.name} · ends ${new Date(state.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Return to Admin';
  button.onclick = async () => {
    button.disabled = true;
    try { await fetch('/api/account/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` }, body: '{}', signal: AbortSignal.timeout(5000) }); }
    catch { /* The support session also expires server-side; preserve the return path. */ }
    clearSupportSession(); location.assign('/admin.html#users');
  };
  banner.append(label, button); document.body.append(banner);
  // Keep the return control usable while a paywall or onboarding modal is open.
  const place = () => {
    const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
    const parent = dialogs.item(dialogs.length - 1) ?? document.body;
    if (banner.parentElement !== parent) parent.append(banner);
  };
  const observer = new MutationObserver(place);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  place();
}
