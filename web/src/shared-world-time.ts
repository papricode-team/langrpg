export const worldDaySeconds = 720;
export const worldStartHour = 7;

export interface SharedWorldTime {
  hour: number;
  serverTime?: string;
  day?: number;
  epoch?: string;
  seed?: string;
  elapsedSeconds?: number;
  dayLengthSeconds?: number;
}
export interface WorldSimulationTime {
  elapsedSeconds: number;
  seed: string;
  dayLengthSeconds: number;
}

/** Keep malformed or partial simulation snapshots out of runtime state. */
export function parseSharedWorldTime(value: unknown): SharedWorldTime | undefined {
  if (!value || typeof value !== 'object') return;
  const clock = value as Record<string, unknown>;
  if (typeof clock.hour !== 'number' || !Number.isFinite(clock.hour) || clock.hour < 0 || clock.hour >= 24) return;
  const result: SharedWorldTime = {hour: clock.hour};
  if (typeof clock.serverTime === 'string' && Number.isFinite(Date.parse(clock.serverTime))) result.serverTime = clock.serverTime;
  if (typeof clock.day === 'number' && Number.isSafeInteger(clock.day) && clock.day >= 1) result.day = clock.day;
  const enhanced = ['epoch', 'seed', 'elapsedSeconds', 'dayLengthSeconds'].some(key => clock[key] !== undefined);
  if (!enhanced) return result; // Older standalone preview hosts still supply a sky clock.
  if (!result.serverTime || typeof clock.epoch !== 'string' || !Number.isFinite(Date.parse(clock.epoch))
    || typeof clock.seed !== 'string' || !/^[0-9a-f]{32}$/.test(clock.seed)
    || typeof clock.elapsedSeconds !== 'number' || !Number.isFinite(clock.elapsedSeconds) || clock.elapsedSeconds < 0
    || clock.elapsedSeconds > Number.MAX_SAFE_INTEGER / 1000 || clock.dayLengthSeconds !== worldDaySeconds) return;
  // The server's absolute timestamp is only for ordering and consistency. Never
  // compare it to the device's wall clock, which can be wrong or change abruptly.
  const expected = Math.max(0, (Date.parse(result.serverTime) - Date.parse(clock.epoch)) / 1000);
  if (Math.abs(expected - clock.elapsedSeconds) > .01) return;
  const hour = ((worldStartHour + clock.elapsedSeconds * 24 / worldDaySeconds) % 24 + 24) % 24;
  if (Math.abs(hour - result.hour) > .001 || result.day !== 1 + Math.floor(clock.elapsedSeconds / worldDaySeconds)) return;
  return {...result, epoch: clock.epoch, seed: clock.seed, elapsedSeconds: clock.elapsedSeconds, dayLengthSeconds: worldDaySeconds};
}
