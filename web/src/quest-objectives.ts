import type { Progress } from './api';
import type { QuestGraph } from './dialogue';
import { escapeHtml as e, icon } from './icons';
import { localized, t } from './i18n';

export function questObjectivesMarkup(graph: QuestGraph, progress: Progress): string {
  const stages=['intro','gate','choice','complete'];
  const stage=progress.story?.nodes[graph.questId]??'intro';
  const complete=progress.completedQuestIds.includes(graph.questId);
  const inspected=(progress.story?.inspections[graph.questId]??[]).length;
  return `<section class="story-objectives"><small class="eyebrow">${e(t('YOUR INVESTIGATION · {read} / {total} EVIDENCE READ',{read:Math.min(inspected,graph.investigations.length),total:graph.investigations.length}))}</small><ol>${graph.objectives.map(objective=>{const done=complete||stages.indexOf(objective.stage)<stages.indexOf(stage);return `<li class="${done?'done':objective.stage===stage?'current':''}">${icon(done?'check':'flag')} ${e(localized(objective.text))}</li>`;}).join('')}</ol></section>`;
}
