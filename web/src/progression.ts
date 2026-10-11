import { quests } from './content';
import type { MapId } from './maps';
import type { Progress } from './api';
import { missingQuestWords } from './intake.ts'; // explicit extension: Node tooling also loads this module without a resolver
import { t } from './i18n.ts';

/** Existing discoveries keep previously visited story towns accessible. */
export function routeUnlocked(mapId: MapId, completedQuestIds: readonly string[]): boolean {
  if (mapId === 'lindenhafen') return true;
  if (mapId === 'waldruh' || mapId === 'nebelstadt') {
    const milestone = mapId === 'waldruh' ? 'a1-lost-parcel' : 'a2-archive';
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

export function questUnlocked(questId: string, completedQuestIds: readonly string[]): boolean {
  if (completedQuestIds.includes(questId)) return true;
  const index = quests.findIndex(q => q.id === questId);
  return index >= 0 && quests.slice(0, index).every(q => completedQuestIds.includes(q.id));
}

/** A conversation opens in clue order and only once the Atlas has restored every word it uses. */
export function questAvailable(questId: string, progress: Pick<Progress, 'completedQuestIds' | 'intake'>): boolean {
  return questUnlocked(questId, progress.completedQuestIds) && missingQuestWords(questId, progress).length === 0;
}
export function questLockReason(questId: string, progress: Pick<Progress, 'completedQuestIds' | 'intake'>): string {
  if (!questUnlocked(questId, progress.completedQuestIds)) return t('Follow the current witness before beginning this investigation.');
  const missing = missingQuestWords(questId, progress).length;
  if (!missing) return '';
  return missing === 1 ? t('The Atlas needs {count} more restored word before this conversation.', { count: missing }) : t('The Atlas needs {count} more restored words before this conversation.', { count: missing });
}

export function firstAvailableMap(savedMapId: MapId, completedQuestIds: readonly string[]): MapId {
  return routeUnlocked(savedMapId, completedQuestIds) ? savedMapId : 'lindenhafen';
}
