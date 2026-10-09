import type { Level } from './content';

export type MapId = 'lindenhafen' | 'waldruh' | 'nebelstadt';
export interface MapPosition { x: number; y: number; }
export interface WorldObjectSpec extends MapPosition {
  id: string;
  label: string;
  kind: 'fountain' | 'noticeboard' | 'parcel' | 'garden' | 'clock' | 'lantern' | 'instrument';
  exerciseIds: string[];
  prompt: string;
  description: string;
}
export interface WorldMapSpec {
  id: MapId;
  name: string;
  subtitle: string;
  level: Level;
  description: string;
  /** Terrain only; raised scenery comes from the transparent prop atlas. */
  asset: string;
  /** A static export of the assembled objects for region cards and atlas UI. */
  previewAsset: string;
  sceneryAsset: string;
  sceneryAtlas: string;
  variationAsset: string;
  variationAtlas: string;
  /** Feet positions, normalized to each 1536 × 1024 painting. */
  spawn: MapPosition;
  npcs: ReadonlyArray<MapPosition & { id: string }>;
  objects: ReadonlyArray<WorldObjectSpec>;
}

/** These are places to explore, not proficiency gates. The cast travels with the story. */
export const maps: readonly WorldMapSpec[] = [
  {
    id: 'lindenhafen', name: 'Lindenhafen', subtitle: 'The missing platform', level: 'A1',
    description: 'A sunlit canal town with excellent coffee, unreliable timetables and one platform that officially does not exist.',
    asset: '/assets/lindenhafen-terrain.webp', previewAsset: '/assets/lindenhafen-preview.webp', sceneryAsset: '/assets/lindenhafen-props.webp', sceneryAtlas: '/assets/lindenhafen-props.json', variationAsset: '/assets/lindenhafen-variations.webp', variationAtlas: '/assets/lindenhafen-variations.json', spawn: { x: .52, y: .61 },
    npcs: [
      { id: 'marta', x: .442, y: .459 }, { id: 'otto', x: .815, y: .299 },
      { id: 'lina', x: .603, y: .680 }, { id: 'emil', x: .228, y: .738 },
      { id: 'ada', x: .132, y: .322 }, { id: 'fritz', x: .775, y: .475 },
      { id: 'greta', x: .414, y: .707 },
    ],
    objects: [
      {
        id: 'lindenhafen-fountain', label: 'The whispering fountain', kind: 'fountain', x: .533, y: .523,
        exerciseIds: ['a1-cafe-exercise-5', 'a1-cafe-exercise-6'], prompt: 'A small order, a curious receipt.',
        description: 'The fountain gurgles like a customer trying to get the bill. Marta claims it only began doing this after the missing platform appeared.',
      },
      {
        id: 'lindenhafen-noticeboard', label: 'The suspicious timetable', kind: 'noticeboard', x: .809, y: .328,
        exerciseIds: ['a1-station-exercise-2', 'a1-station-exercise-7'], prompt: 'Read the announcement before the pigeons do.',
        description: 'One departure is crossed out in three different inks. A fourth correction reads “Pigeons are not a valid cause of delay.”',
      },
      {
        id: 'lindenhafen-parcel', label: 'A very patient parcel', kind: 'parcel', x: .665, y: .743,
        exerciseIds: ['a1-lost-parcel-exercise-1', 'a1-lost-parcel-exercise-6'], prompt: 'Find out who this parcel belongs to.',
        description: 'A parcel addressed to Marta has been delivered twice. The second delivery happened yesterday; the first is scheduled for tomorrow.',
      },
      {
        id: 'lindenhafen-workbench', label: 'Emil’s spare key', kind: 'instrument', x: .241, y: .763,
        exerciseIds: ['a1-workshop-exercise-1', 'a1-workshop-exercise-7'], prompt: 'Find a key, test a stubborn invention.',
        description: 'The key is labelled “Not for the door.” The door is labelled “Please stop using the key.” Emil has made no comment.',
      },
      {
        id: 'lindenhafen-garden', label: 'The soup garden', kind: 'garden', x: .415, y: .677,
        exerciseIds: ['a1-market-exercise-1', 'a1-market-exercise-5'], prompt: 'Collect a few ingredients for the soup club.',
        description: 'Greta has counted every tomato. Fritz insists he is conducting a taste census. Neither considers this a disagreement.',
      },
    ],
  },
  {
    id: 'waldruh', name: 'Waldruh', subtitle: 'A town out of time', level: 'A2',
    description: 'Autumn paths lead to a clockmill village where yesterday’s errands are still waiting and every clock tells a different story.',
    asset: '/assets/waldruh-terrain.webp', previewAsset: '/assets/waldruh-preview.webp', sceneryAsset: '/assets/waldruh-props.webp', sceneryAtlas: '/assets/waldruh-props.json', variationAsset: '/assets/waldruh-variations.webp', variationAtlas: '/assets/waldruh-variations.json', spawn: { x: .52, y: .54 },
    npcs: [
      { id: 'marta', x: .280, y: .346 }, { id: 'otto', x: .730, y: .307 },
      { id: 'lina', x: .430, y: .868 }, { id: 'emil', x: .300, y: .657 },
      { id: 'ada', x: .242, y: .836 }, { id: 'fritz', x: .592, y: .719 },
      { id: 'greta', x: .637, y: .816 },
    ],
    objects: [
      {
        id: 'waldruh-clock', label: 'The clockmill mechanism', kind: 'clock', x: .771, y: .548,
        exerciseIds: ['a2-broken-clock-exercise-1', 'a2-broken-clock-exercise-3'], prompt: 'Piece together the clockmill’s instructions.',
        description: 'The clockmill lost eleven minutes. Its maintenance log says “Found ten. Looking under the chair for the last one.”',
      },
      {
        id: 'waldruh-housing-board', label: 'A room with yesterday’s view', kind: 'noticeboard', x: .379, y: .363,
        exerciseIds: ['a2-apartment-exercise-2', 'a2-apartment-exercise-6'], prompt: 'Read a rental notice and request a repair.',
        description: 'The inn advertises a balcony, two rooms and a fridge that predicts the weather. This is apparently how they describe a broken fridge.',
      },
      {
        id: 'waldruh-herb-garden', label: 'Greta’s rest garden', kind: 'garden', x: .637, y: .782,
        exerciseIds: ['a2-clinic-exercise-5', 'a2-clinic-exercise-6'], prompt: 'Give some advice after a long woodland walk.',
        description: 'A bench offers sensible advice: rest, drink water and stop asking the fern for a second opinion.',
      },
      {
        id: 'waldruh-route-sign', label: 'The wandering signpost', kind: 'noticeboard', x: .626, y: .295,
        exerciseIds: ['a2-rail-trip-exercise-2', 'a2-rail-trip-exercise-4'], prompt: 'Compare the connections out of Waldruh.',
        description: 'One arrow points to the station. One points to a tree. Otto has filed a complaint against the tree for misleading passengers.',
      },
      {
        id: 'waldruh-memory-stone', label: 'A marker from the old route', kind: 'instrument', x: .195, y: .827,
        exerciseIds: ['a2-archive-exercise-1', 'a2-archive-exercise-4'], prompt: 'Compare the old maps with the village you see.',
        description: 'The old route marker is older than the archive’s oldest map. Ada looks pleased in the way other people look worried.',
      },
    ],
  },
  {
    id: 'nebelstadt', name: 'Nebelstadt', subtitle: 'The promise in the mist', level: 'B1',
    description: 'A misty harbor, a council with too many minutes and an observatory keeping the last secret of the Lantern Atlas.',
    asset: '/assets/nebelstadt-terrain.webp', previewAsset: '/assets/nebelstadt-preview.webp', sceneryAsset: '/assets/nebelstadt-props.webp', sceneryAtlas: '/assets/nebelstadt-props.json', variationAsset: '/assets/nebelstadt-variations.webp', variationAtlas: '/assets/nebelstadt-variations.json', spawn: { x: .50, y: .55 },
    npcs: [
      { id: 'marta', x: .296, y: .490 }, { id: 'otto', x: .697, y: .348 },
      { id: 'lina', x: .860, y: .602 }, { id: 'emil', x: .257, y: .734 },
      { id: 'ada', x: .342, y: .362 }, { id: 'fritz', x: .515, y: .745 },
      { id: 'greta', x: .630, y: .560 },
    ],
    objects: [
      {
        id: 'nebelstadt-council-board', label: 'The council’s almost-final plan', kind: 'noticeboard', x: .253, y: .434,
        exerciseIds: ['b1-council-exercise-2', 'b1-council-exercise-6'], prompt: 'Support a proposal and suggest a practical trial.',
        description: 'The plan has reached revision thirty-seven. Someone has proposed testing the route before forming a committee to discuss testing the route.',
      },
      {
        id: 'nebelstadt-signal-lantern', label: 'The harbor signal', kind: 'lantern', x: .882, y: .398,
        exerciseIds: ['b1-storm-exercise-2', 'b1-storm-exercise-7'], prompt: 'Warn the guests and bring the harbor together.',
        description: 'The signal lantern shines through the mist. Its keeper has prepared a storm plan and fourteen biscuits. Both require everyone’s cooperation.',
      },
      {
        id: 'nebelstadt-observatory', label: 'The atlas instrument', kind: 'instrument', x: .501, y: .265,
        exerciseIds: ['b1-atlas-exercise-4', 'b1-atlas-exercise-6'], prompt: 'Check what was meant and agree on a way forward.',
        description: 'The observatory points toward a route everyone remembers differently. The brass instrument works only when its instructions are understood.',
      },
      {
        id: 'nebelstadt-evidence-crate', label: 'Lina’s sealed evidence', kind: 'parcel', x: .149, y: .774,
        exerciseIds: ['b1-witness-exercise-3', 'b1-witness-exercise-5'], prompt: 'Weigh a claim against the evidence.',
        description: 'Inside the crate: a timetable, a witness statement and a receipt for one suspiciously punctual pigeon. Lina has numbered all three.',
      },
      {
        id: 'nebelstadt-harbor-chart', label: 'The route across the mist', kind: 'noticeboard', x: .626, y: .309,
        exerciseIds: ['b1-new-route-exercise-5', 'b1-new-route-exercise-6'], prompt: 'Compare the routes before choosing one.',
        description: 'The shorter route costs more. The longer route serves better soup. The harbor master requests that both facts remain in the official comparison.',
      },
    ],
  },
];

export function getMap(id: MapId): WorldMapSpec {
  return maps.find(map => map.id === id) ?? maps[0];
}
