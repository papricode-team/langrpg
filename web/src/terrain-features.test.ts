import {describe,it,expect,vi} from 'vitest';
import {terrainFeatures,featureBounds,featureSurfaces} from './terrain-features';
import {modularTerrainBarriers,terrainContains,terrainFingerprint,type ModularTerrain} from './modular-terrain';
import {paintModularTerrain} from './modular-terrain-renderer';
import {parseWorldSceneDocument} from './scene-schema';
import {sceneDocument} from './scene-data';
import {applyEditOps,inverseEditOps,type WorldEditOp} from './world-edit-ops';
const bridge={id:'bridge',asset:'canal-arch-bridge',x:100,y:80,width:800};
const blocked=(terrain:ModularTerrain,x:number,y:number)=>modularTerrainBarriers(terrain,2000,2000).some(p=>terrainContains(p,x,y));
describe('painted terrain in the game camera',()=>{
 it('opens only the bridge deck over water and keeps masonry and the arch below impassable',()=>{
  const terrain:ModularTerrain={version:1,base:'deep-water',surfaces:[],features:[bridge]};
  expect(blocked(terrain,100+800*.5,80+800*.44)).toBe(false);
  expect(blocked(terrain,100+800*.25,80+800*.52)).toBe(true);
  expect(blocked(terrain,100+800*.5,80+800*.8)).toBe(true);
  expect(blocked({...terrain,features:[]},100+800*.5,80+800*.44)).toBe(true);
 });
 it('moves and scales traced collision with the artwork without changing its camera',()=>{
  const original=featureSurfaces(bridge),moved=featureSurfaces({...bridge,x:250,y:120,width:400});
  expect(moved[1].polygon[0]).toEqual([250+(original[1].polygon[0][0]-100)/2,120+(original[1].polygon[0][1]-80)/2]);
  expect(featureBounds(bridge).height).toBe(800);
 });
 it('publishes and undoes independently placed artwork without changing its source painting',()=>{
  const terrain:ModularTerrain={version:1,base:'meadow',surfaces:[],features:[bridge]};
  const op:WorldEditOp={kind:'terrain',map:'lindenhafen',terrain,expected:terrainFingerprint(sceneDocument.maps.lindenhafen.modularTerrain)};
  const undo=inverseEditOps(sceneDocument,op),applied=applyEditOps(sceneDocument,[op]).document;
  expect(applied.maps.lindenhafen.modularTerrain?.features).toEqual([bridge]);
  expect(applyEditOps(applied,undo).document).toEqual(sceneDocument);
 });
 it.each(['unknown art','outside world','invalid width'])('rejects %s in a published terrain piece',kind=>{
  const doc=structuredClone(sceneDocument),feature={...bridge};
  if(kind==='unknown art')feature.asset='unregistered';
  if(kind==='outside world')feature.x=doc.maps.lindenhafen.width-100;
  if(kind==='invalid width')feature.width=-1;
  doc.maps.lindenhafen.modularTerrain={version:1,base:'meadow',surfaces:[],features:[feature]};
  expect(()=>parseWorldSceneDocument(doc)).toThrow();
 });
 it('draws visible native art after the ground and culls offscreen art',()=>{
  const image={} as CanvasImageSource,drawImage=vi.fn(),context={drawImage,save:vi.fn(),restore:vi.fn(),fillRect:vi.fn(),createPattern:()=>null} as unknown as CanvasRenderingContext2D;
  paintModularTerrain(context,{version:1,base:'meadow',surfaces:[],features:[bridge,{...bridge,id:'distant',x:3000}]},{x:0,y:0,width:1000,height:1000},()=>undefined,()=>image);
  expect(drawImage).toHaveBeenCalledExactlyOnceWith(image,100,80,800,800);
 });
 it('has varied independently painted geometry at actual HD resolution',()=>{
  expect(terrainFeatures).toHaveLength(14);
  expect(new Set(terrainFeatures.map(a=>JSON.stringify(a.outline))).size).toBe(14);
  for(const art of terrainFeatures){expect(Math.min(art.width,art.height)).toBeGreaterThanOrEqual(1024);expect(art.surfaces.some(s=>!s.blocked)).toBe(true);}
 });
});
