import {groundBarriers} from './ground';
import {sceneryFootprints,type SceneryFootprintManifest} from './placed-scenery';
import {getSceneryGeometryMap,type ScenePolygon,type WorldScene} from './scene-schema';

/** Shared by play, actor routes, the editor and the save-time compiler. */
export function sceneNavigationGeometry(scene:WorldScene,manifest:SceneryFootprintManifest=getSceneryGeometryMap(scene.id)):
  {ground:readonly ScenePolygon[];terrain:readonly ScenePolygon[];objects:readonly ScenePolygon[];barriers:readonly ScenePolygon[]} {
  // The whole town is land; painted water and rock, and the footprints objects own, stop walkers.
  const ground:readonly ScenePolygon[]=[[[0,0],[scene.width,0],[scene.width,scene.height],[0,scene.height]]];
  const terrain=groundBarriers(scene.ground,scene.width,scene.height);
  const anchors=scene.objects.flatMap(object=>object.collision?.polygons.map(polygon=>polygon.map(([x,y])=>[object.x+x/object.collision!.referenceWidth,object.y+y/object.collision!.referenceWidth] as const))??[]);
  const objects=[...sceneryFootprints(scene.scenery,manifest),...anchors];
  return {ground,terrain,objects,barriers:[...terrain,...objects]};
}
