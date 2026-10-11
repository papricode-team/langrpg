/** Named artwork can change between builds while an older copy is still cached. */
export function worldAssetUrl(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(__APP_VERSION__)}`;
}
