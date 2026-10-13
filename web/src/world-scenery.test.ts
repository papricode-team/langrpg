import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import { depthAt, worldDepth, isCharacterOccluded, updateOcclusion } from './world-depth';
import { WorldScenery, type SceneryOcclusionFactory } from './world-scenery';
import { getSceneryGeometry } from './scene-schema';
import { sceneryFootprints } from './placed-scenery';
import { NavigationGrid } from './navigation';

describe('world depth segments', () => {
  const spec={x:200,y:300,width:100,sortLine:[[-100,-80],[0,-40],[100,0]] as const};
  const geometry={referenceWidth:200};
  it('interpolates a diagonal polyline in reference pixels and clamps its ends', () => {
    expect(depthAt(spec,150,geometry)).toBe(260);
    expect(depthAt(spec,175,geometry)).toBe(270);
    expect(depthAt(spec,225,geometry)).toBe(290);
    expect(depthAt(spec,999,geometry)).toBe(300);
    expect(depthAt({...spec,sortLine:undefined},175,geometry)).toBe(300);
  });
  it('mirrors the wall boundary with flipped art and keeps integer ties stable', () => {
    expect(depthAt({...spec,flipX:true},175,geometry)).toBe(290);
    expect(worldDepth(175.99,'prop')).toBe(701);
    expect(worldDepth(175,'character')).toBe(702);
    expect(worldDepth(175,'label')).toBe(703);
  });
});

describe('painted doorway baselines', () => {
  for(const town of ['lindenhafen','waldruh','nebelstadt'])for(const frame of ['house-inn','house-bakery','house-grocery'])for(const flipX of [false,true]){
    it(`${town} ${frame}${flipX?' mirrored':''} keeps the sill walkable and the character in front`, () => {
      const geometry=getSceneryGeometry(town,{asset:'house',frame})!,door=geometry.door!;
      const placement={id:'door-owner',asset:'house' as const,frame,x:800,y:800,width:230,flipX};
      const scale=placement.width/geometry.referenceWidth;
      const point={x:placement.x+(door.x+door.width/2)*scale*(flipX?-1:1),y:placement.y+(door.y+door.height)*scale};
      expect(worldDepth(depthAt(placement,point.x,geometry))).toBeLessThan(worldDepth(point.y,'character'));
      // Neighbouring strips of an 8-unit render split must also sort in front.
      for(const x of [point.x-4,point.x+4])expect(worldDepth(depthAt(placement,x,geometry))).toBeLessThan(worldDepth(point.y,'character'));
      const footprints=sceneryFootprints([placement],{assets:{[frame]:geometry}});
      const navigation=new NavigationGrid([[[0,0],[1600,0],[1600,1600],[0,1600]]],footprints,{width:1600,height:1600});
      expect(navigation.isWalkable(point.x,point.y)).toBe(true);
    });
  }
});

describe('occlusion fades', () => {
  const character={id:'player',x:50,y:100,depth:worldDepth(100,'character')};
  const bounds={x:20,y:10,right:80,bottom:140};
  it('requires body intersection and a higher local scenery depth', () => {
    expect(isCharacterOccluded(character,bounds,worldDepth(101))).toBe(true);
    expect(isCharacterOccluded(character,bounds,worldDepth(100))).toBe(false);
    expect(isCharacterOccluded({...character,x:150},bounds,worldDepth(101))).toBe(false);
    expect(isCharacterOccluded({...character,y:220},bounds,worldDepth(230))).toBe(false);
  });
  it('fades in over 150ms and retains outgoing centres for a 300ms fade', () => {
    let circles=updateOcclusion([],[character],.075);
    expect(circles[0].strength).toBeCloseTo(.5);
    circles=updateOcclusion(circles,[character],.075);
    expect(circles[0].strength).toBe(1);
    const chest=circles[0].y;
    circles=updateOcclusion(circles,[],.15);
    expect(circles[0].strength).toBeCloseTo(.5);
    expect(circles[0].y).toBe(chest);
    expect(updateOcclusion(circles,[],.15)).toEqual([]);
  });
  it('uses instant state in reduced motion and prioritises four active people', () => {
    const people=Array.from({length:7},(_,index)=>({...character,id:`person-${index}`}));
    const circles=updateOcclusion([],people,0,true);
    expect(circles.map(circle=>circle.id)).toEqual(['person-0','person-1','person-2','person-3']);
    expect(circles.every(circle=>circle.strength===1)).toBe(true);
    expect(updateOcclusion(circles,[],0,true)).toEqual([]);
  });
});

