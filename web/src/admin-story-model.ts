/**
 * Data and rules behind the admin story editor: the story in play order, the
 * vocabulary each scene introduces, which earlier decision a line depends on,
 * and the language checks for a rewritten line. No DOM here.
 */
import {beginnerTurnWordLimits} from './dialogue';

export interface StoryWord { start: number; end: number; lexeme?: string; }
export interface StoryText { text: string; translations: Record<string, string>; words: StoryWord[]; }
export interface StoryTask { mode?: string; prompt: string; answer?: string; }
export type StoryCondition = Record<string, string | number | boolean>;
export type StoryEffect = Record<string, string | number | boolean>;
export interface StoryEdit extends StoryText { by: string; at: string; }
export interface StoryLine extends StoryText {
  id: string; speaker: string; addressedTo?: string; audio: boolean;
  hidden: boolean; hiddenBy?: string; hiddenAt?: string; locked?: string;
  condition?: StoryCondition; reply?: StoryTask; variants?: StoryText[]; edit?: StoryEdit;
}
export interface StoryChoice extends StoryText { id: string; next: string; effects: StoryEffect[]; condition?: StoryCondition; }
export type StoryBlockKind = 'intro' | 'gate' | 'choice' | 'complete' | 'topic';
export interface StoryBlock {
  id: string; kind: StoryBlockKind; label: string; next?: string; terminal?: boolean;
  question?: StoryText; condition?: StoryCondition; task?: StoryTask; choices?: StoryChoice[]; lines: StoryLine[];
}
export interface StoryScene {
  graphId: string; courseId: string; questId: string; questUuid: string; level: string;
  title: string; subtitle: string; npc: string; location: string; start: string;
  synopsis: StoryText[]; objectives: {text: string; stage: string}[]; blocks: StoryBlock[];
}
export interface StoryAct { courseId: string; number: string; title: string; level: string; mapId: string; premise: StoryText[]; goal: StoryText[]; cliffhanger: StoryText[]; }
export interface StoryChapter { courseId: string; level: string; title: string; description: string; color: string; }
export interface StoryCourse { id: string; title: string; target: string; supportLanguages: string[]; }
export interface StoryLexeme { lemma: string; level: string; meaning: string; pos?: string; }
export interface StoryListing {
  courses: StoryCourse[]; acts: StoryAct[]; chapters: StoryChapter[];
  npcs: Record<string, {name: string; role: string; color: string}>;
  lexemes: Record<string, StoryLexeme>; scenes: StoryScene[];
}

/** The pacing target: about ten new words per scene (docs/pacing.md). */
export const NEW_WORD_BUDGET = 10;
const levelRank: Record<string, number> = {A1: 0, A2: 1, B1: 2, B2: 3};
const sentenceLimit: Record<string, number> = {A1: 16, A2: 24, B1: 36};
const advancedForA1 = ['dass', 'obwohl', 'während', 'würde', 'würden', 'hätte', 'hätten'];

/** What players see for a line: the edit when there is one. */
export const shown = (line: StoryLine): StoryText => line.edit ?? line;
export const lineChanged = (line: StoryLine) => line.hidden || !!line.edit;
export const sceneChanges = (scene: StoryScene) => scene.blocks.reduce((sum, block) => sum + block.lines.filter(lineChanged).length, 0);
export const courseScenes = (listing: StoryListing, courseId: string) => listing.scenes.filter(scene => scene.courseId === courseId);

export function speakerName(listing: StoryListing, id: string): string {
  return listing.npcs[id]?.name ?? id.split(/[-_]/).map(part => part.charAt(0).toLocaleUpperCase('de') + part.slice(1)).join(' ');
}

/** Lines in reading order: the main path first, branches after the decision, questions last. */
export function readingOrder(scene: StoryScene): StoryBlock[] {
  const byId = new Map(scene.blocks.map(block => [block.id, block])), seen = new Set<string>(), order: StoryBlock[] = [];
  const visit = (id: string | undefined) => {
    const block = id ? byId.get(id) : undefined;
    if (!block || seen.has(block.id)) return;
    seen.add(block.id); order.push(block);
    for (const choice of block.choices ?? []) visit(choice.next);
    visit(block.next);
  };
  visit(scene.start || scene.blocks[0]?.id);
  for (const block of scene.blocks) if (!seen.has(block.id) && block.kind !== 'topic') { seen.add(block.id); order.push(block); }
  return [...order, ...scene.blocks.filter(block => !seen.has(block.id))];
}

