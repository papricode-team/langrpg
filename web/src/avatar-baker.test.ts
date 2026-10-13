import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { AvatarSheetCache, avatarFramePixels, bakeAvatarPixels } from './avatar-baker';
import { characterCatalogue, normalizeAvatar } from './character-recipe.mjs';
import type { AvatarRecipe } from './character-recipe.mjs';
import { composeFrame } from './character-compositor.mjs';

const root = resolve(import.meta.dirname, '..');
const load = async (url: string) => {
  const { data, info } = await sharp(resolve(root, 'public', url.split('?')[0].replace(/^\//, ''))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

describe('browser avatar baking', () => {
  it.each(['wave','seated','lantern-raise'])('bakes %s sheets identically to the reviewed offline atlas and refuses unsupported clothes before loading', async poseSet => {
    const recipe=JSON.parse(readFileSync(resolve(root,`../art/source/character-kit/poses/${poseSet}/regular/jacket-outfit.recipe.json`),'utf8')) as AvatarRecipe;
    const loadSheet=vi.fn(load);
    const atlas=await bakeAvatarPixels(recipe,{poseSet,resolution:'editor',loadSheet});
    const {data}=await sharp(resolve(root,`../art/proofs/poses/${poseSet}/jacket-outfit.webp`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
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
  });
  it('composes all exported frames with the same pixels as the approved offline preview', async () => {
    const recipe = JSON.parse(readFileSync(resolve(root, '../art/proofs/foundation-outfit-preview.webp.json'), 'utf8')).recipe as AvatarRecipe;
    const atlas = await bakeAvatarPixels(recipe, { preview: true, resolution: 'editor', loadSheet: load });
    const { data, info } = await sharp(resolve(root, '../art/proofs/foundation-outfit-preview.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  });

  it('refuses invalid recipes before any fetch, including unknown values in preview mode', async () => {
    const recipe = normalizeAvatar({}), loadSheet = vi.fn(load);
    // Make this fixture incomplete explicitly; the real catalogue will grow a face.
    recipe.parts.face = null;
    await expect(bakeAvatarPixels(recipe, { loadSheet })).rejects.toThrow('Missing required face');
    recipe.parts.headwear = 'removed';
    await expect(bakeAvatarPixels(recipe, { preview: true, loadSheet })).rejects.toThrow('Unknown option');
    expect(loadSheet).not.toHaveBeenCalled();
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
  const reviewed=await sharp(resolve(root,`../art/proofs/expressions/marta-${expression}.webp`)).ensureAlpha().raw().toBuffer();
  let changed=0,outsideFace=0;
  const visible=Buffer.from(atlas.data);
  for(let p=0;p<atlas.data.length;p+=4){
    const pixel=p/4,y=Math.floor(pixel/atlas.width),row=Math.floor(y/192),cellY=y%192;
    if(!atlas.data[p+3]&&!reviewed[p+3]){visible.fill(0,p,p+3);reviewed.fill(0,p,p+3);}
    if(atlas.data.slice(p,p+4).some((v,i)=>v!==neutral.data[p+i])){
      changed++;if(row===2||cellY>=70)outsideFace++;
    }
  }
  expect(visible.equals(reviewed)).toBe(true);
  expect(changed).toBeGreaterThan(50);expect(outsideFace).toBe(0);
  const loader=vi.fn(load);
  await expect(bakeAvatarPixels({...recipe,parts:{...recipe.parts,face:'oval'}},{expression,loadSheet:loader})).rejects.toThrow('Unavailable expression');
  await expect(bakeAvatarPixels(recipe,{expression,poseSet:'wave',loadSheet:loader})).rejects.toThrow('walking grid');
  expect(loader).not.toHaveBeenCalled();
});
