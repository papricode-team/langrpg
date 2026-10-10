import { quests } from './content';
import type { MapId } from './maps';

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
  if (mapId === 'waldruh') return "Find Lina's letter and restore the name Waldruh first.";
  if (mapId === 'nebelstadt') return "Obtain Ada's confession in Waldruh first.";
  return 'Restore the three towns before exploring the coastline.';
}

export function questUnlocked(questId: string, completedQuestIds: readonly string[]): boolean {
  if (completedQuestIds.includes(questId)) return true;
  const index = quests.findIndex(q => q.id === questId);
  return index >= 0 && quests.slice(0, index).every(q => completedQuestIds.includes(q.id));
}

export function firstAvailableMap(savedMapId: MapId, completedQuestIds: readonly string[]): MapId {
  return routeUnlocked(savedMapId, completedQuestIds) ? savedMapId : 'lindenhafen';
}
