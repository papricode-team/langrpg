import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import data from './data/world-scenes.json';

beforeEach(()=>vi.resetModules());
afterEach(()=>vi.unstubAllGlobals());

describe('published world loading',()=>{
  it('uses saved scenery and its version for the multiplayer handshake',async()=>{
    const document=structuredClone(data);
    document.maps.lindenhafen.scenery[0].x+=12;
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({document,contentVersion:'published-world'}))));
    const scenes=await import('./scene-data');
    await scenes.loadPublishedWorld();
    expect(scenes.getWorldScene('lindenhafen').scenery[0].x).toBe(document.maps.lindenhafen.scenery[0].x);
    expect(scenes.sceneContentVersion).toBe('published-world');
    const {compatibleScene}=await import('./api');
    const scene=scenes.getWorldScene('lindenhafen');
    expect(compatibleScene({...scene,contentVersion:'published-world'},'lindenhafen')).toBe(true);
    expect(compatibleScene({...scene,contentVersion:'older-world'},'lindenhafen')).toBe(false);
  });

  it('retains the bundled world on older servers without a publication endpoint',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:404})));
    const scenes=await import('./scene-data'),before=scenes.sceneDocument;
    await scenes.loadPublishedWorld();expect(scenes.sceneDocument).toBe(before);
  });

  it.each([
    {document:{},contentVersion:'broken'},
    {document:data,contentVersion:''},
  ])('keeps the current world when a publication is invalid',async result=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(result))));
    const scenes=await import('./scene-data'),before=scenes.sceneDocument,version=scenes.sceneContentVersion;
    await expect(scenes.loadPublishedWorld()).rejects.toThrow();
    expect(scenes.sceneDocument).toBe(before);expect(scenes.sceneContentVersion).toBe(version);
  });

  it('reports storage outages so clients cannot play with stale geometry',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:503})));
    const scenes=await import('./scene-data');
    await expect(scenes.loadPublishedWorld()).rejects.toThrow('could not be loaded');
  });
});
