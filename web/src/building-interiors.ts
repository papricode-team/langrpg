import type {InteriorObjectSpec, InteriorPropSpec, InteriorSpec} from './interiors';
import type {RoomKind} from './room-kind';

const position = (x: number, y: number) => ({x: x / 1536, y: y / 1024});
const fixture = (id: string, asset: string, x: number, y: number, width: number): InteriorPropSpec => ({
  id, asset, sheet: 'interior-decor', x, y, width,
  collision: {offsetX: -width * .35, offsetY: -30, width: width * .7, height: 32},
});

/** A station group places the furniture, its solid feet and its game together. */
export function gameStation(kind: RoomKind, game: string, asset: string, x: number, y: number, width: number) {
  const id = `interior:${kind}:${game}`;
  const object: InteriorObjectSpec = {
    id, label: game.replaceAll('-', ' '), germanName: '', sessionTitle: '', prompt: '', description: '',
    ...position(x, y + 75), minigame: game, gameOnly: true, exerciseIds: [], vocabulary: [],
  };
  return {object, prop: {...fixture(`${kind}-${game}`, asset, x, y, width), interactive: id}};
}

const recipes = [
  {id: 'library', name: 'Reading room', icon: 'cup', games: [['honest-mirror', 'bookshelf'], ['re-ink', 'prep-bench'], ['lantern-pairs', 'menu-board']]},
  {id: 'workshop', name: 'Workshop', icon: 'leaf', games: [['scrambled-sign', 'prep-bench'], ['workbench', 'prep-bench'], ['letter-loom', 'menu-board']]},
  {id: 'station', name: 'Station waiting room', icon: 'basket', games: [['night-train', 'menu-board'], ['departure-board', 'menu-board'], ['sorting-office', 'pantry']]},
  {id: 'greenhouse', name: 'Greenhouse', icon: 'leaf', games: [['falling-leaves', 'plant'], ['seed-packets', 'prep-bench'], ['market-baskets', 'produce']]},
  {id: 'home', name: 'Neighbour’s sitting room', icon: 'cup', games: [['lantern-pairs', 'cafe-table'], ['echo-bells', 'menu-board'], ['re-ink', 'prep-bench']]},
] as const;

/** Existing games fetch their learning content through the authenticated game flow. */
export const buildingInteriors: readonly InteriorSpec[] = recipes.map(recipe => {
  const stations = recipe.games.map(([game, asset], index) => gameStation(recipe.id, game, asset, 360 + index * 400, index === 1 ? 580 : 470, asset === 'menu-board' ? 65 : 140));
  return {
    id: recipe.id, name: recipe.name, germanName: '', subtitle: '', description: '', icon: recipe.icon,
    asset: '/assets/interior-cafe-room.webp', width: 1536, height: 1024,
    spawn: position(768, 790), exit: position(768, 850),
    floorAreas: [[[160, 300], [1376, 300], [1376, 880], [160, 880]]],
    npcs: [], objects: stations.map(station => station.object),
    props: [...stations.map(station => station.prop), fixture(`${recipe.id}-seat`, 'banquette', 360, 730, 155),
      fixture(`${recipe.id}-plant`, 'plant', 1280, 770, 65), fixture(`${recipe.id}-shelf`, 'bookshelf', 1240, 340, 95), fixture(`${recipe.id}-corner-plant`, 'plant', 240, 365, 75)],
  };
});
