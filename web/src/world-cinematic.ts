/** Keep the train a foreground shot. Oversize art is framed by the viewport;
 * a Retina canvas must not make the train's CSS footprint half as large. */
export function trainFraming(nativeWidth: number, nativeHeight: number, width: number, height: number, density: number) {
  const scale = Math.min(1.25, Math.max(width * .92 / nativeWidth, height * .62 / nativeHeight));
  // Ultrawide/Retina viewports can exceed the native pixel cap. Start centred
  // so the available image remains the foreground shot instead of an edge prop.
  return {width: nativeWidth * scale, height: nativeHeight * scale, cssWidth: nativeWidth * scale / density};
}
