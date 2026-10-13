/** Physical-pixel budgets. Enlarging an export never qualifies as new source detail. */
export const CHARACTER_RESOLUTION = Object.freeze({
  sourceCell: [512, 768],
  runtimeCell: [384, 576],
  editorCell: [512, 768],
  portraitCell: [256, 256],
  minimumPortraitCell: [240, 240],
  sourcePageColumns: 2,
  sourcePageRows: 2,
  frames: 36,
  // Largest player portrait is the 80px inn panel; HUD/chat/dialogue are smaller.
  maximumDisplay: { worldBodyCss: 180, conversationZoom: 1.12, density: 2, builderWidthCss: 200, portraitCss: 80, portraitDensity: 3 },
});

export function characterResolutionErrors({ nativeCell, outputCell, paintedHeight, surface, authored = false }) {
  const errors = [];
  const pair = value => Array.isArray(value) && value.length === 2 && value.every(n => Number.isInteger(n) && n > 0);
  if (!pair(nativeCell) || !pair(outputCell)) return ['Resolution requires positive native and output dimensions'];
  if (!authored) errors.push('New detail requires an authored source; resized pose guides are not publication artwork');
  if (outputCell.some((n,i) => n > nativeCell[i])) errors.push('Export would enlarge source pixels');
  const display = CHARACTER_RESOLUTION.maximumDisplay;
  if (surface === 'portrait') {
    const minimum = Math.ceil(display.portraitCss * display.portraitDensity);
    if (nativeCell.some(n=>n<minimum) || outputCell.some(n=>n<minimum)) errors.push(`Portrait needs at least ${minimum} native and exported pixels per side`);
  } else if (surface === 'world') {
    const minimum = Math.ceil(display.worldBodyCss * display.conversationZoom * display.density);
    if (!Number.isFinite(paintedHeight) || paintedHeight < minimum) errors.push(`World body needs at least ${minimum} exported painted pixels`);
  } else if (surface === 'editor') {
    const minimum = display.builderWidthCss * display.density;
    if (outputCell[0] < minimum) errors.push(`Editor frame needs at least ${minimum} exported pixels wide`);
  } else errors.push('Unknown character display surface');
  return errors;
}
