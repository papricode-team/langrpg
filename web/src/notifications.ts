import { escapeHtml as e, icon } from './icons';
import { t } from './i18n';

type NotificationEntry = { id: number; message: string; bad: boolean; };

/** Independent, temporary notifications that remain available over modal dialogs. */
export class Notifications {
  readonly host = document.createElement('aside');
  private timers = new Map<number, number>();
  private nextId = 0;
  private observer: MutationObserver;
  private usePopover: boolean;
  private recent: HTMLElement;
  private announcement: HTMLElement;

  constructor() {
    this.host.className = 'notifications';
    this.host.setAttribute('aria-label', t('Notifications'));
    this.host.innerHTML = `<div class="notifications-recent"></div><div class="notifications-announcement" role="status" aria-live="polite" aria-atomic="true"></div>`;
    this.recent = this.host.querySelector<HTMLElement>('.notifications-recent')!;
    this.announcement = this.host.querySelector<HTMLElement>('.notifications-announcement')!;
    this.usePopover = typeof this.host.showPopover === 'function';
    if (this.usePopover) this.host.setAttribute('popover', 'manual');
    this.host.addEventListener('keydown', event => event.stopPropagation());
    // Retain active notifications across modal content replacements.
    this.observer = new MutationObserver(() => this.syncHost());
    this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'hidden'] });
    this.syncHost();
  }

  private syncHost() {
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(dialog => !dialog.hidden);
    const modal = dialogs.find(dialog => dialog.id === 'account-dialog') ?? dialogs.find(dialog => dialog.id === 'dialog') ?? dialogs.at(-1);
    const parent = modal ?? document.body;
    if (this.host.parentElement !== parent) parent.append(this.host);
    if (this.usePopover && !this.host.matches(':popover-open')) {
      try { this.host.showPopover(); }
      catch { this.usePopover = false; this.host.removeAttribute('popover'); }
    }
  }

  notify(message: string, bad = false) {
    const entry = { id: ++this.nextId, message, bad };
    this.announcement.textContent = message;
    const card = document.createElement('article');
    card.className = `notification-card${bad ? ' bad' : ''}`;
    card.dataset.notificationId = String(entry.id);
    card.innerHTML = `${icon(bad ? 'clue' : 'check')}<div><p>${e(message)}</p></div><button type="button" aria-label="${e(t('Dismiss notification'))}">${icon('close')}</button>`;
    card.querySelector('button')!.addEventListener('click', () => this.dismiss(entry.id));
    const pause = () => window.clearTimeout(this.timers.get(entry.id));
    const resume = () => {
      pause();
      this.timers.set(entry.id, window.setTimeout(() => this.dismiss(entry.id), bad ? 8000 : 5500));
    };
    card.addEventListener('mouseenter', pause);
    card.addEventListener('mouseleave', resume);
    card.addEventListener('focusin', pause);
    card.addEventListener('focusout', resume);
    this.recent.prepend(card);
    resume();
    while (this.recent.children.length > 3) this.dismiss(Number((this.recent.lastElementChild as HTMLElement).dataset.notificationId));
    this.syncHost();
  }

  private dismiss(id: number) {
    window.clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.recent.querySelector(`[data-notification-id="${id}"]`)?.remove();
  }

  destroy() {
    this.observer.disconnect();
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.host.remove();
  }
}

/** Suppress native validation bubbles while retaining native submit blocking. */
export function installFormNotifications(notify: (message: string, bad: boolean) => void) {
  let reporting = false;
  const report = (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, message: string) => {
    input.setAttribute('aria-invalid', 'true');
    if (reporting) return;
    reporting = true;
    queueMicrotask(() => { reporting = false; });
    const label = input.labels?.[0]?.textContent?.trim() || input.getAttribute('aria-label') || input.getAttribute('placeholder') || t('This field');
    notify(`${label}: ${message}`, true);
    input.focus();
  };
  const invalid = (event: Event) => {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    report(input, input.validationMessage);
  };
  const submit = (event: Event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    // Native required validation accepts whitespace; player replies should not.
    const input = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[required], textarea[required]')].find(input => !input.disabled && (input.value.trim().length === 0 || (input.minLength > 0 && input.value.length < input.minLength)));
    if (!input) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    report(input, input.value.trim() ? t('Use at least {count} characters.', { count: input.minLength }) : t('Please fill in this field.'));
  };
  const input = (event: Event) => {
    if (event.target instanceof HTMLElement) event.target.removeAttribute('aria-invalid');
  };
  document.addEventListener('invalid', invalid, true);
  document.addEventListener('submit', submit, true);
  document.addEventListener('input', input);
  return () => {
    document.removeEventListener('invalid', invalid, true);
    document.removeEventListener('submit', submit, true);
    document.removeEventListener('input', input);
  };
}
