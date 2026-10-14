import authoredBoards from '../../../content/source/activity-boards.json';
import type { ActivityScenario } from '../activity-engine';

/** Private authoring data is available only to tests that act as the grader. */
export function expectedEvidenceCard(scenario:ActivityScenario,slotId:string):string {
  const board=authoredBoards.scenarios.find(scene=>scene.id===scenario.id)?.board;
  const cardId=board?.slots?.find(slot=>slot.id===slotId)?.expected;
  if(!cardId)throw new Error(`Missing authored evidence solution: ${scenario.id}/${slotId}`);
  return cardId;
}
