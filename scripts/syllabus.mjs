import { createHash } from 'node:crypto';
import { createLexemeMapper } from './course-word-mapping.mjs';
import { dialogueEntries } from './dialogue-level-audit.mjs';

/**
 * The vocabulary syllabus: one ordered list of lexeme IDs that the server
 * introduces at a bounded rate for optional practice. Story vocabulary guides
 * the introduction order and content audits without restricting story access.
 *
 * Numbers are the design target the team asked for: about ten new words per
 * hour of active play, two thousand words across two hundred hours.
 */
export const syllabusDefaults = Object.freeze({
  wordsPerHour: 10,
  /** Words available the moment an adventure begins, before the first hour accrues. */
  openingWords: 10,
  /** Unused intake never banks more than this many words; pacing stays per hour, not per binge. */
  bankCap: 15,
  /** Of every ten scheduled words, this many serve the earliest scene with unscheduled vocabulary; the rest are high-frequency core words. */
  storyShare: 8,
  /** Intake pauses while this many introduced words have never been recognised unaided, or this many practised words wait for review. */
  brake: Object.freeze({ maxUnsettled: 12, maxDue: 20 }),
});

const levelRank = { A1: 0, A2: 1, B1: 2 };
const normalize = word => word.normalize('NFC').toLowerCase();
const tokens = text => text.replace(/\{[^}]+\}/g, ' ').match(/\p{L}+/gu) ?? [];

/** Which lexemes each scene demands, plus the words it shows that no lexeme covers. */
export function questVocabularyDemand({ graphs, lexicon, questOrder = graphs.map(graph => graph.questId), properNames = [] }) {
  const mapper = createLexemeMapper(lexicon);
  const names = new Set(properNames.flatMap(tokens).map(normalize));
  const candidates = new Map();
  const index = (surface, id) => { if (!/^\p{L}+$/u.test(surface)) return; const key = normalize(surface), ids = candidates.get(key) ?? new Set(); ids.add(id); candidates.set(key, ids); };
  for (const word of lexicon) {
    index(word.lemma, word.id);
    if (word.pos !== 'pron') { if (word.plural) index(word.plural, word.id); for (const form of word.surfaceForms ?? []) index(form, word.id); }
    for (const alias of word.aliases ?? []) index(alias.form, word.id);
  }
  const demand = new Map();
  for (const questId of questOrder) {
    const graph = graphs.find(item => item.questId === questId);
    if (!graph) throw new Error(`No dialogue graph for ${questId}`);
    const storyWords = new Map(Object.entries(graph.introducedWords ?? {}).map(([surface, english]) => [normalize(surface), { german: surface, english }]));
    const wordIds = new Set(), unmapped = new Set(), ambiguous = new Set();
    for (const entry of dialogueEntries(graph)) {
      const named = new Set([...entry.german.matchAll(/\b(?:Frau|Herr)\s+(\p{Lu}\p{L}*)/gu)].map(match => normalize(match[1])));
      const skip = surface => { const key = normalize(surface); return names.has(key) || named.has(key) || storyWords.has(key) || /^\p{Lu}$/u.test(surface) || (key.endsWith('s') && names.has(key.slice(0, -1))); };
      // Story-only words (pigeons, lanterns) and names are glossed in the scene; they must not borrow an unrelated lexeme.
      const cleaned = entry.german.replace(/\{[^}]+\}/g, ' ').replace(/\p{L}+/gu, surface => skip(surface) ? ' '.repeat(surface.length) : surface);
      const mapped = mapper(cleaned);
      for (const id of mapped) wordIds.add(id);
      for (const surface of tokens(cleaned)) {
        const options = candidates.get(normalize(surface));
        if (!options) unmapped.add(surface);
        else if (![...options].some(id => mapped.includes(id))) ambiguous.add(surface);
      }
    }
    demand.set(questId, { questId, level: graph.level, wordIds: [...wordIds].sort(), storyWords: [...storyWords.values()], unmapped: [...unmapped].sort(), ambiguous: [...ambiguous].sort() });
  }
  return demand;
}

const byFrequency = (lexemeById) => (left, right) => {
  const a = lexemeById.get(left), b = lexemeById.get(right);
  return (a.frequencyRank ?? Infinity) - (b.frequencyRank ?? Infinity) || levelRank[a.level] - levelRank[b.level] || a.lemma.localeCompare(b.lemma, 'de') || left.localeCompare(right);
};
const byLevelThenFrequency = (lexemeById) => (left, right) => {
  const a = lexemeById.get(left), b = lexemeById.get(right);
  return levelRank[a.level] - levelRank[b.level] || (a.frequencyRank ?? Infinity) - (b.frequencyRank ?? Infinity) || a.lemma.localeCompare(b.lemma, 'de') || left.localeCompare(right);
};

/**
 * Deterministic story-first ordering. Each block of `wordsPerHour` words takes
 * up to `storyShare` words from the earliest conversation that still has
 * unscheduled vocabulary (most frequent first), then fills with the most
 * frequent unscheduled core words level by level. Every lexeme is scheduled.
 */
