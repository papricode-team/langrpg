import './tokens.css';
import {buildingRoomId} from './room-layout';
import {roomKind} from './room-kind';
import { animalAction, animalSpeciesFromId } from './animal-behavior';
import { mountSupportBanner } from './support-session';
import { startAnalytics, trackAnalytics } from './analytics-client';
import { castPortraitMarkup } from './cast-portrait';
import { castActor } from './character-cast';
import { StoryMechanicsUi } from './story-mechanics-ui';
import { referralAvailable } from './referrals';
import { brandMarkup } from './branding';
import {loadPublishedWorld,sceneContentVersion,sceneDocument} from './scene-data';
import {applyWorldPatch} from './world-patch';
import { avatarPortraitMarkup, bakeAvatarPortrait, observeAvatarPortraits, updateSelfPortraits } from './avatar-portrait';
import { normalizeAvatar } from './character-recipe.mjs';
import { mountOptionalPlacement } from './placement-ui';
import { QuestController } from './quest-controller';
import { createGlossLookup } from './learning-context';
import { loadServerContent, loadQuestGraph, loadDialogueSentence, loadExercise, loadUnit, loadWords, loadRestoredWords, loadStoryContent, storyContentRemaining, loadContexts, loadNpcConversation, loadRegionContent, loadCinematic, hydrateNarratives, refreshBootstrap, runtimeReference, loadInterior, loadInteriorConversation, loadActivity, loadMiniGame, loadExpeditionEncounter, loadPlacement, invalidateContext, activeCourse, refreshQuestGraph } from './content-runtime';
import { getSentence } from './content-api';
import { mountCoursePlayer } from './course-player';
import { questGraph, questGraphs } from './quest-graph';
import { storyState } from './dialogue';
import type { QuestGraph } from './dialogue';
import { optionalStoryPractice } from './story-panels';
import { lanternRewards, lanternRewardsMarkup, titleLabel } from './lantern-rewards';
import type { CutsceneKind, CutsceneOutcome } from './cutscene';
import { grammarForQuest } from './contextual-grammar';
import { questObjectivesMarkup } from './quest-objectives';
import { routeUnlocked, routeLockReason, questUnlocked, questAvailable, questLockReason, firstAvailableMap } from './progression';
import { IntakeClock, intakeStatus, introducedWords, missingWordCount, syllabus, todaysWords, wordIntroduced, wordScheduled } from './intake';
import type { CourseLexeme } from './course';
import { createStateStore } from './game-state';
import { characterBuilderMarkup, bindCharacterBuilder } from './character-builder';
import { localHour } from './world-clock';
import { loadDevicePreferences } from './device-preferences';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/600.css';
import './style.css';
import './style-encounters.css';
import './style-touch.css';
import './style-menu-pages.css';
import './style-menu-pages-compact.css';
import './style-play-frame.css';
import './notifications.css';
import { Notifications, installFormNotifications } from './notifications';
import './course-ui.css';
import './game-ui.css';
import './game-menu.css';
import './menu-home.css';
import './expedition-games.css';
import './sentence-translations.css';
import { installSentenceTranslations, renderNarrative } from './sentence-translations';
import { renderTranslatedSentence, findSentence } from './translated-sentence';
import { getExpedition, getExpeditionNpc, getExpeditionEncounter, expeditionRegions } from './expeditions';
import { ExpeditionLearning, placementLearning } from './expedition-learning';
import { mountExpeditionEncounter } from './expedition-encounter';
import { expeditionGames, getExpeditionGame, expeditionGameStatus, mountExpeditionGame } from './expedition-games';
import { adventureHome } from './game-panels';
import './interiors.css';
import './quest-cta.css';
import './story-mechanics.css';
import './hud.css';
import './hud-layout.css';
import { hudNavigationMarkup, hudChapterMarkup, minimapMarkup, updateMinimapPlayer, type HudChapter } from './hud-layout';
import { World } from './world';
import type { Avatar, WorldPlayer, WorldPresentation } from './world';
import { quests, npcs, vocabulary } from './content';
import type { Quest, Exercise, Level } from './content';
import { Api, emptyProgress } from './api';
import { EditBridge } from './world-edit-mode';
import { WorldEditOverlay } from './world-edit-overlay';
import { WorldEditSession } from './world-edit-session';
import { setDialogueLineEditor } from './dialogue-view';
import { watchForUpdates } from './app-updates';
import { showUpdateNotice } from './update-notice';
import type { Progress, ConnectionStatus, SessionResult, AccountStatus, ExpeditionAnswerResult } from './api';
import { dueItems, modeFor, memoryLabel, practiceExercises, remainingQuestExercises, skipListeningExercises, attemptFeedback, shuffledSentenceTiles } from './learning';
import { AccountReminder } from './player-account';
import './player-account.css';
import { AccessClock, accessBlocked } from './game-access';
import { AccessSession } from './access-session';
import { Speech } from './speech';
import { gameMode, type GameMode } from './game-mode';
import './game-access.css';
import { reviewExercises,wordReadyForReview } from './review';
import { phrasePracticeQueue } from './phrase-practice';
import { refreshLearningMenu } from './menu-refresh';
import { ReviewAttempt } from './review-attempt';
import { learnerLevel, scaffoldStage, scaffoldText } from './typing-scaffold';
import type { AttemptSubmission, AttemptResult, RecallRating } from './review-attempt';
import { icon, escapeHtml as e } from './icons';
import { t, localized, localizedName, localizedExercise, localizedGrammar, lexemeMeaning, upper, lower, baseLanguage, cachedBaseLanguage, setBaseLanguage, type BaseLanguage } from './i18n';
import { exerciseOptionsMarkup } from './exercise-options';
import { maps, getMap, isStoryMap } from './maps';
import type { MapId, WorldObjectSpec } from './maps';
import { actFor, clueFor, discoveredClues, journalNarratives, objectStories, storyActs } from './story';
import { activityDiscoveries } from './activity-stories';
import { coastThreadMarkup } from './coast-threads';
import { ScreenFilterControls } from './screen-filter-controls';
import { MenuMemory, MenuNavigator, menuChromeMarkup, menuSections, sectionOf, viewLabel, type MenuPage, type MenuView } from './menu-navigation';
import { optionsTabs, type OptionsTab } from './options-menu';
import { OptionsPanel } from './options-panel';
import { AccountEntry } from './account-entry';
import { WordExposure } from './word-exposure';
import { atlasPage, discoveriesPage, eliseLetter, interiorIcon, phraseJournalPage, questLogPage, type MenuPageContext } from './menu-pages';
import { UiSounds } from './ui-sounds';
import { controlsHelpMarkup } from './menu-help';
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
import './ui-kit.css';
import { MiniGameInput } from './minigames/input';
import { isWordGame } from './minigames/word-game-mechanics';
import { hostedGames, miniGameBlock, miniGameBlockLabel, miniGameBlockMessage, miniGameLevel, suggestedGame, type ReadinessContext } from './minigames/availability';
import { gameItemPool } from './minigames/pool';
import { DialogSession, openAsyncDialog, trackDialogClose, type AsyncDialogHost } from './dialog-session';

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
let accountKeptActivityPaused=false;
let miniGameController: MiniGame | undefined;
let miniGameHost: (import('./minigames/types').MiniGameHost & {destroy():void}) | undefined;
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
  if (wordIds.length) wordExposure.record({ wordIds: [...new Set(wordIds)].slice(0, 36) });
});
if (!uiCheckSurface) startAnalytics(() => api.token);
const api = new Api();
/** Every async opener of #dialog checks this; opening or closing the dialog ends the ones still loading. */
const dialogSession = new DialogSession(() => api.selfId);
const dialogHost: AsyncDialogHost = {
  session: dialogSession,
  dialog: () => document.querySelector<HTMLDialogElement>('#dialog')!,
  open: (html, className) => openDialog(html, className),
};
let stopUpdateChecks: (() => void) | undefined;
let removeUpdateNotice: (() => void) | undefined;
let progress: Progress = emptyProgress();
const progressStore = createStateStore(progress);
let questController: QuestController | undefined;
let investigationQuest: string | undefined;
let mechanicsUi: StoryMechanicsUi | undefined;
let placementController: { destroy(): void } | undefined;
let storySaves: { slot: string; name: string; at: string }[] = [];
let cinematicActive = false;
let pendingStoryBeat: CutsceneKind | undefined;
let pendingTravelBeat = false;
const questCinematics: Record<string, CutsceneKind> = { 'a1-arrival':'platform', 'a1-bench':'remembered', 'a1-station':'recording', 'a1-lost-parcel':'erasure', 'a2-broken-clock':'clockmill', 'a2-forest-rails':'rails', 'a2-archive':'confession', 'b1-new-route':'dark-beam', 'b1-work':'ledger', 'b1-temptation':'temptation', 'b1-storm':'storm', 'b1-atlas':'bell' };
let started = false;
let worldEdit: { bridge: EditBridge; overlay: WorldEditOverlay; session: WorldEditSession } | undefined;
let shellLanguage: BaseLanguage = 'en';
let account: AccountStatus = { registered: false, email: '' };
let accountReminder: AccountReminder | undefined;
let reminderTimer: number | undefined;
const accessClock = new AccessClock();
/** Metered play, billing and the account dialog (access-session.ts). */
const accessSession = new AccessSession({
  api, clock: accessClock, uiCheck: !!uiCheckSurface,
  started: () => started, connection: () => connection, account: () => account, activeCourse: () => activeCourse,
  toast: (message, bad) => toast(message, bad), syncWorldMode: () => syncWorldMode(),
  showSaveAccount: (required, subscribeAfter) => accountEntry.showSaveAccount(required, subscribeAfter),
  pauseForAccount: () => {
    accountKeptActivityPaused=!!document.querySelector('.activity-intermission,.expedition-encounter-learning[inert],.expedition-game[inert]');
    activityController?.pause();miniGameController?.pause();deliveryController?.pause();stopSpeech();
    if(exerciseChoiceTimer){clearTimeout(exerciseChoiceTimer);exerciseChoiceTimer=undefined;pendingExerciseChoice=undefined;}
  },
  accountShown: () => accountReminder?.tick(performance.now(), false),
  discardPlay: () => {
    activityController?.destroy(); activityController = undefined;
    miniGameController?.destroy(); miniGameController = undefined;
    miniGameHost?.destroy(); miniGameHost = undefined;
    deliveryController?.destroy(); deliveryController = undefined;
    deliveryHost?.destroy(); deliveryHost = undefined;
    notifications?.destroy(); notifications = undefined;
    if (reminderTimer !== undefined) clearInterval(reminderTimer);
    reminderTimer = undefined; accountReminder = undefined;
  },
});
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
let watchingWorld = false;
const prefs = loadDevicePreferences();
const uiSounds = new UiSounds(() => !prefs.muted && !prefs.silentMode);
const menuMemory = new MenuMemory();
let menuPageOpen = true;
let menuNavigator: MenuNavigator | undefined;
/** First-run screens and the account dialogs (account-entry.ts). */
const accountEntry = new AccountEntry({
  api, access: accessSession, clock: accessClock,
  started: () => started, account: () => account, profile: () => profile,
  settingsOpen: () => view === 'settings', refresh: () => renderOther(), toast: (message, bad) => toast(message, bad),
  enterGame: result => enterGame(result), accountChanged: updated => accountChanged(updated),
});
function accountChanged(updated: AccountStatus) {
  account = updated;
  updateWorldEditButton();
  document.querySelector<HTMLElement>('#admin-analytics-link')!.hidden = account.admin !== true;
}
/** The settings page (options-panel.ts). */
const optionsPanel = new OptionsPanel({
  api, clock: accessClock, prefs,
  world: () => world, progress: () => progress, level: () => level, account: () => account, profile: () => profile,
  storySaves: () => storySaves, connection: () => connection, started: () => started, attemptBusy: () => attemptBusy,
  settingsOpen: () => view === 'settings', refresh: () => renderOther(), toast: (message, bad) => toast(message, bad),
  playUiSound: kind => uiSounds.play(kind), playCue: correct => playCue(correct), setSilentMode: enabled => setSilentMode(enabled),
  changeBaseLanguage: language => accountEntry.changeBaseLanguage(language),
  accountChanged: updated => accountChanged(updated),
});
function playablePractice<T extends Exercise>(exercises: readonly T[]): T[] {
  return practiceExercises(exercises, prefs.silentMode, writingReady());
}
function showOpeningPracticeNotice(placement = false) {
  cancelRun();
  setView('world');
  openDialog(`<div class="course-intro"><h2>${t('Listen, look and choose.')}</h2><p>${placement ? t('Start with A1 German and get comfortable in the town. The optional level sample opens after your first ten minutes of play.') : t('Writing practice opens after your first ten minutes of play. For now, discover the town through listening and simple choices. Your completed answers are saved.')}</p><button class="primary-button" data-action="close-dialog">${t('Keep exploring')} ${icon('arrow')}</button></div>`, 'course-dialog');
}
function silentModeButton() {
  return `<button class="outline-button silent-mode-button" data-action="silent-mode" aria-pressed="${prefs.silentMode}">${icon(prefs.silentMode ? 'muted' : 'volume')} ${prefs.silentMode ? t('Silent mode on') : t('Silent mode off')}</button>`;
}
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
  if (owner && progressOwner !== owner) { attemptedCinematics.clear(); progressOwner = owner; progress = emptyProgress(); wordExposure.reset(); }
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
/** Seen contexts and word cards (word-exposure.ts). */
const wordExposure = new WordExposure({
  api, enabled: () => !uiCheckSurface && connection === 'online', progress: () => progress,
  onProgress: next => { acceptProgress(next); updateProgress(); },
});


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
  // Story characters without a painted portrait use their own component recipe.
  const recipe = castActor(id)?.recipe;
  if (recipe) return avatarPortraitMarkup(recipe, `portrait ${className}`, false, expression);
  const index = Math.max(0, npcs.findIndex(n => n.id === id));
  return `<span class="portrait ${className}" style="--portrait-x:${(index % 4) * 100 / 3}%;--portrait-y:${index < 4 ? 0 : 100}%" aria-hidden="true"></span>`;
}
function currentQuest() { return quests.find(q => q.level === level && !progress.completedQuestIds.includes(q.id) && questUnlocked(q.id, progress.completedQuestIds)) ?? quests.find(q => !progress.completedQuestIds.includes(q.id) && questUnlocked(q.id, progress.completedQuestIds)) ?? quests.find(q => q.level === level)!; }
function completedAtLevel(l: Level) { return quests.filter(q => q.level === l && progress.completedQuestIds.includes(q.id)).length; }
function toast(message: string, bad = false) {
  notifications?.notify(message, bad);
}
let stopHudFrames: (() => void) | undefined;
function renderShell() {
  stopHudFrames?.();
  shellLanguage = baseLanguage();
  screenFilterControls?.destroy();
  app.innerHTML = `
    <main class="game-shell" id="game-shell" data-view="world" data-map="lindenhafen">
      <section id="explore-view" class="world-stage" aria-label="Lindenhafen"><div id="world-container" aria-label="${e(t('Game world. Use WASD, arrow keys, or the joystick to move. Press E to interact.'))}" tabindex="0"></div></section>
      <div class="world-vignette" aria-hidden="true"></div>
      <div class="game-hud" id="game-hud">
        <div class="access-hud" id="access-hud" hidden><span class="access-clock-icon">${icon('clock')}</span><div><span id="access-label">Free play</span><strong id="access-time" role="timer">05:00</strong></div><button type="button" id="access-button">Login</button><button type="button" id="access-invite" hidden>Invite a friend</button></div>
        <div class="player-hud"><button class="player-medallion" data-view="character" aria-label="${e(t('Edit your character'))}">${portrait('self')}<span class="medallion-gem" aria-hidden="true"></span></button><div class="player-details"><span class="player-name" id="profile-name">${e(profile.name)}</span><span class="player-title" id="hud-title">${e(t('Wanderer of the Atlas'))}</span><span class="player-meta"><span id="hud-level">A1</span><span class="xp-badge"><strong id="xp-value">0</strong> XP</span></span><span class="player-progress" role="progressbar" id="chapter-progress" aria-label="${e(t('Chapter stories discovered'))}" aria-valuemin="0" aria-valuemax="6" aria-valuenow="0"><span id="chapter-fill"></span></span></div></div>
        <div class="location-banner" id="location-banner"><span class="hud-compass-ribbon" aria-hidden="true">W <b>· N ·</b> E</span><span class="location-title" id="location-title">${e(getMap(mapId).name)}</span><span class="location-subtitle" id="location-subtitle">${e(localized(getMap(mapId).subtitle))}</span></div>
        <aside class="quest-tracker" id="quest-tracker" aria-label="${e(t('Next story objective'))}"><div id="quest-panel"></div></aside>

        ${hudNavigationMarkup(prefs.muted)}
        <div class="admin-world-controls">
          <button type="button" class="world-edit-button" id="world-edit-button" data-action="edit-world" aria-pressed="false" hidden>Edit</button>
          <a class="admin-analytics-link" id="admin-analytics-link" href="/admin.html" target="_blank" rel="noopener" hidden>Admin</a>
        </div>
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
    motion: prefs.worldMotion,
    time: { mode: prefs.worldTimeMode, hour: prefs.worldTimeMode === 'manual' ? prefs.manualWorldHour : localHour() },
    onTimeChange: state => {
      const label = `${state.label} · ${upper(state.period === 'day' ? t('Day') : t('Night'))}`;
      for (const id of ['watch-time', 'world-hour-label']) {
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
    onBarkShown: bark => { if (bark.wordIds.length) wordExposure.record({wordIds:bark.wordIds}); },
    onCinematicLine: (speaker,german,clipId) => { if(!prefs.silentMode&&!prefs.muted)speak(german,speaker,clipId); },
    onCinematicEnd: stopSpeech,
  });
  stopHudFrames = world.onFrame(() => {
    const scene = sceneDocument.maps[mapId];
    if (scene && !interiorId) updateMinimapPlayer(document, world.getPlayerPosition(), scene.width, scene.height);
  });
  mechanicsUi?.stop();
  mechanicsUi = new StoryMechanicsUi({
    request: (path, body) => api.request(path, body), progress: () => progress, mapId: () => mapId, playerName: () => profile.name,
    setMarks: marks => world.setStoryMarks(marks), lampStrength: () => world.lampStrength(),
    acceptProgress: value => { acceptProgress(value); updateProgress(); },
    openDialog: (html, className) => openDialog(html, className), closeDialog: () => document.querySelector<HTMLDialogElement>('#dialog')!.close(),
    toast, cue: playCue, soundAllowed: () => !prefs.muted && !prefs.silentMode && view === 'world' && !document.hidden,
    onTick: () => updateFadingNameChip(),
  });
  mechanicsUi.start(document.querySelector<HTMLElement>('#game-hud')!);
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('submit', event => {
    const form = event.target as HTMLFormElement;
    if (!form.dataset.inkForm && !form.dataset.sideForm) return;
    event.preventDefault();
    void mechanicsUi?.submit(form);
  });
  questController?.destroy();
  questController = new QuestController({
    api, progress: () => progress, playerName: () => profile.name,
    portrait: (id, expression) => portrait(id, '', expression), speak, stopSpeech, audioEnabled: () => !prefs.silentMode, setAudioEnabled: enabled => setSilentMode(!enabled, false),
    loadGraph: loadQuestGraph, loadSentence: loadDialogueSentence, loadExercise,
    grammar: questId => grammarForQuest(questId,course?.courseGrammar),
    wasHinted: questId => progress.story?.flags[`hint:${questId}`]===true || localStorage.getItem(`atlas.sceneHinted.${api.selfId}.${questId}`)==='true',
    onOpen: speaker => { dialogueOpen = true; document.querySelector('#game-shell')!.classList.add('dialogue-open'); world.setConversationTarget(speaker || undefined); syncWorldMode(); },
    onClose: () => { dialogueOpen = false; document.querySelector('#game-shell')!.classList.remove('dialogue-open'); world.setConversationTarget(undefined); syncWorldMode(); document.querySelector<HTMLElement>('#world-container')!.focus(); if (pendingStoryBeat) queueMicrotask(() => void playPendingCinematic().catch(error => console.warn('The story scene could not load; it will be offered again.', error))); },
    onProgress: value => { acceptProgress(value); updateProgress(); },
    onInvestigate: graph => { investigationQuest = graph.questId; updateProgress(); const next = nextInvestigation(graph); if (next) { world.focusObject(investigationWorldId(next)); toast(t('Read the evidence, then return to the witness.')); } else { const q = quests.find(q => q.id === graph.questId)!; world.focusNpc(q.npcId); toast(t('The evidence is saved. Return to {name}.', { name: localizedName(npcs.find(npc => npc.id === q.npcId)!.name) })); } },
    onComplete: (graph, xp, effects) => { investigationQuest = undefined; pendingStoryBeat = questCinematics[graph.questId]; updateProgress(); playCue(true); const clue = clueFor(graph.questId); toast(`${clue ? localized(clue.title) : t('Discovery saved')}${xp ? ` · +${xp} XP` : ''}${consequenceNote(effects)}`); suggestRoundAfter(quests.find(quest => quest.id === graph.questId)?.npcId); },
    expose: exerciseId => { const graph=questGraphs.find(graph=>graph.gateExerciseId===exerciseId); if(graph)localStorage.setItem(`atlas.sceneHinted.${api.selfId}.${graph.questId}`,'true'); wordExposure.record({ exerciseId }); },
    games: npcId => hostedGames(npcId, miniGameById, miniGameReadiness(), gameDay()),
    onGame: id => void startMiniGame(id),
    onPractice: npcId => { const activity = activityInfo.find(item => item.npcId === npcId); if (activity) void startActivity(activity.id); else setView('journal'); },
  });
  world.setAudioPreferences({ silent: prefs.silentMode, muted: prefs.muted });
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
    if (started && accessBlocked(accessClock.snapshot(performance.now()))) { accessSession.enforceWall(); return; }
    if (!document.hidden) { if (!accountKeptActivityPaused) activityController?.resume(); miniGameController?.resume(); deliveryController?.resume(); }
    accountKeptActivityPaused = false;
    accountReminder?.tick(performance.now(), started && !document.hidden && connection === 'online');
    accessSession.syncActivity(); syncWorldMode();
    if (started && regionReady) onRegionReady(mapId);
  });
  document.querySelector<HTMLButtonElement>('#access-button')!.onclick = () => {
    const access = accessClock.snapshot(performance.now());
    if (access?.phase === 'paid') accessSession.showBillingAccount();
    else if (access?.registered) accessSession.showPaywall();
    else accountEntry.showSaveAccount(access?.phase === 'login_required');
  };
  document.querySelector<HTMLButtonElement>('#access-invite')!.onclick = () => void accessSession.showInviteFriend();
  syncWorldMode();
}
function watchWorld(watching: boolean): void {
  if (watching) screenFilterControls?.close(false);
  watchingWorld = watching;
  world.setWatchMode(watching);
  document.querySelector('#game-shell')!.classList.toggle('watching-world', watching);
  document.querySelector<HTMLElement>('#game-hud')!.inert = watching || view !== 'world';
  syncWorldMode();
  document.querySelector('#watch-region')!.textContent = interiorId ? getInterior(interiorId, mapId).name : getMap(mapId).name;
  document.querySelector<HTMLButtonElement>(watching ? '[data-action="stop-watching"]' : '.game-menu-button')?.focus();
}
function updateNearby(id?: string) {
  const animal = animalSpeciesFromId(id);
  const entrance = id?.startsWith('building:') ? buildingEntrances(mapId).find(item => item.id === id) : undefined;
  const inside = id?.startsWith('interior:') ? getInteriorObject(id, interiorId, mapId) : undefined;
  const roomDoor=id?.startsWith('room-door:') && interiorId ? getInterior(interiorId,mapId).layout?.links?.find(d=>`room-door:${d.id}`===id) : undefined;
  const exit = id?.startsWith('exit:') && interiorId;
  const object = id?.startsWith('object:') ? getMap(mapId).objects.find(item => item.id === id.slice(7)) : undefined;
  const npc = id && !entrance && !inside && !exit && !object ? npcs.find(item => item.id === id) ?? getExpeditionNpc(id) : undefined;
  const talking = !entrance && !exit && !!(inside?.npcId || npc);
  const insideNpcName = inside?.npcId ? npcs.find(item => item.id === inside.npcId)?.name : undefined;
  const insideName = insideNpcName ? localizedName(insideNpcName) : inside?.label;
  const name = (roomDoor && interiorId ? `${roomDoor.kind==='stairs'?`Stairs ${getInterior(interiorId,mapId).stairDirections?.[roomDoor.id]} · `:''}${getInterior(buildingRoomId(interiorId,roomDoor.targetRoom) as InteriorId,mapId).name}` : undefined) ?? (animal ? animalAction(animal) : undefined) ?? entrance?.label ?? insideName ?? (exit ? getInterior(exit, mapId).name : object?.label ?? (npc ? localizedName(npc.name) : undefined));
  const button = document.querySelector<HTMLButtonElement>('#talk-button')!;
  button.disabled = !name;
  button.hidden = !name;
  document.querySelector('#nearby-name')!.textContent = name ?? '';
  button.setAttribute('aria-label', name ? (animal ? name : entrance || roomDoor ? t('Enter {name}', { name }) : exit ? t('Leave {name}', { name }) : talking ? t('Talk to {name}', { name }) : t('Inspect {name}', { name })) : t('Move closer to interact'));
}
function syncLocation() {
  const room = interiorId ? getInterior(interiorId, mapId) : undefined, region = getMap(mapId);
  const shell = document.querySelector<HTMLElement>('#game-shell')!;
  if (room) shell.dataset.interior = room.id;
  else delete shell.dataset.interior;
  showArrival(room?.name ?? region.name, room ? t('Inside {place}', { place: region.name }) : localized(region.subtitle));
  refreshHudMap();
  updateLocalHud();
  document.querySelector('#watch-region')!.textContent = room?.name ?? region.name;
  document.querySelector('#explore-view')!.setAttribute('aria-label', room ? t('{place} interior', { place: room.name }) : region.name);

}
function onInteriorChange(id?: InteriorId, doorId?:string) {
  if (!applyingWorldLocation && !api.joinInterior(id,doorId)) {
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
  toast(t('Following the path to {place}…', { place: getInterior(id, mapId).name }));
}
function interiorGameCopy(id: InteriorId) {
  id = roomKind(id);
  if (id === 'supermarket') return { title: t('A basket at Fritz’s supermarket'), action: t('Shop and count the change'), description: t('Build a grocery basket from the German request, choose cash or card, and return the right change.'), npcId: 'fritz' };
  if (id === 'bakery') return { title: t('Drinks at the lantern bakery'), action: t('Prepare the bakery’s drinks'), description: t('While the bread bakes, prepare coffee, milk and water for the guests. Read the order and follow the preparation steps.'), npcId: 'emil' };
  return { title: t('A shift at Marta’s café'), action: t('Prepare a café order'), description: t('Read a customer’s order, assemble the tray, and prepare each drink in the right order before serving.'), npcId: 'marta' };
}
function startInteriorActivity(id: string) {
  const object = getInteriorObject(id, interiorId, mapId), room = interiorId ? getInterior(interiorId, mapId) : undefined;
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
  const current = dialogSession.begin();
  if (interiorId) { try { await loadInterior(interiorId); } catch (error) { if (current()) toast((error as Error).message, true); return; } }
  if (!current()) return;
  const object = getInteriorObject(id, interiorId, mapId), room = interiorId ? getInterior(interiorId, mapId) : undefined;
  if (!object || !room || !room.objects.some(item => item.id === id)) return;
  if (object.gameOnly && object.minigame) { void startMiniGame(object.minigame); return; }
  if (interiorId && roomKind(interiorId) === 'inn') {
    if (id === 'interior:inn:review') { void startAdaptiveReview(); return; }
    if (id === 'interior:inn:evidence') { setView('story'); return; }
    if (id === 'interior:inn:bed') { openDialog(`<div class="completion">${portrait('self')}<h2>${t('The lantern can rest.')}</h2><p>${t('Give a few familiar words another moment, or let the day end. Your discoveries stay with you.')}</p><button class="primary-button" data-action="review">${t('Evening review')} ${icon('leaf')}</button><button class="outline-button" data-action="sleep">${t('Sleep and begin tomorrow')} ${icon('clock')}</button>${miniGameHostLinks(object.minigame)}<button class="text-button" data-action="close-dialog">${t('Keep exploring')}</button></div>`, 'inn-dialog'); return; }
  }
  const npc = object.npcId ? npcs.find(item => item.id === object.npcId) : undefined;
  if (npc) wordExposure.record({npcId:npc.id});
  const miniGame = object.minigame ? miniGameById.get(object.minigame) : undefined;
  try { await loadInteriorConversation(id); } catch (error) { if (current()) toast((error as Error).message, true); return; }
  if (!current() || interiorId !== room.id) return;
  interiorConversation = undefined;
  openDialog(renderInteriorEncounter({room,object,portraitMarkup:npc?portrait(npc.id,'large-portrait'):undefined,miniGame:miniGame?{id:miniGame.id,title:miniGame.title}:undefined}), 'interior-dialog', npc?.id);
}
async function startInteriorPractice(id: string) {
  const current = dialogSession.begin();
  if (interiorId) { try { await loadInterior(interiorId); } catch (error) { if (current()) toast((error as Error).message, true); return; } }
  if (!current()) return;
  const object = getInteriorObject(id, interiorId, mapId), room = interiorId ? getInterior(interiorId, mapId) : undefined;
  if (!object || !room || !room.objects.some(item => item.id === id)) return;
  try {
    for (const exerciseId of object.exerciseIds.slice(0, 8)) {
      try { await loadExercise(exerciseId); }
      catch (error) { if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error; }
      if (!current()) return;
    }
  } catch (error) { if (current()) toast((error as Error).message, true); return; }
  if (!current() || interiorId !== room.id) return;
  const queue = interiorPracticeQueue(object);
  if (!queue.length) { startInteriorConversation(id); return; }
  if (connection !== 'online') { toast(t('The town is reconnecting. Try this session again in a moment.'), true); return; }
  setView('world');
  run = { queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:true, interiorObjectId:id, label:`${room.name} · ${object.sessionTitle}`, started:Date.now() };
  openDialog('', 'quest-dialog interior-practice-dialog', object.npcId); renderExercise();
}
let interiorConversation: InteriorConversationState | undefined;
async function startInteriorConversation(id: string) {
  const current = dialogSession.begin();
  try { await loadInteriorConversation(id); } catch (error) { if (current()) toast((error as Error).message, true); return; }
  if (!current()) return;
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
  const object = getInteriorObject(objectId, interiorId, mapId); if (!object) return;
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
  const exercise=phrasePracticeQueue(id,progress,quests,{silent:prefs.silentMode,writingReady:writingReady(),contextWords:course?.courseContextWordIds})[0];
  if(!exercise){toast(t('This word is resting. There is a new adventure waiting.'));return;}
  if(connection!=='online'){toast(t('The town is reconnecting. Try again in a moment.'),true);return;}
  setView('world');run={queue:[exercise],index:0,correct:0,targetCount:1,hinted:false,audioHeard:false,answered:false,answer:'',tokenOrder:[],review:true,label:t('Story expressions'),started:Date.now()};
  openDialog('','quest-dialog');renderExercise();
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
  mechanicsUi?.progressChanged();
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
    ? storyBeacon({ attributes: 'data-action="leave-interior"', glyph: 'arrow', label: getMap(mapId).name, text: t('Leave {name}', { name: getInterior(interiorId, mapId).name }), quiet: true })
    : storyBeacon({ attributes: 'data-action="next-objective"', glyph: finished ? 'map' : 'flag', label: finished ? t('Chapter complete') : t('Follow the story'), text: objective, chapter: { chapter: `${t('Chapter {number}', { number: ['A1', 'A2', 'B1'].indexOf(q.level) + 1 })} · ${q.level}`, title: localized(q.title), summary: localized(q.objectives[0] ?? q.subtitle), done, total, reward: finished ? 0 : q.reward }, bell: savedStory.bell > 0 && savedStory.bell < 7 ? savedStory.bell : undefined, cracks: (savedStory as { inkWarnings?: number }).inkWarnings ?? 0 });
  updateFadingNameChip();
  document.querySelector<HTMLElement>('#review-dot')!.hidden = !dueItems(progress).length;
  if (view === 'journal' || view === 'quests' || view === 'story' || view === 'menu') refreshLearningMenu(document.querySelector<HTMLElement>('#other-view')!,renderOther);
}
/** The next story step is the one golden action over the world; indoors it quietens to a way back out. */
function storyBeacon(options: { attributes: string; glyph: string; label: string; text: string; bell?: number; quiet?: boolean; cracks?: number; chapter?: HudChapter }): string {
  const { attributes, glyph, label, text, bell, quiet, cracks, chapter } = options;
  const cracked = cracks ? ` cracked" title="${e(t('A name in town is lost. Say it again to heal the bell.'))}` : '';
  return `<button class="story-beacon${quiet ? ' quiet' : ''}${chapter ? ' hud-chapter-card' : ''}" ${attributes}><span class="beacon-mark" aria-hidden="true">${quiet ? '' : '<span class="quest-spark"></span>'}${icon(glyph)}</span><span class="beacon-copy"><span class="beacon-label">${e(label)}</span><strong class="objective-text">${e(text)}</strong></span>${bell ? `<span class="objective-bell${cracked}" aria-label="${e(cracks ? t('The seventh bell, cracked by a lost name') : t('The seventh bell'))}">${icon('clock')}${bell}/7</span>` : ''}${quiet ? '' : icon('chevron', 'beacon-chevron')}${chapter ? hudChapterMarkup(chapter) : ''}</button>`;
}
/** The player's own name pales on the ticket; a small chip offers to say it. */
function updateFadingNameChip() {
  const tracker = document.querySelector<HTMLElement>('#quest-tracker');
  if (!tracker) return;
  const fading = !interiorId && mechanicsUi?.fadingOwnName();
  let chip = tracker.querySelector<HTMLButtonElement>('.name-fading-chip');
  if (!fading) { chip?.remove(); return; }
  if (!chip) { chip = document.createElement('button'); chip.className = 'name-fading-chip'; chip.dataset.inkOpen = fading.id; tracker.append(chip); }
  chip.innerHTML = `${icon('lantern')}<span>${e(t('Your name is fading on the ticket. Say it.'))}</span>`;
}
function updatePlayerHud(title: string) {
  const done = completedAtLevel(level), total = quests.filter(item => item.level === level).length || 1;
  document.querySelector('#profile-name')!.textContent = profile.name;
  document.querySelector('#hud-level')!.textContent = `${activeCourse?.title ?? t('German')} · ${level}`;
  document.querySelector('#hud-title')!.textContent = title === titleLabel('Wanderer') ? t('Wanderer of the Atlas') : title;
  const due = dueItems(progress).length;
  document.querySelector<HTMLElement>('#hud-revisit')!.hidden = !due;
  document.querySelector('#hud-revisit-label')!.textContent = t('{count} words ready to revisit', { count: due });
  refreshHudMap();
  document.querySelector('#xp-value')!.textContent = String(progress.xp);
  document.querySelector<HTMLElement>('#chapter-fill')!.style.width = `${Math.round(done / total * 100)}%`;
  const bar = document.querySelector<HTMLElement>('#chapter-progress')!;
  bar.setAttribute('aria-valuenow', String(done)); bar.setAttribute('aria-valuemax', String(total));
}
function refreshHudMap() {
  const host = document.querySelector<HTMLElement>('#hud-minimap');
  if (!host) return;
  host.hidden = !!interiorId;
  const scene = sceneDocument.maps[mapId];
  if (!scene || interiorId) return;
  const region = getMap(mapId);
  const residents = scene.npcs.flatMap(anchor => {
    const npc = npcs.find(item => item.id === anchor.id) ?? getExpedition(mapId)?.npcs.find(item => item.id === anchor.id);
    return npc ? [{ ...anchor, name: localizedName(npc.name) }] : [];
  });
  // Rebuild only when the published anchors, language or town change; frame updates preserve focus.
  const signature = JSON.stringify([mapId, scene.width, scene.height, residents]);
  if (host.dataset.mapSignature !== signature) {
    host.innerHTML = minimapMarkup({ name: region.name, previewAsset: region.previewAsset, width: scene.width, height: scene.height, npcs: residents });
    host.dataset.mapSignature = signature;
  }
  updateMinimapPlayer(host, world.getPlayerPosition(), scene.width, scene.height);
}
function updateLocalHud() {
  const place = document.querySelector('#hud-local-place');
  const status = document.querySelector('#hud-local-status');
  if (!place || !status) return;
  place.textContent = interiorId ? getInterior(interiorId, mapId).name : getMap(mapId).name;
  const others = players.filter(player => player.id !== api.selfId && (!player.mapId || player.mapId === mapId) && player.interiorId === interiorId);
  status.textContent = connection !== 'online' ? t('Reconnecting') : others.length ? others.map(player => player.name).join(' · ') : t('You are exploring this place.');
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
/** The page's single answer to "what is in front of the world"; see game-mode.ts for the precedence. */
function currentGameMode(): GameMode {
  return gameMode({
    started, accessBlocked: accessBlocked(accessClock.snapshot(performance.now())), connected: connection === 'online', travelling: !!pendingMap,
    accountOpen: !!document.querySelector<HTMLDialogElement>('#account-dialog')?.open, cinematic: cinematicActive, menuOpen: view !== 'world',
    watching: watchingWorld, filtersOpen: !!screenFilterControls?.isOpen(), encounterOpen: !!document.querySelector<HTMLDialogElement>('#dialog')?.open,
    dialogueOpen: dialogueOpen || !!questController?.isOpen, deliveryHolding: !!deliveryController && !deliveryController.canMove,
  });
}
function worldCanInteract() { return currentGameMode() === 'world'; }
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
  wordExposure.disconnect();
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
    ...optionsTabs.map(tab => ({label:tab.label(),attributes:`data-options-tab="${tab.id}"`,selected:view==='settings'&&tab.id===optionsPanel.tab})),
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
/**
 * Play the next story beat. Only a beat that was actually shown is remembered and saved as seen; a beat the
 * town could not show yet stays pending for the next region-ready check. Resolves whether one was shown.
 */
async function playPendingCinematic(): Promise<boolean> {
  if (!regionReady || !worldCanInteract()) return false;
  const arrival = mapId === 'lindenhafen' && !progress.completedQuestIds.includes('a1-arrival') && !progress.story?.flags['cinematic:arrival'] && !attemptedCinematics.has('arrival');
  const storyBeat = pendingStoryBeat;
  const kind = storyBeat ?? (arrival ? 'arrival' : pendingTravelBeat ? 'travel' : undefined);
  if (!kind) return false;
  pendingStoryBeat = undefined; pendingTravelBeat = false;
  if (kind !== 'travel' && (progress.story?.flags[`cinematic:${kind}`] || attemptedCinematics.has(kind))) return false;
  cinematicActive = true;
  document.querySelector('#game-shell')!.classList.add('cinematic-open');
  syncWorldMode(); stopSpeech();
  try {
    let outcome: CutsceneOutcome;
    try {
      await loadCinematic(kind, mapId, progress.story?.ending);
      outcome = await world.playCutscene(kind, progress.story?.ending);
    } catch (error) { if (storyBeat) pendingStoryBeat ??= storyBeat; throw error; }
    if (outcome === 'played') {
      attemptedCinematics.add(kind);
      if (kind !== 'travel') {
        try { const result = await api.request<{progress:Progress}>('/story/cinematic', {id:crypto.randomUUID(),kind}); acceptProgress(result.progress); updateProgress(); }
        catch { /* Seen this session; without the saved marker it is offered again next session. */ }
      }
    } else if (storyBeat) pendingStoryBeat ??= storyBeat;
    return outcome === 'played';
  } finally {
    cinematicActive = false;
    document.querySelector('#game-shell')!.classList.remove('cinematic-open');
    syncWorldMode();
    document.querySelector<HTMLElement>('#world-container')!.focus();
  }
  // The seventh bell is followed by the first train: the epilogue.
  if (kind === 'bell') { pendingStoryBeat = 'epilogue'; queueMicrotask(() => void playPendingCinematic()); }
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
  if (pendingStoryBeat || pendingTravelBeat || id === 'lindenhafen' && !progress.completedQuestIds.includes('a1-arrival') && !progress.story?.flags['cinematic:arrival'] && !attemptedCinematics.has('arrival')) {
    // A beat that could not be shown waits for the next region-ready check instead of retrying at once.
    void playPendingCinematic().then(played => { if (played && id === mapId) onRegionReady(id); })
      .catch(error => console.warn('The story scene could not load; it will be offered again.', error));
    return;
  }
  if (!readSeen('acts').includes(id)) { rememberSeen('acts', id); const q = currentQuest(); if (!getExpedition(id)) { world.focusNpc(q.npcId); toast(t('Find {name} to begin Act {act}.', { name: localizedName(npcs.find(npc => npc.id === q.npcId)!.name), act: actFor(id).number })); } else showActIntro(id); return; }
  continueDestination();
}
async function showActIntro(id: MapId) {
  const expedition = getExpedition(id);
  if (expedition) {
    const map = getMap(id), game = getExpeditionGame(id)!;
    rememberSeen('acts', id);
    openDialog(`<div class="act-intro" style="--region-art:url('${map.previewAsset}')"><div class="act-art"><span>${t('EXPEDITION')} · A1 / A2 / B1</span></div><div class="act-copy"><h2>${e(expedition.name)}</h2><details class="lore-detail"><summary>${e(t('Read opening'))}</summary><p>${e(expedition.description)}</p><p>${e(expedition.culture)}</p></details>${coastThreadMarkup(id, progress)}<div class="story-objective">${icon('flag')}<span>${e(game.summary)}</span></div><button class="primary-button" data-action="act-begin">${e(t('Explore {place}', { place: expedition.name }))} ${icon('arrow')}</button></div></div>`, 'act-dialog');
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
  const current = dialogSession.begin();
  try {
    const served = await loadExpeditionEncounter(encounter.id);
    if (!served) throw new Error('This encounter is unavailable.');
    Object.assign(encounter, served); if (npc) npc.encounterId = encounter.id; if (object) object.encounterId = encounter.id;
  } catch (error) { if (current()) toast((error as Error).message, true); return; }
  if (!current()) return;
  if(object)rememberSeen('objects',object.id);
  activityController?.destroy();activityController=undefined;
  openDialog(`<div class="expedition-encounter"><header class="expedition-encounter-heading">${npc?portrait(npc.id,'large-portrait'):`<span class="expedition-portrait">${icon('lantern')}</span>`}<div><h2>${e(npc?.name??object?.label??encounter.title)}</h2>${npc?`<span>${e(npc.role)}</span>`:''}</div></header>${object?`<p>${e(object.description)}</p>`:''}${npc?`<aside class="expedition-relationship">${icon('users')} ${e(npc.relationship)}</aside>`:''}<div id="expedition-encounter-learning-root">Preparing the neighbor’s message…</div><p class="expedition-save-note">${icon('book')} ${e(encounter.languageFocus)}</p><div class="expedition-game-actions"><button class="outline-button" data-expedition-game="${region.id}">${t('Build this neighborhood’s plan')} ${icon('arrow')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')} ${icon('arrow')}</button></div></div>`,'expedition-dialog',npc?.id);
  const root=document.querySelector<HTMLElement>('#expedition-encounter-learning-root')!;let alive=true,paused=document.hidden||document.querySelector<HTMLDialogElement>('#account-dialog')!.open;const runtime:{controller?:ReturnType<typeof mountExpeditionEncounter>;speechHost?:ReturnType<typeof import('./minigames/host').createMiniGameHost>}={};
  const currentPlayer=expeditionLearning.captureOwner();
  activityController={destroy(){alive=false;runtime.controller?.destroy();runtime.speechHost?.destroy();root.replaceChildren();},pause(){paused=true;runtime.controller?.pause();},resume(){paused=false;runtime.controller?.resume();},reset(){runtime.controller?.reset();}};
  const {createMiniGameHost}=await import('./minigames/host');if(!alive||!root.isConnected||!currentPlayer())return;
  runtime.speechHost=createMiniGameHost({api,gameId:'expedition-encounters',lexicon:[],exercises:[],progress:()=>progress,onProgress:next=>{acceptProgress(next);updateProgress();},onEnd:()=>{},playerName:profile.name,silent:prefs.silentMode,muted:prefs.muted,reducedMotion:prefs.worldMotion==='reduced',narration:active=>world.setNarrationActive(active)});
  runtime.controller=mountExpeditionEncounter(root,encounter,{learning:expeditionLearning,progress:()=>progress,onProgress:next=>{acceptProgress(next);updateProgress();},saveStory:(selected,id)=>api.request<ExpeditionAnswerResult>('/expedition/answer',{id,selected,encounterId:encounter.id}),speak:(text,path)=>runtime.speechHost!.speakText(text,path),stopSpeech:()=>runtime.speechHost?.audio.stop(),silent:prefs.silentMode,initialPaused:paused||document.hidden||document.querySelector<HTMLDialogElement>('#account-dialog')!.open,previouslyAnswered:!!expeditionEncounterResult(encounter.id)?.attempts});
}
function expeditionActivityBoard() {
  if (!routeUnlocked('windplain', progress.completedQuestIds)) return '';
  return `<section class="expedition-story-link"><h3>${t('Local games across the Atlas')}</h3><div class="activity-board">${expeditionGames.map(game => { const region = getExpedition(game.id)!, status = expeditionGameStatus(game.id, level, progress.story?.expeditionPlans ?? {}); return `<article class="activity-entry" style="--activity-art:url('/assets/${game.id}-preview.webp')">${icon('compass')}<span class="caption">${e(region.name)} · ${status === 'completed' ? t('AGREEMENT REMEMBERED') : status === 'started' ? t('RESUME YOUR PLAN') : 'A1 / A2 / B1'}</span><h3>${e(game.title)}</h3><p>${e(game.summary)}</p><button class="primary-button" data-expedition-game="${game.id}">${status === 'started' ? t('Resume the neighborhood game') : status === 'completed' ? t('Revisit the neighborhood game') : t('Play the neighborhood game')} ${icon('arrow')}</button><details><summary>${t('Meet the neighbors')}</summary>${[...region.npcs,...region.objects].map(target => `<button class="text-button" data-expedition-target="${target.id}">${e(getExpeditionEncounter(region.id,target.id)!.title)} ${icon('arrow')}</button>`).join('')}</details></article>`; }).join('')}</div></section>`;
}
function expeditionOverview(): string {
  const region=getExpedition(mapId)!,game=getExpeditionGame(mapId);
  if (!game) return `<section class="expedition-overview"><h2>${e(region.name)}</h2><button class="primary-button" data-expedition-game="${region.id}">${e(t('Build the plan'))}</button></section>`;
  const status=expeditionGameStatus(mapId,level,progress.story?.expeditionPlans??{});
  return `<section class="expedition-overview"><h2>${e(region.name)}</h2>${coastThreadMarkup(region.id, progress)}<p>${e(game.summary)}</p><button class="primary-button" data-expedition-game="${region.id}">${status==='started'?t('Resume the plan'):status==='completed'?t('Revisit the agreement'):t('Build the plan')}</button><div class="expedition-cast">${region.npcs.map(npc=>`<button data-expedition-target="${npc.id}">${portrait(npc.id)}<strong>${e(npc.name)}</strong>${icon('chevron')}</button>`).join('')}</div><button class="text-button" data-travel="lindenhafen">${t('Return to the missing-route story')}</button></section>`;
}
async function startExpeditionGame(id: string, requestedLevel?: Level) {
  invalidateContext('expeditionGame', id);
  const current = dialogSession.begin();
  try { await loadContexts('expeditionGame', id); } catch (error) { if (current()) toast((error as Error).message, true); return; }
  if (!current()) return;
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
  if (mechanicsUi?.open(id)) return;
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
  const inkPanel = objectMap.id === mapId ? mechanicsUi?.objectPanel(id) ?? '' : '';
  openDialog(`<div class="object-encounter"><h2>${e(object.label)}</h2>${inkPanel}<blockquote>${id === 'nebelstadt-observatory' && !progress.completedQuestIds.includes('b1-atlas') ? renderNarrative(journalNarratives.observatoryWaiting) : lore ? renderNarrative(lore.secret) : e(localized(object.prompt))}</blockquote>${lore ? `<details class="lore-detail"><summary>${e(t('Read more'))}</summary><p>${renderNarrative(lore.detail)}</p></details>` : ''}${objectMap.id !== mapId ? `<button class="primary-button" data-travel="${objectMap.id}">${e(t('Travel to {place}',{place:objectMap.name}))}</button>` : queue.length ? `<button class="primary-button" data-practice-object="${id}">${t('Try a short language encounter')}</button>` : `<button class="primary-button" data-action="close-dialog">${t('Back to exploring')}</button>`}<div class="encounter-secondary">${miniGames}${queue.length ? `<button class="text-button" data-action="close-dialog">${t('Leave')}</button>` : ''}</div></div>`, 'object-dialog');
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
  return lanternGameBoard(storyOnly?'Story games':'Mini-games',game=>!isWordGame(game)&&(!storyOnly||game.tier==='B'))+(storyOnly?'':lanternGameBoard('Word games',isWordGame));
}
function lanternGameBoard(title:'Story games'|'Mini-games'|'Word games',include:(game:typeof miniGameDefinitions[number])=>boolean):string {
  const context=miniGameReadiness();
  const choices=miniGameDefinitions.filter(game=>miniGameLevel(game,level)&&include(game)).map(game=>({game,block:miniGameBlock(game,context)}));
  if(!choices.length)return '';
  // Rounds that can start now come first; the rest say what opens them.
  choices.sort((a,b)=>Number(!!a.block)-Number(!!b.block));
  return `<section class="lantern-games"><h3>${e(t(title))}</h3><div class="minigame-grid">${choices.map(({game,block})=>
    `<article class="minigame-entry"><h3>${e(game.title)}</h3><p>${e(game.instruction)}</p><button class="outline-button" data-minigame="${e(game.id)}" ${block?'disabled':''}>${block?e(miniGameBlockLabel(block)):'Play a lantern round'} ${icon('arrow')}</button></article>`
  ).join('')}</div></section>`;
}
/** What decides whether a round can open now: level, story, sound, writing, dusk and restored words. */
function miniGameReadiness():ReadinessContext {
  return {
    level,silent:prefs.silentMode,writingReady:writingReady(),hour:world.getWorldTime().hour,
    sceneFor:(game,gameLevel)=>game.questIds?.find(id=>quests.find(quest=>quest.id===id)?.level===gameLevel)??game.questIds?.[0],
    sceneAvailable:id=>questAvailable(id,progress),
    pool:course?query=>gameItemPool(course!.courseLexicon,progress,query):undefined,
    fixedPool:id=>syllabus.quests.find(quest=>quest.questId===id)?.wordIds,
  };
}
const gameDay=()=>Math.floor(Date.now()/86_400_000);
/** A story beat ends with a round the learner can play straight away. */
function suggestRoundAfter(npcId?:string){
  const game=suggestedGame(miniGameDefinitions,miniGameReadiness(),npcId,gameDay());
  if(game)notifications?.notify(t('Try a round of {game}.',{game:game.title}),false,{label:t('Play'),minigame:game.id});
}
function recordExpeditionExposure(text:string):void {
  void loadCourse().then(module=>{
    const restored=introducedSet(),tokens=new Set(text.toLocaleLowerCase('de').match(/\p{L}+/gu)??[]);
    const wordIds=module.courseLexicon.filter(word=>restored.has(word.id)&&[word.lemma,...(word.surfaceForms??[])].some(form=>tokens.has(form.toLocaleLowerCase('de')))).map(word=>word.id);
    if(wordIds.length)wordExposure.record({wordIds});
  }).catch(()=>{});
}
async function startMiniGame(id:string):Promise<void>{
  const definition=miniGameById.get(id);if(!definition)return;
  // A story round's content stays private until its scene, so check the gates before asking for it.
  const early=miniGameBlock(definition,{...miniGameReadiness(),pool:undefined});
  if(early==='writing'){showOpeningPracticeNotice(true);return;}
  if(early){toast(miniGameBlockMessage(early,definition));return;}
  const current=dialogSession.begin();
  try { await loadMiniGame(id); } catch (error) { if(current())toast((error as Error).message, true); return; }
  if(!current())return;
  if(connection!=='online'){toast(t('The town is reconnecting. Try again in a moment.'),true);return;}
  if(id==='neighborhood-boards'){
    if(getExpedition(mapId))startExpeditionGame(mapId);
    else{setView('activities');toast('Choose a neighborhood game in Activities.');}
    return;
  }
  if(id==='delivery-run'){try{await startWorldDelivery();}catch(error){toast((error as Error).message,true);}return;}
  // Too few restored words is explained inside the round, beside its "Practise today's words" button.
  const context=miniGameReadiness(),gameLevel=miniGameLevel(definition,level);if(!gameLevel)return;
  if(isWordGame(definition))try{localStorage.setItem('atlas.wordGame.last',id);}catch{/* Rotation is only a convenience. */}
  const questId=context.sceneFor(definition,gameLevel);
  deliveryController?.destroy();deliveryController=undefined;deliveryHost?.destroy();deliveryHost=undefined;
  setView('world');cancelRun();activityController?.destroy();activityController=undefined;
  const owner=api.selfId;
  await openAsyncDialog(dialogHost,'<div class="route-loading"><h2>Opening the lantern round…</h2></div>','minigame-dialog activity-dialog',
    async()=>{
      const [courseModule,games,{createMiniGameHost}]=await Promise.all([loadCourse(),import('./minigames'),import('./minigames/host')]);
      const [game,authoredExercises]=await Promise.all([games.loadMiniGame(id),games.loadMiniGameExercises(id)]);
      return {courseModule,game,authoredExercises,createMiniGameHost};
    },
    ({courseModule,game,authoredExercises,createMiniGameHost},dialog)=>{
      dialog.innerHTML=`<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close'))}">${icon('close')}</button><div id="minigame-root"></div>`;
      const sceneExercises=quests.flatMap(quest=>quest.exercises.map(exercise=>({...exercise,level:quest.level,kind:'writing' as const,unitId:quest.id,wordIds:(exercise as Exercise&{wordIds?:string[]}).wordIds??courseModule.courseContextWordIds[exercise.id]??[]})));
      miniGameHost=createMiniGameHost({api,gameId:id,lexicon:courseModule.courseLexicon,exercises:[...courseModule.courseExercises,...sceneExercises,...authoredExercises],progress:()=>progress,
        onProgress:value=>{if(owner===api.selfId){acceptProgress(value);updateProgress();}},onEnd:summary=>{if(summary.attempts)toast(`${summary.correct} / ${summary.attempts} answers remembered.`);},
        playerName:profile.name,silent:prefs.silentMode,muted:prefs.muted,reducedMotion:prefs.worldMotion==='reduced'||prefs.worldMotion==='auto'&&matchMedia('(prefers-reduced-motion: reduce)').matches,narration:active=>world.setNarrationActive(active)});
      miniGameController=game;
      const fixedPool=questId?syllabus.quests.find(quest=>quest.questId===questId)?.wordIds:undefined;
      game.mount(document.querySelector<HTMLElement>('#minigame-root')!,miniGameHost,{level:gameLevel,currentLevel:level,seed:crypto.getRandomValues(new Uint32Array(1))[0],fixedPool,backdrop:['workbench','lost-hour'].includes(id)?'/assets/minigames/workbench.webp':['seed-packets','17-59'].includes(id)?getMap('waldruh').previewAsset:interiorId?getInterior(interiorId, mapId).asset:getMap(mapId).previewAsset});
      if(document.hidden||document.querySelector<HTMLDialogElement>('#account-dialog')!.open)game.pause();
    },
    (error,dialog)=>{toast((error as Error).message,true);dialog.close();});
}
async function startWorldDelivery():Promise<void>{
  if(prefs.silentMode){toast('Turn off silent mode to hear Lina’s directions.');return;}
  if(interiorId){toast('Meet Lina outside for the courtyard delivery.');return;}
  const current=dialogSession.begin(),owner=api.selfId,startingMap=mapId;
  const [module,{WorldDeliveryRun},{createMiniGameHost}]=await Promise.all([loadCourse(),import('./minigames/delivery'),import('./minigames/host')]);
  if(!current())return;
  deliveryController?.destroy();deliveryController=undefined;deliveryHost?.destroy();deliveryHost=undefined;
  const host=createMiniGameHost({api,gameId:'delivery-run',lexicon:module.courseLexicon,exercises:module.courseExercises,progress:()=>progress,onProgress:value=>{if(owner===api.selfId){acceptProgress(value);updateProgress();}},onEnd:summary=>toast(`${summary.correct} / ${summary.attempts} spoken directions remembered.`),playerName:profile.name,silent:prefs.silentMode,muted:prefs.muted,reducedMotion:prefs.worldMotion==='reduced',narration:active=>world.setNarrationActive(active)});
  document.querySelector<HTMLDialogElement>('#dialog')!.close();setView('world');
  const controller=new WorldDeliveryRun(world,host,()=>{deliveryController=undefined;deliveryHost?.destroy();deliveryHost=undefined;syncWorldMode();},()=>mapId===startingMap&&!interiorId&&view==='world'&&!document.hidden&&connection==='online'&&!document.querySelector<HTMLDialogElement>('#account-dialog')!.open&&!document.querySelector<HTMLDialogElement>('#dialog')!.open,()=>syncWorldMode());
  if(!controller.mount(document.querySelector<HTMLElement>('#game-shell')!)){host.destroy();syncWorldMode();toast('Restore Lina’s direction words (links, rechts, oben and unten), then try a delivery outside.');return;}
  deliveryController=controller;deliveryHost=host;syncWorldMode();
}
async function startActivity(id: ActivityId, source?: {roomId:InteriorId; stationId:string}) {
  const current = dialogSession.begin();
  try { await loadActivity(id, source ? 'A1' : level); } catch (error) { if (current()) toast((error as Error).message, true); return; }
  if (!current()) return;
  if (!activityInfo.some(game => game.id === id)) return;
  if (connection !== 'online') { toast(t('The town is reconnecting. Try the adventure again in a moment.'), true); return; }
  const room = source ? getInterior(source.roomId, mapId) : undefined;
  const gameCopy = room ? interiorGameCopy(room.id) : undefined;
  const venue = room && gameCopy ? { id:room.id, name:room.name, asset:room.asset, title:gameCopy.title, npcId:gameCopy.npcId, briefing:gameCopy.description } : undefined;
  setView('world'); run = undefined;
  activityController?.destroy(); activityController = undefined;
  await openAsyncDialog(dialogHost, `<div class="route-loading"><h2>${t('Preparing your adventure…')}</h2></div>`, 'activity-dialog', async () => {
    activitiesPromise ??= import('./activities').then(module => { activities = module; return module; }).catch(error => { activitiesPromise = undefined; throw error; });
    return activities ?? await activitiesPromise;
  }, (module, dialog) => {
    for (const job of module.activityAudioJobs ?? []) if (!audioPaths.has(job.text)) audioPaths.set(job.text, `/audio/${job.id}.ogg`);
    dialog.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Leave activity'))}">${icon('close')}</button><div id="activity-root"></div>`;
    const regionLevel: Level = venue ? 'A1' : level;
    activityController = module.mountActivity(document.querySelector<HTMLElement>('#activity-root')!, {
      id, level: regionLevel, progress, sessionKey: venue ? `${api.selfId}:interior:${venue.id}` : api.selfId, venue,
      speak,
      onDelivery: destination => { world.showDeliveryArrival(destination.recipient); toast(`${destination.name} · ${destination.recipient}`); },
      onSceneVisible: (_exerciseId, context) => wordExposure.record(context),
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
  }, (error, dialog) => {
    toast((error as Error).message || t('The adventure could not open.'), true);
    dialog.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close'))}">${icon('close')}</button><div class="route-loading"><h2>${t('A small detour.')}</h2><p>${t('Try the adventure again when the route is connected.')}</p><button class="primary-button" ${source ? `data-interior-activity="${e(source.stationId)}"` : `data-activity="${id}"`}>${t('Try again')}</button></div>`;
  });
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
  const game = upcomingWordGame();
  return `<section class="todays-words"><h3>${e(t('Today’s words'))}</h3><button class="primary-button" data-action="todays-words">${t('Practise today’s words')}</button>${game ? `<button class="outline-button" data-minigame="${e(game.id)}">${icon('lantern')} ${t('Play')} ${e(game.title)}</button><button class="text-button" data-view="activities">${t('More word games')}</button>` : ''}</section>`;
}
/** Word games take turns, so the journal offers a different one after each round. */
function upcomingWordGame() {
  const games = miniGameDefinitions.filter(isWordGame);
  let last = '';
  try { last = localStorage.getItem('atlas.wordGame.last') ?? ''; } catch { /* Rotation is only a convenience. */ }
  return games[(games.findIndex(game => game.id === last) + 1) % games.length];
}
async function startTodaysWords() {
  const current = dialogSession.begin();
  const module = await loadCourse().catch(error => { if (current()) toast(error.message, true); return undefined; });
  if (!module || !current()) return;
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  const ids = todaysWords(progress);
  try { await loadWordDrills(ids); } catch (error) { if (current()) toast((error as Error).message, true); return; }
  if (!current()) return;
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
    wordExposure.observe();
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
  const current = dialogSession.begin();
  const module = await loadCourse().catch(error => { if (current()) toast(error.message, true); return undefined; });
  const word = module?.lexemeById.get(id); if (!word || !module || !current()) return;
  try { await loadWordDrills([id]); } catch (error) { if (current()) toast((error as Error).message, true); return; }
  if (!current()) return;
  if (wordScheduled(id) && !wordIntroduced(progress, id)) { toast(t('This word has not returned to the Atlas yet. Keep playing and it will.')); return; }
  const memory = progress.words?.[id];
  if (memory?.mastery === 'retained' && Date.parse(memory.dueAt) > Date.now()) {
    openDialog(`<div class="course-intro"><h2>${e(spokenWord(word))}</h2><p>${e(lexemeMeaning(word))}</p><p>${e(t('This word is resting. Its next encounter is {date}.', { date: new Date(memory.dueAt).toLocaleDateString(baseLanguage(), {month:'short',day:'numeric'}) }))}</p><button class="primary-button" data-speak="${e(spokenWord(word))}">${icon('volume')} ${t('Hear this word')}</button><button class="text-button" data-action="close-dialog">${t('Keep exploring')}</button></div>`, 'course-dialog'); return;
  }
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  const queue = playablePractice(module.courseExercises).filter(ex => ex.itemId === `word-${id}` && (!exerciseHasSuccess(ex) || Date.parse(memory?.evidence?.[modeFor(ex)]?.dueAt ?? '') <= Date.now()));
  if (!queue.length && !writingReady()) { showOpeningPracticeNotice(); return; }
  if (!queue.length) { toast(prefs.silentMode ? t('No reading or writing practice is ready for this word. Listening is skipped in silent mode.') : t('This word is resting. There is a new adventure waiting.')); return; }
  setView('world'); run = { queue, index:0, correct:0, targetCount:queue.length, hinted:false, audioHeard:false, answered:false, answer:'', tokenOrder:[], review:true, label:t('A word for your journey · {word}', { word: word.lemma }), started:Date.now() };
  openDialog('', 'quest-dialog'); renderExercise();
}
async function startCourseUnit(id: string) {
  const current = dialogSession.begin();
  try { await loadUnit(id, progress); } catch (error) { if (current()) toast((error as Error).message, true); return; }
  const module = await loadCourse().catch(error => { if (current()) toast(error.message, true); return undefined; });
  const unit = module?.courseUnits.find(item => item.id === id); if (!module || !unit || !current()) return;
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
  const current = dialogSession.begin();
  const module = await loadCourse().catch(() => undefined);
  if (!current()) return;
  if (!module) { startReview(); return; }
  try { await loadWordDrills(module.courseLexicon.filter(word => progress.words[word.id] && wordReadyForReview(progress.words[word.id])).map(word => word.id)); } catch (error) { if (current()) toast((error as Error).message, true); return; }
  if (!current()) return;
  if (connection !== 'online') { toast(t('The town is reconnecting. Try again in a moment.'), true); return; }
  const queue = reviewExercises(progress, module.courseExercises, quests.flatMap(q => q.exercises), Date.now(), prefs.silentMode, writingReady());
  if (!queue.length && !writingReady()) { showOpeningPracticeNotice(); return; }
  if (!queue.length) { toast(prefs.silentMode ? t('No reading or writing reviews are ready. Listening is skipped in silent mode.') : t('Your familiar words are resting. Follow a new route or play an adventure.')); return; }
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
let loadingStoryPage = false;
async function loadStoryPage() {
  if (loadingStoryPage) return;
  loadingStoryPage = true;
  try { await loadStoryContent(); if (['story', 'menu', 'quests'].includes(view)) renderOther(); }
  catch (error) { toast((error as Error).message, true); }
  finally { loadingStoryPage = false; }
}
function menuPageContext(): MenuPageContext {
  return {
    progress, mapId, level, mechanics: mechanicsUi?.mechanics, currentQuest: currentQuest(), inspectedObjects: readSeen('objects'),
    portrait: id => portrait(id), completedAtLevel, encounterSolved: id => !!expeditionEncounterResult(id)?.correct,
  };
}
function renderOther() {
  queueMicrotask(() => { if (['story', 'menu', 'quests'].includes(view) && storyContentRemaining > 0) { const panel = document.querySelector('#other-view'); if (panel && !panel.querySelector('[data-action=load-story-page]')) panel.insertAdjacentHTML('beforeend', `<button class=outline-button data-action=load-story-page>${e(t('Load more stories'))}</button>`); } });
  wordExposure.disconnect();
  if (view !== 'settings') optionsPanel.close();
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
      places: buildingEntrances(mapId).map(entrance => { const room = getInterior(entrance.interiorId, mapId); return { id: room.id, name: room.name, glyph: interiorIcon(room.id) }; }),
      promise: promise ? { title: localized(promise.title), done: Math.min(promise.correctAnswers, promise.target), target: promise.target, lit: !!promise.completed } : undefined,
    });
  } else if (view === 'quests') {
    el.innerHTML = questLogPage(menuPageContext());
  } else if (view === 'story') {
    el.innerHTML = discoveriesPage(menuPageContext());
  } else if (view === 'atlas') {
    el.innerHTML = atlasPage(menuPageContext());
  } else if (view === 'journal') {
    el.innerHTML = phraseJournalPage(menuPageContext());
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
    optionsPanel.render(el as HTMLElement);
  }
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
  dialogSession.invalidate(); miniGameController?.destroy(); miniGameController=undefined; miniGameHost?.destroy(); miniGameHost=undefined;
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
  wordExposure.record({npcId:id});
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
  run = { quest, queue, index: 0, correct: 0, targetCount: queue.length, hinted: false, audioHeard: false, answered: false, answer: '', tokenOrder: [], review: false, started: Date.now(), skipListening: prefs.silentMode };
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
  if (prefs.silentMode) { skipListeningExercises(run); run.skipListening = true; }
  if (run.index >= run.queue.length) { void finishRun(); return; }
  const ex = run.queue[run.index];
  run.hinted = false; run.audioHeard = false; run.answered = false; run.answer = ''; run.tokenOrder = [];
  run.reviewAttempt?.cancel(); run.reviewAttempt = undefined;
  run.submission = undefined; run.shownAt = performance.now();
  stopSpeech();
  const shown = localizedExercise(ex);
  const scaffold = ex.mode === 'type' ? typedScaffold(ex) : '';
  const optionMarkup = exerciseOptionsMarkup(ex, [...(ex.options ?? [])].map((option, i) => ({ option, seed: hash(`${run!.started}:${ex.id}:${run!.index}:${i}`) })).sort((a, b) => a.seed - b.seed).map(({ option }) => option));
  document.querySelector<HTMLDialogElement>('#dialog')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="${e(t('Close adventure'))}">${icon('close')}</button><div class="exercise-header"><span>${run.label ? e(run.label) : run.review ? t('A familiar face, a new encounter') : e(run.quest ? localized(run.quest.title) : t('Your learning route'))}</span><strong>${Math.min(run.index + 1, run.targetCount)} / ${run.targetCount}</strong></div><div class="exercise-progress"><span style="width:${Math.min(100, run.correct / (run.targetCount) * 100)}%"></span></div><div class="exercise-content"><div class="exercise-preferences">${silentModeButton()}</div><h2>${e(shown.prompt)}</h2>${ex.mode === 'listen' ? `<div class="audio-scene"><button class="audio-play" data-speak="${e(ex.german)}" aria-label="${e(t('Play German audio'))}">${icon('volume')}</button><div><strong>${e(t('A voice from {place}', { place: interiorId ? getInterior(interiorId, mapId).name : getMap(mapId).name }))}</strong><span>${t('Listen, then choose your answer. Replay any time.')}</span></div></div><button class="text-button transcript-button" data-action="transcript">${t('Show transcript')}</button><p class="transcript" id="transcript" hidden>${e(ex.german)}</p>` : ''}<div class="exercise-answer">${ex.mode === 'choice' || ex.mode === 'listen' ? `<div class="answer-options">${optionMarkup}</div>` : ex.mode === 'sentence' ? `<div class="sentence-result" id="sentence-result" aria-label="${e(t('Your sentence'))}"><span class="sentence-placeholder">${t('Tap the words to build your answer')}</span></div><div class="word-tokens" id="word-tokens">${shuffledSentenceTiles(ex, `${run.started}:${run.index}:${ex.id}`).map(({ token, i }) => `<button class="word-token" data-game-option="${i}" data-token="${i}" data-value="${e(token)}">${e(token)}</button>`).join('')}</div><button class="text-button" data-action="clear-sentence">${icon('refresh')} ${t('Start the sentence again')}</button>` : `<form id="typed-answer-form">${scaffold ? `<p class="typed-scaffold"><span>${t('Letter guide')}</span><strong lang="de">${e(scaffold)}</strong></p>` : ''}<input class="typed-answer" id="typed-answer" placeholder="${e(t('Write your answer in German…'))}" autocomplete="off" autocapitalize="sentences" spellcheck="false" aria-label="${e(t('Your German answer'))}"/><div class="german-keys">${['ä', 'ö', 'ü', 'ß'].map(char => `<button type="button" data-insert="${char}">${char}</button>`).join('')}</div><span class="typed-spelling-help">${t('Capitalize German nouns and formal Sie. You can use ae, oe and ue for umlauts.')}</span></form>`}</div><div id="exercise-feedback" class="exercise-feedback" aria-live="polite"></div><div class="exercise-actions"><button class="text-button" data-action="hint">${icon('sparkles')} ${t('A little help')}</button>${ex.mode === 'sentence' || ex.mode === 'type' ? `<button class="primary-button" data-action="check-answer" id="check-answer">${t('Check my answer')} ${icon('arrow')}</button>` : ''}<button class="primary-button" data-action="next-exercise" id="next-exercise" hidden>${t('On with the story')} ${icon('arrow')}</button></div><p class="exercise-hint" id="exercise-hint" hidden>${e(shown.hint)}</p></div>`;
  document.querySelector('#typed-answer-form')?.addEventListener('submit', event => { event.preventDefault(); void submitAnswer(); });
  if (ex.mode === 'choice' || ex.mode === 'sentence') wordExposure.record({exerciseId:ex.id});
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
      const skipListening = prefs.silentMode || !!activeRun.skipListening;
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
      const object = getInteriorObject(activeRun.interiorObjectId, interiorId, mapId);
      const room = interiorId ? getInterior(interiorId, mapId) : undefined;
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
/** Narration and answer cues (speech.ts). */
const speech = new Speech({
  silent: () => prefs.silentMode, muted: () => prefs.muted,
  narration: active => world?.setNarrationActive(active),
  clipFor: text => audioReference((findSentence(text) as { audio?: unknown } | undefined)?.audio) ?? audioPaths.get(text),
  voiceIndex: speaker => Math.max(0, npcs.findIndex(npc => npc.id === speaker)),
});
function stopSpeech() { speech.stop(); }
function setSilentMode(enabled: boolean, notify = true) {
  prefs.silentMode = enabled;
  localStorage.setItem('atlas.silentMode', String(prefs.silentMode)); world.setAudioPreferences({ silent: prefs.silentMode, muted: prefs.muted });
  if (prefs.silentMode) { stopSpeech(); speech.suspendCues(); }
  if (view === 'settings') renderOther();
  if (prefs.silentMode && run && !run.answered && !run.submission && run.queue[run.index]?.mode === 'listen') renderExercise();
  document.querySelectorAll<HTMLButtonElement>('[data-action="silent-mode"]').forEach(button => {
    button.setAttribute('aria-pressed', String(prefs.silentMode));
    button.innerHTML = `${icon(prefs.silentMode ? 'muted' : 'volume')} ${prefs.silentMode ? t('Silent mode on') : t('Silent mode off')}`;
  });
  questController?.refreshAudio();
  if (notify) toast(prefs.silentMode ? t('Silent mode on. Listening exercises will be skipped.') : t('Silent mode off. Listening exercises will return in your next session.'));
}
/** Speak German for the current exercise or dialogue; a listening exercise counts as heard only when it plays out. */
function speak(text: string, speaker?: string, clipId?: string, rate = prefs.speechRate) {
  const listeningRun = run;
  const listeningIndex = run?.index;
  const audioStatus = (message: string) => { if (run === listeningRun && run?.index === listeningIndex) { const label = document.querySelector<HTMLElement>('.audio-scene span'); if (label) label.textContent = message; } };
  speech.speak(text, {
    speaker, clipId, rate,
    started: () => audioStatus(t('Playing German audio…')),
    heard: () => { if (run && run === listeningRun && run.index === listeningIndex && run.queue[run.index]?.mode === 'listen' && run.queue[run.index].german === text) { run.audioHeard = true; wordExposure.record({exerciseId:run.queue[run.index].id}); audioStatus(t('Audio finished. Choose your answer, or listen again.')); } },
    unavailable: () => {
      toast(t('The audio couldn’t play. You can use the transcript and try it again.'));
      if (run && run === listeningRun && run.index === listeningIndex) { run.audioHeard = false; run.hinted = true; const transcript = document.querySelector<HTMLElement>('#transcript'); if (transcript) { transcript.hidden = false; wordExposure.record({exerciseId:run.queue[run.index].id}); } }
    },
  });
}
function playCue(correct: boolean) { speech.cue(correct); }
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
    if (target.dataset.inkOpen) { mechanicsUi?.open(`ink:${target.dataset.inkOpen}`); return; }
    if (target.dataset.followTicket) { document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView('world'); world.focusObject(`side:${target.dataset.followTicket}`); toast(t('Following the address on the ticket…')); return; }
    if (target.dataset.minigame) { void startMiniGame(target.dataset.minigame); return; }
    if (target.dataset.activity) { void startActivity(target.dataset.activity as ActivityId); return; }
    if (target.dataset.action === 'load-story-page') { void loadStoryPage(); return; }
    if (target.dataset.coursePage) { coursePage = Math.max(0, Number(target.dataset.coursePage)); renderOther(); return; }
    if (target.dataset.courseLevel) { coursePage = 0; courseLevel = target.dataset.courseLevel as Level; void loadContexts('grammar', undefined, courseLevel).then(() => renderOther()).catch(error => toast(error.message, true)); return; }
    if (target.dataset.courseTab) { coursePage = 0; courseTab = target.dataset.courseTab as typeof courseTab; renderOther(); return; }
    if (target.dataset.optionsTab) { optionsPanel.tab = target.dataset.optionsTab as OptionsTab; setView('settings'); return; }
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
    if (target.dataset.focusBuilding) { const id = target.dataset.focusBuilding; if (buildingEntrances(mapId).some(entrance => entrance.interiorId === id)) guideToBuilding(id as InteriorId); return; }
    if (target.dataset.inspectInterior) { showInteriorObject(target.dataset.inspectInterior); return; }
    if (target.dataset.practiceInterior) { startInteriorPractice(target.dataset.practiceInterior); return; }
    if (target.dataset.interiorActivity) { startInteriorActivity(target.dataset.interiorActivity); return; }
    if (target.dataset.inspectObject) { showObject(target.dataset.inspectObject); return; }
    if (target.dataset.practiceObject) { startObjectPractice(target.dataset.practiceObject); return; }
    if (target.dataset.npc) { document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView('world'); world.focusNpc(target.dataset.npc); return; }
    if (target.dataset.practiceQuest) { startQuestPractice(target.dataset.practiceQuest); return; }
    if (target.dataset.replayDialogue) { document.querySelector<HTMLDialogElement>('#dialog')!.close(); setView('world'); void questController?.open(target.dataset.replayDialogue); return; }
    if (target.dataset.saveStory) { const slot = target.dataset.saveStory; void api.saveStory(slot, document.querySelector<HTMLInputElement>(`#save-name-${slot}`)!.value).then(() => api.story()).then(result => { storySaves = result.saves ?? []; acceptProgress(result.progress); mechanicsUi?.setMechanics(result.mechanics); renderOther(); toast(t('This point in your story is saved.')); }).catch(error => toast(error.message, true)); return; }
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
      case 'manage-access': if(accessClock.snapshot(performance.now())?.phase==='paid')accessSession.showBillingAccount();else if(account.registered)accessSession.showPaywall();else accountEntry.showSaveAccount();break;
      case 'course-help': openDialog(`<div class="help-dialog"><h2>${t('Learning routes')}</h2><p>${t('Learn in short encounters, use the language in the world, then return when it is ready again. Vocabulary, grammar and connected texts have their own evidence.')}</p><button class="primary-button" data-action="close-dialog">${t('Back')}</button></div>`);break;
      case 'journal-help': openDialog(`<div class="help-dialog"><h2>${t('Your words')}</h2><p>${t('Seeing a word introduces it. Recognising, hearing and recalling it each build their own memory. Familiar words rest between encounters.')}</p><button class="primary-button" data-action="close-dialog">${t('Back')}</button></div>`);break;
      case 'begin-exercises': renderExercise(); break;
      case 'check-answer': void submitAnswer(); break;
      case 'retry-review-answer': void submitAnswer(); break;
      case 'next-exercise': if (run?.answered) { run.index++; renderExercise(); } break;
      case 'finish-run': void finishRun(); break;
      case 'review': void startAdaptiveReview(); break;
      case 'placement': void startPlacement(); break;
      case 'sleep': if (interiorId && roomKind(interiorId) === 'inn') { void api.request<{progress:Progress}>('/story/sleep',{id:crypto.randomUUID()}).then(result => { acceptProgress(result.progress); updateProgress(); document.querySelector<HTMLDialogElement>('#dialog')!.close(); toast(t('A new day. Your lantern keeps the promises you made.')); }).catch(error => toast(error.message, true)); } break;
    case 'todays-words': void startTodaysWords(); break;
      case 'course-retry': coursePromise = undefined; void loadCourse().then(() => renderOther()).catch(error => toast(error.message, true)); break;
      case 'hint': if (run && !run.answered && !run.submission) { run.hinted = true; document.querySelector<HTMLElement>('#exercise-hint')!.hidden = false; wordExposure.record({exerciseId:run.queue[run.index].id}); } break;
      case 'transcript': if (run && !run.answered && !run.submission) { run.hinted = true; document.querySelector<HTMLElement>('#transcript')!.hidden = false; wordExposure.record({exerciseId:run.queue[run.index].id}); } break;
      case 'clear-sentence': if (run && !run.answered && !run.submission) { run.tokenOrder = []; run.answer = ''; document.querySelectorAll<HTMLButtonElement>('[data-token]').forEach(b => { b.disabled = false; }); document.querySelector('#sentence-result')!.innerHTML = `<span class="sentence-placeholder">${t('Tap the words to build your answer')}</span>`; } break;
      case 'silent-mode':
        if (attemptBusy) { toast(t('Your answer is saving. Try again in a moment.')); break; }
        setSilentMode(!prefs.silentMode);
        break;
      case 'save-account': accountEntry.showSaveAccount(); break;
      case 'login-account': accountEntry.showLogin(); break;
      case 'logout-account': accountEntry.showLogout(); break;
      case 'reset-game': accessSession.showResetGame(); break;
      case 'sound': { prefs.muted = !prefs.muted; localStorage.setItem('atlas.muted', String(prefs.muted)); world.setAudioPreferences({ silent: prefs.silentMode, muted: prefs.muted });  if (!prefs.muted) playCue(true); const soundButton = document.querySelector<HTMLButtonElement>('#hud-sound'); if (soundButton) { soundButton.setAttribute('aria-pressed', String(!prefs.muted)); soundButton.innerHTML = icon(prefs.muted ? 'muted' : 'volume'); } if (view === 'settings') renderOther(); break; }
    }
  });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('cancel', () => { cancelRun(); pendingDestination = undefined; });
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('click', event => {
    const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { cancelRun(); pendingDestination = undefined; dialog.close(); }
  });
  const closeInvalidated = trackDialogClose(document.querySelector<HTMLDialogElement>('#dialog')!, dialogSession);
  document.querySelector<HTMLDialogElement>('#dialog')!.addEventListener('close', () => { const invalidated = closeInvalidated(); if (!document.querySelector<HTMLDialogElement>('#dialog')!.open) { if (!invalidated) dialogSession.invalidate(); interiorConversation = undefined; wordDetailReturn = undefined; document.querySelector('#game-shell')!.classList.remove('encounter-open'); syncWorldMode(); placementController?.destroy(); placementController = undefined; cancelRun(); miniGameController?.destroy(); miniGameController=undefined; miniGameHost?.destroy(); miniGameHost=undefined; activityController?.destroy(); activityController = undefined; if (!questController?.isOpen) { world.setConversationTarget(undefined); stopSpeech(); } if(view==='world')document.querySelector<HTMLElement>('#world-container')?.focus({preventScroll:true}); } });
  const menu = document.querySelector<HTMLDialogElement>('#menu-layer')!;
  menu.addEventListener('close', () => { if (!menu.open && view !== 'world') setView('world'); });
  menu.addEventListener('click', event => { if (event.target === menu) setView('world'); });
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
    queueMicrotask(() => void accessSession.verifyBilling());
  }

  if (result.access && accessBlocked(result.access)) {
    started = true; account = result.account; profile = { name: result.player.name, avatar: result.player.avatar };
    acceptProgress(result.progress, result.player.id); accessClock.update(result.access, performance.now());
    if (result.access.phase === 'login_required') accountEntry.showSaveAccount(true); else accessSession.showPaywall();
    return false;
  }
  await loadServerContent(result);
  if (activeCourse?.target !== 'de') {
    started = true; account = result.account; acceptProgress(result.progress, result.player.id); profile = { name: result.player.name, avatar: result.player.avatar };
    if (result.access) accessClock.update(result.access, performance.now());
    document.querySelector<HTMLElement>('#game-shell')!.hidden = true; world.destroy();
    document.body.classList.add('course-player-mode');
    const host = document.createElement('main'); host.className = 'course-player'; document.body.append(host);
    await mountCoursePlayer(host, { api, session: result, onAccessRequired: () => { if (account.registered) accessSession.showPaywall(); else accountEntry.showSaveAccount(true); }, onAccount: () => account.registered ? accessSession.showPaywall(false) : accountEntry.showSaveAccount(), onInvite: () => void accessSession.showInviteFriend(), canInvite: () => referralAvailable(accessClock.snapshot(performance.now())), onLogout: () => accountEntry.showLogout(), isActive: () => !document.hidden && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open });
    return true;
  }
  if (accountEntry.reconcileBaseLanguage(result)) return false;
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
  accessSession.connectionPaused = true;
  updateProgress(); accessSession.updateHud();
  void sendHeartbeat(0);
  void loadCourse().catch(error => toast(error.message, true));
  const owner = result.player.id;
  void api.story().then(result => { if (api.selfId !== owner) return; storySaves = result.saves ?? []; acceptProgress(result.progress, owner); mechanicsUi?.setMechanics(result.mechanics); updateProgress(); }).catch(error => toast(error.message, true));
  accountReminder = new AccountReminder(result.player.id, localStorage);
  accountReminder.tick(performance.now(), false);
  if (reminderTimer !== undefined) clearInterval(reminderTimer);
  reminderTimer = window.setInterval(() => {
    const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
    const active = !document.hidden && connection === 'online' && !dialog.open;
    accountReminder!.tick(performance.now(), active);
    if (intakeClock.tick(performance.now(), active)) void sendHeartbeat(intakeClock.consume());
    accessSession.syncActivity(); accessSession.updateHud(); accessSession.enforceWall();
    if (accessSession.heartbeatDue(performance.now())) void accessSession.sendHeartbeat(accessSession.isActive());
  }, 1000);
  queueMicrotask(() => { accessSession.enforceWall(); accessSession.syncActivity(); });
  return true;
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
  updateProgress();accessSession.updateHud();
  if(surface==='home')setView('menu');
  else if(surface==='options')setView('settings');
  else if(surface==='character')setView('character');
  else if(surface==='help')setView('help');
  else if(surface==='account'){account={registered:true,email:'wanderer@example.com'};optionsPanel.tab='account';setView('settings');}
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
  // UI previews also render map placements; the screenshot harness starts an API.
  try {await loadPublishedWorld();}
  catch(error){document.querySelector('#app')!.innerHTML=`<p role="alert">${e(error instanceof Error?error.message:'The saved world could not be loaded.')}</p><a href="/game/">Reload the game</a>`;return;}
  // Paint in the cached support language; the account's saved choice is applied once the session resumes.
  await setBaseLanguage(cachedBaseLanguage(), { persist: false });
  renderShell();
  const stopPortraits = observeAvatarPortraits(document.body);
  window.addEventListener('beforeunload', stopPortraits, { once: true });
  if (uiCheckSurface && ['home','options','character','help','account','encounter','journal','activity','course','world'].includes(uiCheckSurface)) { await openUiCheck(uiCheckSurface); return; }
  api.onAccess = accessSession.apply;
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
      // The server never confirmed the trip: stay here, drop its arrival beat and say so.
      const destination = getMap(pendingMap).name;
      pendingMap = undefined; pendingDestination = undefined; pendingExpeditionGame = undefined; pendingTravelBeat = false;
      toast(t('The connection dropped, so the journey to {place} was cancelled. Try again once you are reconnected.', { place: destination }), true);
    }
    accessSession.syncActivity(); syncWorldMode();
    updateConnection();
  };
  api.onError = message => { if (pendingMap) { pendingMap = undefined; pendingDestination = undefined; pendingExpeditionGame = undefined; pendingTravelBeat = false; syncWorldMode(); } toast(message, true); };
  accessSession.showDialog(`<h2 id="account-title">${t('Opening your adventure…')}</h2><p role="status">${t('Checking for your saved character.')}</p>`);
  try {
    const result = await api.resume();
    if (result) {
      profile = { name: result.player.name, avatar: result.player.avatar };
      account = result.account;
      if (account.registered || localStorage.getItem(`atlas.nameChosen.${result.player.id}`) === 'true') {
        if (await enterGame(result)) document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
      } else accountEntry.showLanguages(true, result.preferences.baseLanguage);
    } else accountEntry.showLanguages();
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    connection = 'offline'; updateConnection();
    accountEntry.showLanguages(!!api.token);
    const message = document.querySelector<HTMLElement>('#account-error')!;
    message.textContent = t('The town could not connect. You can try starting again in a moment.');
  }
}
function updateConnection() {
  updateLocalHud();
  const close = document.querySelector<HTMLElement>('.menu-close');
  if (!close) return;
  close.querySelector('.connection-dot')?.remove();
  if (connection !== 'online') close.insertAdjacentHTML('beforeend', `<span class="connection-dot" role="status" aria-label="${e(connection === 'incompatible' ? t('Reload to continue') : connection === 'replaced' ? t('Active in another tab') : t('Reconnecting'))}"></span>`);
}
document.addEventListener('visibilitychange', () => { accessSession.syncActivity(); accessSession.updateHud(); void accessSession.sendHeartbeat(accessSession.isActive()); accountReminder?.tick(performance.now(), started && !document.hidden && connection === 'online' && !document.querySelector<HTMLDialogElement>('#account-dialog')?.open); syncWorldMode(); if (document.hidden) { if(exerciseChoiceTimer){clearTimeout(exerciseChoiceTimer);exerciseChoiceTimer=undefined;pendingExerciseChoice=undefined;} activityController?.pause(); miniGameController?.pause(); deliveryController?.pause(); stopSpeech(); } else if(!accessBlocked(accessClock.snapshot(performance.now())) && !document.querySelector<HTMLDialogElement>('#account-dialog')?.open) { activityController?.resume(); miniGameController?.resume(); deliveryController?.resume(); } if (!document.hidden && regionReady) onRegionReady(mapId); });
window.addEventListener('beforeunload', () => { stopHudFrames?.(); notifications?.destroy(); removeFormNotifications?.(); removeSentenceTranslations(); stopUpdateChecks?.(); removeUpdateNotice?.(); wordExposure.destroy(); if (reminderTimer !== undefined) clearInterval(reminderTimer); accessSession.destroy(); accountReminder?.tick(performance.now(), false); screenFilterControls?.destroy(); activityController?.destroy(); stopSpeech(); api.destroy(); world?.destroy(); });
void boot();

mountSupportBanner();
