import type * as Phaser from 'phaser';
import { getSceneryGeometry, sceneEntrancePoint, type SceneScenery, type WorldScene } from './scene-schema';
import { depthAt } from './world-depth';

export interface BuildingDoorGeometry {
  width: number;
  height: number;
  depth: number;
  /** Building hover bounds relative to the doorway sill. */
  hit: { x: number; y: number; width: number; height: number };
}

/** A room assignment is enough: the artwork supplies the door and building bounds. */
export function buildingDoorGeometry(scene: WorldScene, owner: SceneScenery): BuildingDoorGeometry | undefined {
  const geometry = getSceneryGeometry(scene.id, owner), door = geometry?.door;
  if (!owner.interior || !geometry || !door) return undefined;
  const scale = owner.width / geometry.referenceWidth, sill = sceneEntrancePoint(scene, owner);
  const bounds = geometry.visualBounds ?? { left: -geometry.referenceWidth / 2, right: geometry.referenceWidth / 2, top: door.y, bottom: door.y + door.height };
  return {
    width: door.width * scale, height: door.height * scale,
    depth: Math.max(sill.y, owner.depth ?? depthAt(owner, sill.x, geometry)),
    hit: {
      x: ((bounds.left + bounds.right) / 2 - door.x - door.width / 2) * scale * (owner.flipX ? -1 : 1),
      y: ((bounds.top + bounds.bottom) / 2 - door.y - door.height) * scale,
      width: (bounds.right - bounds.left) * scale, height: (bounds.bottom - bounds.top) * scale,
    },
  };
}

const glowKey = 'building-door-glow';

/** One small shared light texture; no building-specific art or looping tweens. */
export class BuildingDoorEffect {
  readonly root: Phaser.GameObjects.Container;
  private glow: Phaser.GameObjects.Image;
  private sparks: Phaser.GameObjects.Graphics;
  private strength = 0;

  constructor(scene: Phaser.Scene, private geometry: BuildingDoorGeometry) {
    if (!scene.textures.exists(glowKey)) {
      const texture = scene.textures.createCanvas(glowKey, 128, 128)!;
      const context = texture.context, gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(223,255,229,0.5)');
      gradient.addColorStop(.35, 'rgba(116,236,205,0.3)');
      gradient.addColorStop(.7, 'rgba(102,187,228,0.12)');
      gradient.addColorStop(1, 'rgba(102,187,228,0)');
      context.fillStyle = gradient; context.fillRect(0, 0, 128, 128); texture.refresh();
    }
    this.glow = scene.add.image(0, -geometry.height / 2, glowKey)
      .setDisplaySize(geometry.width * 1.8, geometry.height * 1.35).setBlendMode('ADD');
    this.sparks = scene.add.graphics().setBlendMode('ADD');
    this.root = scene.add.container(0, 0, [this.glow, this.sparks]).setAlpha(0).setVisible(false);
  }

  update(active: boolean, seconds: number, time: number, reducedMotion: boolean): void {
    this.strength = reducedMotion ? Number(active) : Math.max(0, Math.min(1, this.strength + seconds * (active ? 4 : -3)));
    this.root.setVisible(this.strength > 0).setAlpha(this.strength);
    if (!this.strength) return;
    const t = reducedMotion ? 0 : time, { width: w, height: h } = this.geometry;
    this.glow.setAlpha(.72 + Math.sin(t * 2) * .15);
    const ink = this.sparks.clear();
    // Light climbs the jambs and curls over the lintel, leaving the painted opening visible.
    for (let i = 0; i < 18; i++) {
      const progress = (i / 18 + t * .12) % 1;
      const angle = Math.PI * progress;
      const x = -Math.cos(angle) * w * (.49 + Math.sin(t * 1.4 + i) * .035);
      const y = -Math.sin(angle) * h;
      const shimmer = .35 + .65 * Math.pow(Math.sin(i * 2.4 + t * 2), 2);
      const radius = Math.max(.7, w * .017) * shimmer;
      ink.fillStyle(0x8de9d3, .13 * shimmer).fillCircle(x, y, radius * 4);
      ink.fillStyle(i % 3 ? 0xc2fff0 : 0xffe8ad, .85 * shimmer).fillCircle(x, y, radius);
      if (i % 4 === 0) {
        ink.lineStyle(Math.max(.5, w * .008), 0xfff4d5, .6 * shimmer);
        ink.lineBetween(x - radius * 2.6, y, x + radius * 2.6, y);
        ink.lineBetween(x, y - radius * 3.5, x, y + radius * 3.5);
      }
    }
    for (let i = 0; i < 7; i++) {
      const rise = (i / 7 + t * .16) % 1;
      const x = Math.sin(i * 7.3 + t * .6) * w * .36, y = -h * rise;
      ink.fillStyle(0xffebbc, Math.sin(rise * Math.PI) * .65).fillCircle(x, y, Math.max(.6, w * .012));
    }
  }
}
