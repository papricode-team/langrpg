import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { LampLight, SceneryView } from './world-scenery';
import { nightIntensity } from './world-clock';

// Weather sits above the ground plate and below people, buildings and labels.
export const WEATHER_DEPTH = 2;

export function atmosphereProfile(id: MapId, storm: boolean) {
  return { fog: id === 'nebelstadt' ? .34 : id === 'rainmarket' ? .08 : 0,
    rain: storm && id === 'nebelstadt' ? 1 : id === 'rainmarket' ? .55 : 0,
    leaves: id === 'waldruh', dust: id !== 'rainmarket' };
}
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Bounded, culled procedural atmosphere; no timers or frame-dependent randomness. */
export class WorldAtmosphere {
  private foreground: Phaser.GameObjects.Graphics;
  private illumination: Phaser.GameObjects.Graphics;
  private visible = true;
  constructor(scene: Phaser.Scene, private id: MapId, private lamps: readonly LampLight[]) {
    this.foreground = scene.add.graphics().setDepth(WEATHER_DEPTH);
    // Source-over alpha stays bounded in both renderers, including at camera zoom.
    this.illumination = scene.add.graphics().setDepth(2000);
  }
  setLampLights(lamps: readonly LampLight[]) { this.lamps = lamps; }
  setVisible(visible: boolean) { this.visible = visible; this.foreground.setVisible(visible); this.illumination.setVisible(visible); }
  update(time: number, hour: number, view: SceneryView, reduced: boolean, storm: boolean) {
    this.foreground.clear(); this.illumination.clear();
    if (!this.visible) return;
    const t = reduced ? 0 : time;
    const night = nightIntensity(hour);
    for (const lamp of this.lamps) {
      if (lamp.x < view.x - 120 || lamp.x > view.right + 120 || lamp.y < view.y - 120 || lamp.y > view.bottom + 120) continue;
      const flicker = reduced ? 1 : .98 + Math.sin(t * 2.1 + lamp.x) * .02;
      const radius = Math.max(16, lamp.width * .9);
      // A small amber halo preserves the painted lantern and nearby silhouettes.
      for (let edge = 4; edge > 0; edge--) this.illumination.fillStyle(0xffc878, night * flicker * .018)
        .fillCircle(lamp.x, lamp.y, radius * edge / 4);
      this.illumination.fillStyle(0xffda94, night * .16).fillCircle(lamp.x, lamp.y, Math.max(1.2, lamp.width * .045));
      this.foreground.fillStyle(0xe8ae62, night * flicker * .045).fillEllipse(lamp.x, lamp.footY - 3, lamp.width * 2.4, lamp.width * .65);
    }
    const profile = atmosphereProfile(this.id, storm);
    if (profile.fog) for (let i = 0; i < 12; i++) {
      const x = (hash(i + 1) * 2100 + t * (4 + hash(i + 2) * 3)) % 2100 - 280;
      const y = hash(i + 21) * 1024;
      // Broad low mist hugs the streets; layers overlap softly at the edges.
      for (let edge = 3; edge > 0; edge--) this.foreground.fillStyle(0xd1dfe3, profile.fog * .1)
        .fillEllipse(x, y, 510 + edge * 60, 75 + edge * 25);
    }
    if (profile.rain) {
      this.foreground.lineStyle(.7, 0xc4d8e7, .26 * profile.rain);
      for (let i = 0; i < 130 * profile.rain; i++) {
        const x = (hash(i + 90) * 1536 - t * 90 + 1536 * 1000) % 1536;
        const y = (hash(i + 200) * 1024 + t * 460) % 1024;
        if (x < view.x || x > view.right || y < view.y || y > view.bottom) continue;
        this.foreground.lineBetween(x, y, x - 5, y + 16);
      }
    }
    if (profile.dust) for (let i = 0; i < 34; i++) {
      const x = (hash(i + 400) * 1536 + t * 4) % 1536, y = hash(i + 500) * 1024 + Math.sin(t * .35 + i) * 18;
      if (x < view.x || x > view.right || y < view.y || y > view.bottom) continue;
      this.foreground.fillStyle(profile.leaves ? 0xe5b969 : night > .5 ? 0xdfffa9 : 0xffeed0, profile.leaves ? .45 : .18 + night * .18)
        .fillEllipse(x, y, profile.leaves ? 4 : 1.5, profile.leaves ? 2 : 1.5);
    }
  }
  destroy() { this.foreground.destroy(); this.illumination.destroy(); }
}
