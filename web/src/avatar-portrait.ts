import { AvatarSheetCache } from './avatar-baker';
import { PLAYER_PORTRAIT_SIZE, playerPortraitPixels, playerPortraitVersion } from './player-portrait-compositor.mjs';
import { AvatarTextureCache } from './avatar-texture-cache';
import { avatarTextureKey, normalizeAvatar, availableFaceExpressions, catalogueForExpression } from './character-recipe.mjs';
import type { AvatarRecipe } from './character-recipe.mjs';
import { escapeHtml } from './icons';
import './avatar-portrait.css';

const portraits = new AvatarTextureCache<string>(() => {}, 32);
const portraitSheets = new AvatarSheetCache(undefined, 12 * 1024 * 1024);

const supportedExpression = (recipe: AvatarRecipe, expression: string) => availableFaceExpressions(recipe).includes(expression) ? expression : 'neutral';

/** Compose independently authored portrait layers at their final native size. */
export async function bakeAvatarPortrait(recipe: AvatarRecipe, expression = 'neutral'): Promise<string> {
  const pixels = await playerPortraitPixels(recipe, supportedExpression(recipe,expression), portraitSheets.load);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = PLAYER_PORTRAIT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  context.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
  return canvas.toDataURL('image/png');
}

export function avatarPortraitMarkup(avatar: unknown, className = 'portrait', self = false, expression = 'neutral'): string {
  return `<img class="avatar-portrait ${escapeHtml(className)}" data-avatar-portrait="${escapeHtml(JSON.stringify(normalizeAvatar(avatar)))}" data-avatar-expression="${escapeHtml(expression)}" ${self ? 'data-avatar-self' : ''} alt="" aria-hidden="true" width="256" height="256"/>`;
}

export function updateSelfPortraits(root: ParentNode, avatar: unknown): void {
  const recipe = JSON.stringify(normalizeAvatar(avatar));
  root.querySelectorAll<HTMLImageElement>('[data-avatar-self]').forEach(image => { image.dataset.avatarPortrait = recipe; });
}

/** Handles dynamically opened panels without retaining detached DOM nodes. */
export function observeAvatarPortraits(root: HTMLElement, render = bakeAvatarPortrait): () => void {
  const current = new WeakMap<HTMLImageElement, string>();
  const retries = new Map<HTMLImageElement, ReturnType<typeof setTimeout>>();
  let disposed = false;
  const paint = (image: HTMLImageElement) => {
    if (disposed || !image.isConnected) return;
    const encoded = image.dataset.avatarPortrait;
    const expression = image.dataset.avatarExpression ?? 'neutral';
    const identity = JSON.stringify([encoded,expression]);
    if (!encoded || current.get(image) === identity) return;
    current.set(image, identity);
    clearTimeout(retries.get(image)); retries.delete(image);
    const recipe = normalizeAvatar(JSON.parse(encoded));
    const effective = supportedExpression(recipe,expression);
    const isCurrent = () => current.get(image) === identity && image.dataset.avatarPortrait === encoded && (image.dataset.avatarExpression ?? 'neutral') === expression;
    void portraits.acquire(`${playerPortraitVersion}:${avatarTextureKey(recipe,catalogueForExpression(recipe,effective))}`, () => render(recipe,effective)).then(lease => {
      try {
        if (!disposed && image.isConnected && isCurrent()) image.src = lease.value;
      } finally { lease.release(); }
    }).catch(() => {
      if (disposed || !image.isConnected || !isCurrent()) return;
      current.delete(image);
      retries.set(image, setTimeout(() => { retries.delete(image); paint(image); }, 1000));
    });
  };
  const scan = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node.matches('img[data-avatar-portrait]')) paint(node as HTMLImageElement);
    node.querySelectorAll<HTMLImageElement>('img[data-avatar-portrait]').forEach(paint);
  };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') scan(record.target);
      else record.addedNodes.forEach(scan);
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-avatar-portrait','data-avatar-expression'] });
  scan(root);
  return () => { disposed = true; observer.disconnect(); for (const timer of retries.values()) clearTimeout(timer); retries.clear(); };
}
