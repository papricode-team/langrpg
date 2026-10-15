import { mountSupportBanner } from './support-session';
import { startAnalytics, trackAnalytics, browserAnalyticsEnabled, setBrowserAnalyticsEnabled } from './analytics-client';
import { castPortraitMarkup } from './cast-portrait';
import { pendingReferral, referralAvailable } from './referrals';
import { brandMarkup } from './branding';
import {applyWorldPatch,loadPublishedWorld,sceneContentVersion,sceneDocument} from './scene-data';
import { avatarPortraitMarkup, bakeAvatarPortrait, observeAvatarPortraits, updateSelfPortraits } from './avatar-portrait';
import { normalizeAvatar } from './character-recipe.mjs';
import { mountOptionalPlacement } from './placement-ui';
import { QuestController } from './quest-controller';
import { createGlossLookup } from './learning-context';
import { loadServerContent, loadQuestGraph, loadDialogueSentence, loadExercise, loadUnit, loadWords, loadRestoredWords, loadStoryContent, storyContentRemaining, loadContexts, loadNpcConversation, loadRegionContent, loadCinematic, hydrateNarratives, refreshBootstrap, runtimeReference, loadInterior, loadInteriorConversation, loadActivity, loadMiniGame, loadExpeditionEncounter, loadPlacement, invalidateContext, activeCourse, refreshQuestGraph } from './content-runtime';
import { contentApi, configureContentSession, getSentence } from './content-api';
import { mountCoursePlayer, mountCoursePicker } from './course-player';
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
import { mountLanguageOnboarding, onboardingLanguageSummary, onboardingStepsMarkup } from './onboarding';
import { localHour, type WorldTimeMode } from './world-clock';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/600.css';
import './style.css';
import './notifications.css';
import { Notifications, installFormNotifications } from './notifications';
import './course-ui.css';
import './game-ui.css';
import './game-menu.css';
import './menu-home.css';
import './expedition-games.css';
import './sentence-translations.css';
import { installSentenceTranslations, renderNarrative, type Narrative } from './sentence-translations';
import { renderTranslatedSentence, findSentence } from './translated-sentence';
import { getExpedition, getExpeditionNpc, getExpeditionEncounter, expeditionRegions } from './expeditions';
import { ExpeditionLearning, placementLearning } from './expedition-learning';
import { mountExpeditionEncounter } from './expedition-encounter';
import { expeditionGames, getExpeditionGame, expeditionGameStatus, expeditionNotebook, mountExpeditionGame } from './expedition-games';
import { adventureHome } from './game-panels';
import './interiors.css';
import './quest-cta.css';
import './hud.css';
import { World } from './world';
import type { Avatar, WorldPlayer, WorldMotion, WorldPresentation } from './world';
import { quests, npcs, vocabulary } from './content';
import type { Quest, Exercise, Level } from './content';
import { Api, emptyProgress } from './api';
import { EditBridge } from './world-edit-mode';
import { WorldEditOverlay } from './world-edit-overlay';
import { WorldEditSession } from './world-edit-session';
import { setDialogueLineEditor } from './dialogue-view';
import { watchForUpdates } from './app-updates';
import { showUpdateNotice } from './update-notice';
import type { Progress, ExposureInput, ConnectionStatus, SessionResult, AccountStatus, ExpeditionAnswerResult } from './api';
import { dueItems, modeFor, memoryLabel, practiceExercises, remainingQuestExercises, skipListeningExercises, attemptFeedback, shuffledSentenceTiles } from './learning';
import { AccountReminder, nameSuggestions } from './player-account';
import './player-account.css';
import { AccessClock, accessBlocked, billingURL, clearGameProgress, formatAccessTime, type BillingPlan, type GameAccess } from './game-access';
import './game-access.css';
import { reviewExercises,wordReadyForReview } from './review';
import { phrasePracticeQueue } from './phrase-practice';
import { refreshLearningMenu } from './menu-refresh';
import { ReviewAttempt } from './review-attempt';
import { learnerLevel, scaffoldStage, scaffoldText } from './typing-scaffold';
import type { AttemptSubmission, AttemptResult, RecallRating } from './review-attempt';
import { icon, escapeHtml as e } from './icons';
import turkishCoverage from './data/i18n/tr-coverage.json';
import { t, localized, localizedName, localizedExercise, localizedGrammar, lexemeMeaning, upper, lower, baseLanguage, baseLanguageNames, cachedBaseLanguage, setBaseLanguage, type BaseLanguage } from './i18n';
import { exerciseOptionsMarkup } from './exercise-options';
import { maps, getMap, isStoryMap } from './maps';
import type { MapId, WorldObjectSpec } from './maps';
import { actFor, clueFor, discoveredClues, journalNarratives, objectStories, storyActs } from './story';
import { activityDiscoveries } from './activity-stories';
import { ScreenFilterControls } from './screen-filter-controls';
import { MenuMemory, MenuNavigator, menuChromeMarkup, menuSections, sectionOf, viewLabel, type MenuPage, type MenuView } from './menu-navigation';
import { bindOptionRows, optionsMarkup, optionsTabs, type OptionRow, type OptionsTab } from './options-menu';
import { UiSounds } from './ui-sounds';
import { controlsHelpMarkup } from './menu-help';
import { accountCredentialRows, bindAccountCredentials } from './account-settings';
import './you-menu.css';
import { buildingEntrances, getInterior, getInteriorObject, interiorExercises, interiors } from './interiors';
import type { InteriorId, InteriorObjectSpec } from './interiors';
import { renderInteriorEncounter } from './encounter-panels';
import { createInteriorConversationState, chooseInteriorConversation, backInteriorConversation, replayInteriorConversation, renderInteriorConversation, interiorConversationFor, type InteriorConversationState } from './interior-conversations';
import { courseWordDetail, interiorWordDetail, renderWordDetail, type WordDetailModel } from './word-detail';
import { loadExerciseExample, renderCourseExample } from './course-examples';

import { miniGameDefinitions, miniGameById } from './minigames/catalogue';
import type { MiniGame } from './minigames/types';
import './minigames/minigames.css';
import { MiniGameInput } from './minigames/input';

const uiCheckRequest = import.meta.env.DEV ? new URLSearchParams(location.search).get('ui-check') : null;
const uiCheckSurface = uiCheckRequest && ['home','options','character','help','account','encounter','journal','activity','course','world'].includes(uiCheckRequest) ? uiCheckRequest : null;

