import draft from './data/lindenhafen-terrain-rebuild.json';
import {parseWorldSceneDocument,type WorldSceneDocument} from './scene-schema';
import type {ModularTerrain} from './modular-terrain';
export const lindenhafenTerrainRebuild=draft;
/** Terrain review draft. Retain canonical story IDs required by the editor; the comparison only renders terrain. */
export function lindenhafenTerrainDocument(original:WorldSceneDocument):WorldSceneDocument{
 const scene=original.maps.lindenhafen;
 return parseWorldSceneDocument({...original,maps:{...original.maps,lindenhafen:{...scene,
  spawn:draft.spawn,scenery:[],activities:[],residents:[],generationZones:[],prefabInstances:[],districts:[],walkable:[],obstacles:[],
  navigation:{model:'clear-land',terrainCollision:[]},modularTerrain:structuredClone(draft.modularTerrain) as unknown as ModularTerrain,
 }}});
}
