import { describe,expect,it,vi } from 'vitest';
import type * as Phaser from 'phaser';
import { storyMaps as maps } from './maps';
import { getPlacedScenery,sceneryAssets,placedSceneryFootprints } from './placed-scenery';
import { isBuildingScenery,sceneryAnimationTextureKeys,sampleSceneryFrame,type SceneryAnimation,type SceneryAnimationManifest } from './scenery-animation';
import { WorldScenery } from './world-scenery';
const artifacts=import.meta.glob(['../public/assets/*animation*.json','../public/assets/*building*.json'],{eager:true,import:'default'});
const readAsset=(name:string): any=>artifacts[`../public/assets/${name}`];

describe('authored sprite worlds',()=>{
  for(const map of maps)for(const period of ['day','night'] as const)it(`${map.name} has high resolution static buildings and complete calm ${period} scenery`,()=>{
    expect(map.asset).toMatch(/-terrain\.webp$/);
    const specs=getPlacedScenery(map.id);
    const manifest=readAsset(`${map.id}-${period}-animations.json`) as SceneryAnimationManifest;
    expect(specs.length).toBeGreaterThanOrEqual(70);
    expect(new Set(specs.map(spec=>spec.id)).size).toBe(specs.length);
    expect(Object.keys(manifest.assets)).toHaveLength(32);
    for(const spec of specs){
      expect(sceneryAssets).toContain(spec.asset);
      const animation=manifest.assets[spec.frame??spec.asset];
      expect(animation,`missing authored animation for ${spec.id}`).toBeDefined();
      const building=isBuildingScenery(spec.frame??spec.asset);
      expect(animation.frames).toHaveLength(building?1:6);
      expect(new Set(animation.frames).size).toBe(building?1:6);
      expect(animation.referenceWidth).toBeGreaterThan(0);
      expect(animation.key).toContain(`-${period}-`);
      expect(animation.fps).toBeLessThanOrEqual(4);
      expect([animation.originX,animation.originY].every(value=>value>=0&&value<=1)).toBe(true);
      const atlas=readAsset(`${animation.key}.json`);
      const sizes=animation.frames.map(name=>atlas.frames[name].sourceSize);
      expect(sizes.every((size:{w:number;h:number})=>size.w===sizes[0].w&&size.h===sizes[0].h)).toBe(true);
      expect([spec.x,spec.y,spec.width].every(Number.isFinite)).toBe(true);
      if(building){
        expect(animation.base,`missing static base for ${spec.id}`).toBeDefined();
        const baseAtlas=readAsset(`${animation.base!.key}.json`);
        const base=baseAtlas.frames[animation.base!.frame].frame;
        expect([base.w,base.h]).toEqual([animation.width,animation.height]);
        expect(Math.max(base.w,base.h),`${spec.id}: native building resolution`).toBeGreaterThanOrEqual(400);
        if(spec.width>=200){
          expect(Object.keys(baseAtlas.frames),`${spec.id}: dedicated large-building texture`).toHaveLength(1);
          expect(baseAtlas.frames[animation.base!.frame].source.standalone).toBe(true);
          expect(Math.max(base.w,base.h)).toBeGreaterThanOrEqual(800);
        }
        expect(animation.frames).toEqual([animation.base!.frame]);
        expect(animation.fps).toBe(0);
        expect(animation.overlays??[]).toEqual([]);
        expect(baseAtlas.meta.size.w).toBeLessThanOrEqual(2048);
        expect(baseAtlas.meta.size.h).toBeLessThanOrEqual(2048);
        expect(base.x+base.w).toBeLessThanOrEqual(baseAtlas.meta.size.w);
        expect(base.y+base.h).toBeLessThanOrEqual(baseAtlas.meta.size.h);
        const referenceWidth=animation.base!.referenceWidth??animation.referenceWidth;
        expect(referenceWidth).toBeGreaterThan(0);
        const originX=animation.base!.originX??animation.originX,originY=animation.base!.originY??animation.originY;
        expect([originX,originY].every(value=>value>=0&&value<=1)).toBe(true);
      }
    }
    const trees=specs.filter(spec=>spec.asset==='tree');
    expect(new Set(trees.map(spec=>spec.frame??spec.asset)).size).toBeGreaterThanOrEqual(5);
    expect(placedSceneryFootprints(map.id).length).toBeGreaterThan(30);
  });
  for(const map of maps)it(`${map.name} switches every object to a separately painted night sequence`,()=>{
    const day=readAsset(`${map.id}-day-animations.json`) as SceneryAnimationManifest;
    const night=readAsset(`${map.id}-night-animations.json`) as SceneryAnimationManifest;
    expect(day.terrain??map.id).not.toBe(night.terrain);
    for(const spec of getPlacedScenery(map.id)){
      const name=spec.frame??spec.asset;
      expect(day.assets[name].key).not.toBe(night.assets[name].key);
      expect(night.assets[name].fps).toBeLessThanOrEqual(day.assets[name].fps);
    }
  });
  it('plays every authored frame and closes the cycle with independently phased instances',()=>{
    const animation:SceneryAnimation={key:'painted',frames:['0','1','2','3','4','5'],fps:4,width:200,height:250,referenceWidth:200,originX:.5,originY:1};
    expect(new Set(Array.from({length:6},(_,i)=>sampleSceneryFrame(animation,'tree',i/4))).size).toBe(6);
    expect(sampleSceneryFrame(animation,'tree',.33)).toBe(sampleSceneryFrame(animation,'tree',1.83));
    expect(new Set(['one','two','three','four','five','six'].map(id=>sampleSceneryFrame(animation,id,0))).size).toBeGreaterThan(1);
    expect(animation.frames).toContain(sampleSceneryFrame(animation,'tree',NaN));
  });
});