/** A short, human name for a block, naming the choice that leads to a branch. */
export function blockTitle(scene: StoryScene, block: StoryBlock): string {
  if (block.kind === 'topic') return `Question: ${block.question?.text || 'optional'}`;
  if (block.kind === 'complete') {
    const choice = scene.blocks.flatMap(item => item.choices ?? []).find(item => item.next === block.id);
    if (choice) return `If the player says “${choice.text}”`;
    return block.terminal ? 'Ending' : 'After the decision';
  }
  return {intro: 'Greeting and story', gate: 'The task', choice: 'The decision'}[block.kind] ?? block.label;
}

// Vocabulary --------------------------------------------------------------------------------------

/** Every lexeme a scene puts in front of players, hidden lines excluded. */
export function sceneLexemes(scene: StoryScene, skipLine?: string): Set<string> {
  const ids = new Set<string>();
  const add = (text: StoryText | undefined) => { for (const word of text?.words ?? []) if (word.lexeme) ids.add(word.lexeme); };
  for (const block of scene.blocks) {
    add(block.question);
    for (const choice of block.choices ?? []) add(choice);
    for (const line of block.lines) if (!line.hidden && line.id !== skipLine) add(shown(line));
  }
  return ids;
}

/** Where each lexeme first appears, as an index into the course's scenes. */
export function firstAppearances(scenes: readonly StoryScene[], skipLine?: string): Map<string, number> {
  const first = new Map<string, number>();
  scenes.forEach((scene, index) => { for (const id of sceneLexemes(scene, skipLine)) if (!first.has(id)) first.set(id, index); });
  return first;
}

/** Every spelling the story already uses, so a rewrite only reports spellings it adds. */
export function storySpellings(scenes: readonly StoryScene[]): Set<string> {
  const spellings = new Set<string>();
  const add = (value: string | undefined) => { for (const word of value?.replace(/\{[^}]+\}/g, '').match(/\p{L}+/gu) ?? []) spellings.add(word.toLocaleLowerCase('de')); };
  for (const scene of scenes) for (const block of scene.blocks) {
    add(block.question?.text);
    for (const choice of block.choices ?? []) add(choice.text);
    for (const line of block.lines) { add(line.text); add(line.edit?.text); }
  }
  return spellings;
}

export function newWordsByScene(scenes: readonly StoryScene[]): string[][] {
  const result: string[][] = scenes.map(() => []);
  for (const [id, index] of firstAppearances(scenes)) result[index].push(id);
  return result;
}

export type WordStatus = 'known' | 'new' | 'earlier' | 'fresh' | 'unlisted';
export interface WordReport { start: number; end: number; surface: string; lexeme?: string; status: WordStatus; above: boolean; firstScene?: number; }

/**
 * How each word of a line sits in the story: already taught, new in this
 * scene, pulled forward from a later scene, new to the whole story, or not in
 * the course lexicon (names, or words the lexicon lacks).
 */
export function wordReport(text: StoryText, sceneIndex: number, level: string, first: Map<string, number>, lexemes: Record<string, StoryLexeme>): WordReport[] {
  return text.words.map(word => {
    const surface = text.text.slice(word.start, word.end), lexeme = word.lexeme ? lexemes[word.lexeme] : undefined;
    if (!word.lexeme) return {start: word.start, end: word.end, surface, status: 'unlisted', above: false};
    const firstScene = first.get(word.lexeme);
    const status: WordStatus = firstScene === undefined ? 'fresh' : firstScene < sceneIndex ? 'known' : firstScene === sceneIndex ? 'new' : 'earlier';
    return {start: word.start, end: word.end, surface, lexeme: word.lexeme, status, firstScene, above: !!lexeme && (levelRank[lexeme.level] ?? 0) > (levelRank[level] ?? 0)};
  });
}

export interface LineCheck { level: 'error' | 'warning' | 'note'; message: string; }

