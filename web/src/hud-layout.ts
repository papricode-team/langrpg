import { escapeHtml as e, icon } from './icons';
import { t } from './i18n';

export interface HudMapPoint { x: number; y: number; }
export interface HudMap {
  name: string;
  previewAsset: string;
  width: number;
  height: number;
  npcs: readonly (HudMapPoint & { id: string; name: string })[];
}

/** Match object-fit:cover in the circular viewport; scene coordinates are world units. */
export function minimapPoint(point: HudMapPoint, width: number, height: number): HudMapPoint | undefined {
  if (![point.x, point.y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
  const side = Math.min(width, height);
  return { x: 50 + (point.x - width / 2) / side * 100, y: 50 + (point.y - height / 2) / side * 100 };
}

export function minimapMarkup(map: HudMap): string {
  return `<div class="hud-minimap-window"><img class="hud-minimap-painting" src="${e(map.previewAsset)}" alt="${e(map.name)}" draggable="false"/>${map.npcs.map(npc => {
    const point = minimapPoint(npc, map.width, map.height);
    return point ? `<span class="hud-map-npc" role="img" aria-label="${e(npc.name)}" title="${e(npc.name)}" style="left:${point.x}%;top:${point.y}%"></span>` : '';
  }).join('')}<span class="hud-map-player" id="hud-map-player" role="img" aria-label="${e(t('You are here'))}" hidden></span></div><img class="hud-minimap-bezel" src="/assets/ui/minimap-bezel-v2.webp" alt="" aria-hidden="true"/><span class="hud-minimap-north" aria-hidden="true">N</span><button class="hud-round hud-minimap-compass" type="button" data-view="atlas" aria-label="${e(t('Open the region atlas'))}">${icon('compass')}</button>`;
}

export function updateMinimapPlayer(root: ParentNode, position: HudMapPoint | undefined, width: number, height: number): void {
  const marker = root.querySelector<HTMLElement>('#hud-map-player');
  if (!marker) return;
  const point = position && minimapPoint(position, width, height);
  marker.hidden = !point;
  if (point) { marker.style.left = `${point.x}%`; marker.style.top = `${point.y}%`; }
}

export function hudNavigationMarkup(muted: boolean): string {
  return `<div class="hud-tools" role="group" aria-label="${e(t('Game controls'))}"><button class="hud-round" type="button" data-view="help" aria-label="${e(t('Help'))}">?</button><button class="hud-round" type="button" data-action="fullscreen" aria-label="${e(t('Full screen'))}">${icon('expand')}</button><button class="hud-round" id="hud-sound" type="button" data-action="sound" aria-label="${e(t('Sound'))}" aria-pressed="${!muted}">${icon(muted ? 'muted' : 'volume')}</button></div>
    <aside class="hud-minimap" id="hud-minimap" aria-label="${e(t('Town map · resident meeting places'))}"></aside>
    <aside class="hud-local hud-painted-panel" aria-label="${e(t('Local presence'))}"><div class="hud-local-heading">${icon('users')}<strong id="hud-local-place"></strong><span>${e(t('Local'))}</span></div><p id="hud-local-status" role="status"></p></aside>
    <div class="hud-dock-area"><nav class="hud-dock hud-painted-panel" aria-label="${e(t('Adventure menu'))}"><button type="button" class="hud-dock-item hud-dock-atlas game-menu-button" data-view="atlas" aria-label="${e(t('Atlas'))}"><span class="hud-dock-art" aria-hidden="true"><img src="/assets/ui/atlas-medallion-v2.webp" alt=""/></span><span>${e(t('Atlas'))}</span><kbd aria-hidden="true">M</kbd></button></nav></div>
    <button class="hud-revisit hud-painted-panel" id="hud-revisit" type="button" data-action="review" hidden>${icon('leaf')}<span id="hud-revisit-label"></span>${icon('arrow')}</button>`;
}

export interface HudChapter {
  chapter: string;
  title: string;
  summary: string;
  done: number;
  total: number;
  reward: number;
}

/** Additional desktop detail inside the existing story button; mobile keeps the objective beacon. */
export function hudChapterMarkup(chapter: HudChapter): string {
  return `<span class="hud-chapter-heading"><span class="beacon-label">${e(chapter.chapter)}</span><strong>${e(chapter.title)}</strong></span><span class="hud-chapter-summary">${e(chapter.summary)}</span><span class="hud-chapter-progress"><span>${e(t('{done}/{total} stories discovered', { done: chapter.done, total: chapter.total }))}</span>${chapter.reward > 0 ? `<span>+${chapter.reward} XP</span>` : ''}</span><span class="hud-chapter-continue">${e(t('Continue story'))}${icon('arrow')}</span>`;
}
