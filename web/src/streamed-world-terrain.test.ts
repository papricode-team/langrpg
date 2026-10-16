import {EventEmitter} from 'node:events';
import {describe,expect,it,vi} from 'vitest';
import type * as Phaser from 'phaser';
import type {WorldScene} from './scene-schema';
import {StreamedWorldTerrain,terrainResidency} from './streamed-world-terrain';

function fixture(){
  const textures=new Map<string,{width:number;height:number}>(), queue:{key:string;asset:string}[]=[];
  const events=new EventEmitter(),loadEvents=new EventEmitter();
  let loading=false;
  class Image {alpha=1;visible=true;destroyed=false;children:Image[]=[];setDepth(){return this;}setOrigin(){return this;}setDisplaySize(){return this;}setTint(){return this;}
    setAlpha(value:number){this.alpha=value;return this;}setVisible(value:boolean){this.visible=value;return this;}
    add(child:Image){this.children.push(child);return this;}destroy(){this.destroyed=true;for(const child of this.children)child.destroy();}}
  const scene={events,load:{once:loadEvents.once.bind(loadEvents),on:loadEvents.on.bind(loadEvents),off:loadEvents.off.bind(loadEvents),
    image:(key:string,asset:string)=>queue.push({key,asset}),isLoading:()=>loading,start:()=>loading=true},
    textures:{exists:(key:string)=>textures.has(key),remove:(key:string)=>textures.delete(key),get:(key:string)=>({has:()=>false,add:()=>{},getSourceImage:()=>textures.get(key)})},
    add:{container:()=>new Image(),image:()=>new Image()}} as unknown as Phaser.Scene;
  const finish=async(layer:StreamedWorldTerrain,view:{x:number;y:number;width:number;height:number},zoom:number,fail='')=>{
    for(let frame=0;frame<40;frame++){
      for(const item of queue.splice(0)){
        if(item.key===fail)loadEvents.emit('loaderror',{key:item.key});
        else{textures.set(item.key,item.key.includes('overview')?{width:768,height:512}:{width:3073,height:2049});loadEvents.emit(`filecomplete-image-${item.key}`);}
      }
      loading=false;await Promise.resolve();await Promise.resolve();await Promise.resolve();layer.update(view,zoom);
    }
  };
  return{scene,textures,queue,finish};
}
const world={id:'test',width:3072,height:2048,terrain:Array.from({length:16},(_,i)=>({id:`tile-${i}`,x:i%4*768,y:Math.floor(i/4)*512,width:768,height:512,
  dayAsset:`/assets/tile-${i}.webp`,dayPreviewAsset:`/assets/tile-${i}-overview.webp`,pixelDensity:4,dayCrop:{x:0,y:0,width:3072,height:2048}}))} as WorldScene;
const overview={x:0,y:0,width:3072,height:2048};

describe('streamed terrain renderer',()=>{
  it('reuses a settled view, while movement and detail zoom changes refresh its leases',async()=>{
    const f=fixture(),layer=new StreamedWorldTerrain(f.scene,world,'day');
    layer.update(overview,.4);await f.finish(layer,overview,.4);
    const retain=vi.spyOn(terrainResidency(f.scene),'retain');
    for(let frame=0;frame<120;frame++)layer.update({...overview},.5);
    expect(retain.mock.calls.length).toBe(0);
    layer.update(overview,2);
    expect(retain).toHaveBeenCalledTimes(1);
    await f.finish(layer,overview,2);
    retain.mockClear();
    layer.update({x:20,y:20,width:600,height:400},2);
    expect(retain).toHaveBeenCalledTimes(1);
    layer.destroy();
  });
  it('uses bounded overview memory for a whole expanded map and caps detail at close zoom',async()=>{
    const f=fixture(),layer=new StreamedWorldTerrain(f.scene,world,'day');
    layer.update(overview,.4);await f.finish(layer,overview,.4);
    expect(layer.ready).toBe(true);expect([...f.textures.keys()].every(key=>key.includes('overview'))).toBe(true);
    expect(terrainResidency(f.scene).snapshot()).toMatchObject({textures:16,pixels:16*768*512,pending:0});
    layer.update(overview,2);await f.finish(layer,overview,2);
    expect([...f.textures.keys()].filter(key=>!key.includes('overview'))).toHaveLength(5);
    expect(terrainResidency(f.scene).snapshot().pixels*4).toBeLessThan(150*1024*1024);
    layer.destroy();expect(f.textures.size).toBe(0);
  });
  it('evicts distant pieces during travel and preserves shared readers through transitions',async()=>{
    const f=fixture(),day=new StreamedWorldTerrain(f.scene,world,'day'),left={x:20,y:20,width:600,height:400};
    day.update(left,2);await f.finish(day,left,2);
    const second=new StreamedWorldTerrain(f.scene,world,'day');second.update(left,2);
    day.destroy();expect(f.textures.size).toBeGreaterThan(0);
    const right={x:2400,y:1600,width:600,height:400};second.update(right,2);await f.finish(second,right,2);
    expect(f.textures.has('tile-0')).toBe(false);expect(f.textures.has('tile-15')).toBe(true);
    second.setVisible(false);expect(f.textures.size).toBe(0);
    second.setVisible(true).update(right,2);await f.finish(second,right,2);expect(second.ready).toBe(true);
    second.destroy();expect(terrainResidency(f.scene).snapshot()).toMatchObject({textures:0,pixels:0,pending:0});
  });
  it('follows an edited document without dropping or fetching loaded art',async()=>{
    const f=fixture(),layer=new StreamedWorldTerrain(f.scene,world,'day'),view={x:20,y:20,width:600,height:400};
    layer.update(view,2);await f.finish(layer,view,2);
    const loaded=[...f.textures.keys()].sort();
    layer.setWorld(structuredClone(world));layer.update(view,2);
    expect([...f.textures.keys()].sort()).toEqual(loaded);expect(f.queue).toHaveLength(0);expect(layer.ready).toBe(true);
    layer.destroy();
  });
  it('keeps an overview visible when a detailed piece fails instead of leaving a hole',async()=>{
    const f=fixture(),layer=new StreamedWorldTerrain(f.scene,world,'day'),view={x:20,y:20,width:600,height:400};
    layer.update(view,2);await f.finish(layer,view,2,'tile-0');
    expect(layer.ready).toBe(true);expect(f.textures.has('tile-0-overview')).toBe(true);expect(f.textures.has('tile-0')).toBe(false);
    expect(terrainResidency(f.scene).snapshot().failed).toBe(1);layer.destroy();
  });
  it('retries failed detail without requiring the camera to move',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(1000);
    const f=fixture(),layer=new StreamedWorldTerrain(f.scene,world,'day'),view={x:20,y:20,width:600,height:400};
    try{
      layer.update(view,2);await f.finish(layer,view,2,'tile-0');
      expect(f.textures.has('tile-0')).toBe(false);
      now.mockReturnValue(4000);
      layer.update(view,2);await f.finish(layer,view,2);
      expect(f.textures.has('tile-0')).toBe(true);
      expect(layer.ready).toBe(true);
      expect(terrainResidency(f.scene).snapshot().failed).toBe(0);
    }finally{layer.destroy();now.mockRestore();}
  });
});
