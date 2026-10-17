import { itemSpriteByLemma, itemSpriteFor, itemSpriteManifest } from './item-manifest';
import type { GameItem } from './types';
import type { SpriteLibrary } from './sprite-library';

type PaintedMark = 'correct' | 'miss' | 'listening' | 'placeholder';
const markFrames = { correct: 'prop-correct-seal', miss: 'prop-miss-seal', listening: 'prop-listening-horn', placeholder: 'prop-placeholder' } as const;
/** Authored art paths only: no learner text is interpolated into markup. */
export function paintedMark(mark: PaintedMark): string {
  const entry = itemSpriteManifest[markFrames[mark]];
  return `<img class="minigame-painted-mark" src="${entry.url}" width="32" height="32" alt="${{correct:'Correct',miss:'Try again',listening:'Listen',placeholder:'Awaiting'}[mark]}" draggable="false">`;
}
export function paintedFeedback(target: HTMLElement, text: string, correct: boolean): void {
  target.textContent = text;
  target.insertAdjacentHTML('afterbegin', paintedMark(correct ? 'correct' : 'miss'));
}
/** Abstract/unpainted nouns keep their label and receive a neutral pouch, never a misleading substitute. */
export function paintNoun(target: Element | null, item: GameItem, sprites: SpriteLibrary, size = 64): void {
  if (!target || item.pos !== 'noun') return;
  const frame = item.sprite ?? itemSpriteFor(item.lexemeId) ?? itemSpriteByLemma(item.lemma) ?? 'prop-placeholder';
  const image = sprites.render(frame, '', size);
  image.classList.add('minigame-noun-art'); target.prepend(image);
}
