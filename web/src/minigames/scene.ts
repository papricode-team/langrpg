import * as Phaser from 'phaser';
import type { GameMechanic } from './types';
import type { SpriteLibrary } from './sprite-library';

export interface MiniGameSceneData { mechanic: GameMechanic; reduced: boolean; sprites?: SpriteLibrary }
const SCENE_KEY = 'lantern-drill';

/** One scene for shared diegetic motion; paper and IME inputs remain native DOM. Restarted for each round. */
export class MiniGameScene extends Phaser.Scene {
  private mechanic: GameMechanic = 'tray';
  private reduced = false;
  private sprites?: SpriteLibrary;
  private lamps: Phaser.GameObjects.Arc[] = [];
  private beam?: Phaser.GameObjects.Rectangle;
  private clock?: Phaser.GameObjects.Line;
  private reel?: Phaser.GameObjects.Container;
  constructor() { super({ key: SCENE_KEY }); }
  init(data: MiniGameSceneData) {
    this.mechanic = data.mechanic; this.reduced = data.reduced; this.sprites = data.sprites;
    this.lamps = []; this.beam = undefined; this.clock = undefined; this.reel = undefined;
  }
  preload() { this.sprites?.loadPhaser(this); }
  create() {
    const g = this.add.graphics(); g.fillStyle(0x102b28, .54); g.fillRect(0, 0, 960, 540);
    g.lineStyle(2, 0xd0aa60, .5); g.strokeRoundedRect(18, 18, 924, 504, 22);
    for (let i = 0; i < 12; i++) {
      const x = 60 + i * 76; g.lineStyle(1, 0xd0aa60, .4); g.lineBetween(x, 20, x, 62);
      const lamp = this.add.circle(x, 75, 10, 0xe9c471, .12); this.lamps.push(lamp);
      if (!this.reduced) this.tweens.add({ targets: lamp, alpha: .4, duration: 1600 + i * 90, yoyo: true, repeat: -1 });
    }
    if (['sequence', 'board', 'connection'].includes(this.mechanic)) {
      g.lineStyle(3, 0xd0aa60, .4); g.strokeCircle(480, 275, 125);
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.lineBetween(480 + Math.sin(a) * 110, 275 - Math.cos(a) * 110, 480 + Math.sin(a) * 122, 275 - Math.cos(a) * 122); }
      this.clock = this.add.line(480, 275, 0, 0, 0, -95, 0xe9c471, .55).setOrigin(0);
    }
    if (this.mechanic === 'council') { this.beam = this.add.rectangle(480, 180, 850, 310, 0xe9cb7d, .05); }
    if (this.mechanic === 'tape') {
      this.reel = this.add.container(480, 245);
      for (const x of [-75, 75]) { const circle = this.add.circle(x, 0, 52, 0x826e47, .2).setStrokeStyle(3, 0xd0aa60, .5); this.reel.add(circle); for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; this.reel.add(this.add.circle(x + Math.cos(a) * 29, Math.sin(a) * 29, 10, 0x102b28)); } }
      if (!this.reduced) this.tweens.add({ targets: this.reel, angle: 360, duration: 16000, repeat: -1 });
    }
    if (['tray', 'workbench', 'garden', 'sort', 'archive', 'stamp', 'catch'].includes(this.mechanic)) {
      g.fillStyle(0x342a1c, .45); g.fillRoundedRect(95, 355, 770, 105, 16); g.lineStyle(2, 0xd0aa60, .5); g.strokeRoundedRect(95, 355, 770, 105, 16);
    }
    const prop = ({ ink: 'prop-quill', pictures: 'prop-lantern-off', tray: 'prop-bell', catch: 'prop-crate', stamp: 'prop-stamp', sort: 'prop-chute', chain: 'prop-lantern-lit', tape: 'prop-tape-reel' } as Partial<Record<GameMechanic, string>>)[this.mechanic];
    const frame = prop && this.sprites?.phaserFrame(prop);
    if (frame && this.textures.exists(frame.key)) this.add.image(845, 435, frame.key, frame.frame).setDisplaySize(86, 86).setAlpha(.65);
    this.createLampWalk();
  }
  /** The workbench lamp's four painted steps as a Phaser animation, defined once for the game. */
  private createLampWalk(): void {
    if (this.anims.exists('lamp-walk') || !this.sprites) return;
    const frames = [0, 1, 2, 3].map(pose => this.sprites!.phaserFrame(`prop-lamp-walk-${pose}`));
    if (frames.some(frame => !frame || !this.textures.exists(frame.key))) return;
    this.anims.create({ key: 'lamp-walk', frames: frames.map(frame => ({ key: frame!.key, frame: frame!.frame })), frameRate: 1000 / 140, repeat: -1 });
  }
  feedback(correct: boolean, chain: number) {
    const lamp = this.lamps[(Math.max(1, chain) - 1) % this.lamps.length]; lamp?.setFillStyle(correct ? 0xffdb81 : 0xae6356, .9);
    if (lamp && !this.reduced) this.tweens.add({ targets: lamp, scale: 1.6, duration: 180, yoyo: true });
    this.beam?.setAlpha(correct ? Math.max(.02, .25 - chain * .025) : .3);
    if (this.clock) this.tweens.add({ targets: this.clock, angle: `+=${correct ? 30 : -15}`, duration: this.reduced ? 1 : 220, ease: 'Back.easeOut' });
    if (this.mechanic === 'stamp' && correct) {
      const stamp = this.add.text(480, 340, 'GENEHMIGT', { fontFamily: 'Georgia,serif', fontSize: '28px', color: '#dfbf7a', stroke: '#12332b', strokeThickness: 3 }).setOrigin(.5).setAngle(-12);
      this.tweens.add({ targets: stamp, scale: 1.12, alpha: 0, duration: this.reduced ? 1 : 700, onComplete: () => stamp.destroy() });
    }
    if (this.mechanic === 'workbench' && correct && this.anims.exists('lamp-walk')) {
      const first = this.sprites!.phaserFrame('prop-lamp-walk-0')!;
      const walker = this.add.sprite(450, 395, first.key, first.frame).setDisplaySize(110, 110);
      if (!this.reduced) walker.play('lamp-walk');
      this.tweens.add({ targets: walker, x: 760, alpha: 0, duration: this.reduced ? 1 : 1700, onComplete: () => walker.destroy() });
    }
  }
}

