import { quests } from './content';
import type { MapId } from './maps';
import type { Progress } from './api';
import { t } from './i18n.ts';

/** Existing discoveries keep previously visited story towns accessible. */
export function routeUnlocked(mapId: MapId, completedQuestIds: readonly string[]): boolean {
  if (mapId === 'lindenhafen') return true;
  if (mapId === 'waldruh' || mapId === 'nebelstadt') {
    const milestone = mapId === 'waldruh' ? lastQuestOf('A1') : lastQuestOf('A2');
    const levels = mapId === 'waldruh' ? ['A2', 'B1'] : ['B1'];
    return completedQuestIds.includes(milestone) || quests.some(q => levels.includes(q.level) && completedQuestIds.includes(q.id));
  }
  return completedQuestIds.includes('b1-atlas');
}

export function routeLockReason(mapId: MapId, completedQuestIds: readonly string[]): string {
  if (routeUnlocked(mapId, completedQuestIds)) return '';
  if (mapId === 'waldruh') return t("Find Lina's letter and restore the name Waldruh first.");
  if (mapId === 'nebelstadt') return t("Obtain Ada's confession in Waldruh first.");
  return t('Restore the three towns before exploring the coastline.');
}

/** The final scene of a level's act; finishing it opens the next town. */
export function lastQuestOf(level: 'A1' | 'A2' | 'B1'): string {
  return quests.filter(q => q.level === level).at(-1)?.id ?? '';
}

/** Everyday scenes inserted into Act I after adventures had already begun (mirrors server/progression.go). */
export const everydayQuestIds: ReadonlySet<string> = new Set(['a1-timetable', 'a1-notice', 'a1-room', 'a1-shopping', 'a1-chalk', 'a1-neighbour', 'a1-pharmacy', 'a1-directions', 'a1-bench', 'a1-weather', 'a1-bike', 'a1-phone', 'a1-office-window', 'a1-invitation', 'a1-lost-found', 'a1-departure', 'a2-upstairs', 'a2-ink-seller', 'a2-forest-rails', 'a2-cellar', 'b1-record-room', 'b1-signalman', 'b1-temptation']);

/** The chain is linear. An inserted scene before the furthest completed one counts as
 * passed, so new scenes never lock an existing adventure; original scenes always count. */
export function questUnlocked(questId: string, completedQuestIds: readonly string[]): boolean {
  if (completedQuestIds.includes(questId)) return true;
  const index = quests.findIndex(q => q.id === questId);
  if (index < 0) return false;
  if (quests[index].level === 'A0') return quests.slice(0, index).filter(q => q.level === 'A0').every(q => completedQuestIds.includes(q.id));
  const furthest = quests.reduce((max, q, i) => completedQuestIds.includes(q.id) ? i : max, -1);
  return quests.slice(0, index).every((q, i) => q.level === 'A0' || completedQuestIds.includes(q.id) || (everydayQuestIds.has(q.id) && i < furthest));
}

/** Story access follows the clue chain independently of optional vocabulary pacing. */
export function questAvailable(questId: string, progress: Pick<Progress, 'completedQuestIds'>): boolean {
  return questUnlocked(questId, progress.completedQuestIds);
}
export function questLockReason(questId: string, progress: Pick<Progress, 'completedQuestIds'>): string {
  if (!questUnlocked(questId, progress.completedQuestIds)) return t('Follow the current witness before beginning this investigation.');
  return '';
}

export function firstAvailableMap(savedMapId: MapId, completedQuestIds: readonly string[]): MapId {
  return routeUnlocked(savedMapId, completedQuestIds) ? savedMapId : 'lindenhafen';
}
