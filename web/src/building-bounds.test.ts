import {describe,expect,it} from 'vitest';
import {buildingBounds,type BuildingPlacement} from './building-bounds';

const house:BuildingPlacement={asset:'house',frame:'house-inn',x:200,y:300,width:100};
const geometry={referenceWidth:200,visualBounds:{left:-60,top:-300,right:140,bottom:20}};

describe('painted building bounds',()=>{
  it('uses scaled full painting bounds and mirrors an asymmetric pivot',()=>{
    expect(buildingBounds(house,geometry)).toEqual({left:170,top:150,right:270,bottom:310});
    expect(buildingBounds({...house,flipX:true},geometry)).toEqual({left:130,top:150,right:230,bottom:310});
    expect(buildingBounds(house,{referenceWidth:100,width:200,height:300,originX:.5,originY:1,
      base:{referenceWidth:400,originX:.25,originY:.9}})).toEqual({left:187.5,top:232.5,right:237.5,bottom:307.5});
  });

  it('requires painting dimensions',()=>{
    expect(buildingBounds(house,{referenceWidth:200})).toBeUndefined();
  });
});
