import {describe,expect,it} from 'vitest';
import {foundationGround,foundationPatches,foundationSites,type FoundationGround} from './foundation-dressing';
import {sceneDocument} from './scene-data';
import {groundFromModularTerrain} from './ground-convert';

const spec={id:'garden-house',asset:'house' as const,x:100,y:200,width:256};
const line=[Array.from({length:25},(_,i)=>[-120+i*10,0] as const)];
const paving:FoundationGround={colour:[202,182,154],vegetation:0,water:0};
const grass:FoundationGround={colour:[115,124,57],vegetation:1,water:0};

describe('foundation dirt and vegetation',()=>{
  it('samples the painted ground under a point',()=>{
    const scene=sceneDocument.maps.lindenhafen,rect=(x:number,y:number,w:number,h:number)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]] as const;
    const modular=groundFromModularTerrain({base:'meadow',surfaces:[{material:'deep-water',polygon:rect(0,0,200,200)},{material:'timber',polygon:rect(0,80,200,40)}]},scene.width,scene.height);
    const snowy=groundFromModularTerrain({base:'snow',surfaces:[]},scene.width,scene.height);
    expect(foundationGround('lindenhafen',30,30,modular).water).toBe(1);
    expect(foundationGround('lindenhafen',30,100,modular).water).toBe(0);
    expect(foundationGround('lindenhafen',300,300,modular).vegetation).toBe(1);
    expect(foundationGround('lindenhafen',30,100,modular).vegetation).toBe(0);
    expect(foundationGround('lindenhafen',300,300,snowy).colour).not.toEqual(foundationGround('lindenhafen',300,300,modular).colour);
  });
  it('samples every town\'s own painted ground',()=>{
    for(const world of Object.values(sceneDocument.maps))for(const [x,y] of [[100,100],[world.width/2,world.height/2],[world.width-50,world.height-50]]){
      const sample=foundationGround(world.id,x,y);
      expect(sample.colour.every(c=>c>=0&&c<=255)).toBe(true);
      expect(sample.vegetation).toBeGreaterThanOrEqual(0);
      expect(sample.water).toBeLessThanOrEqual(1);
    }
  });
  it('spaces marks independently of contour resolution and never bridges detached bases',()=>{
    expect(foundationSites([[[0,0],[20,0],[100,0],[120,0]]])).toEqual([[3,0],[11,0],[19,0],[103,0],[111,0],[119,0]]);
    expect(foundationSites([[[0,0],[5,0],[10,0],[15,0],[20,0]]])).toEqual([[3,0],[11,0],[19,0]]);
  });
  it('matches local colours, puts more growth on grass and keeps sparse tufts on paving',()=>{
    const sparse=foundationPatches(line,spec,undefined,()=>paving),lush=foundationPatches(line,spec,undefined,()=>grass);
    expect(sparse[0].soil).not.toEqual(lush[0].soil);
    expect(sparse[0].moss).not.toEqual(lush[0].moss);
    expect(sparse.filter(p=>p.tuft).length).toBeGreaterThanOrEqual(2);
    expect(lush.filter(p=>p.tuft).length).toBeGreaterThan(sparse.filter(p=>p.tuft).length);
    expect(lush.filter(p=>p.tuft).length).toBeLessThanOrEqual(7);
    for(const a of lush.filter(p=>p.tuft))for(const b of lush.filter(p=>p.tuft&&p!==a))expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThan(18);
  });
  it('leaves normal and mirrored door approaches clear and never grows on water',()=>{
    const geometry={referenceWidth:256,door:{x:25,y:-8,width:40,height:8}};
    for(const flipX of [false,true]){
      const patches=foundationPatches(line,{...spec,flipX},geometry,()=>grass);
      const approach=patches.filter(p=>{const x=p.x*(flipX?-1:1);return x>17&&x<73;});
      expect(approach.length).toBeGreaterThan(0);
      expect(approach.every(p=>!p.growth&&!p.tuft)).toBe(true);
      expect(patches.some(p=>p.tuft)).toBe(true);
    }
    expect(foundationPatches(line,spec,undefined,()=>({...grass,water:1}))).toEqual([]);
  });
  it('keeps the arrangement stable through lighting changes but varies repeated houses',()=>{
    const a=foundationPatches(line,spec,undefined,()=>grass);
    expect(foundationPatches(line,spec,undefined,()=>grass)).toEqual(a);
    expect(foundationPatches(line,{...spec,id:'next-house'},undefined,()=>grass)).not.toEqual(a);
    const positions:number[][]=[];
    foundationPatches(line,{...spec,width:512},undefined,(x,y)=>{positions.push([x,y]);return grass;});
    expect(positions[0]).toEqual([spec.x-117*2,spec.y+8]);
  });
});
