import {describe,expect,it} from 'vitest';
import {applyScatter,generateScatter,polygonsIntersect} from './level-editor-generation';
import {sceneryFootprints} from './placed-scenery';
import type {WorldScene,SceneGenerationZone} from './scene-schema';
const scene=():WorldScene=>({id:'lindenhafen',coordinateVersion:1,width:1000,height:800,spawn:{x:50,y:50},npcs:[],objects:[],walkable:[[[14,14],[150,14],[150,750],[14,750]]],obstacles:[],scenery:[{id:'manual-tree',asset:'tree',x:400,y:400,width:80}],terrain:[{id:'core',x:0,y:0,width:1000,height:800,dayAsset:'/assets/test.webp'}],districts:[]});
const zone:SceneGenerationZone={id:'woodland',seed:42,rulesVersion:1,polygon:[[200,20],[980,20],[980,780],[200,780]],palette:['tree']};
const templates=[{asset:'tree' as const,frame:'tree',width:80}];
const settings={count:12,minSpacing:60,clearance:16,minScale:.9,maxScale:1.1};
const clearLand=():WorldScene=>({...scene(),id:'source',walkable:[],scenery:[],navigation:{model:'clear-land',terrainCollision:[]}});

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
  it('allows scatter on clear grass while keeping generated collision on each object',()=>{
    const source=clearLand(),grass={...zone,polygon:[[20,200],[140,200],[140,750],[20,750]] as const};
    const proposal=generateScatter(source,grass,templates,{...settings,count:5,minSpacing:30,clearance:0});
    expect(proposal.added).toHaveLength(5);expect(proposal.rejected.pathClearance).toBe(0);
    expect(proposal.added.every(item=>!!item.collision?.polygons.length)).toBe(true);
    const item=proposal.added[0],moved={...item,x:item.x+400,y:item.y+10};
    const original=sceneryFootprints([item])[0],translated=sceneryFootprints([moved])[0];
    for(const [index,[x,y]] of original.entries()){expect(translated[index][0]).toBeCloseTo(x+400);expect(translated[index][1]).toBeCloseTo(y+10);}
  });
  it('rejects water and an owned foundation far from its anchor',()=>{
    const water=clearLand();water.navigation!.terrainCollision=[{id:'pond',kind:'water',polygon:[[200,180],[900,180],[900,760],[200,760]]}];
    const pondZone={...zone,polygon:[[250,230],[850,230],[850,710],[250,710]] as const};
    const flooded=generateScatter(water,pondZone,templates,{...settings,count:2});
    expect(flooded.added).toHaveLength(0);expect(flooded.rejected.occupied).toBeGreaterThan(0);
    const occupied=clearLand();occupied.scenery=[{id:'offset-foundation',asset:'house',x:450,y:500,width:80,collision:{referenceWidth:80,polygons:[[[150,-120],[380,-120],[380,120],[150,120]]]}}];
    const foundationZone={...zone,polygon:[[620,410],[810,410],[810,590],[620,590]] as const};
    const blocked=generateScatter(occupied,foundationZone,templates,{...settings,count:2,minSpacing:30,clearance:0});
    expect(blocked.added).toHaveLength(0);expect(blocked.rejected.occupied).toBeGreaterThan(0);
    const adjacent=generateScatter(occupied,zone,templates,{...settings,count:8,minSpacing:30,clearance:0});
    const foundation=sceneryFootprints(occupied.scenery)[0];
    expect(adjacent.added).toHaveLength(8);
    expect(adjacent.added.every(item=>sceneryFootprints([item]).every(base=>!polygonsIntersect(base,foundation)))).toBe(true);
  });
  it('protects separate activity places when land has no street whitelist',()=>{
    const source=clearLand();source.scenery=[{id:'bench',asset:'bench',x:450,y:200,width:64}];
    source.activities=[{id:'seat',ownerId:'bench',kind:'seat',offsetX:0,offsetY:0,places:[{x:300,y:400}]}];
    const seating={...zone,polygon:[[726,576],[774,576],[774,624],[726,624]] as const};
    const proposal=generateScatter(source,seating,[{asset:'tree',frame:'tree',width:20}],{...settings,count:2,minSpacing:8,clearance:0,minScale:1,maxScale:1});
    expect(proposal.added).toHaveLength(0);expect(proposal.rejected.pathClearance).toBeGreaterThan(0);
  });
});
