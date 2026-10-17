import { quests } from './content';
import type { Progress } from './api';

/** Start new stories on the train; saves already in town keep their place. */
export function shouldStartPrologue(progress: Pick<Progress, 'completedQuestIds' | 'story'>): boolean {
  if (storyQuestComplete(progress.completedQuestIds, 'a0-morgen')) return false;
  if (progress.story?.flags['cinematic:arrival']) return false;
  return !quests.some(quest => quest.level !== 'A0' && (
    progress.completedQuestIds.includes(quest.id) ||
    !!progress.story?.nodes[quest.id] ||
    !!progress.story?.choices[quest.id] ||
    !!progress.story?.inspections[quest.id]?.length
  ));
}

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
