import { vi } from 'vitest';

/** Ground images are separate from the painted sprites in scenery fixtures. */
export function foundationScene() {
  class Image {
    visible = true; alpha = 1; tint = 0xffffff; depth = 0; scale = 1; destroyed = false; blendMode = '';
    constructor(public x: number, public y: number, public key: string, public frame: string) {}
    setOrigin() { return this; }
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    setScale(scale: number) { this.scale = scale; return this; }
    setDepth(depth: number) { this.depth = depth; return this; }
    setBlendMode(mode: string) { this.blendMode = mode; return this; }
    setVisible(visible: boolean) { this.visible = visible; return this; }
    setAlpha(alpha: number) { this.alpha = alpha; return this; }
    setTint(tint: number) { this.tint = tint; return this; }
    destroy() { this.destroyed = true; }
  }
  const images: Image[] = [];
  const createCanvas = vi.fn((key: string, width: number, height: number) => ({ key, width, height,
    context: { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), stroke: vi.fn(), fill: vi.fn(), fillRect: vi.fn(),
      ellipse: vi.fn(), quadraticCurveTo: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })) },
    add: vi.fn(), refresh: vi.fn(),
  }));
  const image = (x: number, y: number, key: string, frame: string) => {
    const result = new Image(x, y, key, frame); images.push(result); return result;
  };
  return { images, image, createCanvas, remove: vi.fn() };
}
