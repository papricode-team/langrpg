/** Physical canvas pixels are distinct from CSS pixels, including pointer scale. */
export function canvasSize(width: number, height: number, ratio = 1) {
  const density = Math.max(1, Math.min(2, Number.isFinite(ratio) ? ratio : 1));
  return { width: Math.max(1, Math.round(width * density)), height: Math.max(1, Math.round(height * density)), density };
}

export function explorationZoom(width: number, height: number, density = 1, indoor = false, indoorCharacterHeight = 132, bounds = {width:1536,height:1024}) {
  const cssWidth = width / density, cssHeight = height / density;
  const mobile = cssWidth < 760 || cssWidth < 1000 && cssHeight < 520;
  const personHeight = Math.max(mobile ? 88 : 110, Math.min(indoor ? 180 : 162, cssHeight * .15)) * .8;
  // Use each painting's adult height so room proportions and camera framing agree.
  return { zoom: Math.max(width / bounds.width, height / bounds.height, personHeight / (indoor ? indoorCharacterHeight : 72) * density), mobile };
}

/** Conversation framing follows the same comfortable exploration scale. */
export function conversationZoom(baseZoom: number, talking: boolean) {
  return baseZoom * (talking ? 1.12 : 1);
}
