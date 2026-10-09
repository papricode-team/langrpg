// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installSentenceTranslations, renderNarrative } from './sentence-translations';

describe('German narrative sentence translations', () => {
  let root: HTMLElement;
  let stop: () => void;

  const narrative = [
    { german: 'Dein Zug kommt an.', english: 'Your train arrives.' },
    { german: 'Otto wartet auf dich.', english: 'Otto is waiting for you.' },
  ];
  const sentences = () => [...root.querySelectorAll<HTMLElement>('.translated-sentence')];
  const tooltip = () => document.querySelector<HTMLElement>('[role="tooltip"]');
  const hover = (sentence: HTMLElement, relatedTarget: EventTarget | null = null) => sentence.dispatchEvent(new PointerEvent('pointerover', {
    bubbles: true, pointerType: 'mouse', relatedTarget, clientX: 80, clientY: 100,
  }));
  const leave = (sentence: HTMLElement, relatedTarget: EventTarget | null = null) => sentence.dispatchEvent(new PointerEvent('pointerout', {
    bubbles: true, pointerType: 'mouse', relatedTarget,
  }));

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('main');
    root.innerHTML = `<p>${renderNarrative(narrative)}</p>`;
    document.body.append(root);
    stop = installSentenceTranslations(root);
  });

  afterEach(() => {
    stop();
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders German only, escapes both languages, and gives every sentence keyboard access', () => {
    root.innerHTML = renderNarrative([{ german: '„<Zug> & "Otto"“', english: 'It\'s a "train" <tag> & more.' }]);
    const sentence = sentences()[0];
    expect(root.textContent).toBe('„<Zug> & "Otto"“');
    expect(sentence.dataset.translation).toBe('It\'s a "train" <tag> & more.');
    expect(sentence.lang).toBe('de');
    expect(sentence.tabIndex).toBe(0);
    expect(sentence.hasAttribute('title')).toBe(false);
    expect(root.querySelector('zug, tag')).toBeNull();
    expect(renderNarrative([])).toBe('');
  });

  it('shows the English sentence only after a full second of continuous hover', () => {
    const sentence = sentences()[0];
    hover(sentence);
    vi.advanceTimersByTime(999);
    expect(tooltip()).toBeNull();
    expect(sentence.hasAttribute('aria-describedby')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(tooltip()?.textContent).toBe(narrative[0].english);
    expect(tooltip()?.lang).toBe('en');
    expect(tooltip()?.hidden).toBe(false);
    expect(sentence.getAttribute('aria-describedby')).toBe(tooltip()?.id);
  });

  it('cancels a short hover and starts the full delay again on re-entry', () => {
    const sentence = sentences()[0];
    hover(sentence);
    vi.advanceTimersByTime(700);
    leave(sentence);
    vi.advanceTimersByTime(1_000);
    expect(tooltip()).toBeNull();
    hover(sentence);
    vi.advanceTimersByTime(999);
    expect(tooltip()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(tooltip()?.textContent).toBe(narrative[0].english);
  });

  it('starts a new delay when moving to another sentence and reuses one tooltip', () => {
    const [first, second] = sentences();
    hover(first);
    vi.advanceTimersByTime(1_000);
    const shared = tooltip();
    leave(first, second);
    hover(second, first);
    expect(tooltip()).toBeNull();
    expect(first.hasAttribute('aria-describedby')).toBe(false);
    vi.advanceTimersByTime(999);
    expect(tooltip()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(tooltip()).toBe(shared);
    expect(tooltip()?.textContent).toBe(narrative[1].english);
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
  });

  it('does not restart or dismiss when a pointer crosses children of the same sentence', () => {
    const sentence = sentences()[0];
    const child = document.createElement('b');
    child.textContent = 'Zug';
    sentence.append(child);
    hover(sentence);
    vi.advanceTimersByTime(600);
    leave(sentence, child);
    hover(child, sentence);
    vi.advanceTimersByTime(400);
    expect(tooltip()?.textContent).toBe(narrative[0].english);
  });

  it('supports delayed keyboard focus and hides on focusout or Escape', () => {
    const [first, second] = sentences();
    first.focus();
    vi.advanceTimersByTime(999);
    expect(tooltip()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(tooltip()?.textContent).toBe(narrative[0].english);
    second.focus();
    expect(tooltip()).toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(tooltip()?.textContent).toBe(narrative[1].english);
    second.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(tooltip()).toBeNull();
    expect(second.hasAttribute('aria-describedby')).toBe(false);
  });

  it('retains keyboard ownership when the pointer leaves a focused sentence', () => {
    const sentence = sentences()[0];
    sentence.focus();
    hover(sentence);
    vi.advanceTimersByTime(600);
    leave(sentence);
    vi.advanceTimersByTime(400);
    expect(tooltip()?.textContent).toBe(narrative[0].english);
    hover(sentence);
    leave(sentence);
    vi.advanceTimersByTime(1_000);
    expect(tooltip()?.textContent).toBe(narrative[0].english);
    sentence.blur();
    expect(tooltip()).toBeNull();
  });

  it('retains pointer ownership when keyboard focus leaves the hovered sentence', () => {
    const sentence = sentences()[0];
    hover(sentence);
    sentence.focus();
    vi.advanceTimersByTime(600);
    sentence.blur();
    vi.advanceTimersByTime(400);
    expect(tooltip()?.textContent).toBe(narrative[0].english);
    sentence.focus();
    sentence.blur();
    expect(tooltip()?.textContent).toBe(narrative[0].english);
    leave(sentence);
    vi.advanceTimersByTime(1_000);
    expect(tooltip()).toBeNull();
  });

  it('allows crossing the gap into the English tooltip and scrolling its text', () => {
    const sentence = sentences()[0];
    hover(sentence);
    vi.advanceTimersByTime(1_000);
    const shown = tooltip()!;
    leave(sentence);
    vi.advanceTimersByTime(100);
    expect(tooltip()).toBe(shown);
    hover(shown);
    vi.advanceTimersByTime(2_000);
    shown.scrollTop = 120;
    shown.dispatchEvent(new Event('scroll', { bubbles: true }));
    expect(tooltip()).toBe(shown);
    expect(shown.scrollTop).toBe(120);
    leave(shown);
    vi.advanceTimersByTime(1_000);
    expect(tooltip()).toBeNull();
    expect(sentence.hasAttribute('aria-describedby')).toBe(false);
  });

  it('keeps English text available while dragging a selection beyond the tooltip', () => {
    const sentence = sentences()[0];
    hover(sentence);
    vi.advanceTimersByTime(1_000);
    const shown = tooltip()!;
    leave(sentence, shown);
    hover(shown, sentence);
    shown.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    leave(shown);
    vi.advanceTimersByTime(1_000);
    expect(tooltip()).toBe(shown);
    document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
    vi.advanceTimersByTime(1_000);
    expect(tooltip()).toBeNull();
  });

  it('requires another full second when crossing from a tooltip to a different sentence', () => {
    const [first, second] = sentences();
    hover(first);
    vi.advanceTimersByTime(1_000);
    const shown = tooltip()!;
    leave(first, shown);
    hover(shown, first);
    leave(shown, second);
    hover(second, shown);
    expect(tooltip()).toBeNull();
    vi.advanceTimersByTime(999);
    expect(tooltip()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(tooltip()?.textContent).toBe(narrative[1].english);
  });

  it('keeps a newly focused sentence pending when leaving a different hovered sentence', () => {
    const [first, second] = sentences();
    hover(first);
    vi.advanceTimersByTime(1_000);
    second.focus();
    leave(first);
    vi.advanceTimersByTime(999);
    expect(tooltip()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(tooltip()?.textContent).toBe(narrative[1].english);
  });

  it('clears both hover and focus ownership on Escape without immediately showing again', () => {
    const sentence = sentences()[0];
    hover(sentence);
    sentence.focus();
    vi.advanceTimersByTime(1_000);
    sentence.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    sentence.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    vi.advanceTimersByTime(2_000);
    expect(tooltip()).toBeNull();
    expect(sentence.hasAttribute('aria-describedby')).toBe(false);
    leave(sentence);
    hover(sentence);
    vi.advanceTimersByTime(999);
    expect(tooltip()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(tooltip()?.textContent).toBe(narrative[0].english);
  });

  it('consumes Escape only while a tooltip is visible, so a second Escape can close its encounter', () => {
    const sentence = sentences()[0];
    hover(sentence);
    vi.advanceTimersByTime(1_000);
    const firstEscape = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' });
    sentence.dispatchEvent(firstEscape);
    expect(firstEscape.defaultPrevented).toBe(true);
    expect(tooltip()).toBeNull();
    const nextEscape = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' });
    sentence.dispatchEvent(nextEscape);
    expect(nextEscape.defaultPrevented).toBe(false);
  });

  it('toggles translation on a touch tap, with no hover timer', () => {
    const sentence = sentences()[0];
    sentence.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' }));
    vi.advanceTimersByTime(1_000);
    expect(tooltip()).toBeNull();
    sentence.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    expect(tooltip()?.textContent).toBe(narrative[0].english);
    sentence.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    expect(tooltip()).toBeNull();
  });

  it('keeps the tooltip in an active dialog and hides it when the dialog closes', async () => {
    root.innerHTML = `<dialog open><p>${renderNarrative(narrative)}</p></dialog>`;
    const dialog = root.querySelector('dialog')!;
    const sentence = sentences()[0];
    hover(sentence);
    vi.advanceTimersByTime(1_000);
    expect(tooltip()?.parentElement).toBe(dialog);
    dialog.removeAttribute('open');
    await vi.advanceTimersByTimeAsync(0);
    expect(tooltip()).toBeNull();
    expect(sentence.hasAttribute('aria-describedby')).toBe(false);
  });

  it('cancels translation when a dynamic encounter replaces the pending sentence', async () => {
    hover(sentences()[0]);
    vi.advanceTimersByTime(500);
    root.innerHTML = `<p>${renderNarrative([narrative[1]])}</p>`;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(tooltip()).toBeNull();
    hover(sentences()[0]);
    vi.advanceTimersByTime(1_000);
    expect(tooltip()?.textContent).toBe(narrative[1].english);
  });

  it('removes a visible dialog translation when its encounter HTML is replaced', async () => {
    root.innerHTML = `<dialog open><p>${renderNarrative(narrative)}</p></dialog>`;
    const dialog = root.querySelector('dialog')!;
    const oldSentence = sentences()[0];
    hover(oldSentence);
    vi.advanceTimersByTime(1_000);
    expect(tooltip()?.parentElement).toBe(dialog);
    dialog.innerHTML = `<p>${renderNarrative([narrative[1]])}</p>`;
    await vi.advanceTimersByTimeAsync(0);
    expect(tooltip()).toBeNull();
    expect(oldSentence.hasAttribute('aria-describedby')).toBe(false);
    hover(sentences()[0]);
    vi.advanceTimersByTime(1_000);
    expect(tooltip()?.textContent).toBe(narrative[1].english);
  });

  it('removes a visible tooltip and its description when the installed root is detached', async () => {
    const sentence = sentences()[0];
    hover(sentence);
    vi.advanceTimersByTime(1_000);
    root.remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(tooltip()).toBeNull();
    expect(sentence.hasAttribute('aria-describedby')).toBe(false);
  });

  it('preserves other descriptions and removes timers and listeners on cleanup', () => {
    const sentence = sentences()[0];
    sentence.setAttribute('aria-describedby', 'existing-help');
    hover(sentence);
    vi.advanceTimersByTime(1_000);
    expect(sentence.getAttribute('aria-describedby')).toBe(`existing-help ${tooltip()!.id}`);
    stop();
    expect(sentence.getAttribute('aria-describedby')).toBe('existing-help');
    hover(sentence);
    vi.advanceTimersByTime(1_000);
    expect(tooltip()).toBeNull();
    stop();
  });

  it('clamps placement to the viewport and flips above a sentence near the bottom', () => {
    const sentence = sentences()[0];
    vi.spyOn(sentence, 'getBoundingClientRect').mockReturnValue({
      left: window.innerWidth - 20, right: window.innerWidth, top: window.innerHeight - 30,
      bottom: window.innerHeight - 10, width: 20, height: 20,
      x: window.innerWidth - 20, y: window.innerHeight - 30, toJSON: () => ({}),
    });
    hover(sentence);
    vi.advanceTimersByTime(1_000);
    const shown = tooltip()!;
    vi.spyOn(shown, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 300, top: 0, bottom: 60, width: 300, height: 60,
      x: 0, y: 0, toJSON: () => ({}),
    });
    window.dispatchEvent(new Event('resize'));
    expect(Number.parseFloat(shown.style.left)).toBeLessThanOrEqual(window.innerWidth - 312);
    expect(Number.parseFloat(shown.style.top)).toBe(window.innerHeight - 98);
  });
});
