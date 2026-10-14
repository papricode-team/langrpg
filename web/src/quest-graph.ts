import type { QuestGraph } from './dialogue';

/** Graph structure is fetched when approaching a witness; line text is fetched separately. */
export const questGraphs: QuestGraph[] = [];
export const questGraph = (questId: string) => questGraphs.find(graph => graph.questId === questId);
export const gateExerciseIds: Record<string,string> = {};
export function installQuestGraph(graph:QuestGraph):QuestGraph {
  const index=questGraphs.findIndex(item=>item.questId===graph.questId);
  if(index<0)questGraphs.push(graph);else questGraphs[index]=graph;
  gateExerciseIds[graph.questId]=graph.gateExerciseId;
  return graph;
}
export function clearQuestGraphs():void {questGraphs.splice(0);for(const key of Object.keys(gateExerciseIds))delete gateExerciseIds[key];}
