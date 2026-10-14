// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notifications, installFormNotifications } from './notifications';

let log: Notifications | undefined;
let removeValidation: (() => void) | undefined;
afterEach(() => {
  removeValidation?.(); removeValidation = undefined;
  log?.destroy(); log = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('event notifications', () => {
  it('expires overlapping notifications independently without persistent log controls', () => {
    vi.useFakeTimers();
    log = new Notifications();
    log.notify('Evidence saved. Return to Emil.');
    vi.advanceTimersByTime(3000);
    log.notify('Following the lanterns…');
    vi.advanceTimersByTime(2500);
    const recent = log.host.querySelector('.notifications-recent')!;
    expect(recent.textContent).not.toContain('Evidence saved');
    expect(recent.textContent).toContain('Following the lanterns');
    vi.advanceTimersByTime(3000);
    expect(recent.children).toHaveLength(0);
    expect(log.host.querySelectorAll('button, section, ol')).toHaveLength(0);
    expect(log.host.querySelector('[role="status"]')?.textContent).toBe('Following the lanterns…');
  });

  it('limits on-screen cards and pauses reading on hover', () => {
    vi.useFakeTimers();
    log = new Notifications();
    for (let i = 0; i < 4; i++) log.notify(`Update ${i}`);
    const cards = log.host.querySelectorAll('.notification-card');
    expect(cards).toHaveLength(3);
    cards[0].dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(6000);
    expect(log.host.querySelectorAll('.notification-card')).toHaveLength(1);
    cards[0].querySelector<HTMLButtonElement>('button')!.click();
    expect(log.host.querySelectorAll('.notification-card')).toHaveLength(0);
  });

  it('escapes messages and cleans up active notifications on destroy', () => {
    vi.useFakeTimers();
    log = new Notifications();
    for (let i = 0; i < 55; i++) log.notify(`Update ${i}`);
    log.notify('<img src=x onerror=alert(1)>', true);
    expect(log.host.querySelector('img')).toBeNull();
    expect(log.host.querySelector('.notification-card.bad p')?.textContent).toBe('<img src=x onerror=alert(1)>');
    const host = log.host;
    log.destroy(); log = undefined;
    expect(host.isConnected).toBe(false);
    vi.advanceTimersByTime(10000);
    expect(document.querySelector('.notifications')).toBeNull();
  });

  it('retains active notifications when a modal opens, replaces its content, and closes', async () => {
    log = new Notifications();
    log.notify('A clue remembered.');
    const modal = document.createElement('dialog');
    modal.id = 'account-dialog';
    document.body.append(modal);
    modal.showModal();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log.host.parentElement).toBe(modal);
    modal.innerHTML = '<p>Updated form</p>';
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log.host.parentElement).toBe(modal);
    expect(log.host.querySelector('.notifications-recent')?.textContent).toContain('A clue remembered.');
    modal.close();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log.host.parentElement).toBe(document.body);
    expect(log.host.querySelector('.notifications-recent')?.textContent).toContain('A clue remembered.');
  });
});

describe('validation notifications', () => {
  it('suppresses native bubbles and reports only the first invalid field per attempt', async () => {
    const notify = vi.fn();
    removeValidation = installFormNotifications(notify);
    document.body.innerHTML = '<form><label for="email">Email</label><input id="email" type="email" required><label for="password">Password</label><input id="password" type="password" required></form>';
    const form = document.querySelector('form')!;
    const invalid = vi.fn((event: Event) => expect(event.defaultPrevented).toBe(true));
    form.addEventListener('invalid', invalid, true);
    expect(form.checkValidity()).toBe(false);
    expect(invalid).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatch(/^Email:/);
    expect(document.activeElement?.id).toBe('email');
    await Promise.resolve();
    document.querySelector<HTMLInputElement>('#email')!.value = 'player@example.com';
    expect(form.checkValidity()).toBe(false);
    expect(notify.mock.calls[1][0]).toMatch(/^Password:/);
  });

  it('blocks whitespace-only replies and too-short names while valid submissions continue', async () => {
    const notify = vi.fn();
    removeValidation = installFormNotifications(notify);
    document.body.innerHTML = '<form><input required minlength="2" aria-label="Your German answer"><button>Say it</button></form>';
    const input = document.querySelector('input')!;
    const form = document.querySelector('form')!;
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener('submit', onSubmit);
    input.value = '  ';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(notify.mock.calls[0][0]).toBe('Your German answer: Please fill in this field.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    await Promise.resolve();
    input.value = 'A';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(notify.mock.calls[1][0]).toContain('Use at least 2 characters.');
    input.value = 'Hallo';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('reports custom validation messages without exposing field values', () => {
    const notify = vi.fn();
    removeValidation = installFormNotifications(notify);
    document.body.innerHTML = '<form><label for="confirm">Confirm password</label><input id="confirm" type="password"></form>';
    const input = document.querySelector('input')!;
    input.value = 'private-password';
    input.setCustomValidity('The passwords must match.');
    expect(input.checkValidity()).toBe(false);
    expect(notify).toHaveBeenCalledWith('Confirm password: The passwords must match.', true);
  });
});
