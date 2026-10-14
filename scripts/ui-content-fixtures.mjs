// Used only by the isolated screenshot test browser, never served by the app.
const hiddenFields = new Set(['slug','localid','legacyid','answer','acceptedanswers','explanation','orderexplanation','expected','correct','correctanswer','modelanswer','validvalues','solutions','solution','turkish']);
function safe(value) {
  if (Array.isArray(value)) return value.map(safe);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).filter(([key]) => !hiddenFields.has(key.toLowerCase())).map(([key, child]) => [key, safe(child)]));
  for (const key of ['meaning','meanings','translations','hint']) if (result[key]?.en !== undefined) result[key] = result[key].en;
  return result;
}
export function uiContentFixtures(content) {
  const records = Object.fromEntries(Object.entries(content.records).map(([kind, rows]) => [kind, new Map(rows.map(row => [row.id, row]))]));
  const bodies = kind => [...(records[kind]?.values() ?? [])].map(row => ({ ...row.body, id: row.id }));
  const bootstrap = {
    ...content.metadata,
    npcs: [...records.npcs.values()].map(row => ({ ...row.body, id: row.id, portraitId: row.slug })),
    quests: bodies('quests').map(row => ({ ...row, unlocked: true })),
    units: bodies('units').map(row => ({ ...row, unlocked: true })),
    grammar: bodies('grammar'), narratives: bodies('narratives'),
    previewWordIds: bodies('lexemes').filter(word => word.level === 'A1').slice(0, 24).map(word => word.id),
  };
  return (href, method = 'GET', surface = '') => {
    if (method !== 'GET') return { status: 405, body: { error: 'Screenshot fixtures are read-only.' } };
    const url = new URL(href, 'http://fixture.local');
    const match = /^\/api\/content\/([a-z]+)(?:\/([0-9a-f-]+))?$/.exec(url.pathname);
    if (!match) return { status: 404, body: {} };
    const [, kind, id] = match;
    if (kind === 'bootstrap') return { status: 200, body: safe(bootstrap) };
    const rows = records[kind];
    if (!rows) return { status: 404, body: {} };
    if (id) {
      const row = rows.get(id);
      if (!row) return { status: 404, body: {} };
      // This fixture exercises the scripted fallback when no graded practice is available.
      const body = surface === 'encounter' && kind === 'narratives' && row.body.kind === 'interior' ? { ...row.body, exerciseIds: [] } : row.body;
      return { status: 200, body: safe({ ...body, id }) };
    }
    if (!['lines','lexemes'].includes(kind)) return { status: 404, body: {} };
    const selected = (url.searchParams.get('ids') ?? '').split(',').map(key => rows.get(key)).filter(Boolean);
    return { status: 200, body: { [kind]: selected.map(row => safe({ ...row.body, id: row.id })) } };
  };
}
