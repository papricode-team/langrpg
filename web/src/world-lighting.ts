import type { RoomLighting } from './room-kit';
import type { MapId } from './maps';
import { nightIntensity, worldPeriod, type WorldPeriod } from './world-clock';
import { hasRegionPeople } from './world-map-assets';
import { foundationPalette } from './world-foundations';

interface WorldAmbient { terrain: number; scenery: number; people: number; light: number; ground: number; }
const daylight: Readonly<WorldAmbient> = { terrain: 0xffffff, scenery: 0xffffff, people: 0xffffff, light: 0xffffff, ground: 0xffffff };
const moonlight: Readonly<WorldAmbient> = { terrain: 0x596b86, scenery: 0x8899b6, people: 0xdce3f3, light: 0xffedd0, ground: 0x8899b6 };
/** Expedition periods reuse their painted pages with steady ambient lighting. */
export function worldAmbient(mapId: MapId, period: WorldPeriod): Readonly<WorldAmbient> {
  if (period === 'night') return hasRegionPeople(mapId) ? moonlight : { ...daylight, ground: moonlight.ground };
  return { ...daylight, scenery: mix(daylight.scenery, foundationPalette(mapId).bounce, .04) };
}

const mix = (a: number, b: number, ratio: number): number => {
  const red = Math.round((a >> 16 & 255) * (1 - ratio) + (b >> 16 & 255) * ratio);
  const green = Math.round((a >> 8 & 255) * (1 - ratio) + (b >> 8 & 255) * ratio);
  const blue = Math.round((a & 255) * (1 - ratio) + (b & 255) * ratio);
  return red << 16 | green << 8 | blue;
};
/** Continuous dawn, golden hour and blue hour, on top of authored night art. */
export function timeAmbient(mapId: MapId, hour: number, period: WorldPeriod = worldPeriod(hour)): Readonly<WorldAmbient> {
  const h = ((hour % 24) + 24) % 24;
  const anchors = [[0, 0x8497ba], [5, 0x8497ba], [7, 0xffe5c3], [9, 0xffffff],
    [16, 0xffffff], [18, 0xffd0a2], [20, 0x8296b9], [24, 0x8497ba]];
  const index = anchors.findIndex((point, i) => i > 0 && h <= point[0]);
  const left = anchors[index - 1], right = anchors[index];
  const linear = (h - left[0]) / (right[0] - left[0]);
  const tint = mix(left[1], right[1], linear * linear * (3 - 2 * linear));
  const nativeNight = !hasRegionPeople(mapId) && period === 'night';
  return { terrain: nativeNight ? mix(0xffffff, tint, .18) : tint,
    scenery: nativeNight ? mix(0xffffff, tint, .18) : mix(mix(tint, 0xffffff, .18), foundationPalette(mapId).bounce, .04 * (1 - nightIntensity(h))),
    // Runtime ground effects have no painted night variant: use the full ambient.
    ground: tint, people: mix(tint, 0xffffff, .55), light: 0xffedd0 };
}

/** Warm reflected timber/parchment light, even when the outside town is in moonlight. */
export function interiorPeopleTint(town: string, room = ''): number {
  if (room === 'station' || room === 'supermarket' || room === 'greenhouse') return 0xfff5e5;
  return town === 'nebelstadt' ? 0xfff3df : town === 'waldruh' ? 0xffedcf : 0xfff0d9;
}

/** Painted prologue rooms never use these exposure/tint helpers. */
export const interiorSurfaceTint = (hour: number): number => mix(0xfff8e9, 0x8593ae, nightIntensity(hour));

/** Allocation-free proximity sample; feet sample a softly extended elliptical pool. */
export function interiorLitPeopleTint(base: number, lighting: RoomLighting, x: number, y: number, hour: number): number {
  const night = nightIntensity(hour);
  let warmth = 0;
  for (const lamp of lighting.lamps) {
    const dx = (x - lamp.floorX) / lamp.radius, dy = (y - lamp.floorY) / (lamp.radius * .70);
    const falloff = Math.max(0, 1 - Math.hypot(dx, dy));
    warmth = Math.max(warmth, falloff * falloff);
  }
  return mix(mix(base, 0xa8b7d2, night * .70), 0xffd598, warmth * (.65 + night * .30));
}
