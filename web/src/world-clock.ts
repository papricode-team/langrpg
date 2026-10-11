import {parseSharedWorldTime, worldDaySeconds, worldStartHour, type SharedWorldTime, type WorldSimulationTime} from './shared-world-time';
export type WorldTimeMode = 'cycle' | 'local' | 'manual';
export type WorldPeriod = 'day' | 'night';
export interface WorldTimeOptions { mode:WorldTimeMode; hour:number; }
export interface WorldTimeState { hour:number; period:WorldPeriod; label:string; mode:WorldTimeMode; }
const normalize=(hour:number)=>((hour%24)+24)%24;
export const worldPeriod=(hour:number):WorldPeriod=>normalize(hour)>=7&&normalize(hour)<19?'day':'night';
/** Lamps and fireflies share the authored night boundary, with daylight fades. */
export function nightIntensity(hour: number): number {
  const h = normalize(hour);
  if (worldPeriod(h) === 'night') return 1;
  return h < 8 ? 8 - h : h > 18 ? h - 18 : 0;
}
export const localHour=(date=new Date()):number=>date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
/** Shared simulation advances independently of local visual time and motion preferences. */
export class WorldClock {
  private hour:number;
  private mode:WorldTimeMode;
  private shared?: { hour:number; received:number };
  private simulation?: WorldSimulationTime & {epoch:string; serverTime:number; received:number; correction:number};
  constructor(options:WorldTimeOptions={mode:'cycle',hour:localHour()}, private readonly monotonicNow=()=>performance.now()) {
    this.hour=normalize(Number.isFinite(options.hour)?options.hour:12);this.mode=options.mode;
  }
  setSharedTime(value: SharedWorldTime): void {
    const state = parseSharedWorldTime(value);
    if (!state) return;
    const now = this.monotonicNow();
    if (state.seed && state.epoch && state.serverTime && state.elapsedSeconds !== undefined && state.dayLengthSeconds) {
      const previous = this.simulation;
      const sameWorld = previous?.seed === state.seed && previous.epoch === state.epoch;
      const serverTime = Date.parse(state.serverTime);
      if (sameWorld && serverTime <= previous.serverTime) return;
      const predicted = sameWorld ? this.simulationTime()!.elapsedSeconds : state.elapsedSeconds;
      const difference = state.elapsedSeconds - predicted;
      // Blend normal network jitter over two seconds. Large forward gaps (tab
      // suspension or reconnect) reconstruct immediately; never run backwards.
      const elapsedSeconds = difference > 2 ? state.elapsedSeconds : predicted;
      const correction = difference > 2 ? 0 : Math.max(-1, difference);
      this.simulation = {epoch: state.epoch, seed: state.seed, serverTime, received: now,
        elapsedSeconds, dayLengthSeconds: state.dayLengthSeconds, correction};
    } else if (this.simulation) return; // A partial/old packet cannot downgrade a live world.
    this.shared = {hour: state.hour, received: now};
  }
  simulationTime(): WorldSimulationTime | undefined {
    const state = this.simulation;
    if (!state) return;
    const seconds = Math.max(0, (this.monotonicNow() - state.received) / 1000);
    return {elapsedSeconds: state.elapsedSeconds + seconds + state.correction * Math.min(1, seconds / 2),
      seed: state.seed, dayLengthSeconds: state.dayLengthSeconds};
  }
  gameplayHour(): number {
    const shared = this.simulationTime();
    return shared ? normalize(worldStartHour + shared.elapsedSeconds * 24 / shared.dayLengthSeconds) : this.advance(0).hour;
  }
  configure(options:WorldTimeOptions){this.mode=options.mode;this.hour=normalize(Number.isFinite(options.hour)?options.hour:12);}
  advance(seconds:number,date=new Date()):WorldTimeState {
    if(this.mode==='local')this.hour=localHour(date);
    else if(this.mode==='cycle') {
      const simulation = this.simulationTime();
      this.hour = simulation ? normalize(worldStartHour + simulation.elapsedSeconds * 24 / simulation.dayLengthSeconds)
        : this.shared ? normalize(this.shared.hour + Math.max(0, this.monotonicNow()-this.shared.received)/1000*24/worldDaySeconds)
        : normalize(this.hour + (Number.isFinite(seconds) ? Math.max(0,Math.min(seconds,1)) : 0)*24/worldDaySeconds);
    }
    const minute=Math.floor(this.hour*60),hours=Math.floor(minute/60),minutes=minute%60;
    return {hour:this.hour,period:worldPeriod(this.hour),mode:this.mode,label:`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`};
  }
}
