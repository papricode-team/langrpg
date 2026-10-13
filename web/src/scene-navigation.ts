import {sceneryFootprints,type SceneryFootprintManifest} from './placed-scenery';
import {getSceneryGeometryMap,type ScenePolygon,type WorldScene} from './scene-schema';

/** Shared by play, actor routes, the editor and the save-time compiler. */
export function sceneNavigationGeometry(scene:WorldScene,manifest:SceneryFootprintManifest=getSceneryGeometryMap(scene.id)):
  {ground:readonly ScenePolygon[];terrain:readonly ScenePolygon[];objects:readonly ScenePolygon[];barriers:readonly ScenePolygon[]} {
  // Registered terrain supplies the land extent. Resizing a map does not make
  // unpainted space walkable, and tile boundaries never restrict a street.
  const ground:readonly ScenePolygon[]=scene.navigation?scene.terrain.map(tile=>[[tile.x,tile.y],[tile.x+tile.width,tile.y],[tile.x+tile.width,tile.y+tile.height],[tile.x,tile.y+tile.height]] as const):scene.walkable;
  const terrain=scene.navigation?scene.navigation.terrainCollision.map(hazard=>hazard.polygon):scene.obstacles;
  const anchors=scene.objects.flatMap(object=>object.collision?.polygons.map(polygon=>polygon.map(([x,y])=>[object.x+x/object.collision!.referenceWidth,object.y+y/object.collision!.referenceWidth] as const))??[]);
  const objects=[...sceneryFootprints(scene.scenery,manifest),...anchors];
  return {ground,terrain,objects,barriers:[...terrain,...objects]};
}
