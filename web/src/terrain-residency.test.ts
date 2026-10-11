import {describe, expect, it, vi} from 'vitest';
import {TerrainResidency, visibleTerrain, type TerrainAsset} from './terrain-residency';

function fixture() {
  const textures=new Set<string>(), pending=new Map<string,(ready:boolean)=>void>();
  let time=0;
  const load=vi.fn((asset:TerrainAsset)=>new Promise<boolean>(resolve=>pending.set(asset.key,resolve)));
  const remove=vi.fn((key:string)=>textures.delete(key));
  const pool=new TerrainResidency({exists:key=>textures.has(key),load,remove,pixels:()=>3073*2049},2,()=>time);
  const finish=async(key:string,ready=true)=>{if(ready)textures.add(key);pending.get(key)!(ready);pending.delete(key);await Promise.resolve();await Promise.resolve();};
  return {pool,textures,load,remove,finish,advance:()=>time+=3000};
}
const asset=(key:string,priority=0)=>({key,asset:`/assets/${key}.webp`,priority});

describe('terrain texture residency',()=>{
  it('bounds in-flight loads, coalesces readers, and releases only after the last fade reader',async()=>{
    const f=fixture(), day={},fade={};
    f.pool.retain(day,[asset('a'),asset('b'),asset('c')]);
    f.pool.retain(fade,[asset('a')]);
    expect(f.load).toHaveBeenCalledTimes(2);
    await f.finish('a');expect(f.load).toHaveBeenCalledTimes(3);
    f.pool.release(day);expect(f.remove).not.toHaveBeenCalledWith('a');
    await f.finish('b');await f.finish('c');
    expect([...f.textures]).toEqual(['a']);
    expect(f.pool.snapshot()).toMatchObject({textures:1,pixels:3073*2049,pending:0});
    f.pool.release(fade);expect(f.textures.size).toBe(0);
  });
  it('does not resurrect abandoned regions, but lets a quick return adopt an in-flight request',async()=>{
    const f=fixture(), old={},current={};
    f.pool.retain(old,[asset('a'),asset('b'),asset('never-started')]);
    f.pool.release(old);
    f.pool.retain(current,[asset('a')]);
    expect(f.load).toHaveBeenCalledTimes(2);
    await f.finish('a');await f.finish('b');
    expect([...f.textures]).toEqual(['a']);
    expect(f.load.mock.calls.map(([item])=>item.key)).toEqual(['a','b']);
    f.pool.release(current);expect(f.pool.snapshot().textures).toBe(0);
  });
  it('retries failed pieces after a bounded delay and disposes late completions',async()=>{
    const f=fixture(), view={};
    f.pool.retain(view,[asset('a')]);await f.finish('a',false);
    f.pool.retain(view,[asset('a')]);expect(f.load).toHaveBeenCalledTimes(1);
    f.advance();f.pool.retain(view,[asset('a')]);expect(f.load).toHaveBeenCalledTimes(2);
    f.pool.dispose();await f.finish('a');expect(f.textures.size).toBe(0);
    f.pool.retain({},[asset('b')]);expect(f.load).toHaveBeenCalledTimes(2);
  });
  it('queries only intersecting chunks and prioritizes the center across old map boundaries',()=>{
    const tiles=Array.from({length:16},(_,i)=>({id:`tile-${i}`,x:i%4*768,y:Math.floor(i/4)*512,width:768,height:512}));
    const view={x:1500,y:1000,width:100,height:100};
    expect(visibleTerrain(tiles,view).map(tile=>tile.id).sort()).toEqual(['tile-10','tile-5','tile-6','tile-9']);
    expect(visibleTerrain(tiles,{x:2100,y:1600,width:50,height:50})[0].id).toBe('tile-14');
    expect(visibleTerrain(tiles,{x:4000,y:0,width:100,height:100})).toEqual([]);
  });
});