function mockScene(layered=true,options:{highResolution?:boolean;staticBuildings?:boolean}={}){
  const sprites:{blend:boolean;originX:number;originY:number;depth:number;key:string;x:number;y:number;frame:string;visible:boolean;destroy:ReturnType<typeof vi.fn>;setFrame:ReturnType<typeof vi.fn>;setScale:ReturnType<typeof vi.fn>;setOrigin:ReturnType<typeof vi.fn>;setDepth:ReturnType<typeof vi.fn>;setFlipX:ReturnType<typeof vi.fn>;setAlpha:ReturnType<typeof vi.fn>}[]=[];
  const specs=getPlacedScenery('lindenhafen');
  const assets:Record<string,SceneryAnimation>={};
  for(const spec of specs){
    const name=spec.frame??spec.asset;
    assets[name]={key:'painted',frames:Array.from({length:6},(_,i)=>`${name}-${i}`),fps:4,width:200,height:250,referenceWidth:200,originX:.4,originY:.95};
    if(layered&&isBuildingScenery(name)){
      assets[name].base={key:'bases',frame:name};
      if(options.highResolution)assets[name].base={key:'bases',frame:name,referenceWidth:800,originX:.3,originY:.98};
      assets[name].overlays=options.staticBuildings?[]:[{...assets[name],id:'window',key:'details',frames:Array.from({length:6},(_,i)=>`${name}-window-${i}`),offsetX:25,offsetY:-70}];
      if(options.staticBuildings){assets[name].frames=[name];assets[name].fps=0;}
    }
  }
  const frame={width:200,height:250};
  const scene={cache:{json:{get:()=>({assets})}},textures:{exists:()=>true,get:(key:string)=>({has:()=>true,get:()=>key==='bases'&&options.highResolution?{width:800,height:1000}:frame}),createCanvas:vi.fn(()=>{throw Error('Procedural scenery is forbidden')})},
    add:{sprite:vi.fn((x:number,y:number,key:string,name:string)=>{
      const sprite={blend:sprites.some(s=>s.key===key&&s.x===x&&s.y===y&&s.frame===name),originX:0,originY:0,depth:0,x,y,key,frame:name,visible:true,setAlpha:vi.fn(),setOrigin:vi.fn(),setScale:vi.fn(),setDepth:vi.fn(),setFlipX:vi.fn(),setVisible:vi.fn(),setFrame:vi.fn(),destroy:vi.fn()};
      for(const method of ['setOrigin','setScale','setDepth','setFlipX','setAlpha'] as const)sprite[method].mockReturnValue(sprite);
      sprite.setOrigin.mockImplementation((x:number,y:number)=>{sprite.originX=x;sprite.originY=y;return sprite});
      sprite.setDepth.mockImplementation((depth:number)=>{sprite.depth=depth;return sprite});
      sprite.setVisible.mockImplementation((visible:boolean)=>{sprite.visible=visible;return sprite});
      sprite.setFrame.mockImplementation((frame:string)=>{sprite.frame=frame;return sprite});
      sprites.push(sprite);return sprite;
    })}};
  return {scene:scene as unknown as Phaser.Scene,sprites,raw:scene};
}

