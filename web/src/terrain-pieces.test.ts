import {describe,it,expect} from 'vitest';
import {terrainPieces,terrainPieceSurfaces} from './terrain-pieces';
import {modularTerrainBarriers,terrainContains,type ModularTerrain} from './modular-terrain';
import {parseWorldSceneDocument} from './scene-schema';
import {sceneDocument} from './scene-data';
describe('terrain construction kit',()=>{
 it('keeps every piece inside its cell and validates through the published scene schema',()=>{
  for(const piece of terrainPieces){
   const surfaces=terrainPieceSurfaces(piece.id,256,256);
   const doc=structuredClone(sceneDocument);doc.maps.lindenhafen.modularTerrain={version:1,base:'meadow',surfaces};
   expect(()=>parseWorldSceneDocument(doc),piece.id).not.toThrow();
   for(const surface of surfaces)for(const [x,y]of surface.polygon){expect(x).toBeGreaterThanOrEqual(256);expect(x).toBeLessThanOrEqual(512);expect(y).toBeGreaterThanOrEqual(256);expect(y).toBeLessThanOrEqual(512);}
   expect(new Set(surfaces.map(s=>s.groupId)).size).toBe(1);
   for(const [side,x,y] of [[1,128,.1],[2,255.9,128],[4,128,255.9],[8,.1,128]])
    expect(terrainContains(surfaces[1].polygon,x+256,y+256),`${piece.id} connector ${side}`).toBe(!!(piece.ports&side));
  }
 });
 it('joins waterways without a collision dam and cuts crossings with bridge pieces',()=>{
  const terrain:ModularTerrain={version:1,base:'meadow',surfaces:[...terrainPieceSurfaces('canal-straight-ns',0,0,'upper'),...terrainPieceSurfaces('canal-straight-ns',0,256,'lower')]};
  const blocked=(t:ModularTerrain,x:number,y:number)=>modularTerrainBarriers(t,512,512).some(p=>terrainContains(p,x,y));
  for(const y of [1,255.9,256.1,510])expect(blocked(terrain,128,y)).toBe(true);
  expect(blocked(terrain,72,100)).toBe(false);
  const bridge={...terrain,surfaces:[...terrain.surfaces,...terrainPieceSurfaces('timber-straight-ew',0,0,'crossing')]};
  expect(blocked(bridge,128,128)).toBe(false);expect(blocked(bridge,128,40)).toBe(true);
 });
});
