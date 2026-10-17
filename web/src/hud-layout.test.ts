// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { hudChapterMarkup, hudNavigationMarkup, minimapMarkup, minimapPoint, updateMinimapPlayer } from './hud-layout';

const town = { name: 'Lindenhafen', previewAsset: '/assets/lindenhafen-preview.webp', width: 1536, height: 1024, npcs: [{ id: 'marta', name: 'Marta', x: 768, y: 512 }] };

describe('town minimap coordinate frame', () => {
  it('keeps world positions aligned with a cover-cropped landscape or portrait painting', () => {
    expect(minimapPoint({ x: 768, y: 512 }, 1536, 1024)).toEqual({ x: 50, y: 50 });
    expect(minimapPoint({ x: 256, y: 0 }, 1536, 1024)).toEqual({ x: 0, y: 0 });
    expect(minimapPoint({ x: 1280, y: 1024 }, 1536, 1024)).toEqual({ x: 100, y: 100 });
    expect(minimapPoint({ x: 0, y: 256 }, 1024, 1536)).toEqual({ x: 0, y: 0 });
    expect(minimapPoint({ x: 0, y: 512 }, 1536, 1024)?.x).toBe(-25);
  });

  it('hides unavailable player positions and rejects invalid dimensions instead of drawing a false location', () => {
    const root = document.createElement('aside'); root.innerHTML = minimapMarkup(town);
    const marker = root.querySelector<HTMLElement>('#hud-map-player')!;
    expect(marker.hidden).toBe(true);
    updateMinimapPlayer(root, { x: 768, y: 512 }, 1536, 1024);
    expect(marker.hidden).toBe(false); expect(marker.style.left).toBe('50%');
    updateMinimapPlayer(root, undefined, 1536, 1024);
    expect(marker.hidden).toBe(true);
    updateMinimapPlayer(root, { x: Number.NaN, y: 0 }, 1536, 1024);
    expect(marker.hidden).toBe(true);
    expect(minimapPoint({ x: 0, y: 0 }, 0, 1024)).toBeUndefined();
  });

  it('updates the player without replacing the focused atlas control or resident labels', () => {
    const root = document.createElement('aside'); root.innerHTML = minimapMarkup(town); document.body.append(root);
    const compass = root.querySelector<HTMLButtonElement>('button')!; compass.focus();
    updateMinimapPlayer(root, { x: 1024, y: 512 }, 1536, 1024);
    expect(document.activeElement).toBe(compass);
    expect(root.querySelector('.hud-map-npc')?.getAttribute('aria-label')).toBe('Marta');
    expect(root.querySelector<HTMLElement>('#hud-map-player')?.style.left).toBe('75%');
    root.remove();
  });

  it('escapes published labels and omits invalid NPC coordinates', () => {
    const root = document.createElement('aside');
    root.innerHTML = minimapMarkup({ ...town, npcs: [{ id: 'one', name: 'Marta "><script>bad</script>', x: 768, y: 512 }, { id: 'bad', name: 'Missing', x: Infinity, y: 0 }] });
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelectorAll('.hud-map-npc')).toHaveLength(1);
    expect(root.querySelector('.hud-map-npc')?.getAttribute('title')).toContain('<script>');
  });
});

describe('backed HUD actions and progress', () => {
  it('keeps only Atlas in the dock and preserves the muted state', () => {
    const root = document.createElement('div'); root.innerHTML = hudNavigationMarkup(true);
    expect([...root.querySelectorAll('.hud-dock button')].map(button => (button as HTMLElement).dataset.view)).toEqual(['atlas']);
    expect(root.querySelector('#hud-sound')?.getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector('#hud-revisit')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('#hud-local-status')?.textContent).toBe('');
  });

  it('shows supplied progress and reward, without offering XP again for a finished chapter', () => {
    const root = document.createElement('div');
    const chapter = { chapter: 'Chapter 1 · A1', title: 'Coffee <&> prophecy', summary: 'Order food', done: 1, total: 6, reward: 40 };
    root.innerHTML = hudChapterMarkup(chapter);
    expect(root.textContent).toContain('1/6 stories discovered');
    expect(root.textContent).toContain('+40 XP');
    expect(root.querySelector('.hud-chapter-heading>strong')?.textContent).toBe(chapter.title);
    root.innerHTML = hudChapterMarkup({ ...chapter, done: 6, reward: 0 });
    expect(root.textContent).not.toContain('XP');
  });
});
