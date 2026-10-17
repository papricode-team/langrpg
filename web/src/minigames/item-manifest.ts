import manifest from './item-data.json';
import sceneArt from './scene-art-data.json';

export const ITEM_ATLAS_KEY = 'minigame-items';
export interface ItemSpriteEntry {
  name: string; lexemeId?: string; lemma?: string; article?: string; plural?: string; level?: string;
  topic?: string; domain?: string; pictureable?: boolean; subject: string; kind: string;
  sheet: string; source: string; url: string;
  atlasFrame: { x: number; y: number; w: number; h: number }; atlasKey?: string;
}
export const itemSpriteManifest = manifest.frames as Record<string, ItemSpriteEntry>;
export const itemAtlas = { key: ITEM_ATLAS_KEY, image: manifest.atlas, data: manifest.atlasData };
export const itemAtlases = manifest.atlases;
export const missingItemArt = manifest.missing;
const lexemeFrames = new Map(Object.values(itemSpriteManifest).filter(entry => entry.lexemeId).map(entry => [entry.lexemeId!, entry.name]));
/** A missing noun stays out of picture retrievals; a semantically similar icon is not a substitute. */
export function itemSpriteFor(lexemeId: string): string | undefined { return lexemeFrames.get(lexemeId); }
/** Decorative motifs for abstract story nouns must not become picture-only quiz answers. */
export function hasItemSprite(lexemeId: string): boolean {
  const frame = lexemeFrames.get(lexemeId);
  return Boolean(frame && itemSpriteManifest[frame].pictureable !== false);
}
export const itemSpriteLexemeIds = [...lexemeFrames.keys()];

function normalizeItemLabel(label: string): string {
  return label.split('·')[0].trim().replace(/^(der|die|das|ein|eine|einen)\s+/i, '').toLocaleLowerCase('de-DE');
}
const lemmaFrames = new Map(Object.values(itemSpriteManifest).filter(entry => entry.lexemeId).flatMap(entry => [entry.lemma, entry.plural].filter((word): word is string => Boolean(word)).map(word => [normalizeItemLabel(word), entry.name] as const)));
/** Labels may include an article, an attested plural, or a quantity after a middle dot. */
export function itemSpriteByLemma(german: string): string | undefined { return lemmaFrames.get(normalizeItemLabel(german)); }

export const minigameSceneArtManifest = sceneArt.frames as Record<string, ItemSpriteEntry>;
export const minigameBackdrops = sceneArt.backdrops;
export const minigameActionAtlas = sceneArt.atlas;
export const allGameSpriteFrames: Record<string, ItemSpriteEntry> = {...itemSpriteManifest, ...minigameSceneArtManifest};
