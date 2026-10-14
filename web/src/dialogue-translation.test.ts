import { describe, expect, it } from 'vitest';
import { markTranslation, personalizeSentence, presentSentence, wordTargetRanges, type AuthoredSentence } from './translated-sentence';

/** The selectors here are written independently of dictionary meanings. */
function authored(text: string, translated: string, mapping: [string, string[]][], language = 'en'): AuthoredSentence {
  const occurrences = new Map<string, number>();
  const words = mapping.map(([source, targets]) => {
    const occurrence = (occurrences.get(source) ?? 0) + 1; occurrences.set(source, occurrence);
    let start = -1;
    for (let i = 0; i < occurrence; i++) start = text.indexOf(source, start + 1);
    return { source: { text: source, occurrence }, targets: targets.map(target => ({ text: target, occurrence: 1 })), sourceRange: { start, end: start + source.length }, targetRanges: targets.map(target => ({ start: translated.indexOf(target), end: translated.indexOf(target) + target.length })) };
  });
  return { text, target: 'de', translations: { [language]: { text: translated, words } }, words: words.map(word => ({ source: word.source, range: word.sourceRange, glosses: { [language]: `meaning: ${word.source.text}` } })) };
}
function highlights(sentence: AuthoredSentence, index: number, language = 'en'): string[] {
  const p = presentSentence(sentence, '', language);
  return wordTargetRanges(p, index).map(range => p.translation.slice(range.start, range.end));
}

describe('authored sentence translation highlights', () => {
  it('uses inflected Turkish counterparts rather than dictionary gloss substrings', () => {
    const sentence = authored('Ihre Fahrkarte, bitte. Auch meine Akten müssen geprüft werden.', 'Biletiniz, lütfen. Benim dosyalarımın da denetlenmesi gerekiyor.', [['Fahrkarte', ['Biletiniz']], ['geprüft', ['denetlenmesi']], ['Auch', ['da']], ['werden', []]], 'tr');
    expect(highlights(sentence, 0, 'tr')).toEqual(['Biletiniz']);
    expect(highlights(sentence, 1, 'tr')).toEqual(['denetlenmesi']);
    expect(highlights(sentence, 2, 'tr')).toEqual(['da']);
    expect(highlights(sentence, 3, 'tr')).toEqual([]);
    expect(sentence.words[3].glosses.tr).toBeDefined();
  });
  it('keeps would and like separate from the pronoun and marks English bitte', () => {
    const sentence = authored('Möchtest du Kaffee, bitte?', 'Would you like coffee, please?', [['Möchtest', ['Would', 'like']], ['du', ['you']], ['bitte', ['please']]]);
    expect(highlights(sentence, 0)).toEqual(['Would', 'like']);
    expect(highlights(sentence, 1)).toEqual(['you']);
    expect(highlights(sentence, 2)).toEqual(['please']);
  });
  it('distinguishes repeated Sie occurrences using their authored source ranges', () => {
    const sentence = authored('Sie sagt: Helfen Sie mir.', 'She says: Please help me, will you?', [['Sie', ['She']], ['Sie', ['you']]]);
    expect(highlights(sentence, 0)).toEqual(['She']);
    expect(highlights(sentence, 1)).toEqual(['you']);
  });
  it('never guesses from alternative glosses, ambiguous senses, or a missing map', () => {
    const sentence = authored('Die Bank ist dort.', 'The bank is beside the bench.', [['Bank', []]]);
    sentence.words[0].glosses.en = 'bank / bench';
    expect(highlights(sentence, 0)).toEqual([]);
    sentence.translations.en!.words = [];
    expect(highlights(sentence, 0)).toEqual([]);
  });
  it('adjusts source and target offsets around personalized names without rematching', () => {
    const sentence = authored('Hallo {name}, Kaffee bitte.', 'Hello {name}, coffee please.', [['Kaffee', ['coffee']], ['bitte', ['please']]]);
    const personalized = personalizeSentence(sentence, { name: '🌙 coffee <Ada & Bo>' });
    expect(highlights(personalized, 0)).toEqual(['coffee']);
    const p = presentSentence(personalized);
    expect(wordTargetRanges(p, 0)[0].start).toBe(p.translation.lastIndexOf('coffee'));
    expect(markTranslation(p.translation, wordTargetRanges(p, 0))).toContain('&lt;Ada &amp; Bo&gt;, <mark>coffee</mark>');
  });
  it('rejects stale or out-of-bounds ranges and escapes all unmarked content', () => {
    expect(markTranslation('<cloud> is helpful', [{ start: -1, end: 2 }, { start: 0, end: 100 }])).toBe('&lt;cloud&gt; is helpful');
  });
});
