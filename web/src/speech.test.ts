import { describe, expect, it, vi } from 'vitest';
import { Speech, type SpeechOptions } from './speech';

class FakeAudio {
  playbackRate = 1; onplay?: () => void; onended?: () => void; onerror?: () => void;
  paused = false; play = vi.fn(async () => { this.onplay?.(); }); pause = vi.fn(() => { this.paused = true; });
  constructor(readonly src: string) {}
}
function speech(extra: Partial<SpeechOptions> = {}) {
  const audios: FakeAudio[] = [], spoken: { text: string; voice?: SpeechSynthesisVoice; onend?: () => void; onerror?: () => void }[] = [];
  const narration = vi.fn();
  const synthesis = { getVoices: () => [{ lang: 'en-GB' }, { lang: 'de-DE', name: 'Anna' }, { lang: 'de-AT', name: 'Lukas' }], speak: vi.fn(), cancel: vi.fn() };
  const value = new Speech({
    silent: () => false, muted: () => false, narration, clipFor: text => text === 'Guten Tag' ? '/audio/guten-tag.ogg' : undefined, voiceIndex: speaker => speaker === 'otto' ? 1 : 0,
    audio: path => { const audio = new FakeAudio(path); audios.push(audio); return audio as unknown as HTMLAudioElement; },
    synthesis: () => synthesis as unknown as SpeechSynthesis,
    utterance: text => { const utterance = { text } as unknown as SpeechSynthesisUtterance; spoken.push(utterance as never); return utterance; },
    ...extra,
  });
  return { speech: value, audios, spoken, synthesis, narration };
}

describe('speech', () => {
  it('plays a recording and reports only the newest line as heard', () => {
    const { speech: voice, audios, narration } = speech();
    const first = vi.fn(), second = vi.fn();
    voice.speak('Guten Tag', { rate: .82, heard: first });
    voice.speak('Guten Tag', { rate: 1.64, heard: second });
    expect(audios[0].pause).toHaveBeenCalled();
    expect(audios[1].playbackRate).toBe(2);
    audios[0].onended?.(); audios[1].onended?.();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(narration).toHaveBeenLastCalledWith(false);
  });

  it('falls back to the speaker’s German browser voice without a recording', () => {
    const { speech: voice, spoken, synthesis } = speech();
    const heard = vi.fn();
    voice.speak('Wo ist der Bahnhof?', { rate: .82, speaker: 'otto', heard });
    expect(synthesis.speak).toHaveBeenCalledOnce();
    expect(spoken[0].voice?.name).toBe('Lukas');
    spoken[0].onend?.();
    expect(heard).toHaveBeenCalledOnce();
  });

  it('reports a line no voice can play, and stays quiet in silent mode', () => {
    const unavailable = vi.fn();
    const { speech: voice } = speech({ synthesis: () => undefined });
    voice.speak('Wo ist der Bahnhof?', { rate: .82, unavailable });
    expect(unavailable).toHaveBeenCalledOnce();
    const quiet = speech({ silent: () => true });
    quiet.speech.speak('Guten Tag', { rate: .82 });
    expect(quiet.audios).toHaveLength(0);
  });

  it('uses a dialogue clip ahead of sentence audio', () => {
    const { speech: voice, audios } = speech();
    voice.speak('Guten Tag', { rate: .82, clipId: 'marta-1' });
    expect(audios[0].src).toBe('/audio/dialogue/marta-1.ogg');
  });
});
