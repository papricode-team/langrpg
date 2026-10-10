export interface TranslationHighlight { start: number; end: number; }
export interface TranslationLookup { german: string; english: string; word: string; gloss: string; }

const wordBoundary = '[\\p{L}\\p{M}\\p{N}_]';
function literal(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function occurrences(text: string, phrase: string, caseSensitive = false): TranslationHighlight[] {
  if (!phrase.trim()) return [];
  const pattern = phrase.trim().split(/\s+/u).map(literal).join('\\s+');
  return [...text.matchAll(new RegExp(`(?<!${wordBoundary})${pattern}(?!${wordBoundary})`, caseSensitive ? 'gu' : 'giu'))]
    .map(match => ({ start: match.index, end: match.index + match[0].length }));
}

const direct: Record<string, string[]> = {
  hallo: ['hello'], willkommen: ['welcome'], kaffee: ['coffee'], hilfe: ['help'],
  du: ['you'], dich: ['you'], dir: ['you'], ich: ['I'], mich: ['me'], mir: ['me'],
  wir: ['we'], uns: ['us'], er: ['he'], ihn: ['him'],
  dein: ['your'], deine: ['your'], deinen: ['your'], deinem: ['your'], deiner: ['your'], deines: ['your'],
};
const singularSie = /^(?:ist|war|hat|braucht|kommt|hilft|fragt|arbeitet|sagt|möchte|kann|liest|nimmt|geht|wartet|wohnt)\b/iu;
const pluralSie = /^(?:sind|waren|haben|brauchen|kommen|helfen|fragen|arbeiten|sagen|möchten|können|lesen|nehmen|gehen|warten|wohnen)\b/iu;

// These are contextual equivalents in authored dialogue, rather than a general translator.
function authored(word: string, german: string): string[] | undefined {
  const key = word.toLocaleLowerCase('de');
  if (/^gut(?:en|e|er|es|em)?$/u.test(key) && /\bgut(?:en|e)\s+(?:Morgen|Tag|Abend|Nacht)\b/iu.test(german)) return ['good'];
  if (key === 'morgen' && /\bGuten\s+Morgen\b/iu.test(german)) return ['morning'];
  if (key === 'in' && /\bWillkommen\s+in\b/iu.test(german)) return ['to'];
  if (/^möcht(?:est|en|et)$/u.test(key) && /\b(?:Möchtest\s+du|Möchten\s+Sie|Möchtet\s+ihr)\b/iu.test(german)) return ['would you like'];
  if (key === 'möchte' && /\bIch\s+möchte\b/iu.test(german)) return ['would like'];
  if (/^(?:der|die|das|den|dem|des)$/u.test(key)) {
    // A capitalized following noun distinguishes the article from e.g. “Das ist …”.
    if (new RegExp(`(?<!${wordBoundary})${literal(word)}\\s+\\p{Lu}`, 'u').test(german)) return ['the'];
  }
  if (/^ein(?:e|en|em|er|es)?$/u.test(key)) return ['a', 'an', 'one', 'some'];
  if (key === 'sie') {
    const match = occurrences(german, word, true)[0];
    if (!match) return [];
    const following = german.slice(match.end).trimStart();
    if (singularSie.test(following)) return ['she'];
    if (word === 'Sie') {
      // Capitalization at a sentence start alone cannot distinguish formal you from they.
      const before = german.slice(0, match.start).trimEnd();
      if (before && !/[.!?:“"»]$/u.test(before)) return ['you'];
      return pluralSie.test(following) ? ['you', 'they'] : ['you', 'she', 'they', 'her', 'them'];
    }
    return pluralSie.test(following) ? ['they'] : ['she', 'they', 'her', 'them'];
  }
  return direct[key];
}

function glossAlternatives(gloss: string): string[] {
  const meaning = gloss.split(/\s*[—–]\s*/u).at(-1) ?? gloss;
  return [...new Set(meaning.split(/\s*[/;]\s*/u).map(value => value
    .replace(/\([^)]*\)/gu, '').replace(/^formal\s+/iu, '').trim()).filter(Boolean))];
}

const inflections: Record<string, string[]> = {
  be: ['am', 'is', 'are', 'was', 'were', 'being', 'been'],
  have: ['has', 'had', 'having'], do: ['does', 'did', 'doing', 'done'],
  go: ['goes', 'went', 'going', 'gone'], come: ['comes', 'came', 'coming'],
  sleep: ['sleeps', 'sleeping', 'slept'], read: ['reads', 'reading'],
  help: ['helps', 'helping', 'helped'], say: ['says', 'saying', 'said'],
};
function candidateForms(candidate: string): string[][] {
  if (!/^to\s+\p{L}+$/iu.test(candidate)) return [[candidate]];
  const base = candidate.slice(3).trim();
  const key = base.toLocaleLowerCase('en');
  // Only authored inflections are used: arbitrary stemming can invent false alignments.
  return [[candidate], [base], inflections[key] ?? []];
}

function equivalentOccurrences(english: string, equivalent: string): TranslationHighlight[] {
  const found = occurrences(english, equivalent);
  if (equivalent !== 'would you like') return found;
  // German möchtest corresponds to the verb, while du / Sie carries the separate “you”.
  return found.flatMap(range => ['would', 'like'].flatMap(part =>
    occurrences(english.slice(range.start, range.end), part).map(span => ({ start: span.start + range.start, end: span.end + range.start }))));
}

interface Scope { german: string; english: string; offset: number; }
function scopes(german: string, english: string, word: string): Scope[] {
  const parts = (text: string) => [...text.matchAll(/[^.!?]+[.!?]*/gu)];
  const de = parts(german), en = parts(english);
  if (de.length !== en.length || de.length < 2) return [{ german, english, offset: 0 }];
  return de.flatMap((part, index) => occurrences(part[0], word, word.toLocaleLowerCase('de') === 'sie').length
    ? [{ german: part[0], english: en[index][0], offset: en[index].index }] : []);
}

/** UTF-16 offsets into the unchanged English string. An uncertain alignment has no spans. */
export function translationHighlights({ german, english, word, gloss }: TranslationLookup): TranslationHighlight[] {
  if (!occurrences(german, word, word.toLocaleLowerCase('de') === 'sie').length) return [];
  const ranges: TranslationHighlight[] = [];
  for (const scope of scopes(german, english, word)) {
    const candidates = authored(word, scope.german) ?? glossAlternatives(gloss);
    const meanings = candidates.map(candidate => {
      for (const forms of candidateForms(candidate)) {
        const found = forms.flatMap(form => equivalentOccurrences(scope.english, form));
        if (found.length) return found;
      }
      return [];
    }).filter(found => found.length);
    // Two different possible senses in one sentence are not evidence of either alignment.
    if (meanings.length !== 1) continue;
    ranges.push(...meanings[0].map(range => ({ start: range.start + scope.offset, end: range.end + scope.offset })));
  }
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce<TranslationHighlight[]>((kept, range) => {
      if (!kept.length || range.start >= kept[kept.length - 1].end) kept.push(range);
      return kept;
    }, []);
}
