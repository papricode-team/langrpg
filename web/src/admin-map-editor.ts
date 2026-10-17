import {getInterior} from './interiors';
import {roomLayoutFingerprint} from './room-layout';
import {animalSpawns} from './animal-spawns';
import {animalSpecies, animalVariants, animalName, type AnimalSpecies} from './animal-types';
/**
 * The Map editor section of the admin area. It edits the published world
 * directly: every change shows at once, is checked by the server in the
 * background and goes live for players.
 *
 * Layout: modes and history along the top, the object library and the town's
 * layer list on the left, the canvas in the middle and an inspector for the
 * selection on the right. Everything has a keyboard shortcut; press ? to see them.
 */
import * as Phaser from 'phaser';
import './world-edit.css';
import './map-editor.css';
import {AdminMapScene,type MapItem,type MapLayers} from './admin-map-canvas';
import {AdminTerrainEditor} from './admin-terrain-editor';
import {renderResidentTools} from './admin-residents';
import {escapeHtml as escape,icon} from './icons';
import {MapEditStore,type StoreFailure} from './map-edit-store';
import {maps,type MapId} from './maps';
import {getWorldScene,loadPublishedWorld,replacePublishedWorld,sceneContentVersion,sceneDocument} from './scene-data';
import {buildingRoomKind,parseWorldSceneDocument,sceneEntrances,type SceneInteriorKind,type ScenePoint,type SceneScenery,type WorldScene} from './scene-schema';
import {catalogueGroups,variantChoices,variantLabel} from './world-edit-catalogue';
import {applyEditOps,nextObjectId,type WorldEditOp} from './world-edit-ops';
import {defaultActivities,paletteChoices,type PaletteChoice} from './world-edit-palette';
import {assetLabel,auditScene,clampSize,objectLabel,placementProblems,roomNames,roomOptions,SceneReach,sizeRange,townName,type WorldProblem} from './world-edit-rules';
import {WorldEditRequestError,WorldEditSession,type WorldLock} from './world-edit-session';

type Mode = 'objects' | 'terrain' | 'residents' | 'story';
type Side = 'library' | 'layers';
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
/** Taking an edit lock per object is only worth it for a hand-picked selection. */
const MAX_LOCKS = 12;
const PASTE_OFFSET = 32;

export interface MapEditorHandle { destroy(): void; }
export interface MapEditorOptions {
  /** Optional isolated transport for local authoring studies. Never used by the admin page. */
  request?: typeof fetch;
  localDraft?: boolean;
  token: () => string;
  selfId: () => string;
  /** Extra tab content provided by other admin features. */
  storyTab?: (host: HTMLElement, session: WorldEditSession, hooks: {showOnMap(npcId: string): boolean}) => void;
}

const capital = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = mac ? '⌘' : 'Ctrl';
const shortcuts: [string, string][] = [
  ['V', 'Select and move'], ['H or hold Space', 'Pan'], ['A or /', 'Find an object to add'],
  ['Click · Shift-click', 'Select · add to selection'], ['Drag on empty ground', 'Select everything in a box'],
  ['Arrows · Shift+Arrows', 'Nudge 1 · 10 units'], ['Shift while dragging', 'Keep to one axis'], ['Alt while dragging', 'Toggle grid snapping'],
  [`${mod}+D`, 'Duplicate'], [`${mod}+C · ${mod}+V`, 'Copy · paste at the pointer'], ['Delete or Backspace', 'Remove'],
  ['X', 'Flip'], ['[ · ]', 'Smaller · larger'], [`${mod}+A`, 'Select all objects'],
  [`${mod}+Z · ${mod}+Shift+Z`, 'Undo · redo'], ['F', 'Zoom to selection'], ['0 or Shift+1', 'Fit the town'], ['+ · −', 'Zoom in · out'],
  ['G', 'Grid snapping on or off'], ['Esc', 'Stop placing, cancel or deselect'], ['Two-finger scroll · pinch', 'Pan · zoom'],
];

