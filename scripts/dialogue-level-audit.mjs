import './register-content-loader.mjs';
import { auditInputLevel } from '../web/src/learning-context.ts';

const levels = ['A1', 'A2', 'B1'];
const normalize = word => word.normalize('NFC').toLowerCase();
const tokens = text => text.replace(/\{[^}]+\}/g, '').match(/\p{L}+/gu) ?? [];
const contractions = { am: ['an', 'dem'], im: ['in', 'dem'], ins: ['in', 'das'], ans: ['an', 'das'], zum: ['zu', 'dem'], zur: ['zu', 'der'], vom: ['von', 'dem'] };

export function dialogueEntries(graph) {
  const entries = [];
  for (const node of graph.nodes) {
    for (const line of node.lines) {
      entries.push({ kind: 'line', lineId: line.id, german: line.german });
      for (const [index, variant] of (line.variants ?? []).entries()) entries.push({ kind: 'variant', lineId: line.id, variant: index + 1, german: variant.german });
      if (line.reply) entries.push({ kind: 'correction', lineId: line.reply.correction.id, german: line.reply.correction.german });
    }
    for (const choice of node.choices ?? []) entries.push({ kind: 'choice', lineId: `${node.id}:${choice.id}`, german: choice.german });
  }
  for (const item of graph.investigations) entries.push({ kind: 'investigation', lineId: item.objectId, german: item.german });
  return entries;
}

export function summarizeInput(entries, adjusted = false) {
  return Object.fromEntries(levels.map(level => {
    const subset = entries.filter(entry => entry.level === level);
    const audits = subset.map(entry => adjusted ? entry.adjusted : entry);
    return [level, {
      lines: subset.length,
      linesWithAboveLevelWords: audits.filter(audit => audit.aboveLevelWords.length).length,
      linesWithUnmappedWords: audits.filter(audit => audit.unmappedWords.length).length,
      linesWithGrammarFlags: audits.filter(audit => audit.advancedGrammar.length).length,
      longSentences: audits.reduce((sum, audit) => sum + audit.longSentences, 0),
    }];
  }));
}

/** Preserve the conservative raw audit, then explain each bounded resolution.
 * Introductions are editorial vocabulary with an English gloss, not evidence
 * that an individual learner knows a word. Quest order follows content.ts.
 */