/** Language checks for a rewritten line. Only errors stop a save. */
export function checkLine(options: {
  text: string; original: StoryLine; scene: StoryScene; report: WordReport[]; translations: Record<string, string>;
  supportLanguages: string[]; newInScene: number; problems?: string[]; spellings?: Set<string>;
}): LineCheck[] {
  const {text, original, scene, report, translations} = options, checks: LineCheck[] = [];
  for (const problem of options.problems ?? []) checks.push({level: 'error', message: problem});
  if (!text.trim()) checks.push({level: 'error', message: 'Write the line, or hide it instead.'});
  if (text.length > 240) checks.push({level: 'error', message: 'Keep a line under 240 characters. Split longer speech over two lines.'});
  const words = (text.replace(/\{[^}]+\}/g, '').match(/\p{L}+/gu) ?? []).length;
  const turnLimit = scene.level === 'A1' ? beginnerTurnWordLimits[scene.questId] ?? 16 : undefined;
  if (turnLimit && words > turnLimit) checks.push({level: 'warning', message: `${words} words. Act I turns in this scene stay within ${turnLimit}.`});
  const longest = Math.max(0, ...text.split(/[.!?]+/).map(sentence => (sentence.match(/\p{L}+/gu) ?? []).length));
  const limit = sentenceLimit[scene.level];
  if (limit && longest > limit) checks.push({level: 'warning', message: `A sentence has ${longest} words; ${scene.level} sentences stay within ${limit}.`});
  if (scene.level === 'A1') {
    const advanced = advancedForA1.filter(form => new RegExp(`(^|[^\\p{L}])${form}([^\\p{L}]|$)`, 'iu').test(text));
    if (advanced.length) checks.push({level: 'warning', message: `${advanced.join(', ')} is past A1 grammar.`});
  }
  const above = [...new Set(report.filter(word => word.above).map(word => word.surface))];
  if (above.length) checks.push({level: 'warning', message: `Above ${scene.level}: ${above.join(', ')}.`});
  const added = new Set(report.filter(word => word.status === 'fresh' || word.status === 'earlier').map(word => word.lexeme)).size;
  if (added && options.newInScene + added > NEW_WORD_BUDGET) checks.push({level: 'warning', message: `This scene would introduce ${options.newInScene + added} new words; the pace is about ${NEW_WORD_BUDGET}.`});
  const unlisted = [...new Set(report.filter(word => word.status === 'unlisted' && !options.spellings?.has(word.surface.toLocaleLowerCase('de'))).map(word => word.surface))];
  if (unlisted.length) checks.push({level: 'note', message: `New to the story and not in the lexicon: ${unlisted.join(', ')}. Names are fine; check the spelling of anything else.`});
  const changedText = text.trim() !== original.text;
  if (changedText) {
    for (const lang of options.supportLanguages) {
      if ((translations[lang] ?? '').trim() === (original.translations[lang] ?? '').trim()) checks.push({level: 'warning', message: `The ${languageName(lang)} translation still matches the old line.`});
      if (!(translations[lang] ?? '').trim()) checks.push({level: 'warning', message: `Players reading in ${languageName(lang)} get no translation.`});
    }
    if (original.audio) checks.push({level: 'note', message: 'Players will not hear the recorded voice for this line until it is re-recorded.'});
    if (original.variants?.length) checks.push({level: 'note', message: 'The simpler version of this line is dropped while it is edited.'});
    checks.push({level: 'note', message: 'Word-by-word translation highlights are off for an edited line.'});
  }
  return checks;
}

export function languageName(lang: string): string {
  return {en: 'English', tr: 'Turkish', de: 'German'}[lang] ?? lang.toUpperCase();
}

// Branches ------------------------------------------------------------------------------------------

export interface FlagSource { sceneIndex: number; graphId: string; choiceId: string; choice: string; }

/** Which decision sets each flag or gives each item. */
export function flagSources(scenes: readonly StoryScene[]): Map<string, FlagSource[]> {
  const sources = new Map<string, FlagSource[]>();
  scenes.forEach((scene, sceneIndex) => {
    for (const block of scene.blocks) for (const choice of block.choices ?? []) for (const effect of choice.effects) {
      for (const key of ['flag', 'item'] as const) {
        const value = effect[key];
        if (typeof value !== 'string') continue;
        const id = `${key}:${value}`, list = sources.get(id) ?? [];
        list.push({sceneIndex, graphId: scene.graphId, choiceId: choice.id, choice: choice.text});
        sources.set(id, list);
      }
    }
  });
  return sources;
}

const humanize = (value: string) => value.replace(/^(quest|item):/, '').replace(/[-_]/g, ' ');

