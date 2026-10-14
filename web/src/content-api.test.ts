import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentApi, getSentence, type ContentRecord } from './content-api';
import { clearSentences, type AuthoredSentence } from './translated-sentence';

const body: AuthoredSentence = { text: 'Hello.', target: 'en', translations: { tr: { text: 'Merhaba.', words: [] } }, words: [] };
const record: ContentRecord<AuthoredSentence> = { id: 'sentence-one', courseId: 'course-one', version: 1, body };
afterEach(() => clearSentences());

describe('session content cache', () => {
  it('coalesces simultaneous batch reads and caches each record', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ records: [record] }), { status: 200 }));
    const api = new ContentApi(() => 'session-token', fetcher);
    const [a, b] = await Promise.all([api.sentences([record.id]), api.sentences([record.id])]);
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer session-token' } });
    await api.sentences([record.id]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getSentence(record.id)?.text).toBe('Hello.');
  });
  it('aborts pending work and rejects late old-course responses even when transport ignores abort', async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(done => { resolve = done; }));
    const api = new ContentApi(() => 'token', fetcher);
    api.configure(() => 'token', { courseId: 'old', supportLanguage: 'tr' });
    const old = api.sentences([record.id]);
    const signal = fetcher.mock.calls[0][1]?.signal;
    api.configure(() => 'token', { courseId: 'new', supportLanguage: 'de' });
    expect(signal?.aborted).toBe(true);
    resolve(new Response(JSON.stringify({ records: [record] }), { status: 200 }));
    await expect(old).rejects.toMatchObject({ name: 'AbortError' });
    expect(getSentence(record.id)).toBeUndefined();
  });
  it('invalidates cached records automatically when login replaces the token', async () => {
    let token = 'first';
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ records: [record] }), { status: 200 }));
    const api = new ContentApi(() => token, fetcher);
    await api.sentences([record.id]); token = 'second'; await api.sentences([record.id]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('enforces bounded reads before the network and silently keeps unknown IDs absent', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ records: [] }), { status: 200 }));
    const api = new ContentApi(() => 'token', fetcher);
    await expect(api.sentences(Array.from({ length: 13 }, (_, i) => `id-${i}`))).rejects.toThrow('At most 12');
    expect(fetcher).not.toHaveBeenCalled();
    expect(await api.lexemes(['unknown'])).toEqual([]);
  });
  it('retries omitted records when story progress unlocks them', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ records: [] }), { status: 200 }));
    const api = new ContentApi(() => 'token', fetcher);
    expect(await api.sentences([record.id])).toEqual([]);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ records: [record] }), { status: 200 }));
    expect(await api.sentences([record.id])).toEqual([record]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('refreshes bootstrap visibility without discarding previously fetched sentences', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url).includes('sentences?') ? { records: [record] } : { version: 1 }), { status: 200 }));
    const api = new ContentApi(() => 'token', fetcher);
    await api.sentences([record.id]); await api.bootstrap(); api.invalidate('bootstrap'); await api.bootstrap();
    expect(getSentence(record.id)?.text).toBe('Hello.');
    await api.sentences([record.id]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
