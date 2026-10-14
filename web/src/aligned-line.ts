import { baseLanguage, t, type BaseLanguage } from './i18n';
import { escapeHtml } from './icons';

/** Offsets are authored UTF-16 [start, end) spans in the original text. */
export type TokenSpan = readonly [number, number];
export interface AlignedText { text: string; tokens: readonly TokenSpan[]; }
export interface AlignedSupport extends AlignedText { align: readonly (readonly [number, number])[]; }
export interface AlignedLine {
  id: string;
  de: AlignedText;
  support: Partial<Record<BaseLanguage, AlignedSupport>>;
  /** German token index -> lexeme UUID. */
  glosses?: Readonly<Record<string, string>>;
}
export interface AlignedLineOptions {
  selectedToken?: number;
  showMeaning?: boolean;
  wordlight?: boolean;
  language?: BaseLanguage;
  /** Meanings fetched from the lexicon, keyed by lexeme UUID. */
  meanings?: Readonly<Record<string, string>>;
}
export interface HighlightSpan { start: number; end: number; }

function validSpans(value: AlignedText): boolean {
  let end = 0;
  return value.tokens.every(([start, next]) => {
    const valid = Number.isInteger(start) && Number.isInteger(next) && start >= end && next > start && next <= value.text.length;
    end = next;
    return valid;
  });
}

/** Never accept malformed offsets or infer a counterpart from a gloss. */
export function alignedHighlights(line: AlignedLine, selectedToken: number, language: BaseLanguage): HighlightSpan[] {
  const support = line.support[language];
  if (!support || !validSpans(line.de) || !validSpans(support)
    || !Number.isInteger(selectedToken) || selectedToken < 0 || selectedToken >= line.de.tokens.length) return [];
  const indices = new Set<number>();
  for (const [source, target] of support.align) {
    if (!Number.isInteger(source) || !Number.isInteger(target) || source < 0 || source >= line.de.tokens.length
      || target < 0 || target >= support.tokens.length) return [];
    if (source === selectedToken) indices.add(target);
  }
  return [...indices].sort((a, b) => a - b).map(index => {
    const [start, end] = support.tokens[index];
    return { start, end };
  });
}

export function alignedSupport(line: AlignedLine, language = baseLanguage()): { value?: AlignedSupport; lang: BaseLanguage } {
  return line.support[language] ? { value: line.support[language], lang: language } : { value: line.support.en, lang: 'en' };
}

export function renderAlignedGerman(line: AlignedLine, options: AlignedLineOptions = {}): string {
  if (!validSpans(line.de)) return escapeHtml(line.de.text);
  const { value } = alignedSupport(line, options.language);
  const aligned = new Set(value?.align.filter(([source, target]) => Number.isInteger(source) && source >= 0
    && source < line.de.tokens.length && Number.isInteger(target) && target >= 0 && target < value.tokens.length).map(([source]) => source));
  let cursor = 0;
  const result: string[] = [];
  line.de.tokens.forEach(([start, end], index) => {
    result.push(escapeHtml(line.de.text.slice(cursor, start)));
    const word = line.de.text.slice(start, end);
    const lexeme = line.glosses?.[index];
    const gloss = lexeme ? options.meanings?.[lexeme] ?? '' : '';
    const selected = options.selectedToken === index;
    result.push(lexeme || aligned.has(index)
      ? `<button type="button" class="dialogue-word${options.wordlight ? ' wordlight-lit' : ''}${selected ? ' is-selected' : ''}" data-dialogue-word-index="${index}" data-aligned-token="${index}"${lexeme ? ` data-lexeme-id="${escapeHtml(lexeme)}"` : ''} data-dialogue-gloss="${escapeHtml(gloss)}" aria-label="${escapeHtml(t('Meaning of {word}', { word }))}" aria-pressed="${selected}">${escapeHtml(word)}</button>`
      : escapeHtml(word));
    cursor = end;
  });
  result.push(escapeHtml(line.de.text.slice(cursor)));
  return result.join('');
}

export function renderAlignedMeaning(line: AlignedLine, options: AlignedLineOptions = {}): string {
  const { value, lang } = alignedSupport(line, options.language);
  if (!value) return '';
  const spans = options.selectedToken === undefined ? [] : alignedHighlights(line, options.selectedToken, lang);
  let cursor = 0;
  const result: string[] = [];
  for (const { start, end } of spans) {
    result.push(escapeHtml(value.text.slice(cursor, start)), `<mark>${escapeHtml(value.text.slice(start, end))}</mark>`);
    cursor = end;
  }
  result.push(escapeHtml(value.text.slice(cursor)));
  return result.join('');
}

