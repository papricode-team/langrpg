import type { Level } from './content';

export type StoryStage = 'intro' | 'gate' | 'choice' | 'complete';
export type Faction = 'brassOffice' | 'lamplighters' | 'unwritten';
export interface StoryState {
  flags: Record<string, boolean>;
  inventory: string[];
  reputation: Record<Faction, number>;
  bell: number;
  bellWarnings?: number;
  nodes: Record<string, StoryStage>;
  choices: Record<string, string>;
  inspections: Record<string, string[]>;
  day: number;
  lanternStreak?: number;
  promise?: { day: number; title: string; target: number; correctAnswers: number; completed: boolean };
  expeditions?: Record<string, { selected: number; correct: boolean; attempts: number }>;
  expeditionPlans?: Record<string, { level: Level; values: Record<string, number>; order: string[]; completed: boolean; attempts: number }>;
  ending?: string;
}
export interface DialogueCondition { flag?: string; withoutFlag?: string; item?: string; missingItem?: string; faction?: Faction; minimum?: number; ending?: string; }
export interface DialogueEffect { flag?: string; item?: string; faction?: Faction; amount?: number; bell?: number; }
export interface DialogueLine {
  id: string;
  speaker: string;
  german: string;
  english: string;
  clipId: string;
  condition?: DialogueCondition;
  glosses?: Record<string, string>;
  variants?: { german: string; english: string; clipId: string }[];
  reply?: { exerciseId: string; correction: DialogueLine };
}
export interface DialogueChoice { id: string; german: string; english: string; next: string; effects: DialogueEffect[]; condition?: DialogueCondition; }
export interface DialogueNode { id: string; stage: StoryStage; lines: DialogueLine[]; next?: string; choices?: DialogueChoice[]; gateExerciseId?: string; terminal?: boolean; }
export interface QuestGraph {
  questId: string; level: Level; start: string; gateExerciseId: string; evidenceItem: string;
  gatePrompt: string;
  investigations: { objectId: string; german: string; english: string }[];
  objectives: { text: string; location: string; stage: StoryStage }[];
  nodes: DialogueNode[];
  introducedWords?: Record<string, string>;
}
export const emptyStory = (): StoryState => ({ flags: {}, inventory: [], reputation: { brassOffice: 0, lamplighters: 0, unwritten: 0 }, bell: 0, day: 1, nodes: {}, choices: {}, inspections: {} });
export function storyState(value?: Partial<StoryState>): StoryState {
  const empty = emptyStory();
  return { ...empty, ...value, flags: { ...empty.flags, ...value?.flags }, inventory: value?.inventory ?? [], reputation: { ...empty.reputation, ...value?.reputation }, nodes: value?.nodes ?? {}, choices: value?.choices ?? {}, inspections: value?.inspections ?? {} };
}
export function conditionMet(condition: DialogueCondition | undefined, state: StoryState): boolean {
  if (!condition) return true;
  return (!condition.flag || state.flags[condition.flag] === true)
    && (!condition.withoutFlag || !state.flags[condition.withoutFlag])
    && (!condition.item || state.inventory.includes(condition.item))
    && (!condition.missingItem || !state.inventory.includes(condition.missingItem))
    && (!condition.ending || state.ending === condition.ending)
    && (!condition.faction || state.reputation[condition.faction] >= (condition.minimum ?? 0));
}
export function dialogueLines(node: DialogueNode, state: StoryState): DialogueLine[] { return node.lines.filter(line => conditionMet(line.condition, state)); }
export function dialogueChoices(node: DialogueNode, state: StoryState): DialogueChoice[] { return (node.choices ?? []).filter(choice => conditionMet(choice.condition, state)); }
export function personalized(line: string, name: string): string { return line.replaceAll('{name}', name); }
export function nodeForStage(graph: QuestGraph, stage: StoryStage): DialogueNode {
  return graph.nodes.find(node => node.id === stage) ?? graph.nodes.find(node => node.stage === stage)!;
}
/** Validate authored links, evidence, stages and reachability before a scene ships. */
export function validateDialogue(graph: QuestGraph): string[] {
  const errors: string[] = [], nodes = new Map(graph.nodes.map(node => [node.id, node]));
  if (nodes.size !== graph.nodes.length) errors.push(`${graph.questId}: duplicate node`);
  if (!nodes.has(graph.start)) errors.push(`${graph.questId}: missing start`);
  for (const stage of ['intro', 'gate', 'choice', 'complete'] as const) if (!graph.nodes.some(node => node.stage === stage)) errors.push(`${graph.questId}: missing ${stage}`);
  const lineIds = new Set<string>();
  for (const node of graph.nodes) {
    for (const line of node.lines) {
      if (lineIds.has(line.id)) errors.push(`${graph.questId}: duplicate line ${line.id}`);
      lineIds.add(line.id);
      if (!line.german.trim() || !line.english.trim() || !line.clipId) errors.push(`${graph.questId}: empty line ${line.id}`);
      if (line.reply && (!line.reply.exerciseId || !line.reply.correction.german.trim() || !line.reply.correction.english.trim() || !line.reply.correction.clipId)) errors.push(`${graph.questId}: incomplete comprehension reply ${line.id}`);
      if (graph.level === 'A1' && line.german.split(/\s+/).length > 16) errors.push(`${graph.questId}: A1 line too long ${line.id}`);
      for (const variant of line.variants ?? []) {
        if (!variant.german.trim() || !variant.english.trim() || !variant.clipId) errors.push(`${graph.questId}: empty variant ${line.id}`);
        if (graph.level === 'A1' && variant.german.split(/\s+/).length > 16) errors.push(`${graph.questId}: A1 variant too long ${line.id}`);
      }
    }
    const destinations = [...(node.next ? [node.next] : []), ...(node.choices ?? []).map(choice => choice.next)];
    for (const destination of destinations) if (!nodes.has(destination)) errors.push(`${graph.questId}: broken link ${node.id} → ${destination}`);
    if (!node.terminal && !destinations.length) errors.push(`${graph.questId}: dead end ${node.id}`);
    if (new Set((node.choices ?? []).map(choice => choice.id)).size !== (node.choices?.length ?? 0)) errors.push(`${graph.questId}: duplicate choice ${node.id}`);
  }
  const visited = new Set<string>();
  const visit = (id: string) => { if (visited.has(id)) return; visited.add(id); const node = nodes.get(id); if (node?.next) visit(node.next); node?.choices?.forEach(choice => visit(choice.next)); };
  visit(graph.start);
  for (const id of nodes.keys()) if (!visited.has(id)) errors.push(`${graph.questId}: unreachable ${id}`);
  if (!graph.nodes.some(node => node.gateExerciseId === graph.gateExerciseId)) errors.push(`${graph.questId}: missing production gate`);
  return errors;
}
