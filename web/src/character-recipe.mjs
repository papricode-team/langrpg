/** Shared, platform-independent v2 recipes and composition rules. */
import compiled from '../../server/character-kit.json' with { type: 'json' };
import { resolveComponentRules } from './character-rules.mjs';
export const characterCatalogue = compiled;
/** Expressions replace only the matching face; recipe identity and clothing stay intact. */
export function catalogueForExpression(recipe, expression = 'neutral', catalogue = compiled) {
  if (expression === 'neutral') {
    if (catalogue.expression) throw new Error('Neutral expression requires the base catalogue');
    return catalogue;
  }
  if (catalogue.poseSet && catalogue.poseSet !== 'walk') throw new Error('Expressions require the walking grid');
  const face = catalogue.expressions?.[expression]?.components.find(part => part.build === recipe.build && part.optionId === recipe.parts?.face);
  if (!face) throw new Error(`Unavailable expression ${expression} for ${recipe.build}/${recipe.parts?.face}`);
  return {...catalogue, expression, components:catalogue.components.map(part => part.slot === 'face' && part.build === face.build && part.optionId === face.optionId ? face : part)};
}
export function availableFaceExpressions(recipe, catalogue = compiled) {
  return Object.keys(catalogue.expressions ?? {}).filter(id => catalogue.expressions[id].components.some(part => part.build === recipe.build && part.optionId === recipe.parts?.face));
}
/** Pose sheets share recipe identities, but never silently reuse walk pixels. */
export function catalogueForPose(poseSet = 'walk', catalogue = compiled) {
  if (poseSet === 'walk') return catalogue;
  const pose = catalogue.poseSets?.[poseSet];
  if (!pose?.components?.length) throw new Error(`Unavailable pose set ${poseSet}`);
  return { ...catalogue, poseSet, components: pose.components, builds: pose.builds };
}
const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const options = (catalogue, build, slot) => catalogue.components.filter(part => part.build === build && part.slot === slot);
const defaultColor = (catalogue, key) => catalogue.defaultColors?.[key] ?? '#ffffff';

/** Deterministic client migration; strict persistence validation is separate. */
export function normalizeAvatar(value, catalogue = compiled) {
  const input = object(value) ? value : {};
  const nested = object(input.parts) ? input.parts : {};
  const legacy = input.v !== 2;
  const old = { ...input, ...nested };
  // V1 rendered one build/outfit/face even when obsolete selectors named other
  // choices. Catalogue growth must not change the appearance of unmigrated saves.
  const requestedBuild = legacy ? 'regular' : input.build;
  const build = catalogue.builds.includes(requestedBuild) ? requestedBuild : catalogue.builds.includes('regular') ? 'regular' : catalogue.builds[0];
  if (!build) throw new Error('Catalogue has no approved mannequin');
  const requested = legacy ? { face: 'oval', hair: old.hairstyle === 'bald' ? null : 'waves', outer: 'travel', bottom: 'straight', footwear: 'boots' } : nested;
  const parts = {};
  for (const slot of catalogue.slots.filter(slot => slot.id !== 'body')) {
    const available = options(catalogue, build, slot.id), wanted = requested[slot.id];
    const selected = available.find(part => part.optionId === wanted);
    parts[slot.id] = selected?.optionId ?? (slot.optional ? null : (available.find(part => part.optionId === slot.defaultOption) ?? available[0])?.optionId ?? null);
  }
  // Occupancy removes saved conflicting choices as well as disabling their UI.
  for (const part of catalogue.components.filter(part => part.build === build && parts[part.slot] === part.optionId))
    for (const slot of part.occupies ?? []) if (slot !== part.slot && own(parts, slot)) parts[slot] = null;
  const colors = {};
  const requestedColors = legacy ? { 'outer.primary': input.outfit, 'bottom.primary': old.pants } : object(input.colors) ? input.colors : {};
  for (const key of catalogue.colorKeys) {
    const color = requestedColors[key] || catalogue.defaultColors?.[key];
    colors[key] = (hex(color) ? color : defaultColor(catalogue, key)).toLowerCase();
  }
  return { v: 2, build, skin: hex(input.skin) ? input.skin.toLowerCase() : defaultColor(catalogue, 'skin'), hair: hex(input.hair) ? input.hair.toLowerCase() : defaultColor(catalogue, 'hair'), parts, colors };
}

