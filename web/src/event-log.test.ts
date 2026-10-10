// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventLog, installFormNotifications } from './event-log';

let log: EventLog | undefined;
let removeValidation: (() => void) | undefined;
afterEach(() => {
  removeValidation?.(); removeValidation = undefined;
  log?.destroy(); log = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('event notifications', () => {
  it('expires overlapping notifications independently and retains both in history', () => {
    vi.useFakeTimers();
    log = new EventLog();
    log.notify('Evidence saved. Return to Emil.');
    vi.advanceTimersByTime(3000);
    log.notify('Following the lanterns…');
    vi.advanceTimersByTime(2500);
    const recent = log.host.querySelector('.event-log-recent')!;
    expect(recent.textContent).not.toContain('Evidence saved');
    expect(recent.textContent).toContain('Following the lanterns');
    vi.advanceTimersByTime(3000);
    expect(recent.children).toHaveLength(0);
    log.host.querySelector<HTMLButtonElement>('.event-log-toggle')!.click();
    const history = log.host.querySelector<HTMLElement>('.event-log-history')!;
    expect(history.hidden).toBe(false);
    expect([...history.querySelectorAll('li span')].map(item => item.textContent)).toEqual(['Following the lanterns…', 'Evidence saved. Return to Emil.']);
    expect(history.querySelectorAll('time[datetime]')).toHaveLength(2);
  });

  it('limits on-screen cards, pauses reading on hover, and keeps dismissed events reviewable', () => {
    vi.useFakeTimers();
    log = new EventLog();
    for (let i = 0; i < 4; i++) log.notify(`Update ${i}`);
    const cards = log.host.querySelectorAll('.event-log-notification');
    expect(cards).toHaveLength(3);
    cards[0].dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(6000);
    expect(log.host.querySelectorAll('.event-log-notification')).toHaveLength(1);
    cards[0].querySelector<HTMLButtonElement>('button')!.click();
    expect(log.host.querySelectorAll('.event-log-notification')).toHaveLength(0);
    expect(log.host.querySelectorAll('.event-log-history li')).toHaveLength(4);
  });

  it('escapes messages, caps session history, and clears active notifications with the log', () => {
    log = new EventLog();
    for (let i = 0; i < 55; i++) log.notify(`Update ${i}`);
    log.notify('<img src=x onerror=alert(1)>', true);
    expect(log.host.querySelector('img')).toBeNull();
    expect(log.host.querySelector('.event-log-notification.bad p')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(log.host.querySelectorAll('.event-log-history li')).toHaveLength(50);
    log.host.querySelector<HTMLButtonElement>('[data-log-clear]')!.click();
    expect(log.host.querySelectorAll('.event-log-history li, .event-log-notification')).toHaveLength(0);
    expect(log.host.querySelector<HTMLElement>('.event-log-empty')!.hidden).toBe(false);
  });

  it('retains history and controls when a modal opens, replaces its content, and closes', async () => {
    log = new EventLog();
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
    expect(log.host.querySelector('.event-log-history')?.textContent).toContain('A clue remembered.');
    modal.close();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log.host.parentElement).toBe(document.body);
    log.host.querySelector<HTMLButtonElement>('.event-log-toggle')!.click();
    expect(log.host.querySelector<HTMLElement>('.event-log-history')!.hidden).toBe(false);
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
