import { QUALITY_MODES } from './quality-governor';
import type { QualityGovernor, QualityMode, QualityTier } from './quality-governor';

/**
 * Graphics quality state without a Phaser dependency: the tier manifest, URL mapping and the
 * player's choice. texture-quality.ts applies it to Phaser textures; the avatar baker reads it too.
 */
export const QUALITY_SCALE: Readonly<Record<QualityTier, number>> = { low: .5, medium: .75, high: 1 };
const STORAGE_KEY = 'atlas.graphicsQuality';

interface Manifest { files: Record<string, readonly [number, number]>; }
export interface TieredSource { rel: string; query: string; tier: QualityTier; }
let manifest: Manifest | null = null;

export function setQualityManifest(value: unknown): void {
  const files = value && typeof value === 'object' ? (value as { files?: unknown }).files : undefined;
  manifest = files && typeof files === 'object' ? { files: files as Manifest['files'] } : null;
}
export function qualityTiersAvailable(): boolean { return manifest !== null; }
/** A tiered master's logical [width, height]. */
export function logicalSize(rel: string): readonly [number, number] | undefined { return manifest?.files[rel]; }

const origin = () => typeof location === 'undefined' ? '' : location.origin;
/** The tiered master behind `url`, or null when the URL is not a tiered asset. */
export function tieredAsset(url: string): TieredSource | null {
  if (!manifest) return null;
  const cut = url.search(/[?#]/);
  let path = cut < 0 ? url : url.slice(0, cut);
  const base = origin();
  if (base && path.startsWith(base + '/')) path = path.slice(base.length);
  const match = /^\/assets\/(?:q\/(low|medium)\/)?(.+)$/.exec(path);
  if (!match || !manifest.files[match[2]]) return null;
  return { rel: match[2], query: cut < 0 ? '' : url.slice(cut), tier: (match[1] as QualityTier | undefined) ?? 'high' };
}

export function qualityUrl(url: string, tier: QualityTier): string {
  const asset = tieredAsset(url);
  if (!asset) return url;
  return `/assets/${tier === 'high' ? '' : `q/${tier}/`}${asset.rel}${asset.query}`;
}

function readMode(): QualityMode {
  try { const saved = localStorage.getItem(STORAGE_KEY) as QualityMode | null; return saved && QUALITY_MODES.includes(saved) ? saved : 'auto'; } catch { return 'auto'; }
}
let mode: QualityMode = readMode();
// One judgement for the page; texture-quality.ts installs it with the first game.
let governor: QualityGovernor | null = null;
const listeners = new Set<() => void>();

export function qualityGovernor(): QualityGovernor | null { return governor; }
export function setQualityGovernor(value: QualityGovernor | null): void { governor = value; }

export function graphicsQualityMode(): QualityMode { return mode; }
/** The tier being shown: the manual choice, or what Auto has reached. */
export function graphicsQualityTier(): QualityTier {
  return mode === 'auto' ? governor?.tier ?? 'low' : mode;
}
export function setGraphicsQualityMode(next: QualityMode): void {
  mode = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* the choice lasts this session */ }
  notifyGraphicsQualityChange();
}
export function notifyGraphicsQualityChange(): void { for (const listener of listeners) listener(); }
export function onGraphicsQualityChange(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
