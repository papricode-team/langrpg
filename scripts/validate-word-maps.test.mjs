import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTranslation, sourceTokens } from './content-model.mjs';
import { validateBundle } from './validate-word-maps.mjs';

function fixture() {
  const text = 'Das ist gut. Sehr gut.';
  const words = sourceTokens(text);
  const map = (text, targets) => compileTranslation('Das ist gut. Sehr gut.', {
    text, words: words.map((word, index) => ({ source: word.source, targets: targets[index] })),
  }, words);
  const selector = (text, occurrence = 1) => ({ text, occurrence });
  return {
    courses: [{ id: 'german', supportLanguages: ['en', 'tr'] }],
    records: [{ id: 'otto', slug: 'dialogue:otto', kind: 'sentence', courseId: 'german', body: {
      text, words, translations: {
        en: map('That is good. Very good.', [[selector('That')], [selector('is')], [selector('good')], [selector('Very')], [selector('good', 2)]]),
        tr: map('Bu iyi. Çok iyi.', [[selector('Bu')], [], [selector('iyi')], [selector('Çok')], [selector('iyi', 2)]]),
      },
    } }],
  };
}

test('every source occurrence has an explicit mapping in both support languages', () => {
  assert.deepEqual(validateBundle(fixture()), []);
});

for (const language of ['en', 'tr']) {
  test(`missing ${language} mappings fail even when another occurrence of the word is mapped`, () => {
    const bundle = fixture();
    bundle.records[0].body.translations[language].words.pop();
    assert.match(validateBundle(bundle).join('\n'), new RegExp(`${language}: 1 missing alignments \\(gut #2\\)`));
  });
  test(`a missing or blank ${language} translation fails`, () => {
    const bundle = fixture();
    bundle.records[0].body.translations[language].text = '';
    assert.match(validateBundle(bundle).join('\n'), new RegExp(`${language}: missing translation`));
    delete bundle.records[0].body.translations[language];
    assert.match(validateBundle(bundle).join('\n'), new RegExp(`${language}: missing translation`));
  });
}

test('removing a source word from both the UI list and its mappings cannot bypass coverage', () => {
  const bundle = fixture(), body = bundle.records[0].body;
  body.words.pop();
  for (const translation of Object.values(body.translations)) translation.words.pop();
  const errors = validateBundle(bundle).join('\n');
  assert.match(errors, /missing tappable source occurrence gut #2/);
  assert.match(errors, /en: 1 missing alignments/);
  assert.match(errors, /tr: 1 missing alignments/);
});

test('duplicate occurrences and stale compiled translation offsets fail', () => {
  const bundle = fixture(), body = bundle.records[0].body;
  body.words.push(body.words[0]);
  body.translations.en.words[2].targetRanges[0].start++;
  const errors = validateBundle(bundle).join('\n');
  assert.match(errors, /duplicate tappable source occurrence/);
  assert.match(errors, /en: compiled ranges are stale/);
});

test('an explicit no-counterpart entry is different from an omitted entry', () => {
  const bundle = fixture();
  assert.deepEqual(validateBundle(bundle), []);
  bundle.records[0].body.translations.tr.words.splice(1, 1);
  assert.match(validateBundle(bundle).join('\n'), /tr: 1 missing alignments \(ist #1\)/);
});
