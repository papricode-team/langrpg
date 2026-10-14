import { describe, expect, it } from 'vitest';
import { emptyProgress, type Progress } from './api';
import { quests, type Exercise } from './content';
import { phrasePracticeQueue } from './phrase-practice';
import { syllabus } from './intake';

const now = Date.UTC(2026, 9, 14);
function learned(exercise: Exercise): Progress {
  const progress = emptyProgress();
  const owner = quests.findIndex(quest => quest.exercises.includes(exercise));
  progress.completedQuestIds = quests.slice(0, owner).map(quest => quest.id);
  progress.items[exercise.itemId] = {itemId:exercise.itemId,stabilityDays:1,difficulty:5,repetitions:1,lapses:0,
    lastSeenAt:new Date(now-86400000).toISOString(),dueAt:new Date(now-1000).toISOString(),
    modeStats:{recognition:{attempts:1,correct:1,unaidedSuccesses:1},listening:{attempts:0,correct:0,unaidedSuccesses:0},production:{attempts:0,correct:0,unaidedSuccesses:0}}};
  return progress;
}
const options = {silent:false,writingReady:true,now};
describe('phrase selection preserves learning gates', () => {
  const reading = quests[0].exercises.find(exercise => exercise.mode === 'choice')!;
  const writing = quests.flatMap(quest => quest.exercises).find(exercise => exercise.mode === 'sentence')!;
  it('keeps resting and unlearned phrases out of practice', () => {
    expect(phrasePracticeQueue(reading.itemId,emptyProgress(),quests,options)).toEqual([]);
    const progress=learned(reading);progress.items[reading.itemId].dueAt=new Date(now+1000).toISOString();
    expect(phrasePracticeQueue(reading.itemId,progress,quests,options)).toEqual([]);
    progress.items[reading.itemId].dueAt=new Date(now-1000).toISOString();
    expect(phrasePracticeQueue(reading.itemId,progress,quests,options)).toHaveLength(1);
  });
  it('requires both clue order and restored context words', () => {
    const lockedExercise=quests[2].exercises[0];
    const progress=learned(lockedExercise);progress.completedQuestIds=[];
    expect(phrasePracticeQueue(lockedExercise.itemId,progress,quests,options)).toEqual([]);
    const due=learned(reading);
    expect(phrasePracticeQueue(reading.itemId,due,quests,{...options,contextWords:{[reading.id]:[syllabus.wordIds[0]]}})).toEqual([]);
  });
  it('applies the writing gate after converting a sentence revisit to recall', () => {
    const progress=learned(writing);
    expect(phrasePracticeQueue(writing.itemId,progress,quests,{...options,writingReady:false})).toEqual([]);
    expect(phrasePracticeQueue(writing.itemId,progress,quests,options)[0]?.mode).toBe('type');
  });
});
