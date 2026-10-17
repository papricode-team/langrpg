import type { Progress } from './api';

/** Only changes that reveal catalogue records need another bootstrap read. */
export function contentEntitlementKey(value: Progress, train: boolean): string {
  // Train graphs authorize evidence reads live. Restored words are fetched as
  // lexemes, so neither change requires reloading the whole catalogue here.
  const story = train ? [] : [value.story?.inspections, value.story?.choices, value.story?.inventory, value.story?.ending];
  return JSON.stringify([value.completedQuestIds, value.completedUnitIds, ...(train ? [] : [value.intake?.wordIds]), ...story]);
}
