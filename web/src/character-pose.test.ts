import { describe, expect, it } from 'vitest';
import { availableCharacterPoses, advancePoseClock, poseColumn } from './character-pose';
import { characterCatalogue, normalizeAvatar } from './character-recipe.mjs';

describe('character action poses', () => {
  const durations=[650,160,160,160,160,160,160,160,650];
  it('requires a complete matching wardrobe without replacing equipped pieces', () => {
    const recipe=normalizeAvatar({v:2,build:'regular',parts:{face:'soft',hair:'waves',top:'shirt',bottom:'straight',footwear:'boots',outer:'travel'}});
    const original=structuredClone(recipe);
    expect(availableCharacterPoses(recipe)).toContain('wave');
    expect(recipe).toEqual(original);
    for(const [slot,id] of [['face','oval'],['hair','bob'],['bottom','skirt'],['headwear','cap'],['held','lantern']]){
      expect(availableCharacterPoses({...recipe,parts:{...recipe.parts,[slot]:id}})).not.toContain('wave');
    }
    expect(availableCharacterPoses({...recipe,build:'slim'})).not.toContain('wave');
    expect(availableCharacterPoses(recipe,{...characterCatalogue,poseSets:undefined})).toEqual([]);
    expect(availableCharacterPoses({...recipe,parts:{...recipe.parts,hair:null,outer:null}})).toContain('wave');
  });
  it('requires the actual lantern for the lantern-raise pose', () => {
    const recipe=normalizeAvatar({v:2,build:'regular',parts:{face:'soft',hair:'waves',top:'shirt',bottom:'straight',footwear:'boots',outer:'travel',held:'lantern'}});
    expect(availableCharacterPoses(recipe)).toContain('lantern-raise');
    expect(availableCharacterPoses({...recipe,parts:{...recipe.parts,held:null}})).not.toContain('lantern-raise');
    expect(recipe.parts.held).toBe('lantern');
  });
  it('honours unequal hold times and wraps at the exact cycle boundary', () => {
    expect([0,649,650,809,810,1769,1770,2419,2420].map(ms=>poseColumn(ms,durations))).toEqual([0,0,1,1,2,7,8,8,0]);
    expect(poseColumn(NaN,durations)).toBe(0);
    expect(()=>poseColumn(1,[0])).toThrow('nine positive');
  });
  it('pauses hidden or reduced-motion views without catching up after a stall', () => {
    let clock={elapsedMs:640,lastTimeMs:null as number|null};
    clock=advancePoseClock(clock,100,durations);
    clock=advancePoseClock(clock,120,durations);
    expect(poseColumn(clock.elapsedMs,durations)).toBe(1);
    expect(clock.elapsedMs).toBe(660);
    clock=advancePoseClock(clock,5000,durations);
    expect(clock.elapsedMs).toBe(660);
    clock=advancePoseClock(clock,5100,durations,false);
    expect(clock.lastTimeMs).toBeNull();
    expect(advancePoseClock(clock,10000,durations).elapsedMs).toBe(660);
    expect(advancePoseClock({elapsedMs:2410,lastTimeMs:100},120,durations).elapsedMs).toBe(10);
  });
});
