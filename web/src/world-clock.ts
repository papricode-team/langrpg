export type WorldTimeMode = 'cycle' | 'local' | 'manual';
export type WorldPeriod = 'day' | 'night';
export interface WorldTimeOptions { mode:WorldTimeMode; hour:number; }
export interface WorldTimeState { hour:number; period:WorldPeriod; label:string; mode:WorldTimeMode; }
const normalize=(hour:number)=>((hour%24)+24)%24;
export const worldPeriod=(hour:number):WorldPeriod=>normalize(hour)>=7&&normalize(hour)<19?'day':'night';
export const localHour=(date=new Date()):number=>date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
/** A twelve-minute foreground day, or the user's local clock. Manual time is for watching a chosen scene. */
export class WorldClock {
  private hour:number;
  private mode:WorldTimeMode;
  constructor(options:WorldTimeOptions={mode:'cycle',hour:localHour()}){this.hour=normalize(Number.isFinite(options.hour)?options.hour:12);this.mode=options.mode;}
  configure(options:WorldTimeOptions){this.mode=options.mode;this.hour=normalize(Number.isFinite(options.hour)?options.hour:12);}
  advance(seconds:number,date=new Date()):WorldTimeState {
    if(this.mode==='local')this.hour=localHour(date);
    else if(this.mode==='cycle')this.hour=normalize(this.hour+Math.max(0,Math.min(seconds,1))*24/720);
    const minute=Math.floor(this.hour*60),hours=Math.floor(minute/60),minutes=minute%60;
    return {hour:this.hour,period:worldPeriod(this.hour),mode:this.mode,label:`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`};
  }
}
