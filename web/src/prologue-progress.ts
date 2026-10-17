import { quests } from './content';

/** Authored world names stay stable while authenticated content uses public UUIDs. */
export function storyQuestId(worldId: string): string {
  return quests.find(quest => (quest.worldId ?? quest.id) === worldId)?.id ?? worldId;
}
export function storyQuestComplete(completed: readonly string[], worldId: string): boolean {
  return completed.includes(storyQuestId(worldId));
}
/**
 * The first unfinished prologue beat, or `done` once the train has arrived. Browser builds replace quest-id
 * literals with content UUIDs, so code compares against the quest id while authored room data keys on the world id.
 */
export function currentPrologueQuest(completed: readonly string[]): string {
  return quests.find(quest => quest.level === 'A0' && !completed.includes(quest.id))?.id ?? 'done';
}
export function currentPrologueBeat(completed: readonly string[]): string {
  const next = quests.find(quest => quest.level === 'A0' && !completed.includes(quest.id));
  return next ? next.worldId ?? next.id : 'done';
}
