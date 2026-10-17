import type { WorldMotion } from './world';
import type { WorldTimeMode } from './world-clock';

/** Sound, listening and world display choices saved on this device. Moved out of main.ts unchanged in behaviour. */
export interface DevicePreferences {
  muted: boolean;
  silentMode: boolean;
  speechRate: number;
  worldMotion: WorldMotion;
  worldTimeMode: WorldTimeMode;
  manualWorldHour: number;
}

export function loadDevicePreferences(storage: Storage = localStorage): DevicePreferences {
  let worldMotion = (storage.getItem('atlas.worldMotion') as WorldMotion) || 'auto';
  if (!['auto', 'full', 'reduced'].includes(worldMotion)) worldMotion = 'auto';
  let worldTimeMode = (storage.getItem('atlas.worldTimeMode') as WorldTimeMode) || 'cycle';
  if (!['cycle', 'local', 'manual'].includes(worldTimeMode)) worldTimeMode = 'cycle';
  let manualWorldHour = Number(storage.getItem('atlas.worldHour') ?? 12);
  if (!Number.isFinite(manualWorldHour)) manualWorldHour = 12;
  let speechRate = Number(storage.getItem('atlas.speechRate') || '0.82');
  if (![0.65, 0.82, 1].includes(speechRate)) speechRate = 0.82;
  return {
    muted: storage.getItem('atlas.muted') !== 'false',
    silentMode: storage.getItem('atlas.silentMode') === 'true',
    speechRate, worldMotion, worldTimeMode, manualWorldHour,
  };
}
