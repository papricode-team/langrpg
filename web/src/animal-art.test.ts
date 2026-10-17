import { describe, expect, it } from 'vitest';
import { animalArtFrame } from './animal-art';
import { advanceAnimal, createAnimal } from './animal-behavior';

describe('painted animal pose selection', () => {
  it('uses rear poses when walking north and keeps left/right as sprite mirroring', () => {
    const animal=createAnimal('cat',{x:40,y:40});animal.state='walk';animal.remaining=4;animal.destination={x:10,y:10};
    advanceAnimal(animal,.1,{move:(p,d)=>({x:p.x+d.x,y:p.y+d.y}),closestPoint:(x,y)=>({x,y}),findPath:(_p,q)=>[q]},undefined,false);
    expect(animal.facing).toBe(-1);expect(animal.facingBack).toBe(true);
    expect(animalArtFrame(animal,1,false)).toMatch(/^1-walk-back-[0-3]$/);
    animal.destination={x:60,y:60};
    advanceAnimal(animal,.1,{move:(p,d)=>({x:p.x+d.x,y:p.y+d.y}),closestPoint:(x,y)=>({x,y}),findPath:(_p,q)=>[q]},undefined,false);
    expect(animal.facing).toBe(1);expect(animal.facingBack).toBe(false);
    expect(animalArtFrame(animal,1,false)).toMatch(/^1-walk-[0-3]$/);
  });
  it('plays painted pecking for feed and holds a readable low-head pose with reduced motion', () => {
    const animal=createAnimal('chicken',{x:0,y:0});animal.state='feed';animal.stateTime=.5;
    expect(animalArtFrame(animal,2,false)).toBe('2-forage-2');
    expect(animalArtFrame(animal,2,true)).toBe('2-forage-1');
  });
  it('keeps a resting silhouette in both breathing frames', () => {
    const animal=createAnimal('sheep',{x:0,y:0});animal.state='rest';
    expect(animalArtFrame(animal,0,false)).toBe('0-rest-0');animal.stateTime=2;
    expect(animalArtFrame(animal,0,false)).toBe('0-rest-1');
    expect(animalArtFrame(animal,0,true)).toBe('0-rest-0');
  });
});
