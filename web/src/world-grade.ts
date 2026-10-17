import { nightIntensity } from './world-clock';

export interface WorldGrade { lift: readonly [number, number, number]; highlights: readonly [number, number, number]; vignette: number }

/** A restrained palette finish; existing authored day/night lighting still supplies the exposure. */
export function worldGrade(town: string, hour: number, indoor = false): WorldGrade {
  const night = nightIntensity(hour);
  const coastal = town === 'nebelstadt', forest = town === 'waldruh';
  const warmth = indoor ? 1 : 1 - night * .65;
  return {
    lift: coastal ? [.012, .018, .021] : forest ? [.018, .019, .012] : [.022, .017, .012],
    highlights: [.024 * warmth, .011 * warmth, -.012 * warmth],
    vignette: indoor ? .045 : .035 + night * .02,
  };
}

/** Cap canvas assembly by both GPU dimensions and the quality tier's allocation budget. */
export function roomRenderDensity(width: number, height: number, tier: string, maxTextureSize = 4096): number {
  const requested = tier === 'low' ? 1 : 2;
  const pixelBudget = tier === 'high' ? 16_777_216 : 8_388_608;
  return Math.max(.01, Math.min(requested, maxTextureSize / Math.max(width, height), Math.sqrt(pixelBudget / (width * height))));
}

/** Input and output are backing pixels, so a 2x screen cannot magnify a 1x source. */
export function cinematicImageSize(nativeWidth: number, nativeHeight: number, availableWidth: number, availableHeight: number) {
  const scale = Math.min(1, availableWidth / nativeWidth, availableHeight / nativeHeight);
  return { width: nativeWidth * scale, height: nativeHeight * scale };
}
