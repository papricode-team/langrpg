import type { GameMechanic, MiniGameDefinition } from './types';
/** The word-memory games share one module; the loader and menus only need to recognise them. */
export const wordGameMechanics: ReadonlySet<GameMechanic> = new Set<GameMechanic>(['pairs','mirror','anagram','baskets','leaves','loom','fuse','fog','bells','train']);
export const isWordGame = (definition?: Pick<MiniGameDefinition,'mechanic'>) => !!definition && wordGameMechanics.has(definition.mechanic);
