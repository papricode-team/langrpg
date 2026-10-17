import sharp from 'sharp';

// Keep exact registration and the lossless editor proofs. Near-lossless WebP
// bounds RGB/alpha rounding (alpha within 8/255) so invisible painted tooth does
// not inflate all three distribution tiers. Bump this ID with export settings.
export const characterCastEncodingId = 'near-lossless-20-v1';
export const characterCastEncoder = Object.freeze({ nearLossless: true, quality: 20, alphaQuality: 100, effort: 6 });

export async function encodeCharacterCastAtlas(input) {
  return sharp(input).webp(characterCastEncoder).toBuffer();
}

/** Migrations accept exact legacy masters, never another generation of an encode. */
export function isLosslessWebP(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunk = bytes.toString('ascii', offset, offset + 4);
    if (chunk === 'VP8L') return true;
    if (chunk === 'VP8 ') return false;
    const length = bytes.readUInt32LE(offset + 4);
    offset += 8 + length + length % 2;
  }
  return false;
}
