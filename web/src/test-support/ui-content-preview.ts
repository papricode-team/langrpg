import fixture from '../test-fixtures/content-public.json';
import { contentApi } from '../content-api';
import { loadActivity, loadInterior, loadInteriorConversation, loadServerContent, loadStoryContent, loadWords } from '../content-runtime';
import { emptyProgress, type SessionResult } from '../api';
import { baseLanguage } from '../i18n';
import type { Avatar } from '../world';

/** Read-only public fixtures for the frontend-only development screenshot harness. */
export async function installUiContentPreview(avatar: Avatar): Promise<void> {
  if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('ui-check')) throw new Error('The UI preview is unavailable.');
  const records = new Map(fixture.records.map(record => [record.id, record]));
  contentApi.request = async <T>(path: string, body?: unknown): Promise<T> => {
    if (body !== undefined) throw new Error('This preview does not save progress.');
    const url = new URL(path, 'https://preview.example');
    const resource = url.pathname.split('/').at(-1)!;
    if (resource === 'bootstrap') return structuredClone(records.get(fixture.bootstrapId)) as T;
    if (resource === 'courses') return { courses: [fixture.course] } as T;
    if (resource === 'sentences' || resource === 'lexemes') return { records: (url.searchParams.get('ids') ?? '').split(',').map(id => records.get(id)).filter(Boolean).map(record => structuredClone(record)) } as T;
    const record = records.get(resource);
    if (!record) throw Object.assign(new Error('This public preview record is unavailable.'), { status: 404 });
    return structuredClone(record) as T;
  };
  const session = { token: '', activeCourseId: fixture.course.id, player: { id: 'ui-check', name: 'Wanderer', avatar }, progress: emptyProgress(), account: { registered: true, email: '' }, preferences: { baseLanguage: baseLanguage() } } as SessionResult;
  await loadServerContent(session);
  await loadWords([fixture.lexemeId]);
  await loadStoryContent(24);
  await loadInterior('cafe');
  await loadInteriorConversation('interior:cafe:coffee');
  await loadActivity('cafe', 'A1');
}
