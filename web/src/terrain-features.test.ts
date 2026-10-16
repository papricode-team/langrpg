import {describe,it,expect} from 'vitest';
import {terrainFeatures,featureBounds,featureSurfaces} from './terrain-features';
import {groundBarriers,groundFingerprint,plainGround,type Ground} from './ground';
import {parseWorldSceneDocument} from './scene-schema';
import {sceneDocument} from './scene-data';
import {applyEditOps,inverseEditOps,type WorldEditOp} from './world-edit-ops';
const bridge={id:'bridge',asset:'canal-arch-bridge',x:100,y:80,width:800};
function inside(polygon:readonly (readonly [number,number])[],x:number,y:number):boolean{
 let result=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const [a,b]=polygon[i],[c,d]=polygon[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)result=!result;}
 return result;
}
const blocked=(ground:Ground,x:number,y:number)=>groundBarriers(ground,2000,2000).some(p=>inside(p,x,y));
describe('ground features',()=>{
 it('opens only the bridge deck over water and keeps masonry and the arch below impassable',()=>{
  const water={...plainGround('deep-water',2000,2000),features:[bridge]};
  expect(blocked(water,100+800*.5,80+800*.44)).toBe(false);
  expect(blocked(water,100+800*.25,80+800*.52)).toBe(true);
  // The near pillar cap is raised masonry, even though it projects into the deck.
  expect(blocked(water,100+800*.28,80+800*.38)).toBe(true);
  expect(blocked(water,100+800*.5,80+800*.8)).toBe(true);
  expect(blocked({...water,features:[]},100+800*.5,80+800*.44)).toBe(true);
 });
 it('moves and scales traced collision with the artwork without changing its camera',()=>{
  const original=featureSurfaces(bridge),moved=featureSurfaces({...bridge,x:250,y:120,width:400});
  expect(moved[1].polygon[0]).toEqual([250+(original[1].polygon[0][0]-100)/2,120+(original[1].polygon[0][1]-80)/2]);
  expect(featureBounds(bridge).height).toBe(800);
 });
 it('publishes and undoes placed artwork with the rest of the ground',()=>{
  const before=sceneDocument.maps.lindenhafen.ground,ground={...before,features:[bridge]};
  const op:WorldEditOp={kind:'ground',map:'lindenhafen',ground,expected:groundFingerprint(before)};
  const undo=inverseEditOps(sceneDocument,op),applied=applyEditOps(sceneDocument,[op]).document;
  expect(applied.maps.lindenhafen.ground.features).toEqual([bridge]);
  expect(applyEditOps(applied,undo).document).toEqual(sceneDocument);
  expect(()=>applyEditOps(applied,[op])).toThrow(/ground changed/);
 });
 it.each(['unknown art','outside world','invalid width'])('rejects %s in a published ground feature',kind=>{
  const doc=structuredClone(sceneDocument),feature={...bridge};
  if(kind==='unknown art')feature.asset='unregistered';
  if(kind==='outside world')feature.x=doc.maps.lindenhafen.width-100;
  if(kind==='invalid width')feature.width=-1;
  doc.maps.lindenhafen.ground={...doc.maps.lindenhafen.ground,features:[feature]};
  expect(()=>parseWorldSceneDocument(doc)).toThrow();
 });
 it('has varied independently painted geometry at actual HD resolution',()=>{
  expect(terrainFeatures).toHaveLength(15);
  expect(new Set(terrainFeatures.map(a=>JSON.stringify(a.outline))).size).toBe(terrainFeatures.length);
  for(const art of terrainFeatures){expect(Math.min(art.width,art.height)).toBeGreaterThanOrEqual(1024);expect(art.surfaces.some(s=>!s.blocked)).toBe(true);}
 });
});