/** Plain words for a line's condition, naming the decision it follows from. */
export function describeCondition(condition: StoryCondition, scenes: readonly StoryScene[], sources: Map<string, FlagSource[]>): string {
  const parts: string[] = [];
  const decision = (key: 'flag' | 'item', value: string, negate: boolean) => {
    if (key === 'flag' && value.startsWith('quest:')) {
      const quest = value.slice(6), index = scenes.findIndex(scene => scene.questId === quest || scene.questUuid === quest || `quest:${scene.questId}` === quest);
      const name = index >= 0 ? `scene ${index + 1}, “${scenes[index].title}”` : humanize(quest);
      return negate ? `before ${name} is finished` : `after ${name}`;
    }
    const from = sources.get(`${key}:${value}`)?.[0];
    if (from) return `${negate ? 'unless' : 'if'} the player said “${from.choice}” in scene ${from.sceneIndex + 1}`;
    return `${negate ? 'without' : 'with'} ${key === 'item' ? 'the item' : 'flag'} ${humanize(value)}`;
  };
  if (typeof condition.flag === 'string') parts.push(decision('flag', condition.flag, false));
  if (typeof condition.withoutFlag === 'string') parts.push(decision('flag', condition.withoutFlag, true));
  if (typeof condition.item === 'string') parts.push(decision('item', condition.item, false));
  if (typeof condition.missingItem === 'string') parts.push(decision('item', condition.missingItem, true));
  if (typeof condition.ending === 'string') parts.push(`in the “${humanize(condition.ending)}” ending`);
  for (const [key, value] of Object.entries(condition)) if (!['flag', 'withoutFlag', 'item', 'missingItem', 'ending'].includes(key)) parts.push(`${key} ${String(value)}`);
  const text = parts.join(' and ');
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

export function describeEffect(effect: StoryEffect): string {
  if (typeof effect.faction === 'string') {
    const amount = Number(effect.amount ?? 0);
    return `${amount >= 0 ? '+' : '−'}${Math.abs(amount)} ${humanize(effect.faction).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`;
  }
  if (typeof effect.flag === 'string') return `sets ${humanize(effect.flag)}`;
  if (typeof effect.item === 'string') return `gives ${humanize(effect.item)}`;
  if (effect.bell !== undefined) return `rings the bell ${effect.bell}×`;
  return Object.entries(effect).map(([key, value]) => `${key} ${String(value)}`).join(', ');
}

/** Picked choices of a playthrough the editor follows, keyed by scene graph. */
export type StoryPath = Record<string, string>;
export type PathVerdict = 'met' | 'unmet' | 'open';

/**
 * Whether a condition holds on the followed playthrough at a scene. A flag is
 * open until the decision that sets it has a pick, so nothing is hidden by a
 * decision the editor has not made yet.
 */
export function conditionOnPath(condition: StoryCondition | undefined, sceneIndex: number, scenes: readonly StoryScene[], path: StoryPath, sources: Map<string, FlagSource[]>): PathVerdict {
  if (!condition) return 'met';
  const verdicts: PathVerdict[] = [];
  const check = (key: 'flag' | 'item', value: string, negate: boolean) => {
    if (key === 'flag' && value.startsWith('quest:')) {
      const quest = value.slice(6), index = scenes.findIndex(scene => scene.questId === quest || scene.questUuid === quest || `quest:${scene.questId}` === quest);
      if (index < 0) return 'open';
      return (index < sceneIndex) !== negate ? 'met' : 'unmet';
    }
    const from = (sources.get(`${key}:${value}`) ?? []).filter(source => source.sceneIndex < sceneIndex || (source.sceneIndex === sceneIndex));
    if (!from.length) return 'open';
    if (from.some(source => !path[source.graphId])) return 'open';
    const set = from.some(source => path[source.graphId] === source.choiceId);
    return set !== negate ? 'met' : 'unmet';
  };
  if (typeof condition.flag === 'string') verdicts.push(check('flag', condition.flag, false));
  if (typeof condition.withoutFlag === 'string') verdicts.push(check('flag', condition.withoutFlag, true));
  if (typeof condition.item === 'string') verdicts.push(check('item', condition.item, false));
  if (typeof condition.missingItem === 'string') verdicts.push(check('item', condition.missingItem, true));
  if (verdicts.includes('unmet')) return 'unmet';
  return verdicts.includes('open') || !verdicts.length ? 'open' : 'met';
}

// Search --------------------------------------------------------------------------------------------

export interface StoryHit { sceneIndex: number; lineId?: string; blockId: string; speaker: string; text: string; translation: string; }

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').toLocaleLowerCase('de');

/** Finds lines, choices and questions by either language or speaker name. */
export function searchStory(listing: StoryListing, scenes: readonly StoryScene[], query: string, limit = 80): StoryHit[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: StoryHit[] = [];
  const matches = (...values: string[]) => { const haystack = fold(values.join(' ')); return terms.every(term => haystack.includes(term)); };
  scenes.forEach((scene, sceneIndex) => {
    for (const block of scene.blocks) {
      if (block.question && matches(block.question.text, ...Object.values(block.question.translations))) hits.push({sceneIndex, blockId: block.id, speaker: 'Question', text: block.question.text, translation: block.question.translations.en ?? ''});
      for (const choice of block.choices ?? []) if (matches(choice.text, ...Object.values(choice.translations), 'player')) hits.push({sceneIndex, blockId: block.id, speaker: 'Player', text: choice.text, translation: choice.translations.en ?? ''});
      for (const line of block.lines) {
        const text = shown(line), speaker = speakerName(listing, line.speaker);
        if (matches(text.text, ...Object.values(text.translations), line.text, speaker)) hits.push({sceneIndex, lineId: line.id, blockId: block.id, speaker, text: text.text, translation: text.translations.en ?? ''});
      }
    }
  });
  return hits.slice(0, limit);
}
