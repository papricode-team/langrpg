/**
 * The support-language layer. German is always the target language; the base
 * language only chooses the meanings, hints and interface text around it.
 *
 * English data files stay canonical. Turkish is an overlay (web/src/data/i18n)
 * loaded as its own chunk, so English players never download it. Every lookup
 * falls back to the English source and records the miss; nothing throws.
 * See docs/turkish-route.md.
 */
import { generatedLexicalExerciseText, generatedLexicalOption, translatedLexemeForm } from './i18n-lexical.ts';

export type BaseLanguage = 'en' | 'tr' | 'de';
export const baseLanguages: readonly BaseLanguage[] = ['en', 'tr', 'de'];
export const baseLanguageNames: Record<BaseLanguage, string> = { en: 'English', tr: 'Türkçe', de: 'Deutsch' };

/** A story unit: the source it translates (German sentence or English text) and its Turkish. */
export interface OverlayEntry { de?: string; en?: string; tr: string; }
export interface CourseOverlay {
  lexicon: Record<string, { en: string; tr: string }>;
  grammar: Record<string, { title: [string, string]; explanation: [string, string]; examples: Record<string, string>; note?: string }>;
  exercises: Record<string, { german: string; source: ExerciseText; tr: ExerciseText; options?: Record<string, string> }>;
  texts?: Record<string, string>;
}
export interface ExerciseText { prompt: string; hint: string; explanation: string; english: string; }
export interface LanguageOverlay {
  story: Record<string, OverlayEntry>;
  ui: Record<string, string>;
  course: CourseOverlay;
}

const storageKey = 'atlas.baseLanguage';
let current: BaseLanguage = 'en';
let target = 'de';
let germanUi: Record<string, string> = {};
const servedTexts = new Map<string, string>();
export function targetLanguage(): string { return target; }
export function setTargetLanguage(language: string): void { target = language; servedTexts.clear(); }
/** Register only support text delivered for the current account and course. */
export function installContentTranslations(entries: Iterable<readonly [string, string]>): void {
  for (const [source, translated] of entries) servedTexts.set(source, translated);
}
let overlay: LanguageOverlay | undefined;
let sentences = new Map<string, string>();
let texts = new Map<string, string>();
let exerciseMeanings = new Map<string, string>();
let lexemeMeanings = new Map<string, string>();
let loading: Promise<LanguageOverlay> | undefined;
const missing = new Map<string, number>();
const listeners = new Set<(language: BaseLanguage) => void>();

export function isBaseLanguage(value: unknown): value is BaseLanguage {
  return value === 'en' || value === 'tr' || value === 'de';
}

export function baseLanguage(): BaseLanguage { return current; }
/** The lang attribute for support text: meanings, glosses and explanations. */
export function supportLang(): BaseLanguage { return current; }

/** The locally cached choice, used to paint the right language before the session resumes. */
export function cachedBaseLanguage(): BaseLanguage {
  try { const value = localStorage.getItem(storageKey); return isBaseLanguage(value) ? value : 'en'; }
  catch { return 'en'; }
}

function index(value: LanguageOverlay): void {
  sentences = new Map(); texts = new Map(); exerciseMeanings = new Map();
  lexemeMeanings = new Map(Object.values(value.course.lexicon).filter(entry => entry.tr).map(entry => [entry.en, entry.tr]));
  for (const entry of Object.values(value.story)) {
    if (!entry.tr) continue;
    if (entry.de !== undefined && !sentences.has(entry.de)) sentences.set(entry.de, entry.tr);
    if (entry.en !== undefined && entry.de === undefined && !texts.has(entry.en)) texts.set(entry.en, entry.tr);
  }
  for (const [source, tr] of Object.entries(value.course.texts ?? {})) if (tr && !texts.has(source)) texts.set(source, tr);
  for (const { source, tr } of Object.values(value.course.exercises)) {
    for (const field of ['prompt', 'hint', 'explanation', 'english'] as const) {
      if (source[field] && tr[field] && !texts.has(source[field])) texts.set(source[field], tr[field]);
    }
  }
  // Exercise and guide examples are German sentences too; story dialogue keeps precedence.
  for (const { german, tr } of Object.values(value.course.exercises)) if (german && tr.english && !exerciseMeanings.has(german)) exerciseMeanings.set(german, tr.english);
  for (const guide of Object.values(value.course.grammar)) {
    for (const [german, turkish] of Object.entries(guide.examples)) if (!exerciseMeanings.has(german)) exerciseMeanings.set(german, turkish);
  }
}

