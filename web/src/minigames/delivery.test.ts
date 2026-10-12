// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, type AttemptResult } from '../api';
import type { MapPoint } from '../navigation';
import { directionForSegment, reachedDeliveryNode, WorldDeliveryRun } from './delivery';
import type { GameItem, MiniGameHost, RoundResult } from './types';

let frames: FrameRequestCallback[], clock: number;
let controller: WorldDeliveryRun | undefined;
beforeEach(() => {
  frames = []; clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { controller?.destroy(); controller = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
async function frame(ms = 100) { clock += ms; frames.shift()?.(clock); await settle(); }
const directionItem = (lemma: string): GameItem => ({ lexemeId: `${lemma}-adv`, lemma, english: lemma, topic: 'travel', level: 'A1', pos: 'adv', audio: `/audio/${lemma}.mp3`, exerciseIds: { recognition: '', listening: '', production: '' }, stability: 0, due: { recognition: false, listening: false, production: false }, seen: { recognition: false, listening: false, production: false }, recalls: { recognition: 0, listening: 0, production: 0 } });
function receipt(correct: boolean): AttemptResult { return { attemptId: 'receipt', correct, correctedAnswer: 'rechts', reason: '', xpAdded: correct ? 6 : 0, duplicate: false, progress: emptyProgress() }; }

function harness(points: MapPoint[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]) {
  let position = { ...points[0] }, active = true;
  const world = {
    deliveryRoute: vi.fn(() => ({ recipient: 'marta', points })), getPlayerPosition: vi.fn(() => position),
    showDeliveryCheckpoints: vi.fn(), showDeliveryArrival: vi.fn(), setInputEnabled: vi.fn(),
    deliveryChoices: vi.fn((origin: MapPoint) => [origin, { x: origin.x - 100, y: origin.y }, { x: origin.x, y: origin.y - 100 }, { x: origin.x, y: origin.y + 100 }]),
  };
  const host = {
    pool: vi.fn(() => ['links', 'rechts', 'oben', 'unten'].map(directionItem)),
    speak: vi.fn().mockResolvedValue(undefined), submit: vi.fn(async (round: RoundResult) => receipt(round.answer === round.lexemeId.replace('-adv', ''))),
    audio: { stop: vi.fn(), sfx: vi.fn() }, expose: vi.fn(), end: vi.fn(), silent: false,
  };
  const finish = vi.fn(), root = document.createElement('section'); document.body.append(root);
  controller = new WorldDeliveryRun(world, host as unknown as MiniGameHost, finish, () => active);
  return { world, host, root, finish, run: controller, move: (point: MapPoint) => { position = point; }, active: (value: boolean) => { active = value; } };
}

describe('physical delivery checkpoint grading', () => {
  it('shows equal current branch choices and a return lantern without exposing future route nodes',async()=>{
    const h=harness([{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:200,y:100}]);expect(h.run.mount(h.root)).toBe(true);await settle();
    const [points,lit]=h.world.showDeliveryCheckpoints.mock.calls.at(-1)! as unknown as [MapPoint[],number];
    expect(lit).toBe(1);expect(points[0]).toEqual({x:0,y:0});expect(points).toContainEqual({x:100,y:0});expect(points).toContainEqual({x:-100,y:0});
    expect(points).not.toContainEqual({x:100,y:100});expect(points).not.toContainEqual({x:200,y:100});
  });
  it('derives the chosen direction from the reached node and distinguishes nearby wrong branches', () => {
    expect(directionForSegment({ x: 0, y: 0 }, { x: -100, y: 20 })).toBe('links');
    expect(directionForSegment({ x: 0, y: 0 }, { x: 10, y: -100 })).toBe('oben');
    expect(directionForSegment({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeUndefined();
    expect(reachedDeliveryNode({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: -100, y: 0 }], { x: -100, y: 0 })).toEqual({ point: { x: -100, y: 0 }, direction: 'links', checkpoint: false });
    expect(reachedDeliveryNode({ x: 0, y: 0 }, { x: 80, y: 80 }, [{ x: 70, y: 90 }], { x: 70, y: 90 })?.checkpoint).toBe(false);
  });

  it('grades a wrong turn immediately, then returns to the origin before a hinted retest', async () => {
    const h = harness(); expect(h.run.mount(h.root)).toBe(true); await settle();
    h.move({ x: -100, y: 0 }); await frame();
    expect(h.host.submit).toHaveBeenCalledWith(expect.objectContaining({ lexemeId: 'rechts-adv', answer: 'links', hinted: false, modality: 'listening', answerKind: 'lexeme' }));
    expect(h.host.expose).toHaveBeenCalledWith(['rechts-adv']);
    await frame(); expect(h.host.submit).toHaveBeenCalledOnce();
    h.move({ x: 0, y: 0 }); await frame();
    h.move({ x: 100, y: 0 }); await frame();
    expect(h.host.submit).toHaveBeenLastCalledWith(expect.objectContaining({ answer: 'rechts', hinted: true }));
    const [points,lit]=h.world.showDeliveryCheckpoints.mock.calls.at(-1)! as unknown as [MapPoint[],number];
    expect(points.slice(0,2)).toEqual([{x:0,y:0},{x:100,y:0}]);expect(lit).toBe(2);expect(points).toContainEqual({x:100,y:100});
    expect(h.world.showDeliveryArrival).not.toHaveBeenCalled();
  });

  it('preserves an unsuccessful network save instead of overwriting it with movement or timeout', async () => {
    const h = harness(); h.host.submit.mockRejectedValueOnce(new Error('offline'));
    h.run.mount(h.root); await settle(); h.move({ x: 100, y: 0 }); await frame();
    const pending = h.host.submit.mock.calls[0][0];
    expect(h.root.querySelector<HTMLButtonElement>('[data-delivery="save"]')!.hidden).toBe(false);
    h.move({ x: -100, y: 0 }); for (let i = 0; i < 160; i++) await frame();
    expect(h.host.submit).toHaveBeenCalledOnce();
    h.root.querySelector<HTMLButtonElement>('[data-delivery="save"]')!.click(); await settle();
    expect(h.host.submit.mock.calls[1][0]).toBe(pending);
    expect(h.host.submit.mock.calls[1][0].answer).toBe('rechts');
    expect(h.world.showDeliveryArrival).not.toHaveBeenCalled();
  });

  it('waits for the last server acknowledgment before arriving and finishing exactly once', async () => {
    const h = harness([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    let resolve!: (value: AttemptResult) => void;
    h.host.submit.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    h.run.mount(h.root); await settle(); h.move({ x: 100, y: 0 }); await frame();
    expect(h.world.showDeliveryArrival).not.toHaveBeenCalled(); expect(h.finish).not.toHaveBeenCalled();
    resolve(receipt(true)); await settle();
    expect(h.world.showDeliveryArrival).toHaveBeenCalledWith('marta');
    expect(h.finish).toHaveBeenCalledOnce();
    expect(h.host.end).toHaveBeenCalledWith(expect.objectContaining({ attempts: 1, correct: 1, hinted: 0 }));
    expect(h.root.querySelector('.delivery-run-overlay')).toBeNull();
    await frame(); expect(h.finish).toHaveBeenCalledOnce();
  });

  it('cannot count unavailable audio or movement that happened before the direction was heard', async () => {
    const h = harness(); h.host.speak.mockRejectedValueOnce(new Error('audio unavailable'));
    h.run.mount(h.root); await settle();
    h.move({ x: 100, y: 0 }); for (let i = 0; i < 160; i++) await frame();
    expect(h.host.submit).not.toHaveBeenCalled();
    h.root.querySelector<HTMLButtonElement>('[data-delivery="replay"]')!.click(); await settle(); await frame();
    expect(h.host.submit).not.toHaveBeenCalled();
    h.move({ x: 0, y: 0 }); await frame(); h.move({ x: 100, y: 0 }); await frame();
    expect(h.host.submit).toHaveBeenCalledWith(expect.objectContaining({ hinted: true }));
  });

  it('pauses background movement and keeps a manually chosen pause after automatic resume', async () => {
    const h = harness(); h.run.mount(h.root); await settle();
    h.active(false); h.move({ x: 100, y: 0 }); await frame(5000);
    expect(h.host.submit).not.toHaveBeenCalled();
    expect(h.world.setInputEnabled).toHaveBeenLastCalledWith(false);
    h.active(true); await frame(); await frame(); expect(h.host.submit).not.toHaveBeenCalled();
    h.move({ x: 0, y: 0 }); await frame();
    h.root.querySelector<HTMLButtonElement>('[data-delivery="pause"]')!.click();
    h.run.resume(); h.move({ x: 100, y: 0 }); await frame();
    expect(h.host.submit).not.toHaveBeenCalled();
    h.root.querySelector<HTMLButtonElement>('[data-delivery="pause"]')!.click(); await settle();
    h.move({ x: 0, y: 0 }); await frame(); h.move({ x: 100, y: 0 }); await frame();
    expect(h.host.submit).toHaveBeenCalledWith(expect.objectContaining({ hinted: true }));
  });

  it('records a listening timeout and requires all possible direction words to be restored', async () => {
    const h = harness(); h.run.mount(h.root); await settle();
    for (let i = 0; i < 150; i++) await frame();
    expect(h.host.submit).toHaveBeenCalledWith(expect.objectContaining({ answer: '__timeout__', responseMs: 15000, hinted: false }));
    h.run.destroy();
    const missing = harness(); missing.host.pool.mockReturnValue([directionItem('rechts')]);
    expect(missing.run.mount(missing.root)).toBe(false);
    expect(missing.world.showDeliveryCheckpoints).not.toHaveBeenCalled();
    expect(missing.host.speak).not.toHaveBeenCalled();
  });

  it('ignores stale speech and save completions after cleanup', async () => {
    const h = harness(); let speech!: () => void;
    h.host.speak.mockImplementationOnce(() => new Promise<void>(done => { speech = done; }));
    h.run.mount(h.root); h.run.destroy(); speech(); await settle();
    expect(h.world.setInputEnabled).toHaveBeenLastCalledWith(false);
    expect(h.host.submit).not.toHaveBeenCalled();
    expect(h.host.end).not.toHaveBeenCalled();
    expect(h.world.showDeliveryCheckpoints).toHaveBeenLastCalledWith([], 0);
    expect(h.root.querySelector('.delivery-run-overlay')).toBeNull();
  });
});
