// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { WorldCastShadow } from './world-cast-shadow';
import { setGraphicsQualityMode } from './quality-state';

afterEach(() => { setGraphicsQualityMode('auto'); vi.restoreAllMocks(); });

describe('cached scenery silhouettes', () => {
  it('skips Low, shares a bake, dims at night, hides on downgrade and frees the last lease', () => {
    const ctx = {drawImage:vi.fn(),fillRect:vi.fn(),save:vi.fn(),restore:vi.fn(),translate:vi.fn(),transform:vi.fn(),scale:vi.fn()};
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const createCanvas = vi.fn(() => ({context:ctx,refresh:vi.fn()})), remove = vi.fn();
    const images: {visible:boolean;alpha:number;destroy:ReturnType<typeof vi.fn>}[]=[];
    const image = () => {
      const result={visible:true,alpha:1,setOrigin:vi.fn(),setScale:vi.fn(),setDepth:vi.fn(),setBlendMode:vi.fn(),setPosition:vi.fn(),setVisible:vi.fn((v:boolean)=>{result.visible=v;return result;}),setAlpha:vi.fn((a:number)=>{result.alpha=a;return result;}),setTint:vi.fn(),destroy:vi.fn()};
      for(const fn of [result.setOrigin,result.setScale,result.setDepth,result.setBlendMode,result.setPosition,result.setTint]) fn.mockReturnValue(result);
      images.push(result);return result;
    };
    const scene={textures:{createCanvas,remove},add:{image}} as unknown as Phaser.Scene;
    const source={texture:{key:'cafe'},frame:{name:'base',width:600,height:800,cutX:0,cutY:0,cutWidth:600,cutHeight:800,source:{width:600,image:{width:300,naturalWidth:300}}},originX:.5,originY:1,scaleX:.5,flipX:false,x:100,y:200} as unknown as Phaser.GameObjects.Sprite;
    const first=new WorldCastShadow(scene,source), second=new WorldCastShadow(scene,source);
    setGraphicsQualityMode('low'); first.update(100,200,true,1,false); expect(createCanvas).not.toHaveBeenCalled();
    setGraphicsQualityMode('medium'); first.update(100,200,true,1,false);second.update(200,200,true,1,false);
    expect(createCanvas).toHaveBeenCalledOnce(); expect(images).toHaveLength(2);
    // Reads the current tier's image pixels, not its logical atlas dimensions.
    expect(ctx.drawImage.mock.calls[0].slice(1,5)).toEqual([0,0,300,400]);
    expect(images[0].alpha).toBe(.30);first.update(100,200,true,1,true);expect(images[0].alpha).toBe(.12);
    setGraphicsQualityMode('low');first.update(100,200,true,1,false);expect(images[0].visible).toBe(false);
    first.destroy();expect(remove).not.toHaveBeenCalled();second.destroy();expect(remove).toHaveBeenCalledOnce();
  });
});
