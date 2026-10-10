/** Conservative surface matching for exposure only; ambiguity is not mastery. */
export function createLexemeMapper(lexicon) {
  const headwords = new Map(), surfaces = new Map();
  const byId = new Map(lexicon.map(word => [word.id, word]));
  const add = (index, form, id) => {
    if (!/^[\p{L}ß-]+$/u.test(form)) return;
    const key = form.normalize('NFC');
    const ids = index.get(key) ?? new Set(); ids.add(id); index.set(key, ids);
  };
  for (const word of lexicon) {
    add(headwords, word.lemma, word.id);
    // Imported pronoun tables include OTHER pronouns, not just inflections of
    // this headword. Authored aliases are safe; the broad table is not.
    if (word.pos !== 'pron') {
      if (word.plural) add(surfaces, word.plural, word.id);
      for (const form of word.surfaceForms ?? []) add(surfaces, form, word.id);
      for (const form of word.forms ?? []) add(surfaces, form.replace(/^[^:]+:\s*/, ''), word.id);
    }
    for (const alias of word.aliases ?? []) add(surfaces, alias.form, word.id);
  }
  const lowercaseHeadwords = new Set(lexicon.filter(word => ['adv','pron','article','det','prep','conj','particle','intj','num'].includes(word.pos) && word.lemma === word.lemma.toLowerCase()).map(word => word.lemma));
  const separatedVerbs = lexicon.filter(word => word.pos === 'verb').flatMap(word => (word.surfaceForms ?? []).filter(form => /^[\p{L}ß]+ [\p{L}ß]+$/u.test(form)).map(form => ({id:word.id,pattern:new RegExp(`\\b${form.split(' ')[0]}\\b[^.!?]*\\b${form.split(' ')[1]}\\b`, 'iu')})));
  return text => {
    text = text.normalize('NFC');
    const ids = new Set();
    for (const token of text.matchAll(/[\p{L}ß]+(?:-[\p{L}ß]+)*/gu)) {
      const surface = token[0], prefix = text.slice(0, token.index), after = text.slice(token.index + surface.length);
      const atBoundary = !prefix.trim() || /[.!?:„“]\s*$/.test(prefix);
      let candidates = headwords.get(surface) ?? headwords.get(surface.toLowerCase()) ?? surfaces.get(surface) ?? surfaces.get(surface.toLowerCase()) ?? new Set();
      if (atBoundary && surface !== 'Sie' && surface !== surface.toLowerCase() && lowercaseHeadwords.has(surface.toLowerCase())) candidates = headwords.get(surface.toLowerCase()) ?? candidates;
      if (surface === 'Sie' && /^\s+(?:selbst\s+)?(?:ist|hat|war|kann|möchte|geht|arbeitet|kommt|trinkt|heißt|soll|muss|hatte|liest|findet|wartet|sucht|sitzt|braucht|lebt|holt|nimmt|macht)\b/iu.test(after)) candidates = new Set(lexicon.filter(word => word.lemma === 'sie' && word.pos === 'pron').map(word => word.id));
      else if (surface === 'Sie' && atBoundary) candidates = new Set();
      // A finite verb after an overt subject resolves collisions such as
      // "Ich heiße Alex" versus "die heiße Suppe" without crediting both.
      if (candidates.size > 1 && /(?:^|\s)(?:ich|du|er|sie|es|wir|ihr|Sie)\s+$/iu.test(prefix)) {
        const verbs = [...candidates].filter(id => byId.get(id)?.pos === 'verb');
        if (verbs.length === 1) candidates = new Set(verbs);
      }
      if (candidates.size === 1) ids.add([...candidates][0]);
    }
    for (const {id,pattern} of separatedVerbs) if (pattern.test(text)) ids.add(id);
    return [...ids].sort();
  };
}