export function buildSyllabus({ graphs, lexicon, questOrder = graphs.map(graph => graph.questId), properNames = [], edition = '', options = {} }) {
  const settings = { ...syllabusDefaults, ...options, brake: { ...syllabusDefaults.brake, ...(options.brake ?? {}) } };
  if (!(settings.wordsPerHour >= 1 && settings.openingWords >= 0 && settings.bankCap >= 1 && settings.storyShare >= 0 && settings.storyShare <= settings.wordsPerHour)) throw new Error('invalid syllabus options');
  const lexemeById = new Map(lexicon.map(word => [word.id, word]));
  if (lexemeById.size !== lexicon.length) throw new Error('lexicon contains duplicate ids');
  const demand = questVocabularyDemand({ graphs, lexicon, questOrder, properNames });
  const storyQueues = questOrder.map(questId => ({ questId, pending: [...demand.get(questId).wordIds].sort(byFrequency(lexemeById)), cursor: 0 }));
  const core = lexicon.map(word => word.id).sort(byLevelThenFrequency(lexemeById));
  const scheduled = new Set(), wordIds = [];
  let coreCursor = 0;
  const take = id => { if (scheduled.has(id)) return false; scheduled.add(id); wordIds.push(id); return true; };
  while (scheduled.size < lexicon.length) {
    let placed = 0;
    while (placed < settings.storyShare) {
      const queue = storyQueues.find(item => { while (item.cursor < item.pending.length && scheduled.has(item.pending[item.cursor])) item.cursor++; return item.cursor < item.pending.length; });
      if (!queue) break;
      if (take(queue.pending[queue.cursor++])) placed++;
    }
    while (placed < settings.wordsPerHour && coreCursor < core.length) {
      if (take(core[coreCursor++])) placed++;
    }
    if (!placed) break;
  }
  const position = new Map(wordIds.map((id, index) => [id, index]));
  const quests = questOrder.map(questId => {
    const ids = [...demand.get(questId).wordIds].sort((a, b) => position.get(a) - position.get(b));
    return { questId, level: demand.get(questId).level, wordIds: ids, milestone: ids.length ? position.get(ids[ids.length - 1]) + 1 : 0 };
  });
  const digest = createHash('sha1').update(JSON.stringify([wordIds, quests.map(quest => quest.wordIds)])).digest('hex').slice(0, 10);
  return {
    version: `syllabus-${edition || 'course'}-${digest}`,
    wordsPerHour: settings.wordsPerHour,
    openingWords: settings.openingWords,
    bankCap: settings.bankCap,
    storyShare: settings.storyShare,
    brake: { maxUnsettled: settings.brake.maxUnsettled, maxDue: settings.brake.maxDue },
    wordIds,
    quests,
  };
}

/** Seconds of active play before a word at this syllabus position (0-based) can be introduced. */
export function secondsUntilPosition(syllabus, index) {
  const secondsPerWord = 3600 / syllabus.wordsPerHour;
  return Math.max(0, (index + 1 - syllabus.openingWords) * secondsPerWord);
}

/** The authored story measured against the intake budget: where every scene lands, in words and hours. */
export function pacingReport({ syllabus, lexicon, demand, questOrder = syllabus.quests.map(quest => quest.questId), hourTarget = 200 }) {
  const lexemeById = new Map(lexicon.map(word => [word.id, word]));
  const seen = new Set();
  const quests = questOrder.map(questId => {
    const quest = syllabus.quests.find(item => item.questId === questId), scene = demand.get(questId);
    const newWords = quest.wordIds.filter(id => !seen.has(id));
    for (const id of quest.wordIds) seen.add(id);
    const coverageSeconds = secondsUntilPosition(syllabus, quest.milestone - 1);
    return {
      questId, level: quest.level,
      lexemes: quest.wordIds.length, newLexemes: newWords.length,
      storyWords: scene.storyWords.map(word => word.german), unmapped: scene.unmapped, ambiguous: scene.ambiguous,
      milestone: quest.milestone,
      vocabularyReadyHour: Number((coverageSeconds / 3600).toFixed(2)),
      newWordsAboveBudget: Math.max(0, newWords.length + scene.storyWords.length + scene.unmapped.length - syllabus.wordsPerHour),
      levels: Object.fromEntries(['A1', 'A2', 'B1'].map(level => [level, quest.wordIds.filter(id => lexemeById.get(id).level === level).length])),
    };
  });
  const storyHours = quests.length ? Math.max(...quests.map(quest => quest.vocabularyReadyHour)) : 0;
  const wordsAtTarget = Math.min(syllabus.wordIds.length, syllabus.openingWords + hourTarget * syllabus.wordsPerHour);
  const levelsAtTarget = Object.fromEntries(['A1', 'A2', 'B1'].map(level => [level, syllabus.wordIds.slice(0, wordsAtTarget).filter(id => lexemeById.get(id).level === level).length]));
  return {
    budget: { wordsPerHour: syllabus.wordsPerHour, openingWords: syllabus.openingWords, bankCap: syllabus.bankCap, storyShare: syllabus.storyShare, brake: syllabus.brake },
    totals: { lexemes: syllabus.wordIds.length, hoursForWholeLexicon: Number((secondsUntilPosition(syllabus, syllabus.wordIds.length - 1) / 3600).toFixed(1)), hourTarget, wordsAtTarget, levelsAtTarget, storyLexemes: seen.size, storyVocabularyReadyByHour: storyHours },
    quests,
  };
}

/** Shipping budgets for the supported opening; optional topics remain in these totals. */
export function openingPacingViolations(report) {
  const violations = [];
  for (const quest of report.quests.filter(quest => quest.level === 'A0')) {
    if (quest.newWordsAboveBudget !== 0) violations.push(`${quest.questId}: ${quest.newWordsAboveBudget} words above the intake budget`);
  }
  const morning = report.quests.find(quest => quest.questId === 'a0-morgen');
  if (!morning || morning.vocabularyReadyHour >= 3) violations.push('a0-morgen: vocabulary must be ready before hour 3');
  const arrival = report.quests.find(quest => quest.questId === 'a1-arrival');
  if (!arrival || arrival.lexemes > 40 || arrival.newWordsAboveBudget > 10) violations.push('a1-arrival: at most 40 lexemes and 10 above budget, including optional topics');
  return violations;
}
