import type { Progress } from './api';
import { escapeHtml as e } from './icons';
import { t } from './i18n';
import { emptyMechanics, inkActive, inkAtObject, inkLevel, inkSpeakMarkup, lostStoryNames, personalName, storyMarks, ticketMarkup, type InkEntry, type StoryMarks, type StoryMechanics } from './story-mechanics';
import { carriesLamp } from './story-items';

export interface MechanicsResult { progress: Progress; correct?: boolean; xpAdded?: number }
export interface StoryMechanicsUiOptions {
  request<T>(path: string, body: unknown): Promise<T>;
  progress(): Progress;
  mapId(): string;
  playerName(): string;
  setMarks(marks: StoryMarks): void;
  lampStrength(): number;
  acceptProgress(progress: Progress): void;
  openDialog(html: string, className: string): void;
  closeDialog(): void;
  toast(message: string, bad?: boolean): void;
  cue(correct: boolean): void;
  soundAllowed(): boolean;
  /** Called after each refresh so the HUD can show a fading name of the player's own. */
  onTick?(): void;
}

/**
 * Owns the client side of the Atlas's rule: it keeps the world's fading names
 * current between saves, runs the "say it aloud" dialogs, the lamp's lean and
 * hum, and the bell's cracks.
 */
export class StoryMechanicsUi {
  mechanics: StoryMechanics = emptyMechanics();
  private syncedAt = performance.now();
  private timer?: ReturnType<typeof setInterval>;
  private lampTimer?: ReturnType<typeof setInterval>;
  private hum?: { context: AudioContext; oscillator: OscillatorNode; gain: GainNode };
  private busy = false;
  private meter?: HTMLElement;

  constructor(private options: StoryMechanicsUiOptions) {}

  setMechanics(value: StoryMechanics | undefined): void {
    if (!value) return;
    this.mechanics = { ink: { ...emptyMechanics().ink, ...value.ink, entries: value.ink?.entries ?? [] }, sideQuests: value.sideQuests ?? [] };
    this.push();
  }

  /** Seconds of visible play since the server last counted them. */
  private extraSeconds(): number {
    if (typeof document !== 'undefined' && document.hidden) return 0;
    return Math.min(120, (performance.now() - this.syncedAt) / 1000);
  }

  progressChanged(): void { this.syncedAt = performance.now(); this.push(); }

  push(): void {
    this.options.setMarks(storyMarks(this.options.mapId(), this.options.progress(), this.mechanics, this.options.playerName(), this.extraSeconds()));
    this.options.onTick?.();
  }

  /** The player's own name, when it has paled enough to need saying. */
  fadingOwnName(): InkEntry | undefined {
    const progress = this.options.progress();
    return this.mechanics.ink.entries.find(entry => entry.kind === 'hud' && inkActive(entry, progress) && inkLevel(entry, progress, this.mechanics.ink, this.extraSeconds()) < this.mechanics.ink.paleBelow);
  }

