import type { Api, AccountStatus, ConnectionStatus, Progress } from './api';
import { setBrowserAnalyticsEnabled, browserAnalyticsEnabled } from './analytics-client';
import { accountCredentialRows, bindAccountCredentials } from './account-settings';
import type { Level } from './content';
import { mountCoursePicker } from './course-player';
import turkishCoverage from './data/i18n/tr-coverage.json';
import type { DevicePreferences } from './device-preferences';
import type { AccessClock } from './game-access';
import { baseLanguage, baseLanguageNames, t, upper, type BaseLanguage } from './i18n';
import { escapeHtml as e, icon } from './icons';
import { maps } from './maps';
import { bindOptionRows, optionsMarkup, type OptionRow, type OptionsTab } from './options-menu';
import { routeUnlocked } from './progression';
import { saveSlotsMarkup } from './story-panels';
import { graphicsQualityMode, graphicsQualityTier, onGraphicsQualityChange, setGraphicsQualityMode, type QualityMode, type QualityTier } from './texture-quality';
import type { World, WorldMotion } from './world';
import type { WorldTimeMode } from './world-clock';

/** What the options panel needs from the page; main.ts provides it. */
export interface OptionsHost {
  api: Api;
  clock: AccessClock;
  prefs: DevicePreferences;
  world(): World;
  progress(): Progress;
  level(): Level;
  account(): AccountStatus;
  profile(): { name: string };
  storySaves(): { slot: string; name: string; at: string }[];
  connection(): ConnectionStatus;
  started(): boolean;
  attemptBusy(): boolean;
  settingsOpen(): boolean;
  /** Repaint the open menu page. */
  refresh(): void;
  toast(message: string, bad?: boolean): void;
  playUiSound(kind: 'move' | 'confirm'): void;
  playCue(correct: boolean): void;
  setSilentMode(enabled: boolean): void;
  changeBaseLanguage(language: BaseLanguage): Promise<void>;
  /** The account's email or password changed. */
  accountChanged(account: AccountStatus): void;
}

/** The settings page: audio, display, language and account rows. Moved out of main.ts unchanged in behaviour. */
export class OptionsPanel {
  tab: OptionsTab = 'audio';
  private unbind: (() => void) | undefined;

  constructor(private readonly host: OptionsHost) {
    // Automatic quality can change while the Display tab is open; keep its label current.
    onGraphicsQualityChange(() => {
      const el = document.querySelector<HTMLElement>('[data-options-panel="display"]')?.parentElement;
      if (el && this.host.settingsOpen() && this.tab === 'display') this.render(el);
    });
  }

  /** The settings page closed. */
  close() { this.unbind?.(); this.unbind = undefined; }