export function auditDialogueCorpus({ graphs, lexicon, questOrder = graphs.map(graph => graph.questId), properNames = [] }) {
  const exact = new Map(), forms = new Map();
  const index = (map, surface, word) => {
    if (!/^\p{L}+$/u.test(surface)) return;
    const key = normalize(surface), values = map.get(key) ?? [];
    if (!values.some(value => value.id === word.id)) values.push(word);
    map.set(key, values);
  };
  for (const word of lexicon) {
    index(exact, word.lemma, word);
    for (const form of word.surfaceForms ?? []) index(forms, form, word);
    for (const alias of word.aliases ?? []) index(forms, alias.form, word);
    if (word.plural) index(forms, word.plural, word);
  }
  const candidates = surface => exact.get(normalize(surface)) ?? forms.get(normalize(surface)) ?? [];
  const known = (surface, level) => candidates(surface).find(word => levels.indexOf(word.level) <= levels.indexOf(level));
  const names = new Set(properNames.flatMap(tokens).map(normalize));
  const ordered = questOrder.map(id => graphs.find(graph => graph.questId === id)).filter(Boolean);
  const errors = [], introductions = [], entries = [], introduced = new Map();
  if (ordered.length !== graphs.length || new Set(questOrder).size !== questOrder.length) errors.push('Quest order must include every dialogue graph exactly once');
  for (const graph of ordered) {
    const graphEntries = dialogueEntries(graph), newWords = [];
    const visible = new Set(graphEntries.flatMap(entry => tokens(entry.german)).map(normalize));
    for (const [surface, english] of Object.entries(graph.introducedWords ?? {})) {
      const key = normalize(surface);
      if (!/^\p{L}+$/u.test(surface) || typeof english !== 'string' || !english.trim() || !/[a-z]/i.test(english) || normalize(english.trim()) === key) {
        errors.push(`${graph.questId}: introduced word ${surface} needs an explicit English gloss`);
        continue;
      }
      if (!visible.has(key)) errors.push(`${graph.questId}: introduced word ${surface} is never presented`);
      if (known(surface, graph.level)) errors.push(`${graph.questId}: ${surface} is already level vocabulary; simplify the introduction list`);
      if (!introduced.has(key)) {
        newWords.push({ german: surface, english });
        introduced.set(key, { english, questId: graph.questId });
      }
    }
    introductions.push({ questId: graph.questId, level: graph.level, newWords, carriedWords: [...introduced].filter(([, value]) => value.questId !== graph.questId).map(([word]) => word) });
    if (graph.level === 'A1' && newWords.length > 2) errors.push(`${graph.questId}: introduces ${newWords.length} new story words; Act I permits at most 2`);
    for (const entry of graphEntries) {
      const raw = auditInputLevel(entry.german, graph.level, lexicon), surfaces = tokens(entry.german), resolutions = [];
      const namedPeople = new Set([...entry.german.matchAll(/\b(?:Frau|Herr)\s+(\p{Lu}\p{L}*)/gu)].map(match => normalize(match[1])));
      const resolve = surface => {
        const key = normalize(surface), story = introduced.get(key);
        if (story) return { word: surface, reason: 'introduced-story-word', english: story.english, introducedIn: story.questId };
        if (names.has(key) || namedPeople.has(key)) return { word: surface, reason: 'proper-name' };
        if (key.endsWith('s') && names.has(key.slice(0, -1))) return { word: surface, reason: 'proper-name-genitive' };
        if (/^\p{Lu}$/u.test(surface)) return { word: surface, reason: 'single-letter-clue' };
        const contraction = contractions[key];
        if (contraction && contraction.every(part => known(part, graph.level))) return { word: surface, reason: 'grammatical-contraction', parts: contraction };
        // Preserve higher-level exact matches. A possessive form before a noun
        // is the narrow exception: "meinen Schlüssel" is not the verb meinen.
        const position = surfaces.indexOf(surface), next = surfaces[position + 1];
        const determiner = (forms.get(key) ?? []).find(word => word.pos === 'det' && levels.indexOf(word.level) <= levels.indexOf(graph.level));
        if (determiner && next && /^\p{Lu}/u.test(next) && candidates(next).some(word => word.pos === 'noun')) {
          return { word: surface, reason: 'possessive-before-noun', lexemeId: determiner.id };
        }
        if (raw.unmappedWords.includes(surface)) {
          const word = known(surface, graph.level);
          if (word) return { word: surface, reason: 'level-tagged-surface-form', lexemeId: word.id };
        }
      };
      const unresolved = collection => collection.filter(surface => {
        const resolution = resolve(surface);
        if (!resolution) return true;
        if (!resolutions.some(value => value.word === surface)) resolutions.push(resolution);
        return false;
      });
      const grammar = [...raw.advancedGrammar];
      if (graph.level === 'A1') {
        for (const form of ['weil', 'wenn', 'ob', 'bevor', 'nachdem', 'sobald', 'damit']) if (new RegExp(`\\b${form}\\b`, 'iu').test(entry.german)) grammar.push(form);
        if (/,\s*(?:wie|wo|wann|warum|wohin)\b/iu.test(entry.german)) grammar.push('indirect-question');
      }
      const adjusted = {
        aboveLevelWords: unresolved(raw.aboveLevelWords),
        unmappedWords: unresolved(raw.unmappedWords),
        advancedGrammar: [...new Set(grammar)],
        longSentences: raw.longSentences,
        overlongTurn: graph.level === 'A1' && surfaces.length > 16,
      };
      const result = { questId: graph.questId, ...entry, level: graph.level, ...raw, resolutions, adjusted };
      entries.push(result);
      if (graph.level === 'A1') {
        for (const word of adjusted.aboveLevelWords) errors.push(`${graph.questId}/${entry.kind}/${entry.lineId}: unapproved above-level word ${word}`);
        for (const word of adjusted.unmappedWords) errors.push(`${graph.questId}/${entry.kind}/${entry.lineId}: unresolved word ${word}`);
        for (const flag of adjusted.advancedGrammar) errors.push(`${graph.questId}/${entry.kind}/${entry.lineId}: advanced grammar ${flag}`);
        if (adjusted.longSentences || adjusted.overlongTurn) errors.push(`${graph.questId}/${entry.kind}/${entry.lineId}: exceeds the 16-word Act I turn limit`);
      }
    }
  }
  return {
    entries, introductions,
    rawSummary: summarizeInput(entries),
    adjustedSummary: summarizeInput(entries, true),
    actOneGate: { maxNewStoryWordsPerQuest: 2, maxUnapprovedAboveLevelWords: 0, maxUnresolvedWords: 0, maxAdvancedGrammarFlags: 0, maxWordsPerTurn: 16, checkedEntries: entries.filter(entry => entry.level === 'A1').length, passed: errors.length === 0, violations: errors },
  };
}
