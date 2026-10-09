import { describe, expect, it } from 'vitest';
import { expeditionIds, expeditionLandPlots, expeditionLayouts, expeditionMaps, expeditionRegions, getExpedition, getExpeditionEncounter, getExpeditionNpc, isExpeditionMap } from './expeditions';
import { maps, storyMaps } from './maps';
import { getPlacedScenery, placedSceneryFootprints, sceneryAssets } from './placed-scenery';
import { createWorldResidents } from './world-life';
import { buildingEntrances } from './interiors';

describe('ten culturally distinct exploration communities', () => {
  it('adds ten places without changing the original three story arrivals', () => {
    expect(expeditionRegions).toHaveLength(10);
    expect(maps).toHaveLength(13);
    expect(maps.slice(0,3)).toEqual(storyMaps);
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
        expect(npc.artVariant).toBeLessThan(4);
        expect(region.npcs.some(neighbor=>neighbor.id!==npc.id&&npc.relationship.includes(neighbor.name)),npc.id).toBe(true);
      }
      expect(getExpeditionEncounter('lindenhafen',region.npcs[0].id)).toBeUndefined();
      expect(getExpeditionEncounter(region.id,'unknown')).toBeUndefined();
    }
    expect(encounters).toBe(180);
  });

  for (const map of expeditionMaps) it(`${map.name} has separate static foundations, four motion kinds and eight connected residents`, () => {
    const specs = getPlacedScenery(map.id);
    expect(specs.length).toBeGreaterThanOrEqual(90);
    expect(new Set(specs.map(spec=>spec.id)).size).toBe(specs.length);
    expect(specs.every(spec=>sceneryAssets.includes(spec.asset))).toBe(true);
    expect(specs.every(spec=>!spec.variant)).toBe(true);
    const motion = specs.filter(spec=>spec.collidable===false);
    expect(motion).toHaveLength(24);
    expect(new Set(motion.map(spec=>spec.frame))).toEqual(new Set(['motion-tree','motion-cloth','motion-lamp','motion-water']));
    // A motion row includes its own pot, stand, pole or fountain. These must
    // stand at independent feet, rather than floating above another sprite.
    for(const prop of motion) {
      expect(prop.depth).toBeUndefined();
      expect(specs.filter(other=>other.x===prop.x&&other.y===prop.y)).toHaveLength(1);
    }
    expect(placedSceneryFootprints(map.id).length).toBeGreaterThan(50);
    expect(createWorldResidents(map.id)).toHaveLength(8);
    // Existing shop rooms belong to the original towns; local architecture has
    // its own cultural setting and is not mislabeled as the original interiors.
    expect(buildingEntrances(map.id)).toEqual([]);
  });

  for(const id of ['riverweave','cedarbay'] as const) it(`keeps ${id} land-based scenery foundations on painted grass banks`,()=>{
    const contains=(polygon:readonly(readonly[number,number])[],x:number,y:number)=>{
      let inside=false;
      for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
        const [xi,yi]=polygon[i],[xj,yj]=polygon[j];
        if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
      }
      return inside;
    };
    for(const spec of getPlacedScenery(id)) {
      // Dedicated discovery scenery stands on the known pavement approach;
      // transport boats may occupy water. Other props need a complete bank base.
      if(spec.id.endsWith('-scenery')||spec.asset==='boat')continue;
      expect(expeditionLandPlots[id]!.some(plot=>[-.34,0,.34].every(offset=>contains(plot,spec.x+spec.width*offset,spec.y-5))),spec.id).toBe(true);
    }
  });
});