  private rows(): OptionRow[] {
    const onOff = [{ value: 'on', label: t('On') }, { value: 'off', label: t('Off') }];
    if (this.tab === 'audio') return [
      { kind: 'choice', id: 'sound', label: t('Interface sounds'), help: t('Menu sounds and small musical cues after your answers.'), value: this.host.prefs.muted ? 'off' : 'on', choices: onOff },
      { kind: 'choice', id: 'silent', label: t('Silent mode'), help: t('Automatically skip listening exercises and mute audio. Quests finish after reading and writing; listening stays available for later. Saved on this device.'), value: this.host.prefs.silentMode ? 'on' : 'off', choices: onOff },
      { kind: 'choice', id: 'speech-rate', label: t('Listening pace'), help: t('German audio is included. Choose a comfortable pace and replay it whenever you like.'), value: String(this.host.prefs.speechRate), choices: [{ value: '0.65', label: t('A little slower') }, { value: '0.82', label: t('Easy pace') }, { value: '1', label: t('Natural pace') }] },
    ];
    if (this.tab === 'display') {
      const clock = this.host.world().getWorldTime();
      const tierLabel: Record<QualityTier, string> = { low: t('Low'), medium: t('Medium'), high: t('High') };
      return [
        { kind: 'choice', id: 'graphics-quality', label: t('Graphics quality'), help: t('Sharper art downloads more and needs more graphics memory. Automatic starts at Low, raises the quality while the game runs smoothly and lowers it if play stutters. A level you choose stays fixed.'), value: graphicsQualityMode(), choices: [{ value: 'auto', label: t('Automatic ({tier})', { tier: tierLabel[graphicsQualityTier()] }) }, { value: 'low', label: tierLabel.low }, { value: 'medium', label: tierLabel.medium }, { value: 'high', label: tierLabel.high }] },
        { kind: 'choice', id: 'world-motion', label: t('World motion'), help: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? t('Choose lively town scenery or a calmer world. Your device currently requests reduced motion.') : t('Choose lively town scenery or a calmer world. Your device currently requests full motion.'), value: this.host.prefs.worldMotion, choices: [{ value: 'auto', label: t('Follow device preference') }, { value: 'full', label: t('Full world animation') }, { value: 'reduced', label: t('Calm, still scenery') }] },
        { kind: 'choice', id: 'time-mode', label: t('Time of day'), help: t('Watch warm daylight turn into moonlit streets. Let the day pass, follow your local clock, or choose a moment.'), value: this.host.prefs.worldTimeMode, choices: [{ value: 'cycle', label: t('Slow day and night cycle') }, { value: 'local', label: t('Real local time') }, { value: 'manual', label: t('Choose a time') }] },
        { kind: 'scale', id: 'world-hour', label: t('Time to watch'), help: t('Changing the hour switches the world clock to the time you choose.'), value: Math.floor(clock.hour), min: 0, max: 23, step: 1, display: `${clock.label} · ${upper(clock.period === 'day' ? t('Day') : t('Night'))}`, valueId: 'world-hour-label' },
        { kind: 'choice', id: 'fullscreen', label: t('Full screen'), help: t('Let the world fill the whole screen.'), value: document.fullscreenElement ? 'on' : 'off', choices: onOff },
        { kind: 'action', id: 'screen-filters', label: t('Screen filters'), help: t('Experiment with a softer world or an old television finish. Your choices are saved with your adventure.'), action: 'screen-filters', button: t('Try filters in the world'), glyph: 'sparkles' },
        { kind: 'action', id: 'watch-world', label: t('Watch the world'), help: t('Hide the interface and watch the town go about its day. Press Escape to return.'), action: 'watch-world', button: t('Watch the world'), glyph: 'compass' },
      ];
    }
    if (this.tab === 'language') return [
      { kind: 'choice', id: 'base-language', label: t('Support language'), help: `${t('Meanings, hints, explanations and menus appear in this language. The German, its audio and how answers are checked stay the same.')}${baseLanguage() === 'tr' ? ` ${t('Turkish text is machine-written and awaits native-speaker review.')}` : ''}`, value: baseLanguage(), choices: (['en', 'tr'] as const).map(language => ({ value: language, label: baseLanguageNames[language] })) },
      { kind: 'custom', id: 'chapter', label: t('Your learning chapter'), help: t('Routes open when you restore their names. Your learning scaffold follows the route.'), html: `<div class="level-switch settings-levels">${(['A1', 'A2', 'B1'] as const).map(l => `<button data-level="${l}" ${routeUnlocked(maps.find(map => map.level === l)!.id, this.host.progress().completedQuestIds) ? '' : 'disabled'} class="${l === this.host.level() ? 'selected' : ''}">${l}</button>`).join('')}</div>` },
      { kind: 'action', id: 'placement', label: t('Practice starting point'), help: t('A two-minute sample recommends useful language support.'), action: 'placement', button: t('Find my comfortable German level'), glyph: 'compass' },
    ];
    const account = this.host.account();
    return [
      ...accountCredentialRows(account),
      { kind: 'choice', id: 'usage-analytics', label: t('Usage analytics'), help: t('Share visits and app issues with Glotworld to help improve the game. No external analytics services. Your browser privacy preference takes priority. Learning progress and billing records are saved separately.'), value: browserAnalyticsEnabled() ? 'on' : 'off', choices: onOff },
      { kind: 'action', id: 'manage-access', label: t('Game access'), help: this.host.clock.snapshot(performance.now())?.phase === 'free' ? t('Enjoy unlimited free play.') : t('Manage your access and billing.'), action: 'manage-access', button: this.host.clock.snapshot(performance.now())?.phase === 'free' ? t('Free to play') : this.host.clock.snapshot(performance.now())?.phase === 'paid' ? t('Manage access') : t('View access options'), glyph: 'clock' },
      { kind: 'custom', id: 'account', label: account.registered ? t('Your adventure is linked') : t('Take your adventure with you'), help: account.registered ? t('Playing as {name}. Log in on another device with {email} and your password.', { name: this.host.profile().name, email: account.email }) : t('Playing as {name}. Add an email and password to continue on another device.', { name: this.host.profile().name }), html: `<div class="option-buttons">${account.registered ? '' : `<button class="option-action" data-action="save-account">${e(t('Add email & password'))}</button>`}<button class="option-action" data-action="login-account">${t('Log in to a saved adventure')}</button><button class="option-action" data-action="reset-game">${this.host.clock.snapshot(performance.now())?.phase === 'free' ? 'Reset game' : 'Reset game &amp; play 2 hours'}</button><button class="option-action" data-action="logout-account">${t('Log out')}</button></div>` },
    ];
  }
  render(el: HTMLElement) {
    this.unbind?.();
    const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.option : undefined, scroll = el.scrollTop;
    const rows = this.rows();
    let extra = '';
    if (this.tab === 'language') extra = `<section data-course-picker></section>${baseLanguage() === 'tr' ? `<p class="honest-note">${t('Turkish support covers the story and all A1, A2 and B1 course exercises.')} ${t('Coverage: story {story}%, interface {ui}%, course words {words}%, course tasks {tasks}%.', turkishCoverage)}</p>` : ''}`;
    if (this.tab === 'account') {
      const performance = this.host.world().getWorldStats();
      extra = saveSlotsMarkup(this.host.storySaves()) + `<div class="connection-info">${icon('users')} ${this.host.connection() === 'online' ? t('Your route is connected. Your progress is saved on the server.') : this.host.connection() === 'incompatible' ? t('The world has changed. Reload this page to continue.') : this.host.connection() === 'replaced' ? t('Your character is active in another tab. Continue there, or close it and reload this page.') : t('The route is reconnecting. Keep this tab open.')}</div><details class="world-performance"><summary>${t('World performance')}</summary><p>${performance.fps ? t('{fps} frames per second · average {frame} ms · 95th percentile {p95} ms', { fps: performance.fps, frame: performance.frameMs, p95: performance.p95FrameMs }) : t('The world is warming up.')}</p><span class="caption">${t('{residents} residents · {objects} objects · {animated} animated details', { residents: performance.residents, objects: performance.objects, animated: performance.animated })}</span></details>`;
    }
    el.innerHTML = optionsMarkup(this.tab, rows, extra);
    const picker = el.querySelector<HTMLElement>('[data-course-picker]');
    if (picker && this.host.started()) void mountCoursePicker(picker, this.host.api).catch(error => this.host.toast(error.message, true));
    if (this.tab === 'account') {
      const owner = this.host.api.token;
      bindAccountCredentials(el, this.host.api, (updated, kind) => {
        if (this.host.api.token !== owner) return;
        this.host.accountChanged(updated);
        if (this.host.settingsOpen() && this.tab === 'account') {
          this.render(el);
          el.querySelector<HTMLElement>(`.account-credential-editor:has([data-credential-form="${kind}"]) summary`)?.focus();
        }
        this.host.toast(t(kind === 'email' ? 'Your email has been updated.' : 'Your password has been updated.'));
      });
    }
    this.unbind = bindOptionRows(el, rows, (row, value) => this.change(row.id, String(value)), kind => this.host.playUiSound(kind));
    if (focused) { el.querySelector<HTMLElement>(`[data-option="${focused}"]`)?.focus({ preventScroll: true }); el.scrollTop = scroll; }
  }
  private change(id: string, value: string) {
    switch (id) {
      case 'sound': this.host.prefs.muted = value === 'off'; localStorage.setItem('atlas.muted', String(this.host.prefs.muted)); this.host.world().setAudioPreferences({ silent: this.host.prefs.silentMode, muted: this.host.prefs.muted }); if (!this.host.prefs.muted) this.host.playCue(true); break;
      case 'silent': if (this.host.attemptBusy()) { this.host.toast(t('Your answer is saving. Try again in a moment.')); return; } this.host.setSilentMode(value === 'on'); return;
      case 'usage-analytics': setBrowserAnalyticsEnabled(value === 'on'); break;
      case 'speech-rate': this.host.prefs.speechRate = Number(value); localStorage.setItem('atlas.speechRate', String(this.host.prefs.speechRate)); break;
      case 'graphics-quality': setGraphicsQualityMode(value as QualityMode); break;
      case 'world-motion': this.host.prefs.worldMotion = value as WorldMotion; localStorage.setItem('atlas.worldMotion', this.host.prefs.worldMotion); this.host.world().setMotionPreference(this.host.prefs.worldMotion); break;
      case 'time-mode': this.host.prefs.worldTimeMode = value as WorldTimeMode; localStorage.setItem('atlas.worldTimeMode', this.host.prefs.worldTimeMode); this.host.world().setTimePreference({ mode: this.host.prefs.worldTimeMode, hour: this.host.prefs.manualWorldHour }); break;
      case 'world-hour':
        this.host.prefs.manualWorldHour = Number(value); this.host.prefs.worldTimeMode = 'manual';
        localStorage.setItem('atlas.worldHour', String(this.host.prefs.manualWorldHour)); localStorage.setItem('atlas.worldTimeMode', this.host.prefs.worldTimeMode);
        this.host.world().setTimePreference({ mode: this.host.prefs.worldTimeMode, hour: this.host.prefs.manualWorldHour }); break;
      case 'fullscreen':
        if (value === 'off') void document.exitFullscreen?.().catch(() => undefined).finally(() => { if (this.host.settingsOpen()) this.host.refresh(); });
        else void document.documentElement.requestFullscreen?.().catch(() => this.host.toast(t('Full screen isn’t available here.'))).finally(() => { if (this.host.settingsOpen()) this.host.refresh(); });
        return;
      case 'base-language': void this.host.changeBaseLanguage(value as BaseLanguage); return;
    }
    if (this.host.settingsOpen()) this.host.refresh();
  }
}