  start(hud: HTMLElement): void {
    this.stop();
    this.meter = document.createElement('div');
    this.meter.className = 'lamp-meter';
    this.meter.hidden = true;
    this.meter.setAttribute('role', 'meter');
    this.meter.setAttribute('aria-valuemin', '0');
    this.meter.setAttribute('aria-valuemax', '100');
    this.meter.setAttribute('aria-label', t('The lamp leans toward a fading name'));
    this.meter.innerHTML = `<img class="lamp-meter-art" src="/assets/ui/lantern-meter-v1.webp" width="80" height="160" alt="" aria-hidden="true" draggable="false"/><span class="lamp-meter-readout" aria-hidden="true"><span class="lamp-meter-label">${e(t('Fading names'))}</span><span class="lamp-meter-bar"><span></span></span><span class="lamp-meter-scale"></span></span>`;
    hud.append(this.meter);
    this.timer = setInterval(() => this.push(), 4000);
    this.lampTimer = setInterval(() => this.updateLamp(), 250);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.lampTimer) clearInterval(this.lampTimer);
    this.meter?.remove();
    this.meter = undefined;
    this.silence();
  }

  private updateLamp(): void {
    const carried = carriesLamp(this.options.progress().story?.inventory);
    const strength = carried ? this.options.lampStrength() : 0;
    if (this.meter) {
      this.meter.hidden = !carried;
      this.meter.style.setProperty('--lamp', strength.toFixed(2));
      this.meter.setAttribute('aria-valuenow', String(Math.round(strength * 100)));
      this.meter.classList.toggle('leaning', strength > .45);
    }
    this.setHum(strength);
  }

  private setHum(strength: number): void {
    if (!this.options.soundAllowed() || strength < .15) { if (this.hum) this.hum.gain.gain.setTargetAtTime(0, this.hum.context.currentTime, .2); return; }
    try {
      if (!this.hum) {
        const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = 196; gain.gain.value = 0;
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start();
        this.hum = { context, oscillator, gain };
      }
      void this.hum.context.resume();
      this.hum.oscillator.frequency.setTargetAtTime(170 + 90 * strength, this.hum.context.currentTime, .3);
      this.hum.gain.gain.setTargetAtTime(.018 * strength, this.hum.context.currentTime, .3);
    } catch { this.hum = undefined; }
  }

  private silence(): void {
    if (!this.hum) return;
    try { this.hum.oscillator.stop(); void this.hum.context.close(); } catch { /* already closed */ }
    this.hum = undefined;
  }

  /** Extra panel for an evidence object that carries a fading name. */
  objectPanel(objectId: string): string {
    return inkSpeakMarkup(inkAtObject(objectId, this.options.progress(), this.mechanics), this.options.progress(), this.mechanics, this.options.playerName());
  }

  /** Handles `ink:<entry>` and `side:<ticket>` world markers. */
  open(id: string): boolean {
    if (id.startsWith('ink:')) {
      const entry = this.mechanics.ink.entries.find(item => item.id === id.slice(4));
      if (!entry) return false;
      this.options.openDialog(`<div class="object-encounter ink-encounter"><h2>${e(inkTitle(entry))}</h2>${inkSpeakMarkup([entry], this.options.progress(), this.mechanics, this.options.playerName())}</div>`, 'object-dialog');
      return true;
    }
    if (id.startsWith('side:')) {
      const side = this.mechanics.sideQuests.find(item => item.id === id.slice(5));
      if (!side) return false;
      this.options.openDialog(ticketMarkup(side), 'object-dialog ticket-dialog');
      return true;
    }
    return false;
  }

  /** The player's own name on the ticket fades too; the HUD offers to say it. */
  ticketNamePanel(): string {
    const entry = this.mechanics.ink.entries.find(item => item.kind === 'hud');
    if (!entry) return '';
    return inkSpeakMarkup([entry], this.options.progress(), this.mechanics, this.options.playerName());
  }

  lostNames(): InkEntry[] { return lostStoryNames(this.options.progress(), this.mechanics, this.extraSeconds()); }

  /** Delegated submit handler for both dialogs. Returns true when it handled the event. */
  async submit(form: HTMLFormElement): Promise<boolean> {
    const inkId = form.dataset.inkForm, sideId = form.dataset.sideForm;
    if (!inkId && !sideId) return false;
    const input = form.querySelector<HTMLInputElement>('input[name="answer"]');
    const answer = input?.value.trim() ?? '';
    if (!answer || this.busy) return true;
    this.busy = true;
    form.querySelector<HTMLButtonElement>('button[type="submit"]')?.setAttribute('disabled', '');
    try {
      const result = await this.options.request<MechanicsResult>(inkId ? '/story/ink' : '/story/side', { id: crypto.randomUUID(), entry: inkId ?? sideId, answer });
      this.options.acceptProgress(result.progress);
      this.progressChanged();
      this.options.cue(!!result.correct);
      if (result.correct) {
        const name = inkId ? this.mechanics.ink.entries.find(item => item.id === inkId)?.german : this.mechanics.sideQuests.find(item => item.id === sideId)?.german;
        this.options.toast(inkId ? t('The ink holds: {name}', { name: personalName(name ?? '', this.options.playerName()) }) : t('{name} is back in town.', { name: name ?? '' }) + (result.xpAdded ? ` · +${result.xpAdded} XP` : ''));
        this.options.closeDialog();
      } else {
        let note = form.querySelector<HTMLElement>('.ink-error');
        if (!note) { note = document.createElement('p'); note.className = 'ink-error'; note.setAttribute('role', 'alert'); form.append(note); }
        const word = !!inkId && this.mechanics.ink.entries.find(item => item.id === inkId)?.kind === 'word';
        note.textContent = word ? t('The ink does not hold. Check the word and say it again.') : t('The ink does not hold. Check the name and say it again.');
        input?.select();
      }
    } catch (error) {
      this.options.toast(error instanceof Error ? error.message : t('The route could not save. Try again.'), true);
    } finally {
      this.busy = false;
      form.querySelector<HTMLButtonElement>('button[type="submit"]')?.removeAttribute('disabled');
    }
    return true;
  }
}

function inkTitle(entry: InkEntry): string {
  if (entry.kind === 'chalk') return t('A name in chalk');
  if (entry.kind === 'stone') return t('A name on the stone');
  if (entry.kind === 'slate') return t('A name on a slate');
  if (entry.kind === 'hull') return t('A name on a boat');
  if (entry.kind === 'sign') return t('A name on a sign');
  if (entry.kind === 'word') return t('A word that is fading');
  return t('A name plate');
}
