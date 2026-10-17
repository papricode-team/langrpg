import { quests } from './content';

/** Authored world names stay stable while authenticated content uses public UUIDs. */
export function storyQuestId(worldId: string): string {
  return quests.find(quest => (quest.worldId ?? quest.id) === worldId)?.id ?? worldId;
}
export function storyQuestComplete(completed: readonly string[], worldId: string): boolean {
  return completed.includes(storyQuestId(worldId));
}
