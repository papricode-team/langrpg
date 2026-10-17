import {describe,it,expect} from 'vitest';
import {terrainObjects,terrainObject,sampleDetailMotion} from './terrain-objects';
import {paletteChoices,newPlacement} from './world-edit-palette';
import {getWorldScene} from './scene-data';
import {getSceneryGeometryMap} from './scene-schema';
import {sceneryFootprints} from './placed-scenery';
import {sizeRange} from './world-edit-rules';
describe('small terrain scenery',()=>{
 it('makes every native HD cutout placeable in every town with its intended physical base',()=>{
  expect(terrainObjects).toHaveLength(32);
  for(const map of ['lindenhafen','waldruh','nebelstadt'])for(const object of terrainObjects){
   const choices=paletteChoices(map).filter(choice=>choice.frame===object.id);expect(choices).toHaveLength(1);
   const choice=choices[0];
   const item=newPlacement(getWorldScene(map),choice,{x:300,y:400});
   expect(item.width).toBe(object.worldWidth);expect(item.collidable).toBe(object.collidable);
   expect(Math.min(object.width,object.height)).toBeGreaterThanOrEqual(1024);
   expect(sceneryFootprints([item],getSceneryGeometryMap(map)).length).toBe(object.collidable?1:0);
  }
 });
 it('offers summer planting with trunk-only tree bases and walkable fountain paving',()=>{
  for(const id of ['town-linden','town-plane','town-chestnut','town-birch','town-beech']){
   const object=terrainObject(id)!;
   expect(object.role).toBe('tree');expect(object.collidable).toBe(true);
   expect(object.geometry.footprint!.every(([x,y])=>Math.abs(x)<100&&Math.abs(y)<60)).toBe(true);
  }
  for(const id of ['town-chestnut','town-birch','town-beech']){
   const object=terrainObject(id)!;
   expect(object.motion).toBe('still');expect(object.worldWidth).toBe(terrainObject('town-linden')!.worldWidth);
   expect(object.geometry.footprint).toEqual(terrainObject('town-linden')!.geometry.footprint);
  }
  for(const id of ['town-boxwood','town-hedge','town-ivy','town-garden-statue'])expect(terrainObject(id)!.collidable).toBe(true);
  const paving=terrainObject('town-radial-cobble')!;
  expect(paving.layer).toBe('ground');expect(paving.originY).toBe(.5);
  expect(paving.collidable).toBe(false);expect(paving.geometry.footprint).toEqual([]);
  expect(paving.geometry.visualBounds!.top).toBeLessThan(0);expect(paving.geometry.visualBounds!.bottom).toBeGreaterThan(0);
 });
 it('offers distinct station buildings, rolling stock and repeatable walkable rails',()=>{
  const choices=paletteChoices('lindenhafen');
  for(const id of ['station-ticket-hall','station-office']){
   const choice=choices.find(choice=>choice.frame===id)!;
   expect(choice.asset).toBe('station');expect(choice.rooms).toContain('inn');
  }
  expect(choices.find(choice=>choice.frame==='station-platform-canopy')!.rooms).toEqual([]);
  for(const id of ['railway-locomotive','railway-carriage'])expect(choices.find(choice=>choice.frame===id)!.asset).toBe('train');
  const rails=terrainObject('railway-rails')!;
  expect(rails.layer).toBe('ground');expect(rails.collidable).toBe(false);expect(rails.geometry.footprint).toEqual([]);
  for(const choice of choices.filter(choice=>/^(station-|railway-)/.test(choice.frame))){
   const item=newPlacement(getWorldScene('lindenhafen'),choice,{x:1200,y:800});
   const range=sizeRange('lindenhafen',item);
   expect(item.width).toBeGreaterThanOrEqual(range.min);expect(item.width).toBeLessThanOrEqual(range.max);
  }
 });
 it('keeps motion bounded, deterministic and still when reduced motion is enabled',()=>{
  for(const object of terrainObjects)for(const time of [0,10,1e6]){
   const motion=sampleDetailMotion(object.motion,object.id,time);
   expect(motion).toEqual(sampleDetailMotion(object.motion,object.id,time));
   expect(Math.abs(motion.angle)).toBeLessThanOrEqual(.025);expect(Math.abs(motion.y)).toBeLessThanOrEqual(1.2);
   expect(motion.alpha).toBeGreaterThanOrEqual(.91);expect(motion.alpha).toBeLessThanOrEqual(1);
   expect(sampleDetailMotion(object.motion,object.id,time,true)).toEqual({angle:0,y:0,alpha:1});
  }
 });
});
