import { escapeHtml as e, icon } from './icons';
import { t } from './i18n';

/**
 * Options are rows, not a form: one label, one value between ◀ ▶ arrows, and the explanation in
 * the menu's help line rather than a paragraph under every control. Left/right (or the D-pad)
 * change the selected row; Enter, A or a click steps it forward.
 */
export interface OptionChoice { value: string; label: string }
export type OptionRow =
  | { kind: 'choice'; id: string; label: string; help: string; value: string; choices: readonly OptionChoice[]; wrap?: boolean; disabled?: boolean }
  | { kind: 'scale'; id: string; label: string; help: string; value: number; min: number; max: number; step: number; display: string; valueId?: string }
  | { kind: 'action'; id: string; label: string; help: string; action: string; button: string; glyph?: string }
  | { kind: 'custom'; id: string; label: string; help: string; html: string };

export type OptionsTab = 'audio' | 'display' | 'language' | 'account';
export const optionsTabs: readonly { id: OptionsTab; label: () => string }[] = [
  { id: 'audio', label: () => t('Audio') },
  { id: 'display', label: () => t('Display') },
  { id: 'language', label: () => t('Language & learning') },
  { id: 'account', label: () => t('Account') },
];

export function stepOption(row: Extract<OptionRow, { kind: 'choice' | 'scale' }>, step: number): string | number {
  if (row.kind === 'scale') return Math.min(row.max, Math.max(row.min, Math.round((row.value + step * row.step) / row.step) * row.step));
  const index = row.choices.findIndex(choice => choice.value === row.value);
  const next = index + step;
  if (row.wrap ?? row.choices.length === 2) return row.choices[(next + row.choices.length) % row.choices.length].value;
  return row.choices[Math.min(row.choices.length - 1, Math.max(0, next))].value;
}

function rowMarkup(row: OptionRow): string {
  const label = `<span class="option-label" id="option-label-${e(row.id)}">${e(row.label)}</span>`;
  if (row.kind === 'action') return `<div class="option-row" data-help="${e(row.help)}">${label}<button class="option-action" data-action="${e(row.action)}" aria-describedby="option-label-${e(row.id)}">${row.glyph ? icon(row.glyph) : ''}<span>${e(row.button)}</span>${icon('chevron')}</button></div>`;
  if (row.kind === 'custom') return `<div class="option-row option-row-custom" data-help="${e(row.help)}">${label}<div class="option-custom">${row.html}</div></div>`;
  const arrows = (atStart: boolean, atEnd: boolean) => [`<button class="option-arrow" tabindex="-1" data-option-step="-1" data-option-for="${e(row.id)}" aria-hidden="true" ${atStart ? 'disabled' : ''}>◀</button>`, `<button class="option-arrow" tabindex="-1" data-option-step="1" data-option-for="${e(row.id)}" aria-hidden="true" ${atEnd ? 'disabled' : ''}>▶</button>`];
  if (row.kind === 'scale') {
    const cells = Math.round((row.max - row.min) / row.step) + 1, filled = Math.round((row.value - row.min) / row.step) + 1;
    const [left, right] = arrows(row.value <= row.min, row.value >= row.max);
    return `<div class="option-row" data-help="${e(row.help)}">${label}<div class="option-control">${left}<button class="option-value option-scale" data-option="${e(row.id)}" data-nav-horizontal role="slider" aria-labelledby="option-label-${e(row.id)}" aria-valuemin="${row.min}" aria-valuemax="${row.max}" aria-valuenow="${row.value}" aria-valuetext="${e(row.display)}"><span class="option-cells" style="--cells:${cells}">${Array.from({ length: cells }, (_, index) => `<i class="${index < filled ? 'on' : ''}"></i>`).join('')}</span><output ${row.valueId ? `id="${e(row.valueId)}"` : ''}>${e(row.display)}</output></button>${right}</div></div>`;
  }
  const index = row.choices.findIndex(choice => choice.value === row.value);
  const wrap = row.wrap ?? row.choices.length === 2;
  const [left, right] = arrows(!wrap && index <= 0, !wrap && index >= row.choices.length - 1);
  return `<div class="option-row" data-help="${e(row.help)}">${label}<div class="option-control">${left}<button class="option-value" data-option="${e(row.id)}" data-nav-horizontal aria-labelledby="option-label-${e(row.id)}" aria-roledescription="${e(t('option'))}" ${row.disabled ? 'disabled' : ''}><span>${e(row.choices[index]?.label ?? row.value)}</span><span class="option-pips" aria-hidden="true">${row.choices.map((_, pip) => `<i class="${pip === index ? 'on' : ''}"></i>`).join('')}</span></button>${right}</div></div>`;
}

export function optionsMarkup(tab: OptionsTab, rows: readonly OptionRow[], extra = ''): string {
  return `<div class="options-panel" data-options-panel="${tab}"><div class="option-rows">${rows.map(rowMarkup).join('')}</div>${extra}</div>`;
}

/**
 * Wires every stepper inside `root`. `change` receives the row and the value it should become;
 * it returns once the new state is applied so the panel can redraw with the cursor in place.
 */
export function bindOptionRows(root: HTMLElement, rows: readonly OptionRow[], change: (row: OptionRow, value: string | number) => void, sound: (kind: 'move' | 'confirm') => void): () => void {
  const steppable = (id: string | undefined) => rows.find((row): row is Extract<OptionRow, { kind: 'choice' | 'scale' }> => row.id === id && (row.kind === 'choice' || row.kind === 'scale'));
  const apply = (id: string | undefined, step: number) => {
    const row = steppable(id);
    if (!row || (row.kind === 'choice' && row.disabled)) return;
    const value = stepOption(row, step);
    if (value === row.value) return;
    sound('confirm');
    change(row, value);
  };
  const onClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-option-step],[data-option]');
    if (!target || !root.contains(target)) return;
    event.stopPropagation();
    if (target.dataset.optionStep) apply(target.dataset.optionFor, Number(target.dataset.optionStep));
    else apply(target.dataset.option, 1);
  };
  const onKey = (event: KeyboardEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-option]');
    if (!target || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault(); event.stopPropagation();
    apply(target.dataset.option, event.key === 'ArrowLeft' ? -1 : 1);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  return () => { root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); };
}
