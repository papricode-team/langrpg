import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { AvatarSheetCache, avatarFramePixels, bakeAvatarPixels, bakeAvatarTexture } from './avatar-baker';
import { characterCatalogue, normalizeAvatar } from './character-recipe.mjs';
import type { AvatarRecipe, CharacterCatalogue } from './character-recipe.mjs';
import { composeFrame } from './character-compositor.mjs';
import { MODULAR_ART, NATIVE_MODULAR_ART } from './avatar-options';
import type Phaser from 'phaser';

const root = resolve(import.meta.dirname, '..');
const load = async (url: string) => {
  const { data, info } = await sharp(resolve(root, 'public', url.split('?')[0].replace(/^\//, ''))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};
function packedFrame(atlas:{data:Uint8Array|Uint8ClampedArray;width:number;height:number},frame:number,width:number,height:number,columns:number):Buffer {
  const output=Buffer.alloc(width*height*4),left=frame%columns*width,top=Math.floor(frame/columns)*height;
  for(let y=0;y<height;y++)output.set(atlas.data.subarray(((top+y)*atlas.width+left)*4,((top+y)*atlas.width+left+width)*4),y*width*4);
  return output;
}

describe('browser avatar baking', () => {
  it.each(['wave','seated','lantern-raise'])('bakes %s sheets identically to the reviewed offline atlas and refuses unsupported clothes before loading', async poseSet => {
    const recipe=JSON.parse(readFileSync(resolve(root,`../art/source/character-kit/poses/${poseSet}/regular/jacket-outfit.recipe.json`),'utf8')) as AvatarRecipe;
    const loadSheet=vi.fn(load);
    const atlas=await bakeAvatarPixels(recipe,{poseSet,resolution:'editor',loadSheet});
    const {data}=await sharp(resolve(root,`../art/proofs/character-kit-hd/outfit-${poseSet}.webp`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const visible=Buffer.from(atlas.data);
    for(let p=0;p<data.length;p+=4)if(data[p+3]===0&&visible[p+3]===0){data.fill(0,p,p+3);visible.fill(0,p,p+3);}
    expect(visible.equals(data)).toBe(true);
    expect(loadSheet.mock.calls.every(([url])=>url.includes(`-${poseSet}.`))).toBe(true);
    const frame=await avatarFramePixels(recipe,12,{poseSet,loadSheet});
    const cell=composeFrame([{id:'baked',materials:['detail'],tints:{detail:0xffffff}}],new Map([['baked.detail',atlas]]),12,frame.width,frame.height);
    expect(Buffer.from(frame.data).equals(Buffer.from(cell))).toBe(true);
    loadSheet.mockClear();
    if(poseSet==='lantern-raise') await expect(bakeAvatarPixels({...recipe,parts:{...recipe.parts,held:null}},{poseSet,loadSheet})).rejects.toThrow('requires held.lantern');
    await expect(bakeAvatarPixels({...recipe,parts:{...recipe.parts,bottom:'skirt'}},{poseSet,loadSheet})).rejects.toThrow('Unknown option bottom.skirt');
    await expect(bakeAvatarPixels(recipe,{poseSet:'unpublished',loadSheet})).rejects.toThrow('Unavailable pose set');
    expect(loadSheet).not.toHaveBeenCalled();
  },30000);
  it('composes all exported frames with the same pixels as the approved offline preview', async () => {
    const recipe = JSON.parse(readFileSync(resolve(root, '../art/proofs/foundation-outfit-preview.webp.json'), 'utf8')).recipe as AvatarRecipe;
    const atlas = await bakeAvatarPixels(recipe, { preview: true, resolution: 'editor', loadSheet: load });
    const { data, info } = await sharp(resolve(root, '../art/proofs/character-kit-hd/outfit-foundation.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([atlas.width, atlas.height]).toEqual([info.width, info.height]);
    // WebP may discard RGB underneath zero alpha; visible RGBA must match exactly.
    const visible = Buffer.from(atlas.data);
    for (let p = 0; p < data.length; p += 4) if (data[p + 3] === 0 && visible[p + 3] === 0) {
      data.fill(0, p, p + 3); visible.fill(0, p, p + 3);
    }
    expect(visible.equals(data)).toBe(true);
    // A live single-frame preview uses the same facing/column as the baked atlas.
    const frame = await avatarFramePixels(recipe, 25, { preview: true, loadSheet: load });
    const cell = composeFrame([{ id: 'baked', materials: ['detail'], tints: { detail: 0xffffff } }], new Map([['baked.detail', atlas]]), 25, frame.width, frame.height);
    expect(Buffer.from(frame.data).equals(Buffer.from(cell))).toBe(true);
  },30000);

  it('retains native paint across all36frames in a GPU-sized indoor layout',async()=>{
    const recipe=JSON.parse(readFileSync(resolve(root,'../art/proofs/foundation-outfit-preview.webp.json'),'utf8')).recipe as AvatarRecipe;
    const atlas=await bakeAvatarPixels(recipe,{preview:true,resolution:'editor',loadSheet:load});
    const nativeLoader=vi.fn(load),native=await bakeAvatarPixels(recipe,{preview:true,resolution:'editor',atlasColumns:8,loadSheet:nativeLoader});
    const [nativeWidth,nativeHeight]=characterCatalogue.format.editorCell;
    expect([native.width,native.height]).toEqual([4096,3840]);
    expect(nativeLoader.mock.calls.every(([url])=>url.includes('.editor.'))).toBe(true);
    for(let frame=0;frame<36;frame++){
      const defaultFrame=packedFrame(atlas,frame,nativeWidth,nativeHeight,9);
      expect(packedFrame(native,frame,nativeWidth,nativeHeight,8).equals(defaultFrame),`native physical frame ${frame}`).toBe(true);
    }
    // Physical padding never becomes one of the four logical walking directions.
    for(let frame=36;frame<40;frame++)expect(packedFrame(native,frame,nativeWidth,nativeHeight,8).some(value=>value!==0)).toBe(false);
    const runtime=await avatarFramePixels(recipe,0,{preview:true,resolution:'runtime',loadSheet:load});
    const enlargedRuntime=await sharp(Buffer.from(runtime.data),{raw:{width:runtime.width,height:runtime.height,channels:4}}).resize(nativeWidth,nativeHeight).raw().toBuffer();
    const nativeFrame=packedFrame(native,0,nativeWidth,nativeHeight,8);let finerPaint=0;
    for(let p=0;p<nativeFrame.length;p+=4)if(nativeFrame[p+3]===255&&enlargedRuntime[p+3]===255&&[0,1,2].some(channel=>Math.abs(nativeFrame[p+channel]-enlargedRuntime[p+channel])>3))finerPaint++;
    expect(finerPaint).toBeGreaterThan(2000);
  },30000);

  it('refuses invalid recipes before any fetch, including unknown values in preview mode', async () => {
    const recipe = normalizeAvatar({}), loadSheet = vi.fn(load);
    // Make this fixture incomplete explicitly; the real catalogue will grow a face.
    recipe.parts.face = null;
    await expect(bakeAvatarPixels(recipe, { loadSheet })).rejects.toThrow('Missing required face');
    recipe.parts.headwear = 'removed';
    await expect(bakeAvatarPixels(recipe, { preview: true, loadSheet })).rejects.toThrow('Unknown option');
    expect(loadSheet).not.toHaveBeenCalled();
    await expect(bakeAvatarPixels(normalizeAvatar({}),{atlasColumns:0,loadSheet})).rejects.toThrow('Atlas columns');
    await expect(bakeAvatarPixels(normalizeAvatar({}),{atlasColumns:8.5,loadSheet})).rejects.toThrow('Atlas columns');
    expect(loadSheet).not.toHaveBeenCalled();
  });

  it('uses separate native and runtime texture leases and registers all36physical frames',async()=>{
    const body=characterCatalogue.components.find(part=>part.slot==='body'&&part.build==='regular')!;
    const catalogue:CharacterCatalogue={...characterCatalogue,assetVersion:'test-indoor-texture-layout',assetBase:'/test-indoor/',slots:characterCatalogue.slots.filter(slot=>slot.id==='body'),components:[{...body,materials:['detail'],tints:{detail:null},sheets:{detail:{runtime:'runtime.webp',editor:'editor.webp',runtimeSha256:'runtime',editorSha256:'editor'}}}],format:{...characterCatalogue.format,runtimeCell:[2,3],editorCell:[4,6]}};
    const recipe=normalizeAvatar({},catalogue);
    const fetchSheet=vi.fn(async(url:string)=>new Response(url));
    vi.stubGlobal('fetch',fetchSheet);
    vi.stubGlobal('createImageBitmap',async(blob:Blob)=>{
      const native=(await blob.text()).includes('editor.webp'),cellWidth=native?4:2,cellHeight=native?6:3,width=cellWidth*9,height=cellHeight*4;
      const data=new Uint8ClampedArray(width*height*4);
      for(let frame=0;frame<36;frame++)for(let y=0;y<cellHeight;y++)for(let x=0;x<cellWidth;x++){
        const p=((Math.floor(frame/9)*cellHeight+y)*width+frame%9*cellWidth+x)*4;
        data.set([frame+1,native?200:100,0,255],p);
      }
      return{data,width,height,close:vi.fn()};
    });
    vi.stubGlobal('ImageData',class{constructor(public data:Uint8ClampedArray,public width:number,public height:number){}});
    type StubCanvas={width:number;height:number;pixels?:{data:Uint8ClampedArray;width:number;height:number};getContext:()=>unknown};
    vi.stubGlobal('document',{createElement:()=>{
      let bitmap:{data:Uint8ClampedArray}|undefined;
      const canvas:StubCanvas={width:0,height:0,getContext:()=>({drawImage:(image:{data:Uint8ClampedArray})=>{bitmap=image;},getImageData:()=>bitmap,putImageData:(pixels:StubCanvas['pixels'])=>{canvas.pixels=pixels;}})};
      return canvas;
    }});
    const canvases=new Map<string,StubCanvas>();
    const registrations=new Map<string,{frameWidth:number;frameHeight:number;endFrame:number}>();
    const addCanvas=vi.fn((key:string,canvas:StubCanvas)=>{canvases.set(key,canvas);return{getSourceImage:()=>canvas};});
    const scene={textures:{addCanvas,addSpriteSheet:vi.fn((key:string,_texture:unknown,config:{frameWidth:number;frameHeight:number;endFrame:number})=>{registrations.set(key,config);return{};}),get:(key:string)=>({getSourceImage:()=>canvases.get(key)!}),remove:vi.fn()},events:{once:vi.fn(),off:vi.fn()}} as unknown as Phaser.Scene;
    try{
      const runtime=await bakeAvatarTexture(scene,recipe,{catalogue});
      const native=await bakeAvatarTexture(scene,recipe,{catalogue,resolution:'editor'});
      const reused=await bakeAvatarTexture(scene,recipe,{catalogue,resolution:'editor'});
      expect(runtime.value).not.toBe(native.value);expect(reused.value).toBe(native.value);
      expect(runtime.value).toContain(':runtime:9x4');expect(native.value).toContain(':editor:8x5');
      expect(addCanvas).toHaveBeenCalledTimes(2);
      for(const[lease,columns,color]of [[runtime,9,100],[native,8,200]]as const){
        const canvas=canvases.get(lease.value)!,config=registrations.get(lease.value)!;
        expect(config.endFrame).toBe(35);
        expect([canvas.width,canvas.height]).toEqual([config.frameWidth*columns,config.frameHeight*Math.ceil(36/columns)]);
        for(let frame=0;frame<36;frame++){
          const pixels=packedFrame(canvas.pixels!,frame,config.frameWidth,config.frameHeight,columns);
          expect([...pixels.subarray(0,4)]).toEqual([frame+1,color,0,255]);
          expect([...pixels.subarray(-4)]).toEqual([frame+1,color,0,255]);
        }
      }
      expect(fetchSheet.mock.calls).toHaveLength(2);
      runtime.release(true);native.release();reused.release(true);
    }finally{vi.unstubAllGlobals();}
    expect(NATIVE_MODULAR_ART.width*NATIVE_MODULAR_ART.columns).toBe(4096);
    expect(NATIVE_MODULAR_ART.height*NATIVE_MODULAR_ART.rows).toBe(3840);
    expect(NATIVE_MODULAR_ART.bodyHeight).toBe(568);
    expect(NATIVE_MODULAR_ART.footY).toBe(MODULAR_ART.footY);
  });

  it('snapshots recipes and only loads components visible in at least one facing', async () => {
    const recipe = normalizeAvatar({}); recipe.parts.headwear = 'cap';
    const loadSheet = vi.fn(load);
    const result = bakeAvatarPixels(recipe, { preview: true, loadSheet });
    recipe.skin = '#ffffff'; recipe.parts.headwear = null;
    await result;
    const urls = loadSheet.mock.calls.map(([url]) => url);
    expect(urls.some(url => url.includes('hair-waves'))).toBe(false);
    expect(urls.some(url => url.includes('headwear-cap'))).toBe(true);
    expect(urls.every(url => url.includes(`?v=${characterCatalogue.assetVersion}`))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('bounds decoded sheets and retries failed or malformed assets', async () => {
    const decode = vi.fn(async () => ({ data: new Uint8Array(4), width: 1, height: 1 }));
    const cache = new AvatarSheetCache(decode, 8);
    await Promise.all([cache.load('a', 1, 1), cache.load('a', 1, 1)]);
    expect(decode).toHaveBeenCalledTimes(1);
    await cache.load('b', 1, 1); await cache.load('a', 1, 1); await cache.load('c', 1, 1);
    await cache.load('b', 1, 1); expect(decode).toHaveBeenCalledTimes(4);
    decode.mockRejectedValueOnce(Error('temporary'));
    await expect(cache.load('retry', 1, 1)).rejects.toThrow('temporary');
    await expect(cache.load('retry', 1, 1)).resolves.toHaveProperty('width', 1);
    await expect(cache.load('bad-size', 9, 4)).rejects.toThrow('Malformed');
  });
});

it.each(['smile','worried'])('matches the reviewed %s atlas and changes only face pixels',async expression=>{
  const recipe=JSON.parse(readFileSync(resolve(root,'../art/source/character-kit/cast/marta.json'),'utf8')) as AvatarRecipe;
  const atlas=await bakeAvatarPixels(recipe,{expression,resolution:'editor',loadSheet:load});
  const neutral=await bakeAvatarPixels(recipe,{resolution:'editor',loadSheet:load});
  const reviewed=await sharp(resolve(root,`../art/proofs/character-kit-hd/expression-${expression}.webp`)).ensureAlpha().raw().toBuffer();
  let changed=0,outsideFace=0;
  const visible=Buffer.from(atlas.data);
  for(let p=0;p<atlas.data.length;p+=4){
    const height=characterCatalogue.format.editorCell[1];
    const pixel=p/4,y=Math.floor(pixel/atlas.width),row=Math.floor(y/height),cellY=y%height;
    if(!atlas.data[p+3]&&!reviewed[p+3]){visible.fill(0,p,p+3);reviewed.fill(0,p,p+3);}
    if(atlas.data.slice(p,p+4).some((v,i)=>v!==neutral.data[p+i])){
      changed++;if(row===2||cellY>=height*70/192)outsideFace++;
    }
  }
  expect(visible.equals(reviewed)).toBe(true);
  expect(changed).toBeGreaterThan(50);expect(outsideFace).toBe(0);
  const loader=vi.fn(load);
  await expect(bakeAvatarPixels({...recipe,parts:{...recipe.parts,face:'oval'}},{expression,loadSheet:loader})).rejects.toThrow('Unavailable expression');
  await expect(bakeAvatarPixels(recipe,{expression,poseSet:'wave',loadSheet:loader})).rejects.toThrow('walking grid');
  expect(loader).not.toHaveBeenCalled();
},30000);
