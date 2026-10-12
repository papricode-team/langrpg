import { describe,expect,it } from 'vitest';
import { departureRound } from './departure-round';
import type { GameItem } from './types';

const item=(lexemeId:string,lemma:string):GameItem=>({lexemeId,lemma,pos:'noun',topic:'travel',level:'A1',english:lemma,audio:'',exerciseIds:{recognition:'',listening:'',production:''},stability:0,due:{recognition:false,listening:false,production:false},seen:{recognition:false,listening:false,production:false},recalls:{recognition:0,listening:0,production:0}});
describe('departure fields',()=>{
  const seven=item('sieben-num','sieben'),two=item('zwei-num','zwei');
  const pool=[seven,two,item('bahnhof-noun','Bahnhof'),item('hotel-noun','Hotel'),item('puenktlich-adj','pünktlich'),item('verspaetung-noun','Verspätung')];
  it('maps each actual display choice back to a restored canonical lexeme',()=>{
    const board=departureRound(pool,seven,42);
    expect(board.fields.map(field=>field.id)).toEqual(['time','platform','destination','notice']);
    expect(board.targets).toHaveLength(4);
    expect(board.targets.find(target=>target.field==='time')?.item).toBe(seven);
    expect(board.targets.find(target=>target.field==='platform')?.item).toBe(two);
    expect(board.fields[0].values).toContain('07:00');
    for(const target of board.targets)for(const choice of target.options.values())expect(pool).toContain(choice);
  });
  it('has reproducible mixed initial states and no invented evidence in unavailable fields',()=>{
    const first=departureRound([seven,two],seven,17);
    expect(first).toEqual(departureRound([seven,two],seven,17));
    expect(first.targets.map(target=>target.field)).toEqual(['time','platform']);
    expect(first.fields[2].values).toEqual(['—']);
    expect(first.fields[3].values).toEqual(['—']);
    const allInitial=new Set(Array.from({length:20},(_,seed)=>departureRound(pool,seven,seed).fields[0].initialIndex));
    expect(allInitial.size).toBeGreaterThan(1);
  });
  it('keeps early general station words playable on one honest field',()=>{
    const come=item('kommen-verb','kommen'),go=item('gehen-verb','gehen');
    const board=departureRound([come,go],come,1);
    expect(board.targets).toHaveLength(1);
    expect(board.targets[0].item).toBe(come);
    expect([...board.targets[0].options.values()]).toEqual(expect.arrayContaining([come,go]));
  });
});
