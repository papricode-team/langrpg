import authoredGraphs from './data/dialogue-graphs.json';
import type { QuestGraph } from './dialogue';

export const questGraphs = authoredGraphs as (QuestGraph & { gatePrompt: string })[];
export const questGraph = (questId: string) => questGraphs.find(graph => graph.questId === questId);
export const gateExerciseIds = Object.fromEntries(questGraphs.map(graph => [graph.questId, graph.gateExerciseId]));
