import type * as Phaser from 'phaser';
import type { MapId } from './maps';

type Point = readonly [number, number];
type Kind = 'current' | 'smoke' | 'jet' | 'splash' | 'ring' | 'fall' | 'fog' | 'beam' | 'beacon' | 'wheel' | 'clock' | 'mechanism';
interface Effect {
  sprite: Phaser.GameObjects.Image;
  kind: Kind;
  x: number;
  y: number;
  phase: number;
  scale: number;
  rotation: number;
  radius: number;
}
export interface EnvironmentOptions { mobile: boolean; reducedMotion: boolean; }
export interface EnvironmentView { x: number; y: number; right: number; bottom: number; }

/** Water and roof coordinates in the original 1536 × 1024 paintings. Keeping
 * currents in individual pools avoids washing over paths, bridges or buildings. */
export const environmentAnchors: Readonly<Record<MapId, {
  currents: readonly Point[];
  smoke: readonly Point[];
  fountain?: Point;
  falls?: readonly Point[];
  fog?: readonly Point[];
}>> = {
  lindenhafen: {
    currents: [[1478, 435], [1410, 515], [1327, 714], [1390, 790], [1468, 895], [1510, 985], [1084, 975], [964, 956], [456, 983], [354, 917], [174, 842], [96, 802]],
    smoke: [[652, 249], [261, 493], [1506, 59]],
    fountain: [818, 536],
  },
  waldruh: {
    currents: [[1412, 420], [1410, 539], [1308, 690], [1414, 766], [1460, 915], [1364, 1004]],
    smoke: [[267, 54], [173, 487], [1077, 104]],
    fountain: [722, 438],
    falls: [[1458, 325], [1350, 540], [1471, 829]],
  },
  nebelstadt: {
    currents: [[1398, 534], [1458, 608], [1311, 716], [1390, 793], [1350, 913], [1010, 1011], [798, 1000], [505, 980], [369, 894], [161, 882], [96, 743]],
    smoke: [[1191, 133], [199, 514]],
    fog: [[1303, 136], [1407, 460], [1378, 758], [1281, 972], [805, 980], [181, 900]],
  },
};

const PREFIX = 'world-life-';
const TAU = Math.PI * 2;
const cycle = (value: number): number => ((value % 1) + 1) % 1;

/** A bounded set of shared-texture sprites. All canvas drawing and GPU uploads
 * happen once at creation; each frame only changes transforms and opacity. */
