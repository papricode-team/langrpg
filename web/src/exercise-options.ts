import { escapeHtml as e } from './icons';
import { localizedExerciseOption } from './i18n';

export function exerciseOptionsMarkup(exercise: { id: string; mode: string }, options: readonly string[]): string {
  return options.map((option, index) => `<button class="answer-option" data-game-option="${index}" data-answer="${e(option)}"><span>${String.fromCharCode(65 + index)}</span>${e(localizedExerciseOption(exercise, option))}</button>`).join('');
}
