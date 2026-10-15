import {describe,it,expect} from 'vitest';
import {terrainObjects,sampleDetailMotion} from './terrain-objects';
import {paletteChoices,newPlacement} from './world-edit-palette';
import {getWorldScene} from './scene-data';
import {getSceneryGeometryMap} from './scene-schema';
import {sceneryFootprints} from './placed-scenery';
describe('small terrain scenery',()=>{
 it('makes every native HD cutout placeable in every town with its intended physical base',()=>{
  expect(terrainObjects).toHaveLength(16);
  for(const map of ['lindenhafen','waldruh','nebelstadt'])for(const object of terrainObjects){
   const choice=paletteChoices(map).find(choice=>choice.frame===object.id)!;expect(choice).toBeDefined();
   const item=newPlacement(getWorldScene(map),choice,{x:300,y:400});
   expect(item.width).toBe(object.worldWidth);expect(item.collidable).toBe(object.collidable);
   expect(Math.min(object.width,object.height)).toBeGreaterThanOrEqual(1024);
   expect(sceneryFootprints([item],getSceneryGeometryMap(map)).length).toBe(object.collidable?1:0);
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
