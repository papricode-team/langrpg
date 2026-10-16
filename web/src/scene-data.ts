import {parseWorldSceneDocument, type WorldScene, type WorldSceneDocument} from './scene-schema';

/** Empty until loadPublishedWorld runs: the server owns the world. */
export let sceneDocument: WorldSceneDocument = {version: 4, maps: {}};
export let sceneContentVersion = '';

/** Load the published world before creating scenes or resolving map placements. */
export async function loadPublishedWorld(fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher('/api/world-content', {cache:'no-cache',signal:AbortSignal.timeout(12000)});
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

// Vitest and Node tooling run without a server; they use the seed world, which also holds the default
// positions of story anchors. `import.meta.env` is undefined under plain Node, and a production build folds
// this condition to false, dropping the seed import entirely.
if (!import.meta.env || import.meta.env.MODE === 'test') {
  const seed = await import('./test-support/world-seed');
  replacePublishedWorld(seed.seedWorld(), seed.seedContentVersion);
}
