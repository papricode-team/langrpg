import { castPortraitMarkup } from './cast-portrait';
import { avatarPortraitMarkup, observeAvatarPortraits, updateSelfPortraits } from './avatar-portrait';
import { normalizeAvatar } from './character-recipe.mjs';
import { mountOptionalPlacement, placementCTAMarkup } from './placement-ui';
import { createGlossLookup, glossesForLine, selectInputVariant, filterKnownGlosses } from './learning-context';
import { QuestController } from './quest-controller';
import { questGraph, questGraphs } from './quest-graph';
import { storyState } from './dialogue';
import type { QuestGraph } from './dialogue';
import { evidenceBoard, optionalStoryPractice, saveSlotsMarkup } from './story-panels';
import { lanternRewards, lanternRewardsMarkup, titleLabel } from './lantern-rewards';
import type { CutsceneKind } from './cutscene';
import { grammarForQuest } from './contextual-grammar';
import { questObjectivesMarkup } from './quest-objectives';
import { routeUnlocked, routeLockReason, questUnlocked, questAvailable, questLockReason, firstAvailableMap } from './progression';
import { IntakeClock, intakeStatus, introducedWords, missingWordCount, syllabus, todaysWords, wordIntroduced, wordScheduled } from './intake';
import type { CourseLexeme } from './course';
import { createStateStore } from './game-state';
import { characterBuilderMarkup, bindCharacterBuilder } from './character-builder';
import { localHour, type WorldTimeMode } from './world-clock';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/600.css';
import './style.css';
import './event-log.css';
import { EventLog, installFormNotifications } from './event-log';
import './course-ui.css';
import './game-ui.css';
import './game-menu.css';
import './expedition-games.css';
import './sentence-translations.css';
import { installSentenceTranslations, renderNarrative, type Narrative } from './sentence-translations';
import { getExpedition, getExpeditionNpc, getExpeditionEncounter, expeditionRegions } from './expeditions';
import { ExpeditionLearning, placementLearning } from './expedition-learning';
import { mountExpeditionEncounter } from './expedition-encounter';
import { expeditionGames, getExpeditionGame, expeditionGameStatus, expeditionNotebook, mountExpeditionGame } from './expedition-games';
import { adventureHome } from './game-panels';
import './interiors.css';
import { World } from './world';
import type { Avatar, WorldPlayer, WorldMotion, WorldPresentation } from './world';
import { quests, npcs, vocabulary } from './content';
import type { Quest, Exercise, Level } from './content';
import { Api, emptyProgress } from './api';
import { watchForUpdates } from './app-updates';
import { showUpdateNotice } from './update-notice';
import type { Progress, ChatMessage, ExposureInput, ConnectionStatus, SessionResult, AccountStatus } from './api';
import { dueItems, modeFor, memoryLabel, practiceExercises, remainingQuestExercises, skipListeningExercises, attemptFeedback, shuffledSentenceTiles } from './learning';
import { AccountReminder, nameSuggestions } from './player-account';
import './player-account.css';
import { AccessClock, accessBlocked, billingURL, clearGuestProgress, formatAccessTime, type BillingPlan, type GameAccess } from './game-access';
import './game-access.css';
import { reviewExercises,wordReadyForReview } from './review';
import { ReviewAttempt } from './review-attempt';
import { learnerLevel, scaffoldStage, scaffoldText } from './typing-scaffold';
import type { AttemptSubmission, AttemptResult, RecallRating } from './review-attempt';
import { icon, escapeHtml as e } from './icons';
import turkishCoverage from './data/i18n/tr-coverage.json';
import { t, localized, localizedName, localizedExercise, localizedGrammar, lexemeMeaning, localizedLexemeForm, localizedLexemePartOfSpeech, upper, lower, baseLanguage, baseLanguageNames, cachedBaseLanguage, setBaseLanguage, type BaseLanguage } from './i18n';
import { exerciseOptionsMarkup } from './exercise-options';
import { maps, getMap, isStoryMap } from './maps';
import type { MapId, WorldObjectSpec } from './maps';
import { actFor, clueFor, discoveredClues, journalNarratives, objectStories, storyActs } from './story';
import { activityDiscoveries } from './activity-stories';
import { ScreenFilterControls } from './screen-filter-controls';
import { MenuMemory, MenuNavigator, menuPagesMarkup, menuSections, menuTabsMarkup, promptStrip, sectionOf, viewLabel, type MenuPage, type MenuView } from './menu-navigation';
import { bindOptionRows, optionsMarkup, optionsTabs, type OptionRow, type OptionsTab } from './options-menu';
import { UiSounds } from './ui-sounds';
import { buildingEntrances, getInterior, getInteriorObject, interiorExercises, interiors } from './interiors';
import type { InteriorId, InteriorObjectSpec } from './interiors';