function fixture(period:'day'|'night'='day',inheritSortLine=false) {
  const canonical=getSceneryGeometry('lindenhafen',{asset:'house'})!;
  const reference=canonical.referenceWidth*(period==='night'?.8:1);
  const initial={name:'house',width:reference,height:reference,cutX:0,cutY:0,cutHeight:reference,sourceIndex:0,trimmed:false,rotated:false};
  const frames=new Map([['house',initial]]);
  const texture={key:'test-house',has:(name:string)=>frames.has(name),get:(name:string)=>frames.get(name)!,
    add:(name:string,sourceIndex:number,cutX:number,cutY:number,width:number,height:number)=>{const frame={...initial,name,sourceIndex,cutX,cutY,width,height,cutHeight:height};frames.set(name,frame);return frame;}};
  class Sprite {
    originX=.5;originY=1;scaleX=1;scaleY=1;depth=0;alpha=1;visible=true;flipX=false;rotation=0;destroyed=false;
    texture=texture;frame:typeof initial;
    constructor(public x:number,public y:number,_key:string,name:string){this.frame=texture.get(name);}
    get width(){return this.frame.width;}get height(){return this.frame.height;}get displayWidth(){return this.width*this.scaleX;}
    setOrigin(x:number,y:number){this.originX=x;this.originY=y;return this;}setScale(scale:number){this.scaleX=this.scaleY=scale;return this;}
    setDepth(depth:number){this.depth=depth;return this;}setFlipX(flip:boolean){this.flipX=flip;return this;}setTint(){return this;}
    setRotation(rotation:number){this.rotation=rotation;return this;}setAlpha(alpha:number){this.alpha=alpha;return this;}
    setVisible(visible:boolean){this.visible=visible;return this;}setFrame(name:string){this.frame=texture.get(name);return this;}
    getBounds(){return{x:this.x-this.width*this.scaleX*this.originX,right:this.x+this.width*this.scaleX*(1-this.originX),y:this.y-this.height*this.scaleY*this.originY,bottom:this.y+this.height*this.scaleY*(1-this.originY)};}
    destroy(){this.destroyed=true;}
  }
  const sprites:Sprite[]=[];
  const scene={cache:{json:{get:()=>({assets:{house:{key:texture.key,frames:['house'],fps:0,width:reference,height:reference,referenceWidth:reference,originX:.5,originY:1,
    sortLine:period==='night'?[[-reference/2,-reference*.8],[reference/2,-reference*.6]]:canonical.sortLine}}})}},
    textures:{exists:()=>true,get:()=>texture},add:{sprite:(x:number,y:number,key:string,name:string)=>{const sprite=new Sprite(x,y,key,name);sprites.push(sprite);return sprite;}}} as unknown as Phaser.Scene;
  const factory=((_scene:Phaser.Scene,_sprite:Phaser.GameObjects.Sprite)=>({configure:()=>undefined})) as unknown as SceneryOcclusionFactory;
  const placement={id:'test-wall',asset:'house' as const,x:100,y:200,width:100,sortLine:inheritSortLine?undefined:[[-reference/2,-reference*.4],[reference/2,0]] as const};
  return{scenery:new WorldScenery(scene,'lindenhafen',period,[placement],factory),sprites,frames};
}

describe('segmented scenery rendering', () => {
  it('keeps canonical wall depth when the night painting has a different crop coordinate frame',()=>{
    const day=fixture('day',true).sprites.filter(sprite=>!sprite.destroyed),night=fixture('night',true).sprites.filter(sprite=>!sprite.destroyed);
    expect(day.length).toBe(night.length);
    day.forEach((sprite,index)=>expect(Math.abs(sprite.depth-night[index].depth)).toBeLessThanOrEqual(4));
  });
  it('sorts simultaneous people against their own wall segment without camera-dependent depth', () => {
    const {scenery,sprites,frames}=fixture(),view={x:0,y:0,right:300,bottom:300};
    const strips=sprites.filter(sprite=>!sprite.destroyed),depths=strips.map(sprite=>sprite.depth);
    expect(strips).toHaveLength(13);
    expect(frames.size).toBe(14);
    expect(new Set(depths).size).toBeGreaterThan(8);
    const front={id:'front',x:55,y:175,depth:worldDepth(175,'character')},behind={id:'behind',x:145,y:175,depth:worldDepth(175,'character')};
    scenery.update(0,view,[front,behind],.15);
    expect(scenery.occlusionFor('front')).toBeUndefined();
    expect(scenery.occlusionFor('behind')?.strength).toBe(1);
    scenery.update(0,{x:30,y:0,right:330,bottom:300},[front,behind],.15);
    expect(strips.map(sprite=>sprite.depth)).toEqual(depths);
    scenery.update(0,view,[],.15);
    expect(scenery.occlusionFor('behind')?.strength).toBeCloseTo(.5);
    scenery.update(0,view,[],.15);
    expect(scenery.occlusionFor('behind')).toBeUndefined();
  });
  it('immediately clears hidden scenery and honours reduced motion', () => {
    const {scenery}=fixture(),view={x:0,y:0,right:300,bottom:300};
    scenery.setReducedMotion(true);
    scenery.update(0,view,[{id:'player',x:145,y:175,depth:worldDepth(175,'character')}],0);
    expect(scenery.occlusionFor('player')?.strength).toBe(1);
    scenery.setVisible(false);scenery.update(0,view,[],0);
    expect(scenery.occlusionFor('player')).toBeUndefined();
  });
});