/**
 * One Phaser game serves every round: its canvas lives in a stage element that moves into each round's slot,
 * so rounds reuse a single WebGL context instead of creating and discarding one each time.
 */
class MiniGameStage {
  private game?: Phaser.Game;
  private element?: HTMLElement;
  private owner = 0;
  mount(root: HTMLElement, data: MiniGameSceneData): number {
    this.element ??= Object.assign(document.createElement('div'), { className: 'minigame-stage' });
    this.element.style.cssText = 'position:absolute;inset:0;';
    root.append(this.element);
    if (!this.game) {
      this.game = new Phaser.Game({ type: Phaser.AUTO, parent: this.element, width: 960, height: 540, transparent: true, audio: { noAudio: true },
        scene: [], scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true }, banner: false });
      this.game.scene.add(SCENE_KEY, MiniGameScene, false);
    }
    this.game.loop.wake();
    this.game.scale.refresh();
    this.game.scene.start(SCENE_KEY, data);
    return ++this.owner;
  }
  scene(owner: number): MiniGameScene | undefined {
    if (owner !== this.owner || !this.game) return undefined;
    const scene = this.game.scene.getScene(SCENE_KEY) as MiniGameScene | null;
    return scene?.sys.isActive() || scene?.sys.isPaused() ? scene : undefined;
  }
  pause(owner: number) { if (owner === this.owner && this.game?.scene.isActive(SCENE_KEY)) this.game.scene.pause(SCENE_KEY); }
  resume(owner: number) { if (owner === this.owner && this.game?.scene.isPaused(SCENE_KEY)) this.game.scene.resume(SCENE_KEY); }
  /** Run `callback` after every step of the shared mini-game loop while `owner` holds the stage. */
  onFrame(owner: number, callback: (now: number) => void): () => void {
    const game = this.game;
    if (!game) return () => undefined;
    const handler = () => { if (owner === this.owner) callback(performance.now()); };
    game.events.on(Phaser.Core.Events.POST_STEP, handler);
    return () => { game.events.off(Phaser.Core.Events.POST_STEP, handler); };
  }
  unmount(owner: number) {
    if (owner !== this.owner || !this.game) return;
    this.game.scene.stop(SCENE_KEY);
    this.game.loop.sleep();
    this.element?.remove();
  }
}
const stage = new MiniGameStage();

export function mountMiniGameScene(root: HTMLElement, mechanic: GameMechanic, reduced: boolean, sprites?: SpriteLibrary) {
  const owner = stage.mount(root, { mechanic, reduced, sprites });
  return {
    feedback: (correct: boolean, chain: number) => stage.scene(owner)?.feedback(correct, chain),
    pause: () => stage.pause(owner),
    resume: () => stage.resume(owner),
    destroy: () => stage.unmount(owner),
    /** Subscribe to the shared loop; the round clock uses this instead of its own requestAnimationFrame. */
    onFrame: (callback: (now: number) => void) => stage.onFrame(owner, callback),
  };
}
