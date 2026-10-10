import type { MapId } from './maps';
import type { WorldPeriod } from './world-clock';
import { hasRegionPeople } from './world-map-assets';

interface WorldAmbient { terrain: number; scenery: number; people: number; light: number; }
const daylight: Readonly<WorldAmbient> = { terrain: 0xffffff, scenery: 0xffffff, people: 0xffffff, light: 0xffffff };
const moonlight: Readonly<WorldAmbient> = { terrain: 0x596b86, scenery: 0x8899b6, people: 0xdce3f3, light: 0xffedd0 };
/** Expedition periods reuse their painted pages with steady ambient lighting. */
export function worldAmbient(mapId: MapId, period: WorldPeriod): Readonly<WorldAmbient> {
  return hasRegionPeople(mapId) && period === 'night' ? moonlight : daylight;
}

const mix = (a: number, b: number, ratio: number) => [16, 8, 0].reduce((result, shift) =>
  result | Math.round((a >> shift & 255) * (1 - ratio) + (b >> shift & 255) * ratio) << shift, 0);
/** Continuous dawn, golden hour and blue hour, on top of authored night art. */
export function timeAmbient(mapId: MapId, hour: number, period: WorldPeriod): Readonly<WorldAmbient> {
  const h = ((hour % 24) + 24) % 24;
  const anchors = [[0, 0x8497ba], [5, 0x8497ba], [7, 0xffe5c3], [9, 0xffffff],
    [16, 0xffffff], [18, 0xffd0a2], [20, 0x8296b9], [24, 0x8497ba]];
  const index = anchors.findIndex((point, i) => i > 0 && h <= point[0]);
  const left = anchors[index - 1], right = anchors[index];
  const linear = (h - left[0]) / (right[0] - left[0]);
  const tint = mix(left[1], right[1], linear * linear * (3 - 2 * linear));
  const nativeNight = !hasRegionPeople(mapId) && period === 'night';
  return { terrain: nativeNight ? mix(0xffffff, tint, .18) : tint,
    scenery: nativeNight ? mix(0xffffff, tint, .18) : mix(tint, 0xffffff, .18),
    people: mix(tint, 0xffffff, .55), light: 0xffedd0 };
}
