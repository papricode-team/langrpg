import { minigameBackdrops } from './item-manifest';
import type { GameMechanic } from './types';

/** All catalogue mechanics share the same painted Lindenhafen stage vocabulary. */
export const mechanicStages = {
  ink: 'archive', pictures: 'workshop', tray: 'market', catch: 'market', board: 'station',
  stamp: 'council', sort: 'archive', chain: 'workshop', workbench: 'workshop', forecast: 'market',
  garden: 'garden', sequence: 'clock', connection: 'station', tape: 'listening', council: 'council',
  archive: 'archive', neighborhood: 'council', delivery: 'station', pairs: 'archive', mirror: 'archive',
  anagram: 'workshop', baskets: 'market', leaves: 'garden', loom: 'archive', fuse: 'workshop',
  fog: 'station', bells: 'listening', train: 'station',
} as const satisfies Record<GameMechanic, keyof typeof minigameBackdrops>;

export function minigameBackdrop(mechanic: GameMechanic): string {
  return minigameBackdrops[mechanicStages[mechanic]];
}
