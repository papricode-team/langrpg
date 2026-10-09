import { localHour, type WorldTimeMode } from './world-clock';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/fraunces/latin-600.css';
import './style.css';
import './course-ui.css';
import './game-ui.css';
import { adventureHome, npcEncounter } from './game-panels';
import './interiors.css';
import { World } from './world';
import type { Avatar, WorldPlayer, WorldMotion } from './world';
import { quests, npcs, vocabulary } from './content';
import type { Quest, Exercise, Level } from './content';
import { Api, emptyProgress } from './api';
import type { Progress, ChatMessage, ExposureInput } from './api';
import { dueItems, modeFor, memoryLabel, practiceExercises, skipListeningExercises } from './learning';
import { reviewExercises } from './review';
import { icon, escapeHtml as e } from './icons';
import { maps, getMap } from './maps';
import type { MapId, WorldObjectSpec } from './maps';
import { actFor, clueFor, discoveredClues, objectStories, storyActs } from './story';
import { activityDiscoveries } from './activity-stories';
import { ScreenFilterControls } from './screen-filter-controls';
import { buildingEntrances, getInterior, getInteriorObject, interiorExercises, interiors } from './interiors';
import type { InteriorId, InteriorObjectSpec } from './interiors';

type View = 'world' | 'menu' | 'quests' | 'story' | 'atlas' | 'journal' | 'character' | 'settings' | 'activities' | 'course';
type CourseModule = typeof import('./course');
type ActivityModule = typeof import('./activities');
type ActivityId = 'cafe' | 'market' | 'detective' | 'delivery';
let course: CourseModule | undefined;
let coursePromise: Promise<CourseModule> | undefined;
let activities: ActivityModule | undefined;
let activitiesPromise: Promise<ActivityModule> | undefined;
let activityController: { destroy(): void; pause(): void; resume(): void; reset(): void } | undefined;
let activityLoading = 0;
let courseLevel: Level = 'A1';
let courseTab: 'topics' | 'grammar' | 'lexicon' = 'topics';
let journalTab: 'words' | 'phrases' = 'words';
const activityInfo = [
  { id: 'cafe' as const, title: 'The impossible café', npcId: 'marta', icon: 'cup', action: 'Work a café shift', description: 'Read orders, prepare a tray and keep Marta’s unusual customers happy.' },
  { id: 'market' as const, title: 'The lantern market', npcId: 'fritz', icon: 'basket', action: 'Trade at the market', description: 'Shop by quantity, compare prices and make every coin count.' },
  { id: 'detective' as const, title: 'The missing evidence', npcId: 'ada', icon: 'clue', action: 'Investigate the evidence', description: 'Connect witnesses, recover the order of events and find a defensible explanation.' },
  { id: 'delivery' as const, title: 'Letters through the mist', npcId: 'lina', icon: 'parcel', action: 'Take a delivery mission', description: 'Understand directions, plan the route and deliver to the right destination.' },
];
let mapId: MapId = 'lindenhafen';
let interiorId: InteriorId | undefined;
let pendingMap: MapId | undefined;
let pendingDestination: { kind: 'quest' | 'follow'; questId: string } | undefined;
let mapConfirmed = false;
let regionReady = false;
const app = document.querySelector<HTMLDivElement>('#app')!;
const api = new Api();
let progress: Progress = emptyProgress();
let level: Level = (localStorage.getItem('atlas.level') as Level) || 'A1';
if (!['A1', 'A2', 'B1'].includes(level)) level = 'A1';
let view: View = 'world';
let players: WorldPlayer[] = [];
let connection: 'connecting' | 'online' | 'offline' = 'connecting';
let profile: { name: string; avatar: Avatar };
try { profile = JSON.parse(localStorage.getItem('atlas.profile') || 'null') || { name: 'Wanderer', avatar: { hair: '#48372e', skin: '#d8a077', outfit: '#326a65' } }; }
catch { profile = { name: 'Wanderer', avatar: { hair: '#48372e', skin: '#d8a077', outfit: '#326a65' } }; }
if (!profile || typeof profile.name !== 'string' || !profile.avatar || typeof profile.avatar !== 'object' || Array.isArray(profile.avatar)) profile = { name: 'Wanderer', avatar: { hair: '#48372e', skin: '#d8a077', outfit: '#326a65' } };
profile.name = profile.name.trim().slice(0, 24) || 'Wanderer';
for (const [key, fallback] of Object.entries({ hair: '#48372e', skin: '#d8a077', outfit: '#326a65' })) {
  if (!/^#[0-9a-f]{6}$/i.test(profile.avatar[key as keyof Avatar])) profile.avatar[key as keyof Avatar] = fallback;
}
let worldMotion: WorldMotion = (localStorage.getItem('atlas.worldMotion') as WorldMotion) || 'auto';
let watchingWorld = false;
let worldTimeMode = (localStorage.getItem('atlas.worldTimeMode') as WorldTimeMode) || 'cycle';
if (!['cycle', 'local', 'manual'].includes(worldTimeMode)) worldTimeMode = 'cycle';
let manualWorldHour = Number(localStorage.getItem('atlas.worldHour') ?? 12);
if (!Number.isFinite(manualWorldHour)) manualWorldHour = 12;
if (!['auto', 'full', 'reduced'].includes(worldMotion)) worldMotion = 'auto';
let muted = localStorage.getItem('atlas.muted') !== 'false';
let silentMode = localStorage.getItem('atlas.silentMode') === 'true';
function silentModeButton() {
  return `<button class="outline-button silent-mode-button" data-action="silent-mode" aria-pressed="${silentMode}">${icon(silentMode ? 'muted' : 'volume')} Silent mode ${silentMode ? 'on' : 'off'}</button>`;
}
let speechRate = Number(localStorage.getItem('atlas.speechRate') || '0.82');
if (![0.65, 0.82, 1].includes(speechRate)) speechRate = 0.82;
const chatMessages: ChatMessage[] = [];
let world: World;
let screenFilterControls: ScreenFilterControls | undefined;
type Submission = { id: string; itemId: string; exerciseId: string; answer: string; hinted: boolean; mode: 'recognition' | 'production' | 'listening'; questId?: string };
let run: { quest?: Quest; unitId?: string; queue: Exercise[]; index: number; correct: number; targetCount: number; hinted: boolean; audioHeard: boolean; answered: boolean; answer: string; tokenOrder: number[]; review: boolean; objectId?: string; interiorObjectId?: string; label?: string; started: number; submission?: Submission } | undefined;
let attemptBusy = false;
let progressOwner: string | undefined;
function acceptProgress(value: Progress, owner?: string) {
  if (owner && progressOwner !== owner) { progressOwner = owner; progress = emptyProgress(); exposedContexts.clear(); }
  if ((value.revision ?? 0) >= (progress.revision ?? 0)) progress = value;
}
const exposedContexts = new Set<string>();
const pendingWordExposures = new Set<string>();
let exposureObserver: IntersectionObserver | undefined;
let exposureTimer: number | undefined;
function recordExposure(input: ExposureInput) {
  if (connection !== 'online') return;
  const key = JSON.stringify(input);
  if (exposedContexts.has(key)) return;
  exposedContexts.add(key);
  void api.expose(input).then(result => { acceptProgress(result.progress); updateProgress(); })
    .catch(() => exposedContexts.delete(key));
}
function flushWordExposures() {
  exposureTimer = undefined;
  const wordIds = [...pendingWordExposures].slice(0, 36);
  wordIds.forEach(id => pendingWordExposures.delete(id));
  if (wordIds.length) recordExposure({wordIds});
  if (pendingWordExposures.size) exposureTimer = window.setTimeout(flushWordExposures, 300);
}
function observeVisibleWords() {
  exposureObserver?.disconnect();
  const root = document.querySelector<HTMLElement>('#other-view');
  if (!root) return;
  exposureObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = (entry.target as HTMLElement).dataset.lexeme;
      if (id && !progress.words[id]) pendingWordExposures.add(id);
      exposureObserver?.unobserve(entry.target);
    }
    if (pendingWordExposures.size && exposureTimer === undefined) exposureTimer = window.setTimeout(flushWordExposures, 350);
  }, {root, threshold:0.3});
  root.querySelectorAll('[data-lexeme]').forEach(card => exposureObserver!.observe(card));
}


