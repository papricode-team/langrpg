import {describe, expect, it} from 'vitest';
import {plainGround} from './ground';
import {parseWorldSceneDocument, type WorldSceneDocument} from './scene-schema';
import {animalSpawns} from './animal-spawns';
import {applyEditOps, editOpTargets, inverseEditOps, parseEditOps, type WorldEditOp} from './world-edit-ops';
import {placementProblems, SceneReach} from './world-edit-rules';
import {NavigationGrid} from './navigation';

const dog = {id: 'pet-dog', species: 'dog' as const, variant: 2, x: 80, y: 80};
const document = (): WorldSceneDocument => ({version: 4, maps: {yard: {id: 'yard', width: 320, height: 240, coordinateVersion: 1,
  spawn: {x: 40, y: 40}, scenery: [], npcs: [], objects: [], districts: [], ground: plainGround('meadow', 320, 240), animals: []}}});
const apply = (doc: WorldSceneDocument, ops: WorldEditOp[]) => parseWorldSceneDocument(applyEditOps(doc, parseEditOps(ops)).document);

describe('saved animal homes', () => {
  it('round-trips placement, movement and species/variant changes through the published document', () => {
    const original = document();
    let saved = apply(original, [{kind: 'placeAnimal', map: 'yard', item: dog}]);
    saved = apply(saved, [{kind: 'updateAnimal', map: 'yard', id: dog.id, x: 150, y: 90, species: 'cat', variant: 1}]);
    const reload = parseWorldSceneDocument(JSON.parse(JSON.stringify(saved)));
    expect(animalSpawns(reload.maps.yard)).toEqual([{...dog, species: 'cat', variant: 1, x: 150, y: 90}]);
    expect(original.maps.yard.animals).toEqual([]);
  });
  it('undoes and redoes placements, moves, appearance changes and removals', () => {
    let saved = document();
    const ops: WorldEditOp[] = [{kind: 'placeAnimal', map: 'yard', item: dog},
      {kind: 'updateAnimal', map: 'yard', id: dog.id, x: 120, species: 'sheep', variant: 0},
      {kind: 'removeAnimal', map: 'yard', id: dog.id}];
    for (const op of ops) {
      const before = saved, undo = inverseEditOps(saved, op);
      saved = apply(saved, [op]);
      expect(apply(saved, undo)).toEqual(before);
      expect(apply(apply(saved, undo), [op])).toEqual(saved);
      expect(editOpTargets(op)).toEqual([dog.id]);
    }
    expect(animalSpawns(saved.maps.yard)).toEqual([]);
  });
  it('rejects invalid species, variants, duplicate IDs, too many animals and out-of-map homes', () => {
    for (const change of [{species: 'dragon'}, {variant: -1}, {variant: 3}, {x: NaN}])
      expect(() => parseEditOps([{kind: 'placeAnimal', map: 'yard', item: {...dog, ...change}}])).toThrow();
    const saved = apply(document(), [{kind: 'placeAnimal', map: 'yard', item: dog}]);
    expect(() => apply(saved, [{kind: 'placeAnimal', map: 'yard', item: dog}])).toThrow('already');
    expect(() => apply(saved, [{kind: 'updateAnimal', map: 'yard', id: dog.id, x: 400}])).toThrow('outside');
    const many = document(); many.maps.yard.animals = Array.from({length: 101}, (_, i) => ({...dog, id: `pet-${i}`}));
    expect(() => parseWorldSceneDocument(many)).toThrow('100 animals');
    const collision = document(); collision.maps.yard.animals = [dog]; collision.maps.yard.npcs = [{id: dog.id, x: 50, y: 50}];
    expect(() => parseWorldSceneDocument(collision)).toThrow('already in use');
  });
  it('refuses homes across an impassable wall and accepts reachable homes', () => {
    const before = document().maps.yard, ground = [[[0, 0], [320, 0], [320, 240], [0, 240]]] as const;
    const barriers = [[[120, 0], [160, 0], [160, 240], [120, 240]]] as const;
    const grid = new NavigationGrid(ground, barriers, before);
    const after = {...before, animals: [{...dog, x: 200}]};
    const reach = {before: SceneReach.from(before, grid), after: SceneReach.from(after, grid)};
    expect(placementProblems(before, after, new Set([dog.id]), reach)).toContainEqual(expect.objectContaining({code: 'invalid', severity: 'error'}));
    const valid = {...before, animals: [dog]};
    expect(placementProblems(before, valid, new Set([dog.id]), {...reach, after: SceneReach.from(valid, grid)})).toEqual([]);
  });
  it('materializes the previous default population on first edit and respects explicit removal', () => {
    const scene = {...document().maps.yard, id: 'lindenhafen', width: 1536, height: 1024, ground: plainGround('meadow', 1536, 1024), animals: undefined};
    const homes = animalSpawns(scene);
    expect(homes).toHaveLength(12);
    const saved = apply({version: 4, maps: {lindenhafen: scene}}, [{kind: 'updateAnimal', map: 'lindenhafen', id: homes[0].id, x: 500}]);
    expect(saved.maps.lindenhafen.animals).toHaveLength(12);
    const empty = apply(saved, homes.map(item => ({kind: 'removeAnimal', map: 'lindenhafen', id: item.id})));
    expect(animalSpawns(parseWorldSceneDocument(JSON.parse(JSON.stringify(empty))).maps.lindenhafen)).toEqual([]);
  });
});
