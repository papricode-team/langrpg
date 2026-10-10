import { describe, expect, it } from 'vitest';
import { translationHighlights, type TranslationLookup } from './dialogue-translation';

function highlighted(input: TranslationLookup): string[] {
  return translationHighlights(input).map(span => input.english.slice(span.start, span.end));
}

describe('contextual sentence translation highlights', () => {
  const marta = { german: 'Hallo, Ada! Möchtest du einen Kaffee?', english: 'Hello, Ada! Would you like a coffee?' };
  it.each([
    ['Hallo', 'hello', 'Hello'], ['Möchtest', 'to want', 'Would you like'],
    ['du', 'you', 'you'], ['einen', 'a (accusative masculine)', 'a'], ['Kaffee', 'der Kaffee — coffee', 'coffee'],
  ])('aligns Marta’s %s in the whole translated sentence', (word, gloss, equivalent) => {
    expect(highlighted({ ...marta, word, gloss })).toEqual(word === 'Möchtest' ? ['Would', 'like'] : [equivalent]);
  });

  const otto = { german: 'Guten Morgen, Ada! Willkommen in Lindenhafen.', english: 'Good morning, Ada! Welcome to Lindenhafen.' };
  it.each([
    ['Guten', 'good', 'Good'], ['Morgen', 'morning / tomorrow', 'morning'],
    ['Willkommen', 'welcome', 'Welcome'], ['in', 'in', 'to'],
  ])('aligns Otto’s introductory %s in context', (word, gloss, equivalent) => {
    expect(highlighted({ ...otto, word, gloss })).toEqual([equivalent]);
  });

  it('uses the corresponding sentence rather than unrelated equivalents later in a line', () => {
    const input = { german: 'Dein Zug ist da. Die Tauben schlafen noch.', english: 'Your train is here. The pigeons are still sleeping.' };
    expect(highlighted({ ...input, word: 'Dein', gloss: 'your' })).toEqual(['Your']);
    expect(highlighted({ ...input, word: 'ist', gloss: 'to be' })).toEqual(['is']);
    expect(highlighted({ ...input, word: 'schlafen', gloss: 'to sleep' })).toEqual(['sleeping']);
    expect(highlighted({ ...input, word: 'Die', gloss: 'the (feminine)' })).toEqual(['The']);
  });

  it('uses slash alternatives and explicit infinitive inflections', () => {
    expect(highlighted({ german: 'Kann ich helfen?', english: 'Can I help?', word: 'helfen', gloss: 'helfen — to help / to assist' })).toEqual(['help']);
    expect(highlighted({ german: 'Ich will helfen.', english: 'I want to help.', word: 'helfen', gloss: 'to help' })).toEqual(['to help']);
    expect(highlighted({ german: 'Er hilft.', english: 'He helps.', word: 'hilft', gloss: 'to help' })).toEqual(['helps']);
  });

  it('aligns the invitation verb separately from its pronoun, including lowercase German', () => {
    const input = { german: 'Hallo, möchtest du einen Kaffee?', english: 'Hello, would you like a coffee?', word: 'möchtest', gloss: 'would like' };
    expect(highlighted(input)).toEqual(['would', 'like']);
    expect(highlighted({ ...input, word: 'du', gloss: 'you' })).toEqual(['you']);
    expect(highlighted({ german: 'Möchten Sie Kaffee?', english: 'Would you like coffee?', word: 'Möchten', gloss: 'would like' })).toEqual(['Would', 'like']);
  });

  it('does not match articles or meanings inside other words', () => {
    expect(highlighted({ german: 'Ein Name.', english: 'Anna is at a_name cash.', word: 'Ein', gloss: 'a' })).toEqual([]);
    expect(highlighted({ german: 'Ich helfe.', english: 'I am helpful.', word: 'helfe', gloss: 'to help' })).toEqual([]);
  });

  it('distinguishes third-person Sie from formal Sie using the clause', () => {
    expect(highlighted({ german: 'Sie sagt: Du kannst lesen.', english: 'She says: You can read.', word: 'Sie', gloss: 'she / they / formal you' })).toEqual(['She']);
    expect(highlighted({ german: 'Helfen Sie mir.', english: 'Please help me, will you?', word: 'Sie', gloss: 'she / they / formal you' })).toEqual(['you']);
    expect(highlighted({ german: 'Hier helfen sie.', english: 'Here they help you.', word: 'sie', gloss: 'she / they / formal you' })).toEqual(['they']);
    expect(highlighted({ german: 'Sie sind hier.', english: 'They are here with you.', word: 'Sie', gloss: 'she / they / formal you' })).toEqual([]);
  });

  it('does not infer a sense when two alternative meanings occur in the same sentence', () => {
    expect(highlighted({ german: 'Die Bank ist dort.', english: 'The bank is beside the bench.', word: 'Bank', gloss: 'bank / bench' })).toEqual([]);
    expect(highlighted({ german: 'Das ist gut.', english: 'That is good.', word: 'Das', gloss: 'the' })).toEqual([]);
  });

  it('returns indices in the original string, including emoji and HTML-sensitive names', () => {
    const input = { german: 'Hallo, 🌙 <Ada & Bo>! Möchtest du einen Kaffee?', english: 'Hello, 🌙 <Ada & Bo>! Would you like a coffee?', word: 'Kaffee', gloss: 'coffee' };
    const start = input.english.indexOf('coffee');
    expect(translationHighlights(input)).toEqual([{ start, end: start + 6 }]);
    expect(input.english).toContain('<Ada & Bo>');
  });

  it('treats glossary punctuation literally and requires the German word to be present', () => {
    const input = { german: 'Hier steht Code.', english: 'Use C++ (not CCC).', word: 'Code', gloss: 'C++' };
    expect(highlighted(input)).toEqual(['C++']);
    expect(highlighted({ ...input, word: 'Kaffee', gloss: 'Use' })).toEqual([]);
    expect(highlighted({ ...marta, word: 'Kaffee', gloss: 'unknown sense' })).toEqual(['coffee']);
    expect(highlighted({ german: 'Die Wolke.', english: 'A cloud.', word: 'Wolke', gloss: 'sky' })).toEqual([]);
    expect(highlighted({ german: 'Die Wolke.', english: 'A cloud.', word: 'Wolke', gloss: 'Wolke—cloud' })).toEqual(['cloud']);
  });
});
