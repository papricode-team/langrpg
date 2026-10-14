import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { paintCharacter } from './modular-character';
import { releaseAvatarPreview } from './avatar-baker';

afterEach(() => vi.unstubAllGlobals());
describe('avatar preview asset recovery', () => {
  it('retries failed sheets and reuses each native page throughout its four poses', async () => {
    let failed = false;
    const fetchSheet = vi.fn(async (url: string) => {
      if (!failed && url.includes('body-regular.skin')) { failed = true; return new Response(null, {status:503}); }
      return new Response(await readFile(resolve(import.meta.dirname,'../public',url.split('?')[0].replace(/^\//,''))));
    });
    vi.stubGlobal('fetch', fetchSheet);
    vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
      const {data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      expect(info.width).toBeLessThanOrEqual(1024);
      expect(info.height).toBeLessThanOrEqual(1536);
      return {data,width:info.width,height:info.height,close:vi.fn()};
    });
    vi.stubGlobal('ImageData', class { constructor(public data:Uint8ClampedArray, public width:number, public height:number){} });
    const context = {image:null as any,drawImage:vi.fn((image:any)=>{context.image=image;}),getImageData:()=>({data:context.image.data}),putImageData:vi.fn(),clearRect:vi.fn()};
    const canvas={width:256,height:384,getContext:()=>context} as unknown as HTMLCanvasElement;
    vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
    const avatar={skin:'#d8a077',hair:'#48372e',outfit:'#326a65'};
    try {
      await expect(paintCharacter(canvas,avatar)).rejects.toThrow('Missing character sheet');
      expect(context.putImageData).not.toHaveBeenCalled();
      await expect(paintCharacter(canvas,avatar)).resolves.toBeUndefined();
      expect(context.putImageData).toHaveBeenCalled();
      const count=fetchSheet.mock.calls.length;
      for(const frame of [1,2,3])await paintCharacter(canvas,avatar,frame);
      expect(fetchSheet).toHaveBeenCalledTimes(count);
      await paintCharacter(canvas,avatar,8);
      const nextPageCount=fetchSheet.mock.calls.length;
      expect(nextPageCount).toBeGreaterThan(count);
      for(const frame of [9,10,11])await paintCharacter(canvas,avatar,frame);
      expect(fetchSheet).toHaveBeenCalledTimes(nextPageCount);
      expect(fetchSheet.mock.calls.every(([url])=>/\.editor\.(0|2)\.webp/.test(url))).toBe(true);
    } finally { releaseAvatarPreview(canvas); }
  });
});
