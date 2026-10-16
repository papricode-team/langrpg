import { t } from './i18n';
import type { MapPoint } from './navigation';

export const animalSpecies = ['chicken', 'dog', 'cat', 'sheep'] as const;
export type AnimalSpecies = typeof animalSpecies[number];
export const animalStates = ['idle', 'walk', 'rest', 'forage', 'feed', 'happy', 'annoyed'] as const;
export type AnimalState = typeof animalStates[number];
export interface AnimalBody extends MapPoint {
  species: AnimalSpecies;
  state: AnimalState;
  stateTime: number;
  remaining: number;
  cooldown: number;
  facing: number;
  facingBack: boolean;
  stride: number;
  home: MapPoint;
  destination?: MapPoint;
  retreat?: MapPoint;
}
/** The small surface used by the simulation also makes collision behavior testable without Phaser. */
export interface AnimalGround {
  move(from: MapPoint, delta: MapPoint): MapPoint;
  closestPoint(x: number, y: number, from?: MapPoint): MapPoint;
  findPath(from: MapPoint, to: MapPoint): MapPoint[];
}
export const animalAction = (species: AnimalSpecies): string => species === 'chicken' ? t('Feed chicken') : species === 'dog' ? t('Pet dog') : species === 'cat' ? t('Pet cat') : t('Pet sheep');
export function animalSpeciesFromId(id?: string): AnimalSpecies | undefined {
  const [prefix, species] = (id ?? '').split(':');
  return prefix === 'animal' && animalSpecies.includes(species as AnimalSpecies) ? species as AnimalSpecies : undefined;
}
export function createAnimal(species: AnimalSpecies, point: MapPoint, phase = 0): AnimalBody {
  return { ...point, home: { ...point }, species, state: 'idle', stateTime: phase, remaining: 2 + phase, cooldown: 0, facing: 1, facingBack: false, stride: 0 };
}
function enter(animal: AnimalBody, state: AnimalState, duration: number): void {
  animal.state = state; animal.stateTime = 0; animal.remaining = duration;
  animal.destination = undefined;
}
export const animalReach = (species: AnimalSpecies): number => species === 'chicken' ? 80 : 48;

/** No inventory currency or quest reward: feeding and affection are free world interactions. */
export function interactWithAnimal(animal: AnimalBody, player: MapPoint, random = Math.random): boolean {
  if (animal.cooldown > 0 || Math.hypot(animal.x - player.x, animal.y - player.y) > animalReach(animal.species)) return false;
  animal.facing = player.x < animal.x ? -1 : 1;
  animal.retreat = undefined;
  if (animal.species === 'chicken') enter(animal, 'feed', 3.8);
  else if (animal.species === 'cat' && random() < .3) {
    enter(animal, 'annoyed', 1.2);
    const dx = animal.x - player.x, dy = animal.y - player.y, length = Math.hypot(dx, dy);
    animal.retreat = length > .01 ? { x: dx / length, y: dy / length } : { x: -animal.facing, y: 0 };
  } else enter(animal, 'happy', 2.8);
  animal.cooldown = animal.state === 'annoyed' ? 9 : 6;
  return true;
}
export function advanceAnimal(animal: AnimalBody, seconds: number, ground: AnimalGround, player: MapPoint | undefined, night: boolean, random = Math.random): void {
  const dt = Math.min(.1, Math.max(0, seconds));
  animal.cooldown = Math.max(0, animal.cooldown - dt);
  animal.stateTime += dt; animal.remaining -= dt;
  if (animal.state === 'walk') {
    // A selected animal waits as the player approaches; an unhappy cat keeps its space.
    if (!animal.retreat && player && Math.hypot(animal.x - player.x, animal.y - player.y) < 170) {
      enter(animal, 'idle', 2);
      return;
    }
    const target = animal.destination;
    const dx = animal.retreat?.x ?? (target ? target.x - animal.x : 0);
    const dy = animal.retreat?.y ?? (target ? target.y - animal.y : 0);
    const distance = Math.hypot(dx, dy);
    const step = Math.min(distance, (animal.species === 'chicken' ? 22 : animal.species === 'sheep' ? 25 : 36) * dt);
    const amount = animal.retreat ? 64 * dt : step;
    const next = distance > .01 ? ground.move(animal, { x: dx / distance * amount, y: dy / distance * amount }) : animal;
    const moved = Math.hypot(next.x - animal.x, next.y - animal.y);
    if (Math.abs(next.x - animal.x) > .001) animal.facing = next.x < animal.x ? -1 : 1;
    if (Math.abs(next.y - animal.y) > .001) animal.facingBack = next.y < animal.y;
    animal.stride += moved;
    animal.x = next.x; animal.y = next.y;
    if (moved < .001 || (!animal.retreat && distance < 2)) animal.remaining = 0;
  }
  if (animal.remaining > 0) return;
  if (animal.state === 'annoyed' && animal.retreat) { enter(animal, 'walk', 1.4); return; }
  animal.retreat = undefined;
  if (night) { enter(animal, 'rest', 5 + random() * 4); return; }
  if (player && Math.hypot(animal.x - player.x, animal.y - player.y) < 170) { enter(animal, 'idle', 2); return; }
  const choice = random();
  if (choice < .45) {
    const angle = random() * Math.PI * 2, radius = 25 + random() * 55;
    const target = ground.closestPoint(animal.home.x + Math.cos(angle) * radius, animal.home.y + Math.sin(angle) * radius, animal);
    const path = ground.findPath(animal, target);
    // Wander only along a short, clear segment; never cut across scenery or leave the home area.
    const waypoint = path.find(point => Math.hypot(point.x - animal.x, point.y - animal.y) > 3);
    if (waypoint && Math.hypot(waypoint.x - animal.home.x, waypoint.y - animal.home.y) < 110) {
      enter(animal, 'walk', 4); animal.destination = waypoint; return;
    }
  }
  enter(animal, choice > .85 ? 'rest' : choice > .45 ? 'forage' : 'idle', 3 + random() * 4);
}
