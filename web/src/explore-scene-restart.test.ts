// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import { ExploreScene, isTyping, type Character } from './explore-scene';
import type { NavigationGrid, MapPoint } from './navigation';
import type { WorldClock, WorldTimeState } from './world-clock';
import { WorldEvents, type WorldPlayer } from './world-state';

/**
 * These tests build a scene without booting a Phaser game: the scene methods under test only touch the
 * fakes installed below, so they run in milliseconds instead of the real-scene harness's minutes.
 */
class ProbeScene extends ExploreScene {
  protected readonly objectPrefix = 'object' as const;
  constructor() { super({ key: 'probe' }); }
  get worldWidth(): number { return 1536; }
  get worldHeight(): number { return 1024; }
  protected createNavigation(): NavigationGrid { throw new Error('not built in this probe'); }
  protected spawnPoint(): MapPoint { return { x: 0, y: 0 }; }
  protected spawnFacing(): number { return 0; }
  protected buildScene(): void {}
  protected usePortal(): void {}
  protected updateScene(): void {}
  protected ownsPlayer(_player: WorldPlayer): boolean { return true; }
}

type Internals = {
  elapsed: number; local: { id: string; x: number; y: number; name: { setResolution: (value: number) => void } };
  clock: Pick<WorldClock, 'advance'>; sendPosition(): void; tickClock(seconds: number): WorldTimeState;
  game: { events: { emit: (...args: unknown[]) => void } };
  cameras: { main: Record<string, unknown> };
};

function probe() {
  const scene = new ProbeScene();
  const emit = vi.fn();
  const internals = scene as unknown as Internals;
  internals.game = { events: { emit } };
  const resolution = vi.fn();
  internals.local = { id: 'self', x: 200, y: 300, name: { setResolution: resolution } };
  const state: WorldTimeState = { hour: 8, period: 'day', mode: 'cycle', label: '08:00' };
  internals.clock = { advance: () => state };
  const camera = { width: 800, height: 600, zoom: 1, setBounds: () => camera, setZoom: () => camera, centerOn: () => camera };
  internals.cameras = { main: camera };
  return { scene, internals, emit, resolution };
}
const moves = (emit: ReturnType<typeof vi.fn>) => emit.mock.calls.filter(call => call[0] === WorldEvents.Move).length;

describe('explore scene restarts', () => {
  it('keeps broadcasting the player position after a restart resets the scene clock', () => {
    const { scene, internals, emit } = probe();
    scene.init();
    internals.elapsed = 600; // Ten minutes in the first town.
    internals.sendPosition();
    expect(moves(emit)).toBe(1);
    scene.init(); // Travel restarts the scene; elapsed starts again at zero.
    internals.elapsed = .1;
    internals.local.x += 40;
    internals.sendPosition();
    expect(moves(emit)).toBe(2);
  });

  it('announces the clock again on the first frame after a restart', () => {
    const { scene, internals, emit } = probe();
    scene.init();
    internals.tickClock(.016); internals.tickClock(.016);
    expect(emit.mock.calls.filter(call => call[0] === WorldEvents.Time)).toHaveLength(1);
    scene.init();
    internals.tickClock(.016);
    expect(emit.mock.calls.filter(call => call[0] === WorldEvents.Time)).toHaveLength(2);
  });
});

describe('explore scene resize', () => {
  it('retains 44 CSS px hit targets on Retina after pulling the camera back', () => {
    const scene = new ProbeScene();
    const state = scene as unknown as {density:number;fitZoom:number;characters:Map<string,unknown>;objects:Map<string,unknown>;portals:Map<string,unknown>;resizeHitTargets:()=>void};
    state.density=2;state.fitZoom=1.2;
    const hit={setTo:vi.fn()}, objectHit={setSize:vi.fn()}, portalHit={setSize:vi.fn()};
    state.characters=new Map([['npc',{figure:{input:{hitArea:hit}},artScale:.1,componentCast:true}]]);
    state.objects=new Map([['object',{hit:objectHit}]]);
    state.portals=new Map([['portal',{door:{hit:{width:20,height:30}},hit:portalHit}]]);
    state.resizeHitTargets();
    expect(hit.setTo.mock.calls[0][2]*.1*1.2/2).toBeCloseTo(44);
    expect(objectHit.setSize.mock.calls[0][0]*1.2/2).toBeCloseTo(44);
    expect(portalHit.setSize.mock.calls[0][0]*1.2/2).toBeGreaterThanOrEqual(44);
    expect(portalHit.setSize.mock.calls[0][1]*1.2/2).toBeGreaterThanOrEqual(44);
  });

  it('re-renders labels only when the pixel density changes', () => {
    const { scene, resolution } = probe();
    scene.init();
    scene.fitCamera(800, 600, 2);
    expect(resolution).toHaveBeenCalledTimes(1);
    scene.fitCamera(820, 560, 2);
    scene.fitCamera(760, 600, 2);
    expect(resolution).toHaveBeenCalledTimes(1);
    scene.fitCamera(760, 600, 3);
    expect(resolution).toHaveBeenCalledTimes(2);
  });

  it('eases a running scene to its new framing on a live resize, and snaps otherwise', () => {
    const { scene } = probe();
    scene.init();
    const snap = vi.spyOn(scene, 'snapCamera');
    const active = vi.spyOn(scene.sys, 'isActive').mockReturnValue(true);
    scene.fitCamera(800, 600, 1, false);
    expect(snap).not.toHaveBeenCalled();
    scene.fitCamera(800, 600, 1);
    expect(snap).toHaveBeenCalledTimes(1);
    active.mockReturnValue(false);
    scene.fitCamera(700, 600, 1, false);
    expect(snap).toHaveBeenCalledTimes(2);
  });
});