it('changes painted sprite frames, keeps foundations upright, freezes, culls and cleans up',()=>{
  const mock=mockScene(),scenery=new WorldScenery(mock.scene,'lindenhafen');
  expect(scenery.animatedObjectCount).toBe(scenery.objectCount);
  const view={x:0,y:0,right:1536,bottom:1124};
  scenery.update(.32,view);
  const first=mock.sprites.map(sprite=>sprite.frame);
  scenery.update(.62,view);
  expect(mock.sprites.map(sprite=>sprite.frame)).not.toEqual(first);
  const frozen=mock.sprites.map(sprite=>sprite.frame);
  scenery.setReducedMotion(true);scenery.update(42,view);
  expect(mock.sprites.map(sprite=>sprite.frame)).toEqual(frozen);
  scenery.setReducedMotion(false);scenery.update(43,view);
  expect(mock.sprites.map(sprite=>sprite.frame)).not.toEqual(frozen);
  for(const sprite of mock.sprites){expect(sprite.setScale).toHaveBeenCalledTimes(1);expect(sprite.setScale.mock.calls[0][0]).toBeGreaterThan(0);expect(sprite.setOrigin.mock.calls[0]).toEqual(sprite.key==='details'?[.5,.5]:[.4,.95])}
  const bases=mock.sprites.filter(sprite=>sprite.key!=='details'&&!sprite.blend);
  expect(bases.every((sprite,i)=>sprite.x===getPlacedScenery('lindenhafen')[i].x&&sprite.y===getPlacedScenery('lindenhafen')[i].y)).toBe(true);
  expect(mock.raw.textures.createCanvas).not.toHaveBeenCalled();
  scenery.update(44,{x:5000,y:5000,right:5100,bottom:5100});expect(mock.sprites.every(sprite=>!sprite.visible)).toBe(true);
  scenery.update(44,view);expect(mock.sprites.some(sprite=>sprite.visible)).toBe(true);
  scenery.setVisible(false);scenery.update(44,view);expect(mock.sprites.every(sprite=>!sprite.visible)).toBe(true);
  scenery.destroy();expect(scenery.objectCount).toBe(0);expect(mock.sprites.every(sprite=>sprite.destroy.mock.calls.length===1)).toBe(true);
});

