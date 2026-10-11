import {describe,expect,it} from 'vitest';
import {applyScatter,generateScatter} from './level-editor-generation';
import type {WorldScene,SceneGenerationZone} from './scene-schema';
const scene=():WorldScene=>({id:'lindenhafen',coordinateVersion:1,width:1000,height:800,spawn:{x:50,y:50},npcs:[],objects:[],walkable:[[[14,14],[150,14],[150,750],[14,750]]],obstacles:[],scenery:[{id:'manual-tree',asset:'tree',x:400,y:400,width:80}],terrain:[{id:'core',x:0,y:0,width:1000,height:800,dayAsset:'/assets/test.webp'}],districts:[]});
const zone:SceneGenerationZone={id:'woodland',seed:42,rulesVersion:1,polygon:[[200,20],[980,20],[980,780],[200,780]],palette:['tree']};
const templates=[{asset:'tree' as const,frame:'tree',width:80}];
const settings={count:12,minSpacing:60,clearance:16,minScale:.9,maxScale:1.1};

describe('seeded scenery generation',()=>{
  it('reproduces accepted proposals and keeps the source immutable',()=>{
    const source=scene(),a=generateScatter(source,zone,templates,settings),b=generateScatter(source,zone,templates,settings);
    expect(a).toEqual(b);expect(a.added).toHaveLength(12);expect(source.scenery).toHaveLength(1);
    expect(generateScatter(source,{...zone,seed:43},templates,settings).added).not.toEqual(a.added);
  });
  it('preserves manually authored and pinned generated instances during regeneration',()=>{
    const first=applyScatter(scene(),generateScatter(scene(),zone,templates,settings));
    first.scenery[1]={...first.scenery[1],pinned:true,x:600};
    const before=structuredClone(first.scenery[1]),proposal=generateScatter(first,zone,templates,settings),next=applyScatter(first,proposal);
    expect(next.scenery.find(item=>item.id==='manual-tree')).toEqual(first.scenery[0]);
    expect(next.scenery.find(item=>item.id===before.id)).toEqual(before);
    expect(proposal.preservedIds).toContain(before.id);expect(new Set(next.scenery.map(item=>item.id)).size).toBe(next.scenery.length);
  });
  it('refuses to fill walking paths and explains unsatisfied density',()=>{
    const pathZone={...zone,polygon:[[20,20],[140,20],[140,740],[20,740]] as const};
    const proposal=generateScatter(scene(),pathZone,templates,settings);
    expect(proposal.added).toHaveLength(0);expect(proposal.rejected.pathClearance).toBeGreaterThan(0);expect(proposal.diagnostics.join(' ')).toMatch(/too crowded|walking paths/);
  });
  it('preserves generated objects that now own activity slots or entrances',()=>{
    const existing=applyScatter(scene(),generateScatter(scene(),zone,templates,settings));
    const owner=existing.scenery.find(item=>item.generatorId===zone.id)!;
    existing.activities=[{id:'tree-shelter',ownerId:owner.id,kind:'shelter',offsetX:0,offsetY:20}];
    const doorOwner=existing.scenery.find(item=>item.generatorId===zone.id&&item.id!==owner.id)!;
    existing.entrances=[{id:'cafe-door',ownerId:doorOwner.id,interiorId:'cafe',offsetX:0,offsetY:30}];
    const proposal=generateScatter(existing,{...zone,seed:17},templates,settings),applied=applyScatter(existing,proposal);
    expect(applied.activities).toEqual(existing.activities);expect(applied.entrances).toEqual(existing.entrances);
    expect(proposal.preservedIds).toEqual(expect.arrayContaining([owner.id,doorOwner.id]));
    expect(applied.generationZones?.[0].seed).toBe(17);
    expect(applied.scenery.filter(item=>proposal.added.some(value=>value.id===item.id))).toEqual(proposal.added);
  });
  it('rejects stale previews after objects acquire protection or their layout changes',()=>{
    const existing=applyScatter(scene(),generateScatter(scene(),zone,templates,settings));
    const preview=generateScatter(existing,zone,templates,settings);
    for(const change of [
      (draft:WorldScene)=>{draft.scenery[1].pinned=true;},
      (draft:WorldScene)=>{draft.scenery[1].x+=10;},
      (draft:WorldScene)=>{draft.activities=[{id:'new-seat',ownerId:draft.scenery[1].id,kind:'seat',offsetX:0,offsetY:20}];},
    ]){
      const draft=structuredClone(existing);change(draft);
      expect(()=>applyScatter(draft,preview)).toThrow(/fresh preview/);
    }
  });
});