/** Load the overlay for a language. English needs nothing. */
export async function loadBaseLanguage(language: BaseLanguage): Promise<void> {
  if (language === 'de') { germanUi = (await import('./i18n-de')).germanUi; return; }
  if (language === 'en' || overlay) return;
  loading ??= import('./i18n-tr').then(module => module.turkishOverlay).catch(error => { loading = undefined; throw error; });
  const value = await loading;
  if (!overlay) { overlay = value; index(value); }
}

/** For tests and tools: install an overlay without the dynamic import. */
export function installOverlay(value: LanguageOverlay | undefined): void {
  overlay = value; loading = undefined;
  if (value) index(value); else { sentences = new Map(); texts = new Map(); exerciseMeanings = new Map(); lexemeMeanings = new Map(); }
}

/**
 * Switch the support language. Turkish loads its overlay first; if that fails the
 * game stays in English rather than showing half-translated screens.
 */
export async function setBaseLanguage(language: BaseLanguage, options: { persist?: boolean } = {}): Promise<BaseLanguage> {
  if (!isBaseLanguage(language)) language = 'en';
  if (language === 'tr') {
    try { await loadBaseLanguage('tr'); }
    catch { language = 'en'; }
  }
  if (language === 'de') await loadBaseLanguage('de');
  const changed = current !== language;
  current = language;
  if (options.persist !== false) { try { localStorage.setItem(storageKey, language); } catch { /* Storage is a convenience cache only. */ } }
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  if (changed) for (const listener of listeners) listener(language);
  return language;
}

export function onBaseLanguageChange(listener: (language: BaseLanguage) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function miss(kind: string, source: string): void {
  if (current === 'en') return;
  const key = `${kind}:${source}`;
  missing.set(key, (missing.get(key) ?? 0) + 1);
}
/** Support strings that fell back to English in this session (dev/test report). */
export function missingTranslations(): ReadonlyMap<string, number> { return missing; }
export function clearMissingTranslations(): void { missing.clear(); }

function fill(text: string, vars?: Record<string, string | number>): string {
  return vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => name in vars ? String(vars[name]) : match) : text;
}

/** Interface chrome. The English string is the key; `{name}` placeholders are filled after lookup. */
export function t(english: string, vars?: Record<string, string | number>): string {
  if (current === 'en') return fill(english, vars);
  if (current === 'de') return fill(germanUi[english] ?? english, vars);
  const turkish = overlay?.ui[english];
  if (turkish === undefined) miss('ui', english);
  return fill(turkish ?? english, vars);
}

export interface SupportedText { german?: string; english: string; localized?: boolean; text?: string; translations?: Partial<Record<BaseLanguage, string | { text: string }>>; }
/**
 * Content support text. A `{german, english}` pair is looked up by its German
 * sentence; a bare English content string (title, objective, gloss) by its source.
 * `localized: true` marks a dynamic sentence whose `english` already went through t().
 */
export function localized(value: SupportedText | string): string { return supportText(value).text; }

/** Like localized(), also reporting the language actually shown (English when a translation is missing). */
export function supportText(value: SupportedText | string): { text: string; lang: BaseLanguage } {
  if (typeof value !== 'string') {
    const translated = value.translations?.[current];
    if (translated !== undefined) return { text: typeof translated === 'string' ? translated : translated.text, lang: current };
  }
  const english = typeof value === 'string' ? value : value.english;
  const supplied = servedTexts.get(typeof value === 'string' ? value : value.text ?? value.german ?? english);
  if (supplied !== undefined) return { text: supplied, lang: current };
  if (current === 'en') return { text: english, lang: 'en' };
  if (typeof value !== 'string' && value.localized) return { text: english, lang: current };
  if (typeof value !== 'string' && value.german !== undefined) {
    const turkish = sentences.get(value.german) ?? exerciseMeanings.get(value.german);
    if (turkish !== undefined) return { text: turkish, lang: current };
    if (english) miss('sentence', value.german);
    return { text: english, lang: 'en' };
  }
  if (!english) return { text: english, lang: current };
  const turkish = texts.get(english);
  if (turkish === undefined) { miss('text', english); return { text: english, lang: 'en' }; }
  return { text: turkish, lang: current };
}

/** The support-language text, or undefined when only English exists (never a fallback). */
export function translatedText(value: SupportedText | string): string | undefined {
  const result = supportText(value);
  return result.lang === current ? result.text : undefined;
}

/** Character and place names: translated only where a title is part of the name (Inspector Voss). */
export function localizedName(name: string): string {
  return current === 'en' ? name : texts.get(name) ?? name;
}

/** Whether a Turkish meaning exists for this German sentence (no fallback). */
export function hasSentenceTranslation(german: string): boolean {
  return current !== 'en' && (sentences.has(german) || exerciseMeanings.has(german));
}

