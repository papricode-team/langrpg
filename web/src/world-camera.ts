/** Physical canvas pixels are distinct from CSS pixels, including pointer scale. */
export function canvasSize(width: number, height: number, ratio = 1) {
  const density = Math.max(1, Math.min(2, Number.isFinite(ratio) ? ratio : 1));
  return { width: Math.max(1, Math.round(width * density)), height: Math.max(1, Math.round(height * density)), density };
}

export function explorationZoom(width: number, height: number, density = 1, indoor = false, indoorCharacterHeight = 132, bounds = {width:1536,height:1024}) {
  const cssWidth = width / density, cssHeight = height / density;
  const mobile = cssWidth < 760 || cssWidth < 1000 && cssHeight < 520;
  const personHeight = Math.max(mobile ? 88 : 110, Math.min(indoor ? 180 : 162, cssHeight * .15)) * .8;
  // Use each painting's adult height so room proportions and camera framing agree.
  return { zoom: Math.max(width / bounds.width, height / bounds.height, personHeight / (indoor ? indoorCharacterHeight : 72) * density), mobile };
}

/** Conversation framing follows the same comfortable exploration scale. */
export function conversationZoom(baseZoom: number, talking: boolean) {
  return baseZoom * (talking ? 1.12 : 1);
}

/** Critically damped approach (Game Programming Gems 4): velocity stays continuous, so starts and stops ease. */
export function smoothDamp(current: number, target: number, velocity: number, smoothTime: number, seconds: number): [number, number] {
  if (seconds <= 0) return [current, velocity];
  const omega = 2 / Math.max(1e-4, smoothTime), x = omega * seconds;
  const decay = 1 / (1 + x + .48 * x * x + .235 * x * x * x);
  const change = current - target, carry = (velocity + omega * change) * seconds;
  return [target + (change + carry) * decay, (velocity - omega * carry) * decay];
}

export type CameraGoal = { x: number; y: number; zoom: number; deadzone?: { width: number; height: number }; settle: number };
type Size = { width: number; height: number };

/**
 * Owns the exploration camera's centre and zoom. A soft dead zone holds the view
 * still for small steps; outside it the centre springs toward the zone's edge,
 * and the state is clamped to the map so it never winds up past an edge.
 */
export class CameraRig {
  x = 0; y = 0; zoom = 1;
  private vx = 0; private vy = 0;

  /** `screen` is the camera's size in canvas pixels; the visible world span follows the rig's zoom. */
  snap(goal: CameraGoal, screen: Size, world: Size): this {
    this.zoom = goal.zoom; this.vx = 0; this.vy = 0;
    this.x = goal.x; this.y = goal.y;
    return this.clamp(screen, world);
  }

  step(goal: CameraGoal, seconds: number, screen: Size, world: Size): this {
    this.zoom *= Math.pow(goal.zoom / this.zoom, 1 - Math.exp(-2.5 * seconds));
    const half = goal.deadzone;
    const aimX = half ? edge(this.x, goal.x, half.width / 2) : goal.x;
    const aimY = half ? edge(this.y, goal.y, half.height / 2) : goal.y;
    [this.x, this.vx] = smoothDamp(this.x, aimX, this.vx, goal.settle, seconds);
    [this.y, this.vy] = smoothDamp(this.y, aimY, this.vy, goal.settle, seconds);
    return this.clamp(screen, world);
  }

  private clamp(screen: Size, world: Size): this {
    const view = { width: screen.width / this.zoom, height: screen.height / this.zoom };
    const fit = (value: number, velocity: number, span: number, size: number): [number, number] => {
      if (span >= size) return [size / 2, 0];
      const low = span / 2, high = size - span / 2;
      if (value < low) return [low, Math.max(0, velocity)];
      if (value > high) return [high, Math.min(0, velocity)];
      return [value, velocity];
    };
    [this.x, this.vx] = fit(this.x, this.vx, view.width, world.width);
    [this.y, this.vy] = fit(this.y, this.vy, view.height, world.height);
    return this;
  }
}

/** Inside the zone the aim is the current centre; beyond it, the zone edge that just contains the goal. */
function edge(current: number, goal: number, half: number): number {
  const offset = goal - current;
  return Math.abs(offset) <= half ? current : goal - Math.sign(offset) * half;
}
