import { describe, expect, it } from 'vitest';
import { buildingDoorGeometry } from './building-door';
import { sceneDocument } from './scene-data';
import { sceneEntrancePoint } from './scene-schema';

describe('building door placement', () => {
  it('provides a door and building hover target for every room in every town', () => {
    for (const scene of Object.values(sceneDocument.maps)) for (const owner of scene.scenery.filter(item => item.interior)) {
      const door = buildingDoorGeometry(scene, owner)!;
      expect(door.width).toBeGreaterThan(0);
      expect(door.height).toBeGreaterThan(door.width);
      expect(door.hit.width).toBeGreaterThan(door.width);
      expect(door.hit.height).toBeGreaterThan(door.height);
      expect(door.depth).toBeGreaterThanOrEqual(sceneEntrancePoint(scene, owner).y);
    }
  });
  it('follows moves, scale changes, and mirrored doors without manual offsets', () => {
    const scene = sceneDocument.maps.lindenhafen, owner = scene.scenery.find(item => item.interior?.kind === 'supermarket')!;
    const original = buildingDoorGeometry(scene, owner)!;
    const moved = buildingDoorGeometry(scene, {...owner, x: owner.x + 100, y: owner.y + 60})!;
    expect(moved.hit).toEqual(original.hit);
    expect(moved.depth).toBeCloseTo(original.depth + 60);
    const enlarged = buildingDoorGeometry(scene, {...owner, width: owner.width * 2})!;
    expect(enlarged.width).toBeCloseTo(original.width * 2);
    expect(enlarged.height).toBeCloseTo(original.height * 2);
    expect(enlarged.hit.x).toBeCloseTo(original.hit.x * 2);
    expect(enlarged.hit.y).toBeCloseTo(original.hit.y * 2);
    const mirrored = buildingDoorGeometry(scene, {...owner, flipX: !owner.flipX})!;
    expect(mirrored.width).toBe(original.width);
    expect(mirrored.hit.x).toBeCloseTo(-original.hit.x);
    expect(mirrored.hit.y).toBeCloseTo(original.hit.y);
  });
  it('does not advertise buildings without an interior', () => {
    const scene = sceneDocument.maps.lindenhafen, owner = scene.scenery.find(item => item.interior)!;
    expect(buildingDoorGeometry(scene, {...owner, interior: undefined})).toBeUndefined();
  });
});