describe('typing focus', () => {
  it('follows focus changes and a focused field that leaves the page', () => {
    const input = document.createElement('input');
    document.body.append(input);
    expect(isTyping()).toBe(false);
    input.focus();
    expect(isTyping()).toBe(true);
    input.blur();
    expect(isTyping()).toBe(false);
    input.focus();
    expect(isTyping()).toBe(true);
    input.remove();
    expect(isTyping()).toBe(false);
  });
});

describe('detached NPC prompts', () => {
  function promptProbe() {
    const { scene, internals } = probe();
    scene.init();
    const chain = () => {
      const object = { alpha: 0, visible: false, x: 0, y: 0, texture: { key: '' },
        setAlpha: vi.fn((value: number) => { object.alpha = value; return object; }),
        setVisible: vi.fn((value: boolean) => { object.visible = value; return object; }),
        setScale: vi.fn(() => object), setDisplaySize: vi.fn(() => object), setText: vi.fn(() => object),
        setTexture: vi.fn((key: string) => { object.texture.key = key; return object; }),
        setPosition: vi.fn((x: number, y: number) => { object.x = x; object.y = y; return object; }),
      };
      return object;
    };
    const root = chain(), icon = chain(), key = chain(), tab = chain();
    const npc = { id: 'marta', x: 200, y: 300, artScale: 80 / 426, figure: { width: 384 },
      name: { y: -92, width: 42, height: 20 }, prompt: { root, icon, tab, key, verb: { ...chain(), width: 54 } },
    } as unknown as Character;
    const state = scene as unknown as {
      controlsEnabled: boolean; nearbyInteraction?: string; mobileCamera: boolean; watching: boolean; editing: boolean;
      terrainOnly: boolean; conversationTarget?: string; cinematicTarget?: object;
      characters: Map<string, Character>; updateCharacterPrompt(npc: Character, seconds: number): void;
    };
    state.controlsEnabled = true; state.nearbyInteraction = 'marta'; state.characters.set('marta', npc);
    return { scene, internals, state, npc, root, key, icon };
  }

  it('clears the whole name and stays above a player standing below the NPC', () => {
    const { state, npc, root, key } = promptProbe();
    state.updateCharacterPrompt(npc, .12);
    expect(root.visible).toBe(true);
    expect(root.y + 12).toBeLessThan(npc.y + npc.name.y - npc.name.height / 2);
    expect(key.setText).toHaveBeenCalledWith('E');
    state.nearbyInteraction = 'door';
    state.updateCharacterPrompt(npc, .12);
    expect(root.visible).toBe(false);
    npc.hovered = true;
    state.updateCharacterPrompt(npc, .12);
    expect(root.visible).toBe(true);
    state.mobileCamera = true;
    state.updateCharacterPrompt(npc, .12);
    expect(key.visible).toBe(false);
  });

  it.each(['watching', 'terrainOnly', 'editing', 'conversationTarget', 'cinematicTarget'] as const)('hides immediately during %s', mode => {
    const { state, npc, root } = promptProbe();
    state.updateCharacterPrompt(npc, .12);
    expect(root.visible).toBe(true);
    Object.assign(state, { [mode]: mode === 'conversationTarget' ? 'marta' : mode === 'cinematicTarget' ? {} : true });
    state.updateCharacterPrompt(npc, 0);
    expect(root.visible).toBe(false);
    expect(root.alpha).toBe(0);
  });

  it('clears detached prompts before a disabled scene can pause without another frame', () => {
    const { scene, state, npc, root } = promptProbe();
    state.updateCharacterPrompt(npc, .12);
    expect(root.visible).toBe(true);
    scene.clearControls();
    expect(root.visible).toBe(false);
    expect(root.alpha).toBe(0);
  });
});
