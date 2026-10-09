import { describe,expect,it,vi } from 'vitest';
import type * as Phaser from 'phaser';
import { maps } from './maps';
import { getPlacedScenery,sceneryAssets,placedSceneryFootprints } from './placed-scenery';
import { sampleSceneryFrame,type SceneryAnimation,type SceneryAnimationManifest } from './scenery-animation';
import { WorldScenery } from './world-scenery';
const artifacts=import.meta.glob('../public/assets/*animation*.json',{eager:true,import:'default'});
const readAsset=(name:string): any=>artifacts[`../public/assets/${name}`];

describe('authored sprite worlds',()=>{
  for(const map of maps)for(const period of ['day','night'] as const)it(`${map.name} has a complete calm ${period} animation set`,()=>{
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
      expect(animation.frames).toHaveLength(6);
      expect(new Set(animation.frames).size).toBe(6);
      expect(animation.referenceWidth).toBeGreaterThan(0);
      expect(animation.key).toContain(`-${period}-`);
      expect(animation.fps).toBeLessThanOrEqual(4);
      expect([animation.originX,animation.originY].every(value=>value>=0&&value<=1)).toBe(true);
      const atlas=readAsset(`${animation.key}.json`);
      const sizes=animation.frames.map(name=>atlas.frames[name].sourceSize);
      expect(sizes.every((size:{w:number;h:number})=>size.w===sizes[0].w&&size.h===sizes[0].h)).toBe(true);
      expect([spec.x,spec.y,spec.width].every(Number.isFinite)).toBe(true);
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

function mockScene(){
  const sprites:{frame:string;visible:boolean;destroy:ReturnType<typeof vi.fn>;setFrame:ReturnType<typeof vi.fn>;setScale:ReturnType<typeof vi.fn>;setOrigin:ReturnType<typeof vi.fn>}[]=[];
  const specs=getPlacedScenery('lindenhafen');
  const assets:Record<string,SceneryAnimation>={};
  for(const spec of specs){const name=spec.frame??spec.asset;assets[name]={key:'painted',frames:Array.from({length:6},(_,i)=>`${name}-${i}`),fps:4,width:200,height:250,referenceWidth:200,originX:.5,originY:.95}}
  const frame={width:200,height:250};
  const scene={cache:{json:{get:()=>({assets})}},textures:{exists:()=>true,get:()=>({has:()=>true,get:()=>frame}),createCanvas:vi.fn(()=>{throw Error('Procedural scenery is forbidden')})},
    add:{sprite:vi.fn((_x:number,_y:number,_key:string,name:string)=>{
      const sprite={frame:name,visible:true,setOrigin:vi.fn(),setScale:vi.fn(),setDepth:vi.fn(),setFlipX:vi.fn(),setVisible:vi.fn(),setFrame:vi.fn(),destroy:vi.fn()};
      for(const method of ['setOrigin','setScale','setDepth','setFlipX'] as const)sprite[method].mockReturnValue(sprite);
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
  for(const sprite of mock.sprites){expect(sprite.setScale).toHaveBeenCalledTimes(1);expect(sprite.setScale.mock.calls[0][0]).toBeGreaterThan(0);expect(sprite.setOrigin.mock.calls[0]).toEqual([.5,.95])}
  expect(mock.raw.add.sprite.mock.calls.every((call,i)=>call[0]===getPlacedScenery('lindenhafen')[i].x&&call[1]===getPlacedScenery('lindenhafen')[i].y)).toBe(true);
  expect(mock.raw.textures.createCanvas).not.toHaveBeenCalled();
  scenery.update(44,{x:5000,y:5000,right:5100,bottom:5100});expect(mock.sprites.every(sprite=>!sprite.visible)).toBe(true);
  scenery.update(44,view);expect(mock.sprites.some(sprite=>sprite.visible)).toBe(true);
  scenery.setVisible(false);scenery.update(44,view);expect(mock.sprites.every(sprite=>!sprite.visible)).toBe(true);
  scenery.destroy();expect(scenery.objectCount).toBe(0);expect(mock.sprites.every(sprite=>sprite.destroy.mock.calls.length===1)).toBe(true);
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