export class WorldEnvironment {
  private effects: Effect[] = [];
  private reducedMotion: boolean;
  private readonly limit: number;
  private reactionUntil: Record<'fountain' | 'clock' | 'lantern', number> = { fountain: 0, clock: 0, lantern: 0 };
  private lastMotionTime = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly mapId: MapId, private readonly options: EnvironmentOptions) {
    this.reducedMotion = options.reducedMotion;
    this.limit = options.mobile ? 32 : 52;
    this.prepareTextures();
    this.create();
  }

  get spriteCount(): number { return this.effects.length; }

  setReducedMotion(reduced: boolean): void { this.reducedMotion = reduced; }

  /** Physical feedback for inspecting a discovery; no timer survives map travel. */
  react(kind: string, timeSeconds: number): void {
    if (kind === 'fountain' || kind === 'clock' || kind === 'lantern') this.reactionUntil[kind] = timeSeconds + 2.6;
  }

  private texture(key: string, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): void {
    const id = PREFIX + key;
    if (this.scene.textures.exists(id)) return;
    const texture = this.scene.textures.createCanvas(id, width, height);
    if (!texture) return;
    paint(texture.context);
    texture.refresh();
  }

  private prepareTextures(): void {
    this.texture('current', 128, 44, ctx => {
      // Broken, feathered highlights follow the map's hand-painted water.
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const y = 7 + i * 4.4;
        ctx.beginPath();
        ctx.moveTo(7 + i * 11 % 24, y);
        ctx.bezierCurveTo(31, y - 3, 65, y + 3, 108 - i * 13 % 29, y - 1);
        ctx.strokeStyle = i % 2 ? 'rgba(199,231,213,.48)' : 'rgba(223,236,211,.74)';
        ctx.lineWidth = i % 2 ? .8 : 1.5;
        ctx.shadowColor = 'rgba(201,231,221,.3)';
        ctx.shadowBlur = 3;
        ctx.stroke();
      }
    });
    this.texture('cloud', 128, 96, ctx => {
      for (let i = 0; i < 11; i++) {
        const x = 38 + Math.sin(i * 2.37) * 23;
        const y = 43 + Math.cos(i * 1.61) * 13;
        const radius = 19 + i % 4 * 4;
        const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius);
        gradient.addColorStop(0, 'rgba(216,222,214,.32)');
        gradient.addColorStop(.45, 'rgba(201,211,203,.16)');
        gradient.addColorStop(1, 'rgba(202,214,211,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    });
    this.texture('jet', 40, 48, ctx => {
      ctx.lineCap = 'round';
      for (let line = 0; line < 3; line++) {
        ctx.beginPath();
        ctx.moveTo(2 + line * .9, 10);
        ctx.quadraticCurveTo(22, -8 + line, 36 - line, 40);
        ctx.strokeStyle = line === 1 ? 'rgba(234,243,229,.85)' : 'rgba(172,224,218,.45)';
        ctx.lineWidth = line === 1 ? 1.7 : 2.5;
        ctx.shadowColor = 'rgba(210,240,232,.45)';
        ctx.shadowBlur = 2;
        ctx.stroke();
      }
    });
    this.texture('ring', 72, 30, ctx => {
      ctx.strokeStyle = 'rgba(215,238,225,.74)';
      ctx.lineWidth = 1.3;
      ctx.shadowColor = 'rgba(165,218,217,.5)';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.ellipse(36, 15, 31, 10, 0, .1, Math.PI * 1.83);
      ctx.stroke();
      ctx.lineWidth = .6;
      ctx.beginPath();
      ctx.ellipse(36, 15, 26, 8, 0, 3.4, 6.1);
      ctx.stroke();
    });
    this.texture('splash', 16, 16, ctx => {
      const gradient = ctx.createRadialGradient(8, 8, .3, 8, 8, 6);
      gradient.addColorStop(0, 'rgba(244,249,237,.9)');
      gradient.addColorStop(.25, 'rgba(213,239,229,.55)');
      gradient.addColorStop(1, 'rgba(213,239,229,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 16, 16);
    });
    this.texture('fall', 40, 112, ctx => {
      for (let i = 0; i < 9; i++) {
        const x = 7 + i * 3;
        const top = i * 17 % 35;
        const gradient = ctx.createLinearGradient(0, top, 0, top + 65);
        gradient.addColorStop(0, 'rgba(211,238,225,0)');
        gradient.addColorStop(.22, 'rgba(222,244,233,.52)');
        gradient.addColorStop(.6, 'rgba(213,237,230,.8)');
        gradient.addColorStop(1, 'rgba(213,237,230,0)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = i % 3 ? 1.7 : 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 4, top);
        ctx.bezierCurveTo(x + 3, top + 15, x - 2, top + 47, x - 8, top + 68);
        ctx.stroke();
      }
    });
    this.texture('fog', 320, 128, ctx => {
      for (let i = 0; i < 16; i++) {
        const x = 38 + i * 16;
        const y = 64 + Math.sin(i * 1.63) * 11;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 38);
        gradient.addColorStop(0, 'rgba(184,202,205,.31)');
        gradient.addColorStop(.5, 'rgba(171,191,195,.13)');
        gradient.addColorStop(1, 'rgba(171,191,195,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - 38, y - 38, 76, 76);
      }
    });
    this.texture('beam', 320, 100, ctx => {
      const gradient = ctx.createLinearGradient(0, 0, 320, 0);
      gradient.addColorStop(0, 'rgba(255,224,153,.6)');
      gradient.addColorStop(.2, 'rgba(252,231,186,.24)');
      gradient.addColorStop(1, 'rgba(242,231,207,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, 50);
      ctx.lineTo(320, 2);
      ctx.lineTo(320, 98);
      ctx.closePath();
      ctx.fill();
    });
    this.texture('beacon', 64, 64, ctx => {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 29);
      gradient.addColorStop(0, 'rgba(255,244,202,.95)');
      gradient.addColorStop(.18, 'rgba(255,227,164,.62)');
      gradient.addColorStop(.5, 'rgba(244,214,166,.18)');
      gradient.addColorStop(1, 'rgba(244,214,166,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    });
    this.texture('spoke', 52, 8, ctx => {
      ctx.fillStyle = 'rgba(180,151,102,.9)';
      ctx.fillRect(0, 3, 49, 2.3);
      ctx.fillStyle = 'rgba(238,204,139,.57)';
      ctx.fillRect(0, 3, 49, .7);
    });
    this.texture('hand', 28, 6, ctx => {
      ctx.fillStyle = 'rgba(219,203,150,.98)';
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(21, 2);
      ctx.lineTo(27, 3);
      ctx.lineTo(21, 4);
      ctx.lineTo(0, 4);
      ctx.fill();
    });
  }

  private add(kind: Kind, key: string, x: number, y: number, phase: number, scale = 1, rotation = 0, radius = 90): void {
    if (this.effects.length >= this.limit || !this.scene.textures.exists(PREFIX + key)) return;
    const depth = kind === 'current' || kind === 'ring' || kind === 'fall' ? 2
      : kind === 'jet' || kind === 'splash' ? y + 3
        : kind === 'clock' || kind === 'wheel' ? 1200 : 1900;
    const sprite = this.scene.add.image(x, y, PREFIX + key).setDepth(depth).setScale(scale);
    if (kind === 'beam' || kind === 'wheel' || kind === 'clock') sprite.setOrigin(0, .5);
    if (kind === 'jet') sprite.setOrigin(0, 10 / 48);
    this.effects.push({ sprite, kind, x, y, phase, scale, rotation, radius });
  }

  private create(): void {
    const anchors = environmentAnchors[this.mapId];
    const mobile = this.options.mobile;
    anchors.currents.forEach(([x, y], i) => {
      if (!mobile || i % 2 === 0) this.add('current', 'current', x, y, i * .347, .58 + i % 3 * .14, i % 2 ? -.28 : -.08, 110);
      if (!mobile) this.add('current', 'current', x + 9, y + 13, i * .347 + .48, .48, -.2, 110);
    });
    if (anchors.fountain) {
      const [x, y] = anchors.fountain;
      this.add('jet', 'jet', x + 7, y - 23, .3, .76, 0, 60);
      this.add('jet', 'jet', x - 7, y - 23, 1.8, -.76, 0, 60);
      for (let i = 0; i < (mobile ? 2 : 3); i++) this.add('ring', 'ring', x, y + 1, i / 3, 1, 0, 60);
      for (let i = 0; i < (mobile ? 2 : 4); i++) this.add('splash', 'splash', x + (i % 2 ? 19 : -19), y + 3, i * .271, .42, 0, 60);
    }
    anchors.falls?.forEach(([x, y], i) => {
      for (let part = 0; part < 2; part++) this.add('fall', 'fall', x + part * 8, y, i * .271 + part / 2, .65, -.13, 105);
    });
    anchors.smoke.forEach(([x, y], i) => {
      for (let puff = 0; puff < (mobile ? 2 : 4); puff++) this.add('smoke', 'cloud', x, y, puff / (mobile ? 2 : 4) + i * .217, .7, 0, 140);
    });
    anchors.fog?.forEach(([x, y], i) => {
      if (!mobile || i % 2 === 0) this.add('fog', 'fog', x, y, i * 1.31, .9 + i % 2 * .15, 0, 245);
    });
    if (this.mapId === 'waldruh') {
      const spokes = mobile ? 4 : 8;
      for (let i = 0; i < spokes; i++) this.add('wheel', 'spoke', 1314, 503, i * TAU / spokes, 1, 0, 70);
      this.add('clock', 'hand', 1237, 390, 0, .83, 0, 45);
      this.add('clock', 'hand', 1237, 390, 1, .52, 0, 45);
      this.add('mechanism', 'beacon', 1237, 390, 0, .62, 0, 50);
      this.add('mechanism', 'beacon', 1314, 503, 1, .82, 0, 60);
    } else if (this.mapId === 'nebelstadt') {
      this.add('beam', 'beam', 1455, 126, 0, 1, Math.PI, 345);
      this.add('beacon', 'beacon', 1455, 126, 0, .7, 0, 80);
    }
    this.update(0, { x: 0, y: 0, right: 1536, bottom: 1024 });
  }

  update(timeSeconds: number, view: EnvironmentView): void {
    // Preserve the displayed frame when the preference changes mid-visit.
    // The scene's decorative clock also pauses, so resuming continues smoothly.
    if (!this.reducedMotion) this.lastMotionTime = timeSeconds;
    const time = this.lastMotionTime;
    const fountainReaction = Math.max(0, (this.reactionUntil.fountain - timeSeconds) / 2.6);
    const clockReaction = Math.max(0, (this.reactionUntil.clock - timeSeconds) / 2.6);
    const lanternReaction = Math.max(0, (this.reactionUntil.lantern - timeSeconds) / 2.6);
    for (const item of this.effects) {
      const { sprite, x, y, phase, scale, radius } = item;
      const visible = x + radius >= view.x && x - radius <= view.right && y + radius >= view.y && y - radius <= view.bottom;
      sprite.setVisible(visible);
      if (!visible) continue;
      if (item.kind === 'current') {
        const p = cycle(time * .22 + phase);
        const reveal = Math.sin(p * Math.PI);
        sprite.setPosition(x + (p - .5) * 27, y + (p - .5) * 9)
          .setRotation(item.rotation).setScale(scale * (.82 + p * .25), scale * .72)
          .setAlpha(.12 + reveal * .58);
      } else if (item.kind === 'smoke') {
        const p = cycle(time * .14 + phase);
        sprite.setPosition(x + p * 26 + Math.sin(time * .7 + phase * TAU) * 5, y - p * 73)
          .setScale(scale * (.43 + p * 1.05), scale * (.54 + p * 1.02))
          .setAlpha(Math.sin(p * Math.PI) * .57);
      } else if (item.kind === 'jet') {
        // The signed x scale creates two curved streams from the painted spout.
        sprite.setScale(scale, Math.abs(scale) * (.96 + Math.sin(time * 4 + phase) * .07) * (1 + fountainReaction * .18))
          .setAlpha(Math.min(1, .54 + Math.sin(time * 5.4 + phase) * .16 + fountainReaction * .25));
      } else if (item.kind === 'ring') {
        const p = cycle(time * .51 + phase);
        sprite.setScale(.22 + p * .78).setAlpha((1 - p) * (.63 + fountainReaction * .3));
      } else if (item.kind === 'splash') {
        const p = cycle(time * 1.24 + phase);
        sprite.setPosition(x + Math.sin(phase * TAU) * p * 4, y - Math.sin(p * Math.PI) * 9)
          .setScale(scale * (1 - p * .4)).setAlpha(Math.sin(p * Math.PI) * .85);
      } else if (item.kind === 'fall') {
        const p = cycle(time * .83 + phase);
        sprite.setPosition(x - p * 9, y + p * 37).setRotation(item.rotation)
          .setScale(scale, scale * 1.05).setAlpha(Math.sin(p * Math.PI) * .7);
      } else if (item.kind === 'fog') {
        sprite.setPosition(x + Math.sin(time * .08 + phase) * 48, y + Math.sin(time * .13 + phase) * 9)
          .setScale(scale * (1.04 + Math.sin(time * .16 + phase) * .07), scale * .78)
          .setAlpha(.33 + Math.sin(time * .17 + phase) * .1);
      } else if (item.kind === 'beam') {
        sprite.setRotation(item.rotation + Math.sin(time * .25) * .18)
          .setAlpha(.26 + Math.pow(Math.max(0, Math.cos(time * .25)), 8) * .16 + lanternReaction * .25);
      } else if (item.kind === 'beacon') {
        sprite.setAlpha(Math.min(1, .44 + Math.pow(Math.max(0, Math.cos(time * .25)), 8) * .4 + lanternReaction * .3))
          .setScale(scale * (.85 + Math.sin(time * .5) * .06));
      } else if (item.kind === 'wheel') {
        // Perspective stays fixed: transform each spoke rather than rotating an
        // elliptical wheel sprite, which would wobble out of its painted axle.
        const angle = phase + time * .31;
        const dx = Math.cos(angle) * 28;
        const dy = Math.sin(angle) * 43;
        sprite.setRotation(Math.atan2(dy, dx)).setDisplaySize(Math.hypot(dx, dy), 2.6).setAlpha(.84);
      } else if (item.kind === 'clock') {
        sprite.setRotation(-Math.PI / 2 + (phase ? .55 + time * .013 : 2.7 + time * .11))
          .setScale(scale, .83).setAlpha(.9);
      } else if (item.kind === 'mechanism') {
        sprite.setAlpha(clockReaction * .54).setScale(scale);
      }
    }
  }

  destroy(): void {
    for (const effect of this.effects) effect.sprite.destroy();
    this.effects = [];
    // Shared canvas textures remain cached for the next map visit.
  }
}
