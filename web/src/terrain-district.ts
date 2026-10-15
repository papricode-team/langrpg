import draft from './data/terrain-district.json';
import {terrainObject} from './terrain-objects';
import {parseWorldSceneDocument,type WorldScene,type WorldSceneDocument} from './scene-schema';
/** An authored layout study. It never replaces a published town implicitly. */
export const terrainDistrict=draft;
export function districtScene(template:WorldScene):WorldScene{
  return {...template,width:draft.width,height:draft.height,spawn:draft.spawn,
    npcs:template.npcs.map(item=>{const [x,y]=(draft.npcs as Record<string,number[]>)[item.id];return {...item,x,y};}),
    objects:template.objects.map(item=>{const [x,y]=(draft.objects as Record<string,number[]>)[item.id];return {...item,x,y};}),activities:[],residents:[],generationZones:[],prefabInstances:[],districts:[],
    walkable:[],obstacles:[],
    navigation:{model:'clear-land',terrainCollision:[]},
    terrain:[{id:'district-ground',dayAsset:template.terrain[0].dayAsset,x:0,y:0,width:draft.width,height:draft.height}],
    modularTerrain:structuredClone(draft.modularTerrain) as unknown as WorldScene['modularTerrain'],
    scenery:draft.scenery.map(item=>{const detail=terrainObject(item.frame);return {...item,
      asset:detail?.role??item.asset,collidable:detail?.collidable??item.collidable,
      motion:detail?(detail.motion==='still'?'still':'boat'):'still'};}) as WorldScene['scenery']};
}
export function districtDocument(template:WorldSceneDocument):WorldSceneDocument{
  return parseWorldSceneDocument({...template,maps:{...template.maps,lindenhafen:districtScene(template.maps.lindenhafen)}});
}
