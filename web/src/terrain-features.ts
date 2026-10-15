import catalogue from './data/terrain-features.json' with {type:'json'};
import type {TerrainSurface} from './modular-terrain';
import type {ScenePolygon} from './scene-schema';

/** Authored art retains its camera and aspect ratio. Placement is in world space. */
export interface TerrainFeature {id:string;asset:string;x:number;y:number;width:number;}
export interface TerrainFeatureArt {
  id:string;name:string;category:string;asset:string;thumbnail:string;
  width:number;height:number;worldWidth:number;outline:ScenePolygon;
  surfaces:{material:string;blocked:boolean;polygon:ScenePolygon}[];
}
export const terrainFeatures=catalogue.features as unknown as readonly TerrainFeatureArt[];
const byId=new Map(terrainFeatures.map(feature=>[feature.id,feature]));
export const terrainFeature=(id:string)=>byId.get(id);
export const terrainFeatureKey=(id:string)=>`terrain-feature-${id}`;
export function featureBounds(feature:TerrainFeature){
  const art=terrainFeature(feature.asset);
  return {x:feature.x,y:feature.y,width:feature.width,height:feature.width*(art?art.height/art.width:1)};
}
export function featurePolygon(feature:TerrainFeature,polygon:ScenePolygon):ScenePolygon{
  const bounds=featureBounds(feature);
  return polygon.map(([x,y])=>[bounds.x+x*bounds.width,bounds.y+y*bounds.height] as const);
}
/** Only the deck opens a crossing; wall faces and parapets remain obstacles. */
export function featureSurfaces(feature:TerrainFeature):TerrainSurface[]{
  return (terrainFeature(feature.asset)?.surfaces??[]).map((surface,index)=>({
    ...surface,id:`${feature.id}-${index}`,polygon:featurePolygon(feature,surface.polygon),
  }));
}
