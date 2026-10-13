import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { InteriorId } from './interiors';
import type { Progress } from './api';
import type { ScreenFilterSettings } from './screen-filter-settings';
import type { WorldClock, WorldTimeState } from './world-clock';
import type { WorldAudio } from './world-audio';
import type { CameraBeat } from './cutscene';
import type { RoutineLexeme, WorldBark } from './world-routines';
import type { WorldWeatherMode } from './world-weather';
import type { ModularAvatar } from './modular-character';

export type Avatar = ModularAvatar;

export interface WorldPlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  avatar: Avatar;
  mapId?: MapId;
  interiorId?: InteriorId;
}

export type WorldMotion = 'auto' | 'full' | 'reduced';
export interface WorldStoryState { completedQuestIds: readonly string[]; bellCount: number; flags?: Record<string, boolean>; playerName?: string; }
export interface WorldLearningContext {
  lexicon: readonly RoutineLexeme[];
  progress: Pick<Progress, 'words'>;
  introduced?: ReadonlySet<string>;
  lineAllowed?: (german: string) => boolean;
}
/** How the active explore scene is shown behind the DOM layers. */
export type WorldPresentation = 'live' | 'paused' | 'hidden';

/** Shared state lives in the Phaser registry; scenes read it on create and follow its change events. */
export interface WorldRegistry {
  mapId: MapId;
  interiorId: InteriorId | undefined;
  players: { players: readonly WorldPlayer[]; selfId: string };
  avatar: Avatar;
  objective: string | undefined;
  storyState: WorldStoryState;
  conversationTarget: string | undefined;
  cinematicBeat: CameraBeat | undefined;
  inputEnabled: boolean;
  windowFocused: boolean;
  reducedMotion: boolean;
  watching: boolean;
  terrainOnly: boolean;
  screenFilter: ScreenFilterSettings;
  learning: WorldLearningContext;
  weatherPreview: WorldWeatherMode;
  observedResident: string | undefined;
  density: number;
  clock: WorldClock;
  audio: WorldAudio;
}
export type WorldKey = keyof WorldRegistry;

export function readWorld<K extends WorldKey>(registry: Phaser.Data.DataManager, key: K): WorldRegistry[K] {
  return registry.get(key) as WorldRegistry[K];
}
export function writeWorld<K extends WorldKey>(registry: Phaser.Data.DataManager, key: K, value: WorldRegistry[K]): void {
  registry.set(key, value);
}
/** Subscribe to one registry key until the owning scene shuts down. */
export function followWorld<K extends WorldKey>(scene: Phaser.Scene, key: K, listener: (value: WorldRegistry[K]) => void): void {
  const event = `changedata-${key}`;
  const handler = (_parent: unknown, value: WorldRegistry[K]) => listener(value);
  scene.registry.events.on(event, handler);
  scene.events.once('shutdown', () => scene.registry.events.off(event, handler));
  scene.events.once('destroy', () => scene.registry.events.off(event, handler));
}

/** Game-level events emitted by scenes; the World facade forwards them to its options. */
export const WorldEvents = {
  Move: 'atlas:move',
  Npc: 'atlas:npc',
  Object: 'atlas:object',
  MiniGame: 'atlas:minigame',
  Nearby: 'atlas:nearby',
  MapReady: 'atlas:map-ready',
  InteriorChange: 'atlas:interior-change',
  InteriorInteract: 'atlas:interior-interact',
  Bark: 'atlas:bark',
  Time: 'atlas:time',
  LoadProgress: 'atlas:load-progress',
  Ready: 'atlas:ready',
  /** An explore scene finished building or woke up and can take commands. */
  ExploreReady: 'atlas:explore-ready',
} as const;
export interface WorldEventPayloads {
  [WorldEvents.Move]: [x: number, y: number];
  [WorldEvents.Npc]: [id: string];
  [WorldEvents.Object]: [id: string];
  [WorldEvents.MiniGame]: [id: string];
  [WorldEvents.Nearby]: [id: string | undefined];
  [WorldEvents.MapReady]: [id: MapId];
  [WorldEvents.InteriorChange]: [id: InteriorId | undefined];
  [WorldEvents.InteriorInteract]: [id: string];
  [WorldEvents.Bark]: [bark: WorldBark];
  [WorldEvents.Time]: [state: WorldTimeState];
  [WorldEvents.LoadProgress]: [progress: number, label: string];
  [WorldEvents.Ready]: [];
  [WorldEvents.ExploreReady]: [key: string];
}
export function emitWorld<E extends keyof WorldEventPayloads>(game: Phaser.Game, event: E, ...args: WorldEventPayloads[E]): void {
  game.events.emit(event, ...args);
}

export const SceneKeys = {
  Boot: 'boot',
  World: 'world',
  Interior: 'interior',
  Travel: 'travel',
  Cinematic: 'cinematic',
} as const;
