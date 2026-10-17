import type { AnimalBody, AnimalSpecies } from './animal-behavior';

/** Native painted sheets are exported with a common foot anchor, never redrawn in the browser. */
export const ANIMAL_FRAME = { width: 128, height: 128, footX: 64, footY: 110 };
export const animalTextureKey = (species: AnimalSpecies, mapId: string): string => `${mapId}-animals-${species}`;
export const animalWorldScale: Record<AnimalSpecies, number> = { chicken: .32, cat: .43, dog: .55, sheep: .55 };
export {animalVariants} from './animal-types';
export function animalArtFrame(animal: AnimalBody, variant: number, reducedMotion: boolean): string {
  const state = animal.state === 'feed' ? 'forage' : animal.state;
  const count = state === 'idle' || state === 'rest' ? 2 : 4;
  const phase = state === 'walk' ? animal.stride / 36 : animal.stateTime / (state === 'rest' ? 4 : state === 'idle' ? 3 : state === 'forage' ? .9 : 1.2);
  const frame = reducedMotion ? (state === 'forage' ? 1 : 0) : Math.floor(phase * count) % count;
  const direction = state === 'walk' && animal.facingBack ? '-back' : '';
  return `${variant}-${state}${direction}-${frame}`;
}
