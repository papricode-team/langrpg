import { escapeHtml as e } from './icons';
import { t } from './i18n';
import './prologue.css';

/** Letter recognition only: these cues do not claim pronunciation or lexical mastery. */
export const prologueSounds = ['ä', 'ö', 'ü', 'ß', 'ei', 'ie', 'ch', 'sch', 'w', 'z', 'v', '-en'] as const;
export function mountSoundsBoard(host: HTMLElement, options: {silent: boolean; speak(text: string, clip: string): void; onClose(): void}): void {
  let index = 0, revealed = options.silent, feedback = '';
  const play = () => { if (!options.silent) options.speak(prologueSounds[index], `prologue-sound-${index}`); };
  function render() {
    const target = prologueSounds[index];
    host.innerHTML = `<section class="prologue-sounds" aria-label="${e(t('Letters and sounds'))}"><header><span>${index + 1} / ${prologueSounds.length}</span><button class="text-button" data-sound="close">${t('Continue')}</button></header><h2>${t('Letters and sounds')}</h2><p>${options.silent ? t('Look at the letters, then find the matching tile.') : t('Listen, then tap the letters you hear.')}</p><div class="sound-cue" lang="de">${revealed ? e(target) : '♪'}</div><button class="outline-button" data-sound="listen">${t(options.silent ? 'Show letters' : 'Listen again')}</button><button class="text-button" data-sound="show">${t('Show letters')}</button><div class="sound-tiles">${prologueSounds.map(value=>`<button class="outline-button" data-letter="${e(value)}" lang="de">${e(value)}</button>`).join('')}</div><p role="status">${e(feedback)}</p><button class="primary-button" data-sound="next">${t(index === prologueSounds.length - 1 ? 'Start my adventure' : 'Continue')}</button></section>`;
  }
  host.onclick = event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button) return;
    if (button.dataset.letter) { revealed = true; feedback = t(button.dataset.letter === prologueSounds[index] ? 'Yes.' : 'Look and listen once more.'); render(); play(); return; }
    switch(button.dataset.sound) {
      case 'close': host.onclick = null; options.onClose(); break;
      case 'show': revealed = true; render(); break;
      case 'listen': if (options.silent) {revealed=true;render();} else play(); break;
      case 'next': if (index + 1 === prologueSounds.length) {host.onclick=null;options.onClose();} else {index++;revealed=options.silent;feedback='';render();play();} break;
    }
  };
  render(); play();
}
