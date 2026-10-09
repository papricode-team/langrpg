export const suggestedNames = ['Willow', 'Ember', 'Juniper', 'Robin', 'Maple', 'Finch'];
export function nameSuggestions(): string[] {
  const names = [...suggestedNames];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names.slice(0, 4);
}
export const ACCOUNT_REMINDER_MS = 5 * 60 * 1000;

/** Count visible play across reloads, scoped to the current player. */
export class AccountReminder {
  private played = 0;
  private shown = false;
  private previous?: number;
  private wasActive = false;
  private readonly key: string;
  constructor(playerId: string, private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.key = `atlas.accountReminder.${playerId}`;
    try {
      const saved = JSON.parse(storage.getItem(this.key) ?? '{}');
      if (typeof saved.played === 'number' && Number.isFinite(saved.played)) this.played = Math.max(0, saved.played);
      this.shown = saved.shown === true;
    } catch { /* A corrupt or unavailable save cannot prevent play. */ }
  }
  tick(now: number, active: boolean): boolean {
    if (this.previous !== undefined && this.wasActive) this.played += Math.max(0, Math.min(now - this.previous, 2000));
    this.previous = now;
    this.wasActive = active;
    this.save();
    return this.due;
  }
  get due(): boolean { return this.played >= ACCOUNT_REMINDER_MS && !this.shown; }
  markShown(): void { this.shown = true; this.save(); }
  private save(): void {
    try { this.storage.setItem(this.key, JSON.stringify({ played: this.played, shown: this.shown })); }
    catch { /* The reminder still works for this visit without browser storage. */ }
  }
}