/** Shared markup for narrative, evidence, examples, and encounters. */
export function renderAlignedLine(line: AlignedLine, options: AlignedLineOptions = {}): string {
  const { value, lang } = alignedSupport(line, options.language);
  const selected = options.selectedToken === undefined ? '' : ` data-selected-token="${options.selectedToken}"`;
  return `<span class="aligned-line translated-sentence" lang="de" tabindex="0" data-aligned-line="${escapeHtml(JSON.stringify(line))}" data-translation="${escapeHtml(value?.text ?? '')}" data-translation-lang="${lang}"${selected}><span class="aligned-line-german">${renderAlignedGerman(line, options)}</span>${options.showMeaning ? `<span class="aligned-line-meaning" lang="${lang}" role="status">${renderAlignedMeaning(line, options)}</span>` : ''}</span>`;
}

export function alignedLineFromElement(element: HTMLElement): AlignedLine | undefined {
  try {
    const line: unknown = JSON.parse(element.dataset.alignedLine ?? 'null');
    if (!line || typeof line !== 'object') return;
    const value = line as AlignedLine;
    if (typeof value.id !== 'string' || typeof value.de?.text !== 'string' || !Array.isArray(value.de.tokens)
      || !value.support || !validSpans(value.de)) return;
    return value;
  } catch { return; }
}

/** Update offsets after substituting an authored placeholder, without tokenizing the player's name. */
export function personalizeAlignedLine(line: AlignedLine, name: string): AlignedLine {
  function replace<T extends AlignedText>(value: T): T {
    const replacements = [...value.text.matchAll(/\{name\}/g)].map(match => match.index);
    if (!replacements.length) return value;
    const delta = name.length - '{name}'.length;
    const offset = (position: number) => position + replacements.filter(start => start + 6 <= position).length * delta;
    return { ...value, text: value.text.replaceAll('{name}', name), tokens: value.tokens.map(([start, end]) => {
      const placeholder = replacements.find(position => start >= position && end <= position + 6);
      return placeholder === undefined ? [offset(start), offset(end)] as const : [offset(placeholder), offset(placeholder) + name.length] as const;
    }) };
  }
  return { ...line, de: replace(line.de), support: Object.fromEntries(Object.entries(line.support).map(([language, value]) => [language, replace(value)])) };
}

/** Stable delegated interaction: dynamically rendered lines need no new listeners. */
export function installAlignedLineInteractions(root: HTMLElement | Document): () => void {
  function select(container: HTMLElement, token?: number): void {
    const line = alignedLineFromElement(container);
    if (!line) return;
    if (token === undefined) delete container.dataset.selectedToken;
    else container.dataset.selectedToken = String(token);
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-aligned-token]')) {
      const selected = Number(button.dataset.alignedToken) === token;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    const meaning = container.querySelector<HTMLElement>('.aligned-line-meaning');
    if (meaning) meaning.innerHTML = renderAlignedMeaning(line, { selectedToken: token });
    container.dispatchEvent(new CustomEvent('aligned-line-select', { bubbles: true, detail: { token } }));
  }
  function buttonFor(target: EventTarget | null): HTMLButtonElement | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLButtonElement>('[data-aligned-token]');
    return button && root.contains(button) && button.closest('.aligned-line') ? button : null;
  }
  function onSelect(event: Event): void {
    const button = buttonFor(event.target), container = button?.closest<HTMLElement>('.aligned-line');
    if (button && container) select(container, Number(button.dataset.alignedToken));
  }
  function onKey(event: Event): void {
    const key = (event as KeyboardEvent).key;
    const button = buttonFor(event.target), container = button?.closest<HTMLElement>('.aligned-line');
    if (!container || !button) return;
    if (key === 'Escape') { select(container); event.preventDefault(); event.stopPropagation(); return; }
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-aligned-token]')];
    const index = buttons.indexOf(button);
    const next = key === 'Home' ? 0 : key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (key === 'ArrowLeft' ? -1 : 1)));
    buttons[next]?.focus();
    event.preventDefault();
  }
  root.addEventListener('click', onSelect);
  root.addEventListener('focusin', onSelect);
  root.addEventListener('keydown', onKey);
  return () => {
    root.removeEventListener('click', onSelect);
    root.removeEventListener('focusin', onSelect);
    root.removeEventListener('keydown', onKey);
  };
}
