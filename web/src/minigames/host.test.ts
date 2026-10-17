// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, type Api, type Progress } from '../api';
import { AttemptBatcher, createMiniGameHost, type HostOptions } from './host';
import type { GameItem, RoundResult } from './types';

vi.mock('./item-manifest', () => ({ itemSpriteFor: () => undefined, hasItemSprite: () => false }));
vi.mock('./sprite-library', () => ({ SpriteLibrary: class {} }));

function options(request: ReturnType<typeof vi.fn>): HostOptions {
  let progress = emptyProgress();
  return {
    api: { request } as unknown as Api, gameId: 'tray-rush', lexicon: [], exercises: [],
    progress: () => progress, onProgress: vi.fn((next: Progress) => { progress = next; }), onEnd: vi.fn(),
    playerName: 'Ada', silent: false, muted: false, reducedMotion: false, narration: vi.fn(),
  };
}
const round = (lexemeId = 'kaffee'): RoundResult => ({ lexemeId, modality: 'listening', hinted: true, responseMs: 2300, answer: 'Kaffee', answerKind: 'lexeme' });
const receipt = (body: { id: string }, extra = {}) => ({ attemptId: body.id, status: 200, correct: true, correctedAnswer: 'Kaffee', reason: 'Matched', xpAdded: 0, duplicate: false, ...extra });

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('mini-game attempt batching', () => {
  it('keeps authored placement context and a zero-valued resource immutable across retries',async()=>{
    const request=vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async(_path,bodies)=>({results:bodies.map((body:{id:string})=>receipt(body)),progress:emptyProgress()}));
    const settings=options(request);settings.gameId='neighborhood-boards';
    const batcher=new AttemptBatcher(settings),result:RoundResult={lexemeId:'wasser-noun',modality:'recognition',hinted:true,responseMs:2400,answer:'hier lassen',exerciseId:'expedition-windplain-a2-water',contentId:'water',regionId:'windplain',level:'A2',selectedValue:0};
    const first=batcher.submit(result).catch(error=>error);await vi.advanceTimersByTimeAsync(40);await first;
    Object.assign(result,{contentId:'food',regionId:'saffroncourt',level:'B1',selectedValue:4,answer:'changed'});
    const retry=batcher.submit(result);await vi.advanceTimersByTimeAsync(40);await retry;
    expect(request.mock.calls[0][1][0]).toMatchObject({contentId:'water',regionId:'windplain',level:'A2',selectedValue:0,answer:'hier lassen',miniGameId:'neighborhood-boards'});
    expect(request.mock.calls[1][1][0]).toEqual(request.mock.calls[0][1][0]);
  });
  it('forwards the actual inflected token with its authored tape context and preserves both on retry', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async (_path, bodies) => ({ results: bodies.map((body: { id: string }) => receipt(body)), progress: emptyProgress() }));
    const settings = options(request); settings.gameId = 'looping-tape';
    const batcher = new AttemptBatcher(settings), result: RoundResult = { lexemeId: 'nehmen-verb', modality: 'production', answerKind: 'surface', contextExerciseId: 'b1-witness-exercise-7', answer: 'genommen', hinted: true, responseMs: 5600 };
    const first = batcher.submit(result).catch(error => error);
    await vi.advanceTimersByTimeAsync(40); await first;
    Object.assign(result, { answer: 'nehmen', contextExerciseId: 'changed-context' });
    const retry = batcher.submit(result); await vi.advanceTimersByTimeAsync(40); await retry;
    expect(request.mock.calls[0][1][0]).toMatchObject({ exerciseId: 'lex-nehmen-verb-production', itemId: 'word-nehmen-verb', answer: 'genommen', hinted: true, answerKind: 'surface', contextExerciseId: 'b1-witness-exercise-7', miniGameId: 'looping-tape' });
    expect(request.mock.calls[1][1][0]).toEqual(request.mock.calls[0][1][0]);
  });
  it('coalesces compound answers and captures honest modality, assistance and timing', async () => {
    const request = vi.fn(async (_path, bodies) => ({ results: bodies.map((body: { id: string }) => receipt(body, { correct: false })), progress: { ...emptyProgress(), revision: 2 } }));
    const settings = options(request), batcher = new AttemptBatcher(settings);
    const first = round(), second = { ...round('brot'), answer: 'Brot', responseMs: 1800 };
    const pending = Promise.all([batcher.submit(first), batcher.submit(second)]);
    await vi.advanceTimersByTimeAsync(40);
    const grades = await pending;
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]).toEqual([
      expect.objectContaining({ exerciseId: 'lex-kaffee-listening', itemId: 'word-kaffee', answer: 'Kaffee', hinted: true, mode: 'listening', responseTimeMs: 2300, miniGameId: 'tray-rush', answerKind: 'lexeme' }),
      expect.objectContaining({ exerciseId: 'lex-brot-listening', answer: 'Brot', responseTimeMs: 1800 }),
    ]);
    expect(grades.every(grade => !grade.correct)).toBe(true);
    expect(settings.onProgress).toHaveBeenCalledOnce();
  });

  it('keeps the same ID, answer, hint and timing after an ambiguous save failure', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async (_path, bodies) => ({ results: bodies.map((body: { id: string }) => receipt(body, { duplicate: true })), progress: emptyProgress() }));
    const batcher = new AttemptBatcher(options(request)), answer = round();
    const first = batcher.submit(answer).catch(error => error);
    await vi.advanceTimersByTimeAsync(40);
    expect((await first).message).toBe('offline');
    const original = { ...request.mock.calls[0][1][0] };
    Object.assign(answer, { answer: 'changed', hinted: false, responseMs: 90000, modality: 'production' });
    const retry = batcher.submit(answer);
    await vi.advanceTimersByTimeAsync(40);
    expect((await retry).duplicate).toBe(true);
    expect(request.mock.calls[1][1][0]).toEqual(original);
  });

  it('retries only the failed sibling of a partially accepted compound answer', async () => {
    const request = vi.fn().mockImplementationOnce(async (_path, bodies) => ({ results: [receipt(bodies[0]), { attemptId: bodies[1].id, status: 503, error: 'unavailable' }], progress: { ...emptyProgress(), revision: 1 } }))
      .mockImplementationOnce(async (_path, bodies) => ({ results: bodies.map((body: { id: string }) => receipt(body)), progress: { ...emptyProgress(), revision: 2 } }));
    const batcher = new AttemptBatcher(options(request)), one = round(), two = round('brot');
    const initial = Promise.allSettled([batcher.submit(one), batcher.submit(two)]);
    await vi.advanceTimersByTimeAsync(40);
    expect((await initial).map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    const retry = Promise.all([batcher.submit(one), batcher.submit(two)]);
    await vi.advanceTimersByTimeAsync(40);
    expect((await retry).every(result => result.correct)).toBe(true);
    expect(request.mock.calls[1][1]).toEqual([request.mock.calls[0][1][1]]);
  });

  it('deduplicates simultaneous submissions and finishes queued answers on close', async () => {
    const request = vi.fn(async (_path, bodies) => ({ results: bodies.map((body: { id: string }) => receipt(body)), progress: emptyProgress() }));
    const batcher = new AttemptBatcher(options(request)), answer = round();
    const first = batcher.submit(answer), again = batcher.submit(answer);
    expect(first).toBe(again);
    batcher.destroy();
    expect((await first).correct).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]).toHaveLength(1);
    await expect(batcher.submit(round())).rejects.toThrow('closed');
  });

  it('serializes full batches and never publishes older progress', async () => {
    let resolve!: (value: unknown) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; }))
      .mockImplementationOnce(async (_path, bodies) => ({ results: bodies.map((body: { id: string }) => receipt(body)), progress: { ...emptyProgress(), revision: 1 } }));
    const settings = options(request), batcher = new AttemptBatcher(settings);
    const pending = Promise.all(Array.from({ length: 31 }, (_, index) => batcher.submit(round(`word-${index}`))));
    await vi.advanceTimersByTimeAsync(40);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]).toHaveLength(30);
    resolve({ results: request.mock.calls[0][1].map((body: { id: string }) => receipt(body)), progress: { ...emptyProgress(), revision: 4 } });
    await vi.advanceTimersByTimeAsync(40);
    await pending;
    expect(request.mock.calls[1][1]).toHaveLength(1);
    expect(settings.onProgress).toHaveBeenCalledOnce();
    expect(settings.progress().revision).toBe(4);
  });
});

