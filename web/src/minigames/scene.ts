import * as Phaser from 'phaser';
import { installTextureQuality } from '../texture-quality';
import type { GameMechanic } from './types';
import type { SpriteLibrary } from './sprite-library';
import { mechanicStages, minigameBackdrop } from './stages';

export interface MiniGameSceneData { mechanic: GameMechanic; reduced: boolean; sprites?: SpriteLibrary }
const SCENE_KEY = 'lantern-drill';

/** One scene for shared diegetic motion; paper and IME inputs remain native DOM. Restarted for each round. */
export class MiniGameScene extends Phaser.Scene {
  private mechanic: GameMechanic = 'tray';
  private reduced = false;
  private sprites?: SpriteLibrary;
  constructor() { super({ key: SCENE_KEY }); }
  init(data: MiniGameSceneData) {
    this.mechanic = data.mechanic; this.reduced = data.reduced; this.sprites = data.sprites;
  }
  preload() {
    this.sprites?.loadPhaser(this);
    const key = `minigame-stage-${mechanicStages[this.mechanic]}`;
    if (!this.textures.exists(key)) this.load.image(key, minigameBackdrop(this.mechanic));
  }
  create() {
    const key = `minigame-stage-${mechanicStages[this.mechanic]}`;
    this.add.image(480, 270, key).setDisplaySize(960, 540);
    if (!this.reduced) {
      // A second painted exposure breathes gently; the light is already painted into the stage.
      const light = this.add.image(480, 270, key).setDisplaySize(960, 540).setTint(0xffdfa2).setAlpha(.025);
      this.tweens.add({ targets: light, alpha: .09, duration: 4600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const mote = this.sprites?.phaserFrame('prop-lantern-flare');
      if (mote && this.textures.exists(mote.key)) for (let i = 0; i < 8; i++) {
        const dust = this.add.image(80 + i * 103, 95 + (i * 59) % 340, mote.key, mote.frame).setDisplaySize(4, 4).setAlpha(.18);
        this.tweens.add({ targets: dust, x: dust.x + 22, y: dust.y - 28, alpha: .04, duration: 4800 + i * 410, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }
    this.createLampWalk();
  }
  /** The workbench lamp's four painted steps as a Phaser animation, defined once for the game. */
  private createLampWalk(): void {
    if (this.anims.exists('lamp-walk') || !this.sprites) return;
    const frames = [0, 1, 2, 3].map(pose => this.sprites!.phaserFrame(`prop-lamp-walk-${pose}`));
    if (frames.some(frame => !frame || !this.textures.exists(frame.key))) return;
    this.anims.create({ key: 'lamp-walk', frames: frames.map(frame => ({ key: frame!.key, frame: frame!.frame })), frameRate: 1000 / 140, repeat: -1 });
  }
  feedback(correct: boolean, _chain: number) {
    const mark = this.sprites?.phaserFrame(correct ? 'prop-correct-seal' : 'prop-miss-seal');
    if (mark && this.textures.exists(mark.key)) {
      const seal = this.add.image(820, 430, mark.key, mark.frame).setDisplaySize(68, 68).setAngle(-8);
      if (this.reduced) this.time.delayedCall(700, () => seal.destroy());
      else this.tweens.add({ targets: seal, y: 414, alpha: 0, duration: 850, onComplete: () => seal.destroy() });
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
      installTextureQuality(this.game);
      this.game.scene.add(SCENE_KEY, MiniGameScene, false);
    }
    this.game.loop.wake();
    this.game.scale.refresh();
    const owner = ++this.owner;
    const fonts = document.fonts;
    const ready = fonts ? Promise.all([fonts.load('400 20px Fraunces'), fonts.load('400 16px "DM Sans"')]).then(() => fonts.ready) : Promise.resolve();
    void ready.catch(() => undefined).then(() => { if (owner === this.owner && this.element?.isConnected) this.game?.scene.start(SCENE_KEY, data); });
    return owner;
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
    this.owner++;
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
