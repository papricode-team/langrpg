/** Authoring-only sentence selectors. Ranges use JavaScript/DOM UTF-16 offsets. */
import { createHash } from 'node:crypto';

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function stableId(key, ids) {
  if (ids[key]) {
    if (!uuidPattern.test(ids[key])) throw new Error(`Invalid committed UUID for ${key}`);
    return ids[key];
  }
  // A fixed namespace gives a reproducible UUID when a new authoring slug is added.
  const bytes = createHash('sha1').update('lantern-atlas:content:v1\0' + key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return ids[key] = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const letter = /[\p{L}\p{M}\p{N}_]/u;
export function selectorRange(text, selector, label = 'selector') {
  if (!selector || typeof selector.text !== 'string' || !selector.text || !Number.isInteger(selector.occurrence) || selector.occurrence < 1) throw new Error(`${label}: expected exact text and a positive occurrence`);
  let offset = 0, occurrence = 0;
  while (offset <= text.length) {
    const start = text.indexOf(selector.text, offset);
    if (start < 0) break;
    const end = start + selector.text.length;
    const before = [...text.slice(0, start)].at(-1) ?? '', after = [...text.slice(end)][0] ?? '';
    const first = [...selector.text][0], last = [...selector.text].at(-1);
    if (!(letter.test(first) && letter.test(before)) && !(letter.test(last) && letter.test(after)) && ++occurrence === selector.occurrence) return { start, end };
    offset = end;
  }
  throw new Error(`${label}: ${JSON.stringify(selector.text)} occurrence ${selector.occurrence} does not resolve in ${JSON.stringify(text)}`);
}

export function sourceTokens(text) {
  const counts = new Map(), result = [];
  for (const match of text.matchAll(/\{[a-zA-Z][a-zA-Z0-9_]*\}|[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*/gu)) {
    // A player's substituted name is presentation, not a vocabulary occurrence.
    if (match[0].startsWith('{')) continue;
    const occurrence = (counts.get(match[0]) ?? 0) + 1; counts.set(match[0], occurrence);
    result.push({ source: { text: match[0], occurrence }, range: { start: match.index, end: match.index + match[0].length } });
  }
  return result;
}

export const sourceKey = source => `${source.text}\0${source.occurrence}`;
export function compileTranslation(sourceText, translation, requiredWords, label = 'translation', { strict = true } = {}) {
  if (!translation || typeof translation.text !== 'string' || !Array.isArray(translation.words)) throw new Error(`${label}: translation text and words array are required`);
  const known = new Set(requiredWords.map(word => sourceKey(word.source))), seen = new Set();
  const words = translation.words.map((entry, index) => {
    const key = sourceKey(entry.source ?? {});
    if (seen.has(key)) throw new Error(`${label}: duplicate source occurrence ${key.replace('\0', ' #')}`);
    seen.add(key);
    if (!known.has(key)) throw new Error(`${label}: source occurrence is not a tappable word: ${JSON.stringify(entry.source)}`);
    if (!Array.isArray(entry.targets)) throw new Error(`${label}: targets must be an array (explicit [] means no counterpart)`);
    const sourceRange = selectorRange(sourceText, entry.source, `${label} word ${index}`);
    const targetRanges = entry.targets.map((target, targetIndex) => selectorRange(translation.text, target, `${label} target ${index}:${targetIndex}`));
    for (let a = 0; a < targetRanges.length; a++) for (let b = a + 1; b < targetRanges.length; b++) {
      if (targetRanges[a].start < targetRanges[b].end && targetRanges[b].start < targetRanges[a].end) throw new Error(`${label}: overlapping target spans for one source occurrence`);
    }
    return { source: entry.source, targets: entry.targets, sourceRange, targetRanges };
  });
  const missing = requiredWords.filter(word => !seen.has(sourceKey(word.source)));
  if (strict && missing.length) throw new Error(`${label}: ${missing.length} missing alignments (${missing.slice(0, 8).map(word => `${word.source.text} #${word.source.occurrence}`).join(', ')})`);
  return { text: translation.text, words };
}

/** Substitute placeholders by editing offsets, never by finding words again. */
export function substituteRanges(text, ranges, variables) {
  const edits = [...text.matchAll(/\{(\w+)\}/g)].filter(match => Object.hasOwn(variables, match[1])).map(match => ({ start: match.index, end: match.index + match[0].length, value: String(variables[match[1]]) }));
  const boundary = (position, end) => {
    let delta = 0;
    for (const edit of edits) {
      if (position >= edit.end) delta += edit.value.length - (edit.end - edit.start);
      else if (position > edit.start) return edit.start + delta + (end ? edit.value.length : 0);
    }
    return position + delta;
  };
  let result = text;
  for (const edit of [...edits].reverse()) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  return { text: result, ranges: ranges.map(range => ({ start: boundary(range.start, false), end: boundary(range.end, true) })) };
}

export function personalizeSentence(sentence, variables) {
  const source = substituteRanges(sentence.text, sentence.words.map(word => word.range), variables);
  const words = sentence.words.map((word, index) => ({ ...word, range: source.ranges[index] }));
  const translations = Object.fromEntries(Object.entries(sentence.translations).map(([lang, translation]) => {
    const all = translation.words.flatMap(word => word.targetRanges);
    const target = substituteRanges(translation.text, all, variables);
    let index = 0;
    return [lang, { ...translation, text: target.text, words: translation.words.map(word => ({ ...word, sourceRange: substituteRanges(sentence.text, [word.sourceRange], variables).ranges[0], targetRanges: word.targetRanges.map(() => target.ranges[index++]) })) }];
  }));
  return { ...sentence, text: source.text, words, translations };
}
