import {replacePublishedWorld, sceneContentVersion, sceneDocument} from './scene-data';
import {applyEditOps, type WorldEditOp} from './world-edit-ops';

/**
 * Apply an admin edit streamed by the server. Returns the towns that changed,
 * or undefined when this client missed an earlier edit and must reload.
 */
export function applyWorldPatch(from: string, to: string, ops: readonly WorldEditOp[]): Set<string> | undefined {
  if (from !== sceneContentVersion) return to === sceneContentVersion ? new Set() : undefined;
  try {
    const result = applyEditOps(sceneDocument, ops);
    replacePublishedWorld(result.document, to);
    return new Set(result.changed.keys());
  } catch { return undefined; }
}
