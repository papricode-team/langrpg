import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/600.css';
import './admin.css';
const params = new URLSearchParams(location.hash.slice(1));
const accountId = params.get('account') || '', token = params.get('token') || '';
history.replaceState(null, '', location.pathname);
const root = document.querySelector<HTMLElement>('#reset-app')!;
root.innerHTML = `<main class="login-shell"><a href="/game/" class="wordmark">glotworld</a><section class="panel"><h1>Reset your password</h1><p>Choose a new password for your account. Your progress and purchases stay saved.</p><form><label>New password<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><p id="login-error" role="alert"></p><button class="primary" type="submit">Save new password</button></form><a href="/game/">Back to Glotworld</a></section></main>`;
const form = root.querySelector('form')!, button = form.querySelector('button')!, error = root.querySelector<HTMLElement>('#login-error')!;
if (!accountId || !token) { error.textContent = 'This reset link is missing or invalid. Ask support for a new link.'; button.disabled = true; }
form.onsubmit = async event => {
  event.preventDefault(); const data = new FormData(form), password = String(data.get('password'));
  if (password !== data.get('confirm')) { error.textContent = 'The passwords do not match.'; return; }
  button.disabled = true; error.textContent = '';
  try {
    const response = await fetch('/api/account/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, token, password }), signal: AbortSignal.timeout(15000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to reset your password.');
    root.querySelector('section')!.innerHTML = '<h1>Password updated</h1><p>Your devices have been signed out. Sign in again with your new password to continue your adventure.</p><a href="/game/">Continue to Glotworld</a>';
  } catch (failure) { error.textContent = failure instanceof Error ? failure.message : 'Unable to reset your password. Try again.'; button.disabled = false; }
};
