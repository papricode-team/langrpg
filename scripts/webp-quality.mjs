/**
 * Quality for every lossy WebP the art pipeline writes. Lossless exports (character kit sheets, masks)
 * stay lossless because tests compare their exact pixels. Exports that must fit the 2 MiB per-file
 * budget start here and step down only when needed, never below MIN_WEBP_QUALITY.
 */
export const WEBP_QUALITY = 75;
export const MIN_WEBP_QUALITY = 70;
