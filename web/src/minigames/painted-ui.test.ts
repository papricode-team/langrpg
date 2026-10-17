// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { miniGameDefinitions } from './catalogue';
import { minigameBackdrop, mechanicStages } from './stages';
import { SpriteLibrary } from './sprite-library';
import { paintedFeedback, paintedMark } from './painted-ui';
import { itemSpriteFor, hasItemSprite } from './item-manifest';
import { scriptedStoryData } from './scripted-stories';

describe('painted minigame presentation', () => {
  it('gives every catalogue game a family stage and uses all eight paintings', () => {
    for (const game of miniGameDefinitions) expect(minigameBackdrop(game.mechanic)).toBe(`/assets/minigames/${mechanicStages[game.mechanic]}.webp`);
    expect(new Set(Object.values(mechanicStages)).size).toBe(8);
  });
  it('provides painted art for every noun required by an authored story', () => {
    for (const game of Object.values(scriptedStoryData.games)) {
      for (const id of game.requiredWordIds.filter(id => id.endsWith('-noun'))) expect(itemSpriteFor(id), id).toBeTruthy();
    }
  });
  it('keeps abstract story motifs out of picture-only retrievals', () => {
    expect(itemSpriteFor('erinnerung-noun')).toBeTruthy();
    expect(hasItemSprite('erinnerung-noun')).toBe(false);
    expect(hasItemSprite('werkzeug-noun')).toBe(true);
  });
  it('keeps correction text safe and uses painted feedback instead of a glyph', () => {
    const target = document.createElement('p');
    paintedFeedback(target, '<strong>the correction</strong>', false);
    expect(target.textContent).toBe('<strong>the correction</strong>');
    expect(target.querySelector('strong')).toBeNull();
    expect(target.querySelector('img')?.src).toContain('prop-miss-seal.webp');
    expect(paintedMark('listening')).toContain('prop-listening-horn.webp');
  });
  it('uses a neutral painted pouch for unknown and failed artwork, keeping its accessible label', () => {
    const library = new SpriteLibrary();
    const unknown = library.render('unpainted', 'An unfamiliar object', 64) as HTMLImageElement;
    expect(unknown.src).toContain('prop-placeholder.webp');
    expect(unknown.alt).toBe('An unfamiliar object');
    expect(unknown.dataset.missingSprite).toBe('unpainted');
    const known = library.render('item-kaffee-noun', 'Coffee') as HTMLImageElement;
    known.dispatchEvent(new Event('error'));
    expect(known.src).toContain('prop-placeholder.webp');
    expect(known.hidden).toBe(false);
    expect(library.has('item-kaffee-noun')).toBe(false);
  });
});
