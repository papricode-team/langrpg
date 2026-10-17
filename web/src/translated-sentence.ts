import { baseLanguage, supportText, t, targetLanguage } from './i18n.ts';
import { escapeHtml as e } from './icons.ts';

export interface TextRange { start: number; end: number; }
export interface WordSelector { text: string; occurrence: number; }
export interface SentenceAlignment {
  source: WordSelector;
  targets: WordSelector[];
  sourceRange: TextRange;
  targetRanges: TextRange[];
}
export interface SentenceWord {
  source: WordSelector;
  range: TextRange;
  lexemeId?: string;
  glosses: Record<string, string | undefined>;
}
export interface AuthoredSentence {
  id?: string;
  audioRequires?: boolean;
  text: string;
  target: string;
  translations: Record<string, { text: string; words: SentenceAlignment[] } | undefined>;
  words: SentenceWord[];
}
export interface SentenceReference { id?: string; sentenceId?: string; german?: string; english?: string; text?: string; localized?: boolean; }
export interface SentencePresentation {
  sentence?: AuthoredSentence;
  text: string;
  target: string;
  translation: string;
  supportLanguage: string;
}

const sentences = new Map<string, AuthoredSentence>();
const sentenceText = new Map<string, AuthoredSentence>();

/** Only content returned by the server enters this compatibility registry. */
export function registerSentence(record: { id: string; body: AuthoredSentence } | AuthoredSentence): void {
  const sentence = 'body' in record ? { ...record.body, id: record.id } : record;
  if (sentence.id) sentences.set(sentence.id, sentence);
  sentenceText.set(sentence.text, sentence);
}
export function clearSentences(): void { sentences.clear(); sentenceText.clear(); }
export function getSentence(id: string): AuthoredSentence | undefined { return sentences.get(id); }
export function findSentence(text: string): AuthoredSentence | undefined { return sentenceText.get(text); }

/** Apply template edits to offsets, never search the personalized strings for words. */
export function personalizeSentence(sentence: AuthoredSentence, values: Readonly<Record<string, string>>): AuthoredSentence {
  function transform(text: string) {
    const edits: { start: number; end: number; value: string }[] = [];
    const rendered = text.replace(/\{([^{}]+)\}/g, (match, key: string, start: number) => {
      if (values[key] === undefined) return match;
      const value = values[key]; edits.push({ start, end: start + match.length, value }); return value;
    });
    function offset(position: number, end: boolean): number {
      let difference = 0;
      for (const edit of edits) {
        if (position <= edit.start) break;
        if (position < edit.end) return edit.start + difference + (end ? edit.value.length : 0);
        difference += edit.value.length - (edit.end - edit.start);
      }
      return position + difference;
    }
    return { text: rendered, range: (range: TextRange): TextRange => ({ start: offset(range.start, false), end: offset(range.end, true) }) };
  }
  const source = transform(sentence.text);
  return {
    ...sentence, text: source.text,
    words: sentence.words.map(word => ({ ...word, range: source.range(word.range) })),
    translations: Object.fromEntries(Object.entries(sentence.translations).map(([language, translation]) => {
      if (!translation) return [language, translation];
      const target = transform(translation.text);
      return [language, { ...translation, text: target.text, words: translation.words.map(word => ({ ...word, sourceRange: source.range(word.sourceRange), targetRanges: word.targetRanges.map(target.range) })) }];
    })),
  };
}

