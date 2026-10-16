import {animalSpecies, type AnimalSpawn} from './animal-types';
import {NavigationGrid, PLAYER_RADIUS} from './navigation';
import {sceneNavigationGeometry} from './scene-navigation';
import type {WorldScene} from './scene-schema';

const legacyHomes: Record<string, readonly {x: number; y: number}[]> = {
  lindenhafen: [{x: .39, y: .65}, {x: .57, y: .61}, {x: .46, y: .60}, {x: .34, y: .85}],
  waldruh: [{x: .42, y: .80}, {x: .35, y: .44}, {x: .24, y: .37}, {x: .57, y: .75}],
  nebelstadt: [{x: .31, y: .71}, {x: .57, y: .48}, {x: .37, y: .39}, {x: .26, y: .76}],
};
const defaults = new WeakMap<WorldScene, AnimalSpawn[]>();
/** Older published maps retain their animals. An explicit empty list means the admin removed them all. */
export function animalSpawns(scene: WorldScene, navigation?: NavigationGrid): readonly AnimalSpawn[] {
  if (scene.animals) return scene.animals;
  const cached = defaults.get(scene);
  if (cached) return cached;
  const homes = legacyHomes[scene.id];
  if (!homes) return [];
  if (!navigation) {
    const geometry = sceneNavigationGeometry(scene);
    navigation = new NavigationGrid(geometry.ground, geometry.barriers, scene, {agentRadius: PLAYER_RADIUS});
  }
  const offset = scene.legacyOffset ?? {x: 0, y: 0};
  const animals = animalSpecies.flatMap((species, index) => Array.from({length: 3}, (_, variant) => ({
    id: `${scene.id}-animal-${species}-${variant + 1}`, species, variant,
    ...navigation!.closestPoint(homes[index].x * 1536 + offset.x + (variant - 1) * 44,
      homes[index].y * 1024 + offset.y + variant % 2 * 32, scene.spawn),
  })));
  defaults.set(scene, animals);
  return animals;
}
export function nextAnimalId(scene: WorldScene, species: string): string {
  const used = new Set([...animalSpawns(scene), ...scene.scenery, ...scene.npcs, ...scene.objects, ...(scene.residents ?? [])].map(item => item.id));
  let n = 1;
  while (used.has(`${scene.id}-animal-${species}-${n}`)) n++;
  return `${scene.id}-animal-${species}-${n}`;
}