it('keeps architecture fixed while registered details animate and mirror with their base',()=>{
  const mock=mockScene(),scenery=new WorldScenery(mock.scene,'lindenhafen');
  const view={x:0,y:0,right:1536,bottom:1124};
  for(const spec of getPlacedScenery('lindenhafen').filter(spec=>isBuildingScenery(spec.frame??spec.asset))){
    const base=mock.sprites.find(sprite=>sprite.key==='bases'&&sprite.x===spec.x&&sprite.y===spec.y)!;
    const scale=spec.width/200;
    const detail=mock.sprites.find(sprite=>sprite.key==='details'&&Math.abs(sprite.x-(spec.x+(spec.flipX?15:25)*scale))<1e-8&&sprite.y===spec.y-70*scale)!;
    expect(detail).toBeDefined();
    expect(detail.setFlipX.mock.calls).toEqual(base.setFlipX.mock.calls);
    expect(detail.setDepth.mock.calls).toEqual(base.setDepth.mock.calls);
  }
  const bases=mock.sprites.filter(sprite=>sprite.key==='bases'),first=bases.map(sprite=>sprite.frame);
  for(let i=0;i<12;i++)scenery.update(i/4,view);
  expect(bases.map(sprite=>sprite.frame)).toEqual(first);
  expect(bases.every(sprite=>sprite.setFrame.mock.calls.length===0)).toBe(true);
  expect(mock.sprites.filter(sprite=>sprite.key==='details').every(sprite=>sprite.setFrame.mock.calls.length>0)).toBe(true);
});

it('scales high resolution bases independently while legacy details retain their size and mirrored registration',()=>{
  const mock=mockScene(true,{highResolution:true}),scenery=new WorldScenery(mock.scene,'lindenhafen');
  const specs=getPlacedScenery('lindenhafen').filter(spec=>isBuildingScenery(spec.frame??spec.asset));
  expect(specs.some(spec=>spec.flipX)).toBe(true);
  expect(specs.some(spec=>!spec.flipX)).toBe(true);
  for(const spec of specs){
    const base=mock.sprites.find(sprite=>sprite.key==='bases'&&sprite.x===spec.x&&sprite.y===spec.y)!;
    expect(base.setScale.mock.calls).toEqual([[spec.width/800]]);
    expect(base.setOrigin.mock.calls).toEqual([[.3,.98]]);
    const detailScale=spec.width/200;
    const details=mock.sprites.filter(sprite=>sprite.key==='details'&&Math.abs(sprite.x-(spec.x+(spec.flipX?15:25)*detailScale))<1e-8&&sprite.y===spec.y-70*detailScale);
    expect(details).toHaveLength(2);
    for(const detail of details){
      expect(detail.setScale.mock.calls).toEqual([[detailScale]]);
      expect(detail.setFlipX.mock.calls).toEqual(base.setFlipX.mock.calls);
    }
  }
  scenery.destroy();
});

it('keeps one high resolution static sprite per building throughout animation, fades and culling',()=>{
  const mock=mockScene(true,{highResolution:true,staticBuildings:true}),scenery=new WorldScenery(mock.scene,'lindenhafen');
  const buildingSpecs=getPlacedScenery('lindenhafen').filter(spec=>isBuildingScenery(spec.frame??spec.asset));
  const bases=mock.sprites.filter(sprite=>sprite.key==='bases');
  expect(bases).toHaveLength(buildingSpecs.length);
  expect(bases.every(sprite=>!sprite.blend)).toBe(true);
  expect(mock.sprites.some(sprite=>sprite.key==='details')).toBe(false);
  expect(scenery.animatedObjectCount).toBe(scenery.objectCount-buildingSpecs.length);
  const initial=bases.map(sprite=>sprite.frame),view={x:0,y:0,right:1536,bottom:1124};
  for(const time of [0,.2,1,7,30,400])scenery.update(time,view);
  scenery.setAlpha(.35);
  scenery.setReducedMotion(true);scenery.update(900,view);
  expect(bases.map(sprite=>sprite.frame)).toEqual(initial);
  expect(bases.every(sprite=>sprite.setFrame.mock.calls.length===0)).toBe(true);
  expect(bases.every(sprite=>sprite.setAlpha.mock.lastCall![0]===.35)).toBe(true);
  const spec=buildingSpecs[0],base=bases.find(sprite=>sprite.x===spec.x&&sprite.y===spec.y)!;
  scenery.update(901,{x:spec.x+spec.width*.75,y:spec.y-10,right:spec.x+spec.width,bottom:spec.y+10});
  expect(base.visible).toBe(false);
  scenery.update(902,view);expect(base.visible).toBe(true);
  scenery.destroy();
  expect(bases.every(sprite=>sprite.destroy.mock.calls.length===1)).toBe(true);
});

