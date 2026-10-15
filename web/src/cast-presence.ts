import type { WorldStoryState } from './world-state';

const done = (state: Pick<WorldStoryState, 'completedQuestIds'>, id: string) => state.completedQuestIds.includes(id);

/**
 * Who is in town, and when. The core cast travels with the story; the people
 * of each town appear once the story has met them, and leave when it says so.
 */
export function castPresent(id: string, mapId: string, state: Pick<WorldStoryState, 'completedQuestIds' | 'flags'>): boolean {
  const flags = state.flags ?? {};
  switch (id) {
    case 'elise': return done(state, 'b1-storm');
    case 'kessler': return mapId === 'lindenhafen' ? done(state, 'a1-timetable') : done(state, 'a2-archive');
    case 'pip': return mapId === 'lindenhafen' ? done(state, 'a1-market') : done(state, 'b1-storm');
    case 'berg': return done(state, 'a1-directions');
    case 'hilde': return done(state, 'a2-apartment');
    case 'falk': return mapId === 'waldruh' ? done(state, 'a2-evening-plans') && !done(state, 'a2-cellar') : !!flags['falk-witness'] && done(state, 'a2-archive');
    case 'jakob': return mapId === 'waldruh' ? done(state, 'a2-apartment') : done(state, 'b1-storm');
    case 'ruth': return !flags['ruth-lost'] && (mapId === 'waldruh' ? done(state, 'a2-apartment') : done(state, 'b1-storm'));
    case 'jonas': return done(state, 'a2-archive');
    default: return true;
  }
}
