import {describe,it,expect} from 'vitest';
import {transcriptionResults} from './transcription';
import type {GameItem} from './types';
const item=(id:string,lemma:string,pos:string,surfaceForms:string[]):GameItem=>({lexemeId:id,lemma,pos,surfaceForms,english:lemma,topic:'travel',level:'B1',audio:'',exerciseIds:{recognition:'',listening:'',production:''},stability:0,due:{recognition:false,listening:false,production:false},seen:{recognition:false,listening:false,production:false},recalls:{recognition:0,listening:0,production:0}});
const exercise={id:'b1-witness-exercise-7',itemId:'b1-witness-item-7',mode:'type' as const,prompt:'Hear the tape',german:'Vielleicht hat sie den falschen Zug genommen.',answer:'Vielleicht hat sie den falschen Zug genommen.',english:'',hint:'',explanation:'',wordIds:['vielleicht-adv','falsch-adj','zug-noun','nehmen-verb','sie-pron']};
describe('contextual tape word evidence',()=>{
  const pool=[item('vielleicht-adv','vielleicht','adv',[]),item('falsch-adj','falsch','adj',['falschen']),item('zug-noun','Zug','noun',[]),item('nehmen-verb','nehmen','verb',['genommen','nimmt']),item('sie-pron','sie','pron',[])];
  it('keeps actual tokens and inflections, passing the context to server grading',()=>{
    const results=transcriptionResults(exercise,'Vielleicht hat sie den falschen Bus genomen.',pool,true,2500);
    expect(results.map(result=>[result.lexemeId,result.answer])).toEqual([['vielleicht-adv','Vielleicht'],['falsch-adj','falschen'],['zug-noun','Bus'],['nehmen-verb','genomen']]);
    expect(results.every(result=>result.hinted&&result.contextExerciseId===exercise.id&&result.answerKind==='surface')).toBe(true);
  });
  it('never supplies canonical tokens for omitted or unknown words',()=>{
    const results=transcriptionResults(exercise,'Vielleicht',pool,false,2000);
    expect(results.find(result=>result.lexemeId==='nehmen-verb')?.answer).toBe('__timeout__');
    expect(transcriptionResults(exercise,exercise.answer,[],false,2000)).toEqual([]);
  });
  it('does not select an arbitrary meaning for a homograph',()=>{
    const ambiguous=[...pool,item('zug-other','Zug','noun',[])];
    expect(transcriptionResults({...exercise,wordIds:[...exercise.wordIds,'zug-other']},exercise.answer,ambiguous,false,2000).some(result=>result.lexemeId.startsWith('zug-'))).toBe(false);
  });
});
