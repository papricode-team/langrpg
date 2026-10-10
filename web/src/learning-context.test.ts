import {describe,it,expect} from 'vitest';
import {emptyProgress,type Progress} from './api';
import {courseLexicon} from './course';
import {quests} from './content';
import {createGlossLookup,glossesForLine,placementExercises,placementRecommendation,recommendedScaffolding,selectInputVariant,auditInputLevel,filterKnownGlosses} from './learning-context';

describe('learner scaffolding and optional placement',()=>{
  it('only suggests a higher practice level from independent graded evidence at preceding levels',()=>{
    expect(placementRecommendation([{level:'B1',correct:true,hinted:false},{level:'B1',correct:true,hinted:false}])).toBe('A1');
    const foundations=([['A1',3],['A2',3]] as const).flatMap(([level,count])=>Array.from({length:count},()=>({level,correct:true,hinted:false})));
    expect(placementRecommendation(foundations)).toBe('A2');
    expect(placementRecommendation([...foundations,{level:'B1',correct:true,hinted:false},{level:'B1',correct:true,hinted:true}])).toBe('A2');
    expect(placementRecommendation([...foundations,{level:'B1',correct:true,hinted:false},{level:'B1',correct:true,hinted:false}])).toBe('B1');
  });
  it('uses existing authoritative exercises at their actual levels with productive retrieval',()=>{
    const sample=placementExercises(quests.flatMap(quest=>quest.exercises.map(exercise=>({...exercise,level:quest.level}))));
    expect(sample.map(item=>item.level)).toEqual(['A1','A1','A1','A2','A2','A2','B1','B1']);
    expect(sample.filter(item=>item.mode==='type')).toHaveLength(3);
    expect(new Set(sample.map(item=>item.itemId)).size).toBe(8);
  });
  it('glosses exact lexemes without transferring polluted pronoun-table forms',()=>{
    const progress=emptyProgress(),lookup=createGlossLookup(courseLexicon,progress);
    expect(lookup('ich')?.wordId).toBe('ich-pron');
    expect(lookup('du')?.wordId).toBe('du-pron');
    expect(lookup('heiße')).toBeUndefined();
    expect(glossesForLine('Ich trinke Kaffee.',lookup).kaffee).toContain('coffee');
    progress.words['kaffee-noun']={evidence:{recognition:{status:'retained'}}} as unknown as Progress['words'][string];
    expect(glossesForLine('Ich trinke Kaffee.',lookup).kaffee).toBeUndefined();
  });
  it('never lets hinted answers remove learner support',()=>{
    const progress=emptyProgress();
    for(let index=0;index<12;index++)progress.recentAttempts[String(index)]={id:String(index),exerciseId:'test',itemId:'test',mode:'production',correct:true,hinted:true,at:'2026-10-10T12:00:00Z'};
    expect(recommendedScaffolding(progress)).toBe('more');
    for(const attempt of Object.values(progress.recentAttempts))attempt.hinted=false;
    expect(recommendedScaffolding(progress)).toBe('lighter');
  });
  it('selects an authored comprehensible variant and asks for scaffolding when coverage is low',()=>{
    const lookup=(surface:string)=>({wordId:surface,german:surface,english:surface,known:['Ich','trinke','Kaffee'].includes(surface)});
    const variants=[{id:'rich',german:'Ich trinke Kaffee und lese eine Zeitung.'},{id:'simple',german:'Ich trinke Kaffee.'}];
    const choice=selectInputVariant(variants,lookup);
    expect(choice.variant.id).toBe('simple');expect(choice.coverage.ratio).toBe(1);expect(choice.requiresScaffolding).toBe(false);
    const unknown=selectInputVariant(variants,()=>undefined);
    expect(unknown.variant.id).toBe('simple');expect(unknown.requiresScaffolding).toBe(true);expect(unknown.newWords).toEqual(['Ich','trinke','Kaffee']);
    expect(filterKnownGlosses({Ich:'I',Zeitung:'newspaper'},lookup)).toEqual({Zeitung:'newspaper'});
  });
  it('flags lexical and grammar demands without claiming a proficiency guarantee',()=>{
    const audit=auditInputLevel('Die Wahrheit ist, dass ich bleiben würde. Geheimstadt wartet.', 'A1',courseLexicon);
    expect(audit.aboveLevelWords).toContain('Wahrheit');expect(audit.advancedGrammar).toContain('dass');expect(audit.unmappedWords).toContain('Geheimstadt');
  });
});
