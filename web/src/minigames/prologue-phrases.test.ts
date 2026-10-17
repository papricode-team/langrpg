import {describe,expect,it,vi} from 'vitest';
import {emptyProgress} from '../api';
import type {Exercise,Quest} from '../content';
import {loadProloguePhrases} from './prologue-phrases';

const quest=(id:string,level='A0')=>({id,level,practiceExerciseIds:[`${id}-1`,`${id}-2`]} as Quest);
const exercise=(id:string,german:string,english:string,wordIds=['bitte','langsam'])=>({id,mode:'choice',german,english,wordIds} as Exercise);
describe('prologue phrase eligibility',()=>{
  it('loads completed A0 only and requires every word to be restored',async()=>{
    const progress=emptyProgress();progress.completedQuestIds=['done','arrival'];progress.intake={version:1,activeSeconds:0,creditSeconds:0,lastBeatAt:'',wordIds:['bitte']};
    const load=vi.fn(async(id:string)=>exercise(id,'Langsam, bitte.','Slowly, please.'));
    expect(await loadProloguePhrases([quest('done'),quest('future'),quest('arrival','A1')],progress,load)).toEqual([]);
    expect(load.mock.calls.map(([id])=>id)).toEqual(['done-1','done-2']);
    progress.intake.wordIds.push('langsam');
    expect(await loadProloguePhrases([quest('done')],progress,load)).toEqual([{exerciseId:'done-1',wordIds:['bitte','langsam'],german:'Langsam, bitte.',meaning:'Slowly, please.',audio:undefined}]);
  });
  it('uses localized meanings, skips name blanks and single words, and never rewrites progress',async()=>{
    const progress=emptyProgress();progress.completedQuestIds=['done'];progress.intake={version:1,activeSeconds:0,creditSeconds:0,lastBeatAt:'',wordIds:['bitte','langsam']};
    const before=structuredClone(progress), q={...quest('done'),practiceExerciseIds:['phrase','name','word','unmapped','production']};
    const rows=[exercise('phrase','Langsam, bitte.','Yavaşça, lütfen.'),exercise('name','Ich heiße {name}.','Benim adım {name}.'),exercise('word','bitte','lütfen'),exercise('unmapped','Guten Morgen.','Günaydın.',[]),{...exercise('production','Noch einmal, bitte.','Bir daha, lütfen.'),mode:'type'} as Exercise];
    const phrases=await loadProloguePhrases([q],progress,async id=>rows.find(row=>row.id===id)!);
    expect(phrases.map(row=>row.meaning)).toEqual(['Yavaşça, lütfen.']);expect(progress).toEqual(before);
  });
});
