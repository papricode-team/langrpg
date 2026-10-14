// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldEditorApi, validatedWorldImport, worldExportJSON } from './world-editor-api';
import { LevelEditorHistory } from './level-editor-model';
import type { WorldSceneDocument } from './scene-schema';

const fixture = (): WorldSceneDocument => ({ version: 2, maps: { lindenhafen: {
  id: 'lindenhafen', coordinateVersion: 1, width: 1536, height: 1024, spawn: { x: 100, y: 100 }, npcs: [], objects: [],
  walkable: [[[14,14],[1500,14],[1500,1000],[14,1000]]], obstacles: [],
  terrain: [{ id: 'core', x: 0, y: 0, width: 1536, height: 1024, dayAsset: '/assets/lindenhafen-terrain.webp' }], districts: [],
  scenery: [{ id: 'tree', asset: 'tree', x: 100, y: 200, width: 80, pinned: true, generatorId: 'trees' }],
} } });
beforeEach(() => {
  const values = new Map<string,string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('authenticated world editing', () => {
  it('requires an existing admin session and never creates an anonymous editor session', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(new WorldEditorApi('').authenticate()).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValue(new Response(JSON.stringify({ account: { admin: false } })));
    await expect(new WorldEditorApi('token').authenticate()).rejects.toMatchObject({ status: 403 });
    expect(fetch).toHaveBeenCalledWith('/api/session', expect.objectContaining({ method: 'POST', body: '{}', headers: expect.objectContaining({ Authorization: 'Bearer token' }) }));
  });

  it('uses the resumed token and optimistic revision for authenticated saves', async () => {
    const document = fixture();
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ account: { admin: true }, token: 'resumed' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ document, revision: 'next', contentVersion: 'published' })));
    vi.stubGlobal('fetch', fetch);
    const api = new WorldEditorApi('previous'); await api.authenticate();
    expect(localStorage.getItem('atlas.token')).toBe('resumed');
    expect(await api.save(document, 'base')).toMatchObject({ document, revision: 'next', contentVersion: 'published' });
    expect(fetch).toHaveBeenLastCalledWith('/api/admin/world', expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ Authorization: 'Bearer resumed', 'If-Match': '"base"' }), body: JSON.stringify(document) }));
  });

  it('reports revocation and stale revisions without retrying an unsafe save', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Admins only' }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Saved world changed', diagnostics: ['Keep your draft'] }), { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    const api = new WorldEditorApi('token');
    await expect(api.load()).rejects.toMatchObject({ status: 403, message: 'Admins only' });
    await expect(api.save(fixture(), 'stale')).rejects.toMatchObject({ status: 409, message: 'Saved world changed\nKeep your draft' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('world import and export', () => {
  it('keeps the current document and history intact when parsing or server validation fails', async () => {
    const source = fixture(), history = new LevelEditorHistory(source), validate = vi.fn().mockResolvedValue({ valid: false, diagnostics: ['Missing required map'] });
    await expect(validatedWorldImport('invalid JSON', validate)).rejects.toThrow('valid world JSON');
    await expect(validatedWorldImport('{"version":999}', validate)).rejects.toThrow();
    expect(validate).not.toHaveBeenCalled();
    await expect(validatedWorldImport(worldExportJSON(source), validate)).rejects.toThrow('Missing required map');
    expect(history.document).toEqual(source); expect(history.canUndo).toBe(false);
  });

  it('roundtrips every map and adopts a validated import as one undoable draft', async () => {
    const source = fixture(), imported = fixture();
    imported.maps.lindenhafen.scenery[0].x = 300;
    imported.maps.waldruh = { ...structuredClone(imported.maps.lindenhafen), id: 'waldruh' };
    const validate = vi.fn().mockResolvedValue({ valid: true }), history = new LevelEditorHistory(source);
    history.replace(await validatedWorldImport(worldExportJSON(imported), validate));
    expect(validate).toHaveBeenCalledWith(imported); expect(history.document).toEqual(imported);
    history.undo(); expect(history.document).toEqual(source);
    history.redo(); expect(history.document).toEqual(imported);
  });
});
