import { describe, expect, it } from 'vitest';
import type { Exercise } from './content';
import type { WordMemory } from './api';
import { emptyProgress } from './api';
import { reviewExercises } from './review';
const now = Date.parse('2026-10-09T12:00:00Z');
const due = '2026-10-09T11:00:00Z', future = '2026-10-10T12:00:00Z';
const ex = (id:string, mode:Exercise['mode']='choice'):Exercise => ({id,itemId:id,mode,prompt:'Practise',german:'Hallo',english:'hello',answer:'Hallo',hint:'Try again',explanation:'Hello'});
const memory = (id:string, dueAt=due) => ({itemId:id,dueAt,lastSeenAt:due,stabilityDays:1,difficulty:5,repetitions:1,lapses:0,modeStats:{}});
const word = (id:string):WordMemory => ({...memory(id),wordId:id,exposures:1,contextExposures:0,directAttempts:1,mastery:'learning',evidence: Object.fromEntries(['production','listening','recognition'].map(mode=>[mode,{dueAt:due,status:'learning',stabilityDays:1,attempts:1,correct:1,unaidedSuccesses:1}])) as WordMemory['evidence']});
describe('whole-course review',()=>{
  it('brings back extended course sentences alongside story expressions, while future items rest',()=>{
    const p=emptyProgress();p.items={course:memory('course'),story:memory('story'),future:memory('future',future)};
    const queue=reviewExercises(p,[ex('course','sentence'),ex('future')],[ex('story')],now);
    expect(queue.map(item=>item.id)).toEqual(['course','story']);
    expect(queue[0]).toMatchObject({mode:'type',prompt:'Write in German: hello'});
  });
  it('selects a due modality without repeating a word’s resting recall or listening skill',()=>{
    const p=emptyProgress();p.words.apple=word('apple');p.words.apple.evidence.production.dueAt=future;p.words.apple.evidence.listening.dueAt=future;
    const drills=([['prod','type'],['listen','listen'],['read','choice']] as const).map(([id,mode])=>({...ex(id,mode),itemId:'word-apple',targetWordId:'apple'}));
    p.items['word-apple']=memory('word-apple');
    expect(reviewExercises(p,drills,[],now).map(item=>item.id)).toEqual(['read']);
    p.words.apple.dueAt=future;
    expect(reviewExercises(p,drills,[],now)).toEqual([]);
  });
  it('keeps the session to eight encounters with at most six word targets',()=>{
    const p=emptyProgress();const drills=Array.from({length:20},(_,i)=>{const id=String(i);p.words[id]=word(id);return {...ex(id,'type'),targetWordId:id};});
    const contexts=Array.from({length:10},(_,i)=>{const item=ex(`phrase-${i}`);p.items[item.itemId]=memory(item.itemId);return item;});
    const queue=reviewExercises(p,drills,contexts,now);
    expect(queue).toHaveLength(8);expect(queue.filter(item=>item.itemId.startsWith('phrase-'))).toHaveLength(2);
  });
});
