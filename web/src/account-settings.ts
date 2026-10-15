import type { AccountStatus, Api } from './api';
import { escapeHtml as e, icon } from './icons';
import { t } from './i18n';
import type { OptionRow } from './options-menu';

/** Email stays readable even while its editor is closed. Passwords are never displayed. */
export function accountCredentialRows(account: AccountStatus): OptionRow[] {
  if (!account.registered) return [];
  const currentPassword = (kind: string) => `<label for="${kind}-current-password">${e(t('Current password'))}</label><input id="${kind}-current-password" name="currentPassword" type="password" required maxlength="128" autocomplete="current-password"/>`;
  const editor = (kind: 'email' | 'password', fields: string) => `<details class="account-credential-editor"><summary>${e(t(kind === 'email' ? 'Change email' : 'Change password'))}${icon('chevron')}</summary><form data-credential-form="${kind}">${fields}${currentPassword(kind)}<p class="account-credential-error" role="alert"></p><div class="account-credential-actions"><button type="submit" class="option-action">${e(t(kind === 'email' ? 'Save email' : 'Save password'))}</button><button type="button" data-cancel-credentials class="text-button">${e(t('Cancel'))}</button></div></form></details>`;
  return [
    { kind: 'custom', id: 'account-email', label: t('Email'), help: '', html: `<span class="account-current-email">${e(account.email)}</span>${editor('email', `<label for="account-new-email">${e(t('New email'))}</label><input id="account-new-email" name="email" type="email" value="${e(account.email)}" required maxlength="254" autocomplete="email"/>`)}` },
    { kind: 'custom', id: 'account-password', label: t('Password'), help: '', html: editor('password', `<input name="username" type="hidden" value="${e(account.email)}" autocomplete="username"/><label for="account-new-password">${e(t('New password'))}</label><input id="account-new-password" name="newPassword" type="password" required minlength="10" maxlength="128" autocomplete="new-password" aria-describedby="new-password-help"/><span class="caption" id="new-password-help">${e(t('Use 10–128 characters.'))}</span><label for="account-confirm-password">${e(t('Confirm password'))}</label><input id="account-confirm-password" name="confirmation" type="password" required minlength="10" maxlength="128" autocomplete="new-password"/>`) },
  ];
}

export function bindAccountCredentials(root: HTMLElement, api: Pick<Api, 'changeCredentials'>, saved: (account: AccountStatus, kind: 'email' | 'password') => void): void {
  root.querySelectorAll<HTMLFormElement>('[data-credential-form]').forEach(form => {
    const kind = form.dataset.credentialForm as 'email' | 'password';
    const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
    const error = form.querySelector<HTMLElement>('[role="alert"]')!;
    const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    let pending = false;
    const checkConfirmation = () => {
      if (kind === 'password') input('confirmation').setCustomValidity(input('confirmation').value === input('newPassword').value ? '' : t('The passwords must match.'));
    };
    form.addEventListener('input', () => { checkConfirmation(); error.textContent = ''; });
    form.querySelector('[data-cancel-credentials]')!.addEventListener('click', () => {
      if (pending) return;
      form.reset(); checkConfirmation(); error.textContent = '';
      const details = form.closest('details')!;
      details.open = false;
      details.querySelector('summary')!.focus();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      checkConfirmation();
      if (pending || !form.reportValidity()) return;
      pending = true; button.disabled = true; form.setAttribute('aria-busy', 'true'); error.textContent = '';
      try {
        const account = await api.changeCredentials({ currentPassword: input('currentPassword').value, ...(kind === 'email' ? { email: input('email').value.trim() } : { newPassword: input('newPassword').value }) });
        form.reset();
        form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(field => { field.value = ''; });
        saved(account, kind);
      } catch (cause) {
        error.textContent = cause instanceof Error ? t(cause.message) : t('Your changes could not be saved. Try again.');
      } finally {
        pending = false; button.disabled = false; form.removeAttribute('aria-busy');
      }
    });
  });
}
