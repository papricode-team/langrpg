import { catalogueForPose, characterCatalogue, recipeErrors } from './character-recipe.mjs';
import type { AvatarRecipe, CharacterCatalogue } from './character-recipe.mjs';

/** A pose is available only when every equipped piece has matching action art. */
export function availableCharacterPoses(recipe: AvatarRecipe, catalogue: CharacterCatalogue = characterCatalogue): string[] {
  return Object.keys(catalogue.poseSets ?? {}).filter(id => recipeErrors(recipe, catalogueForPose(id, catalogue)).length === 0);
}

export interface PoseClock { readonly elapsedMs: number; readonly lastTimeMs: number | null; }
export function advancePoseClock(clock: PoseClock, timestampMs: number, durations: readonly number[], active = true): PoseClock {
  const total = poseDuration(durations);
  const elapsedMs = Number.isFinite(clock.elapsedMs) ? Math.max(0, clock.elapsedMs) % total : 0;
  if (!active || !Number.isFinite(timestampMs)) return { elapsedMs, lastTimeMs: null };
  const delta = clock.lastTimeMs === null ? 0 : timestampMs - clock.lastTimeMs;
  return { elapsedMs: (elapsedMs + (delta >= 0 && delta <= 100 ? delta : 0)) % total, lastTimeMs: timestampMs };
}

export function poseColumn(elapsedMs: number, durations: readonly number[]): number {
  const total = poseDuration(durations);
  let remaining = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) % total : 0;
  for (let column = 0; column < durations.length; column++) {
    if (remaining < durations[column]) return column;
    remaining -= durations[column];
  }
  return 0;
}

function poseDuration(durations: readonly number[]): number {
  if (durations.length !== 9 || durations.some(ms => !Number.isFinite(ms) || ms <= 0)) throw new Error('A character pose needs nine positive frame durations');
  return durations.reduce((total, ms) => total + ms, 0);
}
