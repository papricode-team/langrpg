import * as Phaser from 'phaser';
import type { OcclusionCircle } from './world-depth';

const NODE = 'WorldSceneryCutout';
const SHADER = `
#pragma phaserTemplate(shaderName)
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uSourceSize;
uniform vec2 uWorldScale;
uniform vec3 uCircle0;
uniform vec3 uCircle1;
uniform vec3 uCircle2;
uniform vec3 uCircle3;
varying vec2 outTexCoord;
float coverage(vec3 circle) {
  float distance = length((outTexCoord * uSourceSize - circle.xy) * uWorldScale);
  return mix(1.0, 0.25 + 0.75 * smoothstep(40.0, 90.0, distance), circle.z);
}
void main() {
  float alpha = min(min(coverage(uCircle0), coverage(uCircle1)), min(coverage(uCircle2), coverage(uCircle3)));
  gl_FragColor = texture2D(uMainSampler, outTexCoord) * alpha;
}`;

export class SceneryOcclusionController extends Phaser.Filters.Controller {
  circles: readonly OcclusionCircle[] = [];
  constructor(camera: Phaser.Cameras.Scene2D.Camera, public sprite: Phaser.GameObjects.Sprite) {
    super(camera, NODE);
    this.active = false;
  }
  configure(circles: readonly OcclusionCircle[]): void {
    this.circles = circles;
    this.active = circles.length > 0;
  }
}

class SceneryOcclusionNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) { super(NODE, manager, undefined, SHADER); }
  setupUniforms(controller: SceneryOcclusionController): void {
    const sprite = controller.sprite, program = this.programManager;
    program.setUniform('uSourceSize', [sprite.width, sprite.height]);
    program.setUniform('uWorldScale', [Math.abs(sprite.scaleX), Math.abs(sprite.scaleY)]);
    const cosine = Math.cos(sprite.rotation), sine = Math.sin(sprite.rotation);
    for (let index = 0; index < 4; index++) {
      const circle = controller.circles[index];
      if (!circle) { program.setUniform(`uCircle${index}`, [0, 0, 0]); continue; }
      const dx = circle.x - sprite.x, dy = circle.y - sprite.y;
      const x = (cosine * dx + sine * dy) / sprite.scaleX + sprite.width * sprite.originX;
      const y = (-sine * dx + cosine * dy) / sprite.scaleY + sprite.height * sprite.originY;
      // Filter textures use a bottom-left origin; sprite/world coordinates
      // use a top-left origin. Convert the centre, leaving texture sampling intact.
      program.setUniform(`uCircle${index}`, [sprite.flipX ? sprite.width - x : x, sprite.flipY ? y : sprite.height - y, circle.strength]);
    }
  }
}

/** Phaser 4.2 internal filters use native sprite pixels, independent of camera zoom. */
export function createSceneryOcclusion(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite): SceneryOcclusionController | undefined {
  if (scene.game.renderer.type !== Phaser.WEBGL) return;
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderer.renderNodes.getNode(NODE)) renderer.renderNodes.addNodeConstructor(NODE, SceneryOcclusionNode);
  sprite.enableFilters();
  const controller = new SceneryOcclusionController(sprite.filterCamera, sprite);
  sprite.filters?.internal.add(controller);
  return controller;
}
