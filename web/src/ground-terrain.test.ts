// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { afterEach, describe, expect, it } from 'vitest';
import * as Phaser from 'phaser';
import { phaserHarness, trackGame, type PhaserHarness } from './test-support/phaser-harness';
import { GroundTerrain } from './ground-terrain';
import { getWorldScene } from './scene-data';
import { paintGround } from './ground';

let harness: PhaserHarness | undefined;
afterEach(() => { harness?.restore(); harness = undefined; });

describe('ground without WebGL', () => {
  it('shows the blended material colours and follows painting, tint and fades', async () => {
    harness = phaserHarness();
    const scene = new Phaser.Scene({ key: 'ground' });
    const game = trackGame(new Phaser.Game({ type: Phaser.CANVAS, width: 300, height: 200, scene: [scene], banner: false, audio: { noAudio: true } }));
    if (!game.isBooted) await new Promise<void>(resolve => game.events.once(Phaser.Core.Events.READY, () => resolve()));
    game.loop.stop();
    harness.step(2);
    const world = getWorldScene('waldruh'), ground = new GroundTerrain(scene, world);
    const flat = (ground as unknown as { flat: Phaser.GameObjects.Image }).flat;
    expect(ground.ready).toBe(true);
    expect(flat.displayWidth).toBe(world.width + world.ground.cell);
    ground.setTint(0x808080).setAlpha(.5).setDepth(-5);
    expect(flat.alpha).toBe(.5);
    expect(flat.depth).toBe(-5);
    const painted = paintGround(world.ground, world.width, world.height, {material: 'moss', radius: 60, strength: 1, points: [[400, 400]]});
    ground.setWorld({...world, ground: painted});
    expect((ground as unknown as { flat: Phaser.GameObjects.Image }).flat).toBe(flat);
    ground.destroy();
    expect(flat.active).toBe(false);
  });
});
