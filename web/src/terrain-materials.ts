import catalogue from './data/terrain-materials.json' with {type:'json'};
export const terrainMaterials=catalogue.materials;
export type TerrainMaterialId=string;
const byId=new Map(terrainMaterials.map(material=>[material.id,material]));
export const terrainMaterial=(id:string)=>byId.get(id);
export const terrainMaterialKey=(id:string)=>`terrain-material-${id}`;
