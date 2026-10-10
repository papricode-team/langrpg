import { escapeHtml as e, icon } from './icons';

type LogEntry = { id: number; message: string; bad: boolean; at: Date };

/** Session history with independent, non-blocking notifications. */
export class EventLog {
  readonly host = document.createElement('aside');
  private entries: LogEntry[] = [];
  private timers = new Map<number, number>();
  private nextId = 0;
  private expanded = false;
  private observer: MutationObserver;
  private usePopover: boolean;
  private toggle: HTMLButtonElement;
  private history: HTMLElement;
  private recent: HTMLElement;
  private announcement: HTMLElement;

  constructor() {
    this.host.className = 'event-log';
    this.host.setAttribute('aria-label', 'Notifications and event log');
    this.host.innerHTML = `<button type="button" class="event-log-toggle" aria-label="Open event log" aria-expanded="false" aria-controls="event-log-history">${icon('scroll')}<span class="event-log-count" hidden>0</span></button><section id="event-log-history" class="event-log-history" aria-label="Event log" hidden><header><strong>Event log</strong><button type="button" data-log-clear>Clear</button></header><ol></ol><p class="event-log-empty">Your adventure’s updates will appear here.</p></section><div class="event-log-recent"></div><div class="event-log-announcement" role="status" aria-live="polite" aria-atomic="true"></div>`;
    this.toggle = this.host.querySelector<HTMLButtonElement>('.event-log-toggle')!;
    this.history = this.host.querySelector<HTMLElement>('.event-log-history')!;
    this.recent = this.host.querySelector<HTMLElement>('.event-log-recent')!;
    this.announcement = this.host.querySelector<HTMLElement>('.event-log-announcement')!;
    this.usePopover = typeof this.host.showPopover === 'function';
    if (this.usePopover) this.host.setAttribute('popover', 'manual');
    this.toggle.addEventListener('click', () => this.setExpanded(!this.expanded));
    this.host.querySelector('[data-log-clear]')!.addEventListener('click', () => {
      this.entries = [];
      for (const id of this.timers.keys()) this.dismiss(id);
      this.renderHistory();
      this.announcement.textContent = 'Event log cleared.';
    });
    this.host.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.expanded) {
        event.preventDefault();
        this.setExpanded(false);
        this.toggle.focus();
      }
      event.stopPropagation();
    });
    // Retain history and interactive controls across modal content replacements.
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
    const entry = { id: ++this.nextId, message, bad, at: new Date() };
    this.entries.unshift(entry);
    this.entries.length = Math.min(this.entries.length, 50);
    this.renderHistory();
    this.announcement.textContent = message;
    const card = document.createElement('article');
    card.className = `event-log-notification${bad ? ' bad' : ''}`;
    card.dataset.logId = String(entry.id);
    card.innerHTML = `${icon(bad ? 'clue' : 'check')}<div><small>${bad ? 'Needs attention' : 'Adventure update'} · ${this.time(entry)}</small><p>${e(message)}</p></div><button type="button" aria-label="Dismiss notification">${icon('close')}</button>`;
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
    while (this.recent.children.length > 3) this.dismiss(Number((this.recent.lastElementChild as HTMLElement).dataset.logId));
    this.syncHost();
  }

  private time(entry: LogEntry) {
    return entry.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private renderHistory() {
    this.history.querySelector('ol')!.innerHTML = this.entries.map(entry => `<li class="${entry.bad ? 'bad' : ''}"><time datetime="${entry.at.toISOString()}">${this.time(entry)}</time><span>${e(entry.message)}</span></li>`).join('');
    this.history.querySelector<HTMLElement>('.event-log-empty')!.hidden = this.entries.length > 0;
    const count = this.host.querySelector<HTMLElement>('.event-log-count')!;
    count.textContent = String(this.entries.length);
    count.hidden = this.entries.length === 0;
  }

  private setExpanded(expanded: boolean) {
    this.expanded = expanded;
    this.history.hidden = !expanded;
    this.recent.hidden = expanded;
    this.toggle.setAttribute('aria-expanded', String(expanded));
    this.toggle.setAttribute('aria-label', expanded ? 'Close event log' : 'Open event log');
  }

  private dismiss(id: number) {
    window.clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.recent.querySelector(`[data-log-id="${id}"]`)?.remove();
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
    const label = input.labels?.[0]?.textContent?.trim() || input.getAttribute('aria-label') || input.getAttribute('placeholder') || 'This field';
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
    report(input, input.value.trim() ? `Use at least ${input.minLength} characters.` : 'Please fill in this field.');
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
