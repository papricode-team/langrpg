// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import * as Phaser from 'phaser';
import { TravelScene } from './travel-scene';
import { SceneKeys, WorldEvents } from './world-state';

function curtain(reduced = true) {
  const events = new Phaser.Events.EventEmitter(), lifecycle = new Phaser.Events.EventEmitter();
  const shape = () => {
    const item = {x:0, y:0, height:2, setOrigin:vi.fn(), setInteractive:vi.fn(), disableInteractive:vi.fn(), setPosition:vi.fn(), setSize:vi.fn(), setText:vi.fn()};
    for (const method of [item.setOrigin,item.setInteractive,item.setPosition,item.setSize,item.setText]) method.mockReturnValue(item);
    return item;
  };
  const stop = vi.fn(), tween = vi.fn(), scene = new TravelScene();
  Object.assign(scene, {
    registry:{get:(key:string) => key === 'density' ? 1 : key === 'reducedMotion' ? reduced : undefined},
    game:{events}, events:lifecycle,
    add:{rectangle:shape, text:shape},
    scale:{width:1280,height:720,on:vi.fn(),off:vi.fn()},
    scene:{stop}, tweens:{add:tween},
  });
  scene.init({label:'The night train'}); scene.create();
  return {scene,events,lifecycle,stop,tween};
}

describe('travel loading curtain', () => {
  it('lifts for a restored interior even if its sleeping town never paints', () => {
    const {events,stop} = curtain();
    events.emit(WorldEvents.LoadProgress,1,'The night train');
    expect(stop).not.toHaveBeenCalled();
    events.emit(WorldEvents.ExploreReady,SceneKeys.Interior);
    expect(stop).toHaveBeenCalledOnce();
  });
  it('keeps the town covered until its terrain reports a painted view', () => {
    const {events,stop} = curtain();
    events.emit(WorldEvents.ExploreReady,SceneKeys.World);
    expect(stop).not.toHaveBeenCalled();
    events.emit(WorldEvents.MapReady,'lindenhafen');
    expect(stop).toHaveBeenCalledOnce();
  });
  it('runs one fade when room and map readiness arrive together', () => {
    const {events,tween,stop} = curtain(false);
    events.emit(WorldEvents.ExploreReady,SceneKeys.Interior);
    events.emit(WorldEvents.MapReady,'lindenhafen');
    expect(tween).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    tween.mock.calls[0][0].onComplete();
    expect(stop).toHaveBeenCalledOnce();
  });
  it('removes both readiness listeners when the curtain stops', () => {
    const {events,lifecycle,stop} = curtain();
    lifecycle.emit(Phaser.Scenes.Events.SHUTDOWN);
    events.emit(WorldEvents.ExploreReady,SceneKeys.Interior);
    events.emit(WorldEvents.MapReady,'lindenhafen');
    expect(stop).not.toHaveBeenCalled();
  });
});
