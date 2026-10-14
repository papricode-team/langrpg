export type AccessPhase = 'guest' | 'trial' | 'login_required' | 'payment_required' | 'paid';
export type BillingPlan = 'monthly' | 'lifetime';
export interface GameAccess {
  phase: AccessPhase;
  remainingSeconds: number;
  playedSeconds: number;
  registered: boolean;
  billingAvailable: boolean;
  plan?: BillingPlan;
}

export function accessBlocked(access: GameAccess | undefined): boolean {
  return !access || access.phase === 'login_required' || access.phase === 'payment_required';
}

/** Interpolate a server-issued allowance only while the game is active. */
export class AccessClock {
  private value?: GameAccess;
  private previous = 0;
  private active = false;

  update(value: GameAccess, now: number): void {
    this.value = { ...value, remainingSeconds: Math.max(0, value.remainingSeconds), playedSeconds: Math.max(0, value.playedSeconds) };
    this.previous = now;
  }
  setActive(active: boolean, now: number): void {
    this.value = this.snapshot(now);
    this.previous = now;
    this.active = active;
  }
  snapshot(now: number): GameAccess | undefined {
    if (!this.value) return undefined;
    const value = { ...this.value };
    if (!this.active || value.phase === 'paid' || accessBlocked(value)) return value;
    const elapsed = Math.max(0, now - this.previous) / 1000;
    value.playedSeconds += Math.min(elapsed, value.remainingSeconds);
    value.remainingSeconds = Math.max(0, value.remainingSeconds - elapsed);
    if (value.remainingSeconds === 0) value.phase = value.registered ? 'payment_required' : 'login_required';
    return value;
  }
}

export function formatAccessTime(seconds: number): string {
  const remaining = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
}

/** Hosted billing links must be HTTPS; never execute a returned URL as script. */
export function billingURL(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The payment link is unavailable. Please try again.');
  return url.href;
}

/** Clear browser-only game progress after the server has reset this character. */
export function clearGameProgress(storage: Pick<Storage, 'length' | 'key' | 'removeItem' | 'setItem'>, playerId: string, playerName: string): void {
  const exact = new Set(['atlas.placement', `atlas.accountReminder.${playerId}`, `atlas.acts.${playerId}`, `atlas.objects.${playerId}`]);
  const prefixes = [
    `atlas.sceneHinted.${playerId}.`,
    `atlas.activity.v1:${playerId}:`,
    `atlas.minigame.chain:${playerId}:`,
    `lantern-story-ledger:${playerId}:`,
    `lantern-story-ledger:${playerName}:`,
    // Expedition drafts predate account scoping and belong to this browser.
    'atlas.expedition.plan.v1.',
  ];
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key && (exact.has(key) || prefixes.some(prefix => key.startsWith(prefix)))) storage.removeItem(key);
  }
  storage.setItem('atlas.map', 'lindenhafen');
  storage.setItem('atlas.level', 'A1');
}
