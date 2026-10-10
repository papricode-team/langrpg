import { describe, it, expect, vi } from 'vitest';
import { emptyProgress } from './api';
import { ReviewAttempt } from './review-attempt';
import type { AttemptSubmission, AttemptResult } from './review-attempt';

const submission = (mode: AttemptSubmission['mode'] = 'production'): AttemptSubmission => ({id:'stable-id',exerciseId:'exercise',itemId:'item',answer:'Ich bin hier',hinted:false,mode,responseTimeMs:2300});
const receipt = (correct = true): AttemptResult => ({correct,xpAdded:6,duplicate:false,progress:emptyProgress()});

describe('rating after a review answer', () => {
  it.each(['recognition','production','listening'] as const)('asks for an explicit rating after a correct %s answer and saves once', async mode => {
    const transport = {preview:vi.fn().mockResolvedValue({correct:true}),save:vi.fn().mockResolvedValue(receipt())};
    const input = submission(mode), review = new ReviewAttempt(input);
    expect(await review.submit(transport)).toEqual({kind:'rating'});
    expect(transport.save).not.toHaveBeenCalled();
    input.answer = 'a different answer'; input.responseTimeMs = 99999;
    expect(await review.submit(transport,'hard')).toEqual({kind:'saved',result:receipt()});
    expect(transport.preview).toHaveBeenCalledTimes(1);
    expect(transport.save).toHaveBeenCalledWith({...submission(mode),rating:'hard'});
    expect(await review.submit(transport,'easy')).toEqual({kind:'ignored'});
    expect(transport.save).toHaveBeenCalledTimes(1);
  });

  it('records wrong answers immediately without a self-rating', async () => {
    const transport = {preview:vi.fn().mockResolvedValue({correct:false}),save:vi.fn().mockResolvedValue(receipt(false))};
    const review = new ReviewAttempt({...submission(),rating:'easy'});
    expect(await review.submit(transport,'easy')).toEqual({kind:'saved',result:receipt(false)});
    expect(transport.save).toHaveBeenCalledWith({...submission(),rating:undefined});
  });

  it('retries an ambiguous save with the same answer, rating, time and id', async () => {
    const transport = {preview:vi.fn().mockResolvedValue({correct:true}),save:vi.fn().mockRejectedValueOnce(new Error('disconnected')).mockResolvedValueOnce(receipt())};
    const review = new ReviewAttempt(submission());
    await review.submit(transport);
    await expect(review.submit(transport,'good')).rejects.toThrow('disconnected');
    expect(await review.submit(transport,'easy')).toEqual({kind:'saved',result:receipt()});
    expect(transport.preview).toHaveBeenCalledTimes(1);
    expect(transport.save.mock.calls[0][0]).toEqual(transport.save.mock.calls[1][0]);
    expect(transport.save.mock.calls[1][0].rating).toBe('good');
  });

  it('abandons a pending preview on close without saving or requesting a rating', async () => {
    let resolve!: (value:{correct:boolean}) => void;
    const transport = {preview:vi.fn(() => new Promise<{correct:boolean}>(done => { resolve = done; })),save:vi.fn().mockResolvedValue(receipt())};
    const review = new ReviewAttempt(submission()), pending = review.submit(transport);
    expect(await review.submit(transport)).toEqual({kind:'ignored'});
    review.cancel(); resolve({correct:false});
    expect(await pending).toEqual({kind:'ignored'});
    expect(await review.submit(transport,'good')).toEqual({kind:'ignored'});
    expect(transport.save).not.toHaveBeenCalled();
  });

  it('retries preview failures without changing the original input', async () => {
    const transport = {preview:vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({correct:true}),save:vi.fn()};
    const review = new ReviewAttempt(submission());
    await expect(review.submit(transport)).rejects.toThrow('offline');
    expect(await review.submit(transport)).toEqual({kind:'rating'});
    expect(transport.preview.mock.calls[0][0]).toEqual(transport.preview.mock.calls[1][0]);
    expect(transport.save).not.toHaveBeenCalled();
  });

  it('returns a committed receipt after closing during save so progress can still update', async () => {
    let resolve!: (value:AttemptResult) => void;
    const transport = {preview:vi.fn().mockResolvedValue({correct:true}),save:vi.fn(() => new Promise<AttemptResult>(done => { resolve = done; }))};
    const review = new ReviewAttempt(submission());
    await review.submit(transport);
    const pending = review.submit(transport,'easy');
    review.cancel(); resolve(receipt());
    expect(await pending).toEqual({kind:'saved',result:receipt()});
    expect(transport.save).toHaveBeenCalledTimes(1);
  });
});