type View = 'world' | MenuView;
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
const removeSentenceTranslations = installSentenceTranslations(document, sentence => {
  if (run) run.hinted = true;
  if (sentence.closest('.dialogue-layer')) questController?.recordWordHelp();
  const wordIds = getSentence(sentence.dataset.sentenceId ?? '')?.words.flatMap(word => word.lexemeId ? [word.lexemeId] : []) ?? [];
  if (wordIds.length) recordExposure({ wordIds: [...new Set(wordIds)].slice(0, 36) });
});
if (!uiCheckSurface) startAnalytics(() => api.token);
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
let entryTarget: 'de' | 'en' = sessionStorage.getItem('atlas.entryTarget') === 'en' ? 'en' : 'de';
let worldEdit: { bridge: EditBridge; overlay: WorldEditOverlay; session: WorldEditSession } | undefined;
let shellLanguage: BaseLanguage = 'en';
let entryLanguage: BaseLanguage | undefined;
let entryLanguageSelection: BaseLanguage | undefined;
let entryDraft: { name: string; avatar: Avatar } | undefined;
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
  if (uiCheckSurface || !started || heartbeatBusy) return;
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
let menuPageOpen = true;
let menuNavigator: MenuNavigator | undefined;
let optionsTab: OptionsTab = 'audio';
let unbindOptions: (() => void) | undefined;
function playablePractice<T extends Exercise>(exercises: readonly T[]): T[] {
  return practiceExercises(exercises, silentMode, writingReady());
}
function showOpeningPracticeNotice(placement = false) {
  cancelRun();
  setView('world');
  openDialog(`<div class="course-intro"><h2>${t('Listen, look and choose.')}</h2><p>${placement ? t('Start with A1 German and get comfortable in the town. The optional level sample opens after your first ten minutes of play.') : t('Writing practice opens after your first ten minutes of play. For now, discover the town through listening and simple choices. Your completed answers are saved.')}</p><button class="primary-button" data-action="close-dialog">${t('Keep exploring')} ${icon('arrow')}</button></div>`, 'course-dialog');
}
function silentModeButton() {
  return `<button class="outline-button silent-mode-button" data-action="silent-mode" aria-pressed="${silentMode}">${icon(silentMode ? 'muted' : 'volume')} ${silentMode ? t('Silent mode on') : t('Silent mode off')}</button>`;
}
let speechRate = Number(localStorage.getItem('atlas.speechRate') || '0.82');
if (![0.65, 0.82, 1].includes(speechRate)) speechRate = 0.82;
let world: World;
let notifications: Notifications | undefined;
let removeFormNotifications: (() => void) | undefined;
let screenFilterControls: ScreenFilterControls | undefined;
type Submission = AttemptSubmission;
let run: { quest?: Quest; unitId?: string; queue: Exercise[]; index: number; correct: number; targetCount: number; hinted: boolean; audioHeard: boolean; answered: boolean; answer: string; tokenOrder: number[]; review: boolean; objectId?: string; interiorObjectId?: string; label?: string; started: number; submission?: Submission; reviewAttempt?: ReviewAttempt; skipListening?: boolean; shownAt?: number } | undefined;
let attemptBusy = false;
function cancelRun() { exerciseInputCleanup?.();exerciseInputCleanup=undefined;if(exerciseChoiceTimer){clearTimeout(exerciseChoiceTimer);exerciseChoiceTimer=undefined;}pendingExerciseChoice=undefined;run?.reviewAttempt?.cancel(); run = undefined; }
let progressOwner: string | undefined;
let bootstrapRefresh: Promise<void> | undefined;
function entitlementKey(value: Progress): string {
  return JSON.stringify([value.completedQuestIds, value.completedUnitIds, value.intake?.wordIds, value.story?.inspections, value.story?.choices, value.story?.inventory, value.story?.ending]);
}
function acceptProgress(value: Progress, owner?: string) {
  const previousEntitlements = entitlementKey(progress);
  if (owner && progressOwner !== owner) { attemptedCinematics.clear(); progressOwner = owner; progress = emptyProgress(); exposedContexts.clear(); }
  const previous = progress;
  if (progressStore.replace(value, owner ?? progressOwner)) {
    progress = progressStore.get();
    if (started && !owner) {
      const gained = progress.xp - previous.xp;
      if (gained > 0) toast(t('+{count} XP', {count:gained}));
    }
    if (started && activeCourse?.target === 'de' && previousEntitlements !== entitlementKey(progress)) {
      bootstrapRefresh ??= refreshBootstrap().then(async () => { await loadRestoredWords(progress); updateProgress(); if (view !== 'world') refreshLearningMenu(document.querySelector<HTMLElement>('#other-view')!,renderOther); }).catch(error => toast(error.message, true)).finally(() => { bootstrapRefresh = undefined; });
    }
  }
}
const exposedContexts = new Set<string>();
const pendingWordExposures = new Set<string>();
let exposureObserver: IntersectionObserver | undefined;
let exposureTimer: number | undefined;
function recordExposure(input: ExposureInput) {
  if (uiCheckSurface || connection !== 'online') return;
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
  notifications?.notify(message, bad);
}
function renderShell() {
  shellLanguage = baseLanguage();
  screenFilterControls?.destroy();
  app.innerHTML = `
    <main class="game-shell" id="game-shell" data-view="world" data-map="lindenhafen">
      <section id="explore-view" class="world-stage" aria-label="Lindenhafen"><div id="world-container" aria-label="${e(t('Game world. Use WASD, arrow keys, or the joystick to move. Press E to interact.'))}" tabindex="0"></div></section>
      <div class="world-vignette" aria-hidden="true"></div>
      <div class="game-hud" id="game-hud">
        <div class="access-hud" id="access-hud" hidden><span class="access-clock-icon">${icon('clock')}</span><div><span id="access-label">Free play</span><strong id="access-time" role="timer">05:00</strong></div><button type="button" id="access-button">Login</button><button type="button" id="access-invite" hidden>Invite a friend</button></div>
        <div class="player-hud"><button class="player-medallion" data-view="character" aria-label="${e(t('Edit your character'))}">${portrait('self')}<span class="medallion-gem" aria-hidden="true"></span></button><div class="player-details"><span class="player-name" id="profile-name">${e(profile.name)}</span><span class="player-meta"><span id="hud-level">A1 · ${e(titleLabel('Wanderer'))}</span><span class="xp-badge"><strong id="xp-value">0</strong> XP</span></span><span class="player-progress" role="progressbar" id="chapter-progress" aria-label="${e(t('Chapter stories discovered'))}" aria-valuemin="0" aria-valuemax="6" aria-valuenow="0"><span id="chapter-fill"></span></span></div></div>
        <div class="location-banner" id="location-banner"><span class="location-title" id="location-title">${e(getMap(mapId).name)}</span><span class="location-subtitle" id="location-subtitle">${e(localized(getMap(mapId).subtitle))}</span></div>
        <aside class="quest-tracker" id="quest-tracker" aria-label="${e(t('Next story objective'))}"><div id="quest-panel"></div></aside>

        <div class="game-controls-hint" hidden><kbd>WASD</kbd><span>${t('Move')}</span><b>·</b><kbd>E</kbd><span>${t('Interact')}</span><b>·</b><kbd>M</kbd><span>${t('Atlas')}</span></div>
        <button class="game-menu-button" data-view="menu" aria-label="${e(t('Open game menu'))}">${icon('lantern')}<span>${t('Menu')}</span><kbd class="menu-keyboard-glyph" aria-hidden="true">Esc</kbd><i id="review-dot" hidden></i></button>
        <button type="button" class="world-edit-button" id="world-edit-button" data-action="edit-world" aria-pressed="false" hidden>Edit</button>
        <a class="admin-analytics-link" id="admin-analytics-link" href="/admin.html" hidden>Admin</a>
        <div class="touch-controls"><div class="joystick" id="joystick" role="group" aria-label="${e(t('Touch movement joystick'))}"><span class="joystick-ring"></span><span class="joystick-axis"></span><span class="joystick-knob" id="joystick-knob">${icon('compass')}</span></div><button class="talk-button" id="talk-button" data-action="talk" aria-label="${e(t('Interact with something nearby'))}" hidden disabled>${icon('chat')}<span id="nearby-name"></span></button></div>
      </div>
      <div class="world-watch-caption"><span>${t('A moment in {place}', { place: '<strong id="watch-region">Lindenhafen</strong>' })}</span><span id="watch-time">12:00 · ${upper(t('Day'))}</span><button data-action="stop-watching">${t('Return to exploring')} <kbd>ESC</kbd></button></div>
      <dialog class="menu-layer" id="menu-layer" aria-labelledby="menu-title" data-input="pointer" data-menu-page="page" hidden><div class="menu-frame"><div id="menu-chrome"></div><div id="other-view" class="menu-content" tabindex="-1"></div></div></dialog>
    </main><dialog id="dialog" class="dialog" aria-label="${e(t('Adventure encounter'))}"></dialog><dialog id="account-dialog" class="dialog account-dialog" aria-labelledby="account-title"></dialog>`;
  notifications?.destroy();
  notifications = new Notifications();
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
    portrait: (id, expression) => portrait(id, '', expression), speak, stopSpeech, audioEnabled: () => !silentMode, setAudioEnabled: enabled => setSilentMode(!enabled, false),
    loadGraph: loadQuestGraph, loadSentence: loadDialogueSentence, loadExercise,
    grammar: questId => grammarForQuest(questId,course?.courseGrammar),
    wasHinted: questId => progress.story?.flags[`hint:${questId}`]===true || localStorage.getItem(`atlas.sceneHinted.${api.selfId}.${questId}`)==='true',
    onOpen: speaker => { dialogueOpen = true; document.querySelector('#game-shell')!.classList.add('dialogue-open'); world.setConversationTarget(speaker || undefined); syncWorldMode(); },
    onClose: () => { dialogueOpen = false; document.querySelector('#game-shell')!.classList.remove('dialogue-open'); world.setConversationTarget(undefined); syncWorldMode(); document.querySelector<HTMLElement>('#world-container')!.focus(); if (pendingStoryBeat) queueMicrotask(() => void playPendingCinematic()); },
    onProgress: value => { acceptProgress(value); updateProgress(); },
    onInvestigate: graph => { investigationQuest = graph.questId; updateProgress(); const next = nextInvestigation(graph); if (next) { world.focusObject(investigationWorldId(next)); toast(t('Read the evidence, then return to the witness.')); } else { const q = quests.find(q => q.id === graph.questId)!; world.focusNpc(q.npcId); toast(t('The evidence is saved. Return to {name}.', { name: localizedName(npcs.find(npc => npc.id === q.npcId)!.name) })); } },
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
  document.querySelector<HTMLElement>('#other-view')!.addEventListener('scroll',event=>{(event.currentTarget as HTMLElement).dataset.scrolled=String((event.currentTarget as HTMLElement).scrollTop>32);},{passive:true});
  menuNavigator?.destroy();
  menuNavigator = new MenuNavigator({
    root: document.querySelector<HTMLElement>('#menu-layer')!,
    isOpen: () => view !== 'world' && !document.querySelector<HTMLDialogElement>('#dialog')!.open && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open,
    canOpen: () => worldCanInteract(),
    open: () => setView('menu'),
    close: () => setView('world'),
    section: step => { if (view !== 'world') setView(menuMemory.neighbour(view, step), false); },
    backPage: backMenuPage,
    sound: kind => uiSounds.play(kind),
    onModeChange: () => menuNavigator?.refreshGlyphs(),
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
  document.querySelector<HTMLButtonElement>('#access-invite')!.onclick = () => void showInviteFriend();
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
  const insideNpcName = inside?.npcId ? npcs.find(item => item.id === inside.npcId)?.name : undefined;
  const insideName = insideNpcName ? localizedName(insideNpcName) : inside?.label;
  const name = entrance?.label ?? insideName ?? (exit ? getInterior(exit).name : object?.label ?? (npc ? localizedName(npc.name) : undefined));
  const button = document.querySelector<HTMLButtonElement>('#talk-button')!;
  button.disabled = !name;
  button.hidden = !name;
  document.querySelector('#nearby-name')!.textContent = name ?? '';
  button.setAttribute('aria-label', name ? (entrance ? t('Enter {name}', { name }) : exit ? t('Leave {name}', { name }) : talking ? t('Talk to {name}', { name }) : t('Inspect {name}', { name })) : t('Move closer to interact'));
}
function syncLocation() {
  const room = interiorId ? getInterior(interiorId) : undefined, region = getMap(mapId);
  const shell = document.querySelector<HTMLElement>('#game-shell')!;
  if (room) shell.dataset.interior = room.id;
  else delete shell.dataset.interior;
  showArrival(room?.name ?? region.name, room ? t('Inside {place}', { place: region.name }) : localized(region.subtitle));
  document.querySelector('#watch-region')!.textContent = room?.name ?? region.name;
  document.querySelector('#explore-view')!.setAttribute('aria-label', room ? t('{place} interior', { place: room.name }) : region.name);

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
    const wordIds = (exercise as Exercise & { wordIds?: string[] }).wordIds;
    if (wordIds?.some(wordId => !introducedSet().has(wordId))) return [];
    if (course && missingWordCount(course.courseContextWordIds[exercise.id] ?? [], progress)) return [];
    return [exercise.mode === 'sentence' && hasSuccessfulEncounter(exercise.itemId) ? { ...exercise, mode: 'type' as const, prompt: t('Write in German: {english}', { english: localizedExercise(exercise).english }) } : exercise];
  }));
}
async function showInteriorObject(id: string) {
  const generation = ++interiorLoading;
  if (interiorId) { try { await loadInterior(interiorId); } catch (error) { toast((error as Error).message, true); return; } }
  if (interiorId === 'inn') {
    if (id === 'interior:inn:review') { void startAdaptiveReview(); return; }
    if (id === 'interior:inn:evidence') { setView('story'); return; }
    if (id === 'interior:inn:bed') { openDialog(`<div class="completion">${portrait('self')}<h2>${t('The lantern can rest.')}</h2><p>${t('Give a few familiar words another moment, or let the day end. Your discoveries stay with you.')}</p><button class="primary-button" data-action="review">${t('Evening review')} ${icon('leaf')}</button><button class="outline-button" data-action="sleep">${t('Sleep and begin tomorrow')} ${icon('clock')}</button>${miniGameHostLinks("re-ink")}<button class="text-button" data-action="close-dialog">${t('Keep exploring')}</button></div>`, 'inn-dialog'); return; }
  }
  const object = getInteriorObject(id), room = interiorId ? getInterior(interiorId) : undefined;
  if (!object || !room || !room.objects.some(item => item.id === id)) return;
  const npc = object.npcId ? npcs.find(item => item.id === object.npcId) : undefined;
  if (npc) recordExposure({npcId:npc.id});
  const miniGameId = id === 'interior:cafe:coffee' ? 'tray-rush' : id === 'interior:cafe:tea' ? 'kettle-forecast' : id === 'interior:supermarket:scales' ? 'numbered-apples' : room.id === 'cafe' || room.id === 'bakery' ? 'tray-rush' : room.id === 'supermarket' ? 'numbered-apples' : 're-ink';
  const miniGame = miniGameId ? miniGameById.get(miniGameId) : undefined;
  try { await loadInteriorConversation(id); } catch (error) { toast((error as Error).message, true); return; }
  if (generation !== interiorLoading || interiorId !== room.id) return;
  interiorConversation = undefined;
  openDialog(renderInteriorEncounter({room,object,portraitMarkup:npc?portrait(npc.id,'large-portrait'):undefined,miniGame:miniGame?{id:miniGame.id,title:miniGame.title}:undefined}), 'interior-dialog', npc?.id);
}
async function startInteriorPractice(id: string) {
  const generation = ++interiorLoading;
  if (interiorId) { try { await loadInterior(interiorId); } catch (error) { toast((error as Error).message, true); return; } }
  const object = getInteriorObject(id), room = interiorId ? getInterior(interiorId) : undefined;
  if (!object || !room || !room.objects.some(item => item.id === id)) return;
  try {
    for (const exerciseId of object.exerciseIds.slice(0, 8)) {
      try { await loadExercise(exerciseId); }
      catch (error) { if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error; }
    }
  } catch (error) { toast((error as Error).message, true); return; }
  if (generation !== interiorLoading || interiorId !== room.id) return;
  const queue = interiorPracticeQueue(object);
  if (!queue.length) { startInteriorConversation(id); return; }
  if (connection !== 'online') { toast(t('The town is reconnecting. Try this session again in a moment.'), true); return; }
  setView('world');
  run = { queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:true, interiorObjectId:id, label:`${room.name} · ${object.sessionTitle}`, started:Date.now() };
  openDialog('', 'quest-dialog interior-practice-dialog', object.npcId); renderExercise();
}
let interiorConversation: InteriorConversationState | undefined;
let interiorLoading = 0;
async function startInteriorConversation(id: string) {
  const generation = ++interiorLoading;
  try { await loadInteriorConversation(id); } catch (error) { toast((error as Error).message, true); return; }
  if (generation !== interiorLoading) return;
  interiorConversation = createInteriorConversationState(id);
  if (!interiorConversation) return;
  cancelRun();
  await renderInteriorConversationDialog();
}
async function renderInteriorConversationDialog() {
  const state = interiorConversation; if (!state) return;
  try { await loadInteriorConversation(state.objectId, state.nodeId); } catch (error) { toast((error as Error).message, true); return; }
  if (state !== interiorConversation) return;
  const conversation = interiorConversationFor(state.objectId);
  openDialog(renderInteriorConversation(state,{portraitMarkup:conversation?portrait(conversation.npcId,'large-portrait'):undefined}), 'interior-dialog', conversation?.npcId);
  document.querySelector<HTMLElement>('[data-interior-choice], [data-interior-conversation="replay"]')?.focus();
}
let wordDetailReturn: (() => void) | undefined;
function showWordDetail(model: WordDetailModel, source = '') {
  const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
  const alreadyOpen = dialog.classList.contains('word-detail-dialog') && dialog.open;
  const previous = !alreadyOpen && dialog.open ? {html:dialog.innerHTML,className:dialog.className,focus:document.activeElement as HTMLElement|null} : undefined;
  if (!alreadyOpen) wordDetailReturn = previous ? () => {
    dialog.className=previous.className; dialog.innerHTML=previous.html; dialog.scrollTop=0;
    const wordId = previous.focus?.dataset.interiorWord;
    dialog.querySelector<HTMLElement>(wordId ? `[data-interior-word="${CSS.escape(wordId)}"][data-word-index="${previous.focus!.dataset.wordIndex}"]` : '.primary-button')?.focus();
  } : () => { dialog.close(); document.querySelector<HTMLElement>(`[data-open-word="${CSS.escape(model.id)}"], [data-open-phrase="${CSS.escape(model.id)}"]`)?.focus(); };
  const original = alreadyOpen ? dialog.querySelector('.word-detail-source')?.innerHTML ?? source : previous ? previous.html.replace(/<button class="dialog-close"[^>]*>.*?<\/button>/s,'') : source;
  openDialog(`<div class="word-detail-layout">${original?`<div class="word-detail-source">${original}</div>`:''}<div class="word-detail-pane">${renderWordDetail(model,{backAction:'return'})}</div></div>`, 'word-detail-dialog');
  dialog.querySelector<HTMLElement>('.word-detail-heading h2')?.setAttribute('tabindex','-1');
  dialog.querySelector<HTMLElement>('.word-detail-heading h2')?.focus();
}
async function openCourseWord(id: string) {
  const module = await loadCourse(); const word=module.lexemeById.get(id); if(!word)return;
  const memory=progress.words[id];
  const example=quests.flatMap(quest=>quest.exercises).find(ex=>module.courseContextWordIds[ex.id]?.includes(id)&&(ex.german.match(/\p{L}+/gu)?.length??0)>=3);
  const details=memory?(['recognition','listening','production'] as const).flatMap(mode=>memory.evidence[mode]?.attempts?[{label:mode==='recognition'?t('Read'):mode==='listening'?t('Hear'):t('Recall'),value:memory.evidence[mode].status==='retained'?t('retained'):t('growing')}]:[]):[];
  const narrative=await loadExerciseExample(example);
  showWordDetail(courseWordDetail(word,{example:narrative,details}),document.querySelector('.lexicon-list')?.innerHTML??lexemeCards([word]));
}
async function openInteriorWord(objectId: string, index: number): Promise<void> {
  const object = getInteriorObject(objectId); if (!object) return;
  const word = object.vocabulary[index]; if (!word) return;
  try {
    await loadInteriorConversation(objectId);
    const wordId = (word as typeof word & { lexemeId?: string }).lexemeId;
    if (wordId) await loadWords([wordId]);
    const model = interiorWordDetail(object, index, wordId ? course?.lexemeById.get(wordId) : undefined);
    if (model) showWordDetail(model);
  } catch (error) { toast((error as Error).message, true); }
}
function openPhrase(id: string) {
  const phrase=vocabulary.find(item=>item.id===id);if(!phrase)return;
  const memory=progress.items[id];
  const sample=quests.flatMap(quest=>quest.exercises).find(ex=>ex.german===phrase.example);
  showWordDetail({id,article:'',lemma:phrase.german,meaning:localized({german:phrase.german,english:phrase.english}),example:sample?[{german:sample.german,english:localizedExercise(sample).english,localized:true}]:undefined,details:memory?[{label:t('Memory'),value:memoryLabel(memory.repetitions,memory.stabilityDays)}]:[],practice:{kind:'phrase',id}});
}
async function practisePhrase(id: string) {
  const exercise=phrasePracticeQueue(id,progress,quests,{silent:silentMode,writingReady:writingReady(),contextWords:course?.courseContextWordIds})[0];
  if(!exercise){toast(t('This word is resting. There is a new adventure waiting.'));return;}
  if(connection!=='online'){toast(t('The town is reconnecting. Try again in a moment.'),true);return;}
  setView('world');run={queue:[exercise],index:0,correct:0,targetCount:1,hinted:false,audioHeard:false,answered:false,answer:'',tokenOrder:[],review:true,label:t('Story expressions'),started:Date.now()};
  openDialog('','quest-dialog');renderExercise();
}
function placesSection() {
  const entrances = buildingEntrances(mapId);
  if (!entrances.length) return '';
  return `<section class="interior-places"><h3>${t('Places')}</h3><div class="interior-place-list">${entrances.map(entrance=>{const room=getInterior(entrance.interiorId);return `<button data-focus-building="${room.id}">${icon(interiorIcon(room.id))}<strong>${e(room.name)}</strong>${icon('chevron')}</button>`;}).join('')}</div></section>`;
}
function nextInvestigation(graph: QuestGraph) { return graph.investigations.find(item => !(progress.story?.inspections?.[graph.questId] ?? []).includes(item.objectId)); }
function investigationWorldId(item: QuestGraph['investigations'][number]): string { return (item as typeof item & { worldId?: string }).worldId ?? item.objectId; }
function updateProgress() {
  if (!quests.length || !started || activeCourse?.target !== 'de') return;
  const savedStory = storyState(progress.story);
  const rewards = lanternRewards(progress);
  document.querySelector<HTMLElement>('#game-shell')!.dataset.crest = rewards.crest;
  updatePlayerHud(titleLabel(rewards.title));
  world.setStoryState({ completedQuestIds: progress.completedQuestIds, bellCount: savedStory.bell, flags: savedStory.flags, playerName: profile.name });
  if (course) world.setLearningContext(course.courseLexicon,progress,introducedSet(),barkLineAllowed);
  const expedition = getExpedition(mapId);
  if (expedition) {
    const game = getExpeditionGame(mapId);
    if (!game) { document.querySelector('#quest-panel')!.innerHTML = storyBeacon({ attributes: `data-expedition-game="${expedition.id}"`, glyph: 'compass', label: expedition.name, text: t('Build the plan') }); return; }
    const status = expeditionGameStatus(mapId, level, progress.story?.expeditionPlans ?? {});


    world.setObjective(interiorId ? undefined : expedition.npcs.find(npc => !expeditionEncounterResult(npc.encounterId)?.correct)?.id);
    document.querySelector('#quest-panel')!.innerHTML = storyBeacon({ attributes: `data-expedition-game="${expedition.id}"`, glyph: status === 'completed' ? 'check' : 'compass', label: expedition.name, text: game.title });
    document.querySelector<HTMLElement>('#review-dot')!.hidden = !dueItems(progress).length;
    if (['journal', 'quests', 'story', 'menu'].includes(view)) refreshLearningMenu(document.querySelector<HTMLElement>('#other-view')!,renderOther);
    return;
  }
  const q = currentQuest();
  const npc = npcs.find(n => n.id === q.npcId) ?? npcs[0];
  const done = completedAtLevel(level), total = quests.filter(x => x.level === level).length;


  const finished = done === total && progress.completedQuestIds.includes(q.id);
  const graph = questGraph(q.id);
  if (graph && !investigationQuest && (savedStory.inspections[q.id]??[]).length && (savedStory.nodes[q.id]??graph.start)===graph.nodes.find(node => node.stage === 'intro')?.id) investigationQuest=q.id;
  const investigation = investigationQuest === q.id && graph ? nextInvestigation(graph) : undefined;
  world.setObjective(finished || interiorId || q.level !== level ? undefined : investigation ? `object:${investigationWorldId(investigation)}` : q.npcId);
  const nextAct = storyActs[storyActs.findIndex(item => item.mapId === mapId) + 1];
  const objective = finished ? nextAct ? t('Travel to {place}',{place:getMap(nextAct.mapId).name}) : t('Read your discoveries') : investigation ? t('Inspect {name}',{name:findObject(investigationWorldId(investigation))?.label??t('the evidence')}) : t('Speak with {name}',{name:localizedName(npc.name)});
  document.querySelector('#quest-panel')!.innerHTML = interiorId
    ? storyBeacon({ attributes: 'data-action="leave-interior"', glyph: 'arrow', label: getMap(mapId).name, text: t('Leave {name}', { name: getInterior(interiorId).name }), quiet: true })
    : storyBeacon({ attributes: 'data-action="next-objective"', glyph: finished ? 'map' : 'flag', label: finished ? t('Chapter complete') : t('Follow the story'), text: objective, bell: savedStory.bell > 0 && savedStory.bell < 7 ? savedStory.bell : undefined });
  document.querySelector<HTMLElement>('#review-dot')!.hidden = !dueItems(progress).length;
  if (view === 'journal' || view === 'quests' || view === 'story' || view === 'menu') refreshLearningMenu(document.querySelector<HTMLElement>('#other-view')!,renderOther);
}
/** The next story step is the one golden action over the world; indoors it quietens to a way back out. */
function storyBeacon(options: { attributes: string; glyph: string; label: string; text: string; bell?: number; quiet?: boolean }): string {
  const { attributes, glyph, label, text, bell, quiet } = options;
  return `<button class="story-beacon${quiet ? ' quiet' : ''}" ${attributes}><span class="beacon-mark" aria-hidden="true">${quiet ? '' : '<span class="quest-spark"></span>'}${icon(glyph)}</span><span class="beacon-copy"><span class="beacon-label">${e(label)}</span><strong class="objective-text">${e(text)}</strong></span>${bell ? `<span class="objective-bell" aria-label="${e(t('The seventh bell'))}">${icon('clock')}${bell}/7</span>` : ''}${quiet ? '' : icon('chevron', 'beacon-chevron')}</button>`;
}
function updatePlayerHud(title: string) {
  const done = completedAtLevel(level), total = quests.filter(item => item.level === level).length || 1;
  document.querySelector('#profile-name')!.textContent = profile.name;
  document.querySelector('#hud-level')!.textContent = `${level} · ${title}`;
  document.querySelector('#xp-value')!.textContent = String(progress.xp);
  document.querySelector<HTMLElement>('#chapter-fill')!.style.width = `${Math.round(done / total * 100)}%`;
  const bar = document.querySelector<HTMLElement>('#chapter-progress')!;
  bar.setAttribute('aria-valuenow', String(done)); bar.setAttribute('aria-valuemax', String(total));
}
function syncTrackerState() { /* The objective chip opens a focused encounter instead of expanding across the world. */ }
let arrivalTimer: ReturnType<typeof setTimeout> | undefined;
let arrivalName = '';
/** The location banner stays as a quiet caption and swells briefly whenever the player arrives somewhere new. */
function showArrival(name: string, subtitle: string) {
  const banner = document.querySelector<HTMLElement>('#location-banner');
  if (!banner) return;
  banner.querySelector('#location-title')!.textContent = name;
  banner.querySelector('#location-subtitle')!.textContent = subtitle;
  if (name === arrivalName) return;
  arrivalName = name;
  if (arrivalTimer) clearTimeout(arrivalTimer);
  banner.classList.remove('arriving'); void banner.offsetWidth; banner.classList.add('arriving');
  arrivalTimer = setTimeout(() => banner.classList.remove('arriving'), 3200);
}
function showFirstControls() {
  const hint = document.querySelector<HTMLElement>('.game-controls-hint');
  if (!hint || sessionStorage.getItem('atlas.controls-seen')) return;
  sessionStorage.setItem('atlas.controls-seen', 'true');
  hint.hidden = false;
  setTimeout(() => { hint.hidden = true; }, 60_000);
}
let menuFocus: HTMLElement | null = null;
function worldCanInteract() { return started && !accessBlocked(accessClock.snapshot(performance.now())) && (!deliveryController||deliveryController.canMove) && connection === 'online' && !cinematicActive && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open && view === 'world' && !watchingWorld && !pendingMap && !screenFilterControls?.isOpen() && !document.querySelector<HTMLDialogElement>('#dialog')!.open && !dialogueOpen && !questController?.isOpen; }
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
    const presentation: WorldPresentation = uiCheckSurface ? 'hidden' : document.hidden || document.querySelector<HTMLDialogElement>('#account-dialog')!.open || started && accessBlocked(accessClock.snapshot(performance.now())) || view !== 'world' ? 'paused' : covered ? 'hidden' : 'live';
    if (worldInput && !input) document.dispatchEvent(new Event('atlas-controls-reset'));
    worldInput = input;
    world.setInputEnabled(input);
    world.setPresentation(presentation);
    if (presentation !== 'live') deliveryController?.pause();
    else if (!document.hidden && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open) deliveryController?.resume();
  } finally { syncingWorld = false; }
}
function setView(next: View, openPage = true) {
  menuPageOpen = openPage;
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
    renderMenuChrome();
    menuNavigator?.focusTab();
    const content = document.querySelector<HTMLElement>('#other-view')!;
    renderOther(); content.scrollTop = 0;
    if (['story', 'menu', 'quests'].includes(next) && previous !== next) void loadStoryPage();
    if (next === 'activities') void Promise.all([loadContexts('activityDefinitions'), loadContexts('expeditionGame')]).then(() => { if (view === next) refreshLearningMenu(content, renderOther); }).catch(error => toast(error.message, true));
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
  if (sectionOf(view).id === 'you') return [
    {label:t('Character'),attributes:'data-view="character"',selected:view==='character'},
    ...optionsTabs.map(tab => ({label:tab.label(),attributes:`data-options-tab="${tab.id}"`,selected:view==='settings'&&tab.id===optionsTab})),
    {label:t('Controls & help'),attributes:'data-view="help"',selected:view==='help'},
  ];
  return sectionOf(view).views.map(item => ({label:viewLabel(item),attributes:`data-view="${item}"`,selected:item===view}));
}
function renderMenuChrome() {
  if (view === 'world') return;
  const pages = menuPages();
  if (pages.length < 2) menuPageOpen = true;
  const menu = document.querySelector<HTMLElement>('#menu-layer')!;
  menu.dataset.menuPage = menuPageOpen ? 'page' : 'hub';
  document.querySelector<HTMLElement>('.menu-frame')!.dataset.menuPage = menu.dataset.menuPage;
  document.querySelector('#menu-chrome')!.innerHTML = menuChromeMarkup({view,memory:menuMemory,mode:menuNavigator?.mode??'pointer',pages,pageOpen:menuPageOpen,offline:connection!=='online'});
}
function backMenuPage(): boolean {
  if (!window.matchMedia('(max-width: 600px)').matches || !menuPageOpen || menuPages().length < 2) return false;
  menuPageOpen = false; renderMenuChrome();
  document.querySelector<HTMLElement>('.menu-page.selected')?.focus();
  return true;
}
function openWorldMap() { setView('atlas'); }
function openScreenFilters(trigger?: HTMLElement) {
  if (watchingWorld) watchWorld(false);
  if (view !== 'world') setView('world');
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
    await loadCinematic(kind, mapId, progress.story?.ending);
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
const loadedRegions = new Set<string>();
const loadingRegions = new Set<string>();
function onRegionReady(id: MapId) {
  if (!started || !mapConfirmed || id !== mapId || view !== 'world' || document.hidden || document.querySelector<HTMLDialogElement>('#account-dialog')!.open || document.querySelector<HTMLDialogElement>('#dialog')!.open) return;
  if (!loadedRegions.has(id)) {
    if (!loadingRegions.has(id)) {
      loadingRegions.add(id);
      void loadRegionContent(id).then(() => { loadedRegions.add(id); updateProgress(); onRegionReady(id); }).catch(error => toast(error.message, true)).finally(() => loadingRegions.delete(id));
    }
    return;
  }
  if (cinematicActive) return;
  if (!worldCanInteract()) return;
  if (pendingStoryBeat || pendingTravelBeat || id === 'lindenhafen' && !progress.completedQuestIds.includes('a1-arrival') && !progress.story?.flags['cinematic:arrival'] && !attemptedCinematics.has('arrival')) { void playPendingCinematic().then(() => { if (id === mapId) onRegionReady(id); }); return; }
  if (!readSeen('acts').includes(id)) { rememberSeen('acts', id); const q = currentQuest(); if (!getExpedition(id)) { world.focusNpc(q.npcId); toast(t('Find {name} to begin Act {act}.', { name: localizedName(npcs.find(npc => npc.id === q.npcId)!.name), act: actFor(id).number })); } else showActIntro(id); return; }
  continueDestination();
}
async function showActIntro(id: MapId) {
  const expedition = getExpedition(id);
  if (expedition) {
    const map = getMap(id), game = getExpeditionGame(id)!;
    rememberSeen('acts', id);
    openDialog(`<div class="act-intro" style="--region-art:url('${map.previewAsset}')"><div class="act-art"><span>${t('EXPEDITION')} · A1 / A2 / B1</span></div><div class="act-copy"><h2>${e(expedition.name)}</h2><details class="lore-detail"><summary>${e(t('Read opening'))}</summary><p>${e(expedition.description)}</p><p>${e(expedition.culture)}</p></details><div class="story-objective">${icon('flag')}<span>${e(game.summary)}</span></div><button class="primary-button" data-action="act-begin">${e(t('Explore {place}', { place: expedition.name }))} ${icon('arrow')}</button></div></div>`, 'act-dialog');
    return;
  }
  const act = await hydrateNarratives(actFor(id)), map = getMap(id);
  rememberSeen('acts', id);
  openDialog(`<div class="act-intro" style="--region-art:url('${map.previewAsset}')"><div class="act-art"><span>${e(upper(t('Act {number}', { number: act.number })))} · ${act.level}</span></div><div class="act-copy"><h2>${e(localized(act.title))}</h2><details class="lore-detail"><summary>${e(t('Read opening'))}</summary>${act.introduction.map(p => `<p>${renderNarrative(p)}</p>`).join('')}</details><div class="story-objective">${icon('flag')}<span>${renderNarrative(act.goal)}</span></div><button class="primary-button" data-action="act-begin">${e(t('Step into {place}', { place: map.name }))} ${icon('arrow')}</button></div></div>`, 'act-dialog');
}
const factionNotes: Record<string, () => string> = { brassOffice: () => t('The Brass Office noted that.'), lamplighters: () => t('The Lamplighters will remember this.'), unwritten: () => t('The Unwritten Circle will remember this.') };
function consequenceNote(effects: readonly { faction?: string }[] = []): string {
  const note = effects.map(effect => effect.faction ? factionNotes[effect.faction]?.() : undefined).find(Boolean);
  return note ? ` · ${note}` : '';
}
/** Until her name is revealed in the parcel scene, the notes are signed only "E.". */

function eliseLetter(letter: Narrative, questId: string): string {
  const unsignedQuests = quests.slice(0, quests.findIndex(quest => quest.id === 'a1-lost-parcel')).map(quest => quest.id);
  return letter.length ? `<blockquote class="elise-letter"><span>${t('A note from {name}', { name: unsignedQuests.includes(questId) ? 'E.' : 'Elise' })}</span>${renderNarrative(letter)}<span class="elise-signature">— ${unsignedQuests.includes(questId) ? 'E.' : 'Elise'}</span></blockquote>` : '';
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
    openDialog(`<div class="completion"><div class="completion-mark">${icon('map')}</div><h2>${nextAct ? e(t('Beyond {place}', { place: getMap(mapId).name })) : t('Three towns. One new promise.')}</h2><p>${renderNarrative(act.cliffhanger)}</p>${nextAct ? `<button class="primary-button" data-travel="${nextAct.mapId}">${e(t('Travel to {place}', { place: getMap(nextAct.mapId).name }))} ${icon('arrow')}</button>` : `<button class="primary-button" data-view="story">${t('Read your discoveries')}</button>`}<button class="text-button" data-action="close-dialog">${t('Keep exploring here')}</button></div>`); return;
  }
  const graph = questGraph(q.id), target = investigationQuest === q.id && graph ? nextInvestigation(graph) : undefined;
  if (target) { world.focusObject(investigationWorldId(target)); toast(t('Read {thing}, then return to the witness.', { thing: findObject(investigationWorldId(target))?.label ?? t('the evidence') })); return; }
  const npc = npcs.find(item => item.id === q.npcId)!;
  const chapterQuests = quests.filter(item => item.level === level);
  const previous = chapterQuests.slice(0, chapterQuests.findIndex(item => item.id === q.id)).reverse().find(item => progress.completedQuestIds.includes(item.id));
  openDialog(`<div class="objective-dialog">${portrait(npc.id, 'large-portrait')}<h2>${e(localized(q.title))}</h2>${graph ? questObjectivesMarkup(graph,progress) : ''}<p>${renderNarrative(previous ? clueFor(previous.id)?.lead ?? act.goal : act.goal)}</p><div class="story-objective">${icon('pin')}<span>${e(t('Find {name}', { name: localizedName(npc.name) }))} · ${e(localized(q.location))}</span></div><button class="primary-button" data-follow-quest="${q.id}">${e(t('Find {name}', { name: localizedName(npc.name) }))} ${icon('arrow')}</button></div>`, 'objective-dialog');
}
function findObject(id: string): WorldObjectSpec | undefined { return maps.flatMap(map => [...map.objects]).find(item => item.id === id); }
/** Letters shown under a typed answer; they fade with unaided recalls and vanish once the learner has moved past the sentence's level. */
function typedScaffold(ex: Exercise & { level?: Level; targetWordId?: string }): string {
  const level = ex.level ?? quests.find(quest => quest.exercises.some(exercise => exercise.id === ex.id))?.level ?? 'A1';
  const questLevels = new Map<string, Level>(quests.map(quest => [quest.id, quest.level]));
  const recalls = Math.max(progress.items[ex.itemId]?.modeStats.production?.unaidedSuccesses ?? 0, ex.targetWordId ? progress.words[ex.targetWordId]?.evidence?.production?.unaidedSuccesses ?? 0 : 0);
  return ex.answer ? scaffoldText(ex.answer, scaffoldStage(level, learnerLevel(progress.completedQuestIds, questLevels), recalls)) : '';
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
  try {
    const served = await loadExpeditionEncounter(encounter.id);
    if (!served) throw new Error('This encounter is unavailable.');
    Object.assign(encounter, served); if (npc) npc.encounterId = encounter.id; if (object) object.encounterId = encounter.id;
  } catch (error) { toast((error as Error).message, true); return; }
  if(object)rememberSeen('objects',object.id);
  activityController?.destroy();activityController=undefined;
  openDialog(`<div class="expedition-encounter"><header class="expedition-encounter-heading">${npc?portrait(npc.id,'large-portrait'):`<span class="expedition-portrait">${icon('lantern')}</span>`}<div><h2>${e(npc?.name??object?.label??encounter.title)}</h2>${npc?`<span>${e(npc.role)}</span>`:''}</div></header>${object?`<p>${e(object.description)}</p>`:''}${npc?`<aside class="expedition-relationship">${icon('users')} ${e(npc.relationship)}</aside>`:''}<div id="expedition-encounter-learning-root">Preparing the neighbor’s message…</div><p class="expedition-save-note">${icon('book')} ${e(encounter.languageFocus)}</p><div class="expedition-game-actions"><button class="outline-button" data-expedition-game="${region.id}">${t('Build this neighborhood’s plan')} ${icon('arrow')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')} ${icon('arrow')}</button></div></div>`,'expedition-dialog',npc?.id);
  const root=document.querySelector<HTMLElement>('#expedition-encounter-learning-root')!;let alive=true,paused=document.hidden||document.querySelector<HTMLDialogElement>('#account-dialog')!.open;const runtime:{controller?:ReturnType<typeof mountExpeditionEncounter>;speechHost?:ReturnType<typeof import('./minigames/host').createMiniGameHost>}={};
  const currentPlayer=expeditionLearning.captureOwner();
  activityController={destroy(){alive=false;runtime.controller?.destroy();runtime.speechHost?.destroy();root.replaceChildren();},pause(){paused=true;runtime.controller?.pause();},resume(){paused=false;runtime.controller?.resume();},reset(){runtime.controller?.reset();}};
  const {createMiniGameHost}=await import('./minigames/host');if(!alive||!root.isConnected||!currentPlayer())return;
  runtime.speechHost=createMiniGameHost({api,gameId:'expedition-encounters',lexicon:[],exercises:[],progress:()=>progress,onProgress:next=>{acceptProgress(next);updateProgress();},onEnd:()=>{},playerName:profile.name,silent:silentMode,muted,reducedMotion:worldMotion==='reduced',narration:active=>world.setNarrationActive(active)});
  runtime.controller=mountExpeditionEncounter(root,encounter,{learning:expeditionLearning,progress:()=>progress,onProgress:next=>{acceptProgress(next);updateProgress();},saveStory:(selected,id)=>api.request<ExpeditionAnswerResult>('/expedition/answer',{id,selected,encounterId:encounter.id}),speak:(text,path)=>runtime.speechHost!.speakText(text,path),stopSpeech:()=>runtime.speechHost?.audio.stop(),silent:silentMode,initialPaused:paused||document.hidden||document.querySelector<HTMLDialogElement>('#account-dialog')!.open,previouslyAnswered:!!expeditionEncounterResult(encounter.id)?.attempts});
}
function expeditionActivityBoard() {
  if (!routeUnlocked('windplain', progress.completedQuestIds)) return '';
  return `<section class="expedition-story-link"><h3>${t('Local games across the Atlas')}</h3><div class="activity-board">${expeditionGames.map(game => { const region = getExpedition(game.id)!, status = expeditionGameStatus(game.id, level, progress.story?.expeditionPlans ?? {}); return `<article class="activity-entry" style="--activity-art:url('/assets/${game.id}-preview.webp')">${icon('compass')}<span class="caption">${e(region.name)} · ${status === 'completed' ? t('AGREEMENT REMEMBERED') : status === 'started' ? t('RESUME YOUR PLAN') : 'A1 / A2 / B1'}</span><h3>${e(game.title)}</h3><p>${e(game.summary)}</p><button class="primary-button" data-expedition-game="${game.id}">${status === 'started' ? t('Resume the neighborhood game') : status === 'completed' ? t('Revisit the neighborhood game') : t('Play the neighborhood game')} ${icon('arrow')}</button><details><summary>${t('Meet the neighbors')}</summary>${[...region.npcs,...region.objects].map(target => `<button class="text-button" data-expedition-target="${target.id}">${e(getExpeditionEncounter(region.id,target.id)!.title)} ${icon('arrow')}</button>`).join('')}</details></article>`; }).join('')}</div></section>`;
}
function expeditionOverview(): string {
  const region=getExpedition(mapId)!,game=getExpeditionGame(mapId);
  if (!game) return `<section class="expedition-overview"><h2>${e(region.name)}</h2><button class="primary-button" data-expedition-game="${region.id}">${e(t('Build the plan'))}</button></section>`;
  const status=expeditionGameStatus(mapId,level,progress.story?.expeditionPlans??{});
  return `<section class="expedition-overview"><h2>${e(region.name)}</h2><p>${e(game.summary)}</p><button class="primary-button" data-expedition-game="${region.id}">${status==='started'?t('Resume the plan'):status==='completed'?t('Revisit the agreement'):t('Build the plan')}</button><div class="expedition-cast">${region.npcs.map(npc=>`<button data-expedition-target="${npc.id}">${portrait(npc.id)}<strong>${e(npc.name)}</strong>${icon('chevron')}</button>`).join('')}</div><button class="text-button" data-travel="lindenhafen">${t('Return to the missing-route story')}</button></section>`;
}
async function startExpeditionGame(id: string, requestedLevel?: Level) {
  invalidateContext('expeditionGame', id);
  try { await loadContexts('expeditionGame', id); } catch (error) { toast((error as Error).message, true); return; }
  const game = getExpeditionGame(id);
  if (!game) return;
  if (!routeUnlocked(game.id, progress.completedQuestIds)) { toast(routeLockReason(game.id, progress.completedQuestIds)); return; }
  if (requestedLevel && ['A1', 'A2', 'B1'].includes(requestedLevel)) { level = requestedLevel; localStorage.setItem('atlas.level', level); }
  if (connection !== 'online') { toast(t('The route is reconnecting. Your local plan is waiting.'), true); return; }
  setView('world'); run = undefined;
  activityController?.destroy(); activityController = undefined;
  openDialog('<div id="expedition-game-root"></div>', 'activity-dialog expedition-dialog');
  activityController = mountExpeditionGame(document.querySelector<HTMLElement>('#expedition-game-root')!, game, { level, speak, onExposure: context => recordExpeditionExposure(context.text), onPlacement: context => expeditionLearning.place(context), placementPrompt:(value,fieldId)=>placementLearning.get(`${game.id}:${value}:${fieldId}`)?.prompt??'', placementReady:(value,fieldId)=>{const mapping=placementLearning.get(`${game.id}:${value}:${fieldId}`);return !!mapping&&expeditionLearning.ready(mapping.exerciseId);},pendingLearning:()=>expeditionLearning.pendingPlacements(),retryLearning:()=>expeditionLearning.retryPlacements(), initialPlan: value => progress.story?.expeditionPlans?.[`${game.id}:${value}`], submitPlan: async plan => { const result = await expeditionLearning.submitPlan({mapId:game.id,level:plan.level,values:plan.values,order:plan.order}); invalidateContext('expeditionGame', id); await loadContexts('expeditionGame', id).catch(() => undefined); return result; }, onLevelChange: value => { level = value; localStorage.setItem('atlas.level', value); updateProgress(); }, onComplete: () => { updateProgress(); playCue(true); toast(t('An agreement remembered in your expedition notebook.')); } });
  document.querySelector<HTMLDialogElement>('#dialog')!.scrollTop = 0;
}
async function showObject(id: string) {
  if(deliveryController)return;
  const active = currentQuest();
  const graph = questGraph(active.id) ?? await loadQuestGraph(active.id).catch(() => undefined);
  const investigation = graph?.investigations.find(item => investigationWorldId(item) === id);
  if (investigation && questAvailable(active.id, progress) && !progress.completedQuestIds.includes(active.id)) { investigationQuest = active.id; if (await questController?.inspect(active.id, investigation.objectId)) return; }
  if (expeditionRegions.some(region => getExpeditionEncounter(region.id, id))) { showExpeditionEncounter(id); return; }
  const object = findObject(id); if (!object) return;
  rememberSeen('objects', id);
  const objectMap = maps.find(map => map.objects.some(item => item.id === id))!;
  const lore = objectStories[id] ? await hydrateNarratives(objectStories[id]) : undefined, queue = objectMap.id === mapId ? availableObjectExercises(object) : [];
  const miniGames = objectMap.id === mapId ? miniGameHostLinks(object.minigame) : '';
  openDialog(`<div class="object-encounter"><h2>${e(object.label)}</h2><blockquote>${id === 'nebelstadt-observatory' && !progress.completedQuestIds.includes('b1-atlas') ? renderNarrative(journalNarratives.observatoryWaiting) : lore ? renderNarrative(lore.secret) : e(localized(object.prompt))}</blockquote>${lore ? `<details class="lore-detail"><summary>${e(t('Read more'))}</summary><p>${renderNarrative(lore.detail)}</p></details>` : ''}${objectMap.id !== mapId ? `<button class="primary-button" data-travel="${objectMap.id}">${e(t('Travel to {place}',{place:objectMap.name}))}</button>` : queue.length ? `<button class="primary-button" data-practice-object="${id}">${t('Try a short language encounter')}</button>` : `<button class="primary-button" data-action="close-dialog">${t('Back to exploring')}</button>`}<div class="encounter-secondary">${miniGames}${queue.length ? `<button class="text-button" data-action="close-dialog">${t('Leave')}</button>` : ''}</div></div>`, 'object-dialog');
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
  coursePromise ??= import('./course').then(async module => {
    await loadRestoredWords(progress);
    await loadContexts('grammar', undefined, courseLevel);
    course = module;
    world.setLearningContext(module.courseLexicon,progress,introducedSet(),barkLineAllowed);
    for (const word of module.courseLexicon) { const audio = audioReference((word as typeof word & { audio?: unknown }).audio); if (audio && !audioPaths.has(spokenWord(word))) audioPaths.set(spokenWord(word), audio); }
    for (const ex of module.courseExercises) { const audio = audioReference((ex as typeof ex & { audio?: unknown }).audio); if (audio && !audioPaths.has(ex.german)) audioPaths.set(ex.german, audio); }
    for (const guide of module.courseGrammar) guide.examples.forEach(example => { const audio = audioReference((example as typeof example & { audio?: unknown }).audio); if (!audioPaths.has(example.german) && audio) audioPaths.set(example.german, audio); });
    return module;
  }).catch(error => { coursePromise = undefined; throw error; });
  return coursePromise;
}
function spokenWord(word: { lemma: string; article?: string; articleForm?: string }) { return word.article ? `${word.article} ${word.articleForm ?? word.lemma}` : word.lemma; }
function audioReference(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'path' in value && typeof value.path === 'string') return value.path;
}
async function loadWordDrills(ids: readonly string[], limit = 12): Promise<void> {
  const exerciseIds = (['recognition', 'listening', 'production'] as const).flatMap(mode => ids.map(id => runtimeReference('exercise', id, mode))).filter(Boolean).slice(0, limit);
  for (const id of exerciseIds) await loadExercise(id);
}
function requestCourseRender(el: Element) {
  el.innerHTML = `<div class="route-loading">${icon('book')}<h2>${t('Opening your learning routes…')}</h2><p>${t('The world stays light while your course is closed.')}</p></div>`;
  void loadCourse().then(() => { if (el.isConnected && (view === 'course' || view === 'journal')) renderOther(); }).catch(() => { if (el.isConnected) el.innerHTML = `<div class="route-loading"><h2>${t('The route could not open.')}</h2><button class="primary-button" data-action="course-retry">${t('Try again')}</button></div>`; });
}
function renderActivities(el: Element) {
  const region = getMap(mapId);
  if (getExpedition(mapId)) { el.innerHTML = expeditionOverview() + miniGameBoard() + expeditionActivityBoard(); return; }
  el.innerHTML = `<div class="route-heading">${icon('star')}<div><h2>${t('A little detour.')}</h2></div></div><div class="activity-board">${activityInfo.map((game, index) => { return `<article class="activity-entry" style="--activity-art:url('${region.previewAsset}');--activity-position:${['35% 45%','70% 55%','10% 25%','85% 25%'][index]}">${icon(game.icon)}<h3>${e(game.title)}</h3><p>${e(game.description)}</p><button class="primary-button" data-activity="${game.id}">${e(game.action)} ${icon('arrow')}</button></article>`; }).join('')}</div>` + miniGameBoard() + expeditionActivityBoard();
}
function miniGameHostLinks(id?:string):string {
  const game=id&&miniGameById.get(id);if(!game)return '';
  return `<div class="minigame-host-links"><button data-minigame="${e(game.id)}">${icon('lantern')} ${t('Play')} ${e(game.title)} ${icon('arrow')}</button></div>`;
}
function miniGameBoard(storyOnly=false):string {
  const levels:Level[]=['A1','A2','B1'];
  const choices=miniGameDefinitions.filter(game=>game.levels.some(value=>levels.indexOf(value)<=levels.indexOf(level))&&(!storyOnly||game.tier==='B'));
  return `<section class="lantern-games"><h3>${e(t(storyOnly?'Story games':'Mini-games'))}</h3><div class="minigame-grid">${choices.map(game=>{
    const gameLevel=game.levels.filter(value=>levels.indexOf(value)<=levels.indexOf(level)).at(-1)!;
    const quest=game.questIds?.find(id=>quests.find(quest=>quest.id===id)?.level===gameLevel)??game.questIds?.[0];
    const unlocked=!quest||questUnlocked(quest,progress.completedQuestIds);
    return `<article class="minigame-entry"><h3>${e(game.title)}</h3><p>${e(game.instruction)}</p><button class="outline-button" data-minigame="${e(game.id)}" ${unlocked?'':'disabled'}>${unlocked?'Play a lantern round':'Follow the story to this scene'} ${icon('arrow')}</button></article>`;
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
  try { await loadMiniGame(id); } catch (error) { toast((error as Error).message, true); return; }
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
    const sceneExercises=quests.flatMap(quest=>quest.exercises.map(exercise=>({...exercise,level:quest.level,kind:'writing' as const,unitId:quest.id,wordIds:(exercise as Exercise&{wordIds?:string[]}).wordIds??courseModule.courseContextWordIds[exercise.id]??[]})));
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
  try { await loadActivity(id, source ? 'A1' : level); } catch (error) { toast((error as Error).message, true); return; }
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
  const successes = (exercise as Exercise & { targetWordId?: string }).targetWordId ? evidence?.unaidedSuccesses : evidence?.correct;
  return (successes ?? 0) > 0;
}
function renderCourse(el: Element) {
  if (!course) { requestCourseRender(el); return; }
  const words = course.courseLexicon.filter(word => word.level === courseLevel);
  const units = course.courseUnits.filter(unit => unit.level === courseLevel);
  const grammar = course.courseGrammar.filter(item => item.level === courseLevel);
  const completed = units.filter(unit => progress.completedUnitIds?.includes(unit.id)).length;
  el.innerHTML = `<header class="learning-page-header"><h2>${t('Learning routes')}</h2><button class="icon-button" data-action="course-help" aria-label="${e(t('Learning help'))}">?</button>${completed ? `<span class="page-stat">${e(t('{done} / {total} routes completed',{done:completed,total:units.length}))}</span>` : ''}</header><div class="route-levels">${(['A1','A2','B1'] as const).map(l => `<button class="${l === courseLevel ? 'selected' : ''}" data-course-level="${l}" aria-pressed="${l === courseLevel}">${l}</button>`).join('')}</div><div class="route-tabs">${([['topics',t('Learning routes')],['grammar',t('Grammar guides')],['lexicon',t('Word atlas')]] as const).map(([id,title]) => `<button class="${courseTab === id ? 'selected' : ''}" data-course-tab="${id}" aria-pressed="${courseTab === id}">${e(title)}</button>`).join('')}</div><div id="course-content"></div>`;
  const content = document.querySelector('#course-content')!;
  if (courseTab === 'topics') {
    const pageCount = Math.max(1, Math.ceil(units.length / 24)); coursePage = Math.min(coursePage, pageCount - 1);
    content.innerHTML = `<div class="route-unit-list">${units.slice(coursePage * 24, coursePage * 24 + 24).map(unit => {
      const done = progress.completedUnitIds?.includes(unit.id), missing = done ? 0 : missingWordCount(unit.wordIds, progress);
      const practiced = unit.exerciseIds.filter(id => { const ex = course!.courseExerciseById.get(id); return ex && exerciseHasSuccess(ex); }).length;
      const label = missing ? t('Opens after {count} more restored words', {count:missing}) : t('{done} / {total} encounters saved', {done:practiced,total:unit.exerciseIds.length});
      return `<button class="route-unit ${done ? 'found' : missing ? 'locked' : ''}" data-course-unit="${e(unit.id)}" ${missing ? 'aria-disabled="true"' : ''} aria-label="${e(`${localized(unit.title)}: ${label}`)}"><strong>${e(localized(unit.title))}</strong><span class="unit-progress" role="progressbar" aria-label="${e(t('Route progress'))}" aria-valuemin="0" aria-valuemax="${unit.exerciseIds.length}" aria-valuenow="${practiced}">${icon(done ? 'check' : missing ? 'lock' : 'chevron')}</span></button>`;
    }).join('')}</div>${pageCount > 1 ? `<div class="route-pagination"><button class="outline-button" data-course-page="${coursePage - 1}" ${coursePage === 0 ? 'disabled' : ''}>${t('Previous')}</button><span>${coursePage + 1} / ${pageCount}</span><button class="outline-button" data-course-page="${coursePage + 1}" ${coursePage === pageCount - 1 ? 'disabled' : ''}>${t('Next')}</button></div>` : ''}${todaysWordsCard()}`;
  } else if (courseTab === 'grammar') {
    content.innerHTML = grammar.map(source => { const guide = localizedGrammar(source), unit = units.find(unit => unit.grammarIds.includes(guide.id)); return `<details class="grammar-route" data-grammar-guide="${guide.id}"><summary>${e(guide.title)}</summary><p>${e(guide.explanation)}</p>${guide.note ? `<p class="grammar-note">${e(guide.note)}</p>` : ''}${guide.examples.map(example => `<blockquote>${renderCourseExample(example)} <button class="icon-button" data-speak="${e(example.german)}" aria-label="${e(t('Listen to {text}',{text:example.german}))}">${icon('volume')}</button></blockquote>`).join('')}${unit ? `<button class="primary-button" data-course-unit="${unit.id}">${t('Try it in a scene')}</button>` : ''}</details>`; }).join('');
  } else {
    content.innerHTML = `<label class="route-search">${icon('clue')}<input id="lexicon-search" type="search" placeholder="${e(t('Find a German word or English meaning…'))}" aria-label="${e(t('Search the word atlas'))}"/></label><p class="lexicon-status" id="lexicon-status"></p><div class="lexicon-list" id="lexicon-list"></div>`;
    bindLexiconSearch(words.filter(word => wordIntroduced(progress, word.id)));
  }
}
/** Restored words the learner has not yet recognised unaided: the daily loop between conversations. */
function todaysWordsCard(): string {
  if (!course) return '';
  const words = todaysWords(progress).map(id => course!.lexemeById.get(id)).filter((word): word is CourseLexeme => !!word);
  if (!words.length) return '';
  return `<section class="todays-words"><h3>${e(t('Today’s words'))}</h3><button class="primary-button" data-action="todays-words">${t('Practise today’s words')}</button></section>`;
}
async function startTodaysWords() {
  const module = await loadCourse().catch(error => { toast(error.message, true); return undefined; });
  if (!module) return;
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  const ids = todaysWords(progress);
  try { await loadWordDrills(ids); } catch (error) { toast((error as Error).message, true); return; }
  // Meaning first, then the sound, then recall: every mode across today's words before the next mode begins.
  const queue = playablePractice((['recognition', 'listening', 'production'] as const).flatMap(mode => ids.flatMap(id => { const ex = module.courseExerciseById.get(`lex-${id}-${mode}`); return ex && !exerciseHasSuccess(ex) ? [ex] : []; }))).slice(0, 12);
  if (!queue.length) { toast(t('You have met every restored word. New words return as you play.')); return; }
  setView('world');
  run = { queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:false, label:t('Today’s words'), started:Date.now() };
  openDialog('', 'quest-dialog course-dialog'); renderExercise();
}
function lexemeCards(words: CourseModule['courseLexicon']): string {
  return words.map(word => `<button class="lexeme compact-word-card" data-lexeme="${e(word.id)}" data-open-word="${e(word.id)}"><h3 lang="de">${e(word.article ? `${word.article} ${word.articleForm ?? word.lemma}` : word.lemma)}</h3><p>${e(lexemeMeaning(word))}</p>${icon('chevron')}</button>`).join('');
}
function bindLexiconSearch(words: CourseModule['courseLexicon']) {
  const render = (query = '') => {
    const matches = words.filter(word => lower(`${word.lemma} ${word.english} ${lexemeMeaning(word)} ${word.topic}`).includes(lower(query)));
    document.querySelector('#lexicon-list')!.innerHTML = lexemeCards(matches.slice(0, 36));
    document.querySelector('#lexicon-status')!.textContent = !matches.length ? '' : matches.length > 36 ? t('{count} words. Showing the first 36; search to find any word.', { count: matches.length }) : matches.length === 1 ? t('{count} word.', { count: matches.length }) : t('{count} words.', { count: matches.length });
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
  el.innerHTML = `<header class="learning-page-header"><h2>${t('Your words')}</h2><button class="icon-button" data-action="journal-help" aria-label="${e(t('Word journal help'))}">?</button>${due.length ? `<button class="primary-button" data-action="review">${t('Review {count} words', {count:Math.min(due.length,8)})}</button>` : ''}</header><div class="route-tabs"><button class="selected" data-journal-tab="words">${t('Individual words')}</button><button data-journal-tab="phrases">${t('Story expressions')}</button></div>${seen.length ? `<label class="route-search"><input id="lexicon-search" type="search" placeholder="${e(t('Find a word or meaning…'))}" aria-label="${e(t('Search your individual words'))}"/></label><p class="lexicon-status" id="lexicon-status"></p><div class="lexicon-list" id="lexicon-list"></div>${todaysWordsCard()}` : `<div class="empty-state"><p>${t('Your first word is waiting.')}</p><button class="primary-button" data-view="course">${t('Open your learning routes')}</button></div>`}`;
  if (seen.length) bindLexiconSearch(seen);
}
async function startWordPractice(id: string) {
  const module = await loadCourse().catch(error => { toast(error.message, true); return undefined; });
  const word = module?.lexemeById.get(id); if (!word || !module) return;
  try { await loadWordDrills([id]); } catch (error) { toast((error as Error).message, true); return; }
  if (wordScheduled(id) && !wordIntroduced(progress, id)) { toast(t('This word has not returned to the Atlas yet. Keep playing and it will.')); return; }
  const memory = progress.words?.[id];
  if (memory?.mastery === 'retained' && Date.parse(memory.dueAt) > Date.now()) {
    openDialog(`<div class="course-intro"><h2>${e(spokenWord(word))}</h2><p>${e(lexemeMeaning(word))}</p><p>${e(t('This word is resting. Its next encounter is {date}.', { date: new Date(memory.dueAt).toLocaleDateString(baseLanguage(), {month:'short',day:'numeric'}) }))}</p><button class="primary-button" data-speak="${e(spokenWord(word))}">${icon('volume')} ${t('Hear this word')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')}</button></div>`, 'course-dialog'); return;
  }
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  const queue = playablePractice(module.courseExercises).filter(ex => ex.itemId === `word-${id}` && (!exerciseHasSuccess(ex) || Date.parse(memory?.evidence?.[modeFor(ex)]?.dueAt ?? '') <= Date.now()));
  if (!queue.length && !writingReady()) { showOpeningPracticeNotice(); return; }
  if (!queue.length) { toast(silentMode ? t('No reading or writing practice is ready for this word. Listening is skipped in silent mode.') : t('This word is resting. There is a new adventure waiting.')); return; }
  setView('world'); run = { queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:true, label:t('A word for your journey · {word}', { word: word.lemma }), started:Date.now() };
  openDialog('', 'quest-dialog'); renderExercise();
}
async function startCourseUnit(id: string) {
  try { await loadUnit(id, progress); } catch (error) { toast((error as Error).message, true); return; }
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
  openDialog(`<div class="quest-intro"><h2>${e(unitTitle)}</h2><div class="course-intro-reference"><p class="intro-story">${e(unitSummary)}</p>${guides.map(guide => `<div class="course-intro-examples">${guide.title !== unitTitle ? `<strong>${e(guide.title)}</strong>` : ''}${guide.explanation !== unitSummary ? `<p>${e(guide.explanation)}</p>` : ''}${guide.examples.slice(0,2).map(example => `<p>${renderCourseExample(example)}</p>`).join('')}</div>`).join('')}</div><button class="primary-button" data-action="begin-exercises">${queue.length ? t('Follow this learning route') : t('Save this completed route')} ${icon('arrow')}</button></div>`, 'quest-dialog course-dialog');
}
async function startAdaptiveReview() {
  const module = await loadCourse().catch(() => undefined);
  if (!module) { startReview(); return; }
  try { await loadWordDrills(module.courseLexicon.filter(word => progress.words[word.id] && wordReadyForReview(progress.words[word.id])).map(word => word.id)); } catch (error) { toast((error as Error).message, true); return; }
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
  return `<section class="field-notes"><h3>${t('Witnesses from the road')}</h3>${discoveries.map(clue => `<article class="grammar-route"><h3>${e(localized(clue.title))}</h3><p>${renderNarrative(clue.text)}</p><blockquote>${renderNarrative(clue.lead)}</blockquote></article>`).join('')}</section>`;
}
let loadingStoryPage = false;
async function loadStoryPage() {
  if (loadingStoryPage) return;
  loadingStoryPage = true;
  try { await loadStoryContent(); if (['story', 'menu', 'quests'].includes(view)) renderOther(); }
  catch (error) { toast((error as Error).message, true); }
  finally { loadingStoryPage = false; }
}
function renderOther() {
  queueMicrotask(() => { if (['story', 'menu', 'quests'].includes(view) && storyContentRemaining > 0) { const panel = document.querySelector('#other-view'); if (panel && !panel.querySelector('[data-action=load-story-page]')) panel.insertAdjacentHTML('beforeend', `<button class=outline-button data-action=load-story-page>${e(t('Load more stories'))}</button>`); } });
  exposureObserver?.disconnect();
  if (view !== 'settings') { unbindOptions?.(); unbindOptions = undefined; }
  queueMicrotask(() => {
    if (!['menu', 'course'].includes(view) || !started) return;
    const panel = document.querySelector<HTMLElement>('#other-view'); if (!panel || panel.querySelector('[data-course-picker]')) return;
    const picker = document.createElement('section'); picker.dataset.coursePicker = ''; panel.prepend(picker);
    void mountCoursePicker(picker, api).catch(error => toast(error.message, true));
  });
  const el = document.querySelector('#other-view')!;
  if (view === 'activities') { renderActivities(el); return; }
  if (view === 'course') { renderCourse(el); return; }
  if (view === 'journal' && journalTab === 'words') { renderWordJournal(el); return; }
  if ((view === 'menu' || view === 'quests') && getExpedition(mapId)) { el.innerHTML = expeditionOverview(); return; }
  if (view === 'menu') {
    const act = actFor(mapId), clueCount = discoveredClues(progress.completedQuestIds).length;
    const quest = currentQuest(), npc = npcs.find(item => item.id === quest.npcId)!;
    const nextAct = storyActs[storyActs.findIndex(item => item.mapId === mapId) + 1];
    const map = getMap(mapId), storyRoutes = maps.filter(item => !getExpedition(item.id)), promise = progress.story?.promise;
    el.innerHTML = adventureHome({
      act, quest, npc, portrait: portrait(npc.id), clueCount,
      region: { name: map.name, subtitle: localized(map.subtitle), description: localized(map.description), art: map.previewAsset },
      completed: completedAtLevel(level), total: quests.filter(item => item.level === level).length, nextRegion: nextAct ? getMap(nextAct.mapId).name : undefined,
      dueCount: dueItems(progress).length, wordCount: introducedSet().size,
      townsOpen: storyRoutes.filter(item => routeUnlocked(item.id, progress.completedQuestIds)).length, townsTotal: storyRoutes.length,
      places: buildingEntrances(mapId).map(entrance => { const room = getInterior(entrance.interiorId); return { id: room.id, name: room.name, glyph: interiorIcon(room.id) }; }),
      promise: promise ? { title: localized(promise.title), done: Math.min(promise.correctAnswers, promise.target), target: promise.target, lit: !!promise.completed } : undefined,
    });
  } else if (view === 'quests') {
    const act = actFor(mapId), chapterQuests = quests.filter(q => q.level === level);
    el.innerHTML = `<div class="quest-log-heading"><h2>${e(localized(act.title))}</h2></div>${questGraph(currentQuest().id) ? questObjectivesMarkup(questGraph(currentQuest().id)!,progress) : ''}<div class="quest-log-list">${chapterQuests.map((q, i) => { const done = progress.completedQuestIds.includes(q.id), next = q.id === currentQuest().id && !done; return `<button class="quest-log-entry ${done ? 'found' : next ? 'next' : ''}" data-follow-quest="${q.id}" ${questAvailable(q.id, progress) ? '' : 'disabled'}><span class="quest-log-number">${done ? icon('check') : String(i + 1).padStart(2, '0')}</span>${portrait(q.npcId)}<span class="quest-log-copy"><strong>${e(localized(q.title))}</strong></span>${icon('chevron')}</button>`; }).join('')}</div><button class="primary-button" data-action="next-objective">${icon('flag')} ${completedAtLevel(level) === 6 ? t('Follow the next route') : t('Find my next lead')}</button><div class="quest-region-strip">${maps.filter(map => !getExpedition(map.id) || routeUnlocked(map.id, progress.completedQuestIds)).map(map => `<button ${routeUnlocked(map.id, progress.completedQuestIds) ? '' : 'disabled'} data-travel="${map.id}" class="${map.id === mapId ? 'here' : ''}"><span>${map.level}</span>${e(map.name)}${icon(map.id === mapId ? 'pin' : 'arrow')}</button>`).join('')}</div>`;
  } else if (view === 'story') {
    const found = discoveredClues(progress.completedQuestIds), inspected = readSeen('objects');
    el.innerHTML = `<header class="learning-page-header"><h2>${t('Discoveries')}</h2></header>${evidenceBoard(progress)}<div class="story-acts">${storyActs.map(act=>{
      const qs=quests.filter(q=>q.level===act.level),clues=found.filter(clue=>qs.some(q=>q.id===clue.questId));
      if(!clues.length)return '';
      return `<section class="story-act"><header><h3>${e(localized(act.title))}</h3><span class="clue-count">${clues.length}/6</span></header><div class="clue-pages">${clues.map(clue=>`<details class="clue-page"><summary>${e(localized(clue.title))}${icon('chevron')}</summary><p>${renderNarrative(clue.text)}</p>${eliseLetter(clue.letter,clue.questId)}<p>${renderNarrative(clue.lead)}</p></details>`).join('')}</div>${clues.length===6?`<details class="lore-detail"><summary>${t('Next chapter')}</summary><blockquote>${renderNarrative(act.cliffhanger)}</blockquote></details>`:''}</section>`;
    }).join('')}</div>${inspected.length?`<section class="field-notes"><h3>${t('Notes from the road')}</h3>${maps.flatMap(map=>map.objects.filter(object=>inspected.includes(object.id)).map(object=>`<button data-inspect-object="${object.id}" data-object-map="${map.id}"><strong>${e(object.label)}</strong>${icon('chevron')}</button>`)).join('')}</section>`:''}${earnedActivityJournal()}${routeUnlocked('windplain',progress.completedQuestIds)?expeditionNotebook(progress.story?.expeditionPlans??{}):''}<button class="primary-button" data-action="next-objective">${t('Follow the next lead')}</button>`;
  } else if (view === 'atlas') {
    const current = getMap(mapId);
    el.innerHTML = `<div class="atlas-heading"><h2>${t('Region atlas')}</h2></div><div class="region-cards">${maps.filter(map => !getExpedition(map.id) || routeUnlocked(map.id, progress.completedQuestIds)).map(map => {
      const unlocked = routeUnlocked(map.id, progress.completedQuestIds), expedition = getExpedition(map.id), act = expedition ? undefined : actFor(map.id);
      const status = expedition ? expeditionGameStatus(map.id, level, progress.story?.expeditionPlans ?? {}) : undefined;
      const done = expedition ? expedition.encounters.filter(encounter => expeditionEncounterResult(encounter.id)?.correct).length : completedAtLevel(map.level);
      return `<article class="region-card ${map.id === mapId ? 'current' : ''}"><div class="region-card-art" style="background-image:url('${map.previewAsset}')"><span>${expedition ? `${t('EXPEDITION')} · A1 / A2 / B1` : `${e(upper(t('Act {number}', { number: act!.number })))} · ${map.level}`}</span>${map.id === mapId ? `<b>${t('YOU ARE HERE')}</b>` : ''}</div><div class="region-card-copy"><h3>${e(map.name)}</h3><div class="region-card-meta"><span>${expedition ? t('{done} / {total} encounters', { done, total: expedition.encounters.length }) : t('{done} / {total} stories', { done, total: 6 })}</span><span>${expedition ? status === 'completed' ? t('Agreement remembered') : t('{count} neighbors · local game', { count: expedition.npcs.length }) : t('Story route')}</span></div><button class="${map.id === mapId ? 'outline-button' : 'primary-button'}" ${map.id === mapId ? 'data-view="world"' : `data-travel="${map.id}" ${unlocked ? '' : 'disabled'}`}>${map.id === mapId ? t('Return to exploring') : ` ${unlocked ? e(t('Travel to {place}', { place: map.name })) : t('Find the next clue first')}`} ${icon('arrow')}</button></div></article>`;
    }).join('')}</div>${placesSection()}<section class="region-local-map"><div><h3>${e(t('People & little things'))}</h3><p>${t('Choose a marker to walk there.')}</p></div><div class="atlas-map" style="aspect-ratio:${current.width}/${current.height}"><img src="${current.previewAsset}" alt="${e(t('Painted map of {place}', { place: current.name }))}"/>${current.npcs.map(point => { const npc = npcs.find(item => item.id === point.id) ?? getExpeditionNpc(point.id); return npc ? `<button class="atlas-map-pin" data-waypoint="${point.id}" style="left:${point.x * 100}%;top:${point.y * 100}%" aria-label="${e(t('Walk to {name}', { name: localizedName(npc.name) }))}">${portrait(point.id)}<span>${e(localizedName(npc.name))}</span></button>` : ''; }).join('')}${current.objects.map(object => `<button class="object-map-pin" data-focus-object="${object.id}" style="left:${object.x * 100}%;top:${object.y * 100}%" aria-label="${e(t('Walk to {name}', { name: object.label }))}">${icon(object.kind === 'garden' ? 'leaf' : object.kind === 'clock' ? 'clock' : 'lantern')}</button>`).join('')}<span class="atlas-map-compass">${icon('compass')} N</span></div></section>`;
  } else if (view === 'journal') {
    const learned = vocabulary.filter(v => progress.items[v.id]);
    const due = dueItems(progress);
    el.innerHTML = `<header class="learning-page-header"><h2>${t('Story expressions')}</h2><button class="icon-button" data-action="journal-help" aria-label="${e(t('Word journal help'))}">?</button>${due.length ? `<button class="primary-button journal-review" data-action="review">${t('Review {count} words', {count:Math.min(due.length,8)})}</button>` : ''}</header><div class="route-tabs"><button data-journal-tab="words">${t('Individual words')}</button><button class="selected" data-journal-tab="phrases">${t('Story expressions')}</button></div><div class="journal-toolbar"><label>${icon('book')}<input id="word-search" placeholder="${e(t('Find a word or meaning…'))}" aria-label="${e(t('Search your word journal'))}"/></label></div><div class="word-grid" id="word-grid">${learned.length ? learned.map(v => { const meaning = localized({german:v.german,english:v.english}); return `<button class="word-card compact-word-card" data-open-phrase="${e(v.id)}" data-word="${e(lower(`${v.german} ${v.english} ${meaning}`))}"><h3 lang="de">${e(v.german)}</h3><p>${e(meaning)}</p>${icon('chevron')}</button>`; }).join('') : `<div class="empty-state"><p>${t('Your story is still being written.')}</p><button class="primary-button" data-view="world">${t('Meet Lindenhafen')}</button></div>`}</div>`;
    document.querySelector<HTMLInputElement>('#word-search')?.addEventListener('input', event => {
      const query = lower((event.target as HTMLInputElement).value);
      document.querySelectorAll<HTMLElement>('[data-word]').forEach(card => { card.hidden = !card.dataset.word!.includes(query); });
    });
  } else if (view === 'character') {
    el.innerHTML = `<section class="options-panel character-settings"><header class="options-heading"><h2>${e(t('Character'))}</h2></header><div class="character-settings-body">${profileForm()}<p class="honest-note">${t('Your character appears in town and is visible to other players.')}</p></div><details class="profile-rewards"><summary>${e(t('Rewards'))}</summary>${lanternRewardsMarkup(progress)}</details></section>`;
    bindProfileForm();
  } else if (view === 'help') {
    el.innerHTML = controlsHelpMarkup();
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
  ];
  return [
    ...accountCredentialRows(account),
    { kind: 'choice', id: 'usage-analytics', label: t('Usage analytics'), help: t('Share visits and app issues with Glotworld to help improve the game. No external analytics services. Your browser privacy preference takes priority. Learning progress and billing records are saved separately.'), value: browserAnalyticsEnabled() ? 'on' : 'off', choices: onOff },
    { kind: 'action', id: 'manage-access', label: t('Game access'), help: accessClock.snapshot(performance.now())?.phase === 'free' ? t('Enjoy unlimited free play.') : t('Manage your access and billing.'), action: 'manage-access', button: accessClock.snapshot(performance.now())?.phase === 'free' ? t('Free to play') : accessClock.snapshot(performance.now())?.phase === 'paid' ? t('Manage access') : t('View access options'), glyph: 'clock' },
    { kind: 'custom', id: 'account', label: account.registered ? t('Your adventure is linked') : t('Take your adventure with you'), help: account.registered ? t('Playing as {name}. Log in on another device with {email} and your password.', { name: profile.name, email: account.email }) : t('Playing as {name}. Add an email and password to continue on another device.', { name: profile.name }), html: `<div class="option-buttons">${account.registered ? '' : `<button class="option-action" data-action="save-account">${e(t('Add email & password'))}</button>`}<button class="option-action" data-action="login-account">${t('Log in to a saved adventure')}</button><button class="option-action" data-action="reset-game">${accessClock.snapshot(performance.now())?.phase === 'free' ? 'Reset game' : 'Reset game &amp; play 15 minutes'}</button><button class="option-action" data-action="logout-account">${t('Log out')}</button></div>` },
  ];
}
function renderOptions(el: HTMLElement) {
  unbindOptions?.();
  const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.option : undefined, scroll = el.scrollTop;
  const rows = optionRows();
  let extra = '';
  if (optionsTab === 'language') extra = `<section data-course-picker></section>${baseLanguage() === 'tr' ? `<p class="honest-note">${t('Turkish support covers the story and all A1, A2 and B1 course exercises.')} ${t('Coverage: story {story}%, interface {ui}%, course words {words}%, course tasks {tasks}%.', turkishCoverage)}</p>` : ''}`;
  if (optionsTab === 'account') {
    const performance = world.getWorldStats();
    extra = saveSlotsMarkup(storySaves) + `<div class="connection-info">${icon('users')} ${connection === 'online' ? t('Your route is connected. Your progress is saved on the server.') : connection === 'incompatible' ? t('The world has changed. Reload this page to continue.') : connection === 'replaced' ? t('Your character is active in another tab. Continue there, or close it and reload this page.') : t('The route is reconnecting. Keep this tab open.')}</div><details class="world-performance"><summary>${t('World performance')}</summary><p>${performance.fps ? t('{fps} frames per second · average {frame} ms · 95th percentile {p95} ms', { fps: performance.fps, frame: performance.frameMs, p95: performance.p95FrameMs }) : t('The world is warming up.')}</p><span class="caption">${t('{residents} residents · {objects} objects · {animated} animated details', { residents: performance.residents, objects: performance.objects, animated: performance.animated })}</span></details>`;
  }
  el.innerHTML = optionsMarkup(optionsTab, rows, extra);
  const picker = el.querySelector<HTMLElement>('[data-course-picker]');
  if (picker && started) void mountCoursePicker(picker, api).catch(error => toast(error.message, true));
  if (optionsTab === 'account') {
    const owner = api.token;
    bindAccountCredentials(el, api, (updated, kind) => {
      if (api.token !== owner) return;
      account = updated;
      updateWorldEditButton();
      document.querySelector<HTMLElement>('#admin-analytics-link')!.hidden = account.admin !== true;
      if (view === 'settings' && optionsTab === 'account') {
        renderOptions(el);
        el.querySelector<HTMLElement>(`.account-credential-editor:has([data-credential-form="${kind}"]) summary`)?.focus();
      }
      toast(t(kind === 'email' ? 'Your email has been updated.' : 'Your password has been updated.'));
    });
  }
  unbindOptions = bindOptionRows(el, rows, (row, value) => changeOption(row.id, String(value)), kind => uiSounds.play(kind));
  if (focused) { el.querySelector<HTMLElement>(`[data-option="${focused}"]`)?.focus({ preventScroll: true }); el.scrollTop = scroll; }
}
function changeOption(id: string, value: string) {
  switch (id) {
    case 'sound': muted = value === 'off'; localStorage.setItem('atlas.muted', String(muted)); world.setAudioPreferences({ silent: silentMode, muted }); if (!muted) playCue(true); break;
    case 'silent': if (attemptBusy) { toast(t('Your answer is saving. Try again in a moment.')); return; } setSilentMode(value === 'on'); return;
    case 'usage-analytics': setBrowserAnalyticsEnabled(value === 'on'); break;
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
  try {
    const questions = await loadPlacement();
    if (!host.isConnected || !document.querySelector<HTMLDialogElement>('#dialog')!.open) return;
    placementController = await mountOptionalPlacement(host, { api, progress, questions, speak, onClose: () => document.querySelector<HTMLDialogElement>('#dialog')!.close(), onComplete: (result, value) => { acceptProgress(value); courseLevel = result.level; localStorage.setItem('atlas.placement', JSON.stringify(result)); updateProgress(); } });
    if (!host.isConnected) { placementController.destroy(); placementController = undefined; }
  } catch (error) { if (host.isConnected) host.innerHTML = `<p role="alert">${e((error as Error).message)}</p>`; }
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
async function showNpc(id: string) {
  if(deliveryController)return;
  if (getExpeditionNpc(id)) { showExpeditionEncounter(id); return; }
  const npc = npcs.find(n => n.id === id);
  if (!npc) return;
  const available = quests.find(q => q.npcId === id && q.level === level && !progress.completedQuestIds.includes(q.id) && questUnlocked(q.id, progress.completedQuestIds));
  if (available) {
    try { await loadContexts('questGrammar', available.id); await questController?.open(available.id); } catch (error) { toast((error as Error).message, true); } return;
  }
  recordExposure({npcId:id});
  try { await loadNpcConversation(id, level, progress, lanternRewards(progress).title); questController?.greet(npc, level); } catch (error) { toast((error as Error).message, true); }
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
  openDialog(`<div class="quest-intro">${portrait(npc.id, 'large-portrait')}<h2>${e(localized(quest.title))}</h2><p class="intro-story">${renderNarrative(quest.story)}</p><button class="primary-button" data-action="begin-exercises">${queue.length ? t('Let the adventure begin') : t('Discover the next clue')} ${icon('arrow')}</button></div>`, 'quest-dialog');
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
  const optionMarkup = exerciseOptionsMarkup(ex, [...(ex.options ?? [])].map((option, i) => ({ option, seed: hash(`${run!.started}:${ex.id}:${run!.index}:${i}`) })).sort((a, b) => a.seed - b.seed).map(({ option }) => option));
  document.querySelector<HTMLDialogElement>('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close adventure'))}">${icon('close')}</button><div class="exercise-header"><span>${run.label ? e(run.label) : run.review ? t('A familiar face, a new encounter') : e(run.quest ? localized(run.quest.title) : t('Your learning route'))}</span><strong>${Math.min(run.index + 1, run.targetCount)} / ${run.targetCount}</strong></div><div class="exercise-progress"><span style="width:${Math.min(100, run.correct / (run.targetCount) * 100)}%"></span></div><div class="exercise-content"><div class="exercise-preferences">${silentModeButton()}</div><h2>${e(shown.prompt)}</h2>${ex.mode === 'listen' ? `<div class="audio-scene"><button class="audio-play" data-speak="${e(ex.german)}" aria-label="${e(t('Play German audio'))}">${icon('volume')}</button><div><strong>${e(t('A voice from {place}', { place: interiorId ? getInterior(interiorId).name : getMap(mapId).name }))}</strong><span>${t('Listen, then choose your answer. Replay any time.')}</span></div></div><button class="text-button transcript-button" data-action="transcript">${t('Show transcript')}</button><p class="transcript" id="transcript" hidden>${e(ex.german)}</p>` : ''}<div class="exercise-answer">${ex.mode === 'choice' || ex.mode === 'listen' ? `<div class="answer-options">${optionMarkup}</div>` : ex.mode === 'sentence' ? `<div class="sentence-result" id="sentence-result" aria-label="${e(t('Your sentence'))}"><span class="sentence-placeholder">${t('Tap the words to build your answer')}</span></div><div class="word-tokens" id="word-tokens">${shuffledSentenceTiles(ex, `${run.started}:${run.index}:${ex.id}`).map(({ token, i }) => `<button class="word-token" data-game-option="${i}" data-token="${i}" data-value="${e(token)}">${e(token)}</button>`).join('')}</div><button class="text-button" data-action="clear-sentence">${icon('refresh')} ${t('Start the sentence again')}</button>` : `<form id="typed-answer-form">${scaffold ? `<p class="typed-scaffold"><span>${t('Letter guide')}</span><strong lang="de">${e(scaffold)}</strong></p>` : ''}<input class="typed-answer" id="typed-answer" placeholder="${e(t('Write your answer in German…'))}" autocomplete="off" autocapitalize="sentences" spellcheck="false" aria-label="${e(t('Your German answer'))}"/><div class="german-keys">${['ä', 'ö', 'ü', 'ß'].map(char => `<button type="button" data-insert="${char}">${char}</button>`).join('')}</div><span class="typed-spelling-help">${t('Capitalize German nouns and formal Sie. You can use ae, oe and ue for umlauts.')}</span></form>`}</div><div id="exercise-feedback" class="exercise-feedback" aria-live="polite"></div><div class="exercise-actions"><button class="text-button" data-action="hint">${icon('sparkles')} ${t('A little help')}</button>${ex.mode === 'sentence' || ex.mode === 'type' ? `<button class="primary-button" data-action="check-answer" id="check-answer">${t('Check my answer')} ${icon('arrow')}</button>` : ''}<button class="primary-button" data-action="next-exercise" id="next-exercise" hidden>${t('On with the story')} ${icon('arrow')}</button></div><p class="exercise-hint" id="exercise-hint" hidden>${e(shown.hint)}</p></div>`;
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
    ex.answer = result.correctedAnswer ?? ex.answer;
    ex.explanation = result.reason ?? '';
    activeRun.answered = true;
    if (result.correct) { activeRun.correct++; playCue(true); }
    else { activeRun.queue.push(ex); playCue(false); }
    const feedback = document.querySelector<HTMLElement>('#exercise-feedback')!;
    feedback.className = `exercise-feedback shown ${result.correct ? 'correct' : 'incorrect'}`;
    const explanation = result.correct && !result.reason?.startsWith('Accepted.') ? localizedExercise(ex).explanation : attemptFeedback(ex, answer, result.reason);
    feedback.innerHTML = `<span class="feedback-icon">${icon(result.correct ? 'check' : 'leaf')}</span><div><strong>${result.correct ? [t('That’s the way!'), t('Nicely said.'), t('A little more German. A little more you.')][activeRun.correct % 3] : t('A small detour. You’ll get there.')}</strong><p>${e(explanation)}</p>${!result.correct ? `<span class="caption">${t('You’ll meet this one again before the adventure ends.')}</span>` : ''}</div>${result.xpAdded ? `<span class="feedback-xp">+${result.xpAdded} XP</span>` : ''}`;
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
      const remainingIds = unit.exerciseIds.filter(id => { const ex = course!.courseExerciseById.get(id); return !ex || !exerciseHasSuccess(ex); });
      const remainingExercises = remainingIds.flatMap(id => { const ex = course!.courseExerciseById.get(id); return ex ? [ex] : []; });
      if (!writingReady() && remainingExercises.some(ex => ex.mode === 'sentence' || ex.mode === 'type') && !playablePractice(remainingExercises).length) { showOpeningPracticeNotice(); playCue(true); return; }
      const remaining = remainingIds.length;
      if (!remaining) { const result = await api.completeUnit(unit.id); acceptProgress(result.progress); gained = result.xpAdded; updateProgress(); }
      if (run !== activeRun) return;
      document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close learning route'))}">${icon('close')}</button><div class="completion"><div class="completion-mark">${icon(remaining ? 'leaf' : 'check')}</div><h2>${remaining ? t('A little further along the route.') : t('A route you can use.')}</h2><p>${e(localized(unit.title))} · ${remaining ? (remaining === 1 ? t('{count} encounter remains. Your completed answers are saved; continue when you are ready.', { count: remaining }) : t('{count} encounters remain. Your completed answers are saved; continue when you are ready.', { count: remaining })) : t('Your answers are saved. Try this German in an adventure or let it rest until its next encounter.')}</p><div class="completion-stats"><span><strong>${activeRun.targetCount}</strong> ${t('encounters saved')}</span><span><strong>${gained ? '+' + gained : '✓'}</strong> ${gained ? t('adventure XP') : t('progress saved')}</span></div>${remaining ? `<button class="primary-button" data-course-unit="${unit.id}">${t('Continue this route')} ${icon('arrow')}</button>` : `<button class="primary-button" data-view="activities">${t('Use it in an adventure')} ${icon('arrow')}</button>`}<button class="text-button" data-view="course">${t('Return to your learning routes')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')}</button></div>`;
      run = undefined; playCue(true); return;
    }
    if (activeRun.quest && !questGraph(activeRun.quest.id)) {
      const skipListening = silentMode || !!activeRun.skipListening;
      const remaining = remainingQuestExercises(activeRun.quest.exercises, progress, skipListening);
      if (!writingReady() && remaining.some(ex => ex.mode === 'sentence' || ex.mode === 'type') && !playablePractice(remaining).length) { showOpeningPracticeNotice(); playCue(true); return; }
      if (remaining.length) {
        document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close quest session'))}">${icon('close')}</button><div class="completion"><div class="completion-mark">${icon('leaf')}</div><h2>${t('A little further along the story.')}</h2><p>${e(localized(activeRun.quest.title))} · ${remaining.length === 1 ? t('{count} exercise remains. Your completed answers are saved; continue when you are ready.', { count: remaining.length }) : t('{count} exercises remain. Your completed answers are saved; continue when you are ready.', { count: remaining.length })}</p><div class="completion-stats"><span><strong>${activeRun.correct}</strong> ${t('expressions practised')}</span><span><strong>✓</strong> ${t('progress saved')}</span></div><button class="primary-button" data-start-quest="${activeRun.quest.id}">${t('Continue this quest')} ${icon('arrow')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')} ${icon('arrow')}</button></div>`;
        run = undefined; playCue(true); return;
      }
      const result = await api.request<{ xpAdded: number; progress: Progress }>('/quest/complete', { questId: activeRun.quest.id, silentMode: skipListening });
      acceptProgress(result.progress); gained = result.xpAdded; updateProgress();
    }
    if (run !== activeRun) return;
    if (activeRun.interiorObjectId) {
      const object = getInteriorObject(activeRun.interiorObjectId);
      const room = interiorId ? getInterior(interiorId) : undefined;
      document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close learning session'))}">${icon('close')}</button><div class="completion interior-completion"><div class="completion-mark">${icon('check')}</div><h2>${e(object?.sessionTitle ?? t('A useful little encounter.'))}</h2><p>${e(t('You ordered, asked or understood a little more. Your answers are saved. Keep exploring {place} to meet the language in another corner.', { place: room?.name ?? getMap(mapId).name }))}</p><div class="completion-stats"><span><strong>${activeRun.targetCount}</strong> ${t('expressions practised')}</span><span><strong>✓</strong> ${t('progress saved')}</span></div>${object && room ? `<button class="primary-button" data-inspect-interior="${e(object.id)}">${e(t('Return to {name}', { name: object.label }))} ${icon('arrow')}</button>` : ''}<button class="text-button" data-action="close-dialog">${t('Keep exploring')} ${icon('arrow')}</button></div>`;
      playCue(true); run = undefined; return;
    }
    const clue = activeRun.quest && !questGraph(activeRun.quest.id) ? clueFor(activeRun.quest.id) : undefined;
    const act = getExpedition(mapId) ? undefined : actFor(mapId), actFinished = completedAtLevel(level) === quests.filter(item => item.level === level).length;
    const title = clue ? localized(clue.title) : activeRun.objectId ? t('A little thing, better understood.') : t('Familiar words. Fresh memories.');
    const wordsOnly = activeRun.queue.every(ex => 'targetWordId' in ex);
    const body = clue ? renderNarrative(clue.text) : e(activeRun.quest && questGraph(activeRun.quest.id) ? t('Your optional practice is saved. Return to the witness and the evidence to continue the investigation.') : activeRun.objectId ? t('You made sense of this little encounter. Its lore is always here; the expressions can rest until they are ready again.') : wordsOnly ? t('You’ve given these words room to grow. They can rest until their next encounter.') : t('You’ve given these expressions room to grow. They can rest until their next encounter.'));
    const targetCount = new Set(activeRun.queue.map(ex => ex.itemId)).size;
    document.querySelector('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close discovery'))}">${icon('close')}</button><div class="completion story-reveal"><div class="completion-mark">${icon(clue ? 'lantern' : 'leaf')}</div><h2>${e(title)}</h2><p>${body}</p>${clue ? eliseLetter(clue.letter, clue.questId) : ''}${clue ? `<div class="next-lead">${icon('flag')}<span>${renderNarrative(actFinished ? act?.cliffhanger ?? clue.lead : clue.lead)}</span></div>` : ''}<div class="completion-stats"><span><strong>${targetCount}</strong> ${wordsOnly ? t('words practised') : t('expressions practised')}</span><span><strong>${gained ? '+' + gained : '✓'}</strong> ${gained ? t('adventure XP') : t('progress saved')}</span></div>${clue ? `<button class="primary-button" data-action="next-objective">${t('Follow the next lead')} ${icon('arrow')}</button><button class="text-button" data-view="story">${t('Read your discoveries')} ${icon('book')}</button>` : `<button class="primary-button" data-action="close-dialog">${e(t('Back to {place}', { place: getMap(mapId).name }))} ${icon('arrow')}</button>`}<button class="text-button" data-action="close-dialog">${t('Keep exploring')}</button></div>`;
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
      updateWorldEditButton();
      document.querySelector<HTMLElement>('#admin-analytics-link')!.hidden = account.admin !== true;
      profile = { name: result.player.name, avatar: result.player.avatar };
      localStorage.setItem('atlas.profile', JSON.stringify(profile));
      acceptProgress(result.progress, result.player.id);
      world.setAvatar(profile.avatar);
  updateSelfPortraits(document, profile.avatar);

      api.connect();
      document.querySelector<HTMLDialogElement>('#dialog')!.close();
      updateProgress();
      if (view === 'character') renderOther();
      toast(t('Looking good, {name}. Lindenhafen is waiting.', { name: profile.name }));
    } catch (error) { toast((error as Error).message, true); }
    finally { button.disabled = false; }
  };
}
function showProfile() { openDialog(`<div class="profile-dialog-heading"><h2>${t('Nice to meet you.')}</h2></div>${profileForm()}`, 'profile-dialog'); bindProfileForm(); }
const audioPaths = new Map<string, string>();
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
  const path = clipId ? `/audio/dialogue/${clipId}.mp3` : audioReference((findSentence(text) as { audio?: unknown } | undefined)?.audio) ?? audioPaths.get(text);
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
/** Admins edit the town in place; the game keeps running. */
function startWorldEdit(): void {
  if (worldEdit || account.admin !== true || !started) return;
  const session = new WorldEditSession(() => api.token, () => sceneDocument);
  const overlay = new WorldEditOverlay({ onDone: () => endWorldEdit() });
  const bridge = new EditBridge(session, overlay, () => api.selfId, (id, x, y) => api.editPreview(id, x, y));
  // Our own accepted edits apply at once; the socket patch that follows is then a no-op.
  session.onApplied = result => { const changed = applyWorldPatch(result.from, result.contentVersion, result.applied); if (changed?.size) world.applyWorldEdits(result.applied); };
  overlay.bridge = bridge;
  worldEdit = { bridge, overlay, session };
  world.setEditBridge(bridge);
  setDialogueLineEditor({ hide: async lineId => {
    await session.setStoryLine(lineId, true);
    overlay.toast('Line hidden for everyone. Players stop seeing it the next time this conversation opens.');
  } });
  updateWorldEditButton();
}
function endWorldEdit(): void {
  if (!worldEdit) return;
  world.setEditBridge(undefined);
  setDialogueLineEditor(undefined);
  worldEdit.overlay.destroy();
  worldEdit.session.dispose();
  worldEdit = undefined;
  updateWorldEditButton();
  document.querySelector<HTMLElement>('#world-container')?.focus();
}
function updateWorldEditButton(): void {
  const button = document.querySelector<HTMLButtonElement>('#world-edit-button');
  if (!button) return;
  const allowed = account.admin === true && started;
  if (!allowed && worldEdit) endWorldEdit();
  button.hidden = !allowed;
  button.setAttribute('aria-pressed', String(!!worldEdit));
  button.textContent = worldEdit ? 'Done editing' : 'Edit';
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
    if (event.key === 'Escape' && view === 'world' && worldEdit?.bridge.controller?.escape()) { event.preventDefault(); return; }
    if (event.key === 'Escape') { event.preventDefault(); if(deliveryController){deliveryController.destroy();deliveryController=undefined;deliveryHost?.destroy();deliveryHost=undefined;syncWorldMode();return;} if (watchingWorld) watchWorld(false); else if (screenFilterControls?.isOpen()) screenFilterControls.close(); else if (view !== 'world') { if (menuNavigator) menuNavigator.back(); else setView('world'); } else if(started) setView('menu'); return; }
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
    if (target.hasAttribute('data-menu-back')) { menuNavigator?.back(); return; }
    if (target.dataset.view) { cancelRun(); document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView(target.dataset.view as View, !target.dataset.menuSection); return; }
    if (target.dataset.wordDetailBack) { const restore=wordDetailReturn;wordDetailReturn=undefined;restore?.();return; }
    if (target.dataset.openWord) { void openCourseWord(target.dataset.openWord).catch(error=>toast(error.message,true));return; }
    if (target.dataset.openPhrase) { openPhrase(target.dataset.openPhrase);return; }
    if (target.dataset.practicePhrase) { void practisePhrase(target.dataset.practicePhrase);return; }
    if (target.dataset.interiorWord) { void openInteriorWord(target.dataset.interiorWord, Number(target.dataset.wordIndex)); return; }
    if (target.dataset.interiorChoice && interiorConversation) { interiorConversation=chooseInteriorConversation(interiorConversation,target.dataset.interiorChoice);renderInteriorConversationDialog();return; }
    if (target.dataset.interiorConversation && interiorConversation) {
      const action=target.dataset.interiorConversation;
      if(action==='encounter'){showInteriorObject(interiorConversation.objectId);return;}
      interiorConversation=action==='back'?backInteriorConversation(interiorConversation):replayInteriorConversation(interiorConversation);renderInteriorConversationDialog();return;
    }
    if (target.dataset.minigame) { void startMiniGame(target.dataset.minigame); return; }
    if (target.dataset.activity) { void startActivity(target.dataset.activity as ActivityId); return; }
    if (target.dataset.action === 'load-story-page') { void loadStoryPage(); return; }
    if (target.dataset.coursePage) { coursePage = Math.max(0, Number(target.dataset.coursePage)); renderOther(); return; }
    if (target.dataset.courseLevel) { coursePage = 0; courseLevel = target.dataset.courseLevel as Level; void loadContexts('grammar', undefined, courseLevel).then(() => renderOther()).catch(error => toast(error.message, true)); return; }
    if (target.dataset.courseTab) { coursePage = 0; courseTab = target.dataset.courseTab as typeof courseTab; renderOther(); return; }
    if (target.dataset.optionsTab) { optionsTab = target.dataset.optionsTab as OptionsTab; setView('settings'); return; }
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
      case 'edit-world': if (worldEdit) endWorldEdit(); else startWorldEdit(); break;
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
      case 'fullscreen': if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => toast(t('Full screen isn’t available here.'))); break;
      case 'close-dialog': interiorConversation=undefined;wordDetailReturn=undefined;cancelRun(); document.querySelector<HTMLDialogElement>('#dialog')!.close(); pendingDestination = undefined; pendingExpeditionGame = undefined; break;
      case 'manage-access': if(accessClock.snapshot(performance.now())?.phase==='paid')showBillingAccount();else if(account.registered)showPaywall();else showSaveAccount();break;
      case 'course-help': openDialog(`<div class="help-dialog"><h2>${t('Learning routes')}</h2><p>${t('Learn in short encounters, use the language in the world, then return when it is ready again. Vocabulary, grammar and connected texts have their own evidence.')}</p><button class="primary-button" data-action="close-dialog">${t('Back')}</button></div>`);break;
      case 'journal-help': openDialog(`<div class="help-dialog"><h2>${t('Your words')}</h2><p>${t('Seeing a word introduces it. Recognising, hearing and recalling it each build their own memory. Familiar words rest between encounters.')}</p><button class="primary-button" data-action="close-dialog">${t('Back')}</button></div>`);break;
      case 'begin-exercises': renderExercise(); break;
      case 'check-answer': void submitAnswer(); break;
      case 'retry-review-answer': void submitAnswer(); break;
      case 'next-exercise': if (run?.answered) { run.index++; renderExercise(); } break;
      case 'finish-run': void finishRun(); break;
      case 'review': void startAdaptiveReview(); break;
      case 'placement': void startPlacement(); break;
      case 'sleep': if (interiorId === 'inn') { void api.request<{progress:Progress}>('/story/sleep',{id:crypto.randomUUID()}).then(result => { acceptProgress(result.progress); updateProgress(); document.querySelector<HTMLDialogElement>('#dialog')!.close(); toast(t('A new day. Your lantern keeps the promises you made.')); }).catch(error => toast(error.message, true)); } break;
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
      case 'reset-game': showResetGame(); break;
      case 'sound': muted = !muted; localStorage.setItem('atlas.muted', String(muted)); world.setAudioPreferences({ silent: silentMode, muted });  if (!muted) playCue(true); if (view === 'settings') renderOther(); break;
    }
  });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('cancel', () => { cancelRun(); pendingDestination = undefined; });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('click', event => {
    const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { cancelRun(); pendingDestination = undefined; dialog.close(); }
  });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('close', () => { if (!document.querySelector<HTMLDialogElement>('#dialog')!.open) { interiorLoading++; interiorConversation = undefined; wordDetailReturn = undefined; document.querySelector('#game-shell')!.classList.remove('encounter-open'); syncWorldMode(); placementController?.destroy(); placementController = undefined; cancelRun(); miniGameLoading++; miniGameController?.destroy(); miniGameController=undefined; miniGameHost?.destroy(); miniGameHost=undefined; activityLoading++; activityController?.destroy(); activityController = undefined; if (!questController?.isOpen) { world.setConversationTarget(undefined); stopSpeech(); } if(view==='world')document.querySelector<HTMLElement>('#world-container')?.focus({preventScroll:true}); } });
  const menu = document.querySelector<HTMLDialogElement>('#menu-layer')!;
  menu.addEventListener('close', () => { if (!menu.open && view !== 'world') setView('world'); });
  menu.addEventListener('click', event => { if (event.target === menu) setView('world'); });
}

