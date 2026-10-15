/**
 * The Map editor section of the admin area. It edits the published world
 * directly: every change is checked by the server and goes live for players.
 */
import * as Phaser from 'phaser';
import './world-edit.css';
import {AdminMapScene} from './admin-map-canvas';
import {renderResidentTools} from './admin-residents';
import {escapeHtml as escape} from './icons';
import {maps,type MapId} from './maps';
import {getWorldScene,loadPublishedWorld,sceneContentVersion,sceneDocument} from './scene-data';
import {applyWorldPatch} from './world-patch';
import {parseWorldSceneDocument,sceneEntrances,type WorldScene} from './scene-schema';
import {EditBridge,type EditState} from './world-edit-mode';
import {WorldEditOverlay} from './world-edit-overlay';
import {auditScene,roomNames,SceneReach,townName,type WorldProblem} from './world-edit-rules';
import {WorldEditRequestError,WorldEditSession,type EditResult} from './world-edit-session';

type Tab = 'edit' | 'town' | 'residents' | 'story';
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export interface MapEditorHandle { destroy(): void; }
export interface MapEditorOptions {
  token: () => string;
  selfId: () => string;
  /** Extra tab content provided by other admin features. */
  storyTab?: (host: HTMLElement, session: WorldEditSession) => void;
}

