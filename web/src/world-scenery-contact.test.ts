import {describe,expect,it,vi} from 'vitest';
import type * as Phaser from 'phaser';
import {foundationScene} from './test-support/foundation-scene';
import {SceneryContact} from './world-scenery-contact';
import {fallbackSceneryContact,sceneryContactKind,traceSceneryContact} from './scenery-contact-shape';
import {contactMaterial,paintSceneryContact} from './scenery-contact-paint';

const art={width:256,height:256,referenceWidth:256,originX:.5,originY:1};
describe('scenery-specific ground contact',()=>{
  it('samples edited terrain under a boat anchor and hull during conversion preview',()=>{
    const ground=foundationScene(),scene={textures:{createCanvas:ground.createCanvas,remove:ground.remove},add:{image:ground.image}} as unknown as Phaser.Scene;
    const sample=vi.fn(()=>({colour:[35,75,100] as const,vegetation:0,water:1}));
    const contact=new SceneryContact(scene,'unknown-region',{id:'preview-boat',asset:'boat',x:100,y:200,width:100},'boat',undefined,sample);
    expect(sample.mock.calls).toEqual([[100,198],[78,192],[100,192],[122,192]]);
    expect(ground.createCanvas.mock.results[0].value.context.stroke).toHaveBeenCalled();
    contact.destroy();
  });
  it('chooses physical treatments independently of motion labels and variant names',()=>{
    const expected={tree:'leaf-tree',cypress:'conifer',lamp:'post',sign:'post',bench:'bench',stall:'market',planter:'planter',fountain:'fountain',boat:'boat',house:undefined} as const;
    for(const [asset,kind] of Object.entries(expected))expect(sceneryContactKind({asset:asset as keyof typeof expected})).toBe(kind);
  });
  it('finds separate bench feet without painting across the seat or between the legs',()=>{
    const pixels=new Uint8ClampedArray(64*64*4);
    for(let x=0;x<64;x++)pixels[(34*64+x)*4+3]=255; // Seat above the ground band.
    for(const x of [8,9,10,11,45,46,47,48])pixels[((x<20?45:63)*64+x)*4+3]=255;
    const feet=traceSceneryContact(pixels,64,64,art,'bench');
    expect(feet).toHaveLength(2);expect(feet.every(line=>line.length===4)).toBe(true);
    expect(feet[0][0][1]).toBe(-72);expect(feet[1][0][1]).toBe(0);
    expect(traceSceneryContact(pixels,64,64,art,'bench',true)).toEqual(feet.map(line=>line.map(([x,y])=>[-x,y])));
  });
  it('anchors trees at opaque roots instead of low branches or an alpha fringe',()=>{
    const pixels=new Uint8ClampedArray(64*64*4);
    for(let x=0;x<64;x++)pixels[(50*64+x)*4+3]=255;
    for(let x=29;x<35;x++){pixels[(62*64+x)*4+3]=255;pixels[(63*64+x)*4+3]=25;}
    const roots=traceSceneryContact(pixels,64,64,art,'leaf-tree');
    expect(roots).toHaveLength(1);expect(roots[0]).toHaveLength(6);
    expect(roots[0].every(([x,y])=>Math.abs(x)<16&&y===-4)).toBe(true);
  });
  it('uses waterline arcs only for floating boats and prevents organic dressing on water',()=>{
    const ground=foundationScene(),ctx=ground.createCanvas('test',128,128).context as unknown as CanvasRenderingContext2D;
    const wet=contactMaterial({colour:[42,103,129],vegetation:0,water:1},1);
    paintSceneryContact(ctx,'boat',fallbackSceneryContact('boat'),wet,'wear');
    expect(ctx.stroke).toHaveBeenCalledTimes(3);expect(ctx.fillRect).not.toHaveBeenCalled();
    const dry=foundationScene(),dryCtx=dry.createCanvas('dry',128,128).context as unknown as CanvasRenderingContext2D;
    paintSceneryContact(dryCtx,'boat',fallbackSceneryContact('boat'),{...wet,water:false},'wear');
    expect(dryCtx.stroke).not.toHaveBeenCalled();
    paintSceneryContact(dryCtx,'leaf-tree',fallbackSceneryContact('leaf-tree'),wet,'wear');
    expect(dryCtx.fill).not.toHaveBeenCalled();expect(dryCtx.fillRect).not.toHaveBeenCalled();
  });
  it('shares bounded contact atlases across sizes and periods, moves previews, and releases the final owner',()=>{
    const ground=foundationScene(),scene={textures:{createCanvas:ground.createCanvas,remove:ground.remove},add:{image:ground.image}} as unknown as Phaser.Scene;
    const spec={id:'same-tree',asset:'tree' as const,x:100,y:200,width:128};
    const a=new SceneryContact(scene,'unknown-region',spec,'leaf-tree');
    const b=new SceneryContact(scene,'unknown-region',{...spec,width:256},'leaf-tree');
    expect(ground.createCanvas).toHaveBeenCalledTimes(1);
    const [,width,height]=ground.createCanvas.mock.calls[0];expect(width).toBeLessThanOrEqual(192);expect(height).toBeLessThanOrEqual(192);
    expect(ground.images[2].scale).toBe(ground.images[0].scale*2);
    expect(a.shadow.blendMode).toBe('MULTIPLY');expect(a.wear.blendMode).toBe('NORMAL');
    const x=a.shadow.x,y=a.shadow.y;a.moveBy(12,18);
    expect([a.shadow.x,a.shadow.y]).toEqual([x+12,y+18]);
    a.setTint(0x8899b6);a.setAlpha(.3);a.setVisible(false);
    expect(ground.images.slice(0,2).every(image=>image.tint===0x8899b6&&image.alpha===.3&&!image.visible)).toBe(true);
    a.destroy();expect(ground.remove).not.toHaveBeenCalled();
    b.destroy();expect(ground.remove).toHaveBeenCalledTimes(1);
    expect(ground.images.every(image=>image.destroyed)).toBe(true);
  });
});
