// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import { TravelScene } from './travel-scene';
import { WorldEvents } from './world-state';

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