export function presentSentence(reference: SentenceReference | AuthoredSentence, name = '', language: string = baseLanguage()): SentencePresentation {
  const referenceText = 'german' in reference ? reference.text ?? reference.german : reference.text;
  const byId = getSentence(('sentenceId' in reference ? reference.sentenceId : undefined) ?? reference.id ?? '');
  const authored = 'translations' in reference && 'words' in reference ? reference :
    (byId && (!referenceText || byId.text === referenceText) ? byId : undefined) ?? findSentence(referenceText ?? '');
  if (authored) {
    const sentence = name ? personalizeSentence(authored, { name }) : authored;
    return { sentence, text: sentence.text, target: sentence.target, translation: sentence.translations[language]?.text ?? '', supportLanguage: language };
  }
  const legacy = reference as SentenceReference;
  const support = supportText({ german: legacy.german ?? legacy.text ?? '', english: legacy.english ?? '', localized: legacy.localized });
  return { text: (legacy.text ?? legacy.german ?? '').replaceAll('{name}', name), target: targetLanguage(), translation: support.text.replaceAll('{name}', name), supportLanguage: support.lang };
}

function validRange(text: string, range: TextRange): boolean {
  return !!range && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= text.length;
}

/** Mark only supplied UTF-16 ranges; missing authoring never creates a guess. */
export function markTranslation(text: string, ranges: readonly TextRange[] = []): string {
  const ordered = ranges.filter(range => validRange(text, range)).map(range => ({ ...range })).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TextRange[] = [];
  for (const range of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && range.start < previous.end) previous.end = Math.max(previous.end, range.end);
    else if (!previous || previous.start !== range.start || previous.end !== range.end) merged.push(range);
  }
  let cursor = 0, result = '';
  for (const range of merged) { result += `${e(text.slice(cursor, range.start))}<mark>${e(text.slice(range.start, range.end))}</mark>`; cursor = range.end; }
  return result + e(text.slice(cursor));
}

export function wordTargetRanges(presentation: SentencePresentation, index: number): TextRange[] {
  const sentence = presentation.sentence, word = sentence?.words[index];
  if (!sentence || !word) return [];
  const mapping = sentence.translations[presentation.supportLanguage]?.words.find(alignment =>
    alignment.sourceRange.start === word.range.start && alignment.sourceRange.end === word.range.end);
  return mapping?.targetRanges ?? [];
}

export function sourceSentenceMarkup(presentation: SentencePresentation, options: { selectedIndex?: number; dialogue?: boolean } = {}): string {
  const { text, sentence } = presentation;
  if (!sentence) return e(text);
  let cursor = 0, result = '';
  const words = sentence.words.map((word, index) => ({ word, index })).sort((a, b) => a.word.range.start - b.word.range.start);
  for (const { word, index } of words) {
    if (!validRange(text, word.range) || word.range.start < cursor) continue;
    const gloss = word.glosses[presentation.supportLanguage] ?? '', selected = options.selectedIndex === index;
    const token = text.slice(word.range.start, word.range.end), prefix = options.dialogue ? 'dialogue' : 'sentence';
    result += e(text.slice(cursor, word.range.start));
    result += `<button type="button" class="${prefix}-word ${selected ? 'is-selected' : ''}" data-${prefix}-gloss="${e(gloss)}" data-${prefix}-word-index="${index}" data-sentence-ranges="${e(JSON.stringify(wordTargetRanges(presentation, index)))}" aria-label="${e(t('Meaning of {word}', { word: token }))}" aria-pressed="${selected}">${e(token)}</button>`;
    cursor = word.range.end;
  }
  return result + e(text.slice(cursor));
}

export function renderTranslatedSentence(reference: SentenceReference | AuthoredSentence, name = '', showTranslation = false): string {
  const presentation = presentSentence(reference, name);
  const id = presentation.sentence?.id ? ` data-sentence-id="${e(presentation.sentence.id)}"` : '';
  const translation = showTranslation && presentation.translation ? `<span class="sentence-inline-translation" data-sentence-inline-translation lang="${e(presentation.supportLanguage)}">${e(presentation.translation)}</span>` : '';
  return `<span class="translated-sentence" lang="${e(presentation.target)}" tabindex="0"${id} data-translation="${e(presentation.translation)}" data-translation-lang="${e(presentation.supportLanguage)}">${sourceSentenceMarkup(presentation)}${translation}</span>`;
}
