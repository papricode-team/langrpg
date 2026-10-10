import { afterEach, describe, expect, it, vi } from 'vitest';
import { paintCharacter } from './modular-character';

 afterEach(() => vi.unstubAllGlobals());
describe('avatar preview asset recovery', () => {
  it('retries a failed character layer instead of caching a blank preview forever', async () => {
    let failed = false;
    class Asset {
      onload?: () => void;
      onerror?: () => void;
      set src(path: string) { queueMicrotask(() => { if (!failed && path.includes('body-skin')) { failed = true; this.onerror?.(); } else this.onload?.(); }); }
    }
    vi.stubGlobal('Image', Asset);
    const context = {clearRect:vi.fn(),save:vi.fn(),restore:vi.fn(),translate:vi.fn(),scale:vi.fn(),drawImage:vi.fn(),fillRect:vi.fn(),globalCompositeOperation:'source-over',fillStyle:''};
    const canvas = {width:256,height:384,getContext:()=>context} as unknown as HTMLCanvasElement;
    vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
    const avatar={skin:'#d8a077',hair:'#48372e',outfit:'#326a65'};
    await expect(paintCharacter(canvas,avatar)).rejects.toThrow('Missing character piece body-skin');
    expect(context.drawImage).not.toHaveBeenCalled();
    await expect(paintCharacter(canvas,avatar)).resolves.toBeUndefined();
    expect(context.drawImage).toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalled();
  });
});
