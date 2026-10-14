import {describe,expect,it} from 'vitest';
import {BUILDING_SPACING,buildingBounds,buildingsTooClose,isBuildingPlacement,type BuildingPlacement} from './building-spacing';
import {getSceneryGeometryMap} from './scene-schema';
import {sceneDocument} from './scene-data';

const house:BuildingPlacement={asset:'house',frame:'house-inn',x:200,y:300,width:100};
const geometry={referenceWidth:200,visualBounds:{left:-60,top:-300,right:140,bottom:20}};
const manifest={assets:{'house-inn':geometry}};

describe('painted building spacing',()=>{
  it('uses scaled full painting bounds and mirrors an asymmetric pivot',()=>{
    expect(buildingBounds(house,geometry)).toEqual({left:170,top:150,right:270,bottom:310});
    expect(buildingBounds({...house,flipX:true},geometry)).toEqual({left:130,top:150,right:230,bottom:310});
    expect(buildingBounds(house,{referenceWidth:100,width:200,height:300,originX:.5,originY:1,
      base:{referenceWidth:400,originX:.25,originY:.9}})).toEqual({left:187.5,top:232.5,right:237.5,bottom:307.5});
  });

  it('separates roofs and façades even when anchors and foundations are far apart',()=>{
    expect(buildingsTooClose(house,{...house,y:410},manifest)).toBe(true);
    expect(buildingsTooClose(house,{...house,x:300+BUILDING_SPACING-1},manifest)).toBe(true);
    expect(buildingsTooClose(house,{...house,x:300+BUILDING_SPACING},manifest)).toBe(false);
    expect(buildingsTooClose(house,{...house,y:460+BUILDING_SPACING},manifest)).toBe(false);
  });

  it('measures diagonal gaps between painting edges and respects flipped neighbours',()=>{
    expect(buildingsTooClose(house,{...house,x:323,y:483},manifest)).toBe(false); // 23 units on both axes.
    expect(buildingsTooClose(house,{...house,x:322,y:482},manifest)).toBe(true);
    expect(buildingsTooClose(house,{...house,x:320,flipX:true},manifest)).toBe(true);
  });

  it('checks actual buildings, including alternate façades and decorative buildings',()=>{
    for(const asset of ['house','archive','cafe','station','workshop','greenhouse'])expect(isBuildingPlacement({asset})).toBe(true);
    expect(isBuildingPlacement({asset:'stall',frame:'house-grocery'})).toBe(true);
    expect(isBuildingPlacement({asset:'arch'})).toBe(false);
    expect(buildingsTooClose(house,{...house,asset:'tree',frame:'tree'},manifest)).toBe(false);
    expect(buildingBounds(house,{referenceWidth:200})).toBeUndefined();
  });

  for(const [id,scene] of Object.entries(sceneDocument.maps))it(`${id} keeps every building apart across the complete map`,()=>{
    const buildings=scene.scenery.filter(isBuildingPlacement),geometry=getSceneryGeometryMap(id);
    for(let index=0;index<buildings.length;index++)for(const other of buildings.slice(index+1)){
      const building=buildings[index];
      expect(buildingBounds(building,geometry.assets[building.frame??building.asset]),`${id}/${building.id} needs full painting geometry`).toBeDefined();
      expect(buildingsTooClose(building,other,geometry),`${id}/${building.id} overlaps or crowds ${other.id}`).toBe(false);
    }
  });
});
