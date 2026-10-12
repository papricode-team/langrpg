/** Reproducible layouts; a new run/attempt seed gives a fresh arrangement. */
export function seededShuffle<T>(values: readonly T[], seed: string | number): T[] {
  let value = 2166136261;
  for (const char of String(seed)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    value = (value + 0x6d2b79f5) >>> 0;
    let random = Math.imul(value ^ (value >>> 15), value | 1);
    random ^= random + Math.imul(random ^ (random >>> 7), random | 61);
    const j = Math.floor(((random ^ (random >>> 14)) >>> 0) / 4294967296 * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
