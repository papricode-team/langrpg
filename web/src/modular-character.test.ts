import { describe, expect, it } from 'vitest';
import { characterLayers } from './modular-character';
import { characterFrame, defaultParts, normalizeParts } from './avatar-options';
const avatar = { ...defaultParts, hair: '#48372e', skin: '#d8a077', outfit: '#326a65' };

describe('registered sprite layers', () => {
  it('uses the identical animation frame on every independently selected layer', () => {
    for (let facing = 0; facing < 4; facing++) for (const phase of [undefined,0,1,2,3,4,5,6,7]) {
      const frame=characterFrame(facing,phase), layers=characterLayers(avatar,frame);
      expect(layers.length).toBeGreaterThan(5);
      expect(layers.every(layer=>layer.frame===frame)).toBe(true);
      expect(layers.every(layer=>!('rotation' in layer)&&!('x' in layer)&&!('y' in layer))).toBe(true);
    }
  });
  it('changes independent textures without baking a combined avatar', () => {
    const before=characterLayers({...avatar,hairstyle:'bald'},12),after=characterLayers({...avatar,hairstyle:'waves'},12);
    expect(after.filter(layer=>!layer.id.startsWith('hair-'))).toEqual(before.filter(layer=>!layer.id.startsWith('hair-')));
    expect(after.some(layer=>layer.id==='hair-waves')).toBe(true);
  });
  it('never stretches a layer: head and body always share one painted scale', () => {
    for (const build of ['slender', 'regular', 'broad', 'full']) {
      expect(characterLayers({ ...avatar, hairstyle: 'hijab', build }, 27).every(layer => layer.width === 1)).toBe(true);
    }
  });
  it('keeps colour changes confined to the selected material', () => {
    const before=characterLayers(avatar,1),after=characterLayers({...avatar,outfit:'#ab5e51',pants:'#354d70'},1);
    for(let index=0;index<before.length;index++) {
      const layer=before[index];
      if(['jacket-fabric','bottom-fabric'].includes(layer.id))expect(after[index].tint).not.toBe(layer.tint);
      else expect(after[index]).toEqual(layer);
    }
  });
  it('draws the master head and omits hair for a bald selection',()=>{
    const layers=characterLayers({...avatar,hairstyle:'bald'},0);
    expect(layers.some(layer=>layer.id.startsWith('hair-'))).toBe(false);
    expect(layers.find(layer=>layer.id==='body-skin')?.tint).toBe(0xd8a077);
    expect(layers.some(layer=>['head-skin','hands-skin'].includes(layer.id))).toBe(false);
    expect(normalizeParts({jacket:'../bad',build:'invalid'})).toEqual(defaultParts);
  });
});
