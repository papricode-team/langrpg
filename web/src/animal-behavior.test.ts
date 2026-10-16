import { describe, expect, it } from 'vitest';
import { advanceAnimal, animalSpeciesFromId, createAnimal, interactWithAnimal, type AnimalGround } from './animal-behavior';
const open: AnimalGround = {
  move: (from, delta) => ({ x: from.x + delta.x, y: from.y + delta.y }),
  closestPoint: (x, y) => ({ x, y }), findPath: (_from, to) => [to],
};
const player = { x: 0, y: 0 };
function tick(animal: ReturnType<typeof createAnimal>, seconds: number, ground = open, near?: typeof player, night = false) {
  for (let i = 0; i < seconds * 60; i++) advanceAnimal(animal, 1 / 60, ground, near, night, () => .7);
}
describe('animal interactions', () => {
  it('feeds chickens and lets the feeding finish before another interaction', () => {
    const hen = createAnimal('chicken', { x: 40, y: 0 });
    expect(interactWithAnimal(hen, player)).toBe(true);
    expect(hen.state).toBe('feed');
    expect(interactWithAnimal(hen, player)).toBe(false);
    tick(hen, 4, open, player);
    expect(hen.state).toBe('idle');
    expect(hen.x).toBe(40);
    tick(hen, 2.1, open, player);
    expect(interactWithAnimal(hen, player)).toBe(true);
  });
  it.each(['dog', 'sheep'] as const)('always accepts affection for a %s', species => {
    const animal = createAnimal(species, { x: 40, y: 0 });
    interactWithAnimal(animal, player, () => 0);
    expect(animal.state).toBe('happy');
    expect(animal.facing).toBe(-1);
  });
  it('lets cats accept affection or ask for space, then retreat away from the player', () => {
    const cat = createAnimal('cat', { x: 40, y: 0 });
    interactWithAnimal(cat, player, () => .5);
    expect(cat.state).toBe('happy');
    tick(cat, 6.1, open, player);
    interactWithAnimal(cat, player, () => .1);
    expect(cat.state).toBe('annoyed');
    tick(cat, 2, open, player);
    expect(cat.state).toBe('walk');
    expect(cat.x).toBeGreaterThan(70);
    expect(cat.facing).toBe(1);
    expect(interactWithAnimal(cat, player)).toBe(false);
    tick(cat, 1, open, player);
    expect(cat.state).toBe('idle');
    expect(cat.retreat).toBeUndefined();
  });
  it('cannot retreat through obstacles or produce NaN at the player position', () => {
    const cat = createAnimal('cat', player);
    interactWithAnimal(cat, player, () => 0);
    tick(cat, 2, { ...open, move: from => ({ x: from.x, y: from.y }) }, player);
    expect(cat.x).toBe(0); expect(cat.y).toBe(0); expect(cat.state).toBe('idle');
  });
  it('requires arm’s reach for petting but allows grain to be scattered farther away', () => {
    const dog = createAnimal('dog', { x: 65, y: 0 });
    const hen = createAnimal('chicken', { x: 65, y: 0 });
    expect(interactWithAnimal(dog, player)).toBe(false);
    expect(interactWithAnimal(hen, player)).toBe(true);
  });
  it('rejects distant interactions and does not interrupt a reaction at night', () => {
    const sheep = createAnimal('sheep', { x: 141, y: 0 });
    expect(interactWithAnimal(sheep, player)).toBe(false);
    sheep.x = 40; interactWithAnimal(sheep, player);
    tick(sheep, 1, open, player, true);
    expect(sheep.state).toBe('happy');
    tick(sheep, 2, open, player, true);
    expect(sheep.state).toBe('rest');
  });
  it('stops wandering when approached and uses swept ground movement', () => {
    const dog = createAnimal('dog', { x: 40, y: 0 });
    dog.state = 'walk'; dog.destination = { x: 80, y: 0 }; dog.remaining = 4;
    tick(dog, .5, open, player);
    expect(dog.x).toBe(40); expect(dog.state).toBe('idle');
    dog.state = 'walk'; dog.destination = { x: 80, y: 0 }; dog.remaining = 4;
    tick(dog, .5, { ...open, move: from => ({ x: from.x, y: from.y }) });
    expect(dog.x).toBe(40); expect(dog.state).not.toBe('walk');
  });
  it('resolves only valid animal interaction IDs for the touch action button', () => {
    expect(animalSpeciesFromId('animal:cat:lindenhafen:0')).toBe('cat');
    expect(animalSpeciesFromId('object:cat')).toBeUndefined();
    expect(animalSpeciesFromId('animal:dragon')).toBeUndefined();
  });
});
