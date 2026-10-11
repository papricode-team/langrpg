import {worldStartHour,type WorldSimulationTime} from './shared-world-time';

export type WorldWeatherMode = 'regional' | 'dry' | 'shower';
export interface RainWindow { start:number; end:number; }
export const weatherPreviewLabels:Record<WorldWeatherMode,string>={
  regional:'Regional weather',dry:'Dry day',shower:'Shower 09:15–10:15',
};
const hash=(value:string):number=>{let n=2166136261;for(const char of value)n=Math.imul(n^char.charCodeAt(0),16777619)>>>0;return n;};
const rainChance:Record<string,number>={lindenhafen:.55,waldruh:.65,nebelstadt:.7,rainmarket:1,cedarbay:.7,riverweave:.6,kigalights:.6,saffroncourt:.15,windplain:.25,terracielo:.25,sunpatch:.15,seoulsteps:.5,dunegarden:.08};

export function simulationDay(time:WorldSimulationTime):{day:number;seconds:number} {
  const absolute=Math.max(0,time.elapsedSeconds)+worldStartHour*time.dayLengthSeconds/24;
  const day=Math.floor(absolute/time.dayLengthSeconds);
  return {day,seconds:absolute-day*time.dayLengthSeconds};
}

/** One bounded daytime shower, reconstructed from the durable world seed.
 * Preview modes use this same timeline; they never replace a connected clock. */
export function rainForDay(mapId:string,time:WorldSimulationTime,day:number,mode:WorldWeatherMode='regional'):RainWindow|undefined {
  const hour=time.dayLengthSeconds/24;
  if(mode==='dry')return;
  if(mode==='shower')return {start:9.25*hour,end:10.25*hour};
  const key=`${time.seed}:${mapId}:${day}:weather-v1`;
  if(hash(key)%10000>=10000*(rainChance[mapId]??0))return;
  const start=(9+(hash(`${key}:start`)%6000)/1000)*hour;
  const duration=(.75+(hash(`${key}:duration`)%1000)/1000)*hour;
  return {start,end:start+duration};
}

export function worldRain(mapId:string,time:WorldSimulationTime,mode:WorldWeatherMode='regional'):number {
  const {day,seconds}=simulationDay(time),rain=rainForDay(mapId,time,day,mode);
  return rain&&seconds>=rain.start&&seconds<rain.end?(mapId==='rainmarket'?.55:.75):0;
}
