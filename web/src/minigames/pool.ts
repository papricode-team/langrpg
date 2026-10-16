import type { Progress } from '../api';
import type { CourseLexeme } from '../course';
import { introducedWords } from '../intake';
import { seededShuffle } from '../game-shuffle';
import { itemSpriteFor } from './item-manifest';
import type { GameItem, PoolQuery } from './types';

const levels = ['A1','A2','B1'];
/** Intake is the sole source of permission. Exposure never makes a word eligible. */
export function gameItemPool(lexicon: readonly CourseLexeme[], progress: Progress, query: PoolQuery, now = Date.now()): GameItem[] {
  const restored = introducedWords(progress), fixed = query.fixedPool && new Set(query.fixedPool);
  const items = lexicon.filter(word => restored.has(word.id) && (!fixed || fixed.has(word.id))
    && (!query.topics?.length || query.topics.includes(word.topic))
    && (!query.level || levels.indexOf(word.level) <= levels.indexOf(query.level))
    && (!query.nouns || word.pos === 'noun') && (!query.sprites || !!itemSpriteFor(word.id))).map(word => {
    const memory = progress.words[word.id], item = progress.items[`word-${word.id}`];
    const modalities = ['recognition','listening','production'] as const;
    const evidence = (mode: typeof modalities[number]) => memory?.evidence?.[mode];
    const stats = (mode: typeof modalities[number]) => evidence(mode) ?? memory?.modeStats?.[mode] ?? item?.modeStats?.[mode];
    const due = (mode: typeof modalities[number]) => {
      const date = Date.parse(evidence(mode)?.dueAt ?? '');
      return (stats(mode)?.attempts ?? 0) > 0 && Number.isFinite(date) && date > 0 && date <= now;
    };
    return {
      lexemeId: word.id, lemma: word.lemma, article: word.article, articleForm:word.articleForm, plural: word.plural,
      english: word.english, topic: word.topic, level: word.level, pos: word.pos,
      surfaceForms:word.surfaceForms,
      sprite: itemSpriteFor(word.id), audio: `/audio/word-${word.id}.ogg`,
      exerciseIds: Object.fromEntries(modalities.map(mode => [mode, `lex-${word.id}-${mode}`])) as GameItem['exerciseIds'],
      stability: evidence(query.modality)?.stabilityDays ?? 0,
      stabilityByMode: Object.fromEntries(modalities.map(mode => [mode, evidence(mode)?.stabilityDays ?? 0])) as GameItem['stabilityByMode'],
      due: Object.fromEntries(modalities.map(mode => [mode, due(mode)])) as GameItem['due'],
      seen: Object.fromEntries(modalities.map(mode => [mode, (stats(mode)?.attempts ?? 0) > 0])) as GameItem['seen'],
      recalls: Object.fromEntries(modalities.map(mode => [mode, stats(mode)?.unaidedSuccesses ?? 0])) as GameItem['recalls'],
    } satisfies GameItem;
  });
  const rank = (item: GameItem) => item.due[query.modality] ? 0 : !item.seen[query.modality] ? 1 : 2;
  return seededShuffle(items, String(query.seed ?? 1)).sort((a,b) => rank(a)-rank(b) || a.stability-b.stability).slice(0,Math.max(0, query.limit ?? items.length));
}

export function distractors(target: GameItem, pool: readonly GameItem[], seed: number, count: number): GameItem[] {
  const others = seededShuffle(pool.filter(item => item.lexemeId !== target.lexemeId && item.lemma !== target.lemma), String(seed))
    .sort((a,b) => Number(b.topic === target.topic)-Number(a.topic === target.topic) || Number(!!target.article && b.article === target.article)-Number(!!target.article && a.article === target.article));
  return seededShuffle([target,...others.slice(0,Math.max(0,count-1))], String(seed+17));
}
