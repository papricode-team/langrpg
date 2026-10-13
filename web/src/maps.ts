import type { Level } from './content';
import type { ExpeditionId } from './expeditions';
import { applyAuthoredMapPlacements } from './map-authoring';

export type StoryMapId = 'lindenhafen' | 'waldruh' | 'nebelstadt';
export type MapId = StoryMapId | ExpeditionId;
export interface MapPosition { x: number; y: number; }
export interface WorldObjectSpec extends MapPosition {
  id: string;
  label: string;
  kind: 'fountain' | 'noticeboard' | 'parcel' | 'garden' | 'clock' | 'lantern' | 'instrument';
  exerciseIds: string[];
  prompt: string;
  description: string;
  /** Local exploration encounters have their own content outside the original story exercises. */
  encounterId?: string;
  /** Optional repeatable retrieval game offered at this world object. */
  minigame?: string;
}
export interface WorldMapSpec {
  id: MapId;
  width: number;
  height: number;
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
  /** Feet positions normalized to this map's logical bounds. */
  spawn: MapPosition;
  npcs: ReadonlyArray<MapPosition & { id: string; minigame?: string }>;
  objects: ReadonlyArray<WorldObjectSpec>;
}

/** Story routes open through restored evidence. The cast travels with the story. */
export const storyMaps: readonly WorldMapSpec[] = [
  {
    id: 'lindenhafen', width:1536, height:1024, name: 'Lindenhafen', subtitle: 'The missing platform', level: 'A1',
    description: 'A sunlit canal town with excellent coffee, unreliable timetables and one platform that officially does not exist.',
    asset: '/assets/lindenhafen-terrain.webp', previewAsset: '/assets/lindenhafen-preview.webp', sceneryAsset: '/assets/lindenhafen-props.webp', sceneryAtlas: '/assets/lindenhafen-props.json', variationAsset: '/assets/lindenhafen-variations.webp', variationAtlas: '/assets/lindenhafen-variations.json', spawn: { x: .52, y: .61 },
    npcs: [
      { id: 'marta', minigame: 'tray-rush', x: .442, y: .459 }, { id: 'otto', minigame: 'departure-board', x: .815, y: .299 },
      { id: 'lina', minigame: 'sorting-office', x: .603, y: .680 }, { id: 'emil', minigame: 'workbench', x: .228, y: .738 },
      { id: 'ada', minigame: 'adas-alphabet', x: .132, y: .322 }, { id: 'fritz', minigame: 'numbered-apples', x: .775, y: .475 },
      { id: 'greta', x: .414, y: .707 }, { id: 'inspector', minigame: 'brass-stamp', x: .854, y: .313 },
    ],
    objects: [
      { id: 'lindenhafen-platform-ticket', minigame: 'departure-board', label: 'Bahnsteig sieben', kind: 'lantern', x: .837, y: .347, exerciseIds: ['a1-arrival-exercise-7', 'a1-station-exercise-7'], prompt: 'Look at the old platform and its lantern.', description: 'The seventh platform has been closed for twelve years. Otto still lights its old lantern every morning.' },
      { id: 'lindenhafen-cafe-receipt', minigame: 'kettle-forecast', label: 'Martas Theke', kind: 'parcel', x: .458, y: .489, exerciseIds: ['a1-cafe-exercise-5', 'a1-cafe-exercise-6'], prompt: 'Read what is on Marta’s counter.', description: 'Receipts, the guest book and the café telephone. Marta keeps every note, especially the ones she does not understand.' },
      { id: 'lindenhafen-market-crate', minigame: 'numbered-apples', label: 'Fritz’ Stand', kind: 'parcel', x: .762, y: .509, exerciseIds: ['a1-market-exercise-3', 'a1-market-exercise-5'], prompt: 'Read the order slips at Fritz’s stall.', description: 'Crates of apples and potatoes, and the list of everyone who eats Fritz’s soup on Friday.' },
      {
        id: 'lindenhafen-fountain', minigame: 'lantern-lighting', label: 'Der Brunnen', kind: 'fountain', x: .533, y: .523,
        exerciseIds: ['a1-cafe-exercise-5', 'a1-cafe-exercise-6'], prompt: 'Sit by the fountain for a moment.',
        description: 'A bench beside the fountain. Someone always read here in the morning. This week the bench has stayed empty.',
      },
      {
        id: 'lindenhafen-noticeboard', minigame: 're-ink', label: 'Der Fahrplan', kind: 'noticeboard', x: .809, y: .328,
        exerciseIds: ['a1-station-exercise-2', 'a1-station-exercise-7'], prompt: 'Read the departure board.',
        description: 'Departures for platforms one to six, in Otto’s neat handwriting. The line for platform seven has almost faded away.',
      },
      {
        id: 'lindenhafen-parcel', minigame: 'sorting-office', label: 'Linas Schalter', kind: 'parcel', x: .665, y: .743,
        exerciseIds: ['a1-lost-parcel-exercise-1', 'a1-lost-parcel-exercise-6'], prompt: 'Look at the post counter.',
        description: 'Parcels in order of address, and a lost-and-found box. Lina has labelled the box “Lost and found” in three colours.',
      },
      {
        id: 'lindenhafen-workbench', minigame: 'workbench', label: 'Emils Werkbank', kind: 'instrument', x: .241, y: .763,
        exerciseIds: ['a1-workshop-exercise-1', 'a1-workshop-exercise-7'], prompt: 'Look at Emil’s workbench.',
        description: 'Tools, half a bicycle and an order book. Most of the repairs are marked “works mostly”.',
      },
      {
        id: 'lindenhafen-garden', label: 'Gretas Garten', kind: 'garden', x: .415, y: .677,
        exerciseIds: ['a1-market-exercise-1', 'a1-market-exercise-5'], prompt: 'Visit Greta’s garden and small pharmacy.',
        description: 'Herbs for tea, vegetables for Fritz and a shelf of medicine. Every bag is labelled with a name.',
      },
      {
        id: 'lindenhafen-berg-house', label: 'Gartenstraße 7', kind: 'parcel', x: .257, y: .44,
        exerciseIds: ['a1-lost-parcel-exercise-3', 'a1-lost-parcel-exercise-4'], prompt: 'Look at the house at Gartenstraße 7.',
        description: 'A small house with a garden gate and a letterbox. The name plate on the door is blank.',
      },
      {
        id: 'lindenhafen-bench', label: 'Die Bank am Bahnhof', kind: 'noticeboard', x: .577, y: .227,
        exerciseIds: ['a1-station-exercise-5', 'a1-station-exercise-6'], prompt: 'Look at the bench by the platforms.',
        description: 'An old wooden bench by the platforms. Inspector Voss sits here every evening.',
      },
    ],
  },
  {
    id: 'waldruh', width:1536, height:1024, name: 'Waldruh', subtitle: 'A town out of time', level: 'A2',
    description: 'Autumn paths lead to a clockmill village where yesterday’s errands are still waiting and every clock tells a different story.',
    asset: '/assets/waldruh-terrain.webp', previewAsset: '/assets/waldruh-preview.webp', sceneryAsset: '/assets/waldruh-props.webp', sceneryAtlas: '/assets/waldruh-props.json', variationAsset: '/assets/waldruh-variations.webp', variationAtlas: '/assets/waldruh-variations.json', spawn: { x: .52, y: .54 },
    npcs: [
      { id: 'marta', minigame: 'tray-rush', x: .280, y: .346 }, { id: 'otto', minigame: 'departure-board', x: .730, y: .307 },
      { id: 'lina', minigame: 'sorting-office', x: .430, y: .868 }, { id: 'emil', minigame: 'workbench', x: .300, y: .657 },
      { id: 'ada', minigame: 'adas-alphabet', x: .242, y: .836 }, { id: 'fritz', minigame: 'numbered-apples', x: .592, y: .719 },
      { id: 'greta', x: .637, y: .816 }, { id: 'inspector', minigame: 'brass-stamp', x: .747, y: .300 },
    ],
    objects: [
      {
        id: 'waldruh-clock', minigame: 'lost-hour', label: 'Die Uhrmühle', kind: 'clock', x: .771, y: .548,
        exerciseIds: ['a2-broken-clock-exercise-1', 'a2-broken-clock-exercise-3'], prompt: 'Piece together the clockmill’s instructions.',
        description: 'The clockmill lost eleven minutes. Its maintenance log says “Found ten. Looking under the chair for the last one.”',
      },
      {
        id: 'waldruh-housing-board', label: 'Das Zimmer im Gasthaus', kind: 'noticeboard', x: .379, y: .363,
        exerciseIds: ['a2-apartment-exercise-2', 'a2-apartment-exercise-6'], prompt: 'Read a rental notice and request a repair.',
        description: 'The inn advertises a balcony, two rooms and a fridge that predicts the weather. This is apparently how they describe a broken fridge.',
      },
      {
        id: 'waldruh-herb-garden', minigame: 'seed-packets', label: 'Gretas Garten', kind: 'garden', x: .637, y: .782,
        exerciseIds: ['a2-clinic-exercise-5', 'a2-clinic-exercise-6'], prompt: 'Give some advice after a long woodland walk.',
        description: 'A bench offers sensible advice: rest, drink water and stop asking the fern for a second opinion.',
      },
      {
        id: 'waldruh-route-sign', minigame: '17-59', label: 'Der Wegweiser', kind: 'noticeboard', x: .626, y: .295,
        exerciseIds: ['a2-rail-trip-exercise-2', 'a2-rail-trip-exercise-4'], prompt: 'Compare the connections out of Waldruh.',
        description: 'One arrow points to the station. One points to a tree. Otto has filed a complaint against the tree for misleading passengers.',
      },
      {
        id: 'waldruh-memory-stone', minigame: 'adas-alphabet', label: 'Der alte Wegstein', kind: 'instrument', x: .195, y: .827,
        exerciseIds: ['a2-archive-exercise-1', 'a2-archive-exercise-4'], prompt: 'Compare the old maps with the village you see.',
        description: 'The old route marker is older than the archive’s oldest map. Ada looks pleased in the way other people look worried.',
      },
    ],
  },
  {
    id: 'nebelstadt', width:1536, height:1024, name: 'Nebelstadt', subtitle: 'The promise in the mist', level: 'B1',
    description: 'A misty harbor, a council with too many minutes and an observatory keeping the last secret of the Lantern Atlas.',
    asset: '/assets/nebelstadt-harbour-bridge-day-terrain.webp', previewAsset: '/assets/nebelstadt-preview.webp', sceneryAsset: '/assets/nebelstadt-props.webp', sceneryAtlas: '/assets/nebelstadt-props.json', variationAsset: '/assets/nebelstadt-variations.webp', variationAtlas: '/assets/nebelstadt-variations.json', spawn: { x: .50, y: .55 },
    npcs: [
      { id: 'marta', minigame: 'tray-rush', x: .296, y: .490 }, { id: 'otto', minigame: 'departure-board', x: .697, y: .348 },
      { id: 'lina', minigame: 'sorting-office', x: .860, y: .602 }, { id: 'emil', minigame: 'workbench', x: .257, y: .734 },
      { id: 'ada', minigame: 'adas-alphabet', x: .342, y: .362 }, { id: 'fritz', minigame: 'numbered-apples', x: .515, y: .745 },
      { id: 'greta', x: .630, y: .560 }, { id: 'inspector', minigame: 'brass-stamp', x: .271, y: .456 }, { id: 'elise', minigame: 're-ink', x: .501, y: .280 },
    ],
    objects: [
      { id: 'nebelstadt-repair-ledger', label: 'Das Reparaturbuch', kind: 'noticeboard', x: .285, y: .767, exerciseIds: ['b1-storm-exercise-7'], prompt: 'Check who can repair the signal.', description: 'Emils Reparaturbuch nennt die Helfer: Greta bringt Wasser, Otto prüft das Signal, und Lina verteilt die Nachrichten.' },
      {
        id: 'nebelstadt-council-board', minigame: 'seven-chairs', label: 'Der Plan des Rates', kind: 'noticeboard', x: .253, y: .434,
        exerciseIds: ['b1-council-exercise-2', 'b1-council-exercise-6'], prompt: 'Support a proposal and suggest a practical trial.',
        description: 'The plan has reached revision thirty-seven. Someone has proposed testing the route before forming a committee to discuss testing the route.',
      },
      {
        id: 'nebelstadt-signal-lantern', minigame: 'lantern-lighting', label: 'Die Signallampe', kind: 'lantern', x: .882, y: .398,
        exerciseIds: ['b1-storm-exercise-2', 'b1-storm-exercise-7'], prompt: 'Warn the guests and bring the harbor together.',
        description: 'The signal lantern shines through the mist. Its keeper has prepared a storm plan and fourteen biscuits. Both require everyone’s cooperation.',
      },
      {
        id: 'nebelstadt-observatory', minigame: 're-ink', label: 'Der Atlas', kind: 'instrument', x: .501, y: .265,
        exerciseIds: ['b1-atlas-exercise-4', 'b1-atlas-exercise-6'], prompt: 'Check what was meant and agree on a way forward.',
        description: 'The observatory points toward a route everyone remembers differently. The brass instrument works only when its instructions are understood.',
      },
      {
        id: 'nebelstadt-evidence-crate', minigame: 'looping-tape', label: 'Linas Beweise', kind: 'parcel', x: .149, y: .774,
        exerciseIds: ['b1-witness-exercise-3', 'b1-witness-exercise-5'], prompt: 'Weigh a claim against the evidence.',
        description: 'Inside the crate: a timetable, a witness statement and a receipt for one suspiciously punctual pigeon. Lina has numbered all three.',
      },
      {
        id: 'nebelstadt-harbor-chart', label: 'Der Weg durch den Nebel', kind: 'noticeboard', x: .626, y: .309,
        exerciseIds: ['b1-new-route-exercise-5', 'b1-new-route-exercise-6'], prompt: 'Compare the routes before choosing one.',
        description: 'The shorter route costs more. The longer route serves better soup. The harbor master requests that both facts remain in the official comparison.',
      },
    ],
  },
];

/** Only the three authored towns are playable. Expedition encounters remain course content. */
export const maps: readonly WorldMapSpec[] = storyMaps;
export const isStoryMap = (id: unknown): id is StoryMapId => storyMaps.some(map => map.id === id);

export function getMap(id: MapId): WorldMapSpec {
  return applyAuthoredMapPlacements(maps.find(map => map.id === id) ?? maps[0]);
}
