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
