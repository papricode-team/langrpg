import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchForUpdates } from './app-updates';

describe('deployed application updates', () => {
  let page: EventTarget & { hidden: boolean };
  let browser: EventTarget;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let stop: (() => void) | undefined;
  const response = (version: string) => new Response(JSON.stringify({ version }));

  beforeEach(() => {
    vi.useFakeTimers();
    page = Object.assign(new EventTarget(), { hidden: false });
    browser = Object.assign(new EventTarget(), {
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('document', page);
    vi.stubGlobal('window', browser);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('detects an already deployed update using the loaded build, then notifies only once', async () => {
    fetchMock.mockResolvedValue(response('new-build'));
    const notify = vi.fn();
    stop = watchForUpdates('loaded-build', notify);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledWith('/api/version', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
    expect(notify).toHaveBeenCalledOnce();
    browser.dispatchEvent(new Event('focus'));
    browser.dispatchEvent(new Event('online'));
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
  });

  it('keeps the current page until the deployed build changes', async () => {
    fetchMock.mockResolvedValueOnce(response('loaded-build')).mockResolvedValue(response('new-build'));
    const notify = vi.fn();
    stop = watchForUpdates('loaded-build', notify);
    await vi.advanceTimersByTimeAsync(0);
    expect(notify).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('retries quietly after offline, unavailable and invalid version responses', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('not JSON'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 12 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 'bad version' })))
      .mockResolvedValueOnce(new Response('null'))
      .mockResolvedValue(response('new-build'));
    const notify = vi.fn();
    stop = watchForUpdates('loaded-build', notify);
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(notify).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('pauses hidden tabs and checks when visible, focused or back online', async () => {
    fetchMock.mockImplementation(async () => response('loaded-build'));
    page.hidden = true;
    stop = watchForUpdates('loaded-build', vi.fn());
    await vi.advanceTimersByTimeAsync(120_000);
    browser.dispatchEvent(new Event('focus'));
    expect(fetchMock).not.toHaveBeenCalled();

    page.hidden = false;
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    browser.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    browser.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('avoids overlapping checks and recovers after a request times out', async () => {
    let aborted = false;
    fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('timeout')); });
    })).mockResolvedValue(response('new-build'));
    const notify = vi.fn();
    stop = watchForUpdates('loaded-build', notify);
    browser.dispatchEvent(new Event('focus'));
    browser.dispatchEvent(new Event('online'));
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(aborted).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50_000);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('cancels checks on cleanup and ignores a late response', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise(done => { resolve = done; }));
    const notify = vi.fn();
    stop = watchForUpdates('loaded-build', notify);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    stop();
    expect(signal?.aborted).toBe(true);
    resolve(response('new-build'));
    browser.dispatchEvent(new Event('focus'));
    browser.dispatchEvent(new Event('online'));
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
  });
});
