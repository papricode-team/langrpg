import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import { getMap } from './maps';
import { getPlacedScenery } from './placed-scenery';
import type { SceneryView } from './world-scenery';

export function atmosphereProfile(id: MapId, storm: boolean) {
  return { fog: id === 'nebelstadt' ? .13 : id === 'rainmarket' ? .04 : 0,
    rain: storm ? 1 : id === 'rainmarket' ? .55 : 0,
    leaves: id === 'waldruh', dust: id !== 'rainmarket' };
}
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Bounded, culled procedural atmosphere; no timers or frame-dependent randomness. */
export class WorldAtmosphere {
  private foreground: Phaser.GameObjects.Graphics;
  private illumination: Phaser.GameObjects.Graphics;
  private visible = true;
  private lamps: { x: number; y: number }[];
  private pointLights:Phaser.GameObjects.PointLight[]=[];
  constructor(private scene: Phaser.Scene, private id: MapId) {
    this.foreground = scene.add.graphics().setDepth(10000);
    this.illumination = scene.add.graphics().setDepth(2000).setBlendMode(1);
    this.lamps = getPlacedScenery(id).filter(spec => spec.asset === 'lamp' || spec.frame === 'motion-lamp').map(spec => ({ x: spec.x, y: spec.y - 52 }));
    this.lamps.push(...getMap(id).objects.filter(obj => obj.kind === 'lantern' || obj.kind === 'fountain').map(obj => ({ x: obj.x * 1536, y: obj.y * 1024 - 26 })));
    if(scene.sys.game.renderer.type===2&&scene.lights?.addPointLight)for(const lamp of this.lamps){
      this.pointLights.push(scene.lights.addPointLight(lamp.x,lamp.y,0xffcf80,90,0,.09).setDepth(2001));
    }
  }
  setVisible(visible: boolean) { this.visible = visible; this.foreground.setVisible(visible); this.illumination.setVisible(visible);for(const light of this.pointLights)light.setVisible(visible); }
  update(time: number, hour: number, view: SceneryView, reduced: boolean, storm: boolean) {
    this.foreground.clear(); this.illumination.clear();
    if (!this.visible) return;
    const t = reduced ? 0 : time;
    const night = hour < 6 || hour > 20 ? 1 : hour < 8 ? (8 - hour) / 2 : hour > 17 ? (hour - 17) / 3 : 0;
    for(const light of this.pointLights)light.intensity=night*(reduced?.24:.23+Math.sin(t*2.1+light.x)*.01);
    for (const lamp of this.lamps) {
      if (lamp.x < view.x - 120 || lamp.x > view.right + 120 || lamp.y < view.y - 120 || lamp.y > view.bottom + 120) continue;
      const flicker = reduced ? 1 : .95 + Math.sin(t * 2.1 + lamp.x) * .05;
      if(!this.pointLights.length)for (let r = 6; r > 0; r--) this.illumination.fillStyle(0xffce76, night * flicker * .016).fillCircle(lamp.x, lamp.y, r * 15);
      this.illumination.fillStyle(0xffe9b1, night * .4).fillCircle(lamp.x, lamp.y, 4);
    }
    const profile = atmosphereProfile(this.id, storm);
    if (profile.fog) for (let i = 0; i < 9; i++) {
      const x = (hash(i + 1) * 2100 + t * (4 + hash(i + 2) * 3)) % 2100 - 280;
      const y = hash(i + 21) * 1024;
      this.foreground.fillStyle(0xd1dfe3, profile.fog * .24).fillEllipse(x, y, 600, 130);
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
  destroy() { this.foreground.destroy(); this.illumination.destroy();for(const light of this.pointLights)light.destroy();this.pointLights=[]; }
}
