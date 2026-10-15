import data from './data/world-scenes.json';
import {parseWorldSceneDocument, type WorldScene, type WorldSceneDocument} from './scene-schema';
import version from './data/world-scene-version.json';

export let sceneDocument = parseWorldSceneDocument(data);
export let sceneContentVersion = version.contentVersion;

/** Load the published world before creating scenes or resolving map placements. */
export async function loadPublishedWorld(fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher('/api/world-content', {cache:'no-cache',signal:AbortSignal.timeout(12000)});
  // Older deployments still use the world bundled with the client.
  if(response.status===404)return;
  if(!response.ok)throw new Error('The saved world could not be loaded. Please reload to try again.');
  const result=await response.json() as {document?:unknown;contentVersion?:unknown};
  if(typeof result.contentVersion!=='string'||!result.contentVersion)throw new Error('The saved world has an invalid version.');
  const next=parseWorldSceneDocument(result.document);
  sceneDocument=next;sceneContentVersion=result.contentVersion;
}
export function getWorldScene(id: string): WorldScene {
  const scene = sceneDocument.maps[id];
  if (!scene) throw new Error(`Unknown world scene ${id}`);
  return scene;
}

/**
 * Replace the published world with an edited document. Gameplay modules read the world from here; the edit
 * pipeline that produces new documents lives in world-patch.ts so this module never imports editor code.
 */
export function replacePublishedWorld(document: WorldSceneDocument, contentVersion: string): void {
  sceneDocument = document;
  sceneContentVersion = contentVersion;
}
