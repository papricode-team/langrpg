/**
 * Import this module first in a test that runs real Phaser under happy-dom. Phaser probes the
 * 2D canvas when its module loads, and happy-dom has none, so this installs a no-op context.
 * Every drawing call is accepted; image reads return transparent pixels.
 */
function installCanvasStub(): void {
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: (kind: string) => unknown; toDataURL: () => string; __atlasStub?: boolean };
  if (proto.__atlasStub) return;
  const contexts = new WeakMap<object, unknown>();
  proto.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind !== '2d') return null;
    let context = contexts.get(this);
    if (!context) {
      const state: Record<string | symbol, unknown> = { canvas: this, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', imageSmoothingEnabled: true };
      const methods: Record<string, (...args: number[]) => unknown> = {
        getImageData: (_x = 0, _y = 0, w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
        createImageData: (w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
        measureText: () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }),
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createPattern: () => ({setTransform() {}}),
        getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), isPointInPath: () => false,
      };
      context = new Proxy(state, {
        get: (target, key) => key in methods ? methods[key as string] : key in target ? target[key] : () => undefined,
        set: (target, key, value) => { target[key] = value; return true; },
      });
      contexts.set(this, context);
    }
    return context;
  };
  proto.toDataURL = () => 'data:image/png;base64,';
  proto.__atlasStub = true;
  const host = globalThis as unknown as Record<string, unknown>;
  host.CanvasRenderingContext2D ??= class CanvasRenderingContext2D {};
}
installCanvasStub();
export {};
