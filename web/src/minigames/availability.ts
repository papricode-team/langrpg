import { isWordGame } from './word-game-mechanics';
import { mechanicPool, minimumPool, needsSound } from './game-pools';
import type { CourseLevel } from '../api';
import type { GameItem, MiniGameDefinition, PoolQuery } from './types';

/**
 * Whether a lantern round can open right now, and which characters offer it.
 * The menus, the town's characters and story beats all ask here, so a game is
 * only offered when it will actually start.
 */

/** Characters who run a round when the conversation ends. Story rounds stay on their scene's character. */
export const miniGameHosts: Readonly<Record<string, readonly string[]>> = {
  marta: ['tray-rush', 'market-baskets', 'kettle-forecast'],
  elise: ['lantern-pairs', 're-ink'],
  ada: ['honest-mirror', 'adas-alphabet'],
  emil: ['scrambled-sign', 'workbench', 'lost-hour'],
  greta: ['falling-leaves', 'seed-packets'],
  lina: ['letter-loom', 'sorting-office', 'looping-tape'],
  jonas: ['lantern-fuse', 'hold-the-signal'],
  pip: ['fog-window', 'lamp-walk'],
  otto: ['night-train', 'departure-board', '17-59'],
  fritz: ['numbered-apples'],
  inspector: ['brass-stamp'],
};
export const lanternGameIds: ReadonlySet<string> = new Set(['lantern-lighting', 'word-chain', 'hold-the-signal']);
/** Rounds with their own start path: the street delivery and the expedition boards. */
const separatelyStarted: ReadonlySet<string> = new Set(['delivery-run', 'neighborhood-boards']);

export type MiniGameBlock = 'level' | 'story' | 'sound' | 'writing' | 'dusk' | 'words';
export interface ReadinessContext {
  level: CourseLevel;
  silent: boolean;
  writingReady: boolean;
  hour: number;
  /** The scene a story round belongs to at this level, if any. */
  sceneFor(definition: MiniGameDefinition, level: CourseLevel): string | undefined;
  sceneAvailable(questId: string): boolean;
  /** Restored-word pool; undefined while the course has not loaded, which skips the word check. */
  pool?(query: PoolQuery): GameItem[];
  fixedPool?(questId: string): readonly string[] | undefined;
}

const levels: readonly CourseLevel[] = ['A1', 'A2', 'B1'];
/** The highest of the game's levels the learner has reached. */
export function miniGameLevel(definition: Pick<MiniGameDefinition, 'levels'>, level: CourseLevel): CourseLevel | undefined {
  return definition.levels.filter(value => levels.indexOf(value) <= levels.indexOf(level)).at(-1);
}

export function miniGameBlock(definition: MiniGameDefinition, context: ReadinessContext): MiniGameBlock | undefined {
  const gameLevel = miniGameLevel(definition, context.level);
  if (!gameLevel) return 'level';
  const scene = context.sceneFor(definition, gameLevel);
  if (scene && !context.sceneAvailable(scene)) return 'story';
  if (needsSound(definition, context.silent)) return 'sound';
  // Letter tiles, grids and guessed letters need no typing, so they stay open before writing practice.
  if (definition.modalities.every(mode => mode === 'production') && !['anagram', 'loom', 'fuse'].includes(definition.mechanic) && !context.writingReady) return 'writing';
  if (lanternGameIds.has(definition.id) && context.hour >= 6 && context.hour < 18) return 'dusk';
  if (context.pool && !separatelyStarted.has(definition.id)) {
    const pool = mechanicPool(definition, context.pool, { level: gameLevel, silent: context.silent, fixedPool: scene ? context.fixedPool?.(scene) : undefined });
    if (pool.length < minimumPool(definition, context.silent)) return 'words';
  }
  return undefined;
}

export function miniGameBlockMessage(block: MiniGameBlock, definition: Pick<MiniGameDefinition, 'levels'>): string {
  switch (block) {
    case 'level': return `This lantern round belongs to ${definition.levels.join(' / ')}.`;
    case 'story': return 'Follow the story to this scene first.';
    case 'sound': return 'Turn off silent mode to hear this game.';
    case 'writing': return 'Writing games open after your first ten minutes of play.';
    case 'dusk': return 'The lantern games open at dusk, after 18:00.';
    case 'words': return 'Restore more words in the town to play this one.';
  }
}

/** Short label for a disabled menu button. */
export function miniGameBlockLabel(block: MiniGameBlock): string {
  return { level: 'Opens at a later level', story: 'Follow the story to this scene', sound: 'Needs sound', writing: 'Opens after ten minutes', dusk: 'Opens at dusk', words: 'Needs more restored words' }[block];
}

/** Games a character can start now, in their preferred order, rotated by day so regulars vary. */
export function hostedGames(npcId: string, definitions: ReadonlyMap<string, MiniGameDefinition>, context: ReadinessContext, day = 0): MiniGameDefinition[] {
  const ready = (miniGameHosts[npcId] ?? []).map(id => definitions.get(id)).filter((game): game is MiniGameDefinition => !!game && !miniGameBlock(game, context));
  if (ready.length < 2) return ready;
  const offset = day % ready.length;
  return [...ready.slice(offset), ...ready.slice(0, offset)];
}

/**
 * One round to suggest after a story beat: the scene character's game first,
 * then a word game that rotates by day, so the suggestion changes.
 */
export function suggestedGame(definitions: readonly MiniGameDefinition[], context: ReadinessContext, npcId?: string, day = 0): MiniGameDefinition | undefined {
  const byId = new Map(definitions.map(game => [game.id, game]));
  const hosted = npcId ? hostedGames(npcId, byId, context, day) : [];
  if (hosted[0]) return hosted[0];
  const words = definitions.filter(game => isWordGame(game) && !miniGameBlock(game, context));
  return words.length ? words[day % words.length] : undefined;
}
