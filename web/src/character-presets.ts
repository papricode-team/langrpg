import presets from './data/character-presets.json';
import { normalizeAvatar, characterCatalogue, resolveRecipe } from './character-recipe.mjs';
import type { AvatarRecipe } from './character-recipe.mjs';
import { avatarColors } from './avatar-options';

export const characterPresets = presets.map(preset => ({ name: preset.name, recipe: normalizeAvatar(preset.recipe) }));
export function randomAvatar(random = Math.random): AvatarRecipe {
  const pick = <T>(values: T[]): T => values[Math.min(values.length - 1, Math.floor(random() * values.length))];
  const recipe = normalizeAvatar({});
  recipe.build = pick(characterCatalogue.builds);
  for (const slot of characterCatalogue.slots) {
    if (slot.id === 'body') continue;
    const choices: (string | null)[] = characterCatalogue.components.filter(part => part.build === recipe.build && part.slot === slot.id).map(part => part.optionId);
    if (slot.optional) choices.push(null);
    recipe.parts[slot.id] = choices.length ? pick(choices) : null;
  }
  recipe.skin = pick(avatarColors.skin)[1]; recipe.hair = pick(avatarColors.hair)[1];
  for (const key of characterCatalogue.colorKeys) recipe.colors[key] = pick(avatarColors.outfit)[1];
  const result = normalizeAvatar(recipe);
  for (const slot of Object.keys(resolveRecipe(result).disabled)) result.parts[slot] = null;
  return result;
}
