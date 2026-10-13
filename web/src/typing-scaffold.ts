import type { Level } from './content';

/**
 * Letter scaffolds for typed recall. A fresh sentence shows the first and last
 * letter of every word; each unaided recall removes a little more, down to the
 * word shapes. The scaffold stays while the learner trains at the sentence's own
 * level and disappears once they have moved past it: an A2 learner writes A1
 * German from memory.
 */
export type ScaffoldStage = 'edges' | 'initials' | 'shape' | 'none';

const levels: readonly Level[] = ['A1', 'A2', 'B1'];
/** The final scene of the previous act opens each level (see progression.lastQuestOf). */
const milestones: Partial<Record<Level, string>> = { A2: 'a1-departure', B1: 'a2-archive' };

/** The story level the learner is training at, following the same milestones that open each town. */
export function learnerLevel(completedQuestIds: readonly string[], questLevels: ReadonlyMap<string, Level>): Level {
  const reached = (level: Level) => completedQuestIds.includes(milestones[level]!) || completedQuestIds.some(id => {
    const questLevel = questLevels.get(id);
    return !!questLevel && levels.indexOf(questLevel) >= levels.indexOf(level);
  });
  return reached('B1') ? 'B1' : reached('A2') ? 'A2' : 'A1';
}

export function scaffoldStage(exerciseLevel: Level, currentLevel: Level, unaidedRecalls: number): ScaffoldStage {
  if (levels.indexOf(currentLevel) > levels.indexOf(exerciseLevel)) return 'none';
  return unaidedRecalls < 1 ? 'edges' : unaidedRecalls < 2 ? 'initials' : 'shape';
}

/** Masks the letters of each word; spaces, punctuation and digits stay visible. */
export function scaffoldText(answer: string, stage: ScaffoldStage): string {
  if (stage === 'none') return '';
  return answer.replace(/\p{L}+/gu, word => [...word].map((letter, i, letters) =>
    i === 0 && stage !== 'shape' || i === letters.length - 1 && stage === 'edges' ? letter : '_').join(''));
}
