import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import { worldPeriod } from './world-clock';

const towns = ['lindenhafen', 'waldruh', 'nebelstadt'] as const;
const names = [...towns.flatMap(id => [`music-${id}`,`music-${id}-night`]), ...towns.map(id => `ambience-${id}`), 'step-stone', 'step-wood', 'door', 'bell'];
export function loadWorldAudio(scene: Phaser.Scene) {
  for (const name of ['wheels','whistle','door','brakes','cup','punch']) scene.load.audio(`world-train-${name}`, `/audio/ui/train-${name}.ogg`);
  for (const name of names) scene.load.audio(`world-${name}`, `/audio/world/${name}.ogg`);
}
interface Sound {
  isPlaying: boolean;
  play(): boolean;
  stop(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
  setVolume(value: number): void;
}
interface Layer { sound: Sound; volume: number; target: number; }

/** Any holder of Phaser's global sound and cache managers: the game itself or a scene. */
export type AudioHost = Pick<Phaser.Scene, 'sound' | 'cache'>;
/** One game-wide audio mix shared by every map and room. Phaser handles autoplay unlocking after the first gesture. */
export class WorldAudio {
  private layers = new Map<string, Layer>();
  private region = '';
  private quiet = false;
  private visible = true;
  private narration = false;
  private stepDistance = 0;
  private night=false;
  private train=false;
  setInterior(id?:string) { const train=!!id?.startsWith('train-'); if(train!==this.train){this.train=train;this.refresh();} }
  private ambienceKey(){return this.train?'world-train-wheels':`world-ambience-${this.region}`;}
  constructor(private scene: AudioHost) {}
  setRegion(id: MapId) {
    this.region = towns.includes(id as typeof towns[number]) ? id : 'nebelstadt';
    this.refresh();
  }
  setPreferences({ silent, muted }: { silent: boolean; muted: boolean }) {
    this.quiet = silent || muted;
    this.refresh();
  }
  setVisible(visible: boolean) { this.visible = visible; this.refresh(); }
  setNarration(active: boolean) { this.narration = active; this.refresh(); }
  setHour(hour:number){const night=worldPeriod(hour)==='night';if(this.night!==night){this.night=night;this.refresh();}}
  private refresh() {
    for (const [key, layer] of this.layers) {
      const active = [this.musicKey(),this.ambienceKey()].includes(key) && this.visible && !this.quiet;
      layer.target = active ? (key.includes('music') ? (this.narration ? .055 : .18) : .12) : 0;
      if (active && !layer.sound.isPlaying) layer.sound.play();
      if (!this.visible || this.quiet) { layer.volume = 0; layer.sound.setVolume(0); layer.sound.stop(); }
    }
    if (!this.region || this.quiet || !this.visible) return;
    for (const kind of ['music', 'ambience']) {
      const key = kind==='music'?this.musicKey():this.ambienceKey();
      if (this.layers.has(key) || !this.scene.cache.audio.exists(key)) continue;
      const sound = this.scene.sound.add(key, { loop: true, volume: 0 }) as unknown as Sound;
      this.layers.set(key, { sound, volume: 0, target: kind === 'music' ? (this.narration ? .055 : .18) : .12 });
      sound.play();
    }
  }
  private musicKey(){return `world-music-${this.region}${this.night?'-night':''}`;}
  update(seconds: number) {
    for (const layer of this.layers.values()) {
      layer.volume += (layer.target - layer.volume) * Math.min(1, seconds * 1.8);
      layer.sound.setVolume(layer.volume);
      if (layer.target === 0 && layer.volume < .001 && layer.sound.isPlaying) layer.sound.stop();
    }
  }
  footsteps(distance: number, indoor: boolean) {
    if (this.quiet || !this.visible) { this.stepDistance = 0; return; }
    this.stepDistance += distance;
    if (this.stepDistance >= 25) { this.stepDistance %= 25; this.effect(indoor ? 'step-wood' : 'step-stone', .11); }
  }
  effect(name: 'step-stone' | 'step-wood' | 'door' | 'bell' | 'train-door' | 'train-cup' | 'train-brakes' | 'train-whistle' | 'train-punch', volume = .25) {
    const key = `world-${name}`;
    if (!this.quiet && this.visible && this.scene.cache.audio.exists(key)) this.scene.sound.play(key, { volume });
  }
  destroy() { for (const { sound } of this.layers.values()) sound.destroy(); this.layers.clear(); }
}