export async function mountMapEditor(host: HTMLElement, options: MapEditorOptions): Promise<MapEditorHandle> {
  host.innerHTML = `<header class="topbar map-topbar"><div><strong>Map editor</strong><span id="map-status" role="status">Loading the published world…</span></div>
      <div class="toolbar"><label class="select-label">Town<select id="map-town">${maps.map(map => `<option value="${map.id}">${escape(map.name)}</option>`).join('')}</select></label>
      <button id="map-fit" type="button">Fit</button><button id="map-export" type="button">Export</button><button id="map-import" type="button">Import</button>
      <input id="map-import-file" type="file" accept=".json,application/json" hidden></div></header>
    <div class="map-editor"><div class="map-canvas" id="map-canvas" aria-label="Town map. Drag objects to move them. Scroll to zoom. Right-drag or hold Space to pan."></div>
      <aside class="map-panel"><nav class="map-tabs" role="tablist">
        <button type="button" role="tab" data-tab="edit" aria-selected="true">Edit</button>
        <button type="button" role="tab" data-tab="town">Town</button>
        <button type="button" role="tab" data-tab="residents">Residents</button>
        ${options.storyTab ? '<button type="button" role="tab" data-tab="story">Story</button>' : ''}
      </nav>
      <div class="map-tab" data-panel="edit"></div><div class="map-tab" data-panel="town" hidden></div>
      <div class="map-tab" data-panel="residents" hidden></div><div class="map-tab" data-panel="story" hidden></div>
      <p class="map-help">Drag to move. Scroll to zoom. Right-drag, Space-drag or WASD to pan. Esc deselects.</p></aside></div>`;
  const query = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const status = (text: string) => { query('#map-status').textContent = text; };
  await loadPublishedWorld();
  let mapId: MapId = maps[0].id, tab: Tab = 'edit', lastState: EditState | undefined, destroyed = false;

  const session = new WorldEditSession(options.token, () => sceneDocument);
  const overlay = new WorldEditOverlay({mount: query('[data-panel="edit"]')});
  const view = {
    state: (state: EditState) => {
      const selectionChanged = lastState?.selection?.target.id !== state.selection?.target.id;
      lastState = state; overlay.state(state);
      if (tab === 'residents' && selectionChanged) renderResidents();
    },
    toast: (message: string, error?: boolean) => overlay.toast(message, error),
  };
  const bridge = new EditBridge(session, view, options.selfId, () => undefined);
  overlay.bridge = bridge;

  const game = new Phaser.Game({type: Phaser.AUTO, parent: query('#map-canvas'), backgroundColor: '#c8d0bc', banner: false,
    scale: {mode: Phaser.Scale.RESIZE, width: '100%', height: '100%'}, render: {antialias: true, roundPixels: false},
    input: {activePointers: 1}, scene: [AdminMapScene]});
  const scene = await new Promise<AdminMapScene>(resolve => {
    const check = () => { const value = game.scene.getScene('admin-map') as AdminMapScene | null; if (value) void value.created.then(() => resolve(value)); else requestAnimationFrame(check); };
    check();
  });

  /** Our own accepted edits apply locally when we were up to date; otherwise reload. */
  session.onApplied = (result: EditResult) => {
    if (result.from === sceneContentVersion && applyWorldPatch(result.from, result.contentVersion, result.applied)) { scene.refresh(); afterChange(); }
    else void reloadWorld();
  };
  const afterChange = () => {
    status(`Published · ${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`);
    if (tab === 'town') renderTown(); else if (tab === 'residents') renderResidents();
  };
  let reloading = false;
  const reloadWorld = async (rebuild = false) => {
    if (reloading) return;
    reloading = true;
    try {
      const before = getWorldScene(mapId);
      await loadPublishedWorld();
      const after = getWorldScene(mapId);
      if (rebuild || after.width !== before.width || after.height !== before.height) await scene.rebuild(bridge);
      else scene.refresh();
      afterChange();
    } catch (error) { overlay.toast(error instanceof Error ? error.message : 'The world could not be reloaded.', true); }
    finally { reloading = false; }
  };

  // Other admins' edits and locks.
  const poll = window.setInterval(() => {
    if (destroyed || document.hidden) return;
    void session.status(mapId).then(value => {
      bridge.setLocks(value.locks);
      if (value.contentVersion !== sceneContentVersion && !lastState?.busy) void reloadWorld();
    }).catch(() => undefined);
  }, 3000);

  const showTown = async (id: MapId) => {
    mapId = id;
    status(`Loading ${townName(id)}…`);
    await scene.show(id, bridge);
    status(`${townName(id)} · changes go live for everyone`);
    if (tab === 'town') renderTown(); else if (tab === 'residents') renderResidents();
  };

  // Town summary ------------------------------------------------------------------
  let audit: WorldProblem[] | undefined;
  const renderTown = () => {
    const panel = query('[data-panel="town"]'), town: WorldScene = getWorldScene(mapId);
    const rooms = new Map(sceneEntrances(town).map(entrance => [entrance.interiorId, entrance.ownerId]));
    const problems = audit ?? [];
    panel.innerHTML = `<h3>${escape(townName(mapId))}</h3>
      <dl class="map-facts"><div><dt>Objects</dt><dd>${town.scenery.length}</dd></div><div><dt>Story characters</dt><dd>${town.npcs.length}</dd></div>
        <div><dt>Residents</dt><dd>${town.residents?.length ?? 0}</dd></div><div><dt>Activity spots</dt><dd>${town.activities?.length ?? 0}</dd></div></dl>
      <h4>Rooms</h4><ul class="map-rooms">${(['cafe', 'bakery', 'supermarket', 'inn'] as const).map(kind => {
        const owner = rooms.get(kind);
        return `<li><span>${escape(roomNames[kind])}</span>${owner ? `<button type="button" data-focus="${escape(owner)}">Show</button>` : '<em>Missing</em>'}</li>`;
      }).join('')}</ul>
      <h4>Check the town</h4><p class="map-note">Checks that players can reach every story character, door and resident spot from the arrival point.</p>
      <button type="button" data-audit>Check now</button>
      ${audit ? problems.length ? `<ul class="map-problems">${problems.map(problem => `<li class="${problem.severity}"><span>${escape(problem.message)}</span>${problem.objectIds[0] || problem.point ? `<button type="button" data-focus="${escape(problem.objectIds[0] ?? '')}" data-x="${problem.point?.x ?? ''}" data-y="${problem.point?.y ?? ''}">Show</button>` : ''}</li>`).join('')}</ul>`
        : '<p class="map-note good">Everything players need is reachable.</p>' : ''}`;
  };

  // Residents ------------------------------------------------------------------------
  const renderResidents = () => {
    const panel = query('[data-panel="residents"]'), selected = lastState?.selection?.item ? new Set([lastState.selection.item.id]) : new Set<string>();
    renderResidentTools(panel, getWorldScene(mapId), selected, next => {
      void session.commit([{kind: 'residents', map: mapId, residents: next.residents ?? []}])
        .then(result => { for (const warning of result.warnings) overlay.toast(warning.message); })
        .catch(error => overlay.toast(error instanceof Error ? error.message : 'The schedule could not be saved.', true));
    }, message => overlay.toast(message, true));
  };

  // Events -------------------------------------------------------------------------------
  const selectTab = (next: Tab) => {
    tab = next;
    host.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === next)));
    host.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== next; });
    if (next === 'town') renderTown();
    else if (next === 'residents') renderResidents();
    else if (next === 'story') options.storyTab?.(query('[data-panel="story"]'), session);
  };
  host.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const tabButton = target.closest<HTMLButtonElement>('[data-tab]');
    if (tabButton) { selectTab(tabButton.dataset.tab as Tab); return; }
    const focus = target.closest<HTMLButtonElement>('[data-focus]');
    if (focus) {
      const town = getWorldScene(mapId), id = focus.dataset.focus;
      const item = town.scenery.find(value => value.id === id) ?? town.npcs.find(value => value.id === id) ?? town.objects.find(value => value.id === id);
      const point = item ?? (focus.dataset.x ? {x: Number(focus.dataset.x), y: Number(focus.dataset.y)} : undefined);
      if (point) scene.focus(point);
      return;
    }
    if (target.closest('[data-audit]')) {
      const button = target.closest<HTMLButtonElement>('[data-audit]')!;
      button.disabled = true; button.textContent = 'Checking…';
      // Let the button repaint before the grid work starts.
      window.setTimeout(() => { const town = getWorldScene(mapId); audit = auditScene(town, SceneReach.build(town)); renderTown(); }, 30);
    }
  });
  query<HTMLSelectElement>('#map-town').onchange = event => {
    const select = event.target as HTMLSelectElement;
    select.disabled = true;
    void showTown(select.value as MapId).finally(() => { select.disabled = false; });
  };
  query('#map-fit').onclick = () => scene.fit();
  query('#map-export').onclick = async () => {
    try {
      const world = await session.loadWorld();
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(world.document, null, 2)}\n`], {type: 'application/json'}));
      const link = document.createElement('a'); link.href = url; link.download = `glotworld-world-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { overlay.toast(error instanceof Error ? error.message : 'Export failed.', true); }
  };
  const file = query<HTMLInputElement>('#map-import-file');
  query('#map-import').onclick = () => file.click();
  file.onchange = async () => {
    const chosen = file.files?.[0]; file.value = '';
    if (!chosen) return;
    try {
      if (chosen.size > MAX_IMPORT_BYTES) throw new Error('Choose a world file up to 2 MB.');
      let document;
      try { document = parseWorldSceneDocument(JSON.parse(await chosen.text())); }
      catch (error) { throw new Error(`This is not a world file: ${error instanceof Error ? error.message.replace(/^Invalid world scene: /, '') : 'unreadable'}`, {cause: error}); }
      status('Checking the imported world…');
      await session.validate(document);
      if (!confirm('Replace the whole published world with this file? Players see it immediately.')) { status(`${townName(mapId)} · changes go live for everyone`); return; }
      const current = await session.loadWorld();
      await session.replaceWorld(document, current.revision);
      await reloadWorld(true);
      overlay.toast('The imported world is now live.');
    } catch (error) {
      const problems = error instanceof WorldEditRequestError ? error.problems : [];
      overlay.toast(error instanceof Error ? error.message : 'Import failed.', true);
      if (problems.length > 1) { audit = problems; selectTab('town'); }
      status(`${townName(mapId)} · changes go live for everyone`);
    }
  };

  await showTown(mapId);
  return {
    destroy() {
      destroyed = true;
      window.clearInterval(poll);
      session.dispose();
      overlay.destroy();
      game.destroy(true);
    },
  };
}
