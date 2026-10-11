import data from './data/world-scenes.json';
import {parseWorldSceneDocument, type WorldScene} from './scene-schema';

export const sceneDocument = parseWorldSceneDocument(data);
export function getWorldScene(id: string): WorldScene {
  const scene = sceneDocument.maps[id];
  if (!scene) throw new Error(`Unknown world scene ${id}`);
  return scene;
}
