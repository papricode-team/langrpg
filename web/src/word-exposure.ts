import type { Api, ExposureInput, Progress } from './api';

/** What exposure reporting needs from the page; main.ts provides it. */
export interface WordExposureHost {
  api: Api;
  /** Development UI previews and offline play report nothing. */
  enabled(): boolean;
  progress(): Progress;
  onProgress(progress: Progress): void;
}

/**
 * Tells the server which contexts and words the learner has seen: each context once per owner, and word cards
 * as they scroll into view, in small batches. Moved out of main.ts unchanged in behaviour.
 */
export class WordExposure {
  private readonly exposed = new Set<string>();
  private readonly pendingWords = new Set<string>();
  private observer: IntersectionObserver | undefined;
  private timer: number | undefined;

  constructor(private readonly host: WordExposureHost) {}

  record(input: ExposureInput) {
    if (!this.host.enabled()) return;
    const key = JSON.stringify(input);
    if (this.exposed.has(key)) return;
    this.exposed.add(key);
    void this.host.api.expose(input).then(result => this.host.onProgress(result.progress))
      .catch(() => this.exposed.delete(key));
  }

  /** A different player owns the progress now. */
  reset() { this.exposed.clear(); }

  /** Watch the word cards in the open menu page. */
  observe() {
    this.observer?.disconnect();
    const root = document.querySelector<HTMLElement>('#other-view');
    if (!root) return;
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).dataset.lexeme;
        if (id && !this.host.progress().words[id]) this.pendingWords.add(id);
        this.observer?.unobserve(entry.target);
      }
      if (this.pendingWords.size && this.timer === undefined) this.timer = window.setTimeout(() => this.flush(), 350);
    }, {root, threshold:0.3});
    root.querySelectorAll('[data-lexeme]').forEach(card => this.observer!.observe(card));
  }

  disconnect() { this.observer?.disconnect(); }

  destroy() {
    this.observer?.disconnect();
    if (this.timer !== undefined) clearTimeout(this.timer);
  }

  private flush() {
    this.timer = undefined;
    const wordIds = [...this.pendingWords].slice(0, 36);
    wordIds.forEach(id => this.pendingWords.delete(id));
    if (wordIds.length) this.record({wordIds});
    if (this.pendingWords.size) this.timer = window.setTimeout(() => this.flush(), 300);
  }
}
