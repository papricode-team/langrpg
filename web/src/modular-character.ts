import type { AvatarParts } from './avatar-options';
import { normalizeAvatar, resolveRecipe } from './character-recipe.mjs';
import { paintAvatar } from './avatar-baker';

/** Legacy input is accepted at load boundaries; new saves use AvatarRecipe. */
export type ModularAvatar = { hair: string; skin: string; outfit?: string; v?: 2; parts?: Record<string, string | null>; colors?: Record<string, string> } & Partial<AvatarParts>;
export interface PieceLayer { id: string; material: string; key: string; frame: number; tint: number; width: number; }
export function characterLayers(avatar: ModularAvatar, frame = 0): PieceLayer[] {
  if (!Number.isInteger(frame) || frame < 0 || frame >= 36) throw new Error('Frame must be in 0..35');
  const facing = (['down', 'right', 'up', 'left'] as const)[Math.floor(frame / 9)];
  return resolveRecipe(normalizeAvatar(avatar), facing).layers.flatMap(part => part.materials.map(material => ({ id: part.id, material, key: part.sheets[material].editor, frame, tint: part.tints[material], width: 1 })));
}
export function paintCharacter(canvas: HTMLCanvasElement, avatar: ModularAvatar, frame = 0): Promise<void> {
  return paintAvatar(canvas, normalizeAvatar(avatar), frame);
}
