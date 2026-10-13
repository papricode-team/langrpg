/**
 * Small synthesised interface sounds in the Atlas' own material: brass ticks for the cursor,
 * a paper flick for pages and a lantern chime for opening the book. Nothing is downloaded.
 */
export type UiSound = 'move' | 'confirm' | 'back' | 'tab' | 'page' | 'open' | 'close';

interface Note { frequency: number; at: number; length: number; volume: number; type: OscillatorType; slide?: number }
interface Recipe { notes: Note[]; paper?: { at: number; length: number; volume: number; tone: number } }

export const uiSoundRecipes: Record<UiSound, Recipe> = {
  move: { notes: [{ frequency: 1760, at: 0, length: .045, volume: .018, type: 'triangle' }] },
  confirm: { notes: [{ frequency: 880, at: 0, length: .09, volume: .03, type: 'triangle' }, { frequency: 1318.5, at: .05, length: .16, volume: .026, type: 'sine' }] },
  back: { notes: [{ frequency: 987.8, at: 0, length: .08, volume: .024, type: 'triangle' }, { frequency: 659.3, at: .05, length: .12, volume: .02, type: 'sine' }] },
  tab: { notes: [{ frequency: 1174.7, at: .02, length: .07, volume: .018, type: 'triangle' }], paper: { at: 0, length: .11, volume: .05, tone: 2600 } },
  page: { notes: [], paper: { at: 0, length: .09, volume: .045, tone: 3400 } },
  open: { notes: [{ frequency: 523.3, at: .02, length: .5, volume: .022, type: 'sine', slide: 1.5 }, { frequency: 1568, at: .14, length: .55, volume: .016, type: 'sine' }], paper: { at: 0, length: .28, volume: .05, tone: 1400 } },
  close: { notes: [{ frequency: 1046.5, at: 0, length: .3, volume: .018, type: 'sine', slide: .5 }], paper: { at: .02, length: .2, volume: .04, tone: 1200 } },
};

export class UiSounds {
  private context: AudioContext | undefined;
  private noise: AudioBuffer | undefined;
  private lastMove = 0;

  constructor(private readonly enabled: () => boolean) {}

  play(kind: UiSound): void {
    if (!this.enabled() || typeof AudioContext === 'undefined') return;
    try {
      const context = this.context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume();
      const now = context.currentTime;
      // Held directions repeat quickly; keep the ticks from stacking into a buzz.
      if (kind === 'move') { if (now - this.lastMove < .04) return; this.lastMove = now; }
      const recipe = uiSoundRecipes[kind];
      for (const note of recipe.notes) {
        const osc = context.createOscillator(), gain = context.createGain(), start = now + note.at;
        osc.type = note.type;
        osc.frequency.setValueAtTime(note.frequency, start);
        if (note.slide) osc.frequency.exponentialRampToValueAtTime(note.frequency * note.slide, start + note.length);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(note.volume, start + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, start + note.length);
        osc.connect(gain).connect(context.destination);
        osc.start(start); osc.stop(start + note.length + .02);
      }
      if (recipe.paper) {
        const { at, length, volume, tone } = recipe.paper, start = now + at;
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
        source.buffer = this.noise ??= this.whiteNoise(context);
        filter.type = 'bandpass'; filter.frequency.value = tone; filter.Q.value = .8;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + length * .3);
        gain.gain.exponentialRampToValueAtTime(.0001, start + length);
        source.connect(filter).connect(gain).connect(context.destination);
        source.start(start); source.stop(start + length + .02);
      }
    } catch { /* Interface sounds stay optional when the device blocks audio. */ }
  }

  private whiteNoise(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, Math.round(context.sampleRate * .3), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
