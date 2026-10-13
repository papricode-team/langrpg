import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api } from './api';
import { expeditionIds } from './expeditions';

function storedRegion(id: string | null) {
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'atlas.map' ? id : null });
}
afterEach(() => vi.unstubAllGlobals());

describe('saved playable destination', () => {
  it.each(['lindenhafen', 'waldruh', 'nebelstadt'])('restores the authored town %s after a reload', id => {
    storedRegion(id);
    expect(new Api().mapId).toBe(id);
  });
  it.each(expeditionIds)('returns a retired destination %s to the starting town', id => {
    storedRegion(id);
    expect(new Api().mapId).toBe('lindenhafen');
  });
  it.each([null, 'unknown-region', 'saffroncourt?draft'])('keeps the starting town for an invalid saved value %s', id => {
    storedRegion(id);
    expect(new Api().mapId).toBe('lindenhafen');
  });
});