import { miniGameDefinitions, miniGameById } from './minigames/catalogue';
import type { MiniGame } from './minigames/types';
import './minigames/minigames.css';
import { MiniGameInput } from './minigames/input';
import minigameAudio from './minigames/audio-data.json';

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
let accountKeptActivityPaused=false;
let miniGameController: MiniGame | undefined;
let miniGameHost: (import('./minigames/types').MiniGameHost & {destroy():void}) | undefined;
let miniGameLoading = 0;
let exerciseInputCleanup:(()=>void)|undefined;
let exerciseChoiceTimer:ReturnType<typeof setTimeout>|undefined;
let pendingExerciseChoice:string|undefined;
let deliveryController:import('./minigames/delivery').WorldDeliveryRun|undefined;
let deliveryHost:(import('./minigames/types').MiniGameHost&{destroy():void})|undefined;
let courseLevel: Level = 'A1';
try { const saved:unknown=JSON.parse(localStorage.getItem('atlas.placement')??'null'); if(saved && typeof saved==='object' && 'level' in saved && ['A1','A2','B1'].includes(String(saved.level))) courseLevel=saved.level as Level; } catch { /* A fresh practice preference starts at A1. */ }
let courseTab: 'topics' | 'grammar' | 'lexicon' = 'topics';
let journalTab: 'words' | 'phrases' = 'words';
const activityInfo = [
  { id: 'cafe' as const, get title() { return t('The impossible café'); }, npcId: 'marta', icon: 'cup', get action() { return t('Work a café shift'); }, get description() { return t('Read orders, prepare a tray and keep Marta’s unusual customers happy.'); } },
  { id: 'market' as const, get title() { return t('The lantern market'); }, npcId: 'fritz', icon: 'basket', get action() { return t('Trade at the market'); }, get description() { return t('Shop by quantity, compare prices and make every coin count.'); } },
  { id: 'detective' as const, get title() { return t('The missing evidence'); }, npcId: 'ada', icon: 'clue', get action() { return t('Investigate the evidence'); }, get description() { return t('Connect witnesses, recover the order of events and find a defensible explanation.'); } },
  { id: 'delivery' as const, get title() { return t('Letters through the mist'); }, npcId: 'lina', icon: 'parcel', get action() { return t('Take a delivery mission'); }, get description() { return t('Understand directions, plan the route and deliver to the right destination.'); } },
];
let mapId: MapId = 'lindenhafen';
let interiorId: InteriorId | undefined;
let applyingWorldLocation = false;
let pendingMap: MapId | undefined;
let pendingDestination: { kind: 'quest' | 'follow'; questId: string } | undefined;
let pendingExpeditionGame: string | undefined;
let mapConfirmed = false;
let regionReady = false;
const app = document.querySelector<HTMLDivElement>('#app')!;
const removeSentenceTranslations = installSentenceTranslations(document);
function translationHelp() { return `<small class="translation-help">${t('Hover over a German sentence for one second to see its English translation. You can also focus it with Tab or tap it.')}</small>`; }
const api = new Api();
let stopUpdateChecks: (() => void) | undefined;
let removeUpdateNotice: (() => void) | undefined;
let progress: Progress = emptyProgress();
const progressStore = createStateStore(progress);
let questController: QuestController | undefined;
let investigationQuest: string | undefined;
let placementController: { destroy(): void } | undefined;
let storySaves: { slot: string; name: string; at: string }[] = [];
let cinematicActive = false;
let pendingStoryBeat: CutsceneKind | undefined;
let pendingTravelBeat = false;
const questCinematics: Record<string, CutsceneKind> = { 'a1-arrival':'platform', 'a1-station':'recording', 'a1-lost-parcel':'erasure', 'a2-broken-clock':'clockmill', 'a2-archive':'confession', 'b1-new-route':'dark-beam', 'b1-work':'ledger', 'b1-storm':'storm', 'b1-atlas':'bell' };
let started = false;
let account: AccountStatus = { registered: false, email: '' };
let accountReminder: AccountReminder | undefined;
let reminderTimer: number | undefined;
const accessClock = new AccessClock();
let accessHeartbeatBusy = false;
let accessHeartbeatAt = 0;
let pendingAccessHeartbeat: boolean | undefined;
let accessWasActive = false;
let accessConnectionPaused = false;
let accessResetting = false;
let billingVerificationTimer: number | undefined;
let billingVerificationRevision = 0;
/** Vocabulary intake: one heartbeat per minute of visible, connected play; the server introduces words at its own pace. */
const intakeClock = new IntakeClock();
let heartbeatBusy = false;
let pendingHeartbeat: { id: string; seconds: number } | undefined;
function introducedSet(): ReadonlySet<string> { return introducedWords(progress); }
/** Ambient lines may only use restored words; anything the lexicon cannot place (names, story words) passes. */
function barkLineAllowed(german: string): boolean {
  if (!course) return true;
  const lookup = createGlossLookup(course.courseLexicon, progress), introduced = introducedSet();
  return (german.match(/\p{L}+/gu) ?? []).every(token => { const gloss = lookup(token); return !gloss || !wordScheduled(gloss.wordId) || introduced.has(gloss.wordId); });
}
async function sendHeartbeat(seconds: number) {
  if (!started || heartbeatBusy) return;
  heartbeatBusy = true;
  pendingHeartbeat ??= { id: crypto.randomUUID(), seconds };
  try {
    const result = await api.heartbeat(pendingHeartbeat.id, pendingHeartbeat.seconds);
    pendingHeartbeat = undefined;
    acceptProgress(result.progress); updateProgress();
    announceRestoredWords(result.introduced);
  } catch { /* The same beat is retried on the next minute; unsent play is not lost. */ }
  finally { heartbeatBusy = false; }
}
function announceRestoredWords(ids: readonly string[]) {
  if (!ids.length) return;
  const words = ids.map(id => course?.lexemeById.get(id)).filter((word): word is CourseLexeme => !!word);
  if (words.length === 1) { const word = words[0]; toast(t('The ink returns: {word} — {meaning}', { word: word.article ? `${word.article} ${word.lemma}` : word.lemma, meaning: lexemeMeaning(word) })); return; }
  toast(t('{count} words have returned to the Atlas. Open Your words to meet them.', { count: ids.length }));
}
function writingReady(): boolean { return accountReminder?.writingReady ?? false; }
const entryNames = nameSuggestions();
let level: Level = (localStorage.getItem('atlas.level') as Level) || 'A1';
if (!['A1', 'A2', 'B1'].includes(level)) level = 'A1';
let view: View = 'world';
let players: WorldPlayer[] = [];
let portraitPlayersKey = '';
let connection: ConnectionStatus = 'connecting';
let profile: { name: string; avatar: Avatar };
try { profile = JSON.parse(localStorage.getItem('atlas.profile') || 'null') || { name: 'Wanderer', avatar: { hair: '#48372e', skin: '#d8a077', outfit: '#326a65' } }; }
catch { profile = { name: 'Wanderer', avatar: { hair: '#48372e', skin: '#d8a077', outfit: '#326a65' } }; }
if (!profile || typeof profile.name !== 'string' || !profile.avatar || typeof profile.avatar !== 'object' || Array.isArray(profile.avatar)) profile = { name: 'Wanderer', avatar: { hair: '#48372e', skin: '#d8a077', outfit: '#326a65' } };
profile.name = profile.name.trim().slice(0, 24) || 'Wanderer';
profile.avatar = normalizeAvatar(profile.avatar);
let worldMotion: WorldMotion = (localStorage.getItem('atlas.worldMotion') as WorldMotion) || 'auto';
let watchingWorld = false;
let worldTimeMode = (localStorage.getItem('atlas.worldTimeMode') as WorldTimeMode) || 'cycle';
if (!['cycle', 'local', 'manual'].includes(worldTimeMode)) worldTimeMode = 'cycle';
let manualWorldHour = Number(localStorage.getItem('atlas.worldHour') ?? 12);
if (!Number.isFinite(manualWorldHour)) manualWorldHour = 12;
if (!['auto', 'full', 'reduced'].includes(worldMotion)) worldMotion = 'auto';
let muted = localStorage.getItem('atlas.muted') !== 'false';
let silentMode = localStorage.getItem('atlas.silentMode') === 'true';
const uiSounds = new UiSounds(() => !muted && !silentMode);
const menuMemory = new MenuMemory();
let menuNavigator: MenuNavigator | undefined;
let optionsTab: OptionsTab = 'audio';
let unbindOptions: (() => void) | undefined;
function playablePractice<T extends Exercise>(exercises: readonly T[]): T[] {
  return practiceExercises(exercises, silentMode, writingReady());
}
function showOpeningPracticeNotice(placement = false) {
  cancelRun();
  setView('world');
  openDialog(`<div class="course-intro"><div class="eyebrow">${t('YOUR FIRST STEPS')} · A1</div><h2>${t('Listen, look and choose.')}</h2><p>${placement ? t('Start with A1 German and get comfortable in the town. The optional level sample opens after your first ten minutes of play.') : t('Writing practice opens after your first ten minutes of play. For now, discover the town through listening and simple choices. Your completed answers are saved.')}</p><button class="primary-button" data-action="close-dialog">${t('Keep exploring')} ${icon('arrow')}</button></div>`, 'course-dialog');
}
function silentModeButton() {
  return `<button class="outline-button silent-mode-button" data-action="silent-mode" aria-pressed="${silentMode}">${icon(silentMode ? 'muted' : 'volume')} ${silentMode ? t('Silent mode on') : t('Silent mode off')}</button>`;
}
let speechRate = Number(localStorage.getItem('atlas.speechRate') || '0.82');
if (![0.65, 0.82, 1].includes(speechRate)) speechRate = 0.82;
const chatMessages: ChatMessage[] = [];
let world: World;
let eventLog: EventLog | undefined;
let removeFormNotifications: (() => void) | undefined;
let screenFilterControls: ScreenFilterControls | undefined;
type Submission = AttemptSubmission;
let run: { quest?: Quest; unitId?: string; queue: Exercise[]; index: number; correct: number; targetCount: number; hinted: boolean; audioHeard: boolean; answered: boolean; answer: string; tokenOrder: number[]; review: boolean; objectId?: string; interiorObjectId?: string; label?: string; started: number; submission?: Submission; reviewAttempt?: ReviewAttempt; skipListening?: boolean; shownAt?: number } | undefined;
let attemptBusy = false;
function cancelRun() { exerciseInputCleanup?.();exerciseInputCleanup=undefined;if(exerciseChoiceTimer){clearTimeout(exerciseChoiceTimer);exerciseChoiceTimer=undefined;}pendingExerciseChoice=undefined;run?.reviewAttempt?.cancel(); run = undefined; }
let progressOwner: string | undefined;
function acceptProgress(value: Progress, owner?: string) {
  if (owner && progressOwner !== owner) { attemptedCinematics.clear(); progressOwner = owner; progress = emptyProgress(); exposedContexts.clear(); }
  if (progressStore.replace(value, owner ?? progressOwner)) progress = progressStore.get();
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


function portrait(id: string, className = '', expression = 'neutral') {
  if (id === 'self' || id === 'player' || id === 'You') return avatarPortraitMarkup(profile.avatar, `portrait ${className}`, true, expression);
  const painted = castPortraitMarkup(id,className,expression);
  if (painted) return painted;
  if (id === 'inspector' || id === 'elise') return `<span class="story-portrait ${id} ${className}" style="background-image:url('/assets/story-cast/${id}-portrait.webp');background-size:cover;background-position:center" aria-hidden="true"></span>`;
  const local = getExpeditionNpc(id);
  if (local) {
    const region = expeditionRegions.find(region => region.npcs.some(npc => npc.id === local.id))!;
    return `<span class="expedition-portrait ${className}" style="background-image:url('/assets/${region.id}-portraits.webp?v=2');background-size:800% 100%;background-position:${local.artVariant / 7 * 100}% 50%" aria-hidden="true"></span>`;
  }
  const index = Math.max(0, npcs.findIndex(n => n.id === id));
  return `<span class="portrait ${className}" style="--portrait-x:${(index % 4) * 100 / 3}%;--portrait-y:${index < 4 ? 0 : 100}%" aria-hidden="true"></span>`;
}
function currentQuest() { return quests.find(q => q.level === level && !progress.completedQuestIds.includes(q.id) && questUnlocked(q.id, progress.completedQuestIds)) ?? quests.find(q => !progress.completedQuestIds.includes(q.id) && questUnlocked(q.id, progress.completedQuestIds)) ?? quests.find(q => q.level === level)!; }
function completedAtLevel(l: Level) { return quests.filter(q => q.level === l && progress.completedQuestIds.includes(q.id)).length; }
function toast(message: string, bad = false) {
  eventLog?.notify(message, bad);
}
function renderShell() {
  screenFilterControls?.destroy();
  app.innerHTML = `
    <main class="game-shell" id="game-shell" data-view="world" data-map="lindenhafen">
      <section id="explore-view" class="world-stage" aria-label="Lindenhafen"><div id="world-container" aria-label="${e(t('Game world. Use WASD, arrow keys, or the joystick to move. Press E to interact.'))}" tabindex="0"></div></section>
      <div class="world-vignette" aria-hidden="true"></div>
      <div class="game-hud" id="game-hud">
        <div class="player-hud"><button class="player-medallion" data-view="character" aria-label="${e(t('Edit your character'))}">${portrait('self')}<span class="medallion-gem"></span></button><div class="player-details"><span class="player-name" id="profile-name">${e(profile.name)}</span><div class="player-meta"><span id="hud-level">A1 · ${e(upper(titleLabel('Wanderer')))}</span><span class="xp-badge"><strong id="xp-value">0</strong> XP</span><button class="ink-badge" id="ink-badge" data-paused="" data-view="journal" aria-label="${e(t('Restored words'))}"></button></div><div class="player-progress"><span id="chapter-fill"></span></div></div></div>
        <div class="access-hud" id="access-hud" hidden><span class="access-clock-icon">${icon('clock')}</span><div><small id="access-label">Free play</small><strong id="access-time" role="timer">05:00</strong></div><button type="button" id="access-button">Login</button></div>
        <div class="location-banner"><div class="location-title" id="breadcrumb-current">Lindenhafen</div><div class="location-subtitle" id="location-subtitle">${upper(t('The first missing route'))}</div></div>
        <section class="interior-location" id="interior-location" aria-label="${e(t('Current building'))}" hidden></section>
        <div class="world-status">
          <div class="bell-tracker" id="bell-tracker" aria-label="${e(t('The seventh bell'))}"><span>${icon('clock')}</span><strong id="bell-count">0 / 7</strong><small id="story-day">${upper(t('Day {day}', { day: 1 }))}</small></div>
          <button class="region-compass" data-view="atlas" aria-label="${e(t('Open the region atlas'))}">${icon('compass')}<span><strong id="region-name">Lindenhafen</strong><small>${upper(t('Region atlas'))}</small></span></button>
          <aside class="quest-tracker" id="quest-tracker" aria-label="${e(t('Next story objective'))}"><div id="quest-panel"></div></aside>
        </div>
        <section class="chat-card" id="chat-card" aria-label="${e(t('Local chat'))}"><button class="chat-header" data-action="chat-toggle" aria-label="${e(t('Toggle local chat'))}" aria-expanded="false" aria-controls="chat-body"><span>${icon('chat')}<strong id="chat-region">Lindenhafen</strong><small>${t('LOCAL')}</small></span><span class="chat-toggle-icon">${icon('plus')}</span></button><div class="chat-body" id="chat-body" hidden><div class="chat-messages" id="chat-messages"><p class="chat-welcome">${t('Say Hallo. Every wanderer has a story.')}</p></div><form id="chat-form" class="chat-input"><input id="chat-input" maxlength="280" autocomplete="off" placeholder="${e(t('Say something…'))}" aria-label="${e(t('Message to this region'))}"/><button type="submit" aria-label="${e(t('Send message'))}">${icon('send')}</button></form></div></section>
        <div class="game-controls-hint"><kbd>WASD</kbd><span>${t('Move')}</span><b>·</b><kbd>E</kbd><span>${t('Interact')}</span><b>·</b><kbd>M</kbd><span>${t('Atlas')}</span></div>
        <button class="game-menu-button" data-view="menu" aria-label="${e(t('Open game menu'))}">${icon('lantern')}<span>${t('Menu')}</span><i id="review-dot" hidden></i></button>
        <div class="touch-controls"><div class="joystick" id="joystick" role="group" aria-label="${e(t('Touch movement joystick'))}"><span class="joystick-ring"></span><span class="joystick-axis"></span><span class="joystick-knob" id="joystick-knob">${icon('compass')}</span></div><button class="talk-button" id="talk-button" data-action="talk" aria-label="${e(t('Interact with something nearby'))}" disabled>${icon('chat')}<span id="nearby-action">${t('Interact')}</span><small id="nearby-name">${t('MOVE CLOSER')}</small></button></div>
      </div>
      <div class="world-watch-caption"><span>${t('A moment in {place}', { place: '<strong id="watch-region">Lindenhafen</strong>' })}</span><span id="watch-time">12:00 · ${upper(t('Day'))}</span><button data-action="stop-watching">${t('Return to exploring')} <kbd>ESC</kbd></button></div>
      <dialog class="menu-layer" id="menu-layer" aria-labelledby="menu-title" data-input="pointer" hidden><div class="menu-frame"><header class="menu-header"><div class="menu-brand"><span class="menu-crest">${icon('lantern')}</span><span class="menu-kicker">THE LANTERN ATLAS</span><h1 id="menu-title" class="menu-sr-only">${t('Your adventure')}</h1></div><nav class="menu-tabs" id="menu-tabs" aria-label="${e(t('Game sections'))}"></nav><button class="menu-close" data-view="world" aria-label="${e(t('Return to game'))}">${icon('close')}</button></header><nav class="menu-pages" id="menu-pages" aria-label="${e(t('Pages'))}"></nav><div id="other-view" class="menu-content" tabindex="-1"></div><footer class="menu-footer"><p class="menu-help" id="menu-help" aria-live="polite"></p><div class="menu-prompts" id="menu-prompts" aria-hidden="true"></div><div class="menu-footer-meta"><span class="german-flag"></span><span id="language-pair">${t('GERMAN FROM ENGLISH')}</span><span class="connection-pill" id="connection-pill"><span></span> ${t('Connecting')}</span></div></footer></div></dialog>
    </main><dialog id="dialog" class="dialog" aria-label="${e(t('Adventure encounter'))}"></dialog><dialog id="account-dialog" class="dialog account-dialog" aria-labelledby="account-title"></dialog>`;
  eventLog?.destroy();
  eventLog = new EventLog();
  removeFormNotifications?.();
  removeFormNotifications = installFormNotifications(toast);
  world = new World(document.querySelector('#world-container')!, {
    motion: worldMotion,
    time: { mode: worldTimeMode, hour: worldTimeMode === 'manual' ? manualWorldHour : localHour() },
    onTimeChange: state => {
      const label = `${state.label} · ${upper(state.period === 'day' ? t('Day') : t('Night'))}`;
      for (const id of ['watch-time', 'world-hour-label']) {
        const element = document.getElementById(id);
        if (element) element.textContent = label;
      }
    },
    onNpc: showNpc,
    onObject: showObject,
    onMiniGame: id=>void startMiniGame(id),
    onInteriorChange: onInteriorChange,
    onInteriorInteract: showInteriorObject,
    onMapReady: id => { regionReady = true; onRegionReady(id); },
    onReady: () => { regionReady = true; screenFilterControls?.refreshSupport(); document.querySelectorAll<HTMLCanvasElement>('[data-avatar-preview]').forEach(canvas => world.renderAvatarPreview(canvas, profile.avatar)); onRegionReady(mapId); },
    onMove: (x, y) => api.move(x, y),
    onNearby: updateNearby,
    onBarkShown: bark => { if (bark.wordIds.length) recordExposure({wordIds:bark.wordIds}); },
    onCinematicLine: (speaker,german,clipId) => { if(!silentMode&&!muted)speak(german,speaker,clipId); },
    onCinematicEnd: stopSpeech,
  });
  questController?.destroy();
  questController = new QuestController({
    api, progress: () => progress, playerName: () => profile.name,
    portrait: (id, expression) => portrait(id, '', expression), speak: (text, speaker, clipId, personalized, rate) => {
      const hasGermanVoice='speechSynthesis' in window&&speechSynthesis.getVoices().some(voice=>voice.lang.startsWith('de'));
      speak(text,speaker,personalized?(hasGermanVoice?undefined:`${clipId}-name-free`):clipId,rate);
    }, stopSpeech, audioEnabled: () => !silentMode, setAudioEnabled: enabled => setSilentMode(!enabled, false),
    glosses: text => course ? glossesForLine(text, createGlossLookup(course.courseLexicon, progress)) : undefined,
    prepareLine: line => { const lookup = course ? createGlossLookup(course.courseLexicon,progress) : () => undefined; const selected = selectInputVariant([line,...(line.variants ?? []).map(variant=>({...line,...variant}))],lookup,.95,introducedSet()); return {...selected.variant,glosses:{...selected.glosses,...filterKnownGlosses(line.glosses ?? {},lookup)}}; },
    grammar: questId => grammarForQuest(questId,course?.courseGrammar),
    wasHinted: questId => progress.story?.flags[`hint:${questId}`]===true || localStorage.getItem(`atlas.sceneHinted.${api.selfId}.${questId}`)==='true',
    onOpen: speaker => { dialogueOpen = true; document.querySelector('#game-shell')!.classList.add('dialogue-open'); world.setConversationTarget(speaker || undefined); syncWorldMode(); },
    onClose: () => { dialogueOpen = false; document.querySelector('#game-shell')!.classList.remove('dialogue-open'); world.setConversationTarget(undefined); syncWorldMode(); document.querySelector<HTMLElement>('#world-container')!.focus(); if (pendingStoryBeat) queueMicrotask(() => void playPendingCinematic()); },
    onProgress: value => { acceptProgress(value); updateProgress(); },
    onInvestigate: graph => { investigationQuest = graph.questId; updateProgress(); const next = nextInvestigation(graph); if (next) { world.focusObject(next.objectId); toast(t('Read the evidence, then return to the witness.')); } else { const q = quests.find(q => q.id === graph.questId)!; world.focusNpc(q.npcId); toast(t('The evidence is saved. Return to {name}.', { name: localizedName(npcs.find(npc => npc.id === q.npcId)!.name) })); } },
    onComplete: (graph, xp, effects) => { investigationQuest = undefined; pendingStoryBeat = questCinematics[graph.questId]; updateProgress(); playCue(true); const clue = clueFor(graph.questId); toast(`${clue ? localized(clue.title) : t('Discovery saved')}${xp ? ` · +${xp} XP` : ''}${consequenceNote(effects)}`); },
    expose: exerciseId => { const graph=questGraphs.find(graph=>graph.gateExerciseId===exerciseId); if(graph)localStorage.setItem(`atlas.sceneHinted.${api.selfId}.${graph.questId}`,'true'); recordExposure({ exerciseId }); },
    onPractice: npcId => { const drill = ({marta:'tray-rush',fritz:'numbered-apples',otto:'departure-board',lina:'sorting-office',emil:'workbench',ada:'adas-alphabet',inspector:'brass-stamp',elise:'re-ink'} as Record<string,string>)[npcId]; if (drill) { void startMiniGame(drill); return; } const activity = activityInfo.find(item => item.npcId === npcId); if (activity) void startActivity(activity.id); else setView('journal'); },
    onGrammarGuide: guideId => { courseLevel=guideId.split('-')[0].toUpperCase() as Level; courseTab='grammar'; setView('course'); void loadCourse().then(()=>{if(view!=='course')return;renderOther();document.querySelector<HTMLElement>(`[data-grammar-guide="${guideId}"]`)?.scrollIntoView({block:'start'});}); },
  });
  world.setAudioPreferences({ silent: silentMode, muted });
  world.setAvatar(profile.avatar);
  updateSelfPortraits(document, profile.avatar);
  screenFilterControls = new ScreenFilterControls(document.querySelector<HTMLElement>('#game-hud')!, {
    apply: settings => world.setScreenFilter(settings),
    supported: () => world.screenFiltersSupported(),
    onOpenChange: () => syncWorldMode(),
  });
  bindGlobalEvents(); bindJoystick(); updateProgress();
  menuNavigator?.destroy();
  menuNavigator = new MenuNavigator({
    root: document.querySelector<HTMLElement>('#menu-layer')!,
    isOpen: () => view !== 'world' && !document.querySelector<HTMLDialogElement>('#dialog')!.open && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open,
    canOpen: () => worldCanInteract(),
    open: () => setView('menu'),
    close: () => setView('world'),
    section: step => { if (view !== 'world') setView(menuMemory.neighbour(view, step)); },
    sound: kind => uiSounds.play(kind),
    onModeChange: () => { menuNavigator?.refreshGlyphs(); renderMenuPrompts(); },
  });
  const accountDialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
  accountDialog.addEventListener('cancel', event => { if (!started || accessBlocked(accessClock.snapshot(performance.now())) || accountDialog.dataset.accessWall === 'required') event.preventDefault(); });
  accountDialog.addEventListener('close', () => {
    if (accountDialog.open) return;
    if (started && accessBlocked(accessClock.snapshot(performance.now()))) { enforceAccessWall(); return; }
    if (!document.hidden) { if (!accountKeptActivityPaused) activityController?.resume(); miniGameController?.resume(); deliveryController?.resume(); }
    accountKeptActivityPaused = false;
    accountReminder?.tick(performance.now(), started && !document.hidden && connection === 'online');
    syncAccessActivity(); syncWorldMode();
    if (started && regionReady) onRegionReady(mapId);
  });
  document.querySelector<HTMLButtonElement>('#access-button')!.onclick = () => {
    const access = accessClock.snapshot(performance.now());
    if (access?.phase === 'paid') showBillingAccount();
    else if (access?.registered) showPaywall();
    else showSaveAccount(access?.phase === 'login_required');
  };
  syncWorldMode();
}
function watchWorld(watching: boolean): void {
  if (watching) screenFilterControls?.close(false);
  watchingWorld = watching;
  world.setWatchMode(watching);
  document.querySelector('#game-shell')!.classList.toggle('watching-world', watching);
  document.querySelector<HTMLElement>('#game-hud')!.inert = watching || view !== 'world';
  syncWorldMode();
  document.querySelector('#watch-region')!.textContent = interiorId ? getInterior(interiorId).name : getMap(mapId).name;
  document.querySelector<HTMLButtonElement>(watching ? '[data-action="stop-watching"]' : '.game-menu-button')?.focus();
}
function interiorIcon(id: InteriorId) { return id === 'cafe' ? 'cup' : id === 'bakery' ? 'leaf' : 'basket'; }
function updateNearby(id?: string) {
  const entrance = id?.startsWith('building:') ? buildingEntrances(mapId).find(item => item.id === id) : undefined;
  const inside = id?.startsWith('interior:') ? getInteriorObject(id) : undefined;
  const exit = id?.startsWith('exit:') && interiorId;
  const object = id?.startsWith('object:') ? getMap(mapId).objects.find(item => item.id === id.slice(7)) : undefined;
  const npc = id && !entrance && !inside && !exit && !object ? npcs.find(item => item.id === id) ?? getExpeditionNpc(id) : undefined;
  const talking = !entrance && !exit && !!(inside?.npcId || npc);
  const action = entrance ? t('Enter') : exit ? t('Leave') : talking ? t('Talk') : t('Inspect');
  const insideNpcName = inside?.npcId ? npcs.find(item => item.id === inside.npcId)?.name : undefined;
  const insideName = insideNpcName ? localizedName(insideNpcName) : inside?.label;
  const name = entrance?.label ?? insideName ?? (exit ? getInterior(exit).name : object?.label ?? (npc ? localizedName(npc.name) : undefined));
  const button = document.querySelector<HTMLButtonElement>('#talk-button')!;
  button.disabled = !name;
  document.querySelector('#nearby-action')!.textContent = name ? action : t('Interact');
  document.querySelector('#nearby-name')!.textContent = name ?? t('MOVE CLOSER');
  button.setAttribute('aria-label', name ? (entrance ? t('Enter {name}', { name }) : exit ? t('Leave {name}', { name }) : talking ? t('Talk to {name}', { name }) : t('Inspect {name}', { name })) : t('Move closer to interact'));
}
function syncLocation() {
  const room = interiorId ? getInterior(interiorId) : undefined, region = getMap(mapId);
  const shell = document.querySelector<HTMLElement>('#game-shell')!;
  if (room) shell.dataset.interior = room.id;
  else delete shell.dataset.interior;
  document.querySelector('#breadcrumb-current')!.textContent = room?.name ?? region.name;
  document.querySelector('#location-subtitle')!.textContent = upper(room ? room.subtitle : localized(region.subtitle));
  document.querySelector('#region-name')!.textContent = room ? `${region.name} · ${t('Indoors')}` : region.name;
  document.querySelector('#watch-region')!.textContent = room?.name ?? region.name;
  document.querySelector('#explore-view')!.setAttribute('aria-label', room ? t('{place} interior', { place: room.name }) : region.name);
  const chip = document.querySelector<HTMLElement>('#interior-location')!;
  chip.hidden = !room;
  chip.innerHTML = room ? `<span class="interior-location-icon">${icon(interiorIcon(room.id))}</span><span class="interior-location-copy"><small>${e(t('INSIDE {place}', { place: region.name.toUpperCase() }))}</small><strong>${e(room.name)}</strong></span><button data-action="leave-interior" aria-label="${e(t('Leave {name}', { name: room.name }))}">${icon('arrow')}<span>${t('Leave')}</span></button>` : '';
}
function onInteriorChange(id?: InteriorId) {
  if (!applyingWorldLocation && !api.joinInterior(id)) {
    applyInterior(api.interiorId);
    toast(t('The building is reconnecting. Please try again in a moment.'), true);
    return;
  }
  interiorId = id;
  syncLocation(); updateNearby(); updateProgress(); updateConnection();
  document.querySelector('#quest-tracker')!.setAttribute('aria-label', id ? t('Learning in this building') : t('Next story objective'));
  document.dispatchEvent(new Event('atlas-controls-reset'));
}
function applyInterior(id?: InteriorId) {
  applyingWorldLocation = true;
  try { world.confirmInterior(id); }
  finally { applyingWorldLocation = false; }
}
function guideToBuilding(id: InteriorId) {
  if (!buildingEntrances(mapId).some(entrance => entrance.interiorId === id)) return;
  document.querySelector<HTMLDialogElement>('#dialog')!.close();
  setView('world');
  if (interiorId) world.leaveInterior();
  world.focusBuilding(id);
  toast(t('Following the path to {place}…', { place: getInterior(id).name }));
}
function interiorGameCopy(id: InteriorId) {
  if (id === 'supermarket') return { title: t('A basket at Fritz’s supermarket'), action: t('Shop and count the change'), description: t('Build a grocery basket from the German request, choose cash or card, and return the right change.'), npcId: 'fritz' };
  if (id === 'bakery') return { title: t('Drinks at the lantern bakery'), action: t('Prepare the bakery’s drinks'), description: t('While the bread bakes, prepare coffee, milk and water for the guests. Read the order and follow the preparation steps.'), npcId: 'emil' };
  return { title: t('A shift at Marta’s café'), action: t('Prepare a café order'), description: t('Read a customer’s order, assemble the tray, and prepare each drink in the right order before serving.'), npcId: 'marta' };
}
function startInteriorActivity(id: string) {
  const object = getInteriorObject(id), room = interiorId ? getInterior(interiorId) : undefined;
  if (!object?.activityId || !room || !room.objects.some(item => item.id === id)) return;
  void startActivity(object.activityId, {roomId:room.id, stationId:id});
}
function interiorPracticeQueue(object: InteriorObjectSpec): Exercise[] {
  return playablePractice(object.exerciseIds.flatMap(id => {
    const exercise = interiorExercises.find(item => item.id === id);
    if (!exercise) return [];
    if (course && missingWordCount(course.courseContextWordIds[exercise.id] ?? [], progress)) return [];
    return [exercise.mode === 'sentence' && hasSuccessfulEncounter(exercise.itemId) ? { ...exercise, mode: 'type' as const, prompt: t('Write in German: {english}', { english: localizedExercise(exercise).english }) } : exercise];
  }));
}
function showInteriorObject(id: string) {
  if (interiorId === 'inn') {
    if (id === 'interior:inn:review') { void startAdaptiveReview(); return; }
    if (id === 'interior:inn:evidence') { setView('story'); return; }
    if (id === 'interior:inn:bed') { openDialog(`<div class="completion">${portrait('self')}<div class="eyebrow">${upper(t('Your room at the inn'))} · ${upper(t('Day {day}', { day: storyState(progress.story).day }))}</div><h2>${t('The lantern can rest.')}</h2>${miniGameHostLinks("re-ink")}<p>${t('Give a few familiar words another moment, or let the day end. Your discoveries stay with you.')}</p><button class="primary-button" data-action="review">${t('Evening review')} ${icon('leaf')}</button><button class="outline-button" data-action="sleep">${t('Sleep and begin tomorrow')} ${icon('clock')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')}</button></div>`, 'inn-dialog'); return; }
  }
  const object = getInteriorObject(id), room = interiorId ? getInterior(interiorId) : undefined;
  if (!object || !room || !room.objects.some(item => item.id === id)) return;
  const queue = interiorPracticeQueue(object);
  const npc = object.npcId ? npcs.find(item => item.id === object.npcId) : undefined;
  if (npc) recordExposure({npcId:npc.id});
  const game = object.activityId ? activityInfo.find(item => item.id === object.activityId) : undefined;
  const gameCopy = interiorGameCopy(room.id);
  const words = object.vocabulary.map(word => `<article class="interior-word"><div><span class="interior-word-article">${e(word.article)}</span><strong>${e(word.lemma)}</strong><button class="icon-button" data-speak="${e(`${word.article} ${word.lemma}`)}" aria-label="${e(t('Hear {word}', { word: word.lemma }))}">${icon('volume')}</button></div><p>${e(word.english)}</p><small><span>${t('PLURAL')}</span> ${e(word.plural)}</small></article>`).join('');
  openDialog(`<div class="interior-encounter"><header class="interior-encounter-heading">${npc ? portrait(npc.id, 'large-portrait') : `<span class="interior-object-emblem">${icon(interiorIcon(room.id))}</span>`}<div><div class="eyebrow">${e(room.name.toUpperCase())} · ${npc ? t('A FRIENDLY FACE') : t('LOOK A LITTLE CLOSER')}</div><h2>${e(object.label)}</h2></div></header>${miniGameHostLinks(id==='interior:inn:evidence'?'re-ink':id==='interior:inn:review'?'word-chain':id==='interior:cafe:coffee'?'tray-rush':id==='interior:cafe:tea'?'kettle-forecast':id==='interior:supermarket:scales'?'numbered-apples':undefined)}<p class="interior-description">${e(object.description)}</p>${object.dialogue ? `<blockquote class="interior-dialogue"><span>“${e(object.dialogue)}”</span><button class="icon-button" data-speak="${e(object.dialogue)}" aria-label="${e(t('Hear this German greeting'))}">${icon('volume')}</button></blockquote>` : ''}<div class="interior-word-heading"><span>${icon('book')} ${t('Words you can use here')}</span><small>${t('ARTICLE · WORD · PLURAL')}</small></div><div class="interior-words">${words}</div><section class="interior-practice-card"><span>${icon('chat')}</span><div><small>${t('A FOCUSED LEARNING SESSION')}</small><h3>${e(object.sessionTitle)}</h3><p>${e(object.prompt)}</p><span>${queue.length === 1 ? t('{count} expression', { count: queue.length }) : t('{count} expressions', { count: queue.length })} · ${t('Answers saved as you go')}</span></div>${queue.length ? `<button class="primary-button" data-practice-interior="${e(id)}">${t('Practise here')} ${icon('arrow')}</button>` : ''}</section>${game ? `<section class="interior-game-card"><small>${t('PLAY A LITTLE · A1 EVERYDAY GERMAN')}</small><h3>${e(gameCopy.title)}</h3><p>${e(gameCopy.description)}</p><button class="outline-button interior-activity" data-interior-activity="${e(id)}">${icon(game.icon)} ${e(gameCopy.action)} ${icon('arrow')}</button></section>` : ''}<button class="text-button interior-back" data-action="close-dialog">${e(t('Keep exploring {place}', { place: room.name }))} ${icon('arrow')}</button></div>`, 'interior-dialog', npc?.id);
}
function startInteriorPractice(id: string) {
  const object = getInteriorObject(id), room = interiorId ? getInterior(interiorId) : undefined;
  if (!object || !room || !room.objects.some(item => item.id === id)) return;
  if (connection !== 'online') { toast(t('The town is reconnecting. Try this session again in a moment.'), true); return; }
  const queue = interiorPracticeQueue(object);
  if (!queue.length) { if (!writingReady()) showOpeningPracticeNotice(); return; }
  setView('world');
  run = { queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:true, interiorObjectId:id, label:`${room.name} · ${object.sessionTitle}`, started:Date.now() };
  openDialog('', 'quest-dialog interior-practice-dialog', object.npcId); renderExercise();
}
function placesSection() {
  const entrances = buildingEntrances(mapId);
  if (!entrances.length) return '';
  return `<section class="interior-places"><header><div><span class="eyebrow">${t('STEP INSIDE')}</span><h3>${t('Everyday places. Useful German.')}</h3><p>${t('Walk to a doorway, enter, and stay for a short learning session.')}</p></div>${icon('compass')}</header><div class="interior-place-list">${entrances.map(entrance => { const room = getInterior(entrance.interiorId); return `<button data-focus-building="${room.id}"><span class="interior-place-icon">${icon(interiorIcon(room.id))}</span><span><strong>${e(room.name)}</strong><small>${e(room.subtitle)}</small></span>${icon('arrow')}</button>`; }).join('')}</div></section>`;
}
function nextInvestigation(graph: QuestGraph) { return graph.investigations.find(item => !(progress.story?.inspections?.[graph.questId] ?? []).includes(item.objectId)); }
function updateProgress() {
  const savedStory = storyState(progress.story);
  const rewards = lanternRewards(progress);
  document.querySelector<HTMLElement>('#game-shell')!.dataset.crest = rewards.crest;
  document.querySelector('#bell-count')!.textContent = `${savedStory.bell} / 7`;
  document.querySelector('#story-day')!.textContent = `${upper(t('Day {day}', { day: savedStory.day }))}${savedStory.lanternStreak ? ` · ${savedStory.lanternStreak === 1 ? t('{count} lantern', { count: savedStory.lanternStreak }) : t('{count} lanterns', { count: savedStory.lanternStreak })}` : ''}`;
  world.setStoryState({ completedQuestIds: progress.completedQuestIds, bellCount: savedStory.bell, flags: savedStory.flags, playerName: profile.name });
  if (course) world.setLearningContext(course.courseLexicon,progress,introducedSet(),barkLineAllowed);
  document.querySelector('#xp-value')!.textContent = String(progress.xp);
  const intake = intakeStatus(progress), badge = document.querySelector<HTMLElement>('#ink-badge');
  if (badge) {
    badge.dataset.paused = intake.paused;
    badge.innerHTML = `${icon('leaf')} ${e(intake.introduced === 1 ? t('{count} word restored', { count: intake.introduced }) : t('{count} words restored', { count: intake.introduced }))}`;
    badge.title = intake.paused === 'practise' ? t('Practise your restored words before new ones return.') : intake.paused === 'review' ? t('Review the words that are due before new ones return.') : intake.pending ? t('New words are returning now.') : intake.remaining ? t('The next word returns in about {minutes} min.', { minutes: Math.max(1, Math.ceil(intake.nextWordInSeconds / 60)) }) : t('Every word has returned.');
  }
  const expedition = getExpedition(mapId);
  if (expedition) {
    const game = getExpeditionGame(mapId)!, status = expeditionGameStatus(mapId, level, progress.story?.expeditionPlans ?? {});
    const encountered = expedition.encounters.filter(encounter => expeditionEncounterResult(encounter.id)?.correct).length;
    document.querySelector<HTMLElement>('#chapter-fill')!.style.width = `${(encountered + (status === 'completed' ? 1 : 0)) / (expedition.encounters.length + 1) * 100}%`;
    document.querySelector('#hud-level')!.textContent = `${level} · ${upper(titleLabel(rewards.title))}`;
    world.setObjective(interiorId ? undefined : expedition.npcs.find(npc => !expeditionEncounterResult(npc.encounterId)?.correct)?.id);
    document.querySelector('#quest-panel')!.innerHTML = `<button class="tracker-heading" data-expedition-game="${expedition.id}"><span class="quest-diamond">${icon(status === 'completed' ? 'check' : 'flag')}</span><span><small>${t('LOCAL AGREEMENT')} · ${status === 'completed' ? t('REMEMBERED') : t('BUILD A PLAN')}</small><strong>${e(game.title)}</strong></span>${icon('chevron')}</button>`;
    document.querySelector<HTMLElement>('#review-dot')!.hidden = !dueItems(progress).length;
    if (['journal', 'quests', 'story', 'menu'].includes(view)) renderOther();
    return;
  }
  const q = currentQuest(), act = actFor(mapId);
  const npc = npcs.find(n => n.id === q.npcId) ?? npcs[0];
  const done = completedAtLevel(level), total = quests.filter(x => x.level === level).length;
  document.querySelector<HTMLElement>('#chapter-fill')!.style.width = `${done / total * 100}%`;
  document.querySelector('#hud-level')!.textContent = `${level} · ${upper(titleLabel(rewards.title))}`;
  const finished = done === total && progress.completedQuestIds.includes(q.id);
  const graph = questGraph(q.id);
  if (graph && !investigationQuest && (savedStory.inspections[q.id]??[]).length && (savedStory.nodes[q.id]??'intro')==='intro') investigationQuest=q.id;
  const investigation = investigationQuest === q.id && graph ? nextInvestigation(graph) : undefined;
  world.setObjective(finished || interiorId || q.level !== level ? undefined : investigation ? `object:${investigation.objectId}` : q.npcId);
  const nextAct = storyActs[storyActs.findIndex(item => item.mapId === mapId) + 1];
  document.querySelector('#quest-panel')!.innerHTML = interiorId ? `<div class="interior-session-hint"><span>${icon('book')}</span><div><small>${t('A LITTLE GERMAN, IN CONTEXT')}</small><strong>${t('Talk, notice, practise.')}</strong><p>${t('Walk to people and glowing objects.')}</p></div></div>` : `<button class="tracker-heading" data-action="next-objective" aria-label="${e(finished ? t('View the next chapter') : t('Next objective: speak with {name}', { name: localizedName(npc.name) }))}"><span class="quest-diamond">${icon(finished ? 'map' : 'flag')}</span><span><small>${e(upper(t('Act {number}', { number: act.number })))} <b>·</b> ${finished ? t('ROUTE RESTORED') : investigation ? e(t('READ {thing}', { thing: findObject(investigation.objectId)?.label.toUpperCase() ?? upper(t('the evidence')) })) : e(t('FIND {name}', { name: upper(localizedName(npc.name)) }))}</small><strong>${finished ? nextAct ? e(t('The road to {place}', { place: getMap(nextAct.mapId).name })) : t('The Atlas remembers') : e(localized(q.title))}</strong></span>${icon('chevron')}</button>`;
  document.querySelector<HTMLElement>('#review-dot')!.hidden = !dueItems(progress).length;
  if (view === 'journal' || view === 'quests' || view === 'story' || view === 'menu') renderOther();
}
function syncTrackerState() { /* The objective chip opens a focused encounter instead of expanding across the world. */ }
let menuFocus: HTMLElement | null = null;
function worldCanInteract() { return started && !accessBlocked(accessClock.snapshot(performance.now())) && (!deliveryController||deliveryController.canMove) && connection === 'online' && !cinematicActive && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open && view === 'world' && !watchingWorld && !pendingMap && !screenFilterControls?.isOpen() && !document.querySelector<HTMLDialogElement>('#dialog')!.open && !dialogueOpen && !questController?.isOpen && document.querySelector<HTMLElement>('#chat-body')!.hidden; }
let dialogueOpen = false;
let worldInput = false;
let syncingWorld = false;
/**
 * The single place that decides what the game scene does behind the page: whether it takes input,
 * and whether it is live, paused (still drawn behind the menu) or hidden (under a full-screen activity).
 * Every state change that could affect either calls this instead of toggling the world directly.
 */
function syncWorldMode(): void {
  if (!world || syncingWorld) return;
  syncingWorld = true;
  try {
    const input = worldCanInteract();
    const dialog = document.querySelector<HTMLDialogElement>('#dialog');
    const covered = !!dialog?.open && dialog.classList.contains('activity-dialog');
    const presentation: WorldPresentation = document.hidden || document.querySelector<HTMLDialogElement>('#account-dialog')!.open || started && accessBlocked(accessClock.snapshot(performance.now())) || view !== 'world' ? 'paused' : covered ? 'hidden' : 'live';
    if (worldInput && !input) document.dispatchEvent(new Event('atlas-controls-reset'));
    worldInput = input;
    world.setInputEnabled(input);
    world.setPresentation(presentation);
    if (presentation !== 'live') deliveryController?.pause();
    else if (!document.hidden && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open) deliveryController?.resume();
  } finally { syncingWorld = false; }
}
function setView(next: View) {
  if (questController?.isOpen) questController.close();
  if (watchingWorld) watchWorld(false);
  exposureObserver?.disconnect();
  if (next !== 'world') screenFilterControls?.close(false);
  if (next !== 'world' && view === 'world') menuFocus = document.activeElement as HTMLElement;
  const previous = view;
  view = next;
  document.querySelector<HTMLElement>('#game-shell')!.dataset.view = next;
  const menu = document.querySelector<HTMLDialogElement>('#menu-layer')!;
  if (next === 'world') { if (menu.open) menu.close(); menu.hidden = true; }
  else { menu.hidden = false; if (!menu.open) menu.showModal(); }
  document.querySelector<HTMLElement>('#game-hud')!.inert = next !== 'world';
  document.querySelector<HTMLElement>('#world-container')!.inert = next !== 'world';
  syncWorldMode();
  document.querySelectorAll<HTMLElement>('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === next));
  if (next !== 'world') {
    menuMemory.remember(next);
    const sectionChanged = previous === 'world' || sectionOf(previous) !== sectionOf(next);
    uiSounds.play(previous === 'world' ? 'open' : sectionChanged ? 'tab' : previous !== next ? 'page' : 'move');
    document.querySelector('#menu-title')!.textContent = viewLabel(next);
    renderMenuChrome();
    menuNavigator?.focusTab();
    const content = document.querySelector<HTMLElement>('#other-view')!;
    renderOther(); content.scrollTop = 0;
    // Pages slide in from the side they were flipped towards; a fresh menu rises into place.
    const order = (item: MenuView) => menuSections.flatMap(section => section.views).indexOf(item);
    content.dataset.enter = previous === 'world' ? 'rise' : order(next) < order(previous) ? 'left' : 'right';
    content.classList.remove('page-enter'); void content.offsetWidth; content.classList.add('page-enter');
  } else {
    if (previous !== 'world') uiSounds.play('close');
    if (menuFocus?.isConnected && menuFocus.getClientRects().length) menuFocus.focus(); queueMicrotask(() => onRegionReady(mapId));
  }
}
function menuPages(): MenuPage[] {
  if (view === 'world') return [];
  if (view === 'settings') return optionsTabs.map(tab => ({ label: tab.label(), attributes: `data-options-tab="${tab.id}"`, selected: tab.id === optionsTab }));
  return sectionOf(view).views.map(item => ({ label: viewLabel(item), attributes: `data-view="${item}"`, selected: item === view }));
}
function renderMenuChrome() {
  if (view === 'world') return;
  const mode = menuNavigator?.mode ?? 'pointer', pages = menuPages();
  document.querySelector('#menu-tabs')!.innerHTML = menuTabsMarkup(view, menuMemory, mode);
  const row = document.querySelector<HTMLElement>('#menu-pages')!;
  row.innerHTML = menuPagesMarkup(pages, mode); row.hidden = pages.length < 2;
  document.querySelector('#menu-help')!.textContent = '';
  renderMenuPrompts();
}
function renderMenuPrompts() {
  const prompts = document.querySelector('#menu-prompts');
  if (prompts) prompts.innerHTML = promptStrip(menuNavigator?.mode ?? 'pointer', menuPages().length > 1);
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
const attemptedCinematics = new Set<string>();
async function playPendingCinematic(): Promise<void> {
  if (!regionReady || !worldCanInteract()) return;
  const arrival = mapId === 'lindenhafen' && !progress.completedQuestIds.includes('a1-arrival') && !progress.story?.flags['cinematic:arrival'] && !attemptedCinematics.has('arrival');
  const kind = pendingStoryBeat ?? (arrival ? 'arrival' : pendingTravelBeat ? 'travel' : undefined);
  if (!kind) return;
  pendingStoryBeat = undefined; pendingTravelBeat = false;
  if (kind !== 'travel' && (progress.story?.flags[`cinematic:${kind}`] || attemptedCinematics.has(kind))) return;
  cinematicActive = true; attemptedCinematics.add(kind);
  document.querySelector('#game-shell')!.classList.add('cinematic-open');
  syncWorldMode(); stopSpeech();
  try {
    if (kind !== 'travel') {
      try { const result = await api.request<{progress:Progress}>('/story/cinematic', {id:crypto.randomUUID(),kind}); acceptProgress(result.progress); updateProgress(); }
      catch { /* The world beat can still play while its saved marker reconnects. */ }
    }
    await world.playCutscene(kind, progress.story?.ending);
  } finally {
    cinematicActive = false;
    document.querySelector('#game-shell')!.classList.remove('cinematic-open');
    syncWorldMode();
    document.querySelector<HTMLElement>('#world-container')!.focus();
  }
}
function onRegionReady(id: MapId) {
  if (!started || !mapConfirmed || id !== mapId || view !== 'world' || document.hidden || document.querySelector<HTMLDialogElement>('#account-dialog')!.open || document.querySelector<HTMLDialogElement>('#dialog')!.open) return;
  if (cinematicActive) return;
  if (!worldCanInteract()) return;
  if (pendingStoryBeat || pendingTravelBeat || id === 'lindenhafen' && !progress.completedQuestIds.includes('a1-arrival') && !progress.story?.flags['cinematic:arrival'] && !attemptedCinematics.has('arrival')) { void playPendingCinematic().then(() => { if (id === mapId) onRegionReady(id); }); return; }
  if (!readSeen('acts').includes(id)) { rememberSeen('acts', id); const q = currentQuest(); if (!getExpedition(id)) { world.focusNpc(q.npcId); toast(t('Find {name} to begin Act {act}.', { name: localizedName(npcs.find(npc => npc.id === q.npcId)!.name), act: actFor(id).number })); } else showActIntro(id); return; }
  continueDestination();
}
function showActIntro(id: MapId) {
  const expedition = getExpedition(id);
  if (expedition) {
    const map = getMap(id), game = getExpeditionGame(id)!;
    rememberSeen('acts', id);
    openDialog(`<div class="act-intro" style="--region-art:url('${map.previewAsset}')"><div class="act-art"><span>${t('EXPEDITION')} · A1 / A2 / B1</span></div><div class="act-copy"><div class="eyebrow">${e(expedition.feeling)}</div><h2>${e(expedition.name)}</h2><p>${e(expedition.description)}</p><p>${e(expedition.culture)}</p><div class="story-objective">${icon('flag')}<span>${e(game.summary)}</span></div><p class="expedition-save-note">${t('Meet eight local neighbors and ten discoveries. Choose a language scaffold when you play. Expedition agreements are saved with your adventure.')}</p><button class="primary-button" data-action="act-begin">${e(t('Explore {place}', { place: expedition.name }))} ${icon('arrow')}</button></div></div>`, 'act-dialog');
    return;
  }
  const act = actFor(id), map = getMap(id);
  rememberSeen('acts', id);
  openDialog(`<div class="act-intro" style="--region-art:url('${map.previewAsset}')"><div class="act-art"><span>${e(upper(t('Act {number}', { number: act.number })))} · ${act.level}</span></div><div class="act-copy"><div class="eyebrow">${e(map.name.toUpperCase())}</div><h2>${e(localized(act.title))}</h2>${translationHelp()}${act.introduction.map(p => `<p>${renderNarrative(p)}</p>`).join('')}<div class="story-objective">${icon('flag')}<span>${renderNarrative(act.goal)}</span></div><button class="primary-button" data-action="act-begin">${e(t('Step into {place}', { place: map.name }))} ${icon('arrow')}</button></div></div>`, 'act-dialog');
}
const factionNotes: Record<string, () => string> = { brassOffice: () => t('The Brass Office noted that.'), lamplighters: () => t('The Lamplighters will remember this.'), unwritten: () => t('The Unwritten Circle will remember this.') };
function consequenceNote(effects: readonly { faction?: string }[] = []): string {
  const note = effects.map(effect => effect.faction ? factionNotes[effect.faction]?.() : undefined).find(Boolean);
  return note ? ` · ${note}` : '';
}
/** Until her name is revealed in the parcel scene, the notes are signed only "E.". */
const unsignedQuests = quests.slice(0, quests.findIndex(quest => quest.id === 'a1-lost-parcel')).map(quest => quest.id);
function eliseLetter(letter: Narrative, questId: string): string {
  return letter.length ? `<blockquote class="elise-letter"><span>${t('A note from {name}', { name: unsignedQuests.includes(questId) ? 'E.' : 'Elise' })}</span>${renderNarrative(letter)}<small class="elise-signature">— ${unsignedQuests.includes(questId) ? 'E.' : 'Elise'}</small></blockquote>` : '';
}
function continueDestination() {
  if (pendingExpeditionGame) { const id = pendingExpeditionGame; pendingExpeditionGame = undefined; startExpeditionGame(id); return; }
  const destination = pendingDestination; pendingDestination = undefined;
  if (!destination) return;
  if (interiorId) world.leaveInterior();
  if (destination.kind === 'quest') { const q = quests.find(item => item.id === destination.questId); if (q) world.focusNpc(q.npcId); }
  else { const q = quests.find(item => item.id === destination.questId); if (q) world.focusNpc(q.npcId); }
}
function travelMap(id: MapId, destination?: { kind: 'quest' | 'follow'; questId: string }) {
  if (!isStoryMap(id)) return;
  if (!routeUnlocked(id, progress.completedQuestIds)) { toast(routeLockReason(id, progress.completedQuestIds)); return; }
  if (questController?.isOpen) questController.close();
  if (pendingMap) return;
  if (id === mapId) {
    if (interiorId) world.leaveInterior();
    document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView('world');
    pendingDestination = destination;
    if (destination) continueDestination(); else showActIntro(id);
    return;
  }
  if (connection !== 'online' || !api.joinMap(id)) { toast(t('The route is reconnecting. Try travelling again in a moment.'), true); return; }
  pendingMap = id; pendingDestination = destination;
  pendingTravelBeat = true;
  document.querySelector<HTMLDialogElement>('#dialog')!.close();
  if (!document.querySelector<HTMLElement>('#chat-body')!.hidden) toggleChat(false);
  setView('world');
  toast(t('Following the lanterns to {place}…', { place: getMap(id).name }));
}
function showNextObjective() {
  if (questController?.isOpen) questController.close();
  if (getExpedition(mapId)) { startExpeditionGame(mapId); return; }
  const q = currentQuest(), act = actFor(mapId), done = completedAtLevel(level);
  if (q.level !== level) { travelMap(maps.find(map => map.level === q.level)!.id, {kind:'follow',questId:q.id}); return; }
  const nextAct = storyActs[storyActs.findIndex(item => item.mapId === mapId) + 1];
  if (done === quests.filter(item => item.level === level).length) {
    openDialog(`<div class="completion"><div class="completion-mark">${icon('map')}</div><div class="eyebrow">${e(upper(t('Act {number}', { number: act.number })))} · ${t('A ROUTE REMEMBERED')}</div><h2>${nextAct ? e(t('Beyond {place}', { place: getMap(mapId).name })) : t('Three towns. One new promise.')}</h2><p>${renderNarrative(act.cliffhanger)}</p>${nextAct ? `<button class="primary-button" data-travel="${nextAct.mapId}">${e(t('Travel to {place}', { place: getMap(nextAct.mapId).name }))} ${icon('arrow')}</button>` : `<button class="primary-button" data-view="story">${t('Read your discoveries')}</button>`}<button class="text-button" data-action="close-dialog">${t('Keep exploring here')}</button></div>`); return;
  }
  const graph = questGraph(q.id), target = investigationQuest === q.id && graph ? nextInvestigation(graph) : undefined;
  if (target) { world.focusObject(target.objectId); toast(t('Read {thing}, then return to the witness.', { thing: findObject(target.objectId)?.label ?? t('the evidence') })); return; }
  const npc = npcs.find(item => item.id === q.npcId)!;
  const chapterQuests = quests.filter(item => item.level === level);
  const previous = chapterQuests.slice(0, chapterQuests.findIndex(item => item.id === q.id)).reverse().find(item => progress.completedQuestIds.includes(item.id));
  openDialog(`<div class="objective-dialog">${portrait(npc.id, 'large-portrait')}<div class="eyebrow">${t('YOUR NEXT LEAD')}</div><h2>${e(localized(q.title))}</h2>${graph ? questObjectivesMarkup(graph,progress) : ''}<p>${renderNarrative(previous ? clueFor(previous.id)?.lead ?? act.goal : act.goal)}</p><div class="story-objective">${icon('pin')}<span>${e(t('Find {name}', { name: localizedName(npc.name) }))} · ${e(localized(q.location))}</span></div><button class="primary-button" data-follow-quest="${q.id}">${e(t('Find {name}', { name: localizedName(npc.name) }))} ${icon('arrow')}</button><button class="text-button" data-follow-quest="${q.id}">${icon('pin')} ${t('Track this conversation')}</button></div>`, 'objective-dialog');
}
function findObject(id: string): WorldObjectSpec | undefined { return maps.flatMap(map => [...map.objects]).find(item => item.id === id); }
function activityForObject(object: WorldObjectSpec): ActivityId {
  if (object.kind === 'fountain' || object.id.includes('housing')) return 'cafe';
  if (object.kind === 'garden') return 'market';
  if (object.kind === 'parcel' || object.id.includes('timetable') || object.id.includes('route-sign') || object.kind === 'lantern' || object.id.includes('chart')) return 'delivery';
  return 'detective';
}
const questLevels = new Map<string, Level>(quests.map(quest => [quest.id, quest.level]));
const storyExerciseLevels = new Map<string, Level>(quests.flatMap(quest => quest.exercises.map(ex => [ex.id, quest.level] as const)));
/** Letters shown under a typed answer; they fade with unaided recalls and vanish once the learner has moved past the sentence's level. */
function typedScaffold(ex: Exercise & { level?: Level; targetWordId?: string }): string {
  const level = ex.level ?? storyExerciseLevels.get(ex.id) ?? 'A1';
  const recalls = Math.max(progress.items[ex.itemId]?.modeStats.production?.unaidedSuccesses ?? 0, ex.targetWordId ? progress.words[ex.targetWordId]?.evidence?.production?.unaidedSuccesses ?? 0 : 0);
  return scaffoldText(ex.answer, scaffoldStage(level, learnerLevel(progress.completedQuestIds, questLevels), recalls));
}
function hasSuccessfulEncounter(itemId: string): boolean { return Object.values(progress.items[itemId]?.modeStats ?? {}).some(stats => stats.correct > 0); }
function availableObjectExercises(object: WorldObjectSpec): Exercise[] {
  const due = new Set(dueItems(progress));
  return playablePractice(object.exerciseIds.flatMap(id => { const ex = quests.flatMap(q => q.exercises).find(item => item.id === id); return ex && (!hasSuccessfulEncounter(ex.itemId) || due.has(ex.itemId)) ? [ex.mode === 'sentence' && progress.items[ex.itemId] ? { ...ex, mode: 'type' as const, prompt: t('Write in German: {english}', { english: localizedExercise(ex).english }) } : ex] : []; }));
}
type ExpeditionEncounterRecord = { selected: number; successful?: number; attempts: number };
function expeditionEncounterResult(id: string): { selected: number; correct: boolean; attempts: number } | undefined {
  return progress.story?.expeditions?.[id];
}
const expeditionLearning = new ExpeditionLearning({api,progress:()=>progress,onProgress:next=>{acceptProgress(next);updateProgress();}});
async function showExpeditionEncounter(targetId:string) {
  const region=expeditionRegions.find(region=>!!getExpeditionEncounter(region.id,targetId));if(!region)return;
  const encounter=getExpeditionEncounter(region.id,targetId)!,npc=getExpeditionNpc(targetId),object=region.objects.find(object=>object.id===targetId);
  if(object)rememberSeen('objects',object.id);
  activityController?.destroy();activityController=undefined;
  openDialog(`<div class="expedition-encounter"><header class="expedition-encounter-heading">${npc?portrait(npc.id,'large-portrait'):`<span class="expedition-portrait">${icon('lantern')}</span>`}<div><div class="eyebrow">${e(region.name)} · ${encounter.difficulty}</div><h2>${e(npc?.name??object?.label??encounter.title)}</h2>${npc?`<span>${e(npc.role)}</span>`:''}</div></header>${object?`<p>${e(object.description)}</p>`:''}${npc?`<aside class="expedition-relationship">${icon('users')} ${e(npc.relationship)}</aside>`:''}<div id="expedition-encounter-learning-root">Preparing the neighbor’s message…</div><p class="expedition-save-note">${icon('book')} ${e(encounter.languageFocus)}</p><div class="expedition-game-actions"><button class="outline-button" data-expedition-game="${region.id}">${t('Build this neighborhood’s plan')} ${icon('arrow')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')} ${icon('arrow')}</button></div></div>`,'expedition-dialog',npc?.id);
  const root=document.querySelector<HTMLElement>('#expedition-encounter-learning-root')!;let alive=true,paused=document.hidden||document.querySelector<HTMLDialogElement>('#account-dialog')!.open;const runtime:{controller?:ReturnType<typeof mountExpeditionEncounter>;speechHost?:ReturnType<typeof import('./minigames/host').createMiniGameHost>}={};
  const currentPlayer=expeditionLearning.captureOwner();
  activityController={destroy(){alive=false;runtime.controller?.destroy();runtime.speechHost?.destroy();root.replaceChildren();},pause(){paused=true;runtime.controller?.pause();},resume(){paused=false;runtime.controller?.resume();},reset(){runtime.controller?.reset();}};
  const {createMiniGameHost}=await import('./minigames/host');if(!alive||!root.isConnected||!currentPlayer())return;
  runtime.speechHost=createMiniGameHost({api,gameId:'expedition-encounters',lexicon:[],exercises:[],progress:()=>progress,onProgress:next=>{acceptProgress(next);updateProgress();},onEnd:()=>{},playerName:profile.name,silent:silentMode,muted,reducedMotion:worldMotion==='reduced',narration:active=>world.setNarrationActive(active)});
  runtime.controller=mountExpeditionEncounter(root,encounter,{learning:expeditionLearning,progress:()=>progress,onProgress:next=>{acceptProgress(next);updateProgress();},saveStory:(selected,id)=>api.request<{progress:Progress}>('/expedition/answer',{id,selected,encounterId:encounter.id}),speak:(text,path)=>runtime.speechHost!.speakText(text,path),stopSpeech:()=>runtime.speechHost?.audio.stop(),silent:silentMode,initialPaused:paused||document.hidden||document.querySelector<HTMLDialogElement>('#account-dialog')!.open,previouslyAnswered:!!expeditionEncounterResult(encounter.id)?.attempts});
}
function expeditionActivityBoard() {
  if (!routeUnlocked('windplain', progress.completedQuestIds)) return '';
  return `<section class="expedition-story-link"><div class="eyebrow">${t('TEN WAYS TO MAKE AN AGREEMENT')}</div><h3>${t('Local games across the Atlas')}</h3><div class="activity-board">${expeditionGames.map(game => { const region = getExpedition(game.id)!, status = expeditionGameStatus(game.id, level, progress.story?.expeditionPlans ?? {}); return `<article class="activity-entry" style="--activity-art:url('/assets/${game.id}-preview.webp')">${icon('compass')}<small>${e(region.name)} · ${status === 'completed' ? t('AGREEMENT REMEMBERED') : status === 'started' ? t('RESUME YOUR PLAN') : 'A1 / A2 / B1'}</small><h3>${e(game.title)}</h3><p>${e(game.summary)}</p><button class="primary-button" data-expedition-game="${game.id}">${status === 'started' ? t('Resume the neighborhood game') : status === 'completed' ? t('Revisit the neighborhood game') : t('Play the neighborhood game')} ${icon('arrow')}</button><details><summary>${t('Meet the neighbors')}</summary>${[...region.npcs,...region.objects].map(target => `<button class="text-button" data-expedition-target="${target.id}">${e(getExpeditionEncounter(region.id,target.id)!.title)} ${icon('arrow')}</button>`).join('')}</details></article>`; }).join('')}</div></section>`;
}
function expeditionOverview() {
  const region = getExpedition(mapId)!;
  const game = getExpeditionGame(mapId)!, status = expeditionGameStatus(mapId, level, progress.story?.expeditionPlans ?? {});
  const solved = region.encounters.filter(encounter => expeditionEncounterResult(encounter.id)?.correct).length;
  return `<section class="expedition-overview"><div class="eyebrow">${e(region.feeling)}</div><h2>${e(region.name)}</h2><p>${e(region.description)}</p><p>${e(region.culture)}</p><div class="expedition-stat-row"><span>${t('{count} local neighbors', { count: region.npcs.length })}</span><span>${t('{count} discoveries', { count: region.objects.length })}</span><span>${t('{solved} / {total} connections made', { solved, total: region.encounters.length })}</span></div><section class="interior-practice-card"><span>${icon('compass')}</span><div><small>${status === 'completed' ? t('AN AGREEMENT REMEMBERED') : t('PLAY THIS NEIGHBORHOOD')}</small><h3>${e(game.title)}</h3><p>${e(game.summary)}</p><span>${t('A1 / A2 / B1 scaffold · saved with your adventure')}</span></div><button class="primary-button" data-expedition-game="${region.id}">${status === 'started' ? t('Resume the plan') : status === 'completed' ? t('Revisit the agreement') : t('Build the plan')} ${icon('arrow')}</button></section><p>${icon('book')} ${e(region.languageFocus)}</p><div class="expedition-cast">${region.npcs.map(npc => `<button data-expedition-target="${npc.id}">${portrait(npc.id)}<span><strong>${e(npc.name)}</strong><small>${e(npc.role)}</small><small>${e(npc.relationship)}</small></span></button>`).join('')}</div><div class="expedition-game-actions"><button class="outline-button" data-view="atlas">${t('Explore the region atlas')} ${icon('map')}</button><button class="text-button" data-travel="lindenhafen">${t('Return to the missing-route story')} ${icon('arrow')}</button></div></section>`;
}
function startExpeditionGame(id: string, requestedLevel?: Level) {
  const game = getExpeditionGame(id);
  if (!game) return;
  if (!routeUnlocked(game.id, progress.completedQuestIds)) { toast(routeLockReason(game.id, progress.completedQuestIds)); return; }
  if (requestedLevel && ['A1', 'A2', 'B1'].includes(requestedLevel)) { level = requestedLevel; localStorage.setItem('atlas.level', level); }
  if (connection !== 'online') { toast(t('The route is reconnecting. Your local plan is waiting.'), true); return; }
  setView('world'); run = undefined;
  activityController?.destroy(); activityController = undefined;
  openDialog('<div id="expedition-game-root"></div>', 'activity-dialog expedition-dialog');
  activityController = mountExpeditionGame(document.querySelector<HTMLElement>('#expedition-game-root')!, game, { level, speak, onExposure: context => recordExpeditionExposure(context.text), onPlacement: context => expeditionLearning.place(context), placementPrompt:(value,fieldId)=>placementLearning.get(`${game.id}:${value}:${fieldId}`)?.prompt??'', placementReady:(value,fieldId)=>{const mapping=placementLearning.get(`${game.id}:${value}:${fieldId}`);return !!mapping&&expeditionLearning.ready(mapping.exerciseId);},pendingLearning:()=>expeditionLearning.pendingPlacements(),retryLearning:()=>expeditionLearning.retryPlacements(), initialPlan: value => progress.story?.expeditionPlans?.[`${game.id}:${value}`], submitPlan: plan => expeditionLearning.submitPlan({mapId:game.id,level:plan.level,values:plan.values,order:plan.order}), onLevelChange: value => { level = value; localStorage.setItem('atlas.level', value); updateProgress(); }, onComplete: () => { updateProgress(); playCue(true); toast(t('An agreement remembered in your expedition notebook.')); } });
  document.querySelector<HTMLDialogElement>('#dialog')!.scrollTop = 0;
}
function showObject(id: string) {
  if(deliveryController)return;
  const active = currentQuest(), graph = questGraph(active.id);
  if (graph?.investigations.some(item => item.objectId === id) && questAvailable(active.id, progress) && !progress.completedQuestIds.includes(active.id)) { investigationQuest = active.id; if (questController?.inspect(active.id, id)) return; }
  if (expeditionRegions.some(region => getExpeditionEncounter(region.id, id))) { showExpeditionEncounter(id); return; }
  const object = findObject(id); if (!object) return;
  rememberSeen('objects', id);
  const objectMap = maps.find(map => map.objects.some(item => item.id === id))!;
  const lore = objectStories[id], queue = objectMap.id === mapId ? availableObjectExercises(object) : [];
  const game = activityInfo.find(game => game.id === activityForObject(object))!;
  const miniGames = miniGameHostLinks(object.minigame);
  openDialog(`<div class="object-encounter"><div class="object-crest">${icon(object.kind === 'clock' ? 'clock' : object.kind === 'garden' ? 'leaf' : object.kind === 'noticeboard' ? 'scroll' : 'lantern')}</div><div class="eyebrow">${t('A LITTLE THING THAT REMEMBERS')}</div><h2>${e(object.label)}</h2>${translationHelp()}<p>${lore ? renderNarrative(lore.detail) : e(object.description)}</p><blockquote>${id === 'nebelstadt-observatory' && !progress.completedQuestIds.includes('b1-atlas') ? renderNarrative(journalNarratives.observatoryWaiting) : lore ? renderNarrative(lore.secret) : e(localized(object.prompt))}</blockquote>${objectMap.id === mapId ? `${miniGames}<div class="object-games"><span class="eyebrow">${t('OPTIONAL SIDE ACTIVITY')}</span><button class="outline-button" data-activity="${game.id}">${icon(game.icon)} ${e(game.action)} ${icon('arrow')}</button></div>` : ''}<div class="object-language"><span>${icon('book')} ${e(localized(object.prompt))}</span>${objectMap.id !== mapId ? `<button class="primary-button" data-travel="${objectMap.id}">${e(t('Travel to {place}', { place: objectMap.name }))} ${icon('arrow')}</button>` : queue.length ? `<button class="text-button" data-practice-object="${id}">${t('Try a short language encounter')} <small>${queue.length === 1 ? t('{count} expression', { count: queue.length }) : t('{count} expressions', { count: queue.length })}</small> ${icon('arrow')}</button>` : `<p class="resting-note">${t('Lore is always here. Familiar expressions rest until their next encounter.')}</p>`}</div><button class="text-button" data-action="close-dialog">${t('Back to exploring')} ${icon('arrow')}</button></div>`, 'object-dialog');
}
function startObjectPractice(id: string) {
  const object = findObject(id); if (!object) return;
  const queue = availableObjectExercises(object);
  if (!queue.length) { if (!writingReady()) showOpeningPracticeNotice(); else showObject(id); return; }
  if (connection !== 'online') { toast(t('The town is reconnecting. Your clue is safe; try the encounter in a moment.'), true); return; }
  setView('world');
  run = { queue, index: 0, correct: 0, targetCount: queue.length, hinted: false, audioHeard: false, answered: false, answer: '', tokenOrder: [], review: true, objectId: id, label: object.label, started: Date.now() };
  openDialog('', 'quest-dialog'); renderExercise();
}
async function loadCourse(): Promise<CourseModule> {
  if (course) return course;
  coursePromise ??= import('./course').then(module => {
    course = module;
    world.setLearningContext(module.courseLexicon,progress,introducedSet(),barkLineAllowed);
    for (const word of module.courseLexicon) if (!audioPaths.has(spokenWord(word))) audioPaths.set(spokenWord(word), `/audio/word-${word.id}.mp3`);
    for (const ex of module.courseExercises) if (!audioPaths.has(ex.german)) audioPaths.set(ex.german, `/audio/${ex.id}.mp3`);
    for (const guide of module.courseGrammar) guide.examples.forEach((example, index) => { if (!audioPaths.has(example.german)) audioPaths.set(example.german, `/audio/guide-${guide.id}-${index + 1}.mp3`); });
    return module;
  }).catch(error => { coursePromise = undefined; throw error; });
  return coursePromise;
}
async function showCourseSources() {
  const module = await loadCourse().catch(() => undefined);
  if (!module) { toast(t('The credits could not open. Try again in a moment.'), true); return; }
  setView('world');
  openDialog(`<div class="exercise-content"><div class="eyebrow">${e(t('LEARNING CONTENT & CREDITS'))}</div><h2>${t('German with a traceable source.')}</h2><p>${t('The vocabulary is placed against A1–B1 reference lists. Grammar explanations, story dialogue, mini-game situations and practice passages were written for this game. Completing the course is practice evidence; proficiency also depends on using German in unfamiliar situations.')}</p><p>${t('Audio uses a German synthetic voice. Speaking exercises are not included.')}</p>${module.courseSources.map(source => `<article class="grammar-route"><h3><a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.title)}</a></h3><p>${e(source.description)}</p><small><a href="${e(source.licenseUrl)}" target="_blank" rel="noopener noreferrer">${e(source.license)}</a></small></article>`).join('')}<button class="primary-button" data-action="close-dialog">${t('Back to exploring')}</button></div>`, 'credits-dialog');
}
function spokenWord(word: { lemma: string; article?: string; articleForm?: string }) { return word.article ? `${word.article} ${word.articleForm ?? word.lemma}` : word.lemma; }
function requestCourseRender(el: Element) {
  el.innerHTML = `<div class="route-loading">${icon('book')}<h2>${t('Opening your learning routes…')}</h2><p>${t('The world stays light while your course is closed.')}</p></div>`;
  void loadCourse().then(() => { if (el.isConnected && (view === 'course' || view === 'journal')) renderOther(); }).catch(() => { if (el.isConnected) el.innerHTML = `<div class="route-loading"><h2>${t('The route could not open.')}</h2><button class="primary-button" data-action="course-retry">${t('Try again')}</button></div>`; });
}
function renderActivities(el: Element) {
  const region = getMap(mapId);
  if (getExpedition(mapId)) { el.innerHTML = expeditionOverview() + miniGameBoard() + expeditionActivityBoard(); return; }
  el.innerHTML = `<div class="route-heading">${icon('star')}<div><div class="eyebrow">${e(upper(t('Act {number}', { number: actFor(mapId).number })))} · ${level} · ${e(region.name.toUpperCase())}</div><h2>${t('A little detour.')}</h2><p>${t('Take a break from the main story. Serve a customer, strike a deal, investigate evidence or deliver a letter. These optional activities let you practise German at your own pace.')}</p></div></div><div class="activity-board">${activityInfo.map((game, index) => { const saved = progress.activities?.[`${game.id}:${level}`]; return `<article class="activity-entry" style="--activity-art:url('${region.previewAsset}');--activity-position:${['35% 45%','70% 55%','10% 25%','85% 25%'][index]}">${icon(game.icon)}<small>${e(localizedName(npcs.find(n => n.id === game.npcId)!.name))} · ${level} · ${saved ? t('DISCOVERED') : t('OPTIONAL ACTIVITY')}</small><h3>${e(game.title)}</h3><p>${e(game.description)}</p><button class="primary-button" data-activity="${game.id}">${e(game.action)} ${icon('arrow')}</button></article>`; }).join('')}</div>` + miniGameBoard() + expeditionActivityBoard();
}
function miniGameHostLinks(id?:string):string {
  const game=id&&miniGameById.get(id);if(!game)return '';
  return `<div class="minigame-host-links"><button data-minigame="${e(game.id)}">${icon('lantern')} ${e(game.title)} · ${game.seconds}s ${icon('arrow')}</button></div>`;
}
function miniGameBoard(storyOnly=false):string {
  const levels:Level[]=['A1','A2','B1'];
  const choices=miniGameDefinitions.filter(game=>game.levels.some(value=>levels.indexOf(value)<=levels.indexOf(level))&&(!storyOnly||game.tier==='B'));
  return `<section class="lantern-games"><div class="eyebrow">LANTERN ROUNDS</div><h3>${storyOnly?'Scenes you can play again':'Keep the ink alive.'}</h3><div class="minigame-grid">${choices.map(game=>{
    const gameLevel=game.levels.filter(value=>levels.indexOf(value)<=levels.indexOf(level)).at(-1)!;
    const quest=game.questIds?.find(id=>quests.find(quest=>quest.id===id)?.level===gameLevel)??game.questIds?.[0];
    const unlocked=!quest||questUnlocked(quest,progress.completedQuestIds);
    return `<article class="minigame-entry"><small>${e(game.host)} · ${game.modalities.join(' / ')} · ${game.seconds}s</small><h3>${e(game.title)}</h3><p>${e(game.instruction)}</p><button class="outline-button" data-minigame="${e(game.id)}" ${unlocked?'':'disabled'}>${unlocked?'Play a lantern round':'Follow the story to this scene'} ${icon('arrow')}</button></article>`;
  }).join('')}</div></section>`;
}
function recordExpeditionExposure(text:string):void {
  void loadCourse().then(module=>{
    const restored=introducedSet(),tokens=new Set(text.toLocaleLowerCase('de').match(/\p{L}+/gu)??[]);
    const wordIds=module.courseLexicon.filter(word=>restored.has(word.id)&&[word.lemma,...(word.surfaceForms??[])].some(form=>tokens.has(form.toLocaleLowerCase('de')))).map(word=>word.id);
    if(wordIds.length)recordExposure({wordIds});
  }).catch(()=>{});
}
async function startMiniGame(id:string):Promise<void>{
  const definition=miniGameById.get(id);if(!definition)return;
  if(connection!=='online'){toast(t('The town is reconnecting. Try again in a moment.'),true);return;}
  if(id==='neighborhood-boards'){
    if(getExpedition(mapId))startExpeditionGame(mapId);
    else{setView('activities');toast('Choose a neighborhood game in Activities.');}
    return;
  }
  if(id==='delivery-run'){try{await startWorldDelivery();}catch(error){toast((error as Error).message,true);}return;}
  const levels:Level[]=['A1','A2','B1'],gameLevel=definition.levels.filter(value=>levels.indexOf(value)<=levels.indexOf(level)).at(-1);
  if(!gameLevel){toast(`This lantern round belongs to ${definition.levels.join(' / ')}.`);return;}
  if(definition.modalities.every(mode=>mode==='production')&&!writingReady()){showOpeningPracticeNotice(true);return;}
  if(['lantern-lighting','word-chain'].includes(id)){const hour=world.getWorldTime().hour;if(hour>=6&&hour<18){toast('The lantern games open at dusk, after 18:00.');return;}}
  const questId=definition.questIds?.find(id=>quests.find(quest=>quest.id===id)?.level===gameLevel)??definition.questIds?.[0];
  if(questId&&!questUnlocked(questId,progress.completedQuestIds)){toast('Follow the story to this scene first.');return;}
  deliveryController?.destroy();deliveryController=undefined;deliveryHost?.destroy();deliveryHost=undefined;
  setView('world');cancelRun();activityController?.destroy();activityController=undefined;
  openDialog('<div class="route-loading"><h2>Opening the lantern round…</h2></div>','minigame-dialog activity-dialog');
  const generation=miniGameLoading,owner=api.selfId;
  try{
    const [courseModule,{loadMiniGame,loadMiniGameExercises},{createMiniGameHost}]=await Promise.all([loadCourse(),import('./minigames'),import('./minigames/host')]);
    const [game,authoredExercises]=await Promise.all([loadMiniGame(id),loadMiniGameExercises(id)]),dialog=document.querySelector<HTMLDialogElement>('#dialog')!;
    if(generation!==miniGameLoading||!dialog.open||owner!==api.selfId)return;
    dialog.innerHTML=`<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close'))}">${icon('close')}</button><div id="minigame-root"></div>`;
    const sceneExercises=quests.flatMap(quest=>quest.exercises.map(exercise=>({...exercise,level:quest.level,kind:'writing' as const,unitId:quest.id,wordIds:courseModule.courseContextWordIds[exercise.id]??[]})));
    miniGameHost=createMiniGameHost({api,gameId:id,lexicon:courseModule.courseLexicon,exercises:[...courseModule.courseExercises,...sceneExercises,...authoredExercises],progress:()=>progress,
      onProgress:value=>{if(owner===api.selfId){acceptProgress(value);updateProgress();}},onEnd:summary=>{if(summary.attempts)toast(`${summary.correct} / ${summary.attempts} answers remembered.`);},
      playerName:profile.name,silent:silentMode,muted,reducedMotion:worldMotion==='reduced'||worldMotion==='auto'&&matchMedia('(prefers-reduced-motion: reduce)').matches,narration:active=>world.setNarrationActive(active)});
    miniGameController=game;
    const fixedPool=questId?syllabus.quests.find(quest=>quest.questId===questId)?.wordIds:undefined;
    game.mount(document.querySelector<HTMLElement>('#minigame-root')!,miniGameHost,{level:gameLevel,currentLevel:level,seed:crypto.getRandomValues(new Uint32Array(1))[0],fixedPool,backdrop:['workbench','lost-hour'].includes(id)?'/assets/minigames/workbench.webp':['seed-packets','17-59'].includes(id)?getMap('waldruh').previewAsset:interiorId?getInterior(interiorId).asset:getMap(mapId).previewAsset});
    if(document.hidden||document.querySelector<HTMLDialogElement>('#account-dialog')!.open)game.pause();
  }catch(error){if(generation===miniGameLoading){toast((error as Error).message,true);document.querySelector<HTMLDialogElement>('#dialog')!.close();}}
}
async function startWorldDelivery():Promise<void>{
  if(silentMode){toast('Turn off silent mode to hear Lina’s directions.');return;}
  if(interiorId){toast('Meet Lina outside for the courtyard delivery.');return;}
  const owner=api.selfId,startingMap=mapId;
  const [module,{WorldDeliveryRun},{createMiniGameHost}]=await Promise.all([loadCourse(),import('./minigames/delivery'),import('./minigames/host')]);
  if(owner!==api.selfId)return;
  deliveryController?.destroy();deliveryController=undefined;deliveryHost?.destroy();deliveryHost=undefined;
  const host=createMiniGameHost({api,gameId:'delivery-run',lexicon:module.courseLexicon,exercises:module.courseExercises,progress:()=>progress,onProgress:value=>{if(owner===api.selfId){acceptProgress(value);updateProgress();}},onEnd:summary=>toast(`${summary.correct} / ${summary.attempts} spoken directions remembered.`),playerName:profile.name,silent:silentMode,muted,reducedMotion:worldMotion==='reduced',narration:active=>world.setNarrationActive(active)});
  document.querySelector<HTMLDialogElement>('#dialog')!.close();setView('world');
  const controller=new WorldDeliveryRun(world,host,()=>{deliveryController=undefined;deliveryHost?.destroy();deliveryHost=undefined;syncWorldMode();},()=>mapId===startingMap&&!interiorId&&view==='world'&&!document.hidden&&connection==='online'&&!document.querySelector<HTMLDialogElement>('#account-dialog')!.open&&!document.querySelector<HTMLDialogElement>('#dialog')!.open,()=>syncWorldMode());
  if(!controller.mount(document.querySelector<HTMLElement>('#game-shell')!)){host.destroy();syncWorldMode();toast('Restore Lina’s direction words (links, rechts, oben and unten), then try a delivery outside.');return;}
  deliveryController=controller;deliveryHost=host;syncWorldMode();
}
async function startActivity(id: ActivityId, source?: {roomId:InteriorId; stationId:string}) {
  if (!activityInfo.some(game => game.id === id)) return;
  if (connection !== 'online') { toast(t('The town is reconnecting. Try the adventure again in a moment.'), true); return; }
  const room = source ? getInterior(source.roomId) : undefined;
  const gameCopy = room ? interiorGameCopy(room.id) : undefined;
  const venue = room && gameCopy ? { id:room.id, name:room.name, asset:room.asset, title:gameCopy.title, npcId:gameCopy.npcId, briefing:gameCopy.description } : undefined;
  setView('world'); run = undefined;
  activityController?.destroy(); activityController = undefined;
  openDialog(`<div class="route-loading"><h2>${t('Preparing your adventure…')}</h2></div>`, 'activity-dialog');
  const generation = ++activityLoading;
  try {
    activitiesPromise ??= import('./activities').then(module => { activities = module; return module; }).catch(error => { activitiesPromise = undefined; throw error; });
    const module = activities ?? await activitiesPromise;
    for (const job of module.activityAudioJobs ?? []) if (!audioPaths.has(job.text)) audioPaths.set(job.text, `/audio/${job.id}.mp3`);
    const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
    if (generation !== activityLoading || !dialog.open) return;
    dialog.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Leave activity'))}">${icon('close')}</button><div id="activity-root"></div>`;
    const regionLevel: Level = venue ? 'A1' : level;
    activityController = module.mountActivity(document.querySelector<HTMLElement>('#activity-root')!, {
      id, level: regionLevel, progress, sessionKey: venue ? `${api.selfId}:interior:${venue.id}` : api.selfId, venue,
      speak,
      onDelivery: destination => { world.showDeliveryArrival(destination.recipient); toast(`${destination.name} · ${destination.recipient}`); },
      onSceneVisible: (_exerciseId, context) => recordExposure(context),
      onClose: () => dialog.close(),
      onProgress: value => { acceptProgress(value); updateProgress(); },
      submit: async (exercise, answer, hinted, mode, context) => {
        const attemptId = context?.attemptId ?? crypto.randomUUID();
        const result = await api.request<import('./api').AttemptResult>('/attempt', {
          id: attemptId, itemId: exercise.itemId, exerciseId: exercise.id, answer,
          hinted, mode: mode ?? modeFor(exercise), activityId: id, runId: context?.runId, scenarioId: context?.scenarioId, boardState: context?.boardState, level: regionLevel,
        });
        acceptProgress(result.progress); updateProgress();
        return { ...result, attemptId };
      },
      complete: async context => {
        const result = await api.completeActivity({ id: context.runId, activityId: id, level: regionLevel, exerciseIds: context.exerciseIds, attemptIds: context.attemptIds });
        acceptProgress(result.progress); updateProgress(); playCue(true);
        const discovery = activityDiscoveries[`${id}:${regionLevel}`];
        if (discovery && result.xpAdded) toast(t('A discovery for your story journal: {title}', { title: localized(discovery.title) }));
        return result;
      },
    });
  } catch (error) {
    if (generation !== activityLoading) return;
    toast((error as Error).message || t('The adventure could not open.'), true);
    document.querySelector<HTMLDialogElement>('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close'))}">${icon('close')}</button><div class="route-loading"><h2>${t('A small detour.')}</h2><p>${t('Try the adventure again when the route is connected.')}</p><button class="primary-button" ${source ? `data-interior-activity="${e(source.stationId)}"` : `data-activity="${id}"`}>${t('Try again')}</button></div>`;
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
  el.innerHTML = `<div class="route-heading">${icon('book')}<div><div class="eyebrow">${t('WORDS BECOME POSSIBILITIES')}</div><h2>${t('Your routes through German.')}</h2><p>${t('Learn in short encounters, use the language in the world, then return when it is ready again. Vocabulary, grammar and connected texts have their own evidence.')}</p></div></div><div class="route-levels">${(['A1','A2','B1'] as const).map(l => `<button class="${l === courseLevel ? 'selected' : ''}" data-course-level="${l}" aria-pressed="${l === courseLevel}">${l}<small>${e(maps.find(map => map.level === l)!.name)}</small></button>`).join('')}</div><div class="route-summary"><span><strong>${words.filter(word => wordIntroduced(progress, word.id)).length} / ${words.length}</strong> ${t('words restored')}</span><span><strong>${grammar.length}</strong> ${t('grammar guides')}</span><span><strong>${completed} / ${units.length}</strong> ${t('routes completed')}</span></div><div class="route-tabs">${([['topics',t('Learning routes')],['grammar',t('Grammar guides')],['lexicon',t('Word atlas')]] as const).map(([id,title]) => `<button class="${courseTab === id ? 'selected' : ''}" data-course-tab="${id}" aria-pressed="${courseTab === id}">${e(title)}</button>`).join('')}</div><button class="text-button" data-action="course-sources">${e(t('Learning content & credits'))}</button><div id="course-content"></div>`;
  const content = document.querySelector('#course-content')!;
  if (courseTab === 'topics') {
    const pageCount = Math.max(1, Math.ceil(units.length / 24)); coursePage = Math.min(coursePage, pageCount - 1);
    content.innerHTML = `${todaysWordsCard()}<div class="route-unit-list">${units.slice(coursePage * 24, coursePage * 24 + 24).map(unit => { const done = progress.completedUnitIds?.includes(unit.id); const missing = done ? 0 : missingWordCount(unit.wordIds, progress); const practiced = unit.exerciseIds.filter(id => { const ex = course!.courseExerciseById.get(id); return ex && exerciseHasSuccess(ex); }).length; return `<button class="route-unit ${done ? 'found' : missing ? 'locked' : ''}" data-course-unit="${e(unit.id)}" ${missing ? 'disabled' : ''}>${icon(done ? 'check' : missing ? 'leaf' : 'scroll')}<span><small>${unit.level} · ${e(localized(unit.topic))}</small><strong>${e(localized(unit.title))}</strong><em>${e(missing ? (missing === 1 ? t('Opens after {count} more restored word', { count: missing }) : t('Opens after {count} more restored words', { count: missing })) : t('{done} / {total} encounters saved', { done: practiced, total: unit.exerciseIds.length }))}</em></span>${icon('chevron')}</button>`; }).join('')}</div>${pageCount > 1 ? `<div class="route-pagination"><button class="outline-button" data-course-page="${coursePage - 1}" ${coursePage === 0 ? 'disabled' : ''}>${t('Previous')}</button><span>${coursePage + 1} / ${pageCount}</span><button class="outline-button" data-course-page="${coursePage + 1}" ${coursePage === pageCount - 1 ? 'disabled' : ''}>${t('Next')}</button></div>` : ''}`;
  } else if (courseTab === 'grammar') {
    content.innerHTML = grammar.map(source => { const guide = localizedGrammar(source); const unit = units.find(unit => unit.grammarIds.includes(guide.id)); return `<article class="grammar-route" data-grammar-guide="${guide.id}"><small class="eyebrow">${guide.level} · ${t('YOUR LANGUAGE TOOLKIT')}</small><h3>${e(guide.title)}</h3><p>${e(guide.explanation)}</p>${guide.note ? `<p class="grammar-note"><strong>${e(t('For Turkish speakers'))}</strong> ${e(guide.note)}</p>` : ''}${guide.examples.map(example => `<blockquote>${e(example.german)} <button class="text-button" data-speak="${e(example.german)}" aria-label="${e(t('Listen to {text}', { text: example.german }))}">${icon('volume')}</button><small>${e(example.english)}</small></blockquote>`).join('')}${unit ? `<button class="primary-button" data-course-unit="${unit.id}">${t('Try it in a scene')} ${icon('arrow')}</button>` : ''}</article>`; }).join('');
  } else {
    content.innerHTML = `<label class="route-search">${icon('clue')}<input id="lexicon-search" type="search" placeholder="${e(t('Find a German word or English meaning…'))}" aria-label="${e(t('Search the word atlas'))}"/></label><p class="lexicon-status">${e(t('{restored} of {total} words at this level have returned to the Atlas; the rest arrive as you play.', { restored: words.filter(word => wordIntroduced(progress, word.id)).length, total: words.length }))}</p><p class="lexicon-status" id="lexicon-status"></p><div class="lexicon-list" id="lexicon-list"></div>`;
    bindLexiconSearch(words.filter(word => wordIntroduced(progress, word.id)));
  }
}
/** Restored words the learner has not yet recognised unaided: the daily loop between conversations. */
function todaysWordsCard(): string {
  if (!course) return '';
  const status = intakeStatus(progress), words = todaysWords(progress).map(id => course!.lexemeById.get(id)).filter((word): word is CourseLexeme => !!word);
  const next = status.paused === 'practise' ? t('New words wait until you have met these.') : status.paused === 'review' ? t('New words wait until your due words are reviewed.') : status.pending ? t('New words are returning now.') : status.remaining ? t('The next word returns in about {minutes} min.', { minutes: Math.max(1, Math.ceil(status.nextWordInSeconds / 60)) }) : t('Every word has returned.');
  return `<section class="todays-words">${icon('leaf')}<div><small>${e(t('TODAY’S WORDS'))} · ${e(t('{count} to meet', { count: words.length }))}</small><strong>${e(words.length ? t('Words the Atlas has restored for you') : t('You have met every restored word'))}</strong><p>${e(t('{count} words restored so far.', { count: status.introduced }))} ${e(next)}</p>${words.length ? `<div class="word-chips">${words.map(word => `<span lang="de">${e(word.article ? `${word.article} ${word.lemma}` : word.lemma)}</span>`).join('')}</div>` : ''}</div>${words.length ? `<button class="primary-button" data-action="todays-words">${t('Practise today’s words')} ${icon('arrow')}</button>` : ''}</section>`;
}
async function startTodaysWords() {
  const module = await loadCourse().catch(error => { toast(error.message, true); return undefined; });
  if (!module) return;
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  const ids = todaysWords(progress);
  // Meaning first, then the sound, then recall: every mode across today's words before the next mode begins.
  const queue = playablePractice((['recognition', 'listening', 'production'] as const).flatMap(mode => ids.flatMap(id => { const ex = module.courseExerciseById.get(`lex-${id}-${mode}`); return ex && !exerciseHasSuccess(ex) ? [ex] : []; }))).slice(0, 12);
  if (!queue.length) { toast(t('You have met every restored word. New words return as you play.')); return; }
  setView('world');
  run = { queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:false, label:t('Today’s words'), started:Date.now() };
  openDialog('', 'quest-dialog course-dialog'); renderExercise();
}
function lexemeCards(words: CourseModule['courseLexicon']): string {
  return words.map(word => {
    const memory = progress.words?.[word.id];
    const forms = word.forms?.length ? word.forms.slice(0, 4).map(localizedLexemeForm).join(' · ') : '';
    return `<article class="lexeme" data-lexeme="${e(word.id)}"><div class="lexeme-header"><span>${word.level} · ${e(localizedLexemePartOfSpeech(word.pos))}</span><button data-speak="${e(spokenWord(word))}" aria-label="${e(t('Listen to {text}', { text: spokenWord(word) }))}">${icon('volume')}</button></div><h3>${word.article ? `<small>${e(word.article)}</small> ` : ''}${e(word.article ? word.articleForm ?? word.lemma : word.lemma)}</h3><p>${e(lexemeMeaning(word))}</p>${word.plural ? `<small>${e(t('Plural: {plural}', { plural: word.plural }))}</small>` : ''}${forms ? `<small>${e(forms)}</small>` : ''}${memory ? `<div class="lexeme-evidence">${(['recognition','listening','production'] as const).map(mode => `<span class="${memory.evidence?.[mode]?.status === 'retained' ? 'retained' : ''}">${mode === 'recognition' ? t('Read') : mode === 'listening' ? t('Hear') : t('Recall')} · ${memory.evidence?.[mode]?.status === 'retained' ? t('retained') : memory.evidence?.[mode]?.correct ? t('growing') : t('new')}</span>`).join('')}</div>` : `<small>${t('A new word to discover')}</small>`}<button class="text-button" data-word-practice="${word.id}">${icon('leaf')} ${memory && Date.parse(memory.dueAt) > Date.now() ? t('Explore this word') : t('Practise this word')}</button></article>`;
  }).join('');
}
function bindLexiconSearch(words: CourseModule['courseLexicon']) {
  const render = (query = '') => {
    const matches = words.filter(word => lower(`${word.lemma} ${word.english} ${lexemeMeaning(word)} ${word.topic}`).includes(lower(query)));
    document.querySelector('#lexicon-list')!.innerHTML = lexemeCards(matches.slice(0, 36));
    document.querySelector('#lexicon-status')!.textContent = matches.length > 36 ? t('{count} words. Showing the first 36; search to find any word.', { count: matches.length }) : matches.length === 1 ? t('{count} word.', { count: matches.length }) : t('{count} words.', { count: matches.length });
    observeVisibleWords();
  };
  render();
  document.querySelector<HTMLInputElement>('#lexicon-search')!.oninput = event => render((event.target as HTMLInputElement).value);
}
function renderWordJournal(el: Element) {
  if (!course) { requestCourseRender(el); return; }
  const introduced = introducedSet();
  const seen = course.courseLexicon.filter(word => introduced.has(word.id) || progress.words?.[word.id]);
  const due = seen.filter(word => progress.words?.[word.id] && wordReadyForReview(progress.words[word.id]));
  const retained = seen.filter(word => progress.words?.[word.id]?.mastery === 'retained');
  el.innerHTML = `<div class="route-heading">${icon('leaf')}<div><h2>${t('Individual words')}</h2><p>${t('Seeing a word introduces it. Recognising, hearing and recalling it each build their own memory. Familiar words rest between encounters.')}</p></div></div><div class="route-tabs"><button class="selected" data-journal-tab="words">${t('Individual words')}</button><button data-journal-tab="phrases">${t('Story expressions')}</button></div><div class="route-summary"><span><strong>${seen.length}</strong> ${t('words restored')}</span><span><strong>${retained.length}</strong> ${t('retained in all three skills')}</span><span><strong>${due.length}</strong> ${t('ready to revisit')}</span></div><button class="primary-button" data-action="review">${icon('refresh')} ${due.length ? t('Take a short recall walk') : t('Check ready practice')}</button>${todaysWordsCard()}${miniGameHostLinks("re-ink")}${miniGameBoard(true)}${seen.length ? `<label class="route-search"><input id="lexicon-search" type="search" placeholder="${e(t('Find a word or meaning…'))}" aria-label="${e(t('Search your individual words'))}"/></label><p class="lexicon-status" id="lexicon-status"></p><div class="lexicon-list" id="lexicon-list"></div>` : `<div class="route-loading"><h3>${t('Your first word is waiting.')}</h3><p>${t('Use German in the world or follow a learning route to begin.')}</p><button class="primary-button" data-view="course">${t('Open your learning routes')}</button></div>`}`;
  if (seen.length) bindLexiconSearch(seen);
}
async function startWordPractice(id: string) {
  const module = await loadCourse().catch(error => { toast(error.message, true); return undefined; });
  const word = module?.lexemeById.get(id); if (!word || !module) return;
  if (wordScheduled(id) && !wordIntroduced(progress, id)) { toast(t('This word has not returned to the Atlas yet. Keep playing and it will.')); return; }
  const memory = progress.words?.[id];
  if (memory?.mastery === 'retained' && Date.parse(memory.dueAt) > Date.now()) {
    openDialog(`<div class="course-intro"><div class="eyebrow">${t('A FAMILIAR WORD, AT REST')}</div><h2>${e(spokenWord(word))}</h2><p>${e(lexemeMeaning(word))}</p><p>${e(t('This word is resting. Its next encounter is {date}.', { date: new Date(memory.dueAt).toLocaleDateString(baseLanguage(), {month:'short',day:'numeric'}) }))}</p><button class="primary-button" data-speak="${e(spokenWord(word))}">${icon('volume')} ${t('Hear this word')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')}</button></div>`, 'course-dialog'); return;
  }
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  const queue = playablePractice(module.courseExercises).filter(ex => ex.itemId === `word-${id}` && (!exerciseHasSuccess(ex) || Date.parse(memory?.evidence?.[modeFor(ex)]?.dueAt ?? '') <= Date.now()));
  if (!queue.length && !writingReady()) { showOpeningPracticeNotice(); return; }
  if (!queue.length) { toast(silentMode ? t('No reading or writing practice is ready for this word. Listening is skipped in silent mode.') : t('This word is resting. There is a new adventure waiting.')); return; }
  setView('world'); run = { queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:true, label:t('A word for your journey · {word}', { word: word.lemma }), started:Date.now() };
  openDialog('', 'quest-dialog'); renderExercise();
}
async function startCourseUnit(id: string) {
  const module = await loadCourse().catch(error => { toast(error.message, true); return undefined; });
  const unit = module?.courseUnits.find(item => item.id === id); if (!module || !unit) return;
  const missing = progress.completedUnitIds?.includes(unit.id) ? 0 : missingWordCount(unit.wordIds, progress);
  if (missing) { toast(missing === 1 ? t('Opens after {count} more restored word', { count: missing }) : t('Opens after {count} more restored words', { count: missing })); return; }
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  const due = new Set(dueItems(progress));
  const pending = unit.exerciseIds.map(id => module.courseExerciseById.get(id)).filter((ex): ex is NonNullable<typeof ex> => !!ex && !exerciseHasSuccess(ex));
  const revisits = unit.exerciseIds.map(id => module.courseExerciseById.get(id)).filter((ex): ex is NonNullable<typeof ex> => !!ex && due.has(ex.itemId) && (!ex.targetWordId || !progress.words[ex.targetWordId]?.evidence?.[modeFor(ex)]?.dueAt || Date.parse(progress.words[ex.targetWordId].evidence[modeFor(ex)].dueAt) <= Date.now()));
  const queue = playablePractice(pending.length ? pending : revisits).slice(0, 8);
  if (!queue.length && !writingReady() && pending.some(ex => ex.mode === 'sentence' || ex.mode === 'type')) { showOpeningPracticeNotice(); return; }
  if (!queue.length && pending.length) { toast(t('This route has listening practice left. Turn off silent mode when you are ready to listen.')); return; }
  setView('world');
  run = { unitId:id, queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:false, label:localized(unit.title), started:Date.now() };
  const guides = module.courseGrammar.filter(guide => unit.grammarIds.includes(guide.id)).map(guide => localizedGrammar(guide));
  const unitTitle = localized(unit.title), unitSummary = localized(unit.summary);
  openDialog(`<div class="quest-intro"><div class="eyebrow">${unit.level} · ${e(localized(unit.topic))}</div><h2>${e(unitTitle)}</h2><div class="course-intro-reference"><p class="intro-story">${e(unitSummary)}</p>${guides.map(guide => `<div class="course-intro-examples">${guide.title !== unitTitle ? `<strong>${e(guide.title)}</strong>` : ''}${guide.explanation !== unitSummary ? `<p>${e(guide.explanation)}</p>` : ''}${guide.examples.slice(0,2).map(example => `<p><b>${e(example.german)}</b><br/>${e(example.english)}</p>`).join('')}</div>`).join('')}</div><div class="intro-details"><span>${icon('book')} ${queue.length === 1 ? t('{count} encounter in this short visit', { count: queue.length }) : t('{count} encounters in this short visit', { count: queue.length })}</span><span>${t('{count} remaining on this route', { count: pending.length })}</span></div><button class="primary-button" data-action="begin-exercises">${queue.length ? t('Follow this learning route') : t('Save this completed route')} ${icon('arrow')}</button><small>${t('Already saved answers stay with you. You can leave at any time.')}</small></div>`, 'quest-dialog course-dialog');
}
async function startAdaptiveReview() {
  const module = await loadCourse().catch(() => undefined);
  if (!module) { startReview(); return; }
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  const queue = reviewExercises(progress, module.courseExercises, quests.flatMap(q => q.exercises), Date.now(), silentMode, writingReady());
  if (!queue.length && !writingReady()) { showOpeningPracticeNotice(); return; }
  if (!queue.length) { toast(silentMode ? t('No reading or writing reviews are ready. Listening is skipped in silent mode.') : t('Your familiar words are resting. Follow a new route or play an adventure.')); return; }
  setView('world'); run = { queue,index:0,correct:0,targetCount:queue.length,hinted:false,audioHeard:false,answered:false,answer:'',tokenOrder:[],review:true,label:t('A short recall walk'),started:Date.now() };
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
  return `<section class="field-notes"><div class="eyebrow">${t('WHAT YOUR ACTIONS UNCOVERED')}</div><h3>${t('Witnesses from the road')}</h3>${discoveries.map(clue => `<article class="grammar-route"><small class="eyebrow">${clue.level} · ${e(maps.find(map => map.level === clue.level)!.name)}</small><h3>${e(localized(clue.title))}</h3><p>${renderNarrative(clue.text)}</p><blockquote>${renderNarrative(clue.lead)}</blockquote></article>`).join('')}</section>`;
}
function renderOther() {
  exposureObserver?.disconnect();
  if (view !== 'settings') { unbindOptions?.(); unbindOptions = undefined; }
  const el = document.querySelector('#other-view')!;
  if (view === 'activities') { renderActivities(el); return; }
  if (view === 'course') { renderCourse(el); return; }
  if (view === 'journal' && journalTab === 'words') { renderWordJournal(el); return; }
  if ((view === 'menu' || view === 'quests') && getExpedition(mapId)) { el.innerHTML = expeditionOverview(); return; }
  if (view === 'menu') {
    const act = actFor(mapId), clueCount = discoveredClues(progress.completedQuestIds).length;
    const quest = currentQuest(), npc = npcs.find(item => item.id === quest.npcId)!;
    const nextAct = storyActs[storyActs.findIndex(item => item.mapId === mapId) + 1];
    el.innerHTML = adventureHome({ act, region: getMap(mapId).name, regionArt: getMap(mapId).previewAsset, quest, npc, portrait: portrait(npc.id), completed: completedAtLevel(level), total: quests.filter(item => item.level === level).length, nextRegion: nextAct ? getMap(nextAct.mapId).name : undefined, clueCount, dueCount: dueItems(progress).length }) + `<div class="promise-card"><h3>${e(progress.story?.promise?.title ? localized(progress.story.promise.title) : t('Your German, at your pace'))}</h3><p>${progress.story?.promise ? `${t('{done} / {total} connections today', { done: Math.min(progress.story.promise.correctAnswers, progress.story.promise.target), total: progress.story.promise.target })}${progress.story.promise.completed ? ` · ${t('lantern lit')}` : ''}` : t('Choose the support that helps you read the town.')}</p>${placementCTAMarkup()}</div>` + lanternRewardsMarkup(progress) + placesSection();
  } else if (view === 'quests') {
    const act = actFor(mapId), chapterQuests = quests.filter(q => q.level === level);
    el.innerHTML = `<div class="quest-log-heading"><span class="eyebrow">${e(upper(t('Act {number}', { number: act.number })))} · ${e(getMap(mapId).name.toUpperCase())}</span><h2>${e(localized(act.title))}</h2><p>${renderNarrative(act.goal)}</p></div>${questGraph(currentQuest().id) ? questObjectivesMarkup(questGraph(currentQuest().id)!,progress) : ''}<div class="quest-log-list">${chapterQuests.map((q, i) => { const done = progress.completedQuestIds.includes(q.id), next = q.id === currentQuest().id && !done; return `<button class="quest-log-entry ${done ? 'found' : next ? 'next' : ''}" data-follow-quest="${q.id}" ${questAvailable(q.id, progress) ? '' : 'disabled'}><span class="quest-log-number">${done ? icon('check') : String(i + 1).padStart(2, '0')}</span>${portrait(q.npcId)}<span class="quest-log-copy"><small>${done ? t('DISCOVERED') : next ? t('YOUR NEXT LEAD') : t('A STORY TO FIND')} · ${e(localized(q.location))}</small><strong>${e(localized(q.title))}</strong><span>${e(localized(done ? clueFor(q.id)?.title ?? q.subtitle : q.subtitle))}</span></span>${icon('chevron')}</button>`; }).join('')}</div><button class="primary-button" data-action="next-objective">${icon('flag')} ${completedAtLevel(level) === 6 ? t('Follow the next route') : t('Find my next lead')}</button><div class="quest-region-strip">${maps.filter(map => !getExpedition(map.id) || routeUnlocked(map.id, progress.completedQuestIds)).map(map => `<button ${routeUnlocked(map.id, progress.completedQuestIds) ? '' : 'disabled'} data-travel="${map.id}" class="${map.id === mapId ? 'here' : ''}"><span>${map.level}</span>${e(map.name)}${icon(map.id === mapId ? 'pin' : 'arrow')}</button>`).join('')}</div>`;
  } else if (view === 'story') {
    const found = discoveredClues(progress.completedQuestIds), inspected = readSeen('objects');
    const introduction = found.length ? renderNarrative([{ german: `${found.length} ${found.length === 1 ? 'Hinweis bleibt' : 'Hinweise bleiben'} in Erinnerung.`, english: found.length === 1 ? t('{count} clue remembered.', { count: found.length }) : t('{count} clues remembered.', { count: found.length }), localized: true }, journalNarratives.helping]) : renderNarrative(journalNarratives.firstPage);
    el.innerHTML = evidenceBoard(progress) + `<div class="story-journal-heading"><div class="eyebrow">${e(t('EVIDENCE, SECRETS & SMALL PROMISES'))}</div><h2>${t('The missing routes')}</h2>${translationHelp()}<p>${introduction}</p></div><div class="story-acts">${storyActs.map(act => { const qs = quests.filter(q => q.level === act.level), clues = found.filter(clue => qs.some(q => q.id === clue.questId)); return `<section class="story-act"><header><span class="act-number">${act.number}</span><div><small>${act.level} · ${e(getMap(act.mapId).name)}</small><h3>${e(localized(act.title))}</h3></div><span class="clue-count">${clues.length} / 6</span></header>${clues.length ? `<div class="clue-pages">${clues.map(clue => `<article class="clue-page"><span>${icon('lantern')}</span><div><h4>${e(localized(clue.title))}</h4><p>${renderNarrative(clue.text)}</p>${eliseLetter(clue.letter, clue.questId)}<small>${renderNarrative(clue.lead)}</small></div></article>`).join('')}</div>` : `<p class="undiscovered-clue">${renderNarrative(journalNarratives.waitingPage)}</p>`}${clues.length === 6 ? `<blockquote class="act-cliffhanger">${renderNarrative(act.cliffhanger)}</blockquote>` : ''}</section>`; }).join('')}</div>${inspected.length ? `<section class="field-notes"><div class="eyebrow">${t('THINGS YOU NOTICED')}</div><h3>${t('Notes from the road')}</h3>${maps.flatMap(map => map.objects.filter(object => inspected.includes(object.id)).map(object => `<button data-inspect-object="${object.id}" data-object-map="${map.id}">${icon('pin')}<span><strong>${e(object.label)}</strong><small>${e(map.name)}</small></span>${icon('chevron')}</button>`)).join('')}</section>` : ''}${earnedActivityJournal()}${routeUnlocked('windplain', progress.completedQuestIds) ? expeditionNotebook(progress.story?.expeditionPlans ?? {}) : ''}<button class="primary-button" data-action="next-objective">${t('Follow the next lead')} ${icon('arrow')}</button>`;
  } else if (view === 'atlas') {
    const current = getMap(mapId);
    el.innerHTML = `<div class="atlas-heading"><h2>${t('Region atlas')}</h2><p>${t('The missing-route story begins in Lindenhafen, Waldruh and Nebelstadt. Follow the clues to restore the next route. Neighborhood games open after the three-town story.')}</p></div><div class="region-cards">${maps.filter(map => !getExpedition(map.id) || routeUnlocked(map.id, progress.completedQuestIds)).map(map => {
      const unlocked = routeUnlocked(map.id, progress.completedQuestIds), expedition = getExpedition(map.id), act = expedition ? undefined : actFor(map.id);
      const status = expedition ? expeditionGameStatus(map.id, level, progress.story?.expeditionPlans ?? {}) : undefined;
      const done = expedition ? expedition.encounters.filter(encounter => expeditionEncounterResult(encounter.id)?.correct).length : completedAtLevel(map.level);
      return `<article class="region-card ${map.id === mapId ? 'current' : ''}"><div class="region-card-art" style="background-image:url('${map.previewAsset}')"><span>${expedition ? `${t('EXPEDITION')} · A1 / A2 / B1` : `${e(upper(t('Act {number}', { number: act!.number })))} · ${map.level}`}</span>${map.id === mapId ? `<b>${t('YOU ARE HERE')}</b>` : ''}</div><div class="region-card-copy"><h3>${e(map.name)}</h3><small>${e(localized(map.subtitle))}</small><p>${expedition ? e(expedition.description) : renderNarrative(act!.premise)}</p><div class="region-card-meta"><span>${expedition ? t('{done} / {total} encounters', { done, total: expedition.encounters.length }) : t('{done} / {total} stories', { done, total: 6 })}</span><span>${expedition ? status === 'completed' ? t('Agreement remembered') : t('{count} neighbors · local game', { count: expedition.npcs.length }) : t('Story route')}</span></div><button class="${map.id === mapId ? 'outline-button' : 'primary-button'}" ${map.id === mapId ? 'data-view="world"' : `data-travel="${map.id}" ${unlocked ? '' : 'disabled'}`}>${map.id === mapId ? t('Return to exploring') : ` ${unlocked ? e(t('Travel to {place}', { place: map.name })) : t('Find the next clue first')}`} ${icon('arrow')}</button></div></article>`;
    }).join('')}</div>${placesSection()}<section class="region-local-map"><div><span class="eyebrow">${e(t('NEARBY IN {place}', { place: current.name.toUpperCase() }))}</span><h3>${e(t('People & little things'))}</h3><p>${t('Choose a marker to walk there.')}</p></div><div class="atlas-map" style="aspect-ratio:${current.width}/${current.height}"><img src="${current.previewAsset}" alt="${e(t('Painted map of {place}', { place: current.name }))}"/>${current.npcs.map(point => { const npc = npcs.find(item => item.id === point.id) ?? getExpeditionNpc(point.id); return npc ? `<button class="atlas-map-pin" data-waypoint="${point.id}" style="left:${point.x * 100}%;top:${point.y * 100}%" aria-label="${e(t('Walk to {name}', { name: localizedName(npc.name) }))}">${portrait(point.id)}<span>${e(localizedName(npc.name))}</span></button>` : ''; }).join('')}${current.objects.map(object => `<button class="object-map-pin" data-focus-object="${object.id}" style="left:${object.x * 100}%;top:${object.y * 100}%" aria-label="${e(t('Walk to {name}', { name: object.label }))}">${icon(object.kind === 'garden' ? 'leaf' : object.kind === 'clock' ? 'clock' : 'lantern')}</button>`).join('')}<span class="atlas-map-compass">${icon('compass')} N</span></div></section>`;
  } else if (view === 'journal') {
    const learned = vocabulary.filter(v => progress.items[v.id]);
    const due = dueItems(progress);
    const accuracy = progress.attempts ? Math.round(progress.correctAttempts / progress.attempts * 100) : 0;
    el.innerHTML = `<div class="route-tabs"><button data-journal-tab="words">${t('Individual words')}</button><button class="selected" data-journal-tab="phrases">${t('Story expressions')}</button></div><div class="page-heading"><div><h2>${t('Story expressions')}</h2></div><button class="primary-button journal-review" data-action="review">${icon('refresh')} ${due.length ? (Math.min(due.length, 8) === 1 ? t('Practice {count} ready word', { count: 1 }) : t('Practice {count} ready words', { count: Math.min(due.length, 8) })) : t('Words are resting')}</button></div><div class="journal-stats"><div>${icon('book')}<strong>${learned.length}</strong><span>${t('Expressions encountered')}</span></div><div>${icon('leaf')}<strong>${due.length}</strong><span>${t('Ready to revisit')}</span></div><div>${icon('check')}<strong>${accuracy}%</strong><span>${t('Answers correct')}</span></div><div>${icon('sparkles')}<strong>${progress.xp}</strong><span>${t('Adventure XP')}</span></div></div><div class="journal-toolbar"><label>${icon('book')}<input id="word-search" placeholder="${e(t('Find a word or meaning…'))}" aria-label="${e(t('Search your word journal'))}"/></label><span>${t('Recognition, listening, and production grow separately.')}</span></div><div class="word-grid" id="word-grid">${learned.length ? learned.map(v => { const m = progress.items[v.id], meaning = localized({ german: v.german, english: v.english }); return `<article class="word-card" data-word="${e(lower(`${v.german} ${v.english} ${meaning}`))}"><div><span class="word-level">${v.level}</span><button class="icon-button" data-speak="${e(v.german)}" aria-label="${e(t('Listen to {text}', { text: v.german }))}">${icon('volume')}</button></div><h3>${e(v.german)}</h3><p>${e(meaning)}</p><small>${e(v.example)}</small><div class="memory-row"><span>${icon('leaf')} ${memoryLabel(m.repetitions, m.stabilityDays)}</span><span>${Date.parse(m.dueAt) <= Date.now() ? t('Ready for a new encounter') : t('Next encounter {date}', { date: new Date(m.dueAt).toLocaleDateString(baseLanguage(), { month: 'short', day: 'numeric' }) })}</span></div></article>`; }).join('') : `<div class="empty-state">${icon('book')}<h2>${t('Your story is still being written.')}</h2><p>${t('The words you meet on your adventures will find a home here.')}</p><button class="primary-button" data-view="world">${t('Meet Lindenhafen')} ${icon('arrow')}</button></div>`}</div>`;
    el.insertAdjacentHTML('beforeend', optionalStoryPractice(progress));
    document.querySelector<HTMLInputElement>('#word-search')?.addEventListener('input', event => {
      const query = lower((event.target as HTMLInputElement).value);
      document.querySelectorAll<HTMLElement>('[data-word]').forEach(card => { card.hidden = !card.dataset.word!.includes(query); });
    });
  } else if (view === 'character') {
    el.innerHTML = lanternRewardsMarkup(progress) + `<section class="character-page"><div class="character-illustration"><h2>${e(profile.name)}</h2><p>${e(t('{title} of the Atlas', { title: titleLabel(lanternRewards(progress).title) }))}</p><span class="character-xp">${icon('sparkles')} ${t('{xp} adventure XP', { xp: progress.xp })}</span></div><div class="character-options">${profileForm()}<p class="honest-note">${t('Your character appears in town and is visible to other players.')}</p></div></section>`;
    bindProfileForm();
  } else if (view === 'settings') {
    renderOptions(el as HTMLElement);
  }
}
function optionRows(): OptionRow[] {
  const onOff = [{ value: 'on', label: t('On') }, { value: 'off', label: t('Off') }];
  if (optionsTab === 'audio') return [
    { kind: 'choice', id: 'sound', label: t('Interface sounds'), help: t('Menu sounds and small musical cues after your answers.'), value: muted ? 'off' : 'on', choices: onOff },
    { kind: 'choice', id: 'silent', label: t('Silent mode'), help: t('Automatically skip listening exercises and mute audio. Quests finish after reading and writing; listening stays available for later. Saved on this device.'), value: silentMode ? 'on' : 'off', choices: onOff },
    { kind: 'choice', id: 'speech-rate', label: t('Listening pace'), help: t('German audio is included. Choose a comfortable pace and replay it whenever you like.'), value: String(speechRate), choices: [{ value: '0.65', label: t('A little slower') }, { value: '0.82', label: t('Easy pace') }, { value: '1', label: t('Natural pace') }] },
  ];
  if (optionsTab === 'display') {
    const clock = world.getWorldTime();
    return [
      { kind: 'choice', id: 'world-motion', label: t('World motion'), help: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? t('Choose lively town scenery or a calmer world. Your device currently requests reduced motion.') : t('Choose lively town scenery or a calmer world. Your device currently requests full motion.'), value: worldMotion, choices: [{ value: 'auto', label: t('Follow device preference') }, { value: 'full', label: t('Full world animation') }, { value: 'reduced', label: t('Calm, still scenery') }] },
      { kind: 'choice', id: 'time-mode', label: t('Time of day'), help: t('Watch warm daylight turn into moonlit streets. Let the day pass, follow your local clock, or choose a moment.'), value: worldTimeMode, choices: [{ value: 'cycle', label: t('Slow day and night cycle') }, { value: 'local', label: t('Real local time') }, { value: 'manual', label: t('Choose a time') }] },
      { kind: 'scale', id: 'world-hour', label: t('Time to watch'), help: t('Changing the hour switches the world clock to the time you choose.'), value: Math.floor(clock.hour), min: 0, max: 23, step: 1, display: `${clock.label} · ${upper(clock.period === 'day' ? t('Day') : t('Night'))}`, valueId: 'world-hour-label' },
      { kind: 'choice', id: 'fullscreen', label: t('Full screen'), help: t('Let the world fill the whole screen.'), value: document.fullscreenElement ? 'on' : 'off', choices: onOff },
      { kind: 'action', id: 'screen-filters', label: t('Screen filters'), help: t('Experiment with a softer world or an old television finish. Your choices are saved with your adventure.'), action: 'screen-filters', button: t('Try filters in the world'), glyph: 'sparkles' },
      { kind: 'action', id: 'watch-world', label: t('Watch the world'), help: t('Hide the interface and watch the town go about its day. Press Escape to return.'), action: 'watch-world', button: t('Watch the world'), glyph: 'compass' },
    ];
  }
  if (optionsTab === 'language') return [
    { kind: 'choice', id: 'base-language', label: t('Support language'), help: `${t('Meanings, hints, explanations and menus appear in this language. The German, its audio and how answers are checked stay the same.')}${baseLanguage() === 'tr' ? ` ${t('Turkish text is machine-written and awaits native-speaker review.')}` : ''}`, value: baseLanguage(), choices: (['en', 'tr'] as const).map(language => ({ value: language, label: baseLanguageNames[language] })) },
    { kind: 'custom', id: 'chapter', label: t('Your learning chapter'), help: t('Routes open when you restore their names. Your learning scaffold follows the route.'), html: `<div class="level-switch settings-levels">${(['A1', 'A2', 'B1'] as const).map(l => `<button data-level="${l}" ${routeUnlocked(maps.find(map => map.level === l)!.id, progress.completedQuestIds) ? '' : 'disabled'} class="${l === level ? 'selected' : ''}">${l}</button>`).join('')}</div>` },
    { kind: 'action', id: 'placement', label: t('Practice starting point'), help: t('A two-minute sample recommends useful language support.'), action: 'placement', button: t('Find my comfortable German level'), glyph: 'compass' },
    { kind: 'action', id: 'course-sources', label: t('Learning content & credits'), help: t('Where the course material comes from.'), action: 'course-sources', button: t('Open'), glyph: 'book' },
  ];
  return [
    { kind: 'custom', id: 'account', label: account.registered ? t('Your adventure is linked') : t('Take your adventure with you'), help: account.registered ? t('Playing as {name}. Log in on another device with {email} and your password.', { name: profile.name, email: account.email }) : t('Playing as {name}. Add an email and password to continue on another device.', { name: profile.name }), html: `<div class="option-buttons">${account.registered ? '' : `<button class="option-action" data-action="save-account">${e(t('Add email & password'))}</button>`}<button class="option-action" data-action="login-account">${t('Log in to a saved adventure')}</button><button class="option-action" data-action="logout-account">${t('Log out')}</button></div>` },
  ];
}
function renderOptions(el: HTMLElement) {
  unbindOptions?.();
  const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.option : undefined, scroll = el.scrollTop;
  const rows = optionRows();
  let extra = '';
  if (optionsTab === 'language' && baseLanguage() === 'tr') extra = `<p class="honest-note">${t('Turkish support covers the story and all A1, A2 and B1 course exercises.')} ${t('Coverage: story {story}%, interface {ui}%, course words {words}%, course tasks {tasks}%.', turkishCoverage)}</p>`;
  if (optionsTab === 'account') {
    const performance = world.getWorldStats();
    extra = saveSlotsMarkup(storySaves) + `<div class="connection-info">${icon('users')} ${connection === 'online' ? t('Your route is connected. Your progress is saved on the server.') : connection === 'incompatible' ? t('The world has changed. Reload this page to continue.') : connection === 'replaced' ? t('Your character is active in another tab. Continue there, or close it and reload this page.') : t('The route is reconnecting. Keep this tab open.')}</div><details class="world-performance"><summary>${t('World performance')}</summary><p>${performance.fps ? t('{fps} frames per second · average {frame} ms · 95th percentile {p95} ms', { fps: performance.fps, frame: performance.frameMs, p95: performance.p95FrameMs }) : t('The world is warming up.')}</p><small>${t('{residents} residents · {objects} objects · {animated} animated details', { residents: performance.residents, objects: performance.objects, animated: performance.animated })}</small></details>`;
  }
  el.innerHTML = optionsMarkup(optionsTab, rows, extra);
  unbindOptions = bindOptionRows(el, rows, (row, value) => changeOption(row.id, String(value)), kind => uiSounds.play(kind));
  if (focused) { el.querySelector<HTMLElement>(`[data-option="${focused}"]`)?.focus({ preventScroll: true }); el.scrollTop = scroll; }
}
function changeOption(id: string, value: string) {
  switch (id) {
    case 'sound': muted = value === 'off'; localStorage.setItem('atlas.muted', String(muted)); world.setAudioPreferences({ silent: silentMode, muted }); if (!muted) playCue(true); break;
    case 'silent': if (attemptBusy) { toast(t('Your answer is saving. Try again in a moment.')); return; } setSilentMode(value === 'on'); return;
    case 'speech-rate': speechRate = Number(value); localStorage.setItem('atlas.speechRate', String(speechRate)); break;
    case 'world-motion': worldMotion = value as WorldMotion; localStorage.setItem('atlas.worldMotion', worldMotion); world.setMotionPreference(worldMotion); break;
    case 'time-mode': worldTimeMode = value as WorldTimeMode; localStorage.setItem('atlas.worldTimeMode', worldTimeMode); world.setTimePreference({ mode: worldTimeMode, hour: manualWorldHour }); break;
    case 'world-hour':
      manualWorldHour = Number(value); worldTimeMode = 'manual';
      localStorage.setItem('atlas.worldHour', String(manualWorldHour)); localStorage.setItem('atlas.worldTimeMode', worldTimeMode);
      world.setTimePreference({ mode: worldTimeMode, hour: manualWorldHour }); break;
    case 'fullscreen':
      if (value === 'off') void document.exitFullscreen?.().catch(() => undefined).finally(() => { if (view === 'settings') renderOther(); });
      else void document.documentElement.requestFullscreen?.().catch(() => toast(t('Full screen isn’t available here.'))).finally(() => { if (view === 'settings') renderOther(); });
      return;
    case 'base-language': void changeBaseLanguage(value as BaseLanguage); return;
  }
  if (view === 'settings') renderOther();
}

