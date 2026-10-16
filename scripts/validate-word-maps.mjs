/** Validate coverage against source text, independently of the tappable word list. */
import { compileTranslation, sourceTokens, sourceKey } from './content-model.mjs';

export function validateBundle(bundle, { strict = true } = {}) {
  const courses = new Map(bundle.courses.map(course => [course.id, course]));
  const errors = [];
  for (const record of bundle.records.filter(record => record.kind === 'sentence')) {
    const { body } = record;
    const label = `${record.slug ?? record.id} (${record.id})`;
    const required = sourceTokens(body.text);
    const actual = new Set();
    for (const word of body.words) {
      const key = sourceKey(word.source);
      if (actual.has(key)) errors.push(`${label}: duplicate tappable source occurrence ${word.source.text} #${word.source.occurrence}`);
      actual.add(key);
      const token = required.find(token => sourceKey(token.source) === key);
      if (!token || token.range.start !== word.range.start || token.range.end !== word.range.end) errors.push(`${label}: stale source range for ${word.source.text} #${word.source.occurrence}`);
    }
    if (strict) for (const token of required) {
      if (!actual.has(sourceKey(token.source))) errors.push(`${label}: missing tappable source occurrence ${token.source.text} #${token.source.occurrence}`);
    }
    for (const language of courses.get(record.courseId).supportLanguages) {
      const translation = body.translations[language];
      if (!translation || !translation.text.trim()) {
        if (strict) errors.push(`${label}/${language}: missing translation`);
        continue;
      }
      try {
        const compiled = compileTranslation(body.text, translation, strict ? required : body.words, `${label}/${language}`, { strict });
        if (JSON.stringify(compiled) !== JSON.stringify(translation)) errors.push(`${label}/${language}: compiled ranges are stale`);
      } catch (error) { errors.push(error.message); }
    }
  }
  return errors;
}
