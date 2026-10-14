import {isBuildingPlacement} from './building-spacing';
import type {SceneScenery} from './scene-schema';

export type EditorSceneryLayer = 'buildings' | 'vegetation' | 'props';
export interface EditorLayers {
  terrain:boolean;
  buildings:boolean;
  vegetation:boolean;
  props:boolean;
  story:boolean;
  activities:boolean;
  ground:boolean;
  collision:boolean;
  districts:boolean;
}

export const editorLayerLabels:Readonly<Record<keyof EditorLayers,string>>={
  terrain:'Terrain',buildings:'Buildings',vegetation:'Vegetation',props:'Other props',
  story:'Story characters & discoveries',activities:'Doors & activity slots',
  ground:'Walkable ground',collision:'Collision',districts:'Districts',
};
export const editorArtworkLayers= ['terrain','buildings','vegetation','props'] as const;
export const editorGuideLayers= ['story','activities','ground','collision','districts'] as const;

/** Inspection switches stay outside the scene document and its undo history. */
export const defaultEditorLayers=():EditorLayers=>({
  terrain:true,buildings:true,vegetation:true,props:true,
  story:false,activities:false,ground:false,collision:false,districts:false,
});

export function editorSceneryLayer(item:Pick<SceneScenery,'asset'|'frame'>):EditorSceneryLayer {
  if(isBuildingPlacement(item))return 'buildings';
  if(['tree','cypress','planter'].includes(item.asset))return 'vegetation';
  return 'props';
}

export const editorSceneryVisible=(item:Pick<SceneScenery,'id'|'asset'|'frame'>,layers:EditorLayers,hidden:ReadonlySet<string>):boolean=>
  layers[editorSceneryLayer(item)]&&!hidden.has(item.id);

/** Use the same exclusions for painting, clicks, grouped selection and erasing. */
export function editorHiddenScenery(items:readonly SceneScenery[],layers:EditorLayers,hidden:ReadonlySet<string>):Set<string> {
  return new Set([...hidden,...items.filter(item=>!layers[editorSceneryLayer(item)]).map(item=>item.id)]);
}

export function editorArtworkView(layers:EditorLayers,terrainOnly=false):EditorLayers {
  return {...layers,terrain:true,buildings:!terrainOnly,vegetation:!terrainOnly,props:!terrainOnly,
    ...(terrainOnly?{story:false,activities:false,ground:false,collision:false,districts:false}:{})};
}
