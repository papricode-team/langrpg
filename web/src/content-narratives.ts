import { getContentClient, toDialogueLine, type ContentLine } from './content-api';
import type { TranslatedSentence } from './sentence-translations';

/** Resolve only the line references in the visible record, in bounded API batches. */
export async function hydrateNarrative<T>(record: T): Promise<T> {
  const ids = new Set<string>();
  function collect(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== 'object') return;
    const entry = value as Record<string, unknown>;
    if (typeof entry.lineId === 'string') ids.add(entry.lineId);
    for (const child of Object.values(entry)) collect(child);
  }
  collect(record);
  const client = getContentClient(), lines = new Map<string, ContentLine>();
  const requested = [...ids];
  for (let index = 0; index < requested.length; index += 12) {
    for (const line of await client.lines(requested.slice(index, index + 12))) lines.set(line.id, line);
  }
  function hydrate(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(hydrate);
    if (!value || typeof value !== 'object') return value;
    const entry = value as Record<string, unknown>;
    if (typeof entry.lineId === 'string') {
      const line = lines.get(entry.lineId);
      if (!line) throw new Error('This content could not open. Try again.');
      const dialogue = toDialogueLine(line);
      return { ...entry, german: dialogue.german, english: dialogue.english, aligned: line, localized: true } satisfies TranslatedSentence;
    }
    return Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, hydrate(child)]));
  }
  return hydrate(record) as T;
}
