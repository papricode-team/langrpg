import {describe,expect,it} from 'vitest';
import draft from './data/lindenhafen-terrain-rebuild.json';
import {bridgeJoinMask,bridgeFloorJoins} from './terrain-bridge-joins';
import {featurePolygon} from './terrain-features';
import {surfaceAt,type ModularTerrain} from './modular-terrain';

describe('bridge landing integration',()=>{
  const terrain=draft.modularTerrain as unknown as ModularTerrain;
  const bridges=terrain.features!.filter(f=>f.asset==='canal-arch-bridge');
  it.each(bridges)('$id has paving under the complete width of both open deck ends',bridge=>{
    for(const join of bridgeFloorJoins)for(const [x,y] of featurePolygon(bridge,join.mouth))
      expect(surfaceAt(terrain,x,y)?.material,`${bridge.id} at ${x},${y}`).toBe('town-cobble');
    expect(bridgeJoinMask(terrain,bridge)).toBe(3);
  });
  it('does not fade native bridge floors into water or bare ground',()=>{
    expect(bridgeJoinMask({...terrain,surfaces:[]},bridges[0])).toBe(0);
  });
  it.each(bridges)('$id seats its front end pier in the canal, beside its landing',bridge=>{
    const [[x,y]]=featurePolygon(bridge,[[.78,.89]]);
    expect(surfaceAt(terrain,x,y)?.material).toBe('banked-water');
  });
});
