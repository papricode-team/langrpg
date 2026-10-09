import { describe, expect, it } from 'vitest';
import { maps } from './maps';
import { createMapNavigation, NavigationGrid } from './navigation';
import { compileResident, createWorldResidents, sampleResidentMotion, worldResidentSpecs } from './world-life';

describe('painted town resident routes', () => {
  for (const map of maps) {
    it(`keeps all ${map.name} resident loops on connected painted roads`, () => {
      const navigation = createMapNavigation(map.id);
      const residents = createWorldResidents(map.id, navigation);
      expect(residents).toHaveLength(3);
      for (const resident of residents) {
        expect(resident.cycleSeconds).toBeGreaterThan(10);
        expect(resident.segments.some(segment => !segment.moving)).toBe(true);
        let previous = resident.segments[0].from;
        for (const segment of resident.segments) {
          expect(segment.from).toEqual(previous);
          const samples = Math.max(1, Math.ceil(Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y) / 2));
          for (let index = 0; index <= samples; index++) {
            const fraction = index / samples;
            const x = segment.from.x + (segment.to.x - segment.from.x) * fraction;
            const y = segment.from.y + (segment.to.y - segment.from.y) * fraction;
            if (!navigation.isWalkable(x, y)) throw new Error(`${resident.id} leaves a road at ${x}, ${y}`);
          }
          previous = segment.to;
        }
        expect(previous).toEqual(resident.segments[0].from);
      }
    });
  }

  it('holds residents still at stops and closes the loop without teleporting', () => {
    const resident = createWorldResidents('lindenhafen')[0];
    const pause = resident.segments.find(segment => !segment.moving)!;
    resident.phaseSeconds = 0;
    const first = sampleResidentMotion(resident, pause.startSeconds + pause.durationSeconds / 3);
    const second = sampleResidentMotion(resident, pause.startSeconds + pause.durationSeconds * 2 / 3);
    expect(first).toEqual(second);
    expect(first.moving).toBe(false);
    expect(first.velocityX).toBe(0);
    expect(first.velocityY).toBe(0);
    const atEnd = sampleResidentMotion(resident, resident.cycleSeconds - .001);
    const atStart = sampleResidentMotion(resident, resident.cycleSeconds + .001);
    expect(Math.hypot(atEnd.x - atStart.x, atEnd.y - atStart.y)).toBeLessThan(.2);
  });

  it('refuses disconnected routes rather than walking through blocked space', () => {
    const navigation = new NavigationGrid([[[40,40],[150,40],[150,150],[40,150]],[[300,300],[450,300],[450,450],[300,450]]]);
    const spec = { ...worldResidentSpecs.lindenhafen[0], stops: [{ x: 100/1536, y: 100/1024, pauseSeconds: 2 }, { x: 350/1536, y: 350/1024, pauseSeconds: 2 }] };
    expect(compileResident(spec, navigation)).toBeUndefined();
  });
});
