import data from './data/world-scenes.json';
import {parseWorldSceneDocument, type WorldScene} from './scene-schema';
import version from './data/world-scene-version.json';
import {applyEditOps,type WorldEditOp} from './world-edit-ops';

export let sceneDocument = parseWorldSceneDocument(data);
export let sceneContentVersion = version.contentVersion;

/** Load the published world before creating scenes or resolving map placements. */
export async function loadPublishedWorld(): Promise<void> {
  const response = await fetch('/api/world-content', {cache:'no-store',signal:AbortSignal.timeout(12000)});
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
 * Apply an admin edit streamed by the server. Returns the towns that changed,
 * or undefined when this client missed an earlier edit and must reload.
 */
export function applyWorldPatch(from: string, to: string, ops: readonly WorldEditOp[]): Set<string> | undefined {
  if (from !== sceneContentVersion) return to === sceneContentVersion ? new Set() : undefined;
  try {
    const result = applyEditOps(sceneDocument, ops);
    sceneDocument = result.document;
    sceneContentVersion = to;
    return new Set(result.changed.keys());
  } catch { return undefined; }
}
