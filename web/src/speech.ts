/** What one spoken line reports back to the page that asked for it. */
export interface SpeechRequest {
  speaker?: string;
  /** A recorded dialogue clip, which takes precedence over sentence audio and synthesis. */
  clipId?: string;
  rate: number;
  started?(): void;
  /** The line played to the end. */
  heard?(): void;
  /** Neither the recording nor the browser voice could play it. */
  unavailable?(): void;
}

export interface SpeechOptions {
  silent(): boolean;
  muted(): boolean;
  /** The town lowers its ambience while a line is spoken. */
  narration(active: boolean): void;
  /** A recorded file for this German text, if one is known. */
  clipFor(text: string): string | undefined;
  /** Which browser voice a speaker uses among the German voices installed. */
  voiceIndex(speaker: string | undefined): number;
  audio?(path: string): HTMLAudioElement;
  synthesis?(): SpeechSynthesis | undefined;
  utterance?(text: string): SpeechSynthesisUtterance;
  audioContext?(): AudioContext;
}

/**
 * German narration and answer cues: recorded audio first, the browser's German voice as a fallback, and only
 * the newest line ever reports back. Moved out of main.ts unchanged in behaviour.
 */
export class Speech {
  private active?: HTMLAudioElement;
  private generation = 0;
  private context?: AudioContext;
  private readonly audio: (path: string) => HTMLAudioElement;
  private readonly synthesis: () => SpeechSynthesis | undefined;
  private readonly utterance: (text: string) => SpeechSynthesisUtterance;
  private readonly createContext: () => AudioContext;

  constructor(private readonly options: SpeechOptions) {
    this.audio = options.audio ?? (path => new Audio(path));
    this.synthesis = options.synthesis ?? (() => typeof window !== 'undefined' && 'speechSynthesis' in window ? speechSynthesis : undefined);
    this.utterance = options.utterance ?? (text => new SpeechSynthesisUtterance(text));
    this.createContext = options.audioContext ?? (() => new AudioContext());
  }

  stop(): void {
    this.options.narration(false);
    this.generation++;
    if (this.active) { this.active.pause(); this.active = undefined; }
    this.synthesis()?.cancel();
  }

  speak(text: string, request: SpeechRequest): void {
    if (this.options.silent()) return;
    this.stop();
    this.options.narration(true);
    const generation = this.generation, current = () => generation === this.generation;
    const heard = () => { this.options.narration(false); request.heard?.(); };
    const unavailable = () => {
      if (!current()) return;
      this.options.narration(false);
      request.unavailable?.();
    };
    let fallbackStarted = false;
    const fallback = () => {
      if (!current() || fallbackStarted) return;
      fallbackStarted = true;
      const synthesis = this.synthesis();
      if (!synthesis) { unavailable(); return; }
      const germanVoices = synthesis.getVoices().filter(voice => voice.lang.startsWith('de'));
      const voice = germanVoices[this.options.voiceIndex(request.speaker) % Math.max(germanVoices.length, 1)];
      if (!voice) { unavailable(); return; }
      const utterance = this.utterance(text);
      utterance.onend = () => { if (current()) heard(); };
      utterance.onstart = () => request.started?.();
      utterance.onerror = unavailable;
      utterance.lang = 'de-DE'; utterance.voice = voice; utterance.rate = request.rate;
      synthesis.speak(utterance);
    };
    const path = request.clipId ? `/audio/dialogue/${request.clipId}.ogg` : this.options.clipFor(text);
    if (!path) { fallback(); return; }
    const audio = this.audio(path);
    this.active = audio;
    audio.playbackRate = request.rate / 0.82;
    audio.onplay = () => request.started?.();
    audio.onended = () => { if (current()) heard(); };
    audio.onerror = fallback;
    void audio.play().catch(() => { if (this.active === audio) fallback(); });
  }

  /** A short rising (correct) or falling (miss) chime; stays silent where the device blocks audio. */
  cue(correct: boolean): void {
    if (this.options.muted() || this.options.silent()) return;
    try {
      const context = this.context ??= this.createContext();
      void context.resume();
      const now = context.currentTime;
      (correct ? [523.25, 659.25, 783.99] : [329.63, 293.66]).forEach((freq, i) => {
        const osc = context.createOscillator(), gain = context.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.09); gain.gain.linearRampToValueAtTime(0.06, now + i * 0.09 + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.35);
        osc.connect(gain); gain.connect(context.destination); osc.start(now + i * 0.09); osc.stop(now + i * 0.09 + 0.4);
      });
    } catch { /* Audio stays optional when the device blocks it. */ }
  }

  /** Silent mode suspends the cue context too. */
  suspendCues(): void { void this.context?.suspend(); }
}