it('freezes whole-building legacy animations if layered assets are unavailable',()=>{
  const mock=mockScene(false),scenery=new WorldScenery(mock.scene,'lindenhafen');
  scenery.update(5,{x:0,y:0,right:1536,bottom:1124});
  getPlacedScenery('lindenhafen').forEach((spec,i)=>{
    if(isBuildingScenery(spec.frame??spec.asset))expect(mock.sprites.filter(sprite=>!sprite.blend)[i].setFrame).not.toHaveBeenCalled();
  });
});

it('loads and releases the complete layer set without requiring unused architectural sequences',()=>{
  const manifest=readAsset('lindenhafen-day-animations.json') as SceneryAnimationManifest;
  const keys=sceneryAnimationTextureKeys(manifest);
  expect(keys).toContain('lindenhafen-day-building-bases');
  expect(keys.some(key=>key.includes('building-details'))).toBe(false);
  expect(keys).not.toContain('lindenhafen-day-animation-0');
  expect(keys).toContain(manifest.assets.tree.key);
  expect(new Set(keys).size).toBe(keys.length);
});

it('keeps animated scenery opaque throughout frame blends and honors the world fade',()=>{
  const mock=mockScene(),scenery=new WorldScenery(mock.scene,'lindenhafen');
  const view={x:0,y:0,right:1536,bottom:1124};
  const stall=getPlacedScenery('lindenhafen').find(spec=>spec.asset==='stall')!;
  const sprites=mock.sprites.filter(sprite=>sprite.x===stall.x&&sprite.y===stall.y);
  expect(sprites).toHaveLength(2);
  const current=sprites.find(sprite=>!sprite.blend)!,next=sprites.find(sprite=>sprite.blend)!;
  for(const opacity of [1,.4]){
    scenery.setAlpha(opacity);
    for(let frame=0;frame<20;frame++){
      scenery.update(frame/30,view);
      const currentAlpha=current.setAlpha.mock.lastCall![0],nextAlpha=next.setAlpha.mock.lastCall![0];
      expect(currentAlpha).toBe(opacity);
      expect(nextAlpha).toBeGreaterThanOrEqual(0);
      expect(nextAlpha).toBeLessThanOrEqual(opacity);
      // Source-over coverage of opaque frames must not dip midway through a blend.
      if(opacity===1)expect(nextAlpha+currentAlpha*(1-nextAlpha)).toBe(1);
    }
  }
  scenery.setReducedMotion(true);scenery.update(10,view);
  expect(current.setAlpha.mock.lastCall![0]).toBe(.4);
  expect(next.setAlpha.mock.lastCall![0]).toBe(0);
});

it('selects the requested time-of-day manifest when creating scenery',()=>{
  const mock=mockScene();
  const get=vi.fn(mock.raw.cache.json.get);
  mock.raw.cache.json.get=get;
  new WorldScenery(mock.scene,'lindenhafen','night');
  expect(get).toHaveBeenCalledWith('lindenhafen-night-animations');
});

it('hides exterior sprites immediately while room rendering pauses exterior updates',()=>{
  const mock=mockScene(),scenery=new WorldScenery(mock.scene,'lindenhafen');
  const view={x:0,y:0,right:1536,bottom:1124};
  scenery.update(1,view);
  expect(mock.sprites.some(sprite=>sprite.visible)).toBe(true);
  scenery.setVisible(false);
  expect(mock.sprites.every(sprite=>!sprite.visible)).toBe(true);
  scenery.setVisible(true);
  scenery.update(2,view);
  expect(mock.sprites.some(sprite=>sprite.visible)).toBe(true);
  scenery.destroy();
});