function portrait(id: string, className = '') {
  const index = id === 'self' ? 7 : Math.max(0, npcs.findIndex(n => n.id === id));
  return `<span class="portrait ${className}" style="--portrait-x:${(index % 4) * 100 / 3}%;--portrait-y:${index < 4 ? 0 : 100}%" aria-hidden="true"></span>`;
}
function currentQuest() { return quests.find(q => q.level === level && !progress.completedQuestIds.includes(q.id)) ?? quests.find(q => q.level === level)!; }
function completedAtLevel(l: Level) { return quests.filter(q => q.level === l && progress.completedQuestIds.includes(q.id)).length; }
function toast(message: string, bad = false) {
  const el = document.querySelector<HTMLElement>('#toast')!;
  el.textContent = message;
  el.className = `toast visible ${bad ? 'bad' : ''}`;
  window.setTimeout(() => el.classList.remove('visible'), 4500);
}
function renderShell() {
  screenFilterControls?.destroy();
  app.innerHTML = `
    <main class="game-shell" id="game-shell" data-view="world" data-map="lindenhafen">
      <section id="explore-view" class="world-stage" aria-label="Lindenhafen"><div id="world-container" aria-label="Game world. Use WASD, arrow keys, or the joystick to move. Press E to interact." tabindex="0"></div></section>
      <div class="world-vignette" aria-hidden="true"></div>
      <div class="game-hud" id="game-hud">
        <div class="player-hud"><button class="player-medallion" data-view="character" aria-label="Edit your character">${portrait('self')}<span class="medallion-gem"></span></button><div class="player-details"><span class="player-name" id="profile-name">${e(profile.name)}</span><div class="player-meta"><span id="hud-level">A1 · WANDERER</span><span class="xp-badge"><strong id="xp-value">0</strong> XP</span></div><div class="player-progress"><span id="chapter-fill"></span></div></div></div>
        <div class="location-banner"><div class="location-title" id="breadcrumb-current">Lindenhafen</div><div class="location-subtitle" id="location-subtitle">THE FIRST MISSING ROUTE</div></div>
        <section class="interior-location" id="interior-location" aria-label="Current building" hidden></section>
        <button class="region-compass" data-view="atlas" aria-label="Open the region atlas">${icon('compass')}<span><strong id="region-name">Lindenhafen</strong><small>REGION ATLAS</small></span></button>
        <aside class="quest-tracker" id="quest-tracker" aria-label="Next story objective"><div id="quest-panel"></div></aside>
        <section class="chat-card" id="chat-card" aria-label="Local chat"><button class="chat-header" data-action="chat-toggle" aria-label="Toggle local chat" aria-expanded="false" aria-controls="chat-body"><span>${icon('chat')}<strong id="chat-region">Lindenhafen</strong><small>LOCAL</small></span><span class="chat-toggle-icon">${icon('plus')}</span></button><div class="chat-body" id="chat-body" hidden><div class="chat-messages" id="chat-messages"><p class="chat-welcome">Say Hallo. Every wanderer has a story.</p></div><form id="chat-form" class="chat-input"><input id="chat-input" maxlength="280" autocomplete="off" placeholder="Say something…" aria-label="Message to this region"/><button type="submit" aria-label="Send message">${icon('send')}</button></form></div></section>
        <div class="game-controls-hint"><kbd>WASD</kbd><span>Move</span><b>·</b><kbd>E</kbd><span>Interact</span><b>·</b><kbd>M</kbd><span>Atlas</span></div>
        <div class="world-atmosphere-controls"><button class="world-time-button" data-action="world-time" id="world-clock" aria-label="Time of day settings">12:00 · DAY</button><button class="world-watch-button" data-action="watch-world">Watch the world</button></div>
        <button class="game-menu-button" data-view="menu" aria-label="Open game menu">${icon('lantern')}<span>Menu</span><i id="review-dot" hidden></i></button>
        <div class="touch-controls"><div class="joystick" id="joystick" role="group" aria-label="Touch movement joystick"><span class="joystick-ring"></span><span class="joystick-axis"></span><span class="joystick-knob" id="joystick-knob">${icon('compass')}</span></div><button class="talk-button" id="talk-button" data-action="talk" aria-label="Interact with something nearby" disabled>${icon('chat')}<span id="nearby-action">Interact</span><small id="nearby-name">MOVE CLOSER</small></button></div>
      </div>
      <div class="world-watch-caption"><span>A moment in <strong id="watch-region">Lindenhafen</strong></span><span id="watch-time">12:00 · DAY</span><button data-action="stop-watching">Return to exploring <kbd>ESC</kbd></button></div>
      <dialog class="menu-layer" id="menu-layer" aria-labelledby="menu-title" hidden><div class="menu-frame"><header class="menu-header"><span class="menu-crest">${icon('lantern')}</span><div><span class="menu-kicker">THE LANTERN ATLAS</span><h1 id="menu-title">Your adventure</h1></div><button class="menu-close" data-view="world" aria-label="Return to game">${icon('close')}<kbd>ESC</kbd></button></header><nav class="menu-tabs" aria-label="Game sections"><span class="menu-nav-label">THE JOURNEY</span>${([['menu','compass','Overview'],['quests','scroll','Story quests'],['story','lantern','Discoveries'],['atlas','map','Region atlas']] as const).map(([id,glyph,label]) => `<button data-view="${id}" aria-label="${label}">${icon(glyph)}<span>${label}</span></button>`).join('')}<span class="menu-nav-label menu-nav-divider">OFF THE MAIN PATH</span>${([['activities','cup','Side activities'],['course','book','Learning routes'],['journal','leaf','Your words']] as const).map(([id,glyph,label]) => `<button data-view="${id}" aria-label="${label}">${icon(glyph)}<span>${label}</span></button>`).join('')}<span class="menu-nav-label menu-nav-divider">YOUR ADVENTURE</span>${([['character','shirt','Character'],['settings','settings','Settings']] as const).map(([id,glyph,label]) => `<button data-view="${id}" aria-label="${label}">${icon(glyph)}<span>${label}</span></button>`).join('')}</nav><div id="other-view" class="menu-content" tabindex="-1"></div><footer class="menu-footer"><span class="german-flag"></span><span>GERMAN FROM ENGLISH</span><span class="connection-pill" id="connection-pill"><span></span> Connecting</span></footer></div></dialog>
    </main><dialog id="dialog" class="dialog" aria-label="Adventure encounter"></dialog><div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  world = new World(document.querySelector('#world-container')!, {
    motion: worldMotion,
    time: { mode: worldTimeMode, hour: worldTimeMode === 'manual' ? manualWorldHour : localHour() },
    onTimeChange: state => {
      const label = `${state.label} · ${state.period.toUpperCase()}`;
      for (const id of ['world-clock', 'watch-time', 'world-hour-label']) {
        const element = document.getElementById(id);
        if (element) element.textContent = label;
      }
    },
    onNpc: showNpc,
    onObject: showObject,
    onInteriorChange: onInteriorChange,
    onInteriorInteract: showInteriorObject,
    onMapReady: id => { regionReady = true; onRegionReady(id); },
    onReady: () => { regionReady = true; screenFilterControls?.refreshSupport(); document.querySelectorAll<HTMLCanvasElement>('[data-avatar-preview]').forEach(canvas => world.renderAvatarPreview(canvas, profile.avatar)); onRegionReady(mapId); },
    onMove: (x, y) => api.move(x, y),
    onNearby: updateNearby,
  });
  world.setAvatar(profile.avatar);
  screenFilterControls = new ScreenFilterControls(document.querySelector<HTMLElement>('#game-hud')!, {
    apply: settings => world.setScreenFilter(settings),
    supported: () => world.screenFiltersSupported(),
    onOpenChange: () => { document.dispatchEvent(new Event('atlas-controls-reset')); world.setInputEnabled(worldCanInteract()); },
  });
  bindGlobalEvents(); bindJoystick(); updateProgress();
}
function watchWorld(watching: boolean): void {
  if (watching) screenFilterControls?.close(false);
  watchingWorld = watching;
  world.setWatchMode(watching);
  document.querySelector('#game-shell')!.classList.toggle('watching-world', watching);
  document.querySelector<HTMLElement>('#game-hud')!.inert = watching || view !== 'world';
  world.setInputEnabled(!watching && worldCanInteract());
  document.querySelector('#watch-region')!.textContent = interiorId ? getInterior(interiorId).name : getMap(mapId).name;
  document.querySelector<HTMLButtonElement>(watching ? '[data-action="stop-watching"]' : '[data-action="watch-world"]')?.focus();
}
function interiorIcon(id: InteriorId) { return id === 'cafe' ? 'cup' : id === 'bakery' ? 'leaf' : 'basket'; }
function updateNearby(id?: string) {
  const entrance = id?.startsWith('building:') ? buildingEntrances(mapId).find(item => item.id === id) : undefined;
  const inside = id?.startsWith('interior:') ? getInteriorObject(id) : undefined;
  const exit = id?.startsWith('exit:') && interiorId;
  const object = id?.startsWith('object:') ? getMap(mapId).objects.find(item => item.id === id.slice(7)) : undefined;
  const npc = id && !entrance && !inside && !exit && !object ? npcs.find(item => item.id === id) : undefined;
  const action = entrance ? 'Enter' : exit ? 'Leave' : inside?.npcId || npc ? 'Talk' : 'Inspect';
  const insideName = inside?.npcId ? npcs.find(item => item.id === inside.npcId)?.name ?? inside.label : inside?.label;
  const name = entrance?.label ?? insideName ?? (exit ? getInterior(exit).name : object?.label ?? npc?.name);
  const button = document.querySelector<HTMLButtonElement>('#talk-button')!;
  button.disabled = !name;
  document.querySelector('#nearby-action')!.textContent = name ? action : 'Interact';
  document.querySelector('#nearby-name')!.textContent = name ?? 'MOVE CLOSER';
  button.setAttribute('aria-label', name ? `${action}${action === 'Talk' ? ' to' : ''} ${name}` : 'Move closer to interact');
}
function syncLocation() {
  const room = interiorId ? getInterior(interiorId) : undefined, region = getMap(mapId);
  const shell = document.querySelector<HTMLElement>('#game-shell')!;
  if (room) shell.dataset.interior = room.id;
  else delete shell.dataset.interior;
  document.querySelector('#breadcrumb-current')!.textContent = room?.name ?? region.name;
  document.querySelector('#location-subtitle')!.textContent = (room?.subtitle ?? region.subtitle).toUpperCase();
  document.querySelector('#region-name')!.textContent = room ? `${region.name} · Indoors` : region.name;
  document.querySelector('#watch-region')!.textContent = room?.name ?? region.name;
  document.querySelector('#explore-view')!.setAttribute('aria-label', room ? `${room.name} interior` : region.name);
  const chip = document.querySelector<HTMLElement>('#interior-location')!;
  chip.hidden = !room;
  chip.innerHTML = room ? `<span class="interior-location-icon">${icon(interiorIcon(room.id))}</span><span class="interior-location-copy"><small>INSIDE ${e(region.name.toUpperCase())}</small><strong>${e(room.name)}</strong></span><button data-action="leave-interior" aria-label="Leave ${e(room.name)}">${icon('arrow')}<span>Leave</span></button>` : '';
}
function onInteriorChange(id?: InteriorId) {
  interiorId = id;
  syncLocation(); updateNearby(); updateProgress();
  document.querySelector('#quest-tracker')!.setAttribute('aria-label', id ? 'Learning in this building' : 'Next story objective');
  document.dispatchEvent(new Event('atlas-controls-reset'));
}
function guideToBuilding(id: InteriorId) {
  if (!buildingEntrances(mapId).some(entrance => entrance.interiorId === id)) return;
  document.querySelector<HTMLDialogElement>('#dialog')!.close();
  setView('world');
  if (interiorId) world.leaveInterior();
  world.focusBuilding(id);
  toast(`Following the path to ${getInterior(id).name}…`);
}
function interiorGameCopy(id: InteriorId) {
  if (id === 'supermarket') return { title: 'A basket at Fritz’s supermarket', action: 'Shop and count the change', description: 'Build a grocery basket from the German request, choose cash or card, and return the right change.', npcId: 'fritz' };
  if (id === 'bakery') return { title: 'Drinks at the lantern bakery', action: 'Prepare the bakery’s drinks', description: 'While the bread bakes, prepare coffee, milk and water for the guests. Read the order and follow the preparation steps.', npcId: 'emil' };
  return { title: 'A shift at Marta’s café', action: 'Prepare a café order', description: 'Read a customer’s order, assemble the tray, and prepare each drink in the right order before serving.', npcId: 'marta' };
}
function startInteriorActivity(id: string) {
  const object = getInteriorObject(id), room = interiorId ? getInterior(interiorId) : undefined;
  if (!object?.activityId || !room || !room.objects.some(item => item.id === id)) return;
  void startActivity(object.activityId, {roomId:room.id, stationId:id});
}
function interiorPracticeQueue(object: InteriorObjectSpec): Exercise[] {
  return practiceExercises(object.exerciseIds.flatMap(id => {
    const exercise = interiorExercises.find(item => item.id === id);
    if (!exercise) return [];
    return [exercise.mode === 'sentence' && hasSuccessfulEncounter(exercise.itemId) ? { ...exercise, mode: 'type' as const, prompt: `Write in German: ${exercise.english}` } : exercise];
  }), silentMode);
}
function showInteriorObject(id: string) {
  const object = getInteriorObject(id), room = interiorId ? getInterior(interiorId) : undefined;
  if (!object || !room || !room.objects.some(item => item.id === id)) return;
  const queue = interiorPracticeQueue(object);
  const npc = object.npcId ? npcs.find(item => item.id === object.npcId) : undefined;
  if (npc) recordExposure({npcId:npc.id});
  const game = object.activityId ? activityInfo.find(item => item.id === object.activityId) : undefined;
  const gameCopy = interiorGameCopy(room.id);
  const words = object.vocabulary.map(word => `<article class="interior-word"><div><span class="interior-word-article">${e(word.article)}</span><strong>${e(word.lemma)}</strong><button class="icon-button" data-speak="${e(`${word.article} ${word.lemma}`)}" aria-label="Hear ${e(word.lemma)}">${icon('volume')}</button></div><p>${e(word.english)}</p><small><span>PLURAL</span> ${e(word.plural)}</small></article>`).join('');
  openDialog(`<div class="interior-encounter"><header class="interior-encounter-heading">${npc ? portrait(npc.id, 'large-portrait') : `<span class="interior-object-emblem">${icon(interiorIcon(room.id))}</span>`}<div><div class="eyebrow">${e(room.name.toUpperCase())} · ${npc ? 'A FRIENDLY FACE' : 'LOOK A LITTLE CLOSER'}</div><h2>${e(object.label)}</h2></div></header><p class="interior-description">${e(object.description)}</p>${object.dialogue ? `<blockquote class="interior-dialogue"><span>“${e(object.dialogue)}”</span><button class="icon-button" data-speak="${e(object.dialogue)}" aria-label="Hear this German greeting">${icon('volume')}</button></blockquote>` : ''}<div class="interior-word-heading"><span>${icon('book')} Words you can use here</span><small>ARTICLE · WORD · PLURAL</small></div><div class="interior-words">${words}</div><section class="interior-practice-card"><span>${icon('chat')}</span><div><small>A FOCUSED LEARNING SESSION</small><h3>${e(object.sessionTitle)}</h3><p>${e(object.prompt)}</p><span>${queue.length} ${queue.length === 1 ? 'expression' : 'expressions'} · Answers saved as you go</span></div>${queue.length ? `<button class="primary-button" data-practice-interior="${e(id)}">Practise here ${icon('arrow')}</button>` : ''}</section>${game ? `<section class="interior-game-card"><small>PLAY A LITTLE · A1 EVERYDAY GERMAN</small><h3>${e(gameCopy.title)}</h3><p>${e(gameCopy.description)}</p><button class="outline-button interior-activity" data-interior-activity="${e(id)}">${icon(game.icon)} ${e(gameCopy.action)} ${icon('arrow')}</button></section>` : ''}<button class="text-button interior-back" data-action="close-dialog">Keep exploring ${e(room.name)} ${icon('arrow')}</button></div>`, 'interior-dialog');
}
function startInteriorPractice(id: string) {
  const object = getInteriorObject(id), room = interiorId ? getInterior(interiorId) : undefined;
  if (!object || !room || !room.objects.some(item => item.id === id)) return;
  if (connection !== 'online') { toast('The town is reconnecting. Try this session again in a moment.', true); return; }
  const queue = interiorPracticeQueue(object);
  if (!queue.length) return;
  setView('world');
  run = { queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:true, interiorObjectId:id, label:`${room.name} · ${object.sessionTitle}`, started:Date.now() };
  openDialog('', 'quest-dialog interior-practice-dialog'); renderExercise();
}
function placesSection() {
  const entrances = buildingEntrances(mapId);
  if (!entrances.length) return '';
  return `<section class="interior-places"><header><div><span class="eyebrow">STEP INSIDE</span><h3>Everyday places. Useful German.</h3><p>Walk to a doorway, enter, and stay for a short learning session.</p></div>${icon('compass')}</header><div class="interior-place-list">${entrances.map(entrance => { const room = getInterior(entrance.interiorId); return `<button data-focus-building="${room.id}"><span class="interior-place-icon">${icon(interiorIcon(room.id))}</span><span><strong>${e(room.name)}</strong><small>${e(room.subtitle)}</small></span>${icon('arrow')}</button>`; }).join('')}</div></section>`;
}
function updateProgress() {
  document.querySelector('#xp-value')!.textContent = String(progress.xp);
  const q = currentQuest(), act = actFor(mapId);
  const npc = npcs.find(n => n.id === q.npcId) ?? npcs[0];
  const done = completedAtLevel(level), total = quests.filter(x => x.level === level).length;
  document.querySelector<HTMLElement>('#chapter-fill')!.style.width = `${done / total * 100}%`;
  document.querySelector('#hud-level')!.textContent = `${level} · WANDERER`;
  const finished = done === total;
  world.setObjective(finished || interiorId ? undefined : q.npcId);
  const nextAct = storyActs[storyActs.findIndex(item => item.mapId === mapId) + 1];
  document.querySelector('#quest-panel')!.innerHTML = interiorId ? `<div class="interior-session-hint"><span>${icon('book')}</span><div><small>A LITTLE GERMAN, IN CONTEXT</small><strong>Talk, notice, practise.</strong><p>Walk to people and glowing objects.</p></div></div>` : `<button class="tracker-heading" data-action="next-objective" aria-label="${finished ? 'View the next chapter' : `Next objective: speak with ${e(npc.name)}`}"><span class="quest-diamond">${icon(finished ? 'map' : 'flag')}</span><span><small>ACT ${act.number} <b>·</b> ${finished ? 'ROUTE RESTORED' : `FIND ${e(npc.name.toUpperCase())}`}</small><strong>${finished ? nextAct ? `The road to ${getMap(nextAct.mapId).name}` : 'The Atlas remembers' : e(q.title)}</strong></span>${icon('chevron')}</button>`;
  document.querySelector<HTMLElement>('#review-dot')!.hidden = !dueItems(progress).length;
  if (view === 'journal' || view === 'quests' || view === 'story' || view === 'menu') renderOther();
}
function syncTrackerState() { /* The objective chip opens a focused encounter instead of expanding across the world. */ }
let menuFocus: HTMLElement | null = null;
function worldCanInteract() { return view === 'world' && !watchingWorld && !pendingMap && !screenFilterControls?.isOpen() && !document.querySelector<HTMLDialogElement>('#dialog')!.open && document.querySelector<HTMLElement>('#chat-body')!.hidden; }
function setView(next: View) {
  if (watchingWorld) watchWorld(false);
  exposureObserver?.disconnect();
  if (next !== 'world') screenFilterControls?.close(false);
  document.dispatchEvent(new Event('atlas-controls-reset'));
  if (next !== 'world' && view === 'world') menuFocus = document.activeElement as HTMLElement;
  view = next;
  document.querySelector<HTMLElement>('#game-shell')!.dataset.view = next;
  const menu = document.querySelector<HTMLDialogElement>('#menu-layer')!;
  menu.style.setProperty('--menu-art', `url('${getMap(mapId).previewAsset}')`);
  if (next === 'world') { if (menu.open) menu.close(); menu.hidden = true; }
  else { menu.hidden = false; if (!menu.open) menu.showModal(); }
  document.querySelector<HTMLElement>('#game-hud')!.inert = next !== 'world';
  document.querySelector<HTMLElement>('#world-container')!.inert = next !== 'world';
  world.setInputEnabled(worldCanInteract());
  world.setVisible(next === 'world' && !document.hidden);
  document.querySelectorAll<HTMLElement>('[data-view]').forEach(el => { el.classList.toggle('active', el.dataset.view === next); if (el.closest('.menu-tabs')) el.setAttribute('aria-current', el.dataset.view === next ? 'page' : 'false'); });
  if (next !== 'world') {
    document.querySelector('#menu-title')!.textContent = { menu: 'Your journey', quests: 'Story quests', story: 'Discoveries', atlas: 'Region atlas', journal: 'Your German', activities: 'Side activities', course: 'Your learning routes', character: 'Your character', settings: 'Settings' }[next];
    renderOther(); document.querySelector<HTMLElement>('#other-view')!.scrollTop = 0;
    menu.querySelector<HTMLButtonElement>('.menu-close')!.focus();
  } else { requestAnimationFrame(() => world.resize()); if (menuFocus?.isConnected && menuFocus.getClientRects().length) menuFocus.focus(); }
}
function openWorldMap() { setView('atlas'); }
function openScreenFilters(trigger?: HTMLElement) {
  if (watchingWorld) watchWorld(false);
  if (view !== 'world') setView('world');
  if (!document.querySelector<HTMLElement>('#chat-body')!.hidden) toggleChat(false);
  screenFilterControls?.open(trigger);
}
function seenKey(kind: string) { return `atlas.${kind}.${api.selfId || 'visitor'}`; }
function readSeen(kind: string): string[] { try { const value: unknown = JSON.parse(localStorage.getItem(seenKey(kind)) || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return []; } }
function rememberSeen(kind: string, id: string) { const seen = new Set(readSeen(kind)); seen.add(id); localStorage.setItem(seenKey(kind), JSON.stringify([...seen])); }
function onRegionReady(id: MapId) {
  if (!mapConfirmed || id !== mapId || view !== 'world' || document.hidden || document.querySelector<HTMLDialogElement>('#dialog')!.open) return;
  if (!readSeen('acts').includes(id)) { showActIntro(id); return; }
  continueDestination();
}
function showActIntro(id: MapId) {
  const act = actFor(id), map = getMap(id);
  rememberSeen('acts', id);
  openDialog(`<div class="act-intro" style="--region-art:url('${map.previewAsset}')"><div class="act-art"><span>ACT ${act.number} · ${act.level}</span></div><div class="act-copy"><div class="eyebrow">${e(map.name.toUpperCase())}</div><h2>${e(act.title)}</h2>${act.introduction.map(p => `<p>${e(p)}</p>`).join('')}<div class="story-objective">${icon('flag')}<span>${e(act.goal)}</span></div><button class="primary-button" data-action="act-begin">Step into ${e(map.name)} ${icon('arrow')}</button></div></div>`, 'act-dialog');
}
function continueDestination() {
  const destination = pendingDestination; pendingDestination = undefined;
  if (!destination) return;
  if (interiorId) world.leaveInterior();
  if (destination.kind === 'quest') startQuest(destination.questId);
  else { const q = quests.find(item => item.id === destination.questId); if (q) world.focusNpc(q.npcId); }
}
function travelMap(id: MapId, destination?: { kind: 'quest' | 'follow'; questId: string }) {
  if (pendingMap) return;
  if (id === mapId) {
    if (interiorId) world.leaveInterior();
    document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView('world');
    pendingDestination = destination;
    if (destination) continueDestination(); else showActIntro(id);
    return;
  }
  if (connection !== 'online' || !api.joinMap(id)) { toast('The route is reconnecting. Try travelling again in a moment.', true); return; }
  pendingMap = id; pendingDestination = destination;
  document.querySelector<HTMLDialogElement>('#dialog')!.close();
  if (!document.querySelector<HTMLElement>('#chat-body')!.hidden) toggleChat(false);
  setView('world'); world.setInputEnabled(false);
  toast(`Following the lanterns to ${getMap(id).name}…`);
}
function showNextObjective() {
  const q = currentQuest(), act = actFor(mapId), done = completedAtLevel(level);
  const nextAct = storyActs[storyActs.findIndex(item => item.mapId === mapId) + 1];
  if (done === 6) {
    openDialog(`<div class="completion"><div class="completion-mark">${icon('map')}</div><div class="eyebrow">ACT ${act.number} · A ROUTE REMEMBERED</div><h2>${nextAct ? `Beyond ${e(getMap(mapId).name)}` : 'Three towns. One new promise.'}</h2><p>${e(act.cliffhanger)}</p>${nextAct ? `<button class="primary-button" data-travel="${nextAct.mapId}">Travel to ${e(getMap(nextAct.mapId).name)} ${icon('arrow')}</button>` : '<button class="primary-button" data-view="story">Read your discoveries</button>'}<button class="text-button" data-action="close-dialog">Keep exploring here</button></div>`); return;
  }
  const npc = npcs.find(item => item.id === q.npcId)!;
  const chapterQuests = quests.filter(item => item.level === level);
  const previous = chapterQuests.slice(0, chapterQuests.findIndex(item => item.id === q.id)).reverse().find(item => progress.completedQuestIds.includes(item.id));
  openDialog(`<div class="objective-dialog">${portrait(npc.id, 'large-portrait')}<div class="eyebrow">YOUR NEXT LEAD</div><h2>${e(q.title)}</h2><p>${e(previous ? clueFor(previous.id)?.lead ?? q.subtitle : act.goal)}</p><div class="story-objective">${icon('pin')}<span>Find ${e(npc.name)} · ${e(q.location)}</span></div><button class="primary-button" data-start-quest="${q.id}">Continue the story ${icon('arrow')}</button><button class="text-button" data-follow-quest="${q.id}">${icon('pin')} Track this conversation</button></div>`, 'objective-dialog');
}
function findObject(id: string): WorldObjectSpec | undefined { return maps.flatMap(map => [...map.objects]).find(item => item.id === id); }
function activityForObject(object: WorldObjectSpec): ActivityId {
  if (object.kind === 'fountain' || object.id.includes('housing')) return 'cafe';
  if (object.kind === 'garden') return 'market';
  if (object.kind === 'parcel' || object.id.includes('timetable') || object.id.includes('route-sign') || object.kind === 'lantern' || object.id.includes('chart')) return 'delivery';
  return 'detective';
}
function hasSuccessfulEncounter(itemId: string): boolean { return Object.values(progress.items[itemId]?.modeStats ?? {}).some(stats => stats.correct > 0); }
function availableObjectExercises(object: WorldObjectSpec): Exercise[] {
  const due = new Set(dueItems(progress));
  return practiceExercises(object.exerciseIds.flatMap(id => { const ex = quests.flatMap(q => q.exercises).find(item => item.id === id); return ex && (!hasSuccessfulEncounter(ex.itemId) || due.has(ex.itemId)) ? [ex.mode === 'sentence' && progress.items[ex.itemId] ? { ...ex, mode: 'type' as const, prompt: `Write in German: ${ex.english}` } : ex] : []; }), silentMode);
}
function showObject(id: string) {
  const object = findObject(id); if (!object) return;
  rememberSeen('objects', id);
  const objectMap = maps.find(map => map.objects.some(item => item.id === id))!;
  const lore = objectStories[id], queue = objectMap.id === mapId ? availableObjectExercises(object) : [];
  const game = activityInfo.find(game => game.id === activityForObject(object))!;
  openDialog(`<div class="object-encounter"><div class="object-crest">${icon(object.kind === 'clock' ? 'clock' : object.kind === 'garden' ? 'leaf' : object.kind === 'noticeboard' ? 'scroll' : 'lantern')}</div><div class="eyebrow">A LITTLE THING THAT REMEMBERS</div><h2>${e(object.label)}</h2><p>${e(lore?.detail ?? object.description)}</p><blockquote>${e(id === 'nebelstadt-observatory' && !progress.completedQuestIds.includes('b1-atlas') ? 'The instrument waits for an answer from both ends of the route. Its mechanism has a place for something that is not a key.' : lore?.secret ?? object.prompt)}</blockquote>${objectMap.id === mapId ? `<div class="object-games"><span class="eyebrow">OPTIONAL SIDE ACTIVITY</span><button class="outline-button" data-activity="${game.id}">${icon(game.icon)} ${e(game.action)} ${icon('arrow')}</button></div>` : ''}<div class="object-language"><span>${icon('book')} ${e(object.prompt)}</span>${objectMap.id !== mapId ? `<button class="primary-button" data-travel="${objectMap.id}">Travel to ${e(objectMap.name)} ${icon('arrow')}</button>` : queue.length ? `<button class="text-button" data-practice-object="${id}">Try a short language encounter <small>${queue.length} expressions</small> ${icon('arrow')}</button>` : '<p class="resting-note">Lore is always here. Familiar expressions rest until their next encounter.</p>'}</div><button class="text-button" data-action="close-dialog">Back to exploring ${icon('arrow')}</button></div>`, 'object-dialog');
}
function startObjectPractice(id: string) {
  const object = findObject(id); if (!object) return;
  const queue = availableObjectExercises(object);
  if (!queue.length) { showObject(id); return; }
  if (connection !== 'online') { toast('The town is reconnecting. Your clue is safe; try the encounter in a moment.', true); return; }
  setView('world');
  run = { queue, index: 0, correct: 0, targetCount: queue.length, hinted: false, audioHeard: false, answered: false, answer: '', tokenOrder: [], review: true, objectId: id, label: object.label, started: Date.now() };
  openDialog('', 'quest-dialog'); renderExercise();
}
async function loadCourse(): Promise<CourseModule> {
  if (course) return course;
  coursePromise ??= import('./course').then(module => {
    course = module;
    for (const word of module.courseLexicon) if (!audioPaths.has(spokenWord(word))) audioPaths.set(spokenWord(word), `/audio/word-${word.id}.mp3`);
    for (const ex of module.courseExercises) if (!audioPaths.has(ex.german)) audioPaths.set(ex.german, `/audio/${ex.id}.mp3`);
    for (const guide of module.courseGrammar) guide.examples.forEach((example, index) => { if (!audioPaths.has(example.german)) audioPaths.set(example.german, `/audio/guide-${guide.id}-${index + 1}.mp3`); });
    return module;
  }).catch(error => { coursePromise = undefined; throw error; });
  return coursePromise;
}
async function showCourseSources() {
  const module = await loadCourse().catch(() => undefined);
  if (!module) { toast('The credits could not open. Try again in a moment.', true); return; }
  setView('world');
  openDialog(`<div class="exercise-content"><div class="eyebrow">LEARNING CONTENT &amp; CREDITS</div><h2>German with a traceable source.</h2><p>The vocabulary is placed against A1–B1 reference lists. Grammar explanations, story dialogue, mini-game situations and practice passages were written for this game. Completing the course is practice evidence; proficiency also depends on using German in unfamiliar situations.</p><p>Audio uses a German synthetic voice. Speaking exercises are not included.</p>${module.courseSources.map(source => `<article class="grammar-route"><h3><a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.title)}</a></h3><p>${e(source.description)}</p><small><a href="${e(source.licenseUrl)}" target="_blank" rel="noopener noreferrer">${e(source.license)}</a></small></article>`).join('')}<button class="primary-button" data-action="close-dialog">Back to exploring</button></div>`, 'credits-dialog');
}
function spokenWord(word: { lemma: string; article?: string; articleForm?: string }) { return word.article ? `${word.article} ${word.articleForm ?? word.lemma}` : word.lemma; }
function requestCourseRender(el: Element) {
  el.innerHTML = `<div class="route-loading">${icon('book')}<h2>Opening your learning routes…</h2><p>The world stays light while your course is closed.</p></div>`;
  void loadCourse().then(() => { if (el.isConnected && (view === 'course' || view === 'journal')) renderOther(); }).catch(() => { if (el.isConnected) el.innerHTML = '<div class="route-loading"><h2>The route could not open.</h2><button class="primary-button" data-action="course-retry">Try again</button></div>'; });
}
function renderActivities(el: Element) {
  const region = getMap(mapId);
  el.innerHTML = `<div class="route-heading">${icon('star')}<div><div class="eyebrow">ACT ${actFor(mapId).number} · ${level} · ${e(region.name.toUpperCase())}</div><h2>A little detour.</h2><p>Take a break from the main story. Serve a customer, strike a deal, investigate evidence or deliver a letter. These optional activities let you practise German at your own pace.</p></div></div><div class="activity-board">${activityInfo.map((game, index) => { const saved = progress.activities?.[`${game.id}:${level}`]; return `<article class="activity-entry" style="--activity-art:url('${region.previewAsset}');--activity-position:${['35% 45%','70% 55%','10% 25%','85% 25%'][index]}">${icon(game.icon)}<small>${e(npcs.find(n => n.id === game.npcId)!.name)} · ${level} ${saved ? '· DISCOVERED' : '· OPTIONAL ACTIVITY'}</small><h3>${e(game.title)}</h3><p>${e(game.description)}</p><button class="primary-button" data-activity="${game.id}">${e(game.action)} ${icon('arrow')}</button></article>`; }).join('')}</div>`;
}
async function startActivity(id: ActivityId, source?: {roomId:InteriorId; stationId:string}) {
  if (!activityInfo.some(game => game.id === id)) return;
  if (connection !== 'online') { toast('The town is reconnecting. Try the adventure again in a moment.', true); return; }
  const room = source ? getInterior(source.roomId) : undefined;
  const gameCopy = room ? interiorGameCopy(room.id) : undefined;
  const venue = room && gameCopy ? { id:room.id, name:room.name, asset:room.asset, title:gameCopy.title, npcId:gameCopy.npcId, briefing:gameCopy.description } : undefined;
  setView('world'); run = undefined;
  activityController?.destroy(); activityController = undefined;
  openDialog('<div class="route-loading"><h2>Preparing your adventure…</h2></div>', 'activity-dialog');
  const generation = ++activityLoading;
  try {
    activitiesPromise ??= import('./activities').then(module => { activities = module; return module; }).catch(error => { activitiesPromise = undefined; throw error; });
    const module = activities ?? await activitiesPromise;
    for (const job of module.activityAudioJobs ?? []) if (!audioPaths.has(job.text)) audioPaths.set(job.text, `/audio/${job.id}.mp3`);
    const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
    if (generation !== activityLoading || !dialog.open) return;
    dialog.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Leave activity">${icon('close')}</button><div id="activity-root"></div>`;
    const regionLevel: Level = venue ? 'A1' : level;
    activityController = module.mountActivity(document.querySelector<HTMLElement>('#activity-root')!, {
      id, level: regionLevel, progress, sessionKey: venue ? `${api.selfId}:interior:${venue.id}` : api.selfId, venue,
      speak,
      onSceneVisible: (_exerciseId, context) => recordExposure(context),
      onClose: () => dialog.close(),
      onProgress: value => { acceptProgress(value); updateProgress(); },
      submit: async (exercise, answer, hinted, mode, context) => {
        const attemptId = context?.attemptId ?? crypto.randomUUID();
        const result = await api.request<import('./api').AttemptResult>('/attempt', {
          id: attemptId, itemId: exercise.itemId, exerciseId: exercise.id, answer,
          hinted, mode: mode ?? modeFor(exercise), activityId: id, runId: context?.runId, level: regionLevel,
        });
        acceptProgress(result.progress); updateProgress();
        return { ...result, attemptId };
      },
      complete: async context => {
        const result = await api.completeActivity({ id: context.runId, activityId: id, level: regionLevel, exerciseIds: context.exerciseIds, attemptIds: context.attemptIds });
        acceptProgress(result.progress); updateProgress(); playCue(true);
        const discovery = activityDiscoveries[`${id}:${regionLevel}`];
        if (discovery && result.xpAdded) toast(`A discovery for your story journal: ${discovery.title}`);
        return result;
      },
    });
  } catch (error) {
    if (generation !== activityLoading) return;
    toast((error as Error).message || 'The adventure could not open.', true);
    document.querySelector<HTMLDialogElement>('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Close">${icon('close')}</button><div class="route-loading"><h2>A small detour.</h2><p>Try the adventure again when the route is connected.</p><button class="primary-button" ${source ? `data-interior-activity="${e(source.stationId)}"` : `data-activity="${id}"`}>Try again</button></div>`;
  }
}
let coursePage = 0;
function exerciseHasSuccess(exercise: Exercise): boolean {
  const evidence = progress.exerciseStats?.[exercise.id] ?? progress.items[exercise.itemId]?.modeStats[modeFor(exercise)];
  const successes = exercise.itemId.startsWith('word-') ? evidence?.unaidedSuccesses : evidence?.correct;
  return (successes ?? 0) > 0;
}
function renderCourse(el: Element) {
  if (!course) { requestCourseRender(el); return; }
  const words = course.courseLexicon.filter(word => word.level === courseLevel);
  const units = course.courseUnits.filter(unit => unit.level === courseLevel);
  const grammar = course.courseGrammar.filter(item => item.level === courseLevel);
  const completed = units.filter(unit => progress.completedUnitIds?.includes(unit.id)).length;
  el.innerHTML = `<div class="route-heading">${icon('book')}<div><div class="eyebrow">WORDS BECOME POSSIBILITIES</div><h2>Your routes through German.</h2><p>Learn in short encounters, use the language in the world, then return when it is ready again. Vocabulary, grammar and connected texts have their own evidence.</p></div></div><div class="route-levels">${(['A1','A2','B1'] as const).map(l => `<button class="${l === courseLevel ? 'selected' : ''}" data-course-level="${l}" aria-pressed="${l === courseLevel}">${l}<small>${e(maps.find(map => map.level === l)!.name)}</small></button>`).join('')}</div><div class="route-summary"><span><strong>${words.length}</strong> words</span><span><strong>${grammar.length}</strong> grammar guides</span><span><strong>${completed} / ${units.length}</strong> routes completed</span></div><div class="route-tabs">${([['topics','Learning routes'],['grammar','Grammar guides'],['lexicon','Word atlas']] as const).map(([id,title]) => `<button class="${courseTab === id ? 'selected' : ''}" data-course-tab="${id}" aria-pressed="${courseTab === id}">${title}</button>`).join('')}</div><button class="text-button" data-action="course-sources">Learning content &amp; credits</button><div id="course-content"></div>`;
  const content = document.querySelector('#course-content')!;
  if (courseTab === 'topics') {
    const pageCount = Math.max(1, Math.ceil(units.length / 24)); coursePage = Math.min(coursePage, pageCount - 1);
    content.innerHTML = `<div class="route-unit-list">${units.slice(coursePage * 24, coursePage * 24 + 24).map(unit => { const done = progress.completedUnitIds?.includes(unit.id); const practiced = unit.exerciseIds.filter(id => { const ex = course!.courseExerciseById.get(id); return ex && exerciseHasSuccess(ex); }).length; return `<button class="route-unit ${done ? 'found' : ''}" data-course-unit="${e(unit.id)}">${icon(done ? 'check' : 'scroll')}<span><small>${unit.level} · ${e(unit.topic)}</small><strong>${e(unit.title)}</strong><em>${practiced} / ${unit.exerciseIds.length} encounters saved</em></span>${icon('chevron')}</button>`; }).join('')}</div>${pageCount > 1 ? `<div class="route-pagination"><button class="outline-button" data-course-page="${coursePage - 1}" ${coursePage === 0 ? 'disabled' : ''}>Previous</button><span>${coursePage + 1} / ${pageCount}</span><button class="outline-button" data-course-page="${coursePage + 1}" ${coursePage === pageCount - 1 ? 'disabled' : ''}>Next</button></div>` : ''}`;
  } else if (courseTab === 'grammar') {
    content.innerHTML = grammar.map(guide => { const unit = units.find(unit => unit.grammarIds.includes(guide.id)); return `<article class="grammar-route"><small class="eyebrow">${guide.level} · YOUR LANGUAGE TOOLKIT</small><h3>${e(guide.title)}</h3><p>${e(guide.explanation)}</p>${guide.examples.map(example => `<blockquote>${e(example.german)} <button class="text-button" data-speak="${e(example.german)}" aria-label="Listen to ${e(example.german)}">${icon('volume')}</button><small>${e(example.english)}</small></blockquote>`).join('')}${unit ? `<button class="primary-button" data-course-unit="${unit.id}">Try it in a scene ${icon('arrow')}</button>` : ''}</article>`; }).join('');
  } else {
    content.innerHTML = `<label class="route-search">${icon('clue')}<input id="lexicon-search" type="search" placeholder="Find a German word or English meaning…" aria-label="Search the word atlas"/></label><p class="lexicon-status" id="lexicon-status"></p><div class="lexicon-list" id="lexicon-list"></div>`;
    bindLexiconSearch(words);
  }
}
function lexemeCards(words: CourseModule['courseLexicon']): string {
  return words.map(word => {
    const memory = progress.words?.[word.id];
    const forms = word.forms?.length ? word.forms.slice(0, 4).join(' · ') : '';
    return `<article class="lexeme" data-lexeme="${e(word.id)}"><div class="lexeme-header"><span>${word.level} · ${e(word.pos)}</span><button data-speak="${e(spokenWord(word))}" aria-label="Listen to ${e(spokenWord(word))}">${icon('volume')}</button></div><h3>${word.article ? `<small>${e(word.article)}</small> ` : ''}${e(word.article ? word.articleForm ?? word.lemma : word.lemma)}</h3><p>${e(word.english)}</p>${word.plural ? `<small>Plural: ${e(word.plural)}</small>` : ''}${forms ? `<small>${e(forms)}</small>` : ''}${memory ? `<div class="lexeme-evidence">${(['recognition','listening','production'] as const).map(mode => `<span class="${memory.evidence?.[mode]?.status === 'retained' ? 'retained' : ''}">${mode === 'recognition' ? 'Read' : mode === 'listening' ? 'Hear' : 'Recall'} · ${memory.evidence?.[mode]?.status === 'retained' ? 'retained' : memory.evidence?.[mode]?.correct ? 'growing' : 'new'}</span>`).join('')}</div>` : '<small>A new word to discover</small>'}<button class="text-button" data-word-practice="${word.id}">${icon('leaf')} ${memory && Date.parse(memory.dueAt) > Date.now() ? 'Explore this word' : 'Practise this word'}</button></article>`;
  }).join('');
}
function bindLexiconSearch(words: CourseModule['courseLexicon']) {
  const render = (query = '') => {
    const matches = words.filter(word => `${word.lemma} ${word.english} ${word.topic}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    document.querySelector('#lexicon-list')!.innerHTML = lexemeCards(matches.slice(0, 36));
    document.querySelector('#lexicon-status')!.textContent = matches.length > 36 ? `${matches.length} words. Showing the first 36; search to find any word.` : `${matches.length} ${matches.length === 1 ? 'word' : 'words'}.`;
    observeVisibleWords();
  };
  render();
  document.querySelector<HTMLInputElement>('#lexicon-search')!.oninput = event => render((event.target as HTMLInputElement).value);
}
function renderWordJournal(el: Element) {
  if (!course) { requestCourseRender(el); return; }
  const seen = course.courseLexicon.filter(word => progress.words?.[word.id]);
  const due = seen.filter(word => Date.parse(progress.words[word.id].dueAt) <= Date.now());
  const retained = seen.filter(word => progress.words[word.id].mastery === 'retained');
  el.innerHTML = `<div class="route-heading">${icon('leaf')}<div><div class="eyebrow">YOUR GERMAN, GROWING WITH YOU</div><h2>Every word has its own story.</h2><p>Seeing a word introduces it. Recognising, hearing and recalling it each build their own memory. Familiar words rest between encounters.</p></div></div><div class="route-tabs"><button class="selected" data-journal-tab="words">Individual words</button><button data-journal-tab="phrases">Story expressions</button></div><div class="route-summary"><span><strong>${seen.length}</strong> words encountered</span><span><strong>${retained.length}</strong> retained in all three skills</span><span><strong>${due.length}</strong> ready to revisit</span></div><button class="primary-button" data-action="review">${icon('refresh')} ${due.length ? 'Take a short recall walk' : 'Check ready practice'}</button>${seen.length ? '<label class="route-search"><input id="lexicon-search" type="search" placeholder="Find a word or meaning…" aria-label="Search your individual words"/></label><p class="lexicon-status" id="lexicon-status"></p><div class="lexicon-list" id="lexicon-list"></div>' : '<div class="route-loading"><h3>Your first word is waiting.</h3><p>Use German in the world or follow a learning route to begin.</p><button class="primary-button" data-view="course">Open your learning routes</button></div>'}`;
  if (seen.length) bindLexiconSearch(seen);
}
async function startWordPractice(id: string) {
  const module = await loadCourse().catch(error => { toast(error.message, true); return undefined; });
  const word = module?.lexemeById.get(id); if (!word || !module) return;
  const memory = progress.words?.[id];
  if (memory?.mastery === 'retained' && Date.parse(memory.dueAt) > Date.now()) {
    openDialog(`<div class="course-intro"><div class="eyebrow">A FAMILIAR WORD, AT REST</div><h2>${e(spokenWord(word))}</h2><p>${e(word.english)}</p><p>This word is resting. Its next encounter is ${new Date(memory.dueAt).toLocaleDateString(undefined, {month:'short',day:'numeric'})}.</p><button class="primary-button" data-speak="${e(spokenWord(word))}">${icon('volume')} Hear this word</button><button class="text-button" data-action="close-dialog">Keep exploring</button></div>`, 'course-dialog'); return;
  }
  if (connection !== 'online') { toast('The town is reconnecting. Try again in a moment.', true); return; }
  const queue = practiceExercises(module.courseExercises, silentMode).filter(ex => ex.itemId === `word-${id}` && (!exerciseHasSuccess(ex) || Date.parse(memory?.evidence?.[modeFor(ex)]?.dueAt ?? '') <= Date.now()));
  if (!queue.length) { toast(silentMode ? 'No reading or writing practice is ready for this word. Listening is skipped in silent mode.' : 'This word is resting. There is a new adventure waiting.'); return; }
  setView('world'); run = { queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:true, label:`A word for your journey · ${word.lemma}`, started:Date.now() };
  openDialog('', 'quest-dialog'); renderExercise();
}
async function startCourseUnit(id: string) {
  const module = await loadCourse().catch(error => { toast(error.message, true); return undefined; });
  const unit = module?.courseUnits.find(item => item.id === id); if (!module || !unit) return;
  if (connection !== 'online') { toast('The town is reconnecting. Try again in a moment.', true); return; }
  const due = new Set(dueItems(progress));
  const pending = unit.exerciseIds.map(id => module.courseExerciseById.get(id)).filter((ex): ex is NonNullable<typeof ex> => !!ex && !exerciseHasSuccess(ex));
  const revisits = unit.exerciseIds.map(id => module.courseExerciseById.get(id)).filter((ex): ex is NonNullable<typeof ex> => !!ex && due.has(ex.itemId) && (!ex.targetWordId || !progress.words[ex.targetWordId]?.evidence?.[modeFor(ex)]?.dueAt || Date.parse(progress.words[ex.targetWordId].evidence[modeFor(ex)].dueAt) <= Date.now()));
  const queue = practiceExercises(pending.length ? pending : revisits, silentMode).slice(0, 8);
  if (!queue.length && pending.length) { toast('This route has listening practice left. Turn off silent mode when you are ready to listen.'); return; }
  setView('world');
  run = { unitId:id, queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:false, label:unit.title, started:Date.now() };
  const guides = module.courseGrammar.filter(guide => unit.grammarIds.includes(guide.id));
  openDialog(`<div class="quest-intro"><div class="eyebrow">${unit.level} · ${e(unit.topic)}</div><h2>${e(unit.title)}</h2><div class="course-intro-reference"><p class="intro-story">${e(unit.summary)}</p>${guides.map(guide => `<div class="course-intro-examples">${guide.title !== unit.title ? `<strong>${e(guide.title)}</strong>` : ''}${guide.explanation !== unit.summary ? `<p>${e(guide.explanation)}</p>` : ''}${guide.examples.slice(0,2).map(example => `<p><b>${e(example.german)}</b><br/>${e(example.english)}</p>`).join('')}</div>`).join('')}</div><div class="intro-details"><span>${icon('book')} ${queue.length} encounters in this short visit</span><span>${pending.length} remaining on this route</span></div><button class="primary-button" data-action="begin-exercises">${queue.length ? 'Follow this learning route' : 'Save this completed route'} ${icon('arrow')}</button><small>Already saved answers stay with you. You can leave at any time.</small></div>`, 'quest-dialog course-dialog');
}
async function startAdaptiveReview() {
  const module = await loadCourse().catch(() => undefined);
  if (!module) { startReview(); return; }
  if (connection !== 'online') { toast('The town is reconnecting. Try again in a moment.', true); return; }
  const queue = reviewExercises(progress, module.courseExercises, quests.flatMap(q => q.exercises), Date.now(), silentMode);
  if (!queue.length) { toast(silentMode ? 'No reading or writing reviews are ready. Listening is skipped in silent mode.' : 'Your familiar words are resting. Follow a new route or play an adventure.'); return; }
  setView('world'); run = { queue,index:0,correct:0,targetCount:queue.length,hinted:false,audioHeard:false,answered:false,answer:'',tokenOrder:[],review:true,label:'A short recall walk',started:Date.now() };
  openDialog('', 'quest-dialog'); renderExercise();
}
function bindJoystick() {
  const stick = document.querySelector<HTMLElement>('#joystick')!;
  const knob = document.querySelector<HTMLElement>('#joystick-knob')!;
  let held: number | undefined;
  const reset = () => { const pointer = held; held = undefined; if (pointer !== undefined && stick.hasPointerCapture(pointer)) stick.releasePointerCapture(pointer); world.setJoystick(0, 0); knob.style.transform = ''; stick.classList.remove('held'); };
  const move = (event: PointerEvent) => {
    if (held !== event.pointerId) return;
    const bounds = stick.getBoundingClientRect();
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    const radius = bounds.width * 0.3;
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    world.setJoystick(dx / radius, dy / radius);
  };
  stick.addEventListener('pointerdown', event => { if (held !== undefined || !worldCanInteract()) return; event.preventDefault(); held = event.pointerId; stick.setPointerCapture(held); stick.classList.add('held'); move(event); });
  stick.addEventListener('pointermove', move);
  stick.addEventListener('pointerup', reset);
  stick.addEventListener('pointercancel', reset);
  stick.addEventListener('lostpointercapture', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('atlas-controls-reset', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
}
function earnedActivityJournal(): string {
  const discoveries = Object.keys(progress.activities ?? {}).flatMap(id => activityDiscoveries[id] ? [activityDiscoveries[id]] : []);
  if (!discoveries.length) return '';
  return `<section class="field-notes"><div class="eyebrow">WHAT YOUR ACTIONS UNCOVERED</div><h3>Witnesses from the road</h3>${discoveries.map(clue => `<article class="grammar-route"><small class="eyebrow">${clue.level} · ${e(maps.find(map => map.level === clue.level)!.name)}</small><h3>${e(clue.title)}</h3><p>${e(clue.text)}</p><blockquote>${e(clue.lead)}</blockquote></article>`).join('')}</section>`;
}
function renderOther() {
  exposureObserver?.disconnect();
  const el = document.querySelector('#other-view')!;
  if (view === 'activities') { renderActivities(el); return; }
  if (view === 'course') { renderCourse(el); return; }
  if (view === 'journal' && journalTab === 'words') { renderWordJournal(el); return; }
  if (view === 'menu') {
    const act = actFor(mapId), clueCount = discoveredClues(progress.completedQuestIds).length;
    const quest = currentQuest(), npc = npcs.find(item => item.id === quest.npcId)!;
    const nextAct = storyActs[storyActs.findIndex(item => item.mapId === mapId) + 1];
    el.innerHTML = adventureHome({ act, region: getMap(mapId).name, regionArt: getMap(mapId).previewAsset, quest, npc, portrait: portrait(npc.id), completed: completedAtLevel(level), total: quests.filter(item => item.level === level).length, nextRegion: nextAct ? getMap(nextAct.mapId).name : undefined, clueCount, dueCount: dueItems(progress).length }) + placesSection();
  } else if (view === 'quests') {
    const act = actFor(mapId), chapterQuests = quests.filter(q => q.level === level);
    el.innerHTML = `<div class="quest-log-heading"><span class="eyebrow">ACT ${act.number} · ${e(getMap(mapId).name.toUpperCase())}</span><h2>${e(act.title)}</h2><p>${e(act.goal)}</p></div><div class="quest-log-list">${chapterQuests.map((q, i) => { const done = progress.completedQuestIds.includes(q.id), next = q.id === currentQuest().id && !done; return `<button class="quest-log-entry ${done ? 'found' : next ? 'next' : ''}" data-start-quest="${q.id}"><span class="quest-log-number">${done ? icon('check') : String(i + 1).padStart(2, '0')}</span>${portrait(q.npcId)}<span class="quest-log-copy"><small>${done ? 'DISCOVERED' : next ? 'YOUR NEXT LEAD' : 'A STORY TO FIND'} · ${e(q.location)}</small><strong>${e(q.title)}</strong><span>${e(done ? clueFor(q.id)?.title ?? q.subtitle : q.subtitle)}</span></span>${icon('chevron')}</button>`; }).join('')}</div><button class="primary-button" data-action="next-objective">${icon('flag')} ${completedAtLevel(level) === 6 ? 'Follow the next route' : 'Find my next lead'}</button><div class="quest-region-strip">${maps.map(map => `<button data-travel="${map.id}" class="${map.id === mapId ? 'here' : ''}"><span>${map.level}</span>${e(map.name)}${icon(map.id === mapId ? 'pin' : 'arrow')}</button>`).join('')}</div>`;
  } else if (view === 'story') {
    const found = discoveredClues(progress.completedQuestIds), inspected = readSeen('objects');
    el.innerHTML = `<div class="story-journal-heading"><div class="eyebrow">EVIDENCE, SECRETS & SMALL PROMISES</div><h2>The missing routes</h2><p>${found.length ? `${found.length} ${found.length === 1 ? 'clue' : 'clues'} remembered. Each one came from helping someone.` : 'A platform, a blank letter, and a town that should exist. Your first conversation is the beginning of the trail.'}</p></div><div class="story-acts">${storyActs.map(act => { const qs = quests.filter(q => q.level === act.level), clues = found.filter(clue => qs.some(q => q.id === clue.questId)); return `<section class="story-act"><header><span class="act-number">${act.number}</span><div><small>${act.level} · ${e(getMap(act.mapId).name)}</small><h3>${e(act.title)}</h3></div><span class="clue-count">${clues.length} / 6</span></header>${clues.length ? `<div class="clue-pages">${clues.map(clue => `<article class="clue-page"><span>${icon('lantern')}</span><div><h4>${e(clue.title)}</h4><p>${e(clue.text)}</p><small>${e(clue.lead)}</small></div></article>`).join('')}</div>` : '<p class="undiscovered-clue">This page is waiting for a conversation.</p>'}${clues.length === 6 ? `<blockquote class="act-cliffhanger">${e(act.cliffhanger)}</blockquote>` : ''}</section>`; }).join('')}</div>${inspected.length ? `<section class="field-notes"><div class="eyebrow">THINGS YOU NOTICED</div><h3>Notes from the road</h3>${maps.flatMap(map => map.objects.filter(object => inspected.includes(object.id)).map(object => `<button data-inspect-object="${object.id}" data-object-map="${map.id}">${icon('pin')}<span><strong>${e(object.label)}</strong><small>${e(map.name)}</small></span>${icon('chevron')}</button>`)).join('')}</section>` : ''}${earnedActivityJournal()}<button class="primary-button" data-action="next-objective">Follow the next lead ${icon('arrow')}</button>`;
  } else if (view === 'atlas') {
    const current = getMap(mapId);
    el.innerHTML = `<div class="atlas-heading"><span class="eyebrow">FOLLOW THE LANTERNS</span><h2>Three places. One missing promise.</h2><p>Begin in Lindenhafen, follow the trail to Waldruh, then bring the evidence to Nebelstadt. You can explore any route.</p></div><div class="region-cards">${maps.map((map, index) => { const act = actFor(map.id), done = completedAtLevel(map.level), recommended = index === 0 || completedAtLevel(maps[index - 1].level) === 6; return `<article class="region-card ${map.id === mapId ? 'current' : ''}"><div class="region-card-art" style="background-image:url('${map.previewAsset}')"><span>ACT ${act.number} · ${map.level}</span>${map.id === mapId ? '<b>YOU ARE HERE</b>' : ''}</div><div class="region-card-copy"><h3>${e(map.name)}</h3><small>${e(map.subtitle)}</small><p>${e(act.premise)}</p><div class="region-card-meta"><span>${done} / 6 stories</span><span>${recommended ? 'Ready to explore' : `Best after act ${index === 1 ? 'I' : 'II'}`}</span></div><button class="${map.id === mapId ? 'outline-button' : 'primary-button'}" ${map.id === mapId ? 'data-view="world"' : `data-travel="${map.id}"`}>${map.id === mapId ? 'Return to exploring' : `Travel to ${e(map.name)}`} ${icon('arrow')}</button></div></article>`; }).join('')}</div>${placesSection()}<section class="region-local-map"><div><span class="eyebrow">NEARBY IN ${e(current.name.toUpperCase())}</span><h3>People & little things</h3><p>Choose a marker to walk there.</p></div><div class="atlas-map"><img src="${current.previewAsset}" alt="Painted map of ${e(current.name)}"/>${current.npcs.map(point => { const npc = npcs.find(item => item.id === point.id); return npc ? `<button class="atlas-map-pin" data-waypoint="${point.id}" style="left:${point.x * 100}%;top:${point.y * 100}%" aria-label="Walk to ${e(npc.name)}">${portrait(point.id)}<span>${e(npc.name)}</span></button>` : ''; }).join('')}${current.objects.map(object => `<button class="object-map-pin" data-focus-object="${object.id}" style="left:${object.x * 100}%;top:${object.y * 100}%" aria-label="Walk to ${e(object.label)}">${icon(object.kind === 'garden' ? 'leaf' : object.kind === 'clock' ? 'clock' : 'lantern')}</button>`).join('')}<span class="atlas-map-compass">${icon('compass')} N</span></div></section>`;
  } else if (view === 'journal') {
    const learned = vocabulary.filter(v => progress.items[v.id]);
    const due = dueItems(progress);
    const accuracy = progress.attempts ? Math.round(progress.correctAttempts / progress.attempts * 100) : 0;
    el.innerHTML = `<div class="route-tabs"><button data-journal-tab="words">Individual words</button><button class="selected" data-journal-tab="phrases">Story expressions</button></div><div class="page-heading"><div><div class="eyebrow">LITTLE WORDS. BIG POSSIBILITIES.</div><h1>Your words. Your discoveries.</h1><p>Collected in the world. Remembered in your own time.</p></div><button class="primary-button journal-review" data-action="review">${icon('refresh')} ${due.length ? `Practice ${Math.min(due.length, 8)} ready words` : 'Words are resting'}</button></div><div class="journal-stats"><div>${icon('book')}<strong>${learned.length}</strong><span>Expressions encountered</span></div><div>${icon('leaf')}<strong>${due.length}</strong><span>Ready to revisit</span></div><div>${icon('check')}<strong>${accuracy}%</strong><span>Answers correct</span></div><div>${icon('sparkles')}<strong>${progress.xp}</strong><span>Adventure XP</span></div></div><div class="journal-toolbar"><label>${icon('book')}<input id="word-search" placeholder="Find a word or meaning…" aria-label="Search your word journal"/></label><span>Recognition, listening, and production grow separately.</span></div><div class="word-grid" id="word-grid">${learned.length ? learned.map(v => { const m = progress.items[v.id]; return `<article class="word-card" data-word="${e(`${v.german} ${v.english}`.toLowerCase())}"><div><span class="word-level">${v.level}</span><button class="icon-button" data-speak="${e(v.german)}" aria-label="Listen to ${e(v.german)}">${icon('volume')}</button></div><h3>${e(v.german)}</h3><p>${e(v.english)}</p><small>${e(v.example)}</small><div class="memory-row"><span>${icon('leaf')} ${memoryLabel(m.repetitions, m.stabilityDays)}</span><span>${Date.parse(m.dueAt) <= Date.now() ? 'Ready for a new encounter' : `Next encounter ${new Date(m.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</span></div></article>`; }).join('') : `<div class="empty-state">${icon('book')}<h2>Your story is still being written.</h2><p>The words you meet on your adventures will find a home here.</p><button class="primary-button" data-view="world">Meet Lindenhafen ${icon('arrow')}</button></div>`}</div>`;
    document.querySelector<HTMLInputElement>('#word-search')?.addEventListener('input', event => {
      const query = (event.target as HTMLInputElement).value.toLowerCase();
      document.querySelectorAll<HTMLElement>('[data-word]').forEach(card => { card.hidden = !card.dataset.word!.includes(query); });
    });
  } else if (view === 'character') {
    el.innerHTML = `<div class="page-heading"><div><div class="eyebrow">EVERY ADVENTURE NEEDS A YOU.</div><h1>Make your mark.</h1><p>A little style. A little personality. Quite a lot of curiosity.</p></div></div><section class="character-page"><div class="character-illustration"><canvas class="painted-avatar" data-avatar-preview width="384" height="576" role="img" aria-label="Your character appearance"></canvas><h2>${e(profile.name)}</h2><p>A wanderer of the Atlas</p><span class="character-xp">${icon('sparkles')} ${progress.xp} adventure XP</span></div><div class="character-options">${profileForm()}<p class="honest-note">Your colours appear on your moving character and are visible to other players.</p></div></section>`;
    bindProfileForm();
  } else if (view === 'settings') {
    el.innerHTML = `<div class="page-heading"><div><div class="eyebrow">MAKE YOURSELF AT HOME.</div><h1>Your adventure, your rules.</h1><p>Comfort makes room for curiosity.</p></div></div><div class="settings-card"><div><h3>Silent mode</h3><p>Automatically skip listening exercises and mute audio. Skipped exercises stay available for later. Saved on this device.</p></div>${silentModeButton()}<div><h3>Listening pace</h3><p>German audio is included. Choose a comfortable pace and replay it whenever you like.</p></div><select id="speech-rate" aria-label="German speech rate"><option value="0.65">A little slower</option><option value="0.82">Easy pace</option><option value="1">Natural pace</option></select><div><h3>Interface sounds</h3><p>Small musical cues after your answers.</p></div><button class="outline-button" data-action="sound" id="settings-sound">${icon(muted ? 'muted' : 'volume')} ${muted ? 'Sound off' : 'Sound on'}</button><div><h3>World motion</h3><p>Choose lively town scenery or a calmer world. Your device currently requests ${window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced motion' : 'full motion'}.</p></div><select id="world-motion" aria-label="World motion"><option value="auto">Follow device preference</option><option value="full">Full world animation</option><option value="reduced">Calm, still scenery</option></select><div><h3>Time of day</h3><p>Watch warm daylight turn into moonlit streets. Let the day pass, follow your local clock, or choose a moment.</p></div><select id="world-time-mode" aria-label="World clock"><option value="cycle">Slow day and night cycle</option><option value="local">Real local time</option><option value="manual">Choose a time</option></select><div class="settings-time-preview"><label for="world-hour">Time to watch</label><input id="world-hour" type="range" min="0" max="23.75" step="0.25" aria-label="Time to watch"><output id="world-hour-label" for="world-hour"></output></div><div><h3>Screen filters</h3><p>Experiment with a softer world or an old television finish. Your choices are saved on this device.</p></div><button class="outline-button" data-action="screen-filters">${icon('sparkles')} Try filters in the world</button><div><h3>Your learning chapter</h3><p>Visit another chapter at any time. Your discoveries stay with you.</p></div><div class="level-switch settings-levels">${(['A1', 'A2', 'B1'] as const).map(l => `<button data-level="${l}" class="${l === level ? 'selected' : ''}">${l}</button>`).join('')}</div><div><h3>World controls</h3><p>Travel from the Atlas. Use the joystick or WASD to explore, and E to interact.</p></div><div class="settings-controls"><button class="outline-button" data-action="fullscreen">${icon('expand')} Full screen</button><button class="outline-button" data-action="zoom-out" aria-label="Zoom out">${icon('minus')}</button><button class="outline-button" data-action="zoom-in" aria-label="Zoom in">${icon('plus')}</button></div></div><button class="text-button" data-action="course-sources">Learning content &amp; credits</button><div class="connection-info">${icon('users')} ${connection === 'online' ? 'Your route is connected. Your progress is saved on the server.' : 'The route is reconnecting. Keep this tab open.'}</div>`;
    const select = document.querySelector<HTMLSelectElement>('#speech-rate')!;
    select.value = String(speechRate);
    select.onchange = () => { speechRate = Number(select.value); localStorage.setItem('atlas.speechRate', String(speechRate)); };
    const clockSelect = document.querySelector<HTMLSelectElement>('#world-time-mode')!;
    const hourSlider = document.querySelector<HTMLInputElement>('#world-hour')!;
    const clockState = world.getWorldTime();
    clockSelect.value = worldTimeMode;
    hourSlider.value = String(clockState.hour);
    document.querySelector('#world-hour-label')!.textContent = `${clockState.label} · ${clockState.period.toUpperCase()}`;
    clockSelect.onchange = () => {
      worldTimeMode = clockSelect.value as WorldTimeMode;
      localStorage.setItem('atlas.worldTimeMode', worldTimeMode);
      world.setTimePreference({ mode: worldTimeMode, hour: Number(hourSlider.value) });
    };
    hourSlider.oninput = () => {
      manualWorldHour = Number(hourSlider.value);
      worldTimeMode = 'manual'; clockSelect.value = 'manual';
      localStorage.setItem('atlas.worldHour', String(manualWorldHour));
      localStorage.setItem('atlas.worldTimeMode', worldTimeMode);
      world.setTimePreference({ mode: worldTimeMode, hour: manualWorldHour });
    };
    const motionSelect = document.querySelector<HTMLSelectElement>('#world-motion')!;
    motionSelect.value = worldMotion;
    motionSelect.onchange = () => {
      worldMotion = motionSelect.value as WorldMotion;
      localStorage.setItem('atlas.worldMotion', worldMotion);
      world.setMotionPreference(worldMotion);
    };
  }
}
function openDialog(html: string, className = '') {
  screenFilterControls?.close(false);
  const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
  if (dialog.open) dialog.close();
  dialog.className = `dialog ${className}`;
  dialog.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Close">${icon('close')}</button>${html}`;
  if (className === 'npc-dialog') { dialog.setAttribute('aria-labelledby', 'encounter-title'); dialog.removeAttribute('aria-label'); }
  else { dialog.removeAttribute('aria-labelledby'); dialog.setAttribute('aria-label', 'Adventure encounter'); }
  world.setInputEnabled(false);
  if (className.includes('activity-dialog')) world.setVisible(false);
  document.dispatchEvent(new Event('atlas-controls-reset'));
  document.querySelector('#game-shell')!.classList.add('encounter-open');
  dialog.showModal();
}
function showNpc(id: string) {
  const npc = npcs.find(n => n.id === id);
  if (!npc) return;
  const q = quests.find(q => q.npcId === id && q.level === level && !progress.completedQuestIds.includes(q.id)) ?? quests.find(q => q.npcId === id && q.level === level);
  const gameId: ActivityId = id === 'marta' ? 'cafe' : id === 'fritz' || id === 'greta' ? 'market' : id === 'lina' || id === 'otto' ? 'delivery' : 'detective';
  const game = activityInfo.find(game => game.id === gameId)!;
  recordExposure({npcId:id});
  openDialog(npcEncounter(npc, getMap(mapId).name, portrait(id, 'large-portrait'), game, q, !!q && progress.completedQuestIds.includes(q.id)), 'npc-dialog');
}
function startQuest(id: string) {
  const quest = quests.find(q => q.id === id);
  if (!quest) return;
  const region = maps.find(item => item.level === quest.level)!;
  if (mapId !== region.id) { travelMap(region.id, { kind: 'quest', questId: id }); return; }
  if (connection !== 'online') { toast('The town is reconnecting. Try again in a moment.', true); return; }
  setView('world');
  const due = new Set(dueItems(progress));
  const queue = practiceExercises(quest.exercises, silentMode).filter(ex => !hasSuccessfulEncounter(ex.itemId) || due.has(ex.itemId));
  if (!queue.length && quest.exercises.some(ex => !hasSuccessfulEncounter(ex.itemId))) { toast('This quest has listening practice left. Turn off silent mode when you are ready to listen.'); return; }
  run = { quest, queue, index: 0, correct: 0, targetCount: queue.length, hinted: false, audioHeard: false, answered: false, answer: '', tokenOrder: [], review: false, started: Date.now() };
  const npc = npcs.find(n => n.id === quest.npcId) ?? npcs[0];
  openDialog(`<div class="quest-intro">${portrait(npc.id, 'large-portrait')}<div class="eyebrow">${quest.level} · ${e(quest.location)}</div><h2>${e(quest.title)}</h2><p class="intro-story">${e(quest.story)}</p><div class="intro-details"><span>${icon('book')} ${queue.length ? `${queue.length} expressions to practise` : 'Your expressions are already saved'}</span><span>${icon('sparkles')} +${quest.reward} XP</span></div><button class="primary-button" data-action="begin-exercises">${queue.length ? 'Let the adventure begin' : 'Discover the next clue'} ${icon('arrow')}</button><small>You can take a break at any time. Your answered words stay saved.</small></div>`, 'quest-dialog');
}
function startReview() {
  const ids = dueItems(progress).slice(0, 8);
  const queue = ids.flatMap(id => {
    const ex = practiceExercises(quests.flatMap(q => q.exercises), silentMode).find(x => x.itemId === id);
    if (!ex) return [];
    return [{ ...ex, ...(ex.mode === 'sentence' ? { mode: 'type' as const, prompt: `A familiar request, a new encounter. Write in German: ${ex.english}` } : {}) }];
  });
  if (!queue.length) { toast('Your familiar words are resting. There’s a new adventure waiting.'); return; }
  if (connection !== 'online') { toast('The town is reconnecting. Try again in a moment.', true); return; }
  setView('world');
  run = { queue, index: 0, correct: 0, targetCount: queue.length, hinted: false, audioHeard: false, answered: false, answer: '', tokenOrder: [], review: true, started: Date.now() };
  openDialog('', 'quest-dialog'); renderExercise();
}
function renderExercise() {
  if (!run) return;
  if (silentMode) skipListeningExercises(run);
  if (run.index >= run.queue.length) { void finishRun(); return; }
  const ex = run.queue[run.index];
  run.hinted = false; run.audioHeard = false; run.answered = false; run.answer = ''; run.tokenOrder = [];
  run.submission = undefined;
  stopSpeech();
  const label = { choice: 'MAKE YOURSELF UNDERSTOOD', listen: 'LISTEN FOR A LITTLE CLUE', sentence: 'FIND THE RIGHT WORDS', type: 'YOUR WORDS, YOUR WAY' }[ex.mode];
  const optionMarkup = [...(ex.options ?? [])].map((option, i) => ({ option, seed: hash(`${ex.id}:${run!.index}:${i}`) })).sort((a, b) => a.seed - b.seed).map(({ option }, i) => `<button class="answer-option" data-answer="${e(option)}"><span>${String.fromCharCode(65 + i)}</span>${e(option)}</button>`).join('');
  document.querySelector<HTMLDialogElement>('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Close adventure">${icon('close')}</button><div class="exercise-header"><span>${run.label ? e(run.label) : run.review ? 'A familiar face, a new encounter' : e(run.quest?.title ?? 'Your learning route')}</span><strong>${Math.min(run.index + 1, run.targetCount)} / ${run.targetCount}</strong></div><div class="exercise-progress"><span style="width:${Math.min(100, run.correct / (run.targetCount) * 100)}%"></span></div><div class="exercise-content"><div class="exercise-preferences">${silentModeButton()}</div><div class="eyebrow">${label}</div><h2>${e(ex.prompt)}</h2>${ex.mode === 'listen' ? `<div class="audio-scene"><button class="audio-play" data-speak="${e(ex.german)}" aria-label="Play German audio">${icon('volume')}</button><div><strong>A voice from ${e(interiorId ? getInterior(interiorId).name : getMap(mapId).name)}</strong><span>Listen, then choose your answer. Replay any time.</span></div></div><button class="text-button transcript-button" data-action="transcript">Show transcript</button><p class="transcript" id="transcript" hidden>${e(ex.german)}</p>` : ''}<div class="exercise-answer">${ex.mode === 'choice' || ex.mode === 'listen' ? `<div class="answer-options">${optionMarkup}</div>` : ex.mode === 'sentence' ? `<div class="sentence-result" id="sentence-result" aria-label="Your sentence"><span class="sentence-placeholder">Tap the words to build your answer</span></div><div class="word-tokens" id="word-tokens">${[...(ex.tokens ?? ex.answer.split(' '))].map((token, i) => ({ token, i })).sort((a, b) => hash(`${ex.id}-${a.i}`) - hash(`${ex.id}-${b.i}`)).map(({ token, i }) => `<button class="word-token" data-token="${i}" data-value="${e(token)}">${e(token)}</button>`).join('')}</div><button class="text-button" data-action="clear-sentence">${icon('refresh')} Start the sentence again</button>` : `<form id="typed-answer-form"><input class="typed-answer" id="typed-answer" placeholder="Write your answer in German…" autocomplete="off" autocapitalize="sentences" spellcheck="false" aria-label="Your German answer"/><div class="german-keys">${['ä', 'ö', 'ü', 'ß'].map(char => `<button type="button" data-insert="${char}">${char}</button>`).join('')}</div></form>`}</div><div id="exercise-feedback" class="exercise-feedback" aria-live="polite"></div><div class="exercise-actions"><button class="text-button" data-action="hint">${icon('sparkles')} A little help</button>${ex.mode === 'sentence' || ex.mode === 'type' ? '<button class="primary-button" data-action="check-answer" id="check-answer">Check my answer ' + icon('arrow') + '</button>' : ''}<button class="primary-button" data-action="next-exercise" id="next-exercise" hidden>On with the story ${icon('arrow')}</button></div><p class="exercise-hint" id="exercise-hint" hidden>${e(ex.hint)}</p></div>`;
  document.querySelector('#typed-answer-form')?.addEventListener('submit', event => { event.preventDefault(); void submitAnswer(); });
  if (ex.mode === 'choice' || ex.mode === 'sentence') recordExposure({exerciseId:ex.id});
  if (ex.mode === 'type') document.querySelector<HTMLInputElement>('#typed-answer')?.focus();
}
function hash(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}
function assembleSentence(index: number) {
  if (!run || run.answered || run.tokenOrder.includes(index)) return;
  run.tokenOrder.push(index);
  const token = document.querySelector<HTMLButtonElement>(`[data-token="${index}"]`)!;
  token.disabled = true;
  const tokens = run.tokenOrder.map(i => document.querySelector<HTMLElement>(`[data-token="${i}"]`)!.dataset.value!);
  run.answer = tokens.join(' ');
  document.querySelector('#sentence-result')!.innerHTML = tokens.map((t, i) => `<button class="selected-token" data-remove-token="${i}">${e(t)}</button>`).join('');
}
async function submitAnswer(selected?: string) {
  if (!run || run.answered || attemptBusy) return;
  const activeRun = run;
  const ex = activeRun.queue[activeRun.index];
  const answer = activeRun.submission?.answer ?? selected ?? (ex.mode === 'type' ? document.querySelector<HTMLInputElement>('#typed-answer')!.value : activeRun.answer);
  if (!answer.trim()) { toast('Give it a try. A little help is here if you need it.'); return; }
  attemptBusy = true;
  document.querySelectorAll<HTMLButtonElement>('.answer-option, #check-answer').forEach(button => { button.disabled = true; });
  try {
    const supported = activeRun.hinted || ex.mode === 'sentence' || (ex.mode === 'listen' && !activeRun.audioHeard);
    activeRun.submission ??= { id: crypto.randomUUID(), itemId: ex.itemId, exerciseId: ex.id, answer, hinted: supported, mode: ex.mode === 'listen' && !activeRun.audioHeard ? 'recognition' : modeFor(ex), questId: activeRun.quest?.id };
    const result = await api.request<{ correct: boolean; xpAdded: number; duplicate: boolean; progress: Progress }>('/attempt', activeRun.submission);
    acceptProgress(result.progress);
    updateProgress();
    if (run !== activeRun) return;
    activeRun.answered = true;
    if (result.correct) { activeRun.correct++; playCue(true); }
    else { activeRun.queue.push(ex); playCue(false); }
    const feedback = document.querySelector<HTMLElement>('#exercise-feedback')!;
    feedback.className = `exercise-feedback shown ${result.correct ? 'correct' : 'incorrect'}`;
    feedback.innerHTML = `<span class="feedback-icon">${icon(result.correct ? 'check' : 'leaf')}</span><div><strong>${result.correct ? ['That’s the way!', 'Nicely said.', 'A little more German. A little more you.'][activeRun.correct % 3] : 'A small detour. You’ll get there.'}</strong><p>${result.correct ? e(ex.explanation) : `The answer is <b>${e(ex.answer)}</b>. ${e(ex.explanation)}`}</p>${!result.correct ? '<small>You’ll meet this one again before the adventure ends.</small>' : ''}</div>${result.xpAdded ? `<span class="feedback-xp">+${result.xpAdded} XP</span>` : ''}`;
    document.querySelectorAll<HTMLButtonElement>('.answer-option').forEach(button => { if (button.dataset.answer === ex.answer) button.classList.add('correct-answer'); else if (button.dataset.answer === answer && !result.correct) button.classList.add('wrong-answer'); });
    document.querySelector<HTMLElement>('#check-answer')?.setAttribute('hidden', '');
    const nextButton = document.querySelector<HTMLButtonElement>('#next-exercise')!;
    if (activeRun.interiorObjectId) nextButton.innerHTML = `${activeRun.index + 1 >= activeRun.queue.length ? 'Finish session' : 'Next expression'} ${icon('arrow')}`;
    nextButton.hidden = false;
    document.querySelector<HTMLElement>('[data-action="hint"]')!.hidden = true;
    nextButton.focus();
  } catch (error) {
    toast((error as Error).message || 'Could not save your answer. Please try again.', true);
    if (run === activeRun) document.querySelectorAll<HTMLButtonElement>('.answer-option, #check-answer').forEach(button => { button.disabled = false; });
  } finally { attemptBusy = false; }
}
async function finishRun() {
  if (!run) return;
  const activeRun = run;
  try {
    let gained = 0;
    if (activeRun.unitId && course) {
      const unit = course.courseUnits.find(unit => unit.id === activeRun.unitId)!;
      const remaining = unit.exerciseIds.filter(id => { const ex = course!.courseExerciseById.get(id); return ex && !exerciseHasSuccess(ex); }).length;
      if (!remaining) { const result = await api.completeUnit(unit.id); acceptProgress(result.progress); gained = result.xpAdded; updateProgress(); }
      if (run !== activeRun) return;
      document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Close learning route">${icon('close')}</button><div class="completion"><div class="completion-mark">${icon(remaining ? 'leaf' : 'check')}</div><div class="eyebrow">YOUR LEARNING ROUTE, SAVED</div><h2>${remaining ? 'A little further along the route.' : 'A route you can use.'}</h2><p>${e(unit.title)} · ${remaining ? `${remaining} encounters remain. Your completed answers are saved; continue when you are ready.` : 'Your answers are saved. Try this German in an adventure or let it rest until its next encounter.'}</p><div class="completion-stats"><span><strong>${activeRun.targetCount}</strong> encounters saved</span><span><strong>${gained ? '+' + gained : '✓'}</strong> ${gained ? 'adventure XP' : 'progress saved'}</span></div>${remaining ? `<button class="primary-button" data-course-unit="${unit.id}">Continue this route ${icon('arrow')}</button>` : '<button class="primary-button" data-view="activities">Use it in an adventure '+icon('arrow')+'</button>'}<button class="text-button" data-view="course">Return to your learning routes</button><button class="text-button" data-action="close-dialog">Keep exploring</button></div>`;
      run = undefined; playCue(true); return;
    }
    if (activeRun.quest) {
      const remaining = activeRun.quest.exercises.filter(ex => !hasSuccessfulEncounter(ex.itemId));
      if (remaining.length) {
        document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Close quest session">${icon('close')}</button><div class="completion"><div class="completion-mark">${icon('leaf')}</div><div class="eyebrow">YOUR ANSWERS ARE SAVED</div><h2>A little further along the story.</h2><p>${e(activeRun.quest.title)} · ${remaining.length} ${remaining.length === 1 ? 'listening exercise remains' : 'listening exercises remain'}. Silent mode skipped them. Turn off silent mode when you are ready to finish this quest.</p><div class="completion-stats"><span><strong>${activeRun.correct}</strong> expressions practised</span><span><strong>✓</strong> progress saved</span></div><button class="primary-button" data-view="settings">Open Settings ${icon('settings')}</button><button class="text-button" data-action="close-dialog">Keep exploring ${icon('arrow')}</button></div>`;
        run = undefined; playCue(true); return;
      }
      const result = await api.request<{ xpAdded: number; progress: Progress }>('/quest/complete', { questId: activeRun.quest.id });
      acceptProgress(result.progress); gained = result.xpAdded; updateProgress();
    }
    if (run !== activeRun) return;
    if (activeRun.interiorObjectId) {
      const object = getInteriorObject(activeRun.interiorObjectId);
      const room = interiorId ? getInterior(interiorId) : undefined;
      document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Close learning session">${icon('close')}</button><div class="completion interior-completion"><div class="completion-mark">${icon('check')}</div><div class="eyebrow">A LITTLE GERMAN YOU CAN USE</div><h2>${e(object?.sessionTitle ?? 'A useful little encounter.')}</h2><p>You ordered, asked or understood a little more. Your answers are saved. Keep exploring ${e(room?.name ?? getMap(mapId).name)} to meet the language in another corner.</p><div class="completion-stats"><span><strong>${activeRun.targetCount}</strong> expressions practised</span><span><strong>✓</strong> progress saved</span></div>${object && room ? `<button class="primary-button" data-inspect-interior="${e(object.id)}">Return to ${e(object.label)} ${icon('arrow')}</button>` : ''}<button class="text-button" data-action="close-dialog">Keep exploring ${icon('arrow')}</button></div>`;
      playCue(true); run = undefined; return;
    }
    const clue = activeRun.quest ? clueFor(activeRun.quest.id) : undefined;
    const act = actFor(mapId), actFinished = completedAtLevel(level) === 6;
    const title = clue?.title ?? (activeRun.objectId ? 'A little thing, better understood.' : 'Familiar words. Fresh memories.');
    const targetLabel = activeRun.queue.every(ex => 'targetWordId' in ex) ? 'words' : 'expressions';
    const body = clue?.text ?? (activeRun.objectId ? 'You made sense of this little encounter. Its lore is always here; the expressions can rest until they are ready again.' : `You’ve given these ${targetLabel} room to grow. They can rest until their next encounter.`);
    const targetCount = new Set(activeRun.queue.map(ex => ex.itemId)).size;
    document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Close discovery">${icon('close')}</button><div class="completion story-reveal"><div class="completion-mark">${icon(clue ? 'lantern' : 'leaf')}</div><div class="eyebrow">${clue ? 'A NEW DISCOVERY IN YOUR ATLAS' : 'A SMALL PROMISE TO REMEMBER'}</div><h2>${e(title)}</h2><p>${e(body)}</p>${clue ? `<div class="next-lead">${icon('flag')}<span>${e(actFinished ? act.cliffhanger : clue.lead)}</span></div>` : ''}<div class="completion-stats"><span><strong>${targetCount}</strong> ${targetLabel} practised</span><span><strong>${gained ? '+' + gained : '✓'}</strong> ${gained ? 'adventure XP' : 'progress saved'}</span></div>${clue ? '<button class="primary-button" data-action="next-objective">Follow the next lead ' + icon('arrow') + '</button><button class="text-button" data-view="story">Read your discoveries ' + icon('book') + '</button>' : `<button class="primary-button" data-action="close-dialog">Back to ${e(getMap(mapId).name)} ${icon('arrow')}</button>`}<button class="text-button" data-action="close-dialog">Keep exploring</button></div>`;
    playCue(true); run = undefined;
  } catch (error) {
    if (run !== activeRun) return;
    toast((error as Error).message, true);
    document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Close">${icon('close')}</button><div class="completion"><h2>Let’s save your discovery.</h2><p>${e((error as Error).message)}</p><button class="primary-button" data-action="finish-run">Try saving again ${icon('refresh')}</button></div>`;
  }
}
function profileForm() {
  return `<form id="profile-form"><label class="form-label" for="character-name">What should the town call you?</label><input id="character-name" class="name-input" maxlength="24" minlength="2" value="${e(profile.name)}" required autocomplete="nickname"/><div class="palette-section"><label class="form-label">Your coat</label><div class="palette" data-palette="outfit">${['#326a65', '#6c7894', '#ab5e51', '#b38b3f', '#6e547e', '#c2957a'].map(color => `<button type="button" class="swatch ${profile.avatar.outfit === color ? 'selected' : ''}" style="--swatch:${color}" data-color="${color}" aria-label="Coat colour ${color}">${profile.avatar.outfit === color ? icon('check') : ''}</button>`).join('')}</div></div><div class="palette-section"><label class="form-label">Hair</label><div class="palette" data-palette="hair">${['#48372e', '#242529', '#ad683b', '#d9bc75', '#a0a2a2'].map(color => `<button type="button" class="swatch ${profile.avatar.hair === color ? 'selected' : ''}" style="--swatch:${color}" data-color="${color}" aria-label="Hair colour ${color}">${profile.avatar.hair === color ? icon('check') : ''}</button>`).join('')}</div></div><div class="palette-section"><label class="form-label">Skin tone</label><div class="palette" data-palette="skin">${['#f4d1b5', '#d8a077', '#b9825c', '#8a573f', '#533728'].map(color => `<button type="button" class="swatch ${profile.avatar.skin === color ? 'selected' : ''}" style="--swatch:${color}" data-color="${color}" aria-label="Skin tone ${color}">${profile.avatar.skin === color ? icon('check') : ''}</button>`).join('')}</div></div><button class="primary-button" type="submit">This is me ${icon('check')}</button></form>`;
}
function bindProfileForm() {
  const form = document.querySelector<HTMLFormElement>('#profile-form')!;
  const draft = { ...profile.avatar };
  const paintPreview = () => document.querySelectorAll<HTMLCanvasElement>('[data-avatar-preview]').forEach(canvas => world.renderAvatarPreview(canvas, draft));
  paintPreview();
  form.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => { button.onclick = () => {
    const field = button.parentElement!.dataset.palette as keyof Avatar;
    draft[field] = button.dataset.color!;
    button.parentElement!.querySelectorAll('button').forEach(b => { b.classList.remove('selected'); b.innerHTML = ''; });
    button.classList.add('selected'); button.innerHTML = icon('check');
    paintPreview();
  }; });
  form.onsubmit = async event => {
    event.preventDefault();
    const name = document.querySelector<HTMLInputElement>('#character-name')!.value.trim();
    if (name.length < 2) return;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true;
    try {
      const result = await api.session(name, draft);
      profile = { name: result.player.name, avatar: result.player.avatar };
      localStorage.setItem('atlas.profile', JSON.stringify(profile));
      acceptProgress(result.progress, result.player.id);
      world.setAvatar(profile.avatar);
      document.querySelector('#profile-name')!.textContent = profile.name;
      api.connect();
      document.querySelector<HTMLDialogElement>('#dialog')!.close();
      updateProgress();
      if (view === 'character') renderOther();
      toast(`Looking good, ${profile.name}. Lindenhafen is waiting.`);
    } catch (error) { toast((error as Error).message, true); }
    finally { button.disabled = false; }
  };
}
function showProfile() { openDialog(`<div class="profile-dialog-heading"><canvas class="painted-avatar" data-avatar-preview width="384" height="576" role="img" aria-label="Your character appearance"></canvas><div class="eyebrow">LET’S MAKE THIS YOUR ADVENTURE.</div><h2>Nice to meet you.</h2></div>${profileForm()}`, 'profile-dialog'); bindProfileForm(); }
const audioPaths = new Map([
  ...quests.flatMap(q => q.exercises.map(ex => [ex.german, `/audio/${ex.id}.mp3`] as const)),
  ...npcs.map(npc => [npc.greeting, `/audio/npc-${npc.id}.mp3`] as const),
]);
let activeSpeech: HTMLAudioElement | undefined;
let speechGeneration = 0;
function stopSpeech() {
  speechGeneration++;
  if (activeSpeech) { activeSpeech.pause(); activeSpeech = undefined; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
function speak(text: string) {
  if (silentMode) { toast('Silent mode is on. Turn it off in Settings to hear audio.'); return; }
  stopSpeech();
  const generation = speechGeneration;
  const listeningRun = run;
  const listeningIndex = run?.index;
  const audioStatus = (message: string) => { if (run === listeningRun && run?.index === listeningIndex) { const label = document.querySelector<HTMLElement>('.audio-scene span'); if (label) label.textContent = message; } };
  const heard = () => { if (run && run === listeningRun && run.index === listeningIndex && run.queue[run.index]?.mode === 'listen' && run.queue[run.index].german === text) { run.audioHeard = true; recordExposure({exerciseId:run.queue[run.index].id}); audioStatus('Audio finished. Choose your answer, or listen again.'); } };
  const unavailable = () => {
    if (generation !== speechGeneration) return;
    toast('The audio couldn’t play. You can use the transcript and try it again.');
    if (run && run === listeningRun && run.index === listeningIndex) { run.audioHeard = false; run.hinted = true; const transcript = document.querySelector<HTMLElement>('#transcript'); if (transcript) { transcript.hidden = false; recordExposure({exerciseId:run.queue[run.index].id}); } }
  };
  let fallbackStarted = false;
  const fallback = () => {
    if (generation !== speechGeneration || fallbackStarted) return;
    fallbackStarted = true;
    if (!('speechSynthesis' in window)) { unavailable(); return; }
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang === 'de-DE') ?? voices.find(v => v.lang.startsWith('de'));
    if (!voice) { unavailable(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => { if (generation === speechGeneration) heard(); };
    utterance.onstart = () => audioStatus('Playing German audio…');
    utterance.onerror = unavailable;
    utterance.lang = 'de-DE'; utterance.voice = voice; utterance.rate = speechRate;
    speechSynthesis.speak(utterance);
  };
  const path = audioPaths.get(text);
  if (path) {
    const audio = new Audio(path);
    activeSpeech = audio;
    audio.playbackRate = speechRate / 0.82;
    audio.onplay = () => audioStatus('Playing German audio…');
    audio.onended = () => { if (generation === speechGeneration) heard(); };
    audio.onerror = fallback;
    void audio.play().catch(() => { if (activeSpeech === audio) fallback(); });
  } else fallback();
}
let audioContext: AudioContext | undefined;
function playCue(correct: boolean) {
  if (muted || silentMode) return;
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
    const now = audioContext.currentTime;
    (correct ? [523.25, 659.25, 783.99] : [329.63, 293.66]).forEach((freq, i) => {
      const osc = audioContext!.createOscillator(), gain = audioContext!.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.09); gain.gain.linearRampToValueAtTime(0.06, now + i * 0.09 + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.35);
      osc.connect(gain); gain.connect(audioContext!.destination); osc.start(now + i * 0.09); osc.stop(now + i * 0.09 + 0.4);
    });
  } catch { /* Audio stays optional when the device blocks it. */ }
}
function bindGlobalEvents() {
  window.addEventListener('resize', syncTrackerState);
  document.addEventListener('keydown', event => {
    const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
    if (dialog.open) return;
    const typing = (event.target as HTMLElement).matches('input:not([type="range"]),textarea,select') || (event.target as HTMLElement).isContentEditable;
    if (event.key === 'Escape') { event.preventDefault(); if (watchingWorld) watchWorld(false); else if (screenFilterControls?.isOpen()) screenFilterControls.close(); else if (view !== 'world') setView('world'); else if (!document.querySelector<HTMLElement>('#chat-body')!.hidden) toggleChat(); return; }
    if (view !== 'world' && event.key === 'Tab') {
      const targets = [...document.querySelectorAll<HTMLElement>('#menu-layer button, #menu-layer input, #menu-layer select')].filter(el => !el.hasAttribute('disabled') && !el.hidden && el.getClientRects().length);
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if (typing || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'f' && view === 'world') { event.preventDefault(); if (screenFilterControls?.isOpen()) screenFilterControls.close(); else openScreenFilters(); return; }
    if (screenFilterControls?.isOpen() && (event.target as HTMLElement).closest('#screen-filter-panel')) return;
    const targetView = ({ p: 'activities', l: 'course', q: 'quests', j: 'journal', c: 'character', o: 'settings', n: 'story' } as Record<string, View>)[key];
    if (targetView) { event.preventDefault(); setView(view === targetView ? 'world' : targetView); }
    else if (key === 'm') { event.preventDefault(); openWorldMap(); }
  });
  document.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('button, a.brand');
    if (!target) return;
    if (target.matches('a.brand')) { event.preventDefault(); setView('world'); return; }
    if (target.dataset.view) { document.querySelector<HTMLDialogElement>('#dialog')!.close(); run = undefined; setView(target.dataset.view as View); return; }
    if (target.dataset.activity) { void startActivity(target.dataset.activity as ActivityId); return; }
    if (target.dataset.coursePage) { coursePage = Math.max(0, Number(target.dataset.coursePage)); renderOther(); return; }
    if (target.dataset.courseLevel) { coursePage = 0; courseLevel = target.dataset.courseLevel as Level; renderOther(); return; }
    if (target.dataset.courseTab) { coursePage = 0; courseTab = target.dataset.courseTab as typeof courseTab; renderOther(); return; }
    if (target.dataset.journalTab) { journalTab = target.dataset.journalTab as typeof journalTab; renderOther(); return; }
    if (target.dataset.courseUnit) { void startCourseUnit(target.dataset.courseUnit); return; }
    if (target.dataset.wordPractice) { void startWordPractice(target.dataset.wordPractice); return; }
    if (target.dataset.level) { const region = maps.find(map => map.level === target.dataset.level); if (region) travelMap(region.id); return; }
    if (target.dataset.travel) { const region = maps.find(map => map.id === target.dataset.travel); if (region) travelMap(region.id); return; }
    if (target.dataset.followQuest) { const q = quests.find(item => item.id === target.dataset.followQuest); if (q) travelMap(maps.find(map => map.level === q.level)!.id, { kind: 'follow', questId: q.id }); return; }
    if (target.dataset.waypoint) { document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView('world'); if (interiorId) world.leaveInterior(); world.setInputEnabled(worldCanInteract()); world.focusNpc(target.dataset.waypoint); return; }
    if (target.dataset.focusObject) { setView('world'); if (interiorId) world.leaveInterior(); world.focusObject(target.dataset.focusObject); return; }
    if (target.dataset.focusBuilding) { const id = target.dataset.focusBuilding; if (interiors.some(room => room.id === id)) guideToBuilding(id as InteriorId); return; }
    if (target.dataset.inspectInterior) { showInteriorObject(target.dataset.inspectInterior); return; }
    if (target.dataset.practiceInterior) { startInteriorPractice(target.dataset.practiceInterior); return; }
    if (target.dataset.interiorActivity) { startInteriorActivity(target.dataset.interiorActivity); return; }
    if (target.dataset.inspectObject) { showObject(target.dataset.inspectObject); return; }
    if (target.dataset.practiceObject) { startObjectPractice(target.dataset.practiceObject); return; }
    if (target.dataset.npc) { world.focusNpc(target.dataset.npc); showNpc(target.dataset.npc); return; }
    if (target.dataset.startQuest) { startQuest(target.dataset.startQuest); return; }
    if (target.dataset.speak) { speak(target.dataset.speak); return; }
    if (target.dataset.answer) { void submitAnswer(target.dataset.answer); return; }
    if (target.dataset.token) { assembleSentence(Number(target.dataset.token)); return; }
    if (target.dataset.removeToken && run && !run.answered) {
      const index = Number(target.dataset.removeToken), selected = [...run.tokenOrder];
      selected.splice(index, 1); run.tokenOrder = []; run.answer = '';
      document.querySelectorAll<HTMLButtonElement>('[data-token]').forEach(b => { b.disabled = false; });
      document.querySelector('#sentence-result')!.innerHTML = '<span class="sentence-placeholder">Tap the words to build your answer</span>';
      selected.forEach(assembleSentence); return;
    }
    if (target.dataset.insert) { const input = document.querySelector<HTMLInputElement>('#typed-answer'); if (input) { const pos = input.selectionStart ?? input.value.length; input.setRangeText(target.dataset.insert, pos, input.selectionEnd ?? pos, 'end'); input.focus(); } return; }
    switch (target.dataset.action) {
      case 'screen-filters': if (screenFilterControls?.isOpen()) screenFilterControls.close(); else openScreenFilters(target); break;
      case 'world-time': setView('settings'); document.querySelector('#world-time-mode')?.scrollIntoView({ block: 'center' }); break;
      case 'watch-world': if (view !== 'world') setView('world'); watchWorld(true); break;
      case 'stop-watching': watchWorld(false); break;
      case 'profile': showProfile(); break;
      case 'map': openWorldMap(); break;
      case 'talk': if (!world.interactNearest()) toast('Move closer to a character or a marked object.'); break;
      case 'leave-interior': world.leaveInterior(); document.querySelector<HTMLElement>('#world-container')!.focus(); break;
      case 'next-objective': if (view !== 'world') setView('world'); showNextObjective(); break;
      case 'act-intro': setView('world'); showActIntro(mapId); break;
      case 'act-begin': document.querySelector<HTMLDialogElement>('#dialog')!.close(); world.setInputEnabled(worldCanInteract()); continueDestination(); break;
      case 'open-chat': setView('world'); toggleChat(true); break;
      case 'fullscreen': if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => toast('Full screen isn’t available here.')); break;
      case 'close-dialog': document.querySelector<HTMLDialogElement>('#dialog')!.close(); run = undefined; pendingDestination = undefined; break;
      case 'help': openDialog(`<div class="help-dialog"><div class="completion-mark">${icon('compass')}</div><div class="eyebrow">YOUR FIRST STEPS</div><h2>Follow your curiosity.</h2><p>Click a path to wander, or use <strong>WASD / arrow keys</strong>. On your phone, move with the <strong>joystick</strong> or tap a destination.</p><p>Tap a character to meet them, press <strong>E</strong> nearby, or use the <strong>Talk</strong> button on your phone. Their stories become your adventures, and each adventure brings a little more German.</p><p>Choose a café, bakery or supermarket from <strong>Menu / Atlas</strong> to walk to its doorway. Interact to enter, then talk to people or inspect the glowing objects for a focused German session. Use <strong>Leave</strong> to return outside.</p><p>Open your quests with <strong>Q</strong>, journal with <strong>J</strong>, character with <strong>C</strong>, settings with <strong>O</strong>, and map with <strong>M</strong>. Press <strong>Escape</strong> to return to the world.</p><p>Use <strong>A little help</strong> whenever you need it. Mistakes are part of finding your way. Ready words return in your journal; strong words get longer rests.</p><p>The town square connects you with other wanderers. Be kind. Everyone is learning.</p><button class="primary-button" data-action="close-dialog">Let’s wander ${icon('arrow')}</button></div>`); break;
      case 'begin-exercises': renderExercise(); break;
      case 'check-answer': void submitAnswer(); break;
      case 'next-exercise': if (run?.answered) { run.index++; renderExercise(); } break;
      case 'finish-run': void finishRun(); break;
      case 'review': void startAdaptiveReview(); break;
      case 'course-sources': void showCourseSources(); break;
      case 'course-retry': coursePromise = undefined; void loadCourse().then(() => renderOther()).catch(error => toast(error.message, true)); break;
      case 'hint': if (run && !run.answered) { run.hinted = true; document.querySelector<HTMLElement>('#exercise-hint')!.hidden = false; recordExposure({exerciseId:run.queue[run.index].id}); } break;
      case 'transcript': if (run && !run.answered) { run.hinted = true; document.querySelector<HTMLElement>('#transcript')!.hidden = false; recordExposure({exerciseId:run.queue[run.index].id}); } break;
      case 'clear-sentence': if (run && !run.answered) { run.tokenOrder = []; run.answer = ''; document.querySelectorAll<HTMLButtonElement>('[data-token]').forEach(b => { b.disabled = false; }); document.querySelector('#sentence-result')!.innerHTML = '<span class="sentence-placeholder">Tap the words to build your answer</span>'; } break;
      case 'zoom-in': world.zoom(0.12); break;
      case 'zoom-out': world.zoom(-0.12); break;
      case 'silent-mode':
        if (attemptBusy) { toast('Your answer is saving. Try again in a moment.'); break; }
        silentMode = !silentMode;
        localStorage.setItem('atlas.silentMode', String(silentMode));
        if (silentMode) { stopSpeech(); void audioContext?.suspend(); }
        if (view === 'settings') renderOther();
        if (silentMode && run && !run.answered && run.queue[run.index]?.mode === 'listen') renderExercise();
        document.querySelectorAll<HTMLButtonElement>('[data-action="silent-mode"]').forEach(button => {
          button.setAttribute('aria-pressed', String(silentMode));
          button.innerHTML = `${icon(silentMode ? 'muted' : 'volume')} Silent mode ${silentMode ? 'on' : 'off'}`;
        });
        toast(silentMode ? 'Silent mode on. Listening exercises will be skipped.' : 'Silent mode off. Listening exercises will return in your next session.');
        break;
      case 'sound': muted = !muted; localStorage.setItem('atlas.muted', String(muted));  if (!muted) playCue(true); if (view === 'settings') renderOther(); break;
      case 'chat-toggle': toggleChat(); break;
    }
  });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('cancel', () => { run = undefined; pendingDestination = undefined; });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('click', event => {
    const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { pendingDestination = undefined; dialog.close(); }
  });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('close', () => { if (!document.querySelector<HTMLDialogElement>('#dialog')!.open) { document.querySelector('#game-shell')!.classList.remove('encounter-open'); world.setVisible(view === 'world' && !document.hidden); world.setInputEnabled(worldCanInteract()); run = undefined; activityLoading++; activityController?.destroy(); activityController = undefined; stopSpeech(); } });
  const menu = document.querySelector<HTMLDialogElement>('#menu-layer')!;
  menu.addEventListener('close', () => { if (!menu.open && view !== 'world') setView('world'); });
  menu.addEventListener('click', event => { if (event.target === menu) setView('world'); });
  document.querySelector<HTMLFormElement>('#chat-form')!.onsubmit = event => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>('#chat-input')!;
    const message = input.value.trim();
    if (!message) return;
    try { api.chat(message); input.value = ''; } catch (error) { toast((error as Error).message, true); }
  };
}
function toggleChat(open?: boolean) {
  if (open !== false) screenFilterControls?.close(false);
  const body = document.querySelector<HTMLElement>('#chat-body')!;
  body.hidden = open === undefined ? !body.hidden : !open;
  document.querySelector('#chat-card')!.classList.toggle('open', !body.hidden);
  document.querySelector('#game-shell')!.classList.toggle('chat-open', !body.hidden);
  document.querySelector('.chat-header')!.setAttribute('aria-expanded', String(!body.hidden));
  document.querySelector('.chat-toggle-icon')!.innerHTML = icon(body.hidden ? 'plus' : 'minus');
  document.dispatchEvent(new Event('atlas-controls-reset'));
  world.setInputEnabled(worldCanInteract());
  if (!body.hidden) document.querySelector<HTMLInputElement>('#chat-input')!.focus();
  else { const header = document.querySelector<HTMLButtonElement>('.chat-header')!; (header.getClientRects().length ? header : document.querySelector<HTMLButtonElement>('.game-menu-button')!).focus(); }
}
function renderChat() {
  const el = document.querySelector<HTMLElement>('#chat-messages')!;
  if (!chatMessages.length) { el.innerHTML = '<p class="chat-welcome">Say Hallo. Every wanderer has a story.</p>'; return; }
  el.innerHTML = chatMessages.slice(-40).map(message => `<div class="chat-message"><span class="message-avatar" style="background:${message.playerId === api.selfId ? e(profile.avatar.outfit) : '#a67552'}">${e(message.name.slice(0, 1).toUpperCase())}</span><p><strong>${e(message.name)}${message.playerId === api.selfId ? '<small>you</small>' : ''}</strong><span>${e(message.text)}</span></p><time>${new Date(message.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time></div>`).join('');
  el.scrollTop = el.scrollHeight;
}
async function boot() {
  renderShell();
  api.onMap = id => {
    const changed = id !== mapId;
    if (changed) regionReady = false;
    mapId = id; pendingMap = undefined; mapConfirmed = true;
    level = getMap(id).level; localStorage.setItem('atlas.level', level);
    chatMessages.splice(0); players = []; renderChat();
    document.querySelector('#chat-region')!.textContent = getMap(id).name;
    document.querySelector<HTMLElement>('#game-shell')!.dataset.map = id;
    world.setMap(id); interiorId = world.getInteriorId(); syncLocation(); updateProgress(); world.setInputEnabled(worldCanInteract());
    if (regionReady) queueMicrotask(() => onRegionReady(id));
  };
  api.onPlayers = (value, selfId) => { players = value; world.setPlayers(players, selfId); updateConnection(); };
  api.onChat = message => { if (!chatMessages.some(m => m.id === message.id)) { chatMessages.push(message); if (chatMessages.length > 100) chatMessages.shift(); renderChat(); } };
  api.onStatus = value => { connection = value; if (value !== 'online' && pendingMap) { pendingMap = undefined; pendingDestination = undefined; world.setInputEnabled(worldCanInteract()); } updateConnection(); };
  api.onError = message => { if (pendingMap) { pendingMap = undefined; pendingDestination = undefined; world.setInputEnabled(worldCanInteract()); } toast(message, true); };
  try {
    const result = await api.session(profile.name, profile.avatar);
    acceptProgress(result.progress, result.player.id);
    profile = { name: result.player.name, avatar: result.player.avatar };
    localStorage.setItem('atlas.profile', JSON.stringify(profile));
    document.querySelector('#profile-name')!.textContent = profile.name;
    world.setPlayers([result.player], result.player.id);
    world.setAvatar(profile.avatar);
    updateProgress(); api.connect();
  } catch {
    connection = 'offline'; updateConnection();
    toast(import.meta.env.DEV ? 'The town server is unavailable. Start it with npm run dev, then reload to play.' : 'Lindenhafen is unavailable right now. Please try again shortly.', true);
  }
}
function updateConnection() {
  const el = document.querySelector('#connection-pill')!;
  const stamp = `${connection}:${players.length || 1}`;
  if (el.getAttribute('data-status') === stamp) return;
  el.setAttribute('data-status', stamp);
  el.className = `connection-pill ${connection}`;
  el.innerHTML = `<span></span>${connection === 'online' ? `${players.length || 1} ${(players.length || 1) === 1 ? 'wanderer' : 'wanderers'} here` : connection === 'connecting' ? 'Connecting' : 'Reconnecting'}`;
}
document.addEventListener('visibilitychange', () => { world?.setVisible(view === 'world' && !document.hidden && !activityController); if (document.hidden) { activityController?.pause(); stopSpeech(); } else activityController?.resume(); if (!document.hidden && regionReady) onRegionReady(mapId); });
window.addEventListener('beforeunload', () => { exposureObserver?.disconnect(); if (exposureTimer !== undefined) clearTimeout(exposureTimer); screenFilterControls?.destroy(); activityController?.destroy(); stopSpeech(); api.destroy(); world?.destroy(); });
void boot();
