// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import * as Phaser from 'phaser';
import { TravelScene } from './travel-scene';
import { SceneKeys, WorldEvents } from './world-state';

describe('travel curtain loading race', () => {
  it('remembers progress and a ready map while its painted preview is still loading', () => {
    const scene = new TravelScene();
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const on = vi.fn((event: string, callback: (...args: unknown[]) => void, context: unknown) => handlers.set(event, callback.bind(context)));
    Object.assign(scene, {game:{events:{on,off:vi.fn()}}, events:{once:vi.fn()}});
    scene.init({label:'Lindenhafen'});
    handlers.get(WorldEvents.LoadProgress)!(.8, 'Waldruh');
    handlers.get(WorldEvents.MapReady)!();
    const state = scene as unknown as {progress:number; label:string; mapReady:boolean; lifting:boolean};
    expect(state.progress).toBe(.8);
    expect(state.label).toBe('Waldruh');
    expect(state.mapReady).toBe(true);
    expect(state.lifting).toBe(false);
    scene.init({label:'Nebelstadt'});
    expect(state.progress).toBe(0);
    expect(state.mapReady).toBe(false);
  });
});


async function curtain(reduced = true) {
  const events = new Phaser.Events.EventEmitter(), lifecycle = new Phaser.Events.EventEmitter();
  const shape = () => {
    const item = {x:0, y:0, height:2, text:'', setOrigin:vi.fn(), setInteractive:vi.fn(), disableInteractive:vi.fn(), setPosition:vi.fn(), setSize:vi.fn(), setText:vi.fn(), setDisplaySize:vi.fn(), setFontSize:vi.fn(), setAlpha:vi.fn(), setScale:vi.fn(), destroy:vi.fn(), frame:{width:1,height:1}};
    for (const method of [item.setOrigin,item.setInteractive,item.setPosition,item.setSize,item.setText,item.setDisplaySize,item.setFontSize,item.setAlpha,item.setScale]) method.mockReturnValue(item);
    return item;
  };
  const stop = vi.fn(), tween = vi.fn(), scene = new TravelScene();
  Object.assign(scene, {
    registry:{get:(key:string) => key === 'density' ? 1 : key === 'reducedMotion' ? reduced : undefined},
    game:{events}, events:lifecycle,
    add:{rectangle:shape, text:shape, image:shape},
    textures:{exists:() => false, remove:vi.fn()}, sys:{isActive:() => true}, children:{list:[]},
    scale:{width:1280,height:720,on:vi.fn(),off:vi.fn()},
    scene:{stop}, tweens:{add:tween},
  });
  scene.init({label:'The night train'}); await scene.create();
  return {scene,events,lifecycle,stop,tween};
}

describe('travel loading curtain', () => {
  it('lifts for a restored interior even if its sleeping town never paints', async () => {
    const {events,stop} = await curtain();
    events.emit(WorldEvents.LoadProgress,1,'The night train');
    expect(stop).not.toHaveBeenCalled();
    events.emit(WorldEvents.ExploreReady,SceneKeys.Interior);
    expect(stop).toHaveBeenCalledOnce();
  });
  it('keeps the town covered until its terrain reports a painted view', async () => {
    const {events,stop} = await curtain();
    events.emit(WorldEvents.ExploreReady,SceneKeys.World);
    expect(stop).not.toHaveBeenCalled();
    events.emit(WorldEvents.MapReady,'lindenhafen');
    expect(stop).toHaveBeenCalledOnce();
  });
  it('runs one fade when room and map readiness arrive together', async () => {
    const {events,tween,stop} = await curtain(false);
    events.emit(WorldEvents.ExploreReady,SceneKeys.Interior);
    events.emit(WorldEvents.MapReady,'lindenhafen');
    expect(tween).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    tween.mock.calls[0][0].onComplete();
    expect(stop).toHaveBeenCalledOnce();
  });
  it('removes both readiness listeners when the curtain stops', async () => {
    const {events,lifecycle,stop} = await curtain();
    lifecycle.emit(Phaser.Scenes.Events.SHUTDOWN);
    events.emit(WorldEvents.ExploreReady,SceneKeys.Interior);
    events.emit(WorldEvents.MapReady,'lindenhafen');
    expect(stop).not.toHaveBeenCalled();
  });
});
