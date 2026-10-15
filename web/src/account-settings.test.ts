// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountCredentialRows, bindAccountCredentials } from './account-settings';
import { optionsMarkup } from './options-menu';

const account = { registered: true, email: 'juniper@example.com' };
function mount() {
  document.body.innerHTML = optionsMarkup('account', accountCredentialRows(account));
  const api = { changeCredentials: vi.fn().mockResolvedValue({ ...account, email: 'new@example.com' }) }, saved = vi.fn();
  bindAccountCredentials(document.body, api, saved);
  return { api, saved };
}
const field = (form: HTMLFormElement, name: string, value: string) => {
  const input = form.elements.namedItem(name) as HTMLInputElement;
  input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
};
const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
afterEach(() => { document.body.replaceChildren(); });

describe('account credentials', () => {
  it('always shows the current email in plain text and prefills its editor', () => {
    mount();
    expect(document.querySelector('.account-current-email')!.textContent).toBe(account.email);
    expect(document.querySelector('.account-current-email')!.closest('details')).toBeNull();
    const input = document.querySelector<HTMLInputElement>('[name="email"]')!;
    expect(input.type).toBe('email'); expect(input.value).toBe(account.email);
    expect(accountCredentialRows({ registered: false, email: '' })).toEqual([]);
  });

  it('sends only the changed email with current-password verification', async () => {
    const { api, saved } = mount();
    const form = document.querySelector<HTMLFormElement>('[data-credential-form="email"]')!;
    field(form, 'email', ' new@example.com '); field(form, 'currentPassword', 'old password');
    submit(form);
    await vi.waitFor(() => expect(saved).toHaveBeenCalledWith({ ...account, email: 'new@example.com' }, 'email'));
    expect(api.changeCredentials).toHaveBeenCalledWith({ email: 'new@example.com', currentPassword: 'old password' });
    expect((form.elements.namedItem('currentPassword') as HTMLInputElement).value).toBe('');
  });

  it('requires matching passwords and clears secrets after saving', async () => {
    const { api, saved } = mount();
    const form = document.querySelector<HTMLFormElement>('[data-credential-form="password"]')!;
    field(form, 'currentPassword', 'old password'); field(form, 'newPassword', 'new lantern password'); field(form, 'confirmation', 'different password');
    submit(form); expect(api.changeCredentials).not.toHaveBeenCalled();
    field(form, 'confirmation', 'new lantern password'); submit(form);
    await vi.waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.changeCredentials).toHaveBeenCalledWith({ currentPassword: 'old password', newPassword: 'new lantern password' });
    expect([...form.querySelectorAll<HTMLInputElement>('[type="password"]')].every(input => input.value === '' && input.type === 'password')).toBe(true);
  });

  it('shows failed updates inline and allows retry without duplicate submissions', async () => {
    const { api, saved } = mount();
    let reject!: (error: Error) => void;
    api.changeCredentials.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const form = document.querySelector<HTMLFormElement>('[data-credential-form="email"]')!;
    field(form, 'email', 'new@example.com'); field(form, 'currentPassword', 'old password');
    submit(form); submit(form); expect(api.changeCredentials).toHaveBeenCalledTimes(1);
    reject(new Error('current password is incorrect'));
    await vi.waitFor(() => expect(form.querySelector('[role="alert"]')!.textContent).toBe('current password is incorrect'));
    expect(saved).not.toHaveBeenCalled();
    expect(form.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false);
    field(form, 'currentPassword', 'correct password'); submit(form);
    await vi.waitFor(() => expect(saved).toHaveBeenCalled());
  });

  it('cancels an editor and clears entered passwords', () => {
    mount();
    const form = document.querySelector<HTMLFormElement>('[data-credential-form="email"]')!, details = form.closest('details')!;
    details.open = true; field(form, 'email', 'new@example.com'); field(form, 'currentPassword', 'secret');
    form.querySelector<HTMLButtonElement>('[data-cancel-credentials]')!.click();
    expect(details.open).toBe(false);
    expect((form.elements.namedItem('email') as HTMLInputElement).value).toBe(account.email);
    expect((form.elements.namedItem('currentPassword') as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(details.querySelector('summary'));
  });
});
