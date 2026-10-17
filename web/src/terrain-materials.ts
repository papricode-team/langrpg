import catalogue from './data/terrain-materials.json' with {type:'json'};
// Keep plan previews and ground colour sampling aligned with the repainted masters.
// Asset IDs and URLs stay stable for existing authored worlds.
const paintedPalette:Record<string,{color:string;name?:string}>={
  'meadow':{color:'#5f7d4a'},
  'canal-grass':{color:'#5f7d4a'},
  'cobble':{color:'#b7a382'},
  'limestone':{color:'#e0c89b'},
  'brick':{color:'#b16c4d'},
  'slate':{color:'#687e82'},
  'town-cobble':{name:'Lindenhafen sandstone cobbles',color:'#c3ad84'},
  'canal-masonry':{color:'#c9b087'},
  'canal-water':{color:'#637f83'},
  'banked-water':{color:'#637f83'},
  'deep-water':{color:'#436c70'},
};
export const terrainMaterials=catalogue.materials.map(material=>({...material,...paintedPalette[material.id]}));
export type TerrainMaterialId=string;
const byId=new Map(terrainMaterials.map(material=>[material.id,material]));
export const terrainMaterial=(id:string)=>byId.get(id);
export const terrainMaterialKey=(id:string)=>`terrain-material-${id}`;
