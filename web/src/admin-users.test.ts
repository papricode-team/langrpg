// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountUsers, renderUserDetail, type AdminUser } from './admin-users';
const user = (): AdminUser => ({ id: 'member', name: 'Juniper', email: 'juniper@example.com', registered: true, admin: false, createdAt: '2026-10-15T10:00:00Z', courseId: 'german', access: { phase: 'trial', registered: true, remainingSeconds: 900, playedSeconds: 0, billingAvailable: false }, grant: { lifetime: false, until: '0001-01-01T00:00:00Z' }, billing: { plan: '', customerId: '', subscriptionId: '', status: '', paidUntil: '', verifiedAt: '' }, xp: 32, audit: [] });
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });
describe('admin users', () => {
  it('escapes names and audit data, and keeps administrator actions read-only', () => {
    const account = user(); account.name = '<img src=x onerror=alert(1)>'; account.admin = true;
    account.audit = [{ at: account.createdAt, actorId: 'admin', actorEmail: 'admin@example.com', action: 'rename', reason: '<script>unsafe</script>' }];
    const host = document.createElement('div'); host.innerHTML = renderUserDetail(account, true);
    expect(host.querySelector('img,script')).toBeNull(); expect(host.textContent).toContain('<script>unsafe</script>');
    expect([...host.querySelectorAll<HTMLButtonElement>('[data-user-action]')].every(button => button.disabled)).toBe(true);
  });
  it('explains disabled guest actions and preserves renewal state', () => {
    const account = user(); account.registered = false; account.email = ''; account.billing.subscriptionId = 'sub'; account.billing.status = 'scheduled_cancel';
    const host = document.createElement('div'); host.innerHTML = renderUserDetail(account, true);
    for (const action of ['reset-password', 'revoke-sessions', 'grant-access', 'cancel-subscription']) expect(host.querySelector<HTMLButtonElement>(`[data-user-action="${action}"]`)!.disabled).toBe(true);
    expect(host.textContent).toContain('scheduled_cancel');
  });
  it('searches server-side and requires a reason before sending a user action', async () => {
    const account = user(), request = vi.fn(async (path: string) => path.includes('?') ? { users: [account], total: 1, offset: 0, limit: 30, billingAvailable: false } : { user: account });
    const host = document.createElement('div'); document.body.append(host);
    const handle = mountUsers(host, request as Parameters<typeof mountUsers>[1], () => false);
    await vi.waitFor(() => expect(host.querySelector('[data-user-id]')).not.toBeNull());
    host.querySelector<HTMLInputElement>('[name="q"]')!.value = 'juniper@example.com';
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('q=juniper%40example.com')));
    host.querySelector<HTMLButtonElement>('[data-user-id]')!.click();
    await vi.waitFor(() => expect(host.querySelector('[data-user-action="revoke-sessions"]')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('[data-user-action="revoke-sessions"]')!.click();
    expect(request.mock.calls.some(([path]) => path.endsWith('/revoke-sessions'))).toBe(false);
    expect(host.querySelector<HTMLTextAreaElement>('[name="reason"]')!.required).toBe(true);
    host.querySelector<HTMLTextAreaElement>('[name="reason"]')!.value = 'User requested device sign-out';
    host.querySelector('dialog form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/admin/users/member/revoke-sessions', { reason: 'User requested device sign-out' }));
    handle.destroy();
  });
  it('ignores a detail response after the selected panel is closed', async () => {
    const account = user(); let resolve!: (value: { user: AdminUser }) => void;
    let calls = 0;
    const request = vi.fn((path: string) => path.includes('?') ? Promise.resolve({ users: [account], total: 1, offset: 0, limit: 30, billingAvailable: false }) : ++calls === 1 ? Promise.resolve({ user: account }) : new Promise(done => { resolve = done; }));
    const host = document.createElement('div'); document.body.append(host); const handle = mountUsers(host, request as Parameters<typeof mountUsers>[1], () => false);
    await vi.waitFor(() => expect(host.querySelector('[data-user-id]')).not.toBeNull()); host.querySelector<HTMLButtonElement>('[data-user-id]')!.click();
    await vi.waitFor(() => expect(host.querySelector('[data-close-user]')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('#users-refresh')!.click(); host.querySelector<HTMLButtonElement>('[data-close-user]')!.click();
    resolve({ user: account }); await Promise.resolve();
    expect(host.querySelector('#user-detail')!.textContent).toContain('Select a user'); handle.destroy();
  });
});