async function startPlacement() {
  if (!writingReady()) { showOpeningPracticeNotice(true); return; }
  openDialog(`<div id="placement-root"><p>${t('Opening your German sample…')}</p></div>`, 'activity-dialog');
  const host = document.querySelector<HTMLElement>('#placement-root')!;
  try { placementController = await mountOptionalPlacement(host, { api, progress, speak, onClose: () => document.querySelector<HTMLDialogElement>('#dialog')!.close(), onComplete: (result, value) => { acceptProgress(value); courseLevel = result.level; localStorage.setItem('atlas.placement', JSON.stringify(result)); updateProgress(); } }); if (!host.isConnected) { placementController.destroy(); placementController = undefined; } } catch (error) { toast((error as Error).message, true); }
}
function openDialog(html: string, className = '', speakerId?:string) {
  deliveryController?.destroy();deliveryController=undefined;deliveryHost?.destroy();deliveryHost=undefined;
  miniGameLoading++; miniGameController?.destroy(); miniGameController=undefined; miniGameHost?.destroy(); miniGameHost=undefined;
  if(!questController?.isOpen)world.setConversationTarget(speakerId);
  screenFilterControls?.close(false);
  const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
  dialog.className = `dialog ${className}`;
  dialog.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close'))}">${icon('close')}</button>${html}`;
  if (className === 'npc-dialog') { dialog.setAttribute('aria-labelledby', 'encounter-title'); dialog.removeAttribute('aria-label'); }
  else { dialog.removeAttribute('aria-labelledby'); dialog.setAttribute('aria-label', t('Adventure encounter')); }
  document.querySelector('#game-shell')!.classList.add('encounter-open');
  if (!dialog.open) dialog.showModal();
  syncWorldMode();
  dialog.scrollTop = 0;
}
function showNpc(id: string) {
  if(deliveryController)return;
  if (getExpeditionNpc(id)) { showExpeditionEncounter(id); return; }
  const npc = npcs.find(n => n.id === id);
  if (!npc) return;
  const available = quests.find(q => q.npcId === id && q.level === level && !progress.completedQuestIds.includes(q.id) && questUnlocked(q.id, progress.completedQuestIds));
  if (available) {
    void questController?.open(available.id); return;
  }
  recordExposure({npcId:id});
  questController?.greet(npc, level);
}
function startQuest(id: string) {
  const quest = quests.find(q => q.id === id); if (!quest) return;
  if (!questAvailable(id, progress)) { toast(questLockReason(id, progress)); return; }
  const region = maps.find(map => map.level === quest.level)!;
  if (mapId !== region.id) { travelMap(region.id, { kind: 'follow', questId: id }); return; }
  document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView('world');
  if (interiorId) world.leaveInterior();
  world.focusNpc(quest.npcId);
}
function startQuestPractice(id: string) {
  const quest = quests.find(q => q.id === id);
  if (!quest) return;
  if (!questAvailable(id, progress)) { toast(questUnlocked(id, progress.completedQuestIds) ? questLockReason(id, progress) : t('Find the scene before practising its expressions.')); return; }
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  setView('world');
  const due = new Set(dueItems(progress));
  const queue = playablePractice(quest.exercises).filter(ex => !hasSuccessfulEncounter(ex.itemId) || due.has(ex.itemId));
  if (!queue.length && !writingReady() && quest.exercises.some(ex => (ex.mode === 'sentence' || ex.mode === 'type') && !hasSuccessfulEncounter(ex.itemId))) { showOpeningPracticeNotice(); return; }
  run = { quest, queue, index: 0, correct: 0, targetCount: queue.length, hinted: false, audioHeard: false, answered: false, answer: '', tokenOrder: [], review: false, started: Date.now(), skipListening: silentMode };
  const npc = npcs.find(n => n.id === quest.npcId) ?? npcs[0];
  openDialog(`<div class="quest-intro">${portrait(npc.id, 'large-portrait')}<div class="eyebrow">${quest.level} · ${e(localized(quest.location))}</div><h2>${e(localized(quest.title))}</h2>${translationHelp()}<p class="intro-story">${renderNarrative(quest.story)}</p><div class="intro-details"><span>${icon('book')} ${queue.length ? (queue.length === 1 ? t('{count} expression to practise', { count: 1 }) : t('{count} expressions to practise', { count: queue.length })) : t('Your expressions are already saved')}</span><span>${icon('sparkles')} +${quest.reward} XP</span></div><button class="primary-button" data-action="begin-exercises">${queue.length ? t('Let the adventure begin') : t('Discover the next clue')} ${icon('arrow')}</button><small>${t('You can take a break at any time. Your answered words stay saved.')}</small></div>`, 'quest-dialog');
}
function startReview() {
  const ids = dueItems(progress).slice(0, 8);
  const queue = ids.flatMap(id => {
    const ex = playablePractice(quests.flatMap(q => q.exercises)).find(x => x.itemId === id);
    if (!ex) return [];
    return [{ ...ex, ...(ex.mode === 'sentence' ? { mode: 'type' as const, prompt: t('A familiar request, a new encounter. Write in German: {english}', { english: localizedExercise(ex).english }) } : {}) }];
  });
  if (!queue.length) { if (!writingReady()) showOpeningPracticeNotice(); else toast(t('Your familiar words are resting. There’s a new adventure waiting.')); return; }
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  setView('world');
  run = { queue, index: 0, correct: 0, targetCount: queue.length, hinted: false, audioHeard: false, answered: false, answer: '', tokenOrder: [], review: true, started: Date.now() };
  openDialog('', 'quest-dialog'); renderExercise();
}
function renderExercise() {
  exerciseInputCleanup?.();exerciseInputCleanup=undefined;if(exerciseChoiceTimer){clearTimeout(exerciseChoiceTimer);exerciseChoiceTimer=undefined;}pendingExerciseChoice=undefined;
  if (!run) return;
  if (silentMode) { skipListeningExercises(run); run.skipListening = true; }
  if (run.index >= run.queue.length) { void finishRun(); return; }
  const ex = run.queue[run.index];
  run.hinted = false; run.audioHeard = false; run.answered = false; run.answer = ''; run.tokenOrder = [];
  run.reviewAttempt?.cancel(); run.reviewAttempt = undefined;
  run.submission = undefined; run.shownAt = performance.now();
  stopSpeech();
  const shown = localizedExercise(ex);
  const scaffold = ex.mode === 'type' ? typedScaffold(ex) : '';
  const label = { choice: t('MAKE YOURSELF UNDERSTOOD'), listen: t('LISTEN FOR A LITTLE CLUE'), sentence: t('FIND THE RIGHT WORDS'), type: t('YOUR WORDS, YOUR WAY') }[ex.mode];
  const optionMarkup = exerciseOptionsMarkup(ex, [...(ex.options ?? [])].map((option, i) => ({ option, seed: hash(`${run!.started}:${ex.id}:${run!.index}:${i}`) })).sort((a, b) => a.seed - b.seed).map(({ option }) => option));
  document.querySelector<HTMLDialogElement>('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close adventure'))}">${icon('close')}</button><div class="exercise-header"><span>${run.label ? e(run.label) : run.review ? t('A familiar face, a new encounter') : e(run.quest ? localized(run.quest.title) : t('Your learning route'))}</span><strong>${Math.min(run.index + 1, run.targetCount)} / ${run.targetCount}</strong></div><div class="exercise-progress"><span style="width:${Math.min(100, run.correct / (run.targetCount) * 100)}%"></span></div><div class="exercise-content"><div class="exercise-preferences">${silentModeButton()}</div><div class="eyebrow">${e(label)}</div><h2>${e(shown.prompt)}</h2>${ex.mode === 'listen' ? `<div class="audio-scene"><button class="audio-play" data-speak="${e(ex.german)}" aria-label="${e(t('Play German audio'))}">${icon('volume')}</button><div><strong>${e(t('A voice from {place}', { place: interiorId ? getInterior(interiorId).name : getMap(mapId).name }))}</strong><span>${t('Listen, then choose your answer. Replay any time.')}</span></div></div><button class="text-button transcript-button" data-action="transcript">${t('Show transcript')}</button><p class="transcript" id="transcript" hidden>${e(ex.german)}</p>` : ''}<div class="exercise-answer">${ex.mode === 'choice' || ex.mode === 'listen' ? `<div class="answer-options">${optionMarkup}</div>` : ex.mode === 'sentence' ? `<div class="sentence-result" id="sentence-result" aria-label="${e(t('Your sentence'))}"><span class="sentence-placeholder">${t('Tap the words to build your answer')}</span></div><div class="word-tokens" id="word-tokens">${shuffledSentenceTiles(ex, `${run.started}:${run.index}:${ex.id}`).map(({ token, i }) => `<button class="word-token" data-game-option="${i}" data-token="${i}" data-value="${e(token)}">${e(token)}</button>`).join('')}</div><button class="text-button" data-action="clear-sentence">${icon('refresh')} ${t('Start the sentence again')}</button>` : `<form id="typed-answer-form">${scaffold ? `<p class="typed-scaffold"><span>${t('Letter guide')}</span><strong lang="de">${e(scaffold)}</strong></p>` : ''}<input class="typed-answer" id="typed-answer" placeholder="${e(t('Write your answer in German…'))}" autocomplete="off" autocapitalize="sentences" spellcheck="false" aria-label="${e(t('Your German answer'))}"/><div class="german-keys">${['ä', 'ö', 'ü', 'ß'].map(char => `<button type="button" data-insert="${char}">${char}</button>`).join('')}</div><small class="typed-spelling-help">${t('Capitalize German nouns and formal Sie. You can use ae, oe and ue for umlauts.')}</small></form>`}</div><div id="exercise-feedback" class="exercise-feedback" aria-live="polite"></div><div class="exercise-actions"><button class="text-button" data-action="hint">${icon('sparkles')} ${t('A little help')}</button>${ex.mode === 'sentence' || ex.mode === 'type' ? `<button class="primary-button" data-action="check-answer" id="check-answer">${t('Check my answer')} ${icon('arrow')}</button>` : ''}<button class="primary-button" data-action="next-exercise" id="next-exercise" hidden>${t('On with the story')} ${icon('arrow')}</button></div><p class="exercise-hint" id="exercise-hint" hidden>${e(shown.hint)}</p></div>`;
  document.querySelector('#typed-answer-form')?.addEventListener('submit', event => { event.preventDefault(); void submitAnswer(); });
  if (ex.mode === 'choice' || ex.mode === 'sentence') recordExposure({exerciseId:ex.id});
  if (ex.mode === 'type') document.querySelector<HTMLInputElement>('#typed-answer')?.focus();
  const inputRoot=document.querySelector<HTMLElement>('.exercise-content');if(inputRoot)exerciseInputCleanup=new MiniGameInput().bind(inputRoot);
}
function chooseExerciseAnswer(answer:string):void {
  if(!run||run.answered||run.submission)return;
  if(exerciseChoiceTimer){clearTimeout(exerciseChoiceTimer);exerciseChoiceTimer=undefined;}
  if(pendingExerciseChoice===answer){pendingExerciseChoice=undefined;void submitAnswer(answer);return;}
  pendingExerciseChoice=answer;
  document.querySelectorAll<HTMLElement>('.answer-option').forEach(button=>button.classList.toggle('answer-pending',button.dataset.answer===answer));
  const session=run,index=run.index;
  exerciseChoiceTimer=setTimeout(()=>{exerciseChoiceTimer=undefined;pendingExerciseChoice=undefined;if(run===session&&run.index===index)void submitAnswer(answer);},300);
}
function hash(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}
function assembleSentence(index: number) {
  if (!run || run.answered || run.submission || run.tokenOrder.includes(index)) return;
  run.tokenOrder.push(index);
  const token = document.querySelector<HTMLButtonElement>(`[data-token="${index}"]`)!;
  token.disabled = true;
  const tokens = run.tokenOrder.map(i => document.querySelector<HTMLElement>(`[data-token="${i}"]`)!.dataset.value!);
  run.answer = tokens.join(' ');
  document.querySelector('#sentence-result')!.innerHTML = tokens.map((t, i) => `<button class="selected-token" data-remove-token="${i}">${e(t)}</button>`).join('');
}
function lockReviewAnswer() {
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('#dialog .exercise-answer button, #dialog .exercise-answer input, #dialog .exercise-preferences button, #dialog [data-speak], #dialog [data-action="transcript"], #dialog [data-action="hint"], #check-answer').forEach(control => { control.disabled = true; });
}
function showRecallRating() {
  const feedback = document.querySelector<HTMLElement>('#exercise-feedback')!;
  feedback.className = 'exercise-feedback shown';
  feedback.innerHTML = `<div><strong>${t('Your answer fits.')}</strong><p>${t('How did recalling it feel?')}</p><div class="recall-rating"><button class="outline-button" data-recall-rating="hard">${t('Hard')}</button><button class="outline-button" data-recall-rating="good">${t('Good')}</button><button class="outline-button" data-recall-rating="easy">${t('Easy')}</button></div></div>`;
  document.querySelector<HTMLElement>('#check-answer')?.setAttribute('hidden', '');
  document.querySelector<HTMLElement>('[data-action="hint"]')!.hidden = true;
  document.querySelector<HTMLButtonElement>('[data-recall-rating="good"]')?.focus();
}
async function submitAnswer(selected?: string, rating?: RecallRating) {
  if (!run || run.answered || attemptBusy) return;
  const activeRun = run;
  const ex = activeRun.queue[activeRun.index];
  const answer = activeRun.submission?.answer ?? selected ?? (ex.mode === 'type' ? document.querySelector<HTMLInputElement>('#typed-answer')!.value : activeRun.answer);
  if (!answer.trim()) { toast(t('Give it a try. A little help is here if you need it.')); return; }
  attemptBusy = true;
  document.querySelectorAll<HTMLButtonElement>('.answer-option, #check-answer').forEach(button => { button.disabled = true; });
  try {
    const supported = activeRun.hinted || ex.mode === 'sentence' || (ex.mode === 'listen' && !activeRun.audioHeard);
    activeRun.submission ??= { id: crypto.randomUUID(), itemId: ex.itemId, exerciseId: ex.id, answer, hinted: supported, mode: ex.mode === 'listen' && !activeRun.audioHeard ? 'recognition' : modeFor(ex), questId: activeRun.quest?.id, responseTimeMs: Math.min(600000, Math.round(performance.now() - (activeRun.shownAt ?? performance.now()))) };
    let result: AttemptResult;
    if (activeRun.review) {
      lockReviewAnswer();
      document.querySelectorAll<HTMLButtonElement>('[data-recall-rating], [data-action="retry-review-answer"]').forEach(button => { button.disabled = true; });
      activeRun.reviewAttempt ??= new ReviewAttempt(activeRun.submission);
      const outcome = await activeRun.reviewAttempt.submit({
        preview: input => api.request<{correct:boolean}>('/attempt', {...input, preview:true}),
        save: input => api.request<AttemptResult>('/attempt', input),
      }, rating);
      if (outcome.kind === 'ignored') return;
      if (outcome.kind === 'rating') { if (run === activeRun) showRecallRating(); return; }
      result = outcome.result;
    } else {
      result = await api.request<AttemptResult>('/attempt', activeRun.submission);
    }
    acceptProgress(result.progress);
    updateProgress();
    if (run !== activeRun) return;
    activeRun.answered = true;
    if (result.correct) { activeRun.correct++; playCue(true); }
    else { activeRun.queue.push(ex); playCue(false); }
    const feedback = document.querySelector<HTMLElement>('#exercise-feedback')!;
    feedback.className = `exercise-feedback shown ${result.correct ? 'correct' : 'incorrect'}`;
    const explanation = result.correct && !result.reason?.startsWith('Accepted.') ? localizedExercise(ex).explanation : attemptFeedback(ex, answer, result.reason);
    feedback.innerHTML = `<span class="feedback-icon">${icon(result.correct ? 'check' : 'leaf')}</span><div><strong>${result.correct ? [t('That’s the way!'), t('Nicely said.'), t('A little more German. A little more you.')][activeRun.correct % 3] : t('A small detour. You’ll get there.')}</strong><p>${e(explanation)}</p>${!result.correct ? `<small>${t('You’ll meet this one again before the adventure ends.')}</small>` : ''}</div>${result.xpAdded ? `<span class="feedback-xp">+${result.xpAdded} XP</span>` : ''}`;
    document.querySelectorAll<HTMLButtonElement>('.answer-option').forEach(button => { if (button.dataset.answer === ex.answer) button.classList.add('correct-answer'); else if (button.dataset.answer === answer && !result.correct) button.classList.add('wrong-answer'); });
    document.querySelector<HTMLElement>('#check-answer')?.setAttribute('hidden', '');
    const nextButton = document.querySelector<HTMLButtonElement>('#next-exercise')!;
    if (activeRun.interiorObjectId) nextButton.innerHTML = `${activeRun.index + 1 >= activeRun.queue.length ? t('Finish session') : t('Next expression')} ${icon('arrow')}`;
    nextButton.hidden = false;
    document.querySelector<HTMLElement>('[data-action="hint"]')!.hidden = true;
    nextButton.focus();
  } catch (error) {
    toast((error as Error).message || t('Could not save your answer. Please try again.'), true);
    if (run === activeRun) {
      if (activeRun.review) {
        const feedback = document.querySelector<HTMLElement>('#exercise-feedback')!;
        feedback.className = 'exercise-feedback shown';
        feedback.innerHTML = `<div><strong>${t('Your answer is kept here.')}</strong><p>${t('Try again to check or save this answer when the town reconnects.')}</p><button class="outline-button" data-action="retry-review-answer">${t('Try again')}</button></div>`;
        document.querySelector<HTMLElement>('#check-answer')?.setAttribute('hidden', '');
      } else document.querySelectorAll<HTMLButtonElement>('.answer-option, #check-answer').forEach(button => { button.disabled = false; });
    }
  } finally { attemptBusy = false; }
}
async function finishRun() {
  if (!run) return;
  const activeRun = run;
  try {
    let gained = 0;
    if (activeRun.unitId && course) {
      const unit = course.courseUnits.find(unit => unit.id === activeRun.unitId)!;
      const remainingExercises = unit.exerciseIds.flatMap(id => { const ex = course!.courseExerciseById.get(id); return ex && !exerciseHasSuccess(ex) ? [ex] : []; });
      if (!writingReady() && remainingExercises.some(ex => ex.mode === 'sentence' || ex.mode === 'type') && !playablePractice(remainingExercises).length) { showOpeningPracticeNotice(); playCue(true); return; }
      const remaining = remainingExercises.length;
      if (!remaining) { const result = await api.completeUnit(unit.id); acceptProgress(result.progress); gained = result.xpAdded; updateProgress(); }
      if (run !== activeRun) return;
      document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close learning route'))}">${icon('close')}</button><div class="completion"><div class="completion-mark">${icon(remaining ? 'leaf' : 'check')}</div><div class="eyebrow">${t('YOUR LEARNING ROUTE, SAVED')}</div><h2>${remaining ? t('A little further along the route.') : t('A route you can use.')}</h2><p>${e(localized(unit.title))} · ${remaining ? (remaining === 1 ? t('{count} encounter remains. Your completed answers are saved; continue when you are ready.', { count: remaining }) : t('{count} encounters remain. Your completed answers are saved; continue when you are ready.', { count: remaining })) : t('Your answers are saved. Try this German in an adventure or let it rest until its next encounter.')}</p><div class="completion-stats"><span><strong>${activeRun.targetCount}</strong> ${t('encounters saved')}</span><span><strong>${gained ? '+' + gained : '✓'}</strong> ${gained ? t('adventure XP') : t('progress saved')}</span></div>${remaining ? `<button class="primary-button" data-course-unit="${unit.id}">${t('Continue this route')} ${icon('arrow')}</button>` : `<button class="primary-button" data-view="activities">${t('Use it in an adventure')} ${icon('arrow')}</button>`}<button class="text-button" data-view="course">${t('Return to your learning routes')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')}</button></div>`;
      run = undefined; playCue(true); return;
    }
    if (activeRun.quest && !questGraph(activeRun.quest.id)) {
      const skipListening = silentMode || !!activeRun.skipListening;
      const remaining = remainingQuestExercises(activeRun.quest.exercises, progress, skipListening);
      if (!writingReady() && remaining.some(ex => ex.mode === 'sentence' || ex.mode === 'type') && !playablePractice(remaining).length) { showOpeningPracticeNotice(); playCue(true); return; }
      if (remaining.length) {
        document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close quest session'))}">${icon('close')}</button><div class="completion"><div class="completion-mark">${icon('leaf')}</div><div class="eyebrow">${t('YOUR ANSWERS ARE SAVED')}</div><h2>${t('A little further along the story.')}</h2><p>${e(localized(activeRun.quest.title))} · ${remaining.length === 1 ? t('{count} exercise remains. Your completed answers are saved; continue when you are ready.', { count: remaining.length }) : t('{count} exercises remain. Your completed answers are saved; continue when you are ready.', { count: remaining.length })}</p><div class="completion-stats"><span><strong>${activeRun.correct}</strong> ${t('expressions practised')}</span><span><strong>✓</strong> ${t('progress saved')}</span></div><button class="primary-button" data-start-quest="${activeRun.quest.id}">${t('Continue this quest')} ${icon('arrow')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')} ${icon('arrow')}</button></div>`;
        run = undefined; playCue(true); return;
      }
      const result = await api.request<{ xpAdded: number; progress: Progress }>('/quest/complete', { questId: activeRun.quest.id, silentMode: skipListening });
      acceptProgress(result.progress); gained = result.xpAdded; updateProgress();
    }
    if (run !== activeRun) return;
    if (activeRun.interiorObjectId) {
      const object = getInteriorObject(activeRun.interiorObjectId);
      const room = interiorId ? getInterior(interiorId) : undefined;
      document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close learning session'))}">${icon('close')}</button><div class="completion interior-completion"><div class="completion-mark">${icon('check')}</div><div class="eyebrow">${t('A LITTLE GERMAN YOU CAN USE')}</div><h2>${e(object?.sessionTitle ?? t('A useful little encounter.'))}</h2><p>${e(t('You ordered, asked or understood a little more. Your answers are saved. Keep exploring {place} to meet the language in another corner.', { place: room?.name ?? getMap(mapId).name }))}</p><div class="completion-stats"><span><strong>${activeRun.targetCount}</strong> ${t('expressions practised')}</span><span><strong>✓</strong> ${t('progress saved')}</span></div>${object && room ? `<button class="primary-button" data-inspect-interior="${e(object.id)}">${e(t('Return to {name}', { name: object.label }))} ${icon('arrow')}</button>` : ''}<button class="text-button" data-action="close-dialog">${t('Keep exploring')} ${icon('arrow')}</button></div>`;
      playCue(true); run = undefined; return;
    }
    const clue = activeRun.quest && !questGraph(activeRun.quest.id) ? clueFor(activeRun.quest.id) : undefined;
    const act = getExpedition(mapId) ? undefined : actFor(mapId), actFinished = completedAtLevel(level) === quests.filter(item => item.level === level).length;
    const title = clue ? localized(clue.title) : activeRun.objectId ? t('A little thing, better understood.') : t('Familiar words. Fresh memories.');
    const wordsOnly = activeRun.queue.every(ex => 'targetWordId' in ex);
    const body = clue ? renderNarrative(clue.text) : e(activeRun.quest && questGraph(activeRun.quest.id) ? t('Your optional practice is saved. Return to the witness and the evidence to continue the investigation.') : activeRun.objectId ? t('You made sense of this little encounter. Its lore is always here; the expressions can rest until they are ready again.') : wordsOnly ? t('You’ve given these words room to grow. They can rest until their next encounter.') : t('You’ve given these expressions room to grow. They can rest until their next encounter.'));
    const targetCount = new Set(activeRun.queue.map(ex => ex.itemId)).size;
    document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close discovery'))}">${icon('close')}</button><div class="completion story-reveal"><div class="completion-mark">${icon(clue ? 'lantern' : 'leaf')}</div><div class="eyebrow">${clue ? t('A NEW DISCOVERY IN YOUR ATLAS') : t('A SMALL PROMISE TO REMEMBER')}</div><h2>${e(title)}</h2>${clue ? translationHelp() : ''}<p>${body}</p>${clue ? eliseLetter(clue.letter, clue.questId) : ''}${clue ? `<div class="next-lead">${icon('flag')}<span>${renderNarrative(actFinished ? act?.cliffhanger ?? clue.lead : clue.lead)}</span></div>` : ''}<div class="completion-stats"><span><strong>${targetCount}</strong> ${wordsOnly ? t('words practised') : t('expressions practised')}</span><span><strong>${gained ? '+' + gained : '✓'}</strong> ${gained ? t('adventure XP') : t('progress saved')}</span></div>${clue ? `<button class="primary-button" data-action="next-objective">${t('Follow the next lead')} ${icon('arrow')}</button><button class="text-button" data-view="story">${t('Read your discoveries')} ${icon('book')}</button>` : `<button class="primary-button" data-action="close-dialog">${e(t('Back to {place}', { place: getMap(mapId).name }))} ${icon('arrow')}</button>`}<button class="text-button" data-action="close-dialog">${t('Keep exploring')}</button></div>`;
    playCue(true); run = undefined;
  } catch (error) {
    if (run !== activeRun) return;
    toast((error as Error).message, true);
    document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close'))}">${icon('close')}</button><div class="completion"><h2>${t('Let’s save your discovery.')}</h2><p>${e((error as Error).message)}</p><button class="primary-button" data-action="finish-run">${t('Try saving again')} ${icon('refresh')}</button></div>`;
  }
}
function profileForm() {
  return `<form id="profile-form"><label class="form-label" for="character-name">${t('What should the town call you?')}</label><input id="character-name" class="name-input" maxlength="24" minlength="2" value="${e(profile.name)}" required autocomplete="nickname"/>${characterBuilderMarkup()}<button class="primary-button" type="submit">${t('This is me')} ${icon('check')}</button></form>`;
}
function bindProfileForm() {
  const form = document.querySelector<HTMLFormElement>('#profile-form')!;
  const getAvatar = bindCharacterBuilder(form, profile.avatar);
  form.onsubmit = async event => {
    event.preventDefault();
    const name = document.querySelector<HTMLInputElement>('#character-name')!.value.trim();
    if (name.length < 2) { toast(t('Your player name: Use at least 2 characters.'), true); return; }
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true;
    try {
      const result = await api.session(name, getAvatar());
      account = result.account;
      profile = { name: result.player.name, avatar: result.player.avatar };
      localStorage.setItem('atlas.profile', JSON.stringify(profile));
      acceptProgress(result.progress, result.player.id);
      world.setAvatar(profile.avatar);
  updateSelfPortraits(document, profile.avatar);
      document.querySelector('#profile-name')!.textContent = profile.name;
      api.connect();
      document.querySelector<HTMLDialogElement>('#dialog')!.close();
      updateProgress();
      if (view === 'character') renderOther();
      toast(t('Looking good, {name}. Lindenhafen is waiting.', { name: profile.name }));
    } catch (error) { toast((error as Error).message, true); }
    finally { button.disabled = false; }
  };
}
function showProfile() { openDialog(`<div class="profile-dialog-heading"><div class="eyebrow">${t('LET’S MAKE THIS YOUR ADVENTURE.')}</div><h2>${t('Nice to meet you.')}</h2></div>${profileForm()}`, 'profile-dialog'); bindProfileForm(); }
const audioPaths = new Map([
  ...minigameAudio.clips.map(clip=>[clip.text,clip.path] as const),
  ...quests.flatMap(q => q.exercises.map(ex => [ex.german, `/audio/${ex.id}.mp3`] as const)),
  ...npcs.map(npc => [npc.greeting, `/audio/npc-${npc.id}.mp3`] as const),
]);
let activeSpeech: HTMLAudioElement | undefined;
let speechGeneration = 0;
function stopSpeech() {
  world?.setNarrationActive(false);
  speechGeneration++;
  if (activeSpeech) { activeSpeech.pause(); activeSpeech = undefined; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
function setSilentMode(enabled: boolean, notify = true) {
  silentMode = enabled;
  localStorage.setItem('atlas.silentMode', String(silentMode)); world.setAudioPreferences({ silent: silentMode, muted });
  if (silentMode) { stopSpeech(); void audioContext?.suspend(); }
  if (view === 'settings') renderOther();
  if (silentMode && run && !run.answered && !run.submission && run.queue[run.index]?.mode === 'listen') renderExercise();
  document.querySelectorAll<HTMLButtonElement>('[data-action="silent-mode"]').forEach(button => {
    button.setAttribute('aria-pressed', String(silentMode));
    button.innerHTML = `${icon(silentMode ? 'muted' : 'volume')} ${silentMode ? t('Silent mode on') : t('Silent mode off')}`;
  });
  questController?.refreshAudio();
  if (notify) toast(silentMode ? t('Silent mode on. Listening exercises will be skipped.') : t('Silent mode off. Listening exercises will return in your next session.'));
}
function speak(text: string, speaker?: string, clipId?: string, rate = speechRate) {
  if (silentMode) return;
  stopSpeech();
  world?.setNarrationActive(true);
  const generation = speechGeneration;
  const listeningRun = run;
  const listeningIndex = run?.index;
  const audioStatus = (message: string) => { if (run === listeningRun && run?.index === listeningIndex) { const label = document.querySelector<HTMLElement>('.audio-scene span'); if (label) label.textContent = message; } };
  const heard = () => { world?.setNarrationActive(false); if (run && run === listeningRun && run.index === listeningIndex && run.queue[run.index]?.mode === 'listen' && run.queue[run.index].german === text) { run.audioHeard = true; recordExposure({exerciseId:run.queue[run.index].id}); audioStatus(t('Audio finished. Choose your answer, or listen again.')); } };
  const unavailable = () => {
    if (generation !== speechGeneration) return;
    world?.setNarrationActive(false);
    toast(t('The audio couldn’t play. You can use the transcript and try it again.'));
    if (run && run === listeningRun && run.index === listeningIndex) { run.audioHeard = false; run.hinted = true; const transcript = document.querySelector<HTMLElement>('#transcript'); if (transcript) { transcript.hidden = false; recordExposure({exerciseId:run.queue[run.index].id}); } }
  };
  let fallbackStarted = false;
  const fallback = () => {
    if (generation !== speechGeneration || fallbackStarted) return;
    fallbackStarted = true;
    if (!('speechSynthesis' in window)) { unavailable(); return; }
    const voices = speechSynthesis.getVoices();
    const germanVoices = voices.filter(v => v.lang.startsWith('de'));
    const castIndex = Math.max(0, npcs.findIndex(npc => npc.id === speaker));
    const voice = germanVoices[castIndex % Math.max(germanVoices.length, 1)];
    if (!voice) { unavailable(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => { if (generation === speechGeneration) heard(); };
    utterance.onstart = () => audioStatus(t('Playing German audio…'));
    utterance.onerror = unavailable;
    utterance.lang = 'de-DE'; utterance.voice = voice; utterance.rate = rate;
    speechSynthesis.speak(utterance);
  };
  const path = clipId ? `/audio/dialogue/${clipId}.mp3` : audioPaths.get(text);
  if (path) {
    const audio = new Audio(path);
    activeSpeech = audio;
    audio.playbackRate = rate / 0.82;
    audio.onplay = () => audioStatus(t('Playing German audio…'));
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
    if (document.querySelector<HTMLDialogElement>('#account-dialog')!.open || started && accessBlocked(accessClock.snapshot(performance.now()))) return;
    if (cinematicActive) return;
    if (questController?.isOpen) { if (event.key === 'Escape') { event.preventDefault(); questController.close(); } return; }
    if (dialog.open || document.querySelector<HTMLDialogElement>('#account-dialog')!.open) return;
    const typing = (event.target as HTMLElement).matches('input:not([type="range"]),textarea,select') || (event.target as HTMLElement).isContentEditable;
    if (event.key === 'Escape') { event.preventDefault(); if(deliveryController){deliveryController.destroy();deliveryController=undefined;deliveryHost?.destroy();deliveryHost=undefined;syncWorldMode();return;} if (watchingWorld) watchWorld(false); else if (screenFilterControls?.isOpen()) screenFilterControls.close(); else if (view !== 'world') { if (menuNavigator) menuNavigator.back(); else setView('world'); } else if (!document.querySelector<HTMLElement>('#chat-body')!.hidden) toggleChat(); return; }
    if (menuNavigator?.handleKey(event)) return;
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
    if (!target || (target instanceof HTMLButtonElement && target.disabled)) return;
    if (target.matches('a.brand')) { event.preventDefault(); setView('world'); return; }
    if (target.dataset.view) { cancelRun(); document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView(target.dataset.view as View); return; }
    if (target.dataset.minigame) { void startMiniGame(target.dataset.minigame); return; }
    if (target.dataset.activity) { void startActivity(target.dataset.activity as ActivityId); return; }
    if (target.dataset.coursePage) { coursePage = Math.max(0, Number(target.dataset.coursePage)); renderOther(); return; }
    if (target.dataset.courseLevel) { coursePage = 0; courseLevel = target.dataset.courseLevel as Level; renderOther(); return; }
    if (target.dataset.courseTab) { coursePage = 0; courseTab = target.dataset.courseTab as typeof courseTab; renderOther(); return; }
    if (target.dataset.optionsTab) { optionsTab = target.dataset.optionsTab as OptionsTab; uiSounds.play('page'); renderMenuChrome(); renderOther(); menuNavigator?.focusTab(); return; }
    if (target.dataset.journalTab) { journalTab = target.dataset.journalTab as typeof journalTab; renderOther(); return; }
    if (target.dataset.courseUnit) { void startCourseUnit(target.dataset.courseUnit); return; }
    if (target.dataset.wordPractice) { void startWordPractice(target.dataset.wordPractice); return; }
    if (target.dataset.expeditionGame) { startExpeditionGame(target.dataset.expeditionGame, target.dataset.expeditionLevel as Level | undefined); return; }
    if (target.dataset.expeditionTarget) { showExpeditionEncounter(target.dataset.expeditionTarget); return; }
    if (target.dataset.level) { const region = maps.find(map => map.level === target.dataset.level); if (region) travelMap(region.id); return; }
    if (target.dataset.travel) { const region = maps.find(map => map.id === target.dataset.travel); if (region) travelMap(region.id); return; }
    if (target.dataset.followQuest) { const q = quests.find(item => item.id === target.dataset.followQuest); if (!q) return; if (!questAvailable(q.id, progress)) { toast(questLockReason(q.id, progress)); return; } travelMap(maps.find(map => map.level === q.level)!.id, { kind: 'follow', questId: q.id }); return; }
    if (target.dataset.waypoint) { document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView('world'); if (interiorId) world.leaveInterior(); world.focusNpc(target.dataset.waypoint); return; }
    if (target.dataset.focusObject) { setView('world'); if (interiorId) world.leaveInterior(); world.focusObject(target.dataset.focusObject); return; }
    if (target.dataset.focusBuilding) { const id = target.dataset.focusBuilding; if (interiors.some(room => room.id === id)) guideToBuilding(id as InteriorId); return; }
    if (target.dataset.inspectInterior) { showInteriorObject(target.dataset.inspectInterior); return; }
    if (target.dataset.practiceInterior) { startInteriorPractice(target.dataset.practiceInterior); return; }
    if (target.dataset.interiorActivity) { startInteriorActivity(target.dataset.interiorActivity); return; }
    if (target.dataset.inspectObject) { showObject(target.dataset.inspectObject); return; }
    if (target.dataset.practiceObject) { startObjectPractice(target.dataset.practiceObject); return; }
    if (target.dataset.npc) { document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView('world'); world.focusNpc(target.dataset.npc); return; }
    if (target.dataset.practiceQuest) { startQuestPractice(target.dataset.practiceQuest); return; }
    if (target.dataset.replayDialogue) { document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView('world'); void questController?.open(target.dataset.replayDialogue); return; }
    if (target.dataset.saveStory) { const slot = target.dataset.saveStory; void api.saveStory(slot, document.querySelector<HTMLInputElement>(`#save-name-${slot}`)!.value).then(() => api.story()).then(result => { storySaves = result.saves ?? []; acceptProgress(result.progress); renderOther(); toast(t('This point in your story is saved.')); }).catch(error => toast(error.message, true)); return; }
    if (target.dataset.loadStory) { void api.loadStory(target.dataset.loadStory).then(() => location.reload()).catch(error => toast(error.message, true)); return; }
    if (target.dataset.startQuest) { startQuest(target.dataset.startQuest); return; }
    if (target.dataset.speak) { speak(target.dataset.speak); return; }
    if (target.dataset.answer) { chooseExerciseAnswer(target.dataset.answer); return; }
    if (target.dataset.recallRating && ['hard','good','easy'].includes(target.dataset.recallRating)) { void submitAnswer(undefined, target.dataset.recallRating as RecallRating); return; }
    if (target.dataset.token) { assembleSentence(Number(target.dataset.token)); return; }
    if (target.dataset.removeToken && run && !run.answered && !run.submission) {
      const index = Number(target.dataset.removeToken), selected = [...run.tokenOrder];
      selected.splice(index, 1); run.tokenOrder = []; run.answer = '';
      document.querySelectorAll<HTMLButtonElement>('[data-token]').forEach(b => { b.disabled = false; });
      document.querySelector('#sentence-result')!.innerHTML = `<span class="sentence-placeholder">${t('Tap the words to build your answer')}</span>`;
      selected.forEach(assembleSentence); return;
    }
    if (target.dataset.insert) { const input = document.querySelector<HTMLInputElement>('#typed-answer'); if (input && !run?.submission) { const pos = input.selectionStart ?? input.value.length; input.setRangeText(target.dataset.insert, pos, input.selectionEnd ?? pos, 'end'); input.focus(); } return; }
    switch (target.dataset.action) {
      case 'screen-filters': if (screenFilterControls?.isOpen()) screenFilterControls.close(); else openScreenFilters(target); break;
      case 'watch-world': if (view !== 'world') setView('world'); watchWorld(true); break;
      case 'stop-watching': watchWorld(false); break;
      case 'profile': showProfile(); break;
      case 'map': openWorldMap(); break;
      case 'talk': if (!world.interactNearest()) toast(t('Move closer to a character or a marked object.')); break;
      case 'leave-interior': world.leaveInterior(); document.querySelector<HTMLElement>('#world-container')!.focus(); break;
      case 'next-objective': if (view !== 'world') setView('world'); showNextObjective(); break;
      case 'act-intro': setView('world'); showActIntro(mapId); break;
      case 'act-begin': document.querySelector<HTMLDialogElement>('#dialog')!.close(); continueDestination(); break;
      case 'open-chat': setView('world'); toggleChat(true); break;
      case 'fullscreen': if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => toast(t('Full screen isn’t available here.'))); break;
      case 'close-dialog': cancelRun(); document.querySelector<HTMLDialogElement>('#dialog')!.close(); pendingDestination = undefined; pendingExpeditionGame = undefined; break;
      case 'help': openDialog(`<div class="help-dialog"><div class="completion-mark">${icon('compass')}</div><div class="eyebrow">${t('YOUR FIRST STEPS')}</div><h2>${t('Follow your curiosity.')}</h2><p>${t('Click a path to wander, or use {keys}. On your phone, move with the {joystick} or tap a destination.', { keys: `<strong>${t('WASD / arrow keys')}</strong>`, joystick: `<strong>${t('joystick')}</strong>` })}</p><p>${t('Tap a character to meet them, press {key} nearby, or use the {talk} button on your phone. Their stories become your adventures, and each adventure brings a little more German.', { key: '<strong>E</strong>', talk: `<strong>${t('Talk')}</strong>` })}</p><p>${t('Choose a café, bakery or supermarket from {menu} to walk to its doorway. Interact to enter, then talk to people or inspect the glowing objects for a focused German session. Use {leave} to return outside.', { menu: `<strong>${t('Menu / Atlas')}</strong>`, leave: `<strong>${t('Leave')}</strong>` })}</p><p>${t('Open your quests with {q}, journal with {j}, character with {c}, settings with {o}, and map with {m}. Press {escape} to return to the world.', { q: '<strong>Q</strong>', j: '<strong>J</strong>', c: '<strong>C</strong>', o: '<strong>O</strong>', m: '<strong>M</strong>', escape: '<strong>Escape</strong>' })}</p><p>${t('Use {help} whenever you need it. Mistakes are part of finding your way. Ready words return in your journal; strong words get longer rests.', { help: `<strong>${t('A little help')}</strong>` })}</p><p>${t('The town square connects you with other wanderers. Be kind. Everyone is learning.')}</p><button class="primary-button" data-action="close-dialog">${t('Let’s wander')} ${icon('arrow')}</button></div>`); break;
      case 'begin-exercises': renderExercise(); break;
      case 'check-answer': void submitAnswer(); break;
      case 'retry-review-answer': void submitAnswer(); break;
      case 'next-exercise': if (run?.answered) { run.index++; renderExercise(); } break;
      case 'finish-run': void finishRun(); break;
      case 'review': void startAdaptiveReview(); break;
      case 'placement': void startPlacement(); break;
      case 'sleep': if (interiorId === 'inn') { void api.request<{progress:Progress}>('/story/sleep',{id:crypto.randomUUID()}).then(result => { acceptProgress(result.progress); updateProgress(); document.querySelector<HTMLDialogElement>('#dialog')!.close(); toast(t('A new day. Your lantern keeps the promises you made.')); }).catch(error => toast(error.message, true)); } break;
      case 'course-sources': void showCourseSources(); break;
    case 'todays-words': void startTodaysWords(); break;
      case 'course-retry': coursePromise = undefined; void loadCourse().then(() => renderOther()).catch(error => toast(error.message, true)); break;
      case 'hint': if (run && !run.answered && !run.submission) { run.hinted = true; document.querySelector<HTMLElement>('#exercise-hint')!.hidden = false; recordExposure({exerciseId:run.queue[run.index].id}); } break;
      case 'transcript': if (run && !run.answered && !run.submission) { run.hinted = true; document.querySelector<HTMLElement>('#transcript')!.hidden = false; recordExposure({exerciseId:run.queue[run.index].id}); } break;
      case 'clear-sentence': if (run && !run.answered && !run.submission) { run.tokenOrder = []; run.answer = ''; document.querySelectorAll<HTMLButtonElement>('[data-token]').forEach(b => { b.disabled = false; }); document.querySelector('#sentence-result')!.innerHTML = `<span class="sentence-placeholder">${t('Tap the words to build your answer')}</span>`; } break;
      case 'silent-mode':
        if (attemptBusy) { toast(t('Your answer is saving. Try again in a moment.')); break; }
        setSilentMode(!silentMode);
        break;
      case 'save-account': showSaveAccount(); break;
      case 'login-account': showLogin(); break;
      case 'logout-account': showLogout(); break;
      case 'sound': muted = !muted; localStorage.setItem('atlas.muted', String(muted)); world.setAudioPreferences({ silent: silentMode, muted });  if (!muted) playCue(true); if (view === 'settings') renderOther(); break;
      case 'chat-toggle': toggleChat(); break;
    }
  });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('cancel', () => { cancelRun(); pendingDestination = undefined; });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('click', event => {
    const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { cancelRun(); pendingDestination = undefined; dialog.close(); }
  });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('close', () => { if (!document.querySelector<HTMLDialogElement>('#dialog')!.open) { document.querySelector('#game-shell')!.classList.remove('encounter-open'); syncWorldMode(); placementController?.destroy(); placementController = undefined; cancelRun(); miniGameLoading++; miniGameController?.destroy(); miniGameController=undefined; miniGameHost?.destroy(); miniGameHost=undefined; activityLoading++; activityController?.destroy(); activityController = undefined; if (!questController?.isOpen) { world.setConversationTarget(undefined); stopSpeech(); } if(view==='world')document.querySelector<HTMLElement>('#world-container')?.focus({preventScroll:true}); } });
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
  syncWorldMode();
  if (!body.hidden) document.querySelector<HTMLInputElement>('#chat-input')!.focus();
  else { const header = document.querySelector<HTMLButtonElement>('.chat-header')!; (header.getClientRects().length ? header : document.querySelector<HTMLButtonElement>('.game-menu-button')!).focus(); }
}
function chatPortrait(message: ChatMessage): string {
  const self = message.playerId === api.selfId;
  const avatar = self ? profile.avatar : players.find(player => player.id === message.playerId)?.avatar;
  return avatar ? avatarPortraitMarkup(avatar, 'message-avatar', self) : `<span class="message-avatar" style="background:#a67552">${e(message.name.slice(0, 1).toUpperCase())}</span>`;
}
function renderChat() {
  const el = document.querySelector<HTMLElement>('#chat-messages')!;
  if (!chatMessages.length) { el.innerHTML = `<p class="chat-welcome">${t('Say Hallo. Every wanderer has a story.')}</p>`; return; }
  el.innerHTML = chatMessages.slice(-40).map(message => `<div class="chat-message">${chatPortrait(message)}<p><strong>${e(message.name)}${message.playerId === api.selfId ? `<small>${t('you')}</small>` : ''}</strong><span>${e(message.text)}</span></p><time>${new Date(message.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time></div>`).join('');
  el.scrollTop = el.scrollHeight;
}
function accessIsActive(): boolean {
  return started && !document.hidden && connection === 'online' && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open && !accessBlocked(accessClock.snapshot(performance.now()));
}
async function sendAccessHeartbeat(active: boolean): Promise<void> {
  if (!started) return;
  if (accessHeartbeatBusy) { pendingAccessHeartbeat = active; return; }
  accessHeartbeatBusy = true;
  accessHeartbeatAt = performance.now();
  try { await api.accessHeartbeat(active); }
  catch { /* Keep the last server allowance; the local boundary still blocks play. */ }
  finally {
    accessHeartbeatBusy = false;
    const pending = pendingAccessHeartbeat;
    pendingAccessHeartbeat = undefined;
    if (pending !== undefined && pending !== active) void sendAccessHeartbeat(pending);
  }
}
function syncAccessActivity(): void {
  if (!started || accessResetting) return;
  const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
  const paused = document.hidden || dialog.open || accessBlocked(accessClock.snapshot(performance.now()));
  // A closed world socket releases the server's active-play lease.
  if (paused && !accessConnectionPaused) { accessConnectionPaused = true; api.destroy(); }
  else if (!paused && accessConnectionPaused) { accessConnectionPaused = false; api.connect(); }
  const active = accessIsActive();
  accessClock.setActive(active, performance.now());
  if (active !== accessWasActive) { accessWasActive = active; void sendAccessHeartbeat(active); }
}
function updateAccessHud(): void {
  const hud = document.querySelector<HTMLElement>('#access-hud');
  if (!hud) return;
  hud.hidden = !started;
  const access = accessClock.snapshot(performance.now());
  const paid = access?.phase === 'paid';
  hud.dataset.phase = access?.phase ?? 'checking';
  document.querySelector('#access-label')!.textContent = paid ? 'Unlimited play' : access?.registered ? 'Free trial left' : 'Guest play left';
  const time = document.querySelector('#access-time')!;
  time.textContent = paid ? access.plan === 'lifetime' ? 'Lifetime' : 'Subscribed' : access ? formatAccessTime(access.remainingSeconds) : 'Checking…';
  time.setAttribute('aria-label', paid ? 'Unlimited game access' : `${access?.registered ? 'Trial' : 'Guest play'} time remaining: ${access ? formatAccessTime(access.remainingSeconds) : 'checking'}`);
  document.querySelector('#access-button')!.textContent = paid ? 'Manage' : access?.registered ? 'Subscribe' : 'Login';
}
function applyAccess(access: GameAccess): void {
  accessClock.update(access, performance.now());
  updateAccessHud();
  if (!started || accessResetting) return;
  const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
  if (!accessBlocked(access) && dialog.open && dialog.dataset.accessWall === 'required') dialog.close();
  enforceAccessWall(); syncAccessActivity(); syncWorldMode();
}
function enforceAccessWall(): void {
  if (!started) return;
  const access = accessClock.snapshot(performance.now());
  if (!accessBlocked(access)) return;
  const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
  if (dialog.open && dialog.dataset.accessWall === 'required' && dialog.dataset.accessPhase === (access?.phase ?? 'checking')) return;
  if (access?.phase === 'payment_required') showPaywall(true);
  else if (access?.phase === 'login_required') showSaveAccount(true);
  else {
    showAccountDialog(`<div class="eyebrow">THE LANTERN ATLAS</div><h2 id="account-title">Checking your play time…</h2><p>Your adventure will continue when your saved allowance is confirmed.</p><p id="account-error" class="account-error" role="alert"></p><button type="button" class="primary-button" id="access-retry">Try again</button>`, true);
    document.querySelector<HTMLButtonElement>('#access-retry')!.onclick = () => { void api.access().catch(accountError); };
    void api.access().catch(accountError);
  }
}
function showResetGuest(): void {
  showAccountDialog(`<div class="eyebrow">START FROM THE BEGINNING</div><h2 id="account-title">Delete your guest progress?</h2><p>Starting over deletes all quests, XP, learned words, practice results and story saves. Your character and name stay the same, and you return to the beginning with 5 free minutes.</p><p>Sign up instead to keep this adventure and unlock the rest of your 15-minute trial.</p><p id="account-error" class="account-error" role="alert"></p><button type="button" class="primary-button reset-progress-button" id="guest-reset-confirm">Delete progress &amp; start over</button><button type="button" class="text-button" id="guest-reset-back">Keep my progress &amp; sign up</button>`, true);
  document.querySelector<HTMLButtonElement>('#guest-reset-back')!.onclick = () => showSaveAccount(true);
  document.querySelector<HTMLButtonElement>('#guest-reset-confirm')!.onclick = async event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      accessResetting = true;
      api.destroy();
      const result = await api.resetGuest();
      // Activity destruction persists its draft, so dispose it before clearing.
      activityController?.destroy(); activityController = undefined;
      miniGameController?.destroy(); miniGameController = undefined;
      miniGameHost?.destroy(); miniGameHost = undefined;
      deliveryController?.destroy(); deliveryController = undefined;
      deliveryHost?.destroy(); deliveryHost = undefined;
      eventLog?.destroy(); eventLog = undefined;
      if (reminderTimer !== undefined) clearInterval(reminderTimer);
      reminderTimer = undefined; accountReminder = undefined;
      clearGuestProgress(localStorage, result.player.id, result.player.name);
      location.reload();
    } catch (error) { accessResetting = false; accountError(error); button.disabled = false; }
  };
}
function showPaywall(required = accessClock.snapshot(performance.now())?.phase === 'payment_required', notice = ''): void {
  const access = accessClock.snapshot(performance.now());
  if (!access?.registered) { showSaveAccount(access?.phase === 'login_required', true); return; }
  if (access.phase === 'paid') { showBillingAccount(); return; }
  showAccountDialog(`<div class="eyebrow">KEEP THE LANTERNS LIT</div><h2 id="account-title">${required ? 'Your free trial is complete.' : 'Keep your adventure going.'}</h2><p>${required ? 'You have played your 15 free minutes. Choose a plan to continue from exactly where you left off.' : 'Subscribe now for unlimited play and keep every step of your adventure.'}</p><div class="billing-plans"><button type="button" class="billing-plan" data-billing-plan="monthly" ${access.billingAvailable ? '' : 'disabled'}><span>Monthly</span><strong>€2.99<small>/ month</small></strong><p>Billed monthly. Cancel anytime.</p><b>Subscribe monthly ${icon('arrow')}</b></button><button type="button" class="billing-plan billing-plan-lifetime" data-billing-plan="lifetime" ${access.billingAvailable ? '' : 'disabled'}><span>Lifetime</span><strong>€29.99<small>once</small></strong><p>One payment. Unlimited play.</p><b>Get lifetime access ${icon('arrow')}</b></button></div><small class="billing-note">Prices in EUR. Secure checkout with Creem. Tax included.</small>${!access.billingAvailable ? '<p class="billing-unavailable">Payments are being set up. Your progress is saved; check again shortly.</p>' : ''}<p id="account-error" class="account-error" role="alert">${e(notice)}</p><button type="button" class="text-button" id="billing-check">Already paid? Check payment status</button>${required ? '' : '<button type="button" class="text-button" id="billing-back">Back to my free trial</button>'}`, required);
  document.querySelector('#account-dialog')!.classList.add('billing-dialog');
  document.querySelectorAll<HTMLButtonElement>('[data-billing-plan]').forEach(button => { button.onclick = async () => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-billing-plan]')];
    buttons.forEach(item => { item.disabled = true; });
    try { const result = await api.checkout(button.dataset.billingPlan as BillingPlan); location.assign(billingURL(result.url)); }
    catch (error) { accountError(error); buttons.forEach(item => { item.disabled = !access.billingAvailable; }); }
  }; });
  document.querySelector<HTMLButtonElement>('#billing-back')?.addEventListener('click', () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close());
  document.querySelector<HTMLButtonElement>('#billing-check')!.onclick = () => void verifyBilling();
}
async function verifyBilling(attempt = 0, revision = ++billingVerificationRevision): Promise<void> {
  if (billingVerificationTimer !== undefined) clearTimeout(billingVerificationTimer);
  const access = accessClock.snapshot(performance.now());
  if (attempt === 0) showAccountDialog(`<div class="eyebrow">SECURE CHECKOUT WITH CREEM</div><h2 id="account-title">Confirming your payment…</h2><p role="status">We’re checking your payment with Creem. Your progress is saved.</p><p id="account-error" class="account-error" role="alert"></p><button type="button" class="text-button" id="billing-verification-back">${accessBlocked(access) ? 'Back to plans' : 'Back to my adventure'}</button>`, accessBlocked(access));
  document.querySelector<HTMLButtonElement>('#billing-verification-back')!.onclick = () => {
    billingVerificationRevision++;
    if (billingVerificationTimer !== undefined) clearTimeout(billingVerificationTimer);
    billingVerificationTimer = undefined;
    if (accessBlocked(accessClock.snapshot(performance.now()))) showPaywall();
    else document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
  };
  try {
    const result = await api.syncBilling();
    if (revision !== billingVerificationRevision) return;
    if (result.access.phase === 'paid') {
      document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
      toast('Payment confirmed. Your adventure is ready to continue.');
      return;
    }
    if (attempt < 11) { billingVerificationTimer = window.setTimeout(() => void verifyBilling(attempt + 1, revision), 2500); return; }
    showPaywall(undefined, 'Your payment is still processing. Check payment status again in a moment.');
  } catch (error) { if (revision === billingVerificationRevision) showPaywall(undefined, error instanceof Error ? error.message : 'Could not check payment. Please try again.'); }
}
function showBillingAccount(): void {
  const access = accessClock.snapshot(performance.now());
  showAccountDialog(`<div class="eyebrow">YOUR ADVENTURE</div><h2 id="account-title">${access?.plan === 'lifetime' ? 'Lifetime access is yours.' : 'Your subscription is active.'}</h2><p>Enjoy unlimited play. Manage your ${access?.plan === 'lifetime' ? 'purchase and receipts' : 'subscription, payment details and cancellation'} securely with Creem.</p><p id="account-error" class="account-error" role="alert"></p><button type="button" class="primary-button" id="billing-portal">Open billing portal ${icon('arrow')}</button><button type="button" class="text-button" id="billing-account-back">Back to my adventure</button>`);
  document.querySelector<HTMLButtonElement>('#billing-account-back')!.onclick = () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
  document.querySelector<HTMLButtonElement>('#billing-portal')!.onclick = async event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try { const result = await api.billingPortal(); location.assign(billingURL(result.url)); }
    catch (error) { accountError(error); button.disabled = false; }
  };
}
function showAccountDialog(html: string, required = false) {
  const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
  if(!dialog.open){
    accountKeptActivityPaused=!!document.querySelector('.activity-intermission,.expedition-encounter-learning[inert],.expedition-game[inert]');
    activityController?.pause();miniGameController?.pause();deliveryController?.pause();stopSpeech();
    if(exerciseChoiceTimer){clearTimeout(exerciseChoiceTimer);exerciseChoiceTimer=undefined;pendingExerciseChoice=undefined;}
  }
  dialog.innerHTML = html;
  dialog.dataset.accessWall = required ? 'required' : '';
  dialog.dataset.accessPhase = required ? accessClock.snapshot(performance.now())?.phase ?? 'checking' : '';
  dialog.classList.remove('billing-dialog');
  if (!dialog.open) dialog.showModal();
  syncAccessActivity();
  syncWorldMode();
  accountReminder?.tick(performance.now(), false);
}
function accountError(error: unknown) {
  document.querySelector<HTMLElement>('#account-error')!.textContent = error instanceof Error ? error.message : t('Please try again.');
}
function baseLanguagePicker() {
  return `<fieldset class="base-language-picker"><legend>${t('I speak')}</legend>${(['en', 'tr'] as const).map(language => `<label lang="${language}"><input type="radio" name="base-language" value="${language}" ${language === baseLanguage() ? 'checked' : ''}/> ${baseLanguageNames[language]}</label>`).join('')}<small>${t('Meanings, hints and menus use this language. You learn German either way.')}</small></fieldset>`;
}
const pendingLanguageKey = 'atlas.baseLanguagePending';
/** Switch the support language, save it with the account, then repaint every screen in it. */
async function changeBaseLanguage(language: BaseLanguage) {
  const applied = await setBaseLanguage(language);
  if (applied !== language) toast(t('Turkish support could not load. Check your connection and try again.'), true);
  if (started) {
    try { await api.savePreferences({ baseLanguage: applied }); localStorage.removeItem(pendingLanguageKey); }
    catch { localStorage.setItem(pendingLanguageKey, 'true'); }
  }
  // The shell, HUD and open views are rendered once; a reload repaints them. Progress is saved on the server.
  window.location.reload();
}
/** The account's language wins, unless this device changed it while the server was unreachable. */
function reconcileBaseLanguage(result: SessionResult): boolean {
  if (localStorage.getItem(pendingLanguageKey) === 'true') {
    void api.savePreferences({ baseLanguage: baseLanguage() }).then(() => localStorage.removeItem(pendingLanguageKey)).catch(() => {});
    return false;
  }
  if (result.preferences.baseLanguage === baseLanguage()) return false;
  void setBaseLanguage(result.preferences.baseLanguage).then(() => window.location.reload());
  return true;
}
function showNameEntry(restoreName = false) {
  let typed: string | null = null;
  try { typed = sessionStorage.getItem('atlas.entryName'); sessionStorage.removeItem('atlas.entryName'); } catch { /* Optional convenience only. */ }
  const selected = typed?.trim() ? typed.trim().slice(0, 24) : restoreName ? profile.name : entryNames[0];
  const suggestions = entryNames.includes(selected) ? entryNames : [selected, ...entryNames.slice(0, 3)];
  showAccountDialog(`<div class="eyebrow">${t('YOUR FIRST STEP INTO {brand}', { brand: 'THE LANTERN ATLAS' })}</div><h2 id="account-title">${t('What should the town call you?')}</h2><p>${t('Pick a suggested name or write your own. This is the name other players will see.')}</p><form id="name-entry-form"><div class="name-suggestions" role="group" aria-label="${e(t('Suggested player names'))}">${suggestions.map(name => `<button type="button" class="name-suggestion" aria-pressed="${name === selected}" data-suggested-name="${name}">${name}</button>`).join('')}</div><label class="form-label" for="entry-name">${t('Your player name')}</label><input id="entry-name" class="name-input" value="${e(selected)}" required minlength="2" maxlength="24" autocomplete="nickname" aria-describedby="name-help"/><small id="name-help">${t('2–24 letters or numbers; spaces, dashes, underscores and apostrophes are welcome.')}</small>${baseLanguagePicker()}${characterBuilderMarkup()}<p id="account-error" class="account-error" role="alert"></p><button class="primary-button" type="submit">${t('Start my adventure')} ${icon('arrow')}</button></form><button type="button" class="text-button" id="entry-login">${t('Already played? Log in with email')}</button>`);
  const form = document.querySelector<HTMLFormElement>('#name-entry-form')!;
  const input = document.querySelector<HTMLInputElement>('#entry-name')!;
  const getAvatar = bindCharacterBuilder(form, profile.avatar);
  if (!restoreName && !typed) getAvatar.applyPreset(selected);
  const sync = () => {
    const name = input.value.trim();
    input.setCustomValidity(/^[\p{L}\p{N}\p{M} _'-]{2,24}$/u.test(name) ? '' : t('Choose a name with 2–24 letters, numbers, spaces, dashes, underscores or apostrophes.'));
    form.querySelectorAll<HTMLButtonElement>('[data-suggested-name]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.suggestedName === name)));
  };
  input.addEventListener('input', sync);
  form.querySelectorAll<HTMLButtonElement>('[data-suggested-name]').forEach(button => { button.onclick = () => { input.value = button.dataset.suggestedName!; getAvatar.applyPreset(input.value); sync(); }; });
  document.querySelector<HTMLButtonElement>('#entry-login')!.onclick = () => showLogin();
  form.querySelectorAll<HTMLInputElement>('input[name="base-language"]').forEach(radio => { radio.onchange = () => {
    if (!radio.checked) return;
    // Keep the typed name across the reload that repaints every screen in the chosen language.
    try { sessionStorage.setItem('atlas.entryName', input.value); } catch { /* The name is easy to type again. */ }
    void changeBaseLanguage(radio.value as BaseLanguage);
  }; });
  form.onsubmit = async event => {
    event.preventDefault(); sync(); if (!form.checkValidity()) return;
    const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = true; button.textContent = t('Opening the town…');
    try {
      let result = await api.session(input.value.trim(), getAvatar(), baseLanguage());
      // Resuming a saved guest keeps its stored preference; apply the choice made on this screen.
      if (result.preferences.baseLanguage !== baseLanguage()) result = { ...result, preferences: await api.savePreferences({ baseLanguage: baseLanguage() }) };
      localStorage.setItem(`atlas.nameChosen.${result.player.id}`, 'true');
      enterGame(result);
      document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
    } catch (error) { accountError(error); }
    finally { button.disabled = false; button.innerHTML = `${t('Start my adventure')} ${icon('arrow')}`; }
  };
  sync();
}
function enterGame(result: SessionResult) {
  if (reconcileBaseLanguage(result)) return;
  started = true;
  account = result.account;
  acceptProgress(result.progress, result.player.id);
  profile = { name: result.player.name, avatar: result.player.avatar };
  localStorage.setItem('atlas.profile', JSON.stringify(profile));
  document.querySelector('#profile-name')!.textContent = profile.name;
  world.setPlayers([result.player], result.player.id);
  world.setAvatar(profile.avatar);
  updateSelfPortraits(document, profile.avatar);
  api.mapId = firstAvailableMap(api.mapId, progress.completedQuestIds);
  if (result.access) accessClock.update(result.access, performance.now());
  accessConnectionPaused = true;
  updateProgress(); updateAccessHud();
  void sendHeartbeat(0);
  void loadCourse().catch(() => {});
  const owner = result.player.id;
  void api.story().then(result => { if (api.selfId !== owner) return; storySaves = result.saves ?? []; acceptProgress(result.progress, owner); updateProgress(); }).catch(error => toast(error.message, true));
  accountReminder = new AccountReminder(result.player.id, localStorage);
  accountReminder.tick(performance.now(), false);
  if (reminderTimer !== undefined) clearInterval(reminderTimer);
  reminderTimer = window.setInterval(() => {
    const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
    const active = !document.hidden && connection === 'online' && !dialog.open;
    accountReminder!.tick(performance.now(), active);
    if (intakeClock.tick(performance.now(), active)) void sendHeartbeat(intakeClock.consume());
    syncAccessActivity(); updateAccessHud(); enforceAccessWall();
    if (performance.now() - accessHeartbeatAt >= 10000) void sendAccessHeartbeat(accessIsActive());
  }, 1000);
  queueMicrotask(() => { enforceAccessWall(); syncAccessActivity(); });
  const params = new URLSearchParams(location.search);
  if (params.get('billing') === 'success') {
    for (const key of ['billing', 'checkout_id', 'order_id', 'customer_id', 'subscription_id', 'product_id', 'request_id', 'signature']) params.delete(key);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
    queueMicrotask(() => void verifyBilling());
  }
}
function showSaveAccount(required = accessClock.snapshot(performance.now())?.phase === 'login_required', subscribeAfter = false) {
  if (!started || account.registered) return;
  const allowance = accessClock.snapshot(performance.now());
  showAccountDialog(`<div class="eyebrow">${required ? 'YOUR 5 FREE GUEST MINUTES ARE UP' : 'KEEP YOUR ADVENTURE'}</div><h2 id="account-title">${required ? 'Sign up to keep going.' : 'Save your adventure.'}</h2><p>${required ? 'Create a free account to keep all your progress and play for 10 more minutes.' : `Keep your character and progress on every device. You get 15 free minutes in total; ${formatAccessTime(Math.max(0, 900 - (allowance?.playedSeconds ?? 0)))} remain in your trial.`}</p><div class="account-switch" role="group" aria-label="Account options"><button type="button" class="selected" aria-pressed="true">Sign up</button><button type="button" id="signup-login" aria-pressed="false">Log in</button></div><form id="save-account-form"><label class="form-label" for="account-email">${t('Email')}</label><input class="name-input" id="account-email" name="email" type="email" required maxlength="254" autocomplete="email"/><label class="form-label" for="account-password">${t('Choose a password')}</label><input class="name-input" id="account-password" name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password" aria-describedby="password-help"/><small id="password-help">${t('Use 10–128 characters.')}</small><label class="form-label" for="account-password-confirm">${t('Confirm password')}</label><input class="name-input" id="account-password-confirm" type="password" required minlength="10" maxlength="128" autocomplete="new-password"/><p id="account-error" class="account-error" role="alert"></p><button class="primary-button" type="submit">Sign up &amp; keep my progress ${icon('check')}</button></form>${required ? '<p class="guest-reset-note">To play anonymously again, you must delete your progress and start at the beginning. Your character stays the same.</p><button type="button" class="text-button" id="guest-reset">Start over as a guest</button>' : '<button type="button" class="text-button" id="account-later">Back to my adventure</button>'}`, required);
  document.querySelector<HTMLButtonElement>('#signup-login')!.onclick = () => showLogin();
  document.querySelector<HTMLButtonElement>('#guest-reset')?.addEventListener('click', showResetGuest);
  document.querySelector<HTMLButtonElement>('#account-later')?.addEventListener('click', () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close());
  const form = document.querySelector<HTMLFormElement>('#save-account-form')!;
  const password = document.querySelector<HTMLInputElement>('#account-password')!;
  const confirmation = document.querySelector<HTMLInputElement>('#account-password-confirm')!;
  const checkConfirmation = () => confirmation.setCustomValidity(confirmation.value === password.value ? '' : t('The passwords must match.'));
  confirmation.oninput = checkConfirmation; password.oninput = checkConfirmation;
  form.onsubmit = async event => {
    event.preventDefault(); checkConfirmation(); if (!form.checkValidity()) return;
    const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = true;
    try {
      account = await api.register(document.querySelector<HTMLInputElement>('#account-email')!.value.trim(), password.value);
      password.value = ''; confirmation.value = '';
      if (!account.access) await api.access();
      document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
      if (subscribeAfter) showPaywall();
      if (view === 'settings') renderOther();
      toast(t('Saved, {name}. Use your email and password to log in on another device.', { name: profile.name }));
    } catch (error) { accountError(error); }
    finally { button.disabled = false; }
  };
}
function showLogout() {
  showAccountDialog(`<div class="eyebrow">THE LANTERN ATLAS</div><h2 id="account-title">${t('Log out?')}</h2><p>${account.registered ? t('Your adventure is saved. Log in with your email and password to continue later.') : t('This guest adventure has no email or password. If you log out, you cannot return to this character. Save your adventure first to keep your progress.')}</p><p id="account-error" class="account-error" role="alert"></p>${!account.registered ? `<button class="primary-button" id="logout-save">${t('Save my adventure')}</button>` : ''}<button class="${account.registered ? 'primary-button' : 'text-button'}" id="logout-confirm">${account.registered ? t('Log out') : t('Log out without saving')}</button><button class="text-button" id="logout-cancel">${t('Back to my adventure')}</button>`);
  document.querySelector<HTMLButtonElement>('#logout-save')?.addEventListener('click', () => showSaveAccount());
  const cancel = document.querySelector<HTMLButtonElement>('#logout-cancel')!;
  cancel.onclick = () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
  const button = document.querySelector<HTMLButtonElement>('#logout-confirm')!;
  button.onclick = async () => {
    button.disabled = true;
    cancel.disabled = true;
    try { await api.logout(); location.reload(); }
    catch { accountError(new Error(t('Could not log out. Check your connection and try again.'))); button.disabled = false; cancel.disabled = false; }
  };
}

function showLogin() {
  const required = started && accessClock.snapshot(performance.now())?.phase === 'login_required';
  showAccountDialog(`<div class="eyebrow">${t('WELCOME BACK TO {brand}', { brand: 'THE LANTERN ATLAS' })}</div><h2 id="account-title">${t('Continue your adventure.')}</h2><p>${t('Use the email and password you saved to restore your name, character and progress.')}${started ? ` ${t('Logging in opens the adventure linked to that email.')}` : ''}</p>${started && !account.registered ? `<div class="account-switch" role="group" aria-label="Account options"><button type="button" id="login-signup" aria-pressed="false">Sign up</button><button type="button" class="selected" aria-pressed="true">Log in</button></div>` : ''}<form id="login-account-form"><label class="form-label" for="login-email">${t('Email')}</label><input class="name-input" id="login-email" type="email" required maxlength="254" autocomplete="username"/><label class="form-label" for="login-password">${t('Password')}</label><input class="name-input" id="login-password" type="password" required maxlength="128" autocomplete="current-password"/><p id="account-error" class="account-error" role="alert"></p><button class="primary-button" type="submit">${e(t('Log in & continue'))} ${icon('arrow')}</button></form>${required ? '<p class="guest-reset-note">Signing up keeps this guest adventure. Logging in restores the adventure saved to that email.</p><button type="button" class="text-button" id="guest-reset">Start over as a guest</button>' : `<button class="text-button" id="login-back">${started ? t('Back to my adventure') : t('Back to choosing a name')}</button>`}`, required);
  document.querySelector<HTMLButtonElement>('#login-back')?.addEventListener('click', () => { if (started) document.querySelector<HTMLDialogElement>('#account-dialog')!.close(); else showNameEntry(!!api.token); });
  document.querySelector<HTMLButtonElement>('#login-signup')?.addEventListener('click', () => showSaveAccount(required));
  document.querySelector<HTMLButtonElement>('#guest-reset')?.addEventListener('click', showResetGuest);
  const form = document.querySelector<HTMLFormElement>('#login-account-form')!;
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = true;
    try {
      const result = await api.login(document.querySelector<HTMLInputElement>('#login-email')!.value.trim(), document.querySelector<HTMLInputElement>('#login-password')!.value);
      localStorage.setItem(`atlas.nameChosen.${result.player.id}`, 'true');
      // Restart the UI so in-flight learning responses cannot cross account owners.
      location.reload();
    } catch (error) { accountError(error); button.disabled = false; }
  };
}

async function boot() {
  // Paint in the cached support language; the account's saved choice is applied once the session resumes.
  await setBaseLanguage(cachedBaseLanguage(), { persist: false });
  renderShell();
  api.onAccess = applyAccess;
  const stopPortraits = observeAvatarPortraits(document.body);
  window.addEventListener('beforeunload', stopPortraits, { once: true });
  if (import.meta.env.PROD) {
    stopUpdateChecks = watchForUpdates(__APP_VERSION__, () => {
      removeUpdateNotice = showUpdateNotice(() => window.location.reload());
    });
  }
  api.onMap = id => {
    const changed = id !== mapId;
    if(changed){deliveryController?.destroy();deliveryController=undefined;deliveryHost?.destroy();deliveryHost=undefined;}
    if (changed) regionReady = false;
    mapId = id; pendingMap = undefined; mapConfirmed = true;
    if (!getExpedition(id)) level = getMap(id).level; localStorage.setItem('atlas.level', level);
    chatMessages.splice(0); players = []; renderChat();
    document.querySelector('#chat-region')!.textContent = getMap(id).name;
    document.querySelector<HTMLElement>('#game-shell')!.dataset.map = id;
    applyingWorldLocation = true;
    try { world.setMap(id); }
    finally { applyingWorldLocation = false; }
    interiorId = world.getInteriorId(); syncLocation(); updateProgress(); syncWorldMode();
    if (regionReady) queueMicrotask(() => onRegionReady(id));
  };
  api.onInterior = applyInterior;
  api.onClock = clock => world.setSharedClock(clock);
  api.onPlayers = (value, selfId) => {
    players = value; world.setPlayers(players, selfId); updateConnection();
    const key = JSON.stringify(players.map(player => [player.id, player.avatar]));
    if (key !== portraitPlayersKey) { portraitPlayersKey = key; renderChat(); }
  };
  api.onChat = message => { if (!chatMessages.some(m => m.id === message.id)) { chatMessages.push(message); if (chatMessages.length > 100) chatMessages.shift(); renderChat(); } };
  api.onStatus = value => {
    connection = value;
    if (value !== 'online' && pendingMap) {
      pendingMap = undefined; pendingDestination = undefined; pendingExpeditionGame = undefined;
    }
    syncAccessActivity(); syncWorldMode();
    updateConnection();
  };
  api.onError = message => { if (pendingMap) { pendingMap = undefined; pendingDestination = undefined; pendingExpeditionGame = undefined; syncWorldMode(); } toast(message, true); };
  showAccountDialog(`<div class="eyebrow">THE LANTERN ATLAS</div><h2 id="account-title">${t('Opening your adventure…')}</h2><p role="status">${t('Checking for your saved character.')}</p>`);
  try {
    const result = await api.resume();
    if (result) {
      profile = { name: result.player.name, avatar: result.player.avatar };
      account = result.account;
      if (account.registered || localStorage.getItem(`atlas.nameChosen.${result.player.id}`) === 'true') {
        enterGame(result);
        document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
      } else showNameEntry(true);
    } else showNameEntry();
  } catch {
    connection = 'offline'; updateConnection();
    showNameEntry(!!api.token);
    const error = document.querySelector<HTMLElement>('#account-error')!;
    error.textContent = t('The town could not connect. You can try starting again in a moment.');
  }
}
function updateConnection() {
  const el = document.querySelector('#connection-pill')!;
  const count = players.filter(player => (player.interiorId || undefined) === interiorId).length || 1;
  const stamp = `${connection}:${count}`;
  if (el.getAttribute('data-status') === stamp) return;
  el.setAttribute('data-status', stamp);
  el.className = `connection-pill ${connection}`;
  el.innerHTML = `<span></span>${connection === 'online' ? (count === 1 ? t('{count} wanderer here', { count }) : t('{count} wanderers here', { count })) : connection === 'connecting' ? t('Connecting') : connection === 'incompatible' ? t('Reload to continue') : connection === 'replaced' ? t('Active in another tab') : t('Reconnecting')}`;
}
document.addEventListener('visibilitychange', () => { syncAccessActivity(); updateAccessHud(); void sendAccessHeartbeat(accessIsActive()); accountReminder?.tick(performance.now(), started && !document.hidden && connection === 'online' && !document.querySelector<HTMLDialogElement>('#account-dialog')?.open); syncWorldMode(); if (document.hidden) { if(exerciseChoiceTimer){clearTimeout(exerciseChoiceTimer);exerciseChoiceTimer=undefined;pendingExerciseChoice=undefined;} activityController?.pause(); miniGameController?.pause(); deliveryController?.pause(); stopSpeech(); } else if(!accessBlocked(accessClock.snapshot(performance.now())) && !document.querySelector<HTMLDialogElement>('#account-dialog')?.open) { activityController?.resume(); miniGameController?.resume(); deliveryController?.resume(); } if (!document.hidden && regionReady) onRegionReady(mapId); });
window.addEventListener('beforeunload', () => { eventLog?.destroy(); removeFormNotifications?.(); removeSentenceTranslations(); stopUpdateChecks?.(); removeUpdateNotice?.(); exposureObserver?.disconnect(); if (exposureTimer !== undefined) clearTimeout(exposureTimer); if (reminderTimer !== undefined) clearInterval(reminderTimer); if (billingVerificationTimer !== undefined) clearTimeout(billingVerificationTimer); accountReminder?.tick(performance.now(), false); screenFilterControls?.destroy(); activityController?.destroy(); stopSpeech(); api.destroy(); world?.destroy(); });
void boot();