export async function mountMapEditor(host: HTMLElement, options: MapEditorOptions): Promise<MapEditorHandle> {
  if (options.localDraft && !options.request) throw new Error('A local draft needs an isolated transport.');
  const live = options.localDraft ? 'Saved in this browser' : 'Live for everyone';
  host.innerHTML = `<div class="me" data-mode="objects">
    <header class="me-bar">
      <div class="me-group"><strong class="me-title">Map editor</strong>
        <label class="me-town"><span class="me-sr">Town</span><select id="me-town">${maps.map(map => `<option value="${map.id}">${escape(map.name)}</option>`).join('')}</select></label></div>
      <nav class="me-modes" aria-label="Editing mode">${(['objects', 'terrain', 'residents', ...(options.storyTab ? ['story'] : [])] as Mode[]).map(mode =>
        `<button type="button" data-mode-button="${mode}" aria-pressed="${mode === 'objects'}">${capital(mode)}</button>`).join('')}</nav>
      <div class="me-group">
        <button type="button" class="me-icon" data-cmd="undo" disabled><span aria-hidden="true">↶</span><span class="me-sr">Undo</span></button>
        <button type="button" class="me-icon" data-cmd="redo" disabled><span aria-hidden="true">↷</span><span class="me-sr">Redo</span></button>
        <span class="me-save" role="status" data-state="idle">${live}</span>
        <details class="me-menu"><summary>View</summary><div class="me-menu-body">
          <label><input type="checkbox" data-layer="labels" checked> Names of story markers</label>
          <label><input type="checkbox" data-layer="footprints"> Object footprints</label>
          <label><input type="checkbox" data-layer="walkable"> Walking areas and walls</label>
          <label><input type="checkbox" data-layer="grid"> Grid</label>
          <label><input type="checkbox" data-snap> Snap to grid <kbd>G</kbd></label></div></details>
        <details class="me-menu"><summary>File</summary><div class="me-menu-body">
          <button type="button" data-cmd="export">Export world file</button><button type="button" data-cmd="import">Import world file…</button>
          <input id="me-import-file" type="file" accept=".json,application/json" hidden></div></details>
        <button type="button" class="me-icon" data-cmd="help" title="Keyboard shortcuts (?)">${icon('keyboard')}<span class="me-sr">Keyboard shortcuts</span></button>
      </div>
    </header>
    <div class="me-body">
      <aside class="me-left" aria-label="Objects">
        <div class="me-tabs" role="tablist"><button type="button" role="tab" data-side="library" aria-selected="true">Add</button><button type="button" role="tab" data-side="layers" aria-selected="false">Layers</button></div>
        <section data-side-panel="library"><input type="search" class="me-search" id="me-library-search" placeholder="Search objects" autocomplete="off">
          <div class="me-chips" role="group" aria-label="Object groups"></div><div class="me-library" aria-label="Objects you can add"></div></section>
        <section data-side-panel="layers" hidden><input type="search" class="me-search" id="me-layer-search" placeholder="Find in this town" autocomplete="off">
          <div class="me-layers" role="listbox" aria-multiselectable="true" aria-label="Everything in this town"></div></section>
      </aside>
      <main class="me-stage">
        <div class="me-canvas" id="me-canvas" aria-label="Town map"></div>
        <div class="me-tools" role="toolbar" aria-label="Canvas">
          <button type="button" data-tool="select" aria-pressed="true" title="Select and move (V)">Select</button>
          <button type="button" data-tool="hand" aria-pressed="false" title="Pan (H or hold Space)">Pan</button>
          <span class="me-divider"></span>
          <button type="button" class="me-icon" data-cmd="zoom-out" title="Zoom out (−)">${icon('minus')}<span class="me-sr">Zoom out</span></button>
          <button type="button" class="me-zoom" data-cmd="zoom-reset" title="Zoom to 100% (1)">100%</button>
          <button type="button" class="me-icon" data-cmd="zoom-in" title="Zoom in (+)">${icon('plus')}<span class="me-sr">Zoom in</span></button>
          <button type="button" data-cmd="fit" title="Fit the town (0)">Fit</button>
        </div>
        <p class="me-hint" role="status"></p>
        <div class="me-toasts" aria-live="polite"></div>
      </main>
      <aside class="me-right" aria-label="Inspector">
        <div class="me-panel" data-panel="objects"></div>
        <div class="me-panel map-tab" data-panel="terrain" hidden></div>
        <div class="me-panel map-tab" data-panel="residents" hidden></div>
        <div class="me-panel" data-panel="story" hidden></div>
      </aside>
    </div>
    <dialog class="me-help" aria-label="Keyboard shortcuts"><header><h2>Keyboard shortcuts</h2><button type="button" data-cmd="close-help" class="me-icon">${icon('close')}<span class="me-sr">Close</span></button></header>
      <dl>${shortcuts.map(([keys, action]) => `<div><dt>${escape(keys)}</dt><dd>${escape(action)}</dd></div>`).join('')}</dl></dialog>
  </div>`;
  const root = host.querySelector<HTMLElement>('.me')!;
  const query = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const panel = (name: Mode) => query(`[data-panel="${name}"]`);

  await loadPublishedWorld(options.request);
  let mapId: MapId = maps[0].id, mode: Mode = 'objects', side: Side = 'library', destroyed = false;
  let selection: readonly MapItem[] = [], placing: PaletteChoice | undefined, pointer: ScenePoint | undefined;
  let group = '', librarySearch = '', layerSearch = '', audit: WorldProblem[] | undefined;
  let clipboard: SceneScenery[] = [];
  const locks = new Map<string, string>();
  const held = new Set<string>();
  const layers: MapLayers = {labels: true, footprints: false, walkable: false, grid: false};

  const session = new WorldEditSession(options.token, () => sceneDocument, options.request);

  // Toasts --------------------------------------------------------------------------------------
  const toasts = query('.me-toasts');
  const toast = (message: string, error = false, focus?: {ids: string[]; point?: ScenePoint}) => {
    const item = document.createElement('div');
    item.className = `me-toast${error ? ' error' : ''}`;
    item.setAttribute('role', error ? 'alert' : 'status');
    item.innerHTML = `<span>${escape(message)}</span>${focus ? '<button type="button">Show</button>' : ''}`;
    item.querySelector('button')?.addEventListener('click', () => { showProblem(focus!); item.remove(); });
    toasts.append(item);
    while (toasts.children.length > 3) toasts.firstElementChild?.remove();
    window.setTimeout(() => item.remove(), error ? 8000 : 4000);
  };
  const problemToast = (problem: Pick<WorldProblem, 'message' | 'objectIds' | 'point'>) =>
    toast(problem.message, true, problem.objectIds.length || problem.point ? {ids: problem.objectIds, point: problem.point} : undefined);

  // Store -------------------------------------------------------------------------------------------
  let renderQueued = false;
  let roomSave: {map:string;id:string;fingerprint:string;resolve:(saved:boolean)=>void;reject:(error:Error)=>void;error?:string} | undefined;
  const store = new MapEditStore(sceneDocument, sceneContentVersion, {send: ops => session.send(ops)}, {
    changed: changedMaps => {
      replacePublishedWorld(store.document, store.version);
      if (changedMaps.has(mapId)) scene.refresh();
      queueRender();
    },
    failed: (failure: StoreFailure) => {
      if (roomSave && failure.label === 'Edit room layout') roomSave.error = failure.message;
      const first = failure.problems.find(problem => problem.severity === 'error');
      if (first) problemToast({...first, message: `${failure.label} was undone: ${first.message}`});
      else toast(`${failure.label} was undone: ${failure.message}`, true);
      saveState('error');
    },
    stale: () => reloadWorld(),
    warned: problems => {
      for (const problem of problems.filter(value => value.severity === 'warning').slice(0, 2))
        toast(problem.message, false, problem.objectIds.length || problem.point ? {ids: problem.objectIds, point: problem.point} : undefined);
    },
    saving: active => {
      saveState(active ? 'saving' : 'idle');
      if (!active && roomSave) {
        const pending = roomSave; roomSave = undefined;
        const saved = store.document.maps[pending.map]?.scenery.find(item=>item.id===pending.id)?.roomLayout;
        if (pending.error || roomLayoutFingerprint(saved) !== pending.fingerprint) pending.reject(new Error(pending.error ?? 'The room changed before it could be saved. Reopen its layout to refresh.'));
        else pending.resolve(true);
      }
    },
  });
  let saveError = 0;
  const saveState = (state: 'saving' | 'idle' | 'error') => {
    const pill = query('.me-save');
    if (state === 'error') { saveError = window.setTimeout(() => saveState('idle'), 4000); pill.dataset.state = 'error'; pill.textContent = 'Change refused'; return; }
    if (pill.dataset.state === 'error' && state === 'idle' && saveError) { window.clearTimeout(saveError); saveError = 0; }
    pill.dataset.state = state;
    pill.textContent = state === 'saving' ? 'Saving…' : store.lastSaved ? `${live} · ${store.lastSaved.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}` : live;
  };

  /** The first shape, bounds or spacing problem in operations, or an error when they do not apply. */
  const problemIn = (ops: WorldEditOp[]): WorldProblem | Error | undefined => {
    let result;
    try { result = applyEditOps(store.document, ops); }
    catch (error) { return (error as {problems?: WorldProblem[]})?.problems?.[0] ?? (error instanceof Error ? error : new Error(String(error))); }
    for (const [map, ids] of result.changed) {
      const problem = placementProblems(store.document.maps[map], result.document.maps[map], ids, undefined, result.restored).find(value => value.severity === 'error');
      if (problem) return problem;
    }
    return undefined;
  };
  /** Check operations against the shape rules and apply them. Routes are checked by the server. */
  let roomEditor: {destroy():void} | undefined;
  const editRoom = async () => {
    const item = getWorldScene(mapId).scenery.find(item=>selection.length===1 && item.id===selection[0].id), kind = item && buildingRoomKind(item);
    if (!item || !kind || locks.has(item.id)) return;
    const editingMap = mapId, expected = roomLayoutFingerprint(item.roomLayout);
    const {openRoomEditor} = await import('./admin-room-editor');
    if (destroyed) return;
    roomEditor?.destroy();
    roomEditor = openRoomEditor(getInterior(kind),item.roomLayout,layout=>new Promise<boolean>((resolve,reject)=>{
      roomSave = {map:editingMap,id:item.id,fingerprint:roomLayoutFingerprint(layout),resolve,reject};
      if (!commit([{kind:'room',map:editingMap,id:item.id,layout,expected}],'Edit room layout')) {roomSave = undefined;reject(new Error('The room changed or is no longer editable. Reopen its layout to refresh.'));}
    }),objectLabel(getWorldScene(editingMap),item.id));
  };
  const commit = (ops: WorldEditOp[], label: string, check = true): boolean => {
    if (!ops.length) return false;
    const problem = check ? problemIn(ops) : undefined;
    if (problem instanceof Error) { failWith(problem); return false; }
    if (problem) { problemToast(problem); return false; }
    try { store.commit(ops, label); return true; }
    catch (error) { failWith(error); return false; }
  };
  const failWith = (error: unknown) => {
    const problem = (error as {problems?: WorldProblem[]})?.problems?.[0];
    if (problem) problemToast(problem); else toast(error instanceof Error ? error.message : 'That change could not be made.', true);
  };

  // Canvas ---------------------------------------------------------------------------------------------
  const game = new Phaser.Game({type: Phaser.AUTO, parent: query('#me-canvas'), backgroundColor: '#c8d0bc', banner: false,
    scale: {mode: Phaser.Scale.RESIZE, width: '100%', height: '100%'}, render: {antialias: true, roundPixels: false},
    input: {activePointers: 1}, scene: [AdminMapScene]});
  const scene = await new Promise<AdminMapScene>(resolve => {
    const check = () => { const value = game.scene.getScene('admin-map') as AdminMapScene | null; if (value) void value.created.then(() => resolve(value)); else requestAnimationFrame(check); };
    check();
  });
  scene.attach({
    commit,
    place: item => {
      const town = getWorldScene(mapId), activities = defaultActivities(town, item);
      return commit([{kind: 'place', map: mapId, item, ...(activities.length ? {activities} : {})}], `Add ${assetLabel(item)}`);
    },
    selectionChanged: next => { selection = next; syncLocks(); queueRender(); revealInLayers(); },
    placingChanged: choice => { placing = choice; renderLibrary(); renderHint(); },
    pointer: point => { pointer = point; renderHint(); },
    zoomChanged: zoom => { query('.me-zoom').textContent = `${Math.round(zoom * 100)}%`; },
    locks: () => locks,
    toast,
  });

  const terrainEditor = new AdminTerrainEditor(panel('terrain'), scene, {
    commit: (ops, label) => commit(ops, label, false),
    undo: () => { undo(); },
    get canUndo() { return store.canUndo; },
    toast,
  });

  // Locks: hold what is selected so no other admin changes it meanwhile ------------------------------
  const syncLocks = () => {
    const wanted = new Set(selection.length <= MAX_LOCKS ? selection.map(item => item.id) : []);
    for (const id of [...held]) if (!wanted.has(id)) { held.delete(id); void session.release(mapId, id).catch(() => undefined); }
    for (const id of wanted) {
      if (held.has(id)) continue;
      held.add(id);
      const map = mapId;
      void session.lock(map, id).then(applyLocks).catch((error: Error) => {
        held.delete(id);
        if (map !== mapId || !selection.some(item => item.id === id)) return;
        toast(error.message, true);
        scene.setSelection(selection.filter(item => item.id !== id));
      });
    }
  };
  const applyLocks = (list: readonly WorldLock[]) => {
    const next = new Map(list.filter(lock => lock.adminId !== options.selfId() && lock.map === mapId).map(lock => [lock.id, lock.adminName]));
    if (next.size === locks.size && [...next].every(([id, name]) => locks.get(id) === name)) return;
    locks.clear();
    for (const [id, name] of next) locks.set(id, name);
    queueRender();
  };

  // Loading -------------------------------------------------------------------------------------------
  let reloading: Promise<void> | undefined;
  const reloadWorld = (rebuild = false): Promise<void> => reloading ??= (async () => {
    try {
      const before = getWorldScene(mapId);
      await loadPublishedWorld(options.request);
      store.rebase(sceneDocument, sceneContentVersion);
      const after = getWorldScene(mapId);
      if (rebuild || after.width !== before.width || after.height !== before.height) await scene.rebuild();
      if (mode === 'terrain') terrainEditor.refresh();
    } catch (error) { toast(error instanceof Error ? error.message : 'The world could not be reloaded.', true); }
    finally { reloading = undefined; }
  })();

  // Other admins' edits and locks.
  const poll = window.setInterval(() => {
    if (destroyed || document.hidden) return;
    // A reply asked for before our own save finished still names the old version; that is not someone else's edit.
    const asked = store.version, busy = store.busy;
    void session.status(mapId).then(value => {
      applyLocks(value.locks);
      if (value.contentVersion !== store.version && !busy && !store.busy && store.version === asked) void reloadWorld();
    }).catch(() => undefined);
  }, 3000);

  const showTown = async (id: MapId) => {
    scene.commitNudge();
    mapId = id; audit = undefined; group = '';
    locks.clear();
    await scene.show(id);
    if (mode === 'terrain') terrainEditor.refresh();
    void session.status(mapId).then(value => applyLocks(value.locks)).catch(() => undefined);
    queueRender();
  };

  // Rendering -----------------------------------------------------------------------------------------
  function queueRender(): void {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (destroyed) return;
      renderHistory();
      if (mode === 'objects') renderInspector();
      else if (mode === 'residents') renderResidents();
      if (side === 'layers') renderLayers(); else renderLibrary();
      renderHint();
    });
  }

  const renderHistory = () => {
    const undoButton = query<HTMLButtonElement>('[data-cmd="undo"]'), redoButton = query<HTMLButtonElement>('[data-cmd="redo"]');
    undoButton.disabled = !store.canUndo; redoButton.disabled = !store.canRedo;
    undoButton.title = store.undoLabel ? `Undo ${store.undoLabel} (${mod}+Z)` : 'Nothing to undo';
    redoButton.title = store.redoLabel ? `Redo ${store.redoLabel} (${mod}+Shift+Z)` : 'Nothing to redo';
  };

  const renderHint = () => {
    const hint = query('.me-hint');
    const where = pointer ? `<span class="me-coords">${Math.round(pointer.x)}, ${Math.round(pointer.y)}</span>` : '';
    let text: string;
    if (mode === 'terrain') text = 'Pick a piece or a ground material on the right · Delete removes the selected piece · Space-drag to pan';
    else if (placing) text = `Click to place ${variantLabel(placing)}. Shift-click places another. Esc stops.`;
    else if (selection.length && selection.every(item => item.kind === 'animal')) text = 'Drag to move home · Arrows nudge · Delete removes · Changes save automatically';
    else if (selection.length) text = 'Drag to move · Arrows nudge · Delete removes · ' + `${mod}+D duplicates`;
    else text = 'Click to select · Drag empty ground to select a group · Space-drag or two fingers to pan · Pinch or ' + `${mod}+scroll to zoom`;
    hint.innerHTML = `<span>${escape(text)}</span>${where}`;
  };

  // Library ---------------------------------------------------------------------------------------------
  let libraryKey = '';
  function renderLibrary(): void {
    if (side !== 'library') return;
    const choices = paletteChoices(mapId), groups = catalogueGroups(choices);
    const search = librarySearch.trim().toLocaleLowerCase();
    const key = JSON.stringify([mapId, group, search, placing?.frame]);
    if (key === libraryKey) return;
    libraryKey = key;
    query('.me-chips').innerHTML = [{asset: '', label: 'All'}, {asset: 'animals', label: 'Animals'}, ...groups].map(value =>
      `<button type="button" data-group="${value.asset}" aria-pressed="${value.asset === group}">${escape(capital(value.label))}</button>`).join('');
    const shown = choices.filter(choice => (!group || choice.asset === group)
      && (!search || `${variantLabel(choice)} ${assetLabel(choice)} ${choice.frame}`.toLocaleLowerCase().includes(search)));
    const animalChoices = animalSpecies.flatMap(species => animalVariants[species].map((name, variant) => ({species, variant, name})))
      .filter(item => (!group || group === 'animals') && (!search || `${item.species} ${item.name} animal`.toLowerCase().includes(search)));
    const animalHtml = animalChoices.map(item => {
      const image = scene.animalThumbnail(item.species, item.variant);
      return `<button type="button" data-animal-species="${item.species}" data-animal-variant="${item.variant}" title="Place ${escape(item.name)}">
        ${image ? `<img src="${image}" alt="" draggable="false">` : ''}<span>${escape(item.name)}</span></button>`;
    }).join('');
    query('.me-library').innerHTML = animalHtml + (shown.length ? shown.map(choice => {
      const image = scene.thumbnail(choice.frame), active = placing?.frame === choice.frame;
      return `<button type="button" data-place="${escape(choice.frame)}" aria-pressed="${active}" title="${escape(capital(variantLabel(choice)))}${choice.rooms.length ? ' · can hold a room' : ''}">
        ${image ? `<img src="${escape(image)}" alt="" draggable="false">` : '<span class="me-noimage"></span>'}<span>${escape(capital(variantLabel(choice)))}</span></button>`;
    }).join('') : animalHtml ? '' : `<p class="me-empty">No objects match “${escape(librarySearch)}”.</p>`);
  }

  // Layers ------------------------------------------------------------------------------------------------
  let layersKey = '';
  function renderLayers(): void {
    if (side !== 'layers') return;
    const town = getWorldScene(mapId), search = layerSearch.trim().toLocaleLowerCase(), chosen = new Set(selection.map(item => item.id));
    const key = JSON.stringify([mapId, store.document === sceneDocument ? store.version : '', town.scenery.length, search, [...chosen], town.scenery.map(item => item.id).join(), animalSpawns(town)]);
    if (key === layersKey) return;
    layersKey = key;
    const match = (label: string, id: string) => !search || label.toLocaleLowerCase().includes(search) || id.includes(search);
    const sections: {title: string; rows: {kind: MapItem['kind']; id: string; label: string}[]}[] = [
      {title: 'Animals', rows: animalSpawns(town).map(item => ({kind: 'animal' as const, id: item.id, label: animalName(item)}))},
      {title: 'Story characters', rows: town.npcs.map(item => ({kind: 'npc' as const, id: item.id, label: objectLabel(town, item.id)}))},
      {title: 'Story evidence', rows: town.objects.map(item => ({kind: 'object' as const, id: item.id, label: capital(objectLabel(town, item.id).replace(/^the /, ''))}))},
    ];
    const byGroup = new Map<string, typeof sections[number]['rows']>();
    for (const item of town.scenery) {
      const title = capital(assetLabel({asset: item.asset}));
      const rows = byGroup.get(title) ?? [];
      rows.push({kind: 'scenery', id: item.id, label: capital(objectLabel(town, item.id))});
      byGroup.set(title, rows);
    }
    sections.push(...[...byGroup].map(([title, rows]) => ({title, rows})));
    const html = sections.map(section => {
      const rows = section.rows.filter(row => match(row.label, row.id));
      if (!rows.length) return '';
      const repeated = new Set(rows.filter((row, index) => rows.findIndex(other => other.label === row.label) !== index).map(row => row.label));
      return `<div class="me-layer-group"><h3>${escape(section.title)} <span>${rows.length}</span></h3>${rows.map(row =>
        `<button type="button" role="option" data-layer-id="${escape(row.id)}" data-layer-kind="${row.kind}" aria-selected="${chosen.has(row.id)}" title="${escape(row.id)}">
          <span class="me-layer-dot" data-kind="${row.kind}"></span><span>${escape(row.label)}${repeated.has(row.label) ? ` <i>${escape(row.id)}</i>` : ''}</span>${locks.has(row.id) ? `<em>${escape(locks.get(row.id)!)}</em>` : ''}</button>`).join('')}</div>`;
    }).join('');
    query('.me-layers').innerHTML = html || `<p class="me-empty">Nothing in ${escape(townName(mapId))} matches “${escape(layerSearch)}”.</p>`;
  }
  const revealInLayers = () => {
    if (side !== 'layers' || selection.length !== 1) return;
    requestAnimationFrame(() => query('.me-layers').querySelector(`[data-layer-id="${CSS.escape(selection[0].id)}"]`)?.scrollIntoView({block: 'nearest'}));
  };

  // Inspector ---------------------------------------------------------------------------------------------
  let inspectorKey = '';
  function renderInspector(): void {
    const target = panel('objects'), town = getWorldScene(mapId);
    const items = selection.map(item => item.kind === 'scenery' ? town.scenery.find(value => value.id === item.id) : undefined);
    const key = JSON.stringify([mapId, selection, items, animalSpawns(town), [...locks], selection.length ? '' : [town.scenery.length, town.npcs.length, audit, sceneEntrances(town)]]);
    // Rebuild only when what is shown changes, so typing in a field survives.
    if (key === inspectorKey) return;
    inspectorKey = key;
    if (!selection.length) { target.innerHTML = townPanel(town); return; }
    if (selection.length > 1) {
      const scenery = items.filter(Boolean).length, animals = selection.filter(item => item.kind === 'animal').length;
      target.innerHTML = `<header class="me-inspect-head"><div><h2>${selection.length} selected</h2><p>${scenery} objects${animals ? ` · ${animals} animals` : ''}${selection.length - scenery - animals ? ` · ${selection.length - scenery - animals} story markers` : ''}</p></div></header>
        <div class="me-actions">${scenery ? `<button type="button" data-cmd="flip">Flip <kbd>X</kbd></button><button type="button" data-cmd="duplicate">Duplicate objects <kbd>${mod}D</kbd></button>` : ''}${scenery || animals ? '<button type="button" data-cmd="delete" class="danger">Remove <kbd>⌫</kbd></button>' : ''}</div>
        <p class="me-note">Drag any of them to move the group. Arrow keys nudge.</p>`;
      return;
    }
    const entry = selection[0], item = items[0], locked = locks.get(entry.id), disabled = locked ? ' disabled' : '';
    const lockNote = locked ? `<p class="me-note warning">${escape(locked)} is editing this right now.</p>` : '';
    if (entry.kind === 'animal') {
      const animal = animalSpawns(town).find(value => value.id === entry.id);
      if (!animal) return;
      const image = scene.animalThumbnail(animal.species, animal.variant);
      target.innerHTML = `<header class="me-inspect-head">${image ? `<img src="${image}" alt="">` : ''}<div><h2>${escape(animalName(animal))}</h2><p>Animal home</p></div></header>${lockNote}
        <label class="me-field"><span>Species</span><select name="animal-species"${disabled}>${animalSpecies.map(species => `<option value="${species}"${species === animal.species ? ' selected' : ''}>${capital(species)}</option>`).join('')}</select></label>
        <label class="me-field"><span>Variant</span><select name="animal-variant"${disabled}>${animalVariants[animal.species].map((name, variant) => `<option value="${variant}"${variant === animal.variant ? ' selected' : ''}>${escape(name)}</option>`).join('')}</select></label>
        ${positionFields(animal, disabled)}
        <p class="me-note">Drag to move its home. Wanders nearby during the day, walks home at 18:00 and rests until 06:00. Changes save automatically.</p>
        <button type="button" data-cmd="delete" class="danger"${disabled}>Remove animal</button>`;
      return;
    }
    if (!item) {
      const anchor = (entry.kind === 'npc' ? town.npcs : town.objects).find(value => value.id === entry.id);
      if (!anchor) { target.innerHTML = ''; return; }
      target.innerHTML = `<header class="me-inspect-head"><span class="me-badge" data-kind="${entry.kind}"></span><div><h2>${escape(capital(objectLabel(town, entry.id)))}</h2><p>${entry.kind === 'npc' ? 'Story character' : 'Story evidence'}</p></div></header>${lockNote}
        ${positionFields(anchor, disabled)}
        <p class="me-note">${entry.kind === 'npc' ? 'Players talk to them here, so keep them beside a path.' : 'Players read it here, so keep it beside a path.'}</p>`;
      return;
    }
    const size = sizeRange(mapId, item), rooms = roomOptions(mapId, item), room = item.interior?.kind ?? '';
    const variants = variantChoices(paletteChoices(mapId), item), image = scene.thumbnail(item.frame ?? item.asset);
    target.innerHTML = `<header class="me-inspect-head">${image ? `<img src="${escape(image)}" alt="">` : ''}<div><h2>${escape(capital(objectLabel(town, item.id)))}</h2><p title="${escape(item.id)}">${escape(capital(assetLabel(item)))}</p></div></header>${lockNote}
      ${positionFields(item, disabled)}
      <div class="me-field"><span>Size</span><div class="me-size"><input type="range" name="size" min="${size.min}" max="${size.max}" step="1" value="${Math.min(size.max, Math.max(size.min, item.width))}"${disabled || size.min === size.max ? ' disabled' : ''} aria-label="Size">
        <input type="number" name="size-value" min="${size.min}" max="${size.max}" step="1" value="${Math.round(item.width)}"${disabled || size.min === size.max ? ' disabled' : ''} aria-label="Width"></div></div>
      <div class="me-toggles"><button type="button" data-cmd="flip" aria-pressed="${!!item.flipX}"${disabled}>Flipped <kbd>X</kbd></button>
        <button type="button" data-cmd="solid" aria-pressed="${item.collidable !== false}"${disabled} title="Players walk around it">Solid</button></div>
      ${rooms.length ? `<label class="me-field"><span>Room inside</span><select name="room"${disabled}><option value=""${room ? '' : ' selected'}>Default for this building</option>
        ${rooms.map(kind => `<option value="${kind}"${kind === room ? ' selected' : ''}>${escape(capital(roomNames[kind]))}</option>`).join('')}</select></label>` : ''}
      ${buildingRoomKind(item) ? `<button type="button" data-cmd="edit-room"${disabled}>Edit room layout</button><p class="me-note">Place walls, doors, furniture and games inside this building.</p>` : ''}
      ${variants.length > 1 ? `<div class="me-field"><span>Version</span><div class="me-variants">${variants.map(choice => {
        const active = choice.frame === (item.frame ?? item.asset), picture = scene.thumbnail(choice.frame);
        return `<button type="button" data-variant="${escape(choice.frame)}" aria-pressed="${active}" title="${escape(capital(variantLabel(choice)))}"${disabled}>${picture ? `<img src="${escape(picture)}" alt="">` : ''}<span>${escape(capital(variantLabel(choice)))}</span></button>`;
      }).join('')}</div></div>` : ''}
      <div class="me-actions"><button type="button" data-cmd="duplicate"${disabled}>Duplicate <kbd>${mod}D</kbd></button><button type="button" data-cmd="delete" class="danger"${disabled}>Remove <kbd>⌫</kbd></button></div>`;
  }
  const positionFields = (point: ScenePoint, disabled: string) => `<div class="me-xy"><label class="me-field"><span>X</span><input type="number" name="x" step="1" value="${Math.round(point.x)}"${disabled}></label>
    <label class="me-field"><span>Y</span><input type="number" name="y" step="1" value="${Math.round(point.y)}"${disabled}></label></div>`;

  const townPanel = (town: WorldScene) => {
    const rooms = new Map(sceneEntrances(town).map(entrance => [entrance.interiorId, entrance.ownerId]));
    return `<header class="me-inspect-head"><div><h2>${escape(townName(mapId))}</h2><p>Nothing selected</p></div></header>
      <dl class="me-facts"><div><dt>Objects</dt><dd>${town.scenery.length}</dd></div><div><dt>Story markers</dt><dd>${town.npcs.length + town.objects.length}</dd></div>
        <div><dt>Animals</dt><dd>${animalSpawns(town).length}</dd></div><div><dt>Residents</dt><dd>${town.residents?.length ?? 0}</dd></div><div><dt>Activity spots</dt><dd>${town.activities?.length ?? 0}</dd></div></dl>
      <h3>Rooms</h3><ul class="me-list">${(['cafe', 'bakery', 'supermarket', 'inn'] as const).map(kind => {
        const owner = rooms.get(kind);
        return `<li><span>${escape(capital(roomNames[kind]))}</span>${owner ? `<button type="button" data-focus="${escape(owner)}">Show</button>` : '<em>Missing</em>'}</li>`;
      }).join('')}</ul>
      <h3>Check the town</h3><p class="me-note">Checks that players can reach every story character, door and resident spot from the arrival point. Every edit is also checked when it is saved.</p>
      <button type="button" data-cmd="audit">Check now</button>
      ${audit ? audit.length ? `<ul class="me-list me-problems">${audit.map(problem => `<li class="${problem.severity}"><span>${escape(problem.message)}</span>${problem.objectIds[0] || problem.point ? `<button type="button" data-focus="${escape(problem.objectIds.join(' '))}" data-x="${problem.point?.x ?? ''}" data-y="${problem.point?.y ?? ''}">Show</button>` : ''}</li>`).join('')}</ul>`
        : '<p class="me-note good">Everything players need is reachable.</p>' : ''}`;
  };

  // Residents -----------------------------------------------------------------------------------------------
  let residentsKey: unknown[] = [];
  const renderResidents = () => {
    const town = getWorldScene(mapId), key = [town.residents, town.activities, selection.map(item => item.id).join()];
    // Rebuild only when residents or the selection changed, so open sections stay open.
    if (key.every((value, index) => value === residentsKey[index])) return;
    residentsKey = key;
    const ids = new Set(selection.map(item => item.id));
    renderResidentTools(panel('residents'), getWorldScene(mapId), ids, next => {
      commit([{kind: 'residents', map: mapId, residents: next.residents ?? []}], 'Edit residents', false);
    }, message => toast(message, true));
  };

  // Commands ----------------------------------------------------------------------------------------------
  const selectedScenery = (): SceneScenery[] => {
    const town = getWorldScene(mapId);
    return selection.flatMap(item => item.kind === 'scenery' ? town.scenery.filter(value => value.id === item.id) : []);
  };
  const editable = (items: readonly {id: string}[]) => {
    const holder = items.map(item => locks.get(item.id)).find(Boolean);
    if (holder) { toast(`${holder} is editing part of the selection right now.`, true); return false; }
    return true;
  };
  const describe = (items: readonly SceneScenery[]) => items.length === 1 ? objectLabel(getWorldScene(mapId), items[0].id) : `${items.length} objects`;

  const updateSelected = (change: (item: SceneScenery) => Omit<Extract<WorldEditOp, {kind: 'update'}>, 'kind' | 'map' | 'id'> | undefined, label: string) => {
    const items = selectedScenery();
    if (!items.length || !editable(items)) return;
    const ops = items.flatMap(item => { const update = change(item); return update ? [{kind: 'update' as const, map: mapId, id: item.id, ...update}] : []; });
    commit(ops, `${label} ${describe(items)}`);
  };
  const flip = () => updateSelected(item => ({flipX: !item.flipX}), 'Flip');
  const resizeBy = (factor: number) => updateSelected(item => {
    const width = clampSize(mapId, item, Math.round(item.width * factor));
    return Math.abs(width - item.width) > .5 ? {width} : undefined;
  }, 'Resize');

  const remove = () => {
    const items = selectedScenery(), town = getWorldScene(mapId), animals = selection.filter(item => item.kind === 'animal');
    if (!items.length && !animals.length) { if (selection.length) toast('Story characters and evidence belong to the story and cannot be removed here.'); return; }
    if (!editable([...items, ...animals])) return;
    const rooms = items.filter(item => item.interior);
    if (rooms.length && !confirm(`Remove ${rooms.map(item => objectLabel(town, item.id)).join(' and ')} with ${rooms.length === 1 ? 'its door' : 'their doors'}? Players lose access to ${rooms.length === 1 ? 'that room' : 'those rooms'} in ${townName(mapId)}.`)) return;
    if (commit([...items.map(item => ({kind: 'remove' as const, map: mapId, id: item.id})), ...animals.map(item => ({kind: 'removeAnimal' as const, map: mapId, id: item.id}))], `Remove ${items.length + animals.length} items`, false))
      scene.setSelection(selection.filter(item => item.kind !== 'scenery' && item.kind !== 'animal'));
  };

  /** Copies of objects, shifted so their group's first object lands on `at`. Rooms stay with the original. */
  const copiesAt = (sources: readonly SceneScenery[], at: ScenePoint): {ops: WorldEditOp[]; ids: string[]} => {
    let town = getWorldScene(mapId);
    const ops: WorldEditOp[] = [], ids: string[] = [], dx = at.x - sources[0].x, dy = at.y - sources[0].y;
    for (const source of sources) {
      const copy: SceneScenery = {...structuredClone(source), id: nextObjectId(town, source.frame ?? source.asset), x: Math.round(source.x + dx), y: Math.round(source.y + dy)};
      delete copy.interior;
      if (copy.roomLayout && copy.roomLayout.kind !== buildingRoomKind(copy)) delete copy.roomLayout;
      const activities = defaultActivities(town, copy);
      ops.push({kind: 'place', map: mapId, item: copy, ...(activities.length ? {activities} : {})});
      ids.push(copy.id);
      // The next name must not collide with this copy.
      town = {...town, scenery: [...town.scenery, copy], activities: [...(town.activities ?? []), ...activities]};
    }
    return {ops, ids};
  };
  /** Place copies at the first of several spots near `at` where they fit. */
  const placeCopies = (sources: readonly SceneScenery[], at: ScenePoint, label: string) => {
    if (!sources.length) return;
    const step = PASTE_OFFSET, offsets = [[0, 0], [step, step], [-step, step], [step, -step], [-step, -step], [2 * step, 0], [-2 * step, 0], [0, 2 * step], [0, -2 * step], [3 * step, 3 * step], [-3 * step, 3 * step]];
    let first: ReturnType<typeof copiesAt> | undefined;
    for (const [dx, dy] of offsets) {
      const attempt = copiesAt(sources, {x: at.x + dx, y: at.y + dy});
      first ??= attempt;
      if (!problemIn(attempt.ops)) { if (commit(attempt.ops, label)) scene.setSelection(attempt.ids.map(id => ({kind: 'scenery' as const, id}))); return; }
    }
    // Nowhere nearby fits: report why the first spot was refused.
    commit(first!.ops, label);
  };
  const duplicate = () => {
    const items = selectedScenery();
    if (items.length) placeCopies(items, {x: items[0].x + PASTE_OFFSET, y: items[0].y + PASTE_OFFSET}, `Duplicate ${describe(items)}`);
  };
  const copy = () => { clipboard = structuredClone(selectedScenery()); if (clipboard.length) toast(`Copied ${describe(clipboard)}.`); };
  const paste = () => {
    if (!clipboard.length) return;
    const at = pointer ?? {x: clipboard[0].x + PASTE_OFFSET, y: clipboard[0].y + PASTE_OFFSET};
    placeCopies(clipboard, at, `Paste ${describe(clipboard)}`);
  };

  const undo = () => { scene.commitNudge(); scene.cancelGesture(); const label = store.undo(); if (label) toast(`Undid ${label}.`); };
  const redo = () => { scene.commitNudge(); scene.cancelGesture(); const label = store.redo(); if (label) toast(`Redid ${label}.`); };

  const showProblem = (focus: {ids: string[]; point?: ScenePoint}) => {
    const items = focus.ids.map(id => scene.itemFor(id)).filter((item): item is MapItem => !!item);
    if (items.length) { scene.setSelection(items); scene.frameSelection(); }
    else if (focus.point) scene.frame([focus.point]);
  };

  const setMode = (next: Mode) => {
    if (next === mode) return;
    scene.commitNudge(); scene.cancelGesture();
    mode = next; root.dataset.mode = next;
    root.querySelectorAll<HTMLButtonElement>('[data-mode-button]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.modeButton === next)));
    root.querySelectorAll<HTMLElement>('[data-panel]').forEach(value => { value.hidden = value.dataset.panel !== next; });
    terrainEditor.setActive(next === 'terrain');
    scene.setActive(next === 'objects' || next === 'residents');
    if (next === 'terrain' || next === 'story') scene.setSelection([]);
    if (next === 'story') options.storyTab?.(panel('story'), session, {showOnMap});
    inspectorKey = ''; residentsKey = [];
    queueRender();
  };
  /** Story mode's way back to the map: open the town a character stands in and select them. */
  const showOnMap = (npcId: string): boolean => {
    const town = maps.find(map => getWorldScene(map.id).npcs.some(npc => npc.id === npcId));
    if (!town) return false;
    setMode('objects');
    void (async () => {
      if (town.id !== mapId) { query<HTMLSelectElement>('#me-town').value = town.id; await showTown(town.id); }
      const item = scene.itemFor(npcId);
      if (item) { scene.setSelection([item]); scene.frameSelection(); }
    })();
    return true;
  };
  const setSide = (next: Side) => {
    side = next;
    root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.side === next)));
    root.querySelectorAll<HTMLElement>('[data-side-panel]').forEach(value => { value.hidden = value.dataset.sidePanel !== next; });
    libraryKey = layersKey = '';
    queueRender();
  };
  const setTool = (tool: 'select' | 'hand') => {
    scene.setTool(tool);
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)));
  };
  const focusLibrary = () => { if (mode !== 'objects') setMode('objects'); setSide('library'); requestAnimationFrame(() => query<HTMLInputElement>('#me-library-search').focus()); };

  const exportWorld = async () => {
    try {
      const world = await session.loadWorld();
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(world.document, null, 2)}\n`], {type: 'application/json'}));
      const link = document.createElement('a'); link.href = url; link.download = `glotworld-${options.localDraft ? 'draft' : 'world'}-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast(error instanceof Error ? error.message : 'Export failed.', true); }
  };
  const importWorld = async (chosen: File) => {
    try {
      if (chosen.size > MAX_IMPORT_BYTES) throw new Error('Choose a world file up to 2 MB.');
      let document;
      try { document = parseWorldSceneDocument(JSON.parse(await chosen.text())); }
      catch (error) { throw new Error(`This is not a world file: ${error instanceof Error ? error.message.replace(/^Invalid world scene: /, '') : 'unreadable'}`, {cause: error}); }
      await session.validate(document);
      if (!confirm(options.localDraft ? 'Replace this local draft with the imported file?' : 'Replace the whole published world with this file? Players see it immediately.')) return;
      const current = await session.loadWorld();
      await session.replaceWorld(document, current.revision);
      store.clearHistory();
      await reloadWorld(true);
      toast(options.localDraft ? 'The imported draft is saved locally.' : 'The imported world is now live.');
    } catch (error) {
      const problems = error instanceof WorldEditRequestError ? error.problems : [];
      toast(error instanceof Error ? error.message : 'Import failed.', true);
      if (problems.length > 1) { audit = problems; scene.setSelection([]); inspectorKey = ''; queueRender(); }
    }
  };

  // Events --------------------------------------------------------------------------------------------------
  root.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.modeButton) { setMode(button.dataset.modeButton as Mode); return; }
    if (button.dataset.side) { setSide(button.dataset.side as Side); return; }
    if (button.dataset.tool) { setTool(button.dataset.tool as 'select' | 'hand'); return; }
    if (button.dataset.group !== undefined) { group = button.dataset.group; renderLibrary(); return; }
    if (button.dataset.animalSpecies) {
      if (mode !== 'objects') setMode('objects');
      scene.startPlacingAnimal(button.dataset.animalSpecies as AnimalSpecies, Number(button.dataset.animalVariant));
      return;
    }
    if (button.dataset.place) {
      const choice = paletteChoices(mapId).find(value => value.frame === button.dataset.place);
      if (choice && placing?.frame === choice.frame) scene.cancelPlacing();
      else if (choice) { if (mode !== 'objects') setMode('objects'); scene.startPlacing(choice); }
      return;
    }
    if (button.dataset.variant) {
      const frame = button.dataset.variant;
      updateSelected(item => frame === (item.frame ?? item.asset) ? undefined : {frame, width: clampSize(mapId, {...item, frame}, item.width)}, 'Change version of');
      return;
    }
    if (button.dataset.layerId) {
      const item = {kind: button.dataset.layerKind as MapItem['kind'], id: button.dataset.layerId};
      const event2 = event as MouseEvent, additive = event2.shiftKey || event2.metaKey || event2.ctrlKey;
      const has = selection.some(value => value.id === item.id);
      scene.setSelection(additive ? has ? selection.filter(value => value.id !== item.id) : [...selection, item] : [item]);
      if (!additive) scene.frameSelection();
      return;
    }
    if (button.dataset.focus !== undefined) {
      showProblem({ids: button.dataset.focus.split(' ').filter(Boolean), point: button.dataset.x ? {x: Number(button.dataset.x), y: Number(button.dataset.y)} : undefined});
      return;
    }
    switch (button.dataset.cmd) {
      case 'edit-room': void editRoom(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'zoom-in': scene.zoomBy(1.25); break;
      case 'zoom-out': scene.zoomBy(.8); break;
      case 'zoom-reset': scene.zoomTo(1); break;
      case 'fit': scene.fit(); break;
      case 'flip': flip(); break;
      case 'solid': updateSelected(item => ({collidable: item.collidable === false}), 'Change'); break;
      case 'duplicate': duplicate(); break;
      case 'delete': remove(); break;
      case 'help': query<HTMLDialogElement>('.me-help').showModal(); break;
      case 'close-help': query<HTMLDialogElement>('.me-help').close(); break;
      case 'export': button.closest('details')?.removeAttribute('open'); void exportWorld(); break;
      case 'import': button.closest('details')?.removeAttribute('open'); query<HTMLInputElement>('#me-import-file').click(); break;
      case 'audit':
        button.disabled = true; button.textContent = 'Checking…';
        // Let the button repaint before the grid work starts.
        window.setTimeout(() => { const town = getWorldScene(mapId); audit = auditScene(town, SceneReach.build(town)); inspectorKey = ''; renderInspector(); }, 30);
        break;
    }
  });
  root.addEventListener('dblclick', event => {
    if ((event.target as HTMLElement).closest('[data-layer-id]')) scene.frameSelection();
  });
  root.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (input.id === 'me-library-search') { librarySearch = input.value; renderLibrary(); }
    else if (input.id === 'me-layer-search') { layerSearch = input.value; renderLayers(); }
    else if (input.name === 'size') { const value = root.querySelector<HTMLInputElement>('[name="size-value"]'); if (value) value.value = input.value; }
  });
  root.addEventListener('change', event => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.id === 'me-town') {
      const select = input as HTMLSelectElement;
      select.disabled = true;
      void showTown(select.value as MapId).finally(() => { select.disabled = false; select.blur(); });
    } else if (input.id === 'me-import-file') {
      const file = (input as HTMLInputElement).files?.[0]; (input as HTMLInputElement).value = '';
      if (file) void importWorld(file);
    } else if (input.dataset.layer) {
      layers[input.dataset.layer as keyof MapLayers] = (input as HTMLInputElement).checked; scene.setLayers(layers);
    } else if (input.hasAttribute('data-snap')) scene.setSnapping((input as HTMLInputElement).checked);
    else if (input.name === 'size' || input.name === 'size-value') {
      const width = Number(input.value);
      if (Number.isFinite(width)) updateSelected(item => { const value = clampSize(mapId, item, width); return Math.abs(value - item.width) > .01 ? {width: value} : undefined; }, 'Resize');
    } else if (input.name === 'room') {
      const kind = (input.value || null) as SceneInteriorKind | null;
      updateSelected(item => {
        const update: {interior: {kind: SceneInteriorKind} | null; width?: number} = {interior: kind ? {kind} : null};
        // A building that was too small for its door grows to fit.
        if (kind) { const range = sizeRange(mapId, {...item, interior: {kind}}); if (item.width < range.min) update.width = range.min; }
        return update;
      }, 'Change room of');
    } else if (input.name === 'animal-species' || input.name === 'animal-variant') {
      const entry = selection[0];
      if (entry?.kind !== 'animal' || !editable(selection)) return;
      const change = input.name === 'animal-species' ? {species: input.value as AnimalSpecies, variant: 0} : {variant: Number(input.value)};
      commit([{kind: 'updateAnimal', map: mapId, id: entry.id, ...change}], 'Change animal');
    } else if (input.name === 'x' || input.name === 'y') {
      const value = Number(input.value), entry = selection[0], at = entry && scene.position(entry);
      if (!at || !Number.isFinite(value) || selection.length !== 1 || !editable(selection)) return;
      const next = {...at, [input.name]: Math.round(value)};
      commit([entry.kind === 'scenery' ? {kind: 'move', map: mapId, id: entry.id, ...next} : entry.kind === 'animal' ? {kind: 'updateAnimal', map: mapId, id: entry.id, ...next} : {kind: 'moveAnchor', map: mapId, anchor: entry.kind, id: entry.id, ...next}],
        `Move ${objectLabel(getWorldScene(mapId), entry.id)}`);
    }
  });
  // Close menus when clicking elsewhere.
  const closeMenus = (event: Event) => root.querySelectorAll('details.me-menu[open]').forEach(menu => { if (!menu.contains(event.target as Node)) menu.removeAttribute('open'); });
  document.addEventListener('pointerdown', closeMenus);

  const typing = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    return !!element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
  };
  const keydown = (event: KeyboardEvent) => {
    // Story mode has its own keys and nothing on the canvas to act on.
    if (destroyed || host.offsetParent === null || query<HTMLDialogElement>('.me-help').open || mode === 'story') return;
    if (typing(event.target)) {
      if (event.key === 'Escape') (event.target as HTMLElement).blur();
      if (event.key === 'Enter' && (event.target as HTMLInputElement).type === 'number') (event.target as HTMLElement).blur();
      return;
    }
    const key = event.key, command = event.metaKey || event.ctrlKey;
    const objects = mode === 'objects' || mode === 'residents';
    let handled = true;
    if (command && key.toLowerCase() === 'z') { if (event.shiftKey) redo(); else undo(); }
    else if (command && key.toLowerCase() === 'y') redo();
    else if (command && key.toLowerCase() === 'd' && objects) duplicate();
    else if (command && key.toLowerCase() === 'c' && objects) copy();
    else if (command && key.toLowerCase() === 'v' && objects) paste();
    else if (command && key.toLowerCase() === 'a' && objects) scene.selectAll();
    else if (command) handled = false;
    else if (key === ' ') { if (!event.repeat) scene.setSpaceHeld(true); }
    else if (key === 'Escape' && mode === 'terrain') terrainEditor.escape();
    else if (key === 'Escape') { if (!scene.cancelGesture()) scene.setSelection([]); }
    else if ((key === 'Delete' || key === 'Backspace') && mode === 'terrain') handled = terrainEditor.removeSelection();
    else if ((key === '[' || key === ']') && mode === 'terrain') handled = terrainEditor.resizeBrush(key === ']' ? 1.2 : 1 / 1.2);
    else if ((key === 'Delete' || key === 'Backspace') && objects) remove();
    else if (key.startsWith('Arrow') && objects && selection.length) {
      const step = event.shiftKey ? 10 : 1;
      scene.nudgeBy(key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0);
    }
    else if (key === 'v' || key === 'V') setTool('select');
    else if (key === 'h' || key === 'H') setTool('hand');
    else if (key === 'a' || key === 'A' || key === '/') focusLibrary();
    else if ((key === 'x' || key === 'X') && objects) flip();
    else if (key === '[' && objects) resizeBy(1 / 1.1);
    else if (key === ']' && objects) resizeBy(1.1);
    else if (key === 'f' || key === 'F') { if (selection.length) scene.frameSelection(); else scene.fit(); }
    else if (key === '0' || key === '!') scene.fit();
    else if (key === '1') scene.zoomTo(1);
    else if (key === '=' || key === '+') scene.zoomBy(1.25);
    else if (key === '-' || key === '_') scene.zoomBy(.8);
    else if (key === 'g' || key === 'G') { const box = query<HTMLInputElement>('[data-snap]'); box.checked = !box.checked; scene.setSnapping(box.checked); toast(box.checked ? 'Snapping to the grid.' : 'Grid snapping off.'); }
    else if (key === '?') query<HTMLDialogElement>('.me-help').showModal();
    else handled = false;
    if (handled) event.preventDefault();
  };
  const keyup = (event: KeyboardEvent) => { if (event.key === ' ') scene.setSpaceHeld(false); };
  const blur = () => scene.setSpaceHeld(false);
  const beforeUnload = (event: BeforeUnloadEvent) => { if (store.busy) event.preventDefault(); };
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', blur);
  window.addEventListener('beforeunload', beforeUnload);

  await showTown(mapId);
  return {
    destroy() {
      destroyed = true;
      window.clearInterval(poll);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('pointerdown', closeMenus);
      roomEditor?.destroy();
      terrainEditor.destroy();
      session.dispose();
      game.destroy(true);
    },
  };
}
