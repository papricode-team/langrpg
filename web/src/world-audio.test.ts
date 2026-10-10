import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import { WorldAudio } from './world-audio';
import { worldPeriod } from './world-clock';

describe('world music follows the authored clock', () => {
  it('selects the same normalized night as terrain at dawn, dusk and wrapped hours', () => {
    const sounds = new Map<string, { isPlaying: boolean; volume: number }>();
    const scene = {
      cache: { audio: { exists: () => true } },
      sound: { add: (key: string) => {
        const sound = { isPlaying: false, volume: 0,
          play() { this.isPlaying = true; return true; },
          stop() { this.isPlaying = false; },
          setVolume(value: number) { this.volume = value; }, destroy() {} };
        sounds.set(key, sound);
        return sound;
      } },
    } as unknown as Phaser.Scene;
    const audio = new WorldAudio(scene);
    audio.setRegion('waldruh');
    for (const hour of [6.999, 7, 18.999, 19, 24, 31, -5, 12]) {
      audio.setHour(hour); audio.update(1);
      const key = `world-music-waldruh${worldPeriod(hour) === 'night' ? '-night' : ''}`;
      const active = [...sounds].filter(([name, sound]) => name.includes('music') && sound.isPlaying && sound.volume > 0);
      expect(active.map(([name]) => name)).toEqual([key]);
      expect(sounds.get('world-ambience-waldruh')?.isPlaying).toBe(true);
    }
    audio.destroy();
  });
});