/** Unknown options and colour keys must never become persistable v2 recipes. */
export function recipeErrors(recipe, catalogue = compiled) {
  if (!object(recipe)) return ['Recipe must be an object'];
  const errors = [];
  if (recipe.v !== 2) errors.push('Recipe version must be 2');
  if (!catalogue.builds.includes(recipe.build)) errors.push('Unknown build');
  for (const key of Object.keys(recipe)) if (!['v', 'build', 'skin', 'hair', 'parts', 'colors'].includes(key)) errors.push(`Unknown recipe field ${key}`);
  if (!hex(recipe.skin) || !hex(recipe.hair)) errors.push('Skin and hair must be six-digit hex colours');
  if (!object(recipe.parts) || !object(recipe.colors)) return [...errors, 'Parts and colors must be objects'];
  for(const [slot,id] of Object.entries(catalogue.poseSets?.[catalogue.poseSet]?.requiredParts??{})) {
    if(recipe.parts[slot]!==id)errors.push(`Pose ${catalogue.poseSet} requires ${slot}.${id}`);
  }
  const slots = new Map(catalogue.slots.filter(slot => slot.id !== 'body').map(slot => [slot.id, slot]));
  for (const [slot, id] of Object.entries(recipe.parts)) {
    if (!slots.has(slot)) errors.push(`Unknown slot ${slot}`);
    else if (id !== null && (typeof id !== 'string' || !options(catalogue, recipe.build, slot).some(part => part.optionId === id))) errors.push(`Unknown option ${slot}.${id}`);
  }
  const equipped = catalogue.components.filter(part => part.build === recipe.build && recipe.parts[part.slot] === part.optionId);
  const occupied = new Set(equipped.flatMap(part => (part.occupies ?? []).filter(slot => slot !== part.slot)));
  for (const [slot, spec] of slots) {
    if (!own(recipe.parts, slot)) errors.push(`Missing slot ${slot}`);
    else if (recipe.parts[slot] === null && !spec.optional && !occupied.has(slot)) errors.push(`Missing required ${slot}`);
  }
  for (const [key, color] of Object.entries(recipe.colors)) {
    if (!catalogue.colorKeys.includes(key)) errors.push(`Unknown colour key ${key}`);
    if (!hex(color)) errors.push(`Invalid colour ${key}`);
  }
  return errors;
}

export function resolveRecipe(recipe, facing = 'down', catalogue = compiled) {
  const selected = catalogue.components.filter(part => part.build === recipe.build && (part.slot === 'body' || recipe.parts?.[part.slot] === part.optionId));
  const { visible, disabled, hidden, overlaps } = resolveComponentRules(selected, facing);
  const layers = visible.map(part => ({
    ...part, z: part.zOrder[facing] ?? part.zOrder.default,
    tints: Object.fromEntries(Object.entries(part.tints).map(([material, key]) => {
      const value = key === 'skin' ? recipe.skin : key === 'hair' ? recipe.hair : recipe.colors?.[key] ?? defaultColor(catalogue, key);
      return [material, key === null ? 0xffffff : Number.parseInt((hex(value) ? value : '#ffffff').slice(1), 16)];
    })),
  }));
  return { layers, disabled, hidden, overlaps };
}

export function avatarTextureKey(recipe, catalogue = compiled) {
  // Stable complete serialization avoids collision-based texture reuse.
  const normalized = normalizeAvatar(recipe, catalogue);
  const parts = Object.entries(normalized.parts).sort(([a], [b]) => a.localeCompare(b));
  const colors = Object.entries(normalized.colors).sort(([a], [b]) => a.localeCompare(b));
  return `avatar-v2:${catalogue.assetVersion}:${JSON.stringify([normalized.build, normalized.skin, normalized.hair, parts, colors])}${catalogue.poseSet && catalogue.poseSet !== 'walk' ? `:pose:${catalogue.poseSet}` : ''}${catalogue.expression ? `:expression:${catalogue.expression}` : ''}`;
}
