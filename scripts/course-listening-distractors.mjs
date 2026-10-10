const levels = ['A1', 'A2', 'B1'];
const functionWords = new Set(['article', 'det', 'pron']);
const normalize = text => text.normalize('NFC').toLowerCase().replaceAll('ß', 'ss');
export const spokenWord = word => word.article ? `${word.article} ${word.articleForm ?? word.lemma}` : word.lemma;

function hash(text) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
  return value;
}

/** Prefer the same topic and grammatical shape, varying choices per item ID.
 * Sparse categories may use already-taught words or related function words;
 * a beginner's choices never contain vocabulary from a later CEFR level.
 */
export function createListeningDistractorPicker(lexicon) {
  return word => {
    const targetLevel = levels.indexOf(word.level);
    const excluded = new Set([normalize(spokenWord(word)), ...((word.aliases ?? []).map(alias => normalize(alias.form)))]);
    const candidates = lexicon.filter(other => other.id !== word.id
      && levels.indexOf(other.level) >= 0 && levels.indexOf(other.level) <= targetLevel
      && (other.pos === word.pos || (functionWords.has(word.pos) && functionWords.has(other.pos)))
      && !excluded.has(normalize(spokenWord(other))));
    const ranked = candidates.map(other => ({
      word: other,
      relevance: (other.pos === word.pos ? 0 : 4)
        + (other.topic === word.topic ? 0 : 2)
        + (other.level === word.level ? 0 : 1)
        + (word.article && other.article !== word.article ? .25 : 0),
      seed: hash(`${word.id}:${other.id}`),
    })).sort((a, b) => a.relevance - b.relevance || a.seed - b.seed || (a.word.id < b.word.id ? -1 : a.word.id > b.word.id ? 1 : 0));
    const selected = [], forms = new Set();
    for (const candidate of ranked) {
      const form = normalize(spokenWord(candidate.word));
      if (forms.has(form)) continue;
      selected.push(candidate.word); forms.add(form);
      if (selected.length === 3) return selected;
    }
    throw new Error(`Not enough level-appropriate listening distractors for ${word.id}`);
  };
}
