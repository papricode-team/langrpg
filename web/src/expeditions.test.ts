import './test-support/expedition-fixtures';
import { describe, expect, it } from 'vitest';
import { expeditionIds, expeditionLayouts, expeditionMaps, expeditionResidentSpecs, expeditionRegions, getExpedition, getExpeditionEncounter, getExpeditionNpc, isExpeditionMap, shuffledExpeditionChoices } from './expeditions';
import { maps, storyMaps } from './maps';
import archived from '../../docs/archive/expedition-scenes.json';



describe('ten culturally distinct exploration communities', () => {
  it('varies encounter answer positions while preserving canonical server indices',()=>{
    for(const encounter of expeditionRegions.flatMap(region=>region.encounters)) {
      const positions=new Set<number>();
      for(let retry=0;retry<30;retry++) {
        const seed=`retry-${retry}`,choices=shuffledExpeditionChoices(encounter,seed);
        expect(shuffledExpeditionChoices(encounter,seed)).toEqual(choices);
        for(const entry of choices)expect(encounter.choices[entry.index]).toBe(entry.choice);
        positions.add(choices.findIndex(entry=>entry.choice.correct));
      }
      expect(positions.size,encounter.id).toBe(2);
    }
  });
  it('preserves ten learning communities outside the three playable towns', () => {
    expect(expeditionRegions).toHaveLength(10);
    expect(maps).toHaveLength(3);
    expect(maps).toEqual(storyMaps);
    expect(new Set(expeditionRegions.map(region=>region.culture)).size).toBe(10);
    expect(new Set(expeditionRegions.map(region=>region.feeling)).size).toBe(10);
    expect(new Set(expeditionIds.map(id=>JSON.stringify(expeditionLayouts[id].nodes))).size).toBe(10);
    expect(getExpedition('lindenhafen')).toBeUndefined();
    expect(getExpedition('unknown')).toBeUndefined();
    expect(isExpeditionMap('not-a-place')).toBe(false);
  });

  it('gives all 180 neighbors and discoveries one actionable German encounter', () => {
    const ids = new Set<string>();
    let encounters = 0;
    for (const region of expeditionRegions) {
      expect(region.culture).toMatch(/fictional/i);
      expect(region.npcs).toHaveLength(8);
      expect(region.objects).toHaveLength(10);
      expect(region.encounters).toHaveLength(18);
      for (const target of [...region.npcs,...region.objects]) {
        expect(ids.has(target.id),target.id).toBe(false);
        ids.add(target.id);
        const encounter = getExpeditionEncounter(region.id,target.id)!;
        expect(encounter).toBeDefined();
        expect(encounter.german.trim().length).toBeGreaterThan(0);
        expect(encounter.translation.trim().length).toBeGreaterThan(0);
        expect(encounter.translation).not.toBe(encounter.german);
        expect(encounter.choices.filter(choice=>choice.correct)).toHaveLength(1);
        expect(new Set(encounter.choices.map(choice=>choice.text)).size).toBe(encounter.choices.length);
        expect(encounter.choices.every(choice=>choice.response.length>40)).toBe(true);
        encounters++;
      }
      expect(new Set(region.encounters.map(encounter=>encounter.id)).size).toBe(18);
      for (const npc of region.npcs) {
        expect(getExpeditionNpc(npc.id)).toBe(npc);
        expect(npc.artVariant).toBeGreaterThanOrEqual(0);
        expect(npc.artVariant).toBeLessThan(8);
        expect(region.npcs.some(neighbor=>neighbor.id!==npc.id&&npc.relationship.includes(neighbor.name)),npc.id).toBe(true);
      }
      expect(getExpeditionEncounter('lindenhafen',region.npcs[0].id)).toBeUndefined();
      expect(getExpeditionEncounter(region.id,'unknown')).toBeUndefined();
    }
    expect(encounters).toBe(180);
  });

  it('assigns sixteen different stable visual identities to every community', () => {
    for (const region of expeditionRegions) {
      const residents = expeditionResidentSpecs[region.id];
      expect(region.npcs.map(npc => npc.artVariant)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(residents.map(resident => resident.artVariant)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
      expect(new Set([...region.npcs, ...residents].map(person => person.artVariant)).size).toBe(16);
      expect(new Set([...region.npcs, ...residents].map(person => person.id)).size).toBe(16);
    }
  });

  it('archives every retired scene while keeping encounters and games independent', () => {
    expect(Object.keys(archived.maps)).toEqual(expeditionIds);
    for (const map of expeditionMaps) {
      const scene = archived.maps[map.id];
      expect(scene.scenery.length).toBeGreaterThanOrEqual(90);
      expect('entrances' in scene).toBe(false);
      expect(maps.some(playable => playable.id === map.id)).toBe(false);
    }
  });
});