describe('mini-game speech lifecycle', () => {
  it('keeps music ducked for overlapping announcements when a focused cue ends',async()=>{
    const clips:{onended:(()=>void)|null;onerror:(()=>void)|null;playbackRate:number;play:ReturnType<typeof vi.fn>;pause:ReturnType<typeof vi.fn>}[]=[];
    vi.stubGlobal('Audio',vi.fn(function(){const clip={onended:null,onerror:null,playbackRate:1,play:vi.fn().mockResolvedValue(undefined),pause:vi.fn()};clips.push(clip);return clip;}));
    const settings=options(vi.fn()),host=createMiniGameHost(settings);
    host.audio.narration?.(true);const spoken=host.speakText('Der Anschluss fährt.','/audio/announcement.ogg');
    clips[0].onended?.();await spoken;expect(settings.narration).toHaveBeenLastCalledWith(true);
    host.audio.narration?.(false);expect(settings.narration).toHaveBeenLastCalledWith(false);
    host.audio.narration?.(true);host.destroy();expect(settings.narration).toHaveBeenLastCalledWith(false);
    host.audio.narration?.(true);expect(settings.narration).toHaveBeenLastCalledWith(false);
  });
  it('interrupts prior speech and ignores stale audio completion callbacks', async () => {
    const clips: { onended: (() => void) | null; onerror: (() => void) | null; playbackRate: number; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('Audio', vi.fn(function () {
      const clip = { onended: null, onerror: null, playbackRate: 1, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
      clips.push(clip); return clip;
    }));
    const settings = options(vi.fn()), host = createMiniGameHost(settings), item = { article: 'der', lemma: 'Kaffee', audio: '/audio/word-kaffee.ogg' } as GameItem;
    const first = host.speak(item).catch(error => error), oldEnd = clips[0].onended;
    const second = host.speak(item, .8);
    expect((await first).message).toContain('interrupted');
    oldEnd?.();
    expect(settings.narration).toHaveBeenLastCalledWith(true);
    expect(clips[0].pause).toHaveBeenCalledOnce();
    expect(clips[1].playbackRate).toBe(.8);
    clips[1].onended?.(); await second;
    expect(settings.narration).toHaveBeenLastCalledWith(false);
    host.destroy();
    await expect(host.speak(item)).rejects.toThrow('closed');
  });
});
