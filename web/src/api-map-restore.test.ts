import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api } from './api';
import { expeditionIds } from './expeditions';

function storedRegion(id: string | null) {
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'atlas.map' ? id : null });
}
afterEach(() => vi.unstubAllGlobals());

describe('saved expedition destination', () => {
  it.each(expeditionIds)('restores %s when the client is recreated after a reload', id => {
    storedRegion(id);
    expect(new Api().mapId).toBe(id);
  });
  it.each([null, 'unknown-region', 'saffroncourt?draft'])('keeps the starting town for an invalid saved value %s', id => {
    storedRegion(id);
    expect(new Api().mapId).toBe('lindenhafen');
  });
});