function accessIsActive(): boolean {
  return started && !document.hidden && connection === 'online' && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open && !accessBlocked(accessClock.snapshot(performance.now()));
}
async function sendAccessHeartbeat(active: boolean): Promise<void> {
  if (uiCheckSurface || !started || activeCourse?.target && activeCourse.target !== 'de') return;
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
  if (uiCheckSurface || !started || accessResetting) return;
  if (activeCourse?.target && activeCourse.target !== 'de') {
    accessClock.setActive(!document.hidden && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open && !accessBlocked(accessClock.snapshot(performance.now())), performance.now());
    return;
  }
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
  const access = accessClock.snapshot(performance.now());
  const paid = access?.phase === 'paid';
  hud.hidden = !started || !access || paid || access.phase === 'free' || (!referralAvailable(access) && access.remainingSeconds > 60);
  hud.dataset.phase = access?.phase ?? 'checking';
  document.querySelector('#access-label')!.textContent = paid ? 'Unlimited play' : access?.registered ? 'Free trial left' : 'Guest play left';
  const time = document.querySelector('#access-time')!;
  time.textContent = paid ? access.plan === 'complimentary' ? 'Complimentary' : access.plan === 'lifetime' ? 'Lifetime' : 'Subscribed' : access ? formatAccessTime(access.remainingSeconds) : 'Checking…';
  time.setAttribute('aria-label', paid ? 'Unlimited game access' : `${access?.registered ? 'Trial' : 'Guest play'} time remaining: ${access ? formatAccessTime(access.remainingSeconds) : 'checking'}`);
  document.querySelector('#access-button')!.textContent = paid ? 'Manage' : access?.registered ? 'Subscribe' : 'Login';
  document.querySelector<HTMLButtonElement>('#access-invite')!.hidden = !referralAvailable(access);
  const courseInvite = document.querySelector<HTMLButtonElement>('[data-course-invite]'); if (courseInvite) courseInvite.hidden = !referralAvailable(access);
  const referralCount = document.querySelector('#referral-count');
  if (referralCount) {
    const count = access?.referralSignups ?? 0;
    referralCount.textContent = `${count} ${count === 1 ? 'friend has' : 'friends have'} signed up · ${Math.floor((access?.referralBonusSeconds ?? 0) / 60)} extra minutes earned`;
  }
}
function applyAccess(access: GameAccess): void {
  const previousBonus = accessClock.snapshot(performance.now())?.referralBonusSeconds ?? 0;
  accessClock.update(access, performance.now());
  updateAccessHud();
  if (uiCheckSurface || !started || accessResetting) return;
  if ((access.referralBonusSeconds ?? 0) > previousBonus) toast(`${Math.floor(((access.referralBonusSeconds ?? 0) - previousBonus) / 60)} extra minutes added. Your friend signed up!`);

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
    showAccountDialog(`<h2 id="account-title">Checking your play time…</h2><p>Your adventure will continue when your saved allowance is confirmed.</p><p id="account-error" class="account-error" role="alert"></p><button type="button" class="primary-button" id="access-retry">Try again</button>`, true);
    document.querySelector<HTMLButtonElement>('#access-retry')!.onclick = () => { void api.access().catch(accountError); };
    void api.access().catch(accountError);
  }
}
function showResetGame(): void {
  const access = accessClock.snapshot(performance.now());
  const required = accessBlocked(access);
  const free = access?.phase === 'free';
  showAccountDialog(`<h2 id="account-title">Reset your game?</h2><p>Starting over deletes all quests, XP, learned words, practice results and story saves. Your character, account and any paid access stay the same. ${free ? 'You return to the beginning with unlimited free play.' : 'You return to the beginning with 15 free minutes.'}</p>${free ? '' : '<p>You can start over for another 15 minutes as often as you like.</p>'}<p id="account-error" class="account-error" role="alert"></p><button type="button" class="primary-button reset-progress-button" id="game-reset-confirm">${free ? 'Reset game' : 'Reset game &amp; play 15 minutes'}</button><button type="button" class="text-button" id="game-reset-back">Keep my progress</button>`, required);
  document.querySelector<HTMLButtonElement>('#game-reset-back')!.onclick = () => {
    if (!required) document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
    else if (account.registered) showPaywall(true);
    else showSaveAccount(true);
  };
  document.querySelector<HTMLButtonElement>('#game-reset-confirm')!.onclick = async event => {
    const button = event.currentTarget as HTMLButtonElement;
    const back = document.querySelector<HTMLButtonElement>('#game-reset-back')!;
    button.disabled = true; back.disabled = true;
    try {
      accessResetting = true;
      api.destroy();
      const result = await api.resetGame();
      // Activity destruction persists its draft, so dispose it before clearing.
      activityController?.destroy(); activityController = undefined;
      miniGameController?.destroy(); miniGameController = undefined;
      miniGameHost?.destroy(); miniGameHost = undefined;
      deliveryController?.destroy(); deliveryController = undefined;
      deliveryHost?.destroy(); deliveryHost = undefined;
      notifications?.destroy(); notifications = undefined;
      if (reminderTimer !== undefined) clearInterval(reminderTimer);
      reminderTimer = undefined; accountReminder = undefined;
      clearGameProgress(localStorage, result.player.id, result.player.name);
      location.reload();
    } catch (error) { accessResetting = false; accountError(error); button.disabled = false; back.disabled = false; }
  };
}
let referralDialogRevision = 0;
async function showInviteFriend(): Promise<void> {
  if (!referralAvailable(accessClock.snapshot(performance.now()))) return;
  const owner = api.selfId;
  const revision = ++referralDialogRevision;
  const back = '<button type="button" class="billing-secondary-button" id="referral-back">Back to my adventure</button>';
  showAccountDialog(`<div id="referral-panel"><h2 id="account-title">Invite a friend. Get 90 minutes.</h2><p>When a new friend signs up through your link, you get 90 extra minutes of free play. Each new signup counts once, and the bonus adds to your remaining time.</p><p role="status">Getting your invite link…</p><p id="account-error" class="account-error" role="alert"></p>${back}</div>`);
  const bindBack = () => { document.querySelector<HTMLButtonElement>('#referral-back')!.onclick = () => { referralDialogRevision++; document.querySelector<HTMLDialogElement>('#account-dialog')!.close(); }; };
  bindBack();
  try {
    const result = await api.referralLink();
    const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
    if (revision !== referralDialogRevision || owner !== api.selfId || !dialog.open || !dialog.querySelector('#referral-panel')) return;
    const url = new URL(result.url);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Your invite link could not load. Please try again.');
    showAccountDialog(`<div id="referral-panel"><h2 id="account-title">Invite a friend. Get 90 minutes.</h2><p>Send your link to a friend. When they create a new account, you get 90 extra minutes of free play—even if your trial has ended by then.</p><label class="form-label" for="referral-url">Your invite link</label><input class="name-input referral-url" id="referral-url" readonly value="${e(url.href)}"/><button type="button" class="primary-button" id="referral-copy">Copy invite link ${icon('check')}</button><p class="referral-status" id="referral-count" role="status"></p><p class="referral-status" id="referral-copy-status" role="status"></p><p id="account-error" class="account-error" role="alert"></p>${back}</div>`);
    bindBack(); updateAccessHud();
    document.querySelector<HTMLButtonElement>('#referral-copy')!.onclick = async () => {
      const status = document.querySelector<HTMLElement>('#referral-copy-status')!;
      const input = document.querySelector<HTMLInputElement>('#referral-url')!;
      let clipboardTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
        await Promise.race([navigator.clipboard.writeText(url.href), new Promise<never>((_, reject) => { clipboardTimeout = setTimeout(() => reject(new Error('clipboard unavailable')), 2500); })]);
        if (status.isConnected) status.textContent = 'Invite link copied. Send it to your friend.';
      } catch {
        if (input.isConnected) { input.focus(); input.select(); status.textContent = 'Select and copy the link above to send it to your friend.'; }
      } finally { if (clipboardTimeout !== undefined) clearTimeout(clipboardTimeout); }
    };
  } catch (error) {
    if (revision === referralDialogRevision && owner === api.selfId && document.querySelector('#referral-panel')) accountError(error);
  }
}
function showFreeAccess(): void {
  showAccountDialog(`<h2 id="account-title">Enjoy unlimited free play.</h2><p>Your adventure is free to play. There are no time limits or subscriptions.</p><button type="button" class="primary-button" id="free-access-back">Back to my adventure</button>`);
  document.querySelector<HTMLButtonElement>('#free-access-back')!.onclick = () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
}
function showPaywall(required = accessClock.snapshot(performance.now())?.phase === 'payment_required', notice = ''): void {
  const access = accessClock.snapshot(performance.now());
  if (access?.phase === 'free') { showFreeAccess(); return; }
  if (!access?.registered) { showSaveAccount(access?.phase === 'login_required', true); return; }
  if (access.phase === 'paid') { showBillingAccount(); return; }
  trackAnalytics('paywall_viewed', required ? 'required' : 'optional');
  showAccountDialog(`<h2 id="account-title">${required ? 'Your free trial is complete.' : 'Keep your adventure going.'}</h2><p>${required ? 'Your free play time is used up. Choose a plan to continue from exactly where you left off, or reset your game for another 15 free minutes.' : 'Subscribe now for unlimited play and keep every step of your adventure.'}</p><div class="billing-plans"><button type="button" class="billing-plan" data-billing-plan="monthly" ${access.billingAvailable ? '' : 'disabled'}><span>Monthly</span><strong>€2.99<span class="caption">/ month</span></strong><p>Billed monthly. Cancel anytime.</p><b>Subscribe monthly ${icon('arrow')}</b></button><button type="button" class="billing-plan" data-billing-plan="yearly" ${access.billingAvailable ? '' : 'disabled'}><span>Yearly</span><strong>€9.99<span class="caption">/ year</span></strong><p>Billed yearly. Cancel anytime.</p><b>Subscribe yearly ${icon('arrow')}</b></button><button type="button" class="billing-plan billing-plan-lifetime" data-billing-plan="lifetime" ${access.billingAvailable ? '' : 'disabled'}><span>Lifetime</span><strong>€29.99<span class="caption">once</span></strong><p>One payment. Unlimited play.</p><b>Get lifetime access ${icon('arrow')}</b></button></div><span class="billing-note">Prices in EUR. Secure checkout with Creem. Tax included.</span>${!access.billingAvailable ? '<p class="billing-unavailable">Payments are being set up. Your progress is saved; check again shortly.</p>' : ''}<p class="game-reset-note">Start fresh as often as you like. Resetting clears your game progress.</p><button type="button" class="billing-secondary-button" id="billing-reset">Reset game &amp; play 15 minutes free</button><p id="account-error" class="account-error" role="alert">${e(notice)}</p><button type="button" class="billing-secondary-button" id="billing-check">Already paid? Check payment status</button>${required ? '' : '<button type="button" class="billing-secondary-button" id="billing-back">Back to my free trial</button>'}`, required);

  document.querySelector('#account-dialog')!.classList.add('billing-dialog');
  document.querySelectorAll<HTMLButtonElement>('[data-billing-plan]').forEach(button => { button.onclick = async () => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-billing-plan]')];
    buttons.forEach(item => { item.disabled = true; });
    try { const result = await api.checkout(button.dataset.billingPlan as BillingPlan); location.assign(billingURL(result.url)); }
    catch (error) { accountError(error); buttons.forEach(item => { item.disabled = !access.billingAvailable; }); }
  }; });
  document.querySelector<HTMLButtonElement>('#billing-reset')!.addEventListener('click', showResetGame);
  document.querySelector<HTMLButtonElement>('#billing-back')?.addEventListener('click', () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close());
  document.querySelector<HTMLButtonElement>('#billing-check')!.onclick = () => void verifyBilling();
}
async function verifyBilling(attempt = 0, revision = ++billingVerificationRevision): Promise<void> {
  if (billingVerificationTimer !== undefined) clearTimeout(billingVerificationTimer);
  const access = accessClock.snapshot(performance.now());
  if (access?.phase === 'free') { showFreeAccess(); return; }
  if (attempt === 0) showAccountDialog(`<h2 id="account-title">Confirming your payment…</h2><p role="status">We’re checking your payment with Creem. Your progress is saved.</p><p id="account-error" class="account-error" role="alert"></p><button type="button" class="billing-secondary-button" id="billing-verification-back">${accessBlocked(access) ? 'Back to plans' : 'Back to my adventure'}</button>`, accessBlocked(access));
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
      if (!activeCourse) location.reload();
      return;
    }
    if (attempt < 11) { billingVerificationTimer = window.setTimeout(() => void verifyBilling(attempt + 1, revision), 2500); return; }
    showPaywall(undefined, 'Your payment is still processing. Check payment status again in a moment.');
  } catch (error) { if (revision === billingVerificationRevision) showPaywall(undefined, error instanceof Error ? error.message : 'Could not check payment. Please try again.'); }
}
function showBillingAccount(): void {
  const access = accessClock.snapshot(performance.now());
  if (access?.plan === 'complimentary') {
    showAccountDialog('<h2 id="account-title">Complimentary access is active.</h2><p>Your account has unlimited play through a support grant. Contact support for details about its duration.</p><button type="button" class="primary-button" id="complimentary-back">Back to my adventure</button>');
    document.querySelector<HTMLButtonElement>('#complimentary-back')!.onclick = () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
    return;
  }
  showAccountDialog(`<h2 id="account-title">${access?.plan === 'lifetime' ? 'Lifetime access is yours.' : 'Your subscription is active.'}</h2><p>Enjoy unlimited play. Manage your ${access?.plan === 'lifetime' ? 'purchase and receipts' : 'subscription, payment details and cancellation'} securely with Creem.</p><p id="account-error" class="account-error" role="alert"></p><button type="button" class="primary-button" id="billing-portal">Open billing portal ${icon('arrow')}</button><button type="button" class="billing-secondary-button" id="billing-account-back">Back to my adventure</button>`);
  document.querySelector<HTMLButtonElement>('#billing-account-back')!.onclick = () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
  document.querySelector<HTMLButtonElement>('#billing-portal')!.onclick = async event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try { const result = await api.billingPortal(); location.assign(billingURL(result.url)); }
    catch (error) { accountError(error); button.disabled = false; }
  };
}
function showAccountDialog(html: string, required = false) {
  if (account.admin) html += '<a class="text-button" href="/admin.html">Open Admin</a>';
  const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
  if(!dialog.open){
    accountKeptActivityPaused=!!document.querySelector('.activity-intermission,.expedition-encounter-learning[inert],.expedition-game[inert]');
    activityController?.pause();miniGameController?.pause();deliveryController?.pause();stopSpeech();
    if(exerciseChoiceTimer){clearTimeout(exerciseChoiceTimer);exerciseChoiceTimer=undefined;pendingExerciseChoice=undefined;}
  }
  dialog.innerHTML = brandMarkup + html;
  dialog.dataset.accessWall = required ? 'required' : '';
  dialog.dataset.accessPhase = required ? accessClock.snapshot(performance.now())?.phase ?? 'checking' : '';
  dialog.classList.remove('billing-dialog');
  if (!dialog.open) dialog.showModal();
  syncAccessActivity();
  syncWorldMode();
  accountReminder?.tick(performance.now(), false);
}
function accountError(error: unknown) {
  if (import.meta.env.DEV) console.error(error);
  document.querySelector<HTMLElement>('#account-error')!.textContent = error instanceof Error ? error.message : t('Please try again.');
}
function showLanguageEntry(restoreName = false, initialLanguage = entryLanguageSelection ?? baseLanguage()) {
  entryLanguage = undefined;
  showAccountDialog('');
  mountLanguageOnboarding(document.querySelector<HTMLDialogElement>('#account-dialog')!, {
    initialLanguage, initialLearningLanguage: entryTarget,
    onConfirm: languages => {
      entryTarget = languages.learningLanguage; sessionStorage.setItem('atlas.entryTarget', entryTarget);
      entryLanguage = entryLanguageSelection = languages.motherTongue;
      showNameEntry(restoreName);
    },
    onLogin: languages => { entryLanguageSelection = languages.motherTongue; showLogin(); },
  });
}
const pendingLanguageKey = 'atlas.baseLanguagePending';
/** Switch the support language, save it with the account, then repaint every screen in it. */
async function changeBaseLanguage(language: BaseLanguage) {
  if (activeCourse && !activeCourse.supportLanguages.includes(language)) return;
  configureContentSession(() => api.token, { accountId: api.selfId, courseId: activeCourse?.id, supportLanguage: language });
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
  const selected = entryDraft?.name ?? (typed?.trim() ? typed.trim().slice(0, 24) : restoreName ? profile.name : entryNames[0]);
  const suggestions = entryNames.includes(selected) ? entryNames : [selected, ...entryNames.slice(0, 3)];
  showAccountDialog(`${onboardingStepsMarkup(2)}<h2 id="account-title">${t('What should the town call you?')}</h2><p>${t('Pick a suggested name or write your own. This is the name other players will see.')}</p><div class="onboarding-language-summary"><div class="onboarding-language-pair">${onboardingLanguageSummary(baseLanguage(), entryTarget)}</div><button type="button" class="text-button" id="entry-languages">${t('Change languages')}</button></div><form id="name-entry-form"><div class="name-suggestions" role="group" aria-label="${e(t('Suggested player names'))}">${suggestions.map(name => `<button type="button" class="name-suggestion" aria-pressed="${name === selected}" data-suggested-name="${e(name)}">${e(name)}</button>`).join('')}</div><label class="form-label" for="entry-name">${t('Your player name')}</label><input id="entry-name" class="name-input" value="${e(selected)}" required minlength="2" maxlength="24" autocomplete="nickname" aria-describedby="name-help"/><span id="name-help">${t('2–24 letters or numbers; spaces, dashes, underscores and apostrophes are welcome.')}</span>${characterBuilderMarkup()}<p id="account-error" class="account-error" role="alert"></p><button class="primary-button" type="submit">${t('Start my adventure')} ${icon('arrow')}</button></form><button type="button" class="text-button" id="entry-login">${t('Already played? Log in with email')}</button>`);
  const form = document.querySelector<HTMLFormElement>('#name-entry-form')!;
  const input = document.querySelector<HTMLInputElement>('#entry-name')!;
  const getAvatar = bindCharacterBuilder(form, entryDraft?.avatar ?? profile.avatar);
  if (!entryDraft && !restoreName && !typed) getAvatar.applyPreset(selected);
  const sync = () => {
    const name = input.value.trim();
    input.setCustomValidity(/^[\p{L}\p{N}\p{M} _'-]{2,24}$/u.test(name) ? '' : t('Choose a name with 2–24 letters, numbers, spaces, dashes, underscores or apostrophes.'));
    form.querySelectorAll<HTMLButtonElement>('[data-suggested-name]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.suggestedName === name)));
  };
  input.addEventListener('input', sync);
  form.querySelectorAll<HTMLButtonElement>('[data-suggested-name]').forEach(button => { button.onclick = () => { input.value = button.dataset.suggestedName!; getAvatar.applyPreset(input.value); sync(); }; });
  const saveDraft = () => { entryDraft = { name: input.value, avatar: getAvatar() }; };
  document.querySelector<HTMLButtonElement>('#entry-login')!.onclick = () => { saveDraft(); showLogin(); };
  document.querySelector<HTMLButtonElement>('#entry-languages')!.onclick = () => { saveDraft(); showLanguageEntry(restoreName); };
  form.onsubmit = async event => {
    event.preventDefault(); sync(); if (!form.checkValidity()) return;
    const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = true; button.textContent = t('Opening the town…');
    document.querySelector<HTMLButtonElement>('#entry-languages')!.disabled = true;
    document.querySelector<HTMLButtonElement>('#entry-login')!.disabled = true;
    try {
      const requestedSupport = baseLanguage();
      let result = await api.session(input.value.trim(), getAvatar(), entryTarget === 'en' ? 'en' : requestedSupport);
      if (entryTarget === 'en') {
        configureContentSession(() => api.token, { accountId: result.player.id, supportLanguage: baseLanguage() });
        const listing = await contentApi.courses<{ courses: import('./content-api').ContentCourse[] }>();
        const course = listing.courses.find(course => course.target === entryTarget);
        if (!course) throw new Error('This course is unavailable.');
        const activated = await contentApi.activate<{ player: WorldPlayer; progress: Progress; preferences: SessionResult['preferences']; activeCourseId: string }>(course.id, requestedSupport);
        result = { ...result, ...activated };
      }
      // Resuming a saved guest keeps its stored preference; apply the choice made on this screen.
      if (result.preferences.baseLanguage !== baseLanguage()) result = { ...result, preferences: await api.savePreferences({ baseLanguage: baseLanguage() }) };
      localStorage.setItem(`atlas.nameChosen.${result.player.id}`, 'true');
      if (await enterGame(result)) document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
    } catch (error) { accountError(error); }
    finally {
      button.disabled = false; button.innerHTML = `${t('Start my adventure')} ${icon('arrow')}`;
      document.querySelector<HTMLButtonElement>('#entry-languages')!.disabled = false;
      document.querySelector<HTMLButtonElement>('#entry-login')!.disabled = false;
    }
  };
  sync();
}
async function enterGame(result: SessionResult): Promise<boolean> {
  trackAnalytics('page_view', 'game');
  await setBaseLanguage(result.preferences.baseLanguage);
  account = result.account;
  document.querySelector<HTMLElement>('#admin-analytics-link')!.hidden = account.admin !== true;
  if (result.access) accessClock.update(result.access, performance.now());
  const params = new URLSearchParams(location.search);
  if (params.get('billing') === 'success') {
    for (const key of ['billing', 'checkout_id', 'order_id', 'customer_id', 'subscription_id', 'product_id', 'request_id', 'signature']) params.delete(key);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
    queueMicrotask(() => void verifyBilling());
  }

  if (result.access && accessBlocked(result.access)) {
    started = true; account = result.account; profile = { name: result.player.name, avatar: result.player.avatar };
    acceptProgress(result.progress, result.player.id); accessClock.update(result.access, performance.now());
    if (result.access.phase === 'login_required') showSaveAccount(true); else showPaywall();
    return false;
  }
  await loadServerContent(result);
  if (activeCourse?.target !== 'de') {
    started = true; account = result.account; acceptProgress(result.progress, result.player.id); profile = { name: result.player.name, avatar: result.player.avatar };
    if (result.access) accessClock.update(result.access, performance.now());
    document.querySelector<HTMLElement>('#game-shell')!.hidden = true; world.destroy();
    document.body.classList.add('course-player-mode');
    const host = document.createElement('main'); host.className = 'course-player'; document.body.append(host);
    await mountCoursePlayer(host, { api, session: result, onAccessRequired: () => { if (account.registered) showPaywall(); else showSaveAccount(true); }, onAccount: () => account.registered ? showPaywall(false) : showSaveAccount(), onInvite: () => void showInviteFriend(), canInvite: () => referralAvailable(accessClock.snapshot(performance.now())), onLogout: showLogout, isActive: () => !document.hidden && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open });
    return true;
  }
  if (reconcileBaseLanguage(result)) return false;
  // The builder updates in place. Repaint the world shell once the new adventure is saved.
  if (shellLanguage !== baseLanguage()) { window.location.reload(); return false; }
  started = true;
  showFirstControls();
  account = result.account;
  updateWorldEditButton();
  document.querySelector<HTMLElement>('#admin-analytics-link')!.hidden = account.admin !== true;
  acceptProgress(result.progress, result.player.id);
  profile = { name: result.player.name, avatar: result.player.avatar };
  localStorage.setItem('atlas.profile', JSON.stringify(profile));

  world.setPlayers([result.player], result.player.id);
  world.setAvatar(profile.avatar);
  updateSelfPortraits(document, profile.avatar);
  api.mapId = firstAvailableMap(api.mapId, progress.completedQuestIds);
  if (result.access) accessClock.update(result.access, performance.now());
  accessConnectionPaused = true;
  updateProgress(); updateAccessHud();
  void sendHeartbeat(0);
  void loadCourse().catch(error => toast(error.message, true));
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
  return true;
}
function showSaveAccount(required = accessClock.snapshot(performance.now())?.phase === 'login_required', subscribeAfter = false) {
  if (!started || account.registered) return;
  const allowance = accessClock.snapshot(performance.now());
  if (allowance?.phase === 'free') required = false;
  showAccountDialog(`<h2 id="account-title">${required ? 'Sign up to keep going.' : 'Save your adventure.'}</h2><p>${allowance?.phase === 'free' ? 'Keep your character and progress on every device. Playing is free with no time limit; creating an account is optional.' : required ? `Create a free account to keep your progress${(allowance?.playedSeconds ?? 0) < 900 ? ` and play for ${Math.ceil((900 - (allowance?.playedSeconds ?? 0)) / 60)} more minutes` : ', then choose a plan to continue'}. Or reset your game for another 15 free minutes.` : `Keep your character and progress on every device. You get 15 free minutes in total; ${formatAccessTime(Math.max(0, 900 - (allowance?.playedSeconds ?? 0)))} remain in your trial.`}</p><div class="account-switch" role="group" aria-label="Account options"><button type="button" class="selected" aria-pressed="true">Sign up</button><button type="button" id="signup-login" aria-pressed="false">Log in</button></div><form id="save-account-form"><label class="form-label" for="account-email">${t('Email')}</label><input class="name-input" id="account-email" name="email" type="email" required maxlength="254" autocomplete="email"/><label class="form-label" for="account-password">${t('Choose a password')}</label><input class="name-input" id="account-password" name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password" aria-describedby="password-help"/><span id="password-help" class="caption">${t('Use 10–128 characters.')}</span><label class="form-label" for="account-password-confirm">${t('Confirm password')}</label><input class="name-input" id="account-password-confirm" type="password" required minlength="10" maxlength="128" autocomplete="new-password"/><p id="account-error" class="account-error" role="alert"></p><button class="primary-button" type="submit">Sign up &amp; keep my progress ${icon('check')}</button></form>${required ? '<p class="game-reset-note">Reset your game for 15 free minutes as often as you like. Your progress is cleared and your character stays the same.</p><button type="button" class="text-button" id="guest-reset">Reset game &amp; play 15 minutes free</button>' : '<button type="button" class="text-button" id="account-later">Back to my adventure</button>'}`, required);
  document.querySelector<HTMLButtonElement>('#signup-login')!.onclick = () => showLogin();
  if (allowance?.phase !== 'free' && pendingReferral(localStorage)) document.querySelector('#save-account-form')!.insertAdjacentHTML('beforebegin', '<p class="referral-status">Your signup gives the friend who invited you 90 extra minutes of free play.</p>');
  document.querySelector<HTMLButtonElement>('#guest-reset')?.addEventListener('click', showResetGame);

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
      updateWorldEditButton();
      document.querySelector<HTMLElement>('#admin-analytics-link')!.hidden = account.admin !== true;
      password.value = ''; confirmation.value = '';
      if (!account.access) await api.access();
      if (!activeCourse) { location.reload(); return; }
      document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
      if (subscribeAfter) showPaywall();
      if (view === 'settings') renderOther();
      toast(t('Saved, {name}. Use your email and password to log in on another device.', { name: profile.name }));
    } catch (error) { accountError(error); }
    finally { button.disabled = false; }
  };
}
function showLogout() {
  showAccountDialog(`<h2 id="account-title">${t('Log out?')}</h2><p>${account.registered ? t('Your adventure is saved. Log in with your email and password to continue later.') : t('This guest adventure has no email or password. If you log out, you cannot return to this character. Save your adventure first to keep your progress.')}</p><p id="account-error" class="account-error" role="alert"></p>${!account.registered ? `<button class="primary-button" id="logout-save">${t('Save my adventure')}</button>` : ''}<button class="${account.registered ? 'primary-button' : 'text-button'}" id="logout-confirm">${account.registered ? t('Log out') : t('Log out without saving')}</button><button class="text-button" id="logout-cancel">${t('Back to my adventure')}</button>`);
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
  showAccountDialog(`<h2 id="account-title">${t('Continue your adventure.')}</h2><p>${t('Use the email and password you saved to restore your name, character and progress.')}${started ? ` ${t('Logging in opens the adventure linked to that email.')}` : ''}</p>${started && !account.registered ? `<div class="account-switch" role="group" aria-label="Account options"><button type="button" id="login-signup" aria-pressed="false">Sign up</button><button type="button" class="selected" aria-pressed="true">Log in</button></div>` : ''}<form id="login-account-form"><label class="form-label" for="login-email">${t('Email')}</label><input class="name-input" id="login-email" type="email" required maxlength="254" autocomplete="username"/><label class="form-label" for="login-password">${t('Password')}</label><input class="name-input" id="login-password" type="password" required maxlength="128" autocomplete="current-password"/><p id="account-error" class="account-error" role="alert"></p><button class="primary-button" type="submit">${e(t('Log in & continue'))} ${icon('arrow')}</button></form>${required ? '<p class="game-reset-note">Signing up keeps this guest adventure. Logging in restores the adventure saved to that email.</p><button type="button" class="text-button" id="guest-reset">Reset game &amp; play 15 minutes free</button>' : `<button class="text-button" id="login-back">${started ? t('Back to my adventure') : entryLanguage ? t('Back to choosing a name') : t('Back to choosing languages')}</button>`}`, required);
  document.querySelector<HTMLButtonElement>('#login-back')?.addEventListener('click', () => {
    if (started) document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
    else if (entryLanguage) showNameEntry(!!api.token);
    else showLanguageEntry(!!api.token);
  });
  document.querySelector<HTMLButtonElement>('#login-signup')?.addEventListener('click', () => showSaveAccount(required));
  document.querySelector<HTMLButtonElement>('#guest-reset')?.addEventListener('click', showResetGame);
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

/** Deterministic development previews exercise the production renderers with a throwaway guest's content. */
async function openUiCheck(surface: string) {
  if (!import.meta.env.DEV || !uiCheckSurface) return;
  const preview = await import('./test-support/ui-content-preview');
  await preview.installUiContentPreview(profile.avatar);
  api.token='';
  api.request=async()=>{throw new Error(t('This preview does not save progress.'));};
  api.selfId='ui-check';
  const module=await loadCourse();
  const wordIds=surface==='encounter'?[]:(surface==='activity'?module.courseLexicon:module.courseLexicon.filter(word=>word.level==='A1').slice(0,24)).map(word=>word.id);
  acceptProgress({...emptyProgress(),intake:{version:1,activeSeconds:600,creditSeconds:0,lastBeatAt:new Date().toISOString(),wordIds}},'ui-check');
  started=true; connection='online';
  accessClock.update({phase:'paid',remainingSeconds:0,playedSeconds:600,registered:true,billingAvailable:false,plan:'lifetime'},performance.now());
  profile.name='Wanderer';
  updateProgress();updateAccessHud();
  if(surface==='home')setView('menu');
  else if(surface==='options')setView('settings');
  else if(surface==='character')setView('character');
  else if(surface==='help')setView('help');
  else if(surface==='account'){account={registered:true,email:'wanderer@example.com'};optionsTab='account';setView('settings');}
  else if(surface==='journal')setView('journal');
  else if(surface==='course')setView('course');
  else if(surface==='encounter'){interiorId='cafe';syncLocation();await showInteriorObject('interior:cafe:coffee');}
  else if(surface==='activity')await startActivity('cafe');
  else setView('world');
  world.setPresentation('hidden');
  document.querySelector<HTMLElement>('#world-container')!.style.background=`center / cover url('${getMap(mapId).previewAsset}')`;
  await Promise.all([...document.querySelectorAll<HTMLImageElement>('img[data-avatar-portrait]')].map(async image => {
    const encoded = image.dataset.avatarPortrait; if (!encoded) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          const source = await bakeAvatarPortrait(normalizeAvatar(JSON.parse(encoded)), image.dataset.avatarExpression ?? 'neutral');
          if (!image.isConnected || image.dataset.avatarPortrait !== encoded) return;
          image.src = source; await image.decode();
        })(),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('The UI preview portrait did not finish rendering.')), 12000); }),
      ]);
    } finally { if (timeout !== undefined) clearTimeout(timeout); }
  }));
  document.body.dataset.uiCheckReady=surface;
}
async function boot() {
  if (!uiCheckSurface) {
    try {await loadPublishedWorld();}
    catch(error){document.querySelector('#app')!.innerHTML=`<p role="alert">${e(error instanceof Error?error.message:'The saved world could not be loaded.')}</p><a href="/">Reload the game</a>`;return;}
  }
  // Paint in the cached support language; the account's saved choice is applied once the session resumes.
  await setBaseLanguage(cachedBaseLanguage(), { persist: false });
  renderShell();
  const stopPortraits = observeAvatarPortraits(document.body);
  window.addEventListener('beforeunload', stopPortraits, { once: true });
  if (uiCheckSurface && ['home','options','character','help','account','encounter','journal','activity','course','world'].includes(uiCheckSurface)) { await openUiCheck(uiCheckSurface); return; }
  api.onAccess = applyAccess;
  let refreshWorld:Promise<void>|undefined;
  const refreshPublishedWorld=():Promise<void>=>refreshWorld??=(async()=>{
    const previous=sceneContentVersion;
    await loadPublishedWorld();
    if(previous!==sceneContentVersion){regionReady=false;world.reloadPublishedScene();updateProgress();syncWorldMode();}
  })().finally(()=>{refreshWorld=undefined;});
  api.onWorldChanged=async()=>{const previous=sceneContentVersion;await refreshPublishedWorld();if(previous===sceneContentVersion)throw new Error('The world versions do not match. Reload the game to try again.');};
  // Admin edits arrive as small patches; a missed patch falls back to a full reload.
  api.onWorldPatch=patch=>{
    const changed=applyWorldPatch(patch.from,patch.contentVersion,patch.ops);
    if(!changed){void refreshPublishedWorld().catch(error=>toast(error instanceof Error?error.message:'The saved world could not be loaded.',true));return;}
    if(changed.size)world.applyWorldEdits(patch.ops);
  };
  api.onEditLocks=locks=>worldEdit?.bridge.setLocks(locks);
  api.onStoryChanged=(graphId,questId)=>{void refreshQuestGraph(graphId,questId).catch(()=>undefined);};
  api.onEditPreview=preview=>worldEdit?.bridge.remotePreview(preview.objectId,preview.x,preview.y,preview.adminName);
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
    players = [];
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
  };
  api.onStatus = value => {
    connection = value;
    if (value !== 'online' && pendingMap) {
      pendingMap = undefined; pendingDestination = undefined; pendingExpeditionGame = undefined;
    }
    syncAccessActivity(); syncWorldMode();
    updateConnection();
  };
  api.onError = message => { if (pendingMap) { pendingMap = undefined; pendingDestination = undefined; pendingExpeditionGame = undefined; syncWorldMode(); } toast(message, true); };
  showAccountDialog(`<h2 id="account-title">${t('Opening your adventure…')}</h2><p role="status">${t('Checking for your saved character.')}</p>`);
  try {
    const result = await api.resume();
    if (result) {
      profile = { name: result.player.name, avatar: result.player.avatar };
      account = result.account;
      if (account.registered || localStorage.getItem(`atlas.nameChosen.${result.player.id}`) === 'true') {
        if (await enterGame(result)) document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
      } else showLanguageEntry(true, result.preferences.baseLanguage);
    } else showLanguageEntry();
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    connection = 'offline'; updateConnection();
    showLanguageEntry(!!api.token);
    const message = document.querySelector<HTMLElement>('#account-error')!;
    message.textContent = t('The town could not connect. You can try starting again in a moment.');
  }
}
function updateConnection() {
  const close = document.querySelector<HTMLElement>('.menu-close');
  if (!close) return;
  close.querySelector('.connection-dot')?.remove();
  if (connection !== 'online') close.insertAdjacentHTML('beforeend', `<span class="connection-dot" role="status" aria-label="${e(connection === 'incompatible' ? t('Reload to continue') : connection === 'replaced' ? t('Active in another tab') : t('Reconnecting'))}"></span>`);
}
document.addEventListener('visibilitychange', () => { syncAccessActivity(); updateAccessHud(); void sendAccessHeartbeat(accessIsActive()); accountReminder?.tick(performance.now(), started && !document.hidden && connection === 'online' && !document.querySelector<HTMLDialogElement>('#account-dialog')?.open); syncWorldMode(); if (document.hidden) { if(exerciseChoiceTimer){clearTimeout(exerciseChoiceTimer);exerciseChoiceTimer=undefined;pendingExerciseChoice=undefined;} activityController?.pause(); miniGameController?.pause(); deliveryController?.pause(); stopSpeech(); } else if(!accessBlocked(accessClock.snapshot(performance.now())) && !document.querySelector<HTMLDialogElement>('#account-dialog')?.open) { activityController?.resume(); miniGameController?.resume(); deliveryController?.resume(); } if (!document.hidden && regionReady) onRegionReady(mapId); });
window.addEventListener('beforeunload', () => { notifications?.destroy(); removeFormNotifications?.(); removeSentenceTranslations(); stopUpdateChecks?.(); removeUpdateNotice?.(); exposureObserver?.disconnect(); if (exposureTimer !== undefined) clearTimeout(exposureTimer); if (reminderTimer !== undefined) clearInterval(reminderTimer); if (billingVerificationTimer !== undefined) clearTimeout(billingVerificationTimer); accountReminder?.tick(performance.now(), false); screenFilterControls?.destroy(); activityController?.destroy(); stopSpeech(); api.destroy(); world?.destroy(); });
void boot();

mountSupportBanner();
