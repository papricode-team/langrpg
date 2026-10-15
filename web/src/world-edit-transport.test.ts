import {afterEach,describe,it,expect,vi} from 'vitest';
import {WorldEditSession} from './world-edit-session';
import {sceneDocument} from './scene-data';
import {terrainFingerprint} from './modular-terrain';
afterEach(()=>vi.unstubAllGlobals());

describe('isolated authoring transport',()=>{
 it('routes edits, undo, reads, validation and whole-world imports through the supplied transport',async()=>{
  const network=vi.fn(()=>{throw new Error('Unexpected backend request');});vi.stubGlobal('fetch',network);
  const transport=vi.fn<typeof fetch>(async(input,init)=>{
   const path=String(input);
   if(path.endsWith('/ops'))return Response.json({revision:'draft',from:'old',contentVersion:'new',applied:JSON.parse(String(init?.body)).ops,warnings:[]});
   if(path.endsWith('/validate'))return Response.json({valid:true,diagnostics:[]});
   return Response.json({document:sceneDocument,revision:'draft',contentVersion:'new',locks:[]});
  });
  const session=new WorldEditSession(()=> 'draft',()=>sceneDocument,transport);
  await session.commit([{kind:'terrain',map:'lindenhafen',expected:terrainFingerprint(undefined),terrain:{version:1,base:'canal-grass',surfaces:[]}}]);
  expect(session.canUndo).toBe(true);await session.undo();expect(session.canUndo).toBe(false);
  await session.status('lindenhafen');await session.loadWorld();await session.validate(sceneDocument);await session.replaceWorld(sceneDocument,'draft');
  expect(transport).toHaveBeenCalledTimes(6);expect(network).not.toHaveBeenCalled();
  expect(transport.mock.calls.at(-1)?.[1]?.method).toBe('PUT');
 });
});
