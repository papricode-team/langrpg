import { describe, expect, it } from 'vitest';
import { clearWhiteMatte, combineMaterials, composeFrame } from './character-compositor.mjs';

describe('sprite background matte', () => {
  it('removes white antialias residue without erasing the fabric contribution', () => {
    const detail=Uint8Array.from([255,255,255,128]);
    const fabric=Uint8Array.from([0,128,64,127]);
    const pixels=combineMaterials([{data:detail},{data:fabric}]);
    clearWhiteMatte(pixels,detail,1,1);
    expect(pixels[3]).toBe(127);
    for(let c=0;c<3;c++)expect(Math.abs(pixels[c]-fabric[c])).toBeLessThanOrEqual(1);
  });
  it('clears a white gap connected to transparency while keeping an enclosed button', () => {
    const pixels = new Uint8ClampedArray(7 * 7 * 4);
    const set = (x:number, y:number, color:number[]) => pixels.set(color, (y * 7 + x) * 4);
    for (let y=1;y<6;y++) for(let x=1;x<6;x++) set(x,y,[30,70,60,255]);
    set(1,2,[255,255,255,255]); set(2,2,[245,245,245,255]);
    set(4,4,[255,255,255,255]);
    clearWhiteMatte(pixels, pixels.slice(), 7, 7);
    expect(pixels[(2*7+1)*4+3]).toBe(0);
    expect(pixels[(2*7+2)*4+3]).toBe(0);
    expect([...pixels.slice((4*7+4)*4,(4*7+4)*4+4)]).toEqual([255,255,255,255]);
  });

  it('clears enclosed body gaps below the face but protects eyes', () => {
    const pixels=new Uint8ClampedArray(5*10*4);
    for(let p=0;p<pixels.length;p+=4) pixels.set([190,130,95,255],p);
    for(const y of [1,6]) pixels.set([255,255,255,255],(y*5+2)*4);
    clearWhiteMatte(pixels,pixels.slice(),5,10,true);
    expect(pixels[(1*5+2)*4+3]).toBe(255);
    expect(pixels[(6*5+2)*4+3]).toBe(0);
  });

  it('keeps white fabric, including its exposed edges', () => {
    const data=Uint8Array.from([255,255,255,255]);
    const images=new Map([['shirt.primary.0',{data,width:1,height:1,firstFrame:0,frameCount:1,columns:1}]]);
    expect([...composeFrame([{id:'shirt',materials:['primary'],tints:{primary:0xffffff}}],images,0,1,1)]).toEqual([...data]);
  });
});