/** Word glosses: the course lexicon overlay by lexeme id, falling back to the English gloss. */
export function lexemeMeaning(word: { id: string; english: string }): string {
  const supplied = word as typeof word & { meanings?: Partial<Record<BaseLanguage, string>>; meaning?: string };
  if (supplied.meaning !== undefined) return supplied.meaning;
  if (supplied.meanings?.[current] !== undefined) return supplied.meanings[current]!;
  if (current === 'en') return word.english;
  const entry = overlay?.course.lexicon[word.id];
  // A gloss written for a different English sense is stale; fall back rather than mislead.
  if (entry && entry.en === word.english) return entry.tr;
  miss('lexeme', word.id);
  return word.english;
}
/** True when the gloss returned for this lexeme is in the support language. */
export function hasLexemeMeaning(word: { id: string; english: string }): boolean {
  if (current === 'en') return true;
  const entry = overlay?.course.lexicon[word.id];
  return !!entry && entry.en === word.english;
}

/** Exercise support text (prompt, hint, explanation, meaning) by exercise id. */
export function localizedExercise<T extends { id: string; prompt: string; hint: string; explanation: string; english: string }>(exercise: T): T {
  if (current === 'en') return exercise;
  const entry = overlay?.course.exercises[exercise.id];
  if (!entry) {
    const generated = overlay && generatedLexicalExerciseText(exercise, overlay.course.lexicon, t);
    if (generated) return { ...exercise, ...generated };
    miss('exercise', exercise.id); return exercise;
  }
  const pick = (field: keyof ExerciseText) => entry.source[field] === exercise[field] && entry.tr[field] ? entry.tr[field] : exercise[field];
  return { ...exercise, prompt: pick('prompt'), hint: pick('hint'), explanation: pick('explanation'), english: pick('english') };
}

/** Recognition meanings are localized for display; German listening options stay German. */
export function localizedExerciseOption(exercise: { id: string; mode: string }, option: string): string {
  const authored = (exercise as typeof exercise & { optionTranslations?: Partial<Record<BaseLanguage, Record<string, string>>> }).optionTranslations?.[current]?.[option];
  if (authored !== undefined) return authored;
  if (current === 'en') return option;
  const options = overlay?.course.exercises[exercise.id]?.options;
  if (options) {
    if (options[option]) return options[option];
    miss('exercise-option', `${exercise.id}:${option}`);
    return option;
  }
  if (exercise.mode !== 'choice' || !/^lex-.+-recognition$/.test(exercise.id)) return option;
  const translated = generatedLexicalOption(option, lexemeMeanings, t);
  if (translated !== undefined) return translated;
  miss('exercise-option', `${exercise.id}:${option}`);
  return option;
}

export function localizedLexemeForm(form: string): string {
  return current === 'en' ? form : translatedLexemeForm(form, t);
}

export function localizedLexemePartOfSpeech(pos: string): string {
  if (current === 'en') return pos;
  switch (pos) {
    case 'noun': return t('Noun');
    case 'verb': return t('Verb');
    case 'article': return t('Article');
    case 'adj': return t('Adjective');
    case 'adv': return t('Adverb');
    case 'pron': return t('Pronoun');
    case 'conj': return t('Conjunction');
    case 'prep': return t('Preposition');
    case 'intj': return t('Interjection');
    case 'num': return t('Numeral');
    case 'det': return t('Determiner');
    case 'name': return t('Proper name');
    case 'phrase': return t('Expression');
    default: return pos;
  }
}

export interface GrammarText { id: string; title: string; explanation: string; examples: { german: string; english: string }[]; }
/** Grammar guides; `note` is the short contrastive note for Turkish speakers, if any. */
export function localizedGrammar<T extends GrammarText>(guide: T): T & { note?: string } {
  if (current === 'en') return guide;
  const entry = overlay?.course.grammar[guide.id];
  if (!entry) { miss('grammar', guide.id); return guide; }
  return {
    ...guide,
    title: entry.title[0] === guide.title ? entry.title[1] : guide.title,
    explanation: entry.explanation[0] === guide.explanation ? entry.explanation[1] : guide.explanation,
    examples: guide.examples.map(example => ({ ...example, english: entry.examples[example.german] ?? example.english })),
    ...(entry.note ? { note: entry.note } : {}),
  };
}

/** Locale-aware uppercase: Turkish maps i → İ and ı → I. Never use toUpperCase() for support text. */
export function upper(text: string): string {
  return text.toLocaleUpperCase(current === 'tr' ? 'tr' : 'en');
}
/** Locale-aware lowercase for search and comparison of support text. */
export function lower(text: string): string {
  return text.toLocaleLowerCase(current === 'tr' ? 'tr' : 'en');
}
