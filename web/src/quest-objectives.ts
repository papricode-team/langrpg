import type { Progress } from './api';
import type { QuestGraph } from './dialogue';
import { escapeHtml as e, icon } from './icons';

export function questObjectivesMarkup(graph: QuestGraph, progress: Progress): string {
  const stages=['intro','gate','choice','complete'];
  const stage=progress.story?.nodes[graph.questId]??'intro';
  const complete=progress.completedQuestIds.includes(graph.questId);
  const inspected=(progress.story?.inspections[graph.questId]??[]).length;
  return `<section class="story-objectives"><small class="eyebrow">YOUR INVESTIGATION · ${Math.min(inspected,graph.investigations.length)} / ${graph.investigations.length} EVIDENCE READ</small><ol>${graph.objectives.map(objective=>{const done=complete||stages.indexOf(objective.stage)<stages.indexOf(stage);return `<li class="${done?'done':objective.stage===stage?'current':''}">${icon(done?'check':'flag')} ${e(objective.text)}</li>`;}).join('')}</ol></section>`;
}
