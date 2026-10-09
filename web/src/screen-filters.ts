import * as Phaser from 'phaser';
import { normalizeScreenFilterSettings, screenFilterActive, type ScreenFilterSettings } from './screen-filter-settings';

const FILTER_NODE = 'LanternScreenFilter';

// A single camera pass gives differently scaled assets the same screen texture.
// Coordinates stay unchanged so taps and character/object hit areas still line up.
const FRAGMENT_SHADER = `
#pragma phaserTemplate(shaderName)
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uSoftness;
uniform float uScanlines;
uniform float uGrain;
uniform float uWarmth;
uniform float uVignette;
uniform float uPixelSize;
varying vec2 outTexCoord;

vec4 sampleWorld(vec2 uv) {
    vec2 edge = 0.5 / uResolution;
    return texture2D(uMainSampler, clamp(uv, edge, 1.0 - edge));
}

void main() {
    vec2 screen = outTexCoord * uResolution;
    vec2 uv = outTexCoord;
    if (uPixelSize > 1.01) {
        uv = (floor(screen / uPixelSize) + 0.5) * uPixelSize / uResolution;
    }
    vec4 color = sampleWorld(uv);
    if (uSoftness > 0.001) {
        vec2 d = vec2(uSoftness * 1.5) / uResolution;
        color = color * 0.25;
        color += sampleWorld(uv + vec2(d.x, 0.0)) * 0.125;
        color += sampleWorld(uv - vec2(d.x, 0.0)) * 0.125;
        color += sampleWorld(uv + vec2(0.0, d.y)) * 0.125;
        color += sampleWorld(uv - vec2(0.0, d.y)) * 0.125;
        color += sampleWorld(uv + d) * 0.0625;
        color += sampleWorld(uv - d) * 0.0625;
        color += sampleWorld(uv + vec2(d.x, -d.y)) * 0.0625;
        color += sampleWorld(uv + vec2(-d.x, d.y)) * 0.0625;
    }

    color.rgb *= vec3(1.0 + 0.08 * uWarmth, 1.0 + 0.015 * uWarmth, 1.0 - 0.09 * uWarmth);

    // Static screen-space scanlines and a faint phosphor mask; no flashing.
    float line = 0.5 + 0.5 * cos(mod(screen.y, 3.0) * 2.0943951);
    color.rgb *= 1.0 - line * uScanlines * 0.5;
    float column = mod(floor(screen.x), 3.0);
    vec3 mask = vec3(column < 1.0 ? 1.0 : 0.0, column >= 1.0 && column < 2.0 ? 1.0 : 0.0, column >= 2.0 ? 1.0 : 0.0);
    color.rgb *= vec3(1.0) - (vec3(1.0) - mask) * uScanlines * 0.12;
    color.rgb *= 1.0 + uScanlines * 0.12;

    // Keep hash inputs small enough for mobile mediump fragment precision.
    vec2 noiseCell = mod(floor(screen), 128.0);
    vec3 noiseHash = fract(vec3(noiseCell.xyx) * vec3(0.1031, 0.1030, 0.0973));
    noiseHash = fract(noiseHash + dot(noiseHash, noiseHash.yzx + 3.17));
    float noise = fract((noiseHash.x + noiseHash.y) * noiseHash.z * 13.0) - 0.5;
    color.rgb += noise * uGrain * 0.065 * color.a;
    float edgeShade = smoothstep(0.18, 0.72, length(outTexCoord - 0.5));
    color.rgb *= 1.0 - edgeShade * uVignette * 0.28;
    gl_FragColor = vec4(clamp(color.rgb, 0.0, color.a), color.a);
}
`;

export class ScreenFilterController extends Phaser.Filters.Controller {
  settings = normalizeScreenFilterSettings(undefined);

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, FILTER_NODE);
    this.active = false;
  }

  configure(settings: ScreenFilterSettings): void {
    this.settings = normalizeScreenFilterSettings(settings);
    this.active = screenFilterActive(this.settings);
  }
}

class ScreenFilterNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(FILTER_NODE, manager, undefined, FRAGMENT_SHADER);
  }

  setupUniforms(controller: ScreenFilterController, drawingContext: Phaser.Renderer.WebGL.DrawingContext): void {
    const settings = controller.settings;
    const program = this.programManager;
    program.setUniform('uResolution', [drawingContext.width, drawingContext.height]);
    program.setUniform('uSoftness', settings.softness / 100);
    program.setUniform('uScanlines', settings.scanlines / 100);
    program.setUniform('uGrain', settings.grain / 100);
    program.setUniform('uWarmth', settings.warmth / 100);
    program.setUniform('uVignette', settings.vignette / 100);
    program.setUniform('uPixelSize', settings.pixelSize);
  }
}

/** Canvas fallback keeps the unfiltered world; WebGL owns and cleans up the node. */
export function createScreenFilter(scene: Phaser.Scene): ScreenFilterController | undefined {
  if (scene.game.renderer.type !== Phaser.WEBGL) return;
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderer.renderNodes.getNode(FILTER_NODE)) {
    renderer.renderNodes.addNodeConstructor(FILTER_NODE, ScreenFilterNode);
  }
  const controller = new ScreenFilterController(scene.cameras.main);
  scene.cameras.main.filters.internal.add(controller);
  return controller;
}
