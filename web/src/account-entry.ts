import type { Api, AccountStatus, Progress, SessionResult } from './api';
import type { AccessSession } from './access-session';
import { bindCharacterBuilder, characterBuilderMarkup } from './character-builder';
import { configureContentSession, contentApi } from './content-api';
import { activeCourse } from './content-runtime';
import { formatAccessTime, type AccessClock } from './game-access';
import { baseLanguage, setBaseLanguage, t, type BaseLanguage } from './i18n';
import { escapeHtml as e, icon } from './icons';
import { mountLanguageOnboarding, onboardingLanguageSummary, onboardingStepsMarkup } from './onboarding';
import { nameSuggestions } from './player-account';
import { pendingReferral } from './referrals';
import type { Avatar, WorldPlayer } from './world';

const pendingLanguageKey = 'atlas.baseLanguagePending';

/** What the entry and account dialogs need from the page; main.ts provides it. */
export interface AccountEntryHost {
  api: Api;
  access: AccessSession;
  clock: AccessClock;
  started(): boolean;
  account(): AccountStatus;
  profile(): { name: string; avatar: Avatar };
  settingsOpen(): boolean;
  /** Repaint the open menu page. */
  refresh(): void;
  toast(message: string, bad?: boolean): void;
  enterGame(result: SessionResult): Promise<boolean>;
  /** The player registered or changed their email or password. */
  accountChanged(account: AccountStatus): void;
}

/**
 * The first-run language and name screens, the support-language switch, and the sign-up, login and logout dialogs.
 * Moved out of main.ts unchanged in behaviour.
 */
export class AccountEntry {
  /** The course chosen on the language screen. */
  target: 'de' | 'en' = sessionStorage.getItem('atlas.entryTarget') === 'en' ? 'en' : 'de';
  private fromZero = false;
  private language: BaseLanguage | undefined;
  private languageSelection: BaseLanguage | undefined;
  private draft: { name: string; avatar: Avatar } | undefined;
  private readonly names = nameSuggestions();

  constructor(private readonly host: AccountEntryHost) {}

  showLanguages(restoreName = false, initialLanguage = this.languageSelection ?? baseLanguage()) {
    this.language = undefined;
    this.host.access.showDialog('');
    mountLanguageOnboarding(document.querySelector<HTMLDialogElement>('#account-dialog')!, {
      initialLanguage, initialLearningLanguage: this.target,
      onConfirm: languages => {
        this.fromZero = languages.germanExperience === 'none';
        this.target = languages.learningLanguage; sessionStorage.setItem('atlas.entryTarget', this.target);
        this.language = this.languageSelection = languages.motherTongue;
        this.showName(restoreName);
      },
      onLogin: languages => { this.languageSelection = languages.motherTongue; this.showLogin(); },
    });
  }
  /** Switch the support language, save it with the account, then repaint every screen in it. */
  async changeBaseLanguage(language: BaseLanguage) {
    if (activeCourse && !activeCourse.supportLanguages.includes(language)) return;
    configureContentSession(() => this.host.api.token, { accountId: this.host.api.selfId, courseId: activeCourse?.id, supportLanguage: language });
    const applied = await setBaseLanguage(language);
    if (applied !== language) this.host.toast(t('Turkish support could not load. Check your connection and try again.'), true);
    if (this.host.started()) {
      try { await this.host.api.savePreferences({ baseLanguage: applied }); localStorage.removeItem(pendingLanguageKey); }
      catch { localStorage.setItem(pendingLanguageKey, 'true'); }
    }
    // The shell, HUD and open views are rendered once; a reload repaints them. Progress is saved on the server.
    window.location.reload();
  }
  /** The account's language wins, unless this device changed it while the server was unreachable. */
  reconcileBaseLanguage(result: SessionResult): boolean {
    if (localStorage.getItem(pendingLanguageKey) === 'true') {
      void this.host.api.savePreferences({ baseLanguage: baseLanguage() }).then(() => localStorage.removeItem(pendingLanguageKey)).catch(() => {});
      return false;
    }
    if (result.preferences.baseLanguage === baseLanguage()) return false;
    void setBaseLanguage(result.preferences.baseLanguage).then(() => window.location.reload()).catch(error => this.host.toast((error as Error).message, true));
    return true;
  }
  showName(restoreName = false) {
    let typed: string | null = null;
    try { typed = sessionStorage.getItem('atlas.entryName'); sessionStorage.removeItem('atlas.entryName'); } catch { /* Optional convenience only. */ }
    const selected = this.draft?.name ?? (typed?.trim() ? typed.trim().slice(0, 24) : restoreName ? this.host.profile().name : this.names[0]);
    const suggestions = this.names.includes(selected) ? this.names : [selected, ...this.names.slice(0, 3)];
    this.host.access.showDialog(`${onboardingStepsMarkup(2)}<h2 id="account-title">${t('What should the town call you?')}</h2><p>${t('Pick a suggested name or write your own. This is the name other players will see.')}</p><div class="onboarding-language-summary"><div class="onboarding-language-pair">${onboardingLanguageSummary(baseLanguage(), this.target)}</div><button type="button" class="text-button" id="entry-languages">${t('Change languages')}</button></div><form id="name-entry-form"><div class="name-suggestions" role="group" aria-label="${e(t('Suggested player names'))}">${suggestions.map(name => `<button type="button" class="name-suggestion" aria-pressed="${name === selected}" data-suggested-name="${e(name)}">${e(name)}</button>`).join('')}</div><label class="form-label" for="entry-name">${t('Your player name')}</label><input id="entry-name" class="name-input" value="${e(selected)}" required minlength="2" maxlength="24" autocomplete="nickname" aria-describedby="name-help"/><span id="name-help">${t('2–24 letters or numbers; spaces, dashes, underscores and apostrophes are welcome.')}</span>${characterBuilderMarkup()}<p id="account-error" class="account-error" role="alert"></p><button class="primary-button" type="submit">${t('Start my adventure')} ${icon('arrow')}</button></form><button type="button" class="text-button" id="entry-login">${t('Already played? Log in with email')}</button>`);
    const form = document.querySelector<HTMLFormElement>('#name-entry-form')!;
    const input = document.querySelector<HTMLInputElement>('#entry-name')!;
    const getAvatar = bindCharacterBuilder(form, this.draft?.avatar ?? this.host.profile().avatar);
    if (!this.draft && !restoreName && !typed) getAvatar.applyPreset(selected);
    const sync = () => {
      const name = input.value.trim();
      input.setCustomValidity(/^[\p{L}\p{N}\p{M} _'-]{2,24}$/u.test(name) ? '' : t('Choose a name with 2–24 letters, numbers, spaces, dashes, underscores or apostrophes.'));
      form.querySelectorAll<HTMLButtonElement>('[data-suggested-name]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.suggestedName === name)));
    };
    input.addEventListener('input', sync);
    form.querySelectorAll<HTMLButtonElement>('[data-suggested-name]').forEach(button => { button.onclick = () => { input.value = button.dataset.suggestedName!; getAvatar.applyPreset(input.value); sync(); }; });
    const saveDraft = () => { this.draft = { name: input.value, avatar: getAvatar() }; };
    document.querySelector<HTMLButtonElement>('#entry-login')!.onclick = () => { saveDraft(); this.showLogin(); };
    document.querySelector<HTMLButtonElement>('#entry-languages')!.onclick = () => { saveDraft(); this.showLanguages(restoreName); };
    form.onsubmit = async event => {
      event.preventDefault(); sync(); if (!form.checkValidity()) return;
      const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
      button.disabled = true; button.textContent = t('Opening the town…');
      document.querySelector<HTMLButtonElement>('#entry-languages')!.disabled = true;
      document.querySelector<HTMLButtonElement>('#entry-login')!.disabled = true;
      try {
        const requestedSupport = baseLanguage();
        let result = await this.host.api.session(input.value.trim(), getAvatar(), this.target === 'en' ? 'en' : requestedSupport);
        if (this.target === 'en') {
          configureContentSession(() => this.host.api.token, { accountId: result.player.id, supportLanguage: baseLanguage() });
          const listing = await contentApi.courses<{ courses: import('./content-api').ContentCourse[] }>();
          const course = listing.courses.find(course => course.target === this.target);
          if (!course) throw new Error('This course is unavailable.');
          const activated = await contentApi.activate<{ player: WorldPlayer; progress: Progress; preferences: SessionResult['preferences']; activeCourseId: string }>(course.id, requestedSupport);
          result = { ...result, ...activated };
        }
        // Resuming a saved guest keeps its stored preference; apply the choice made on this screen.
        if (result.preferences.baseLanguage !== baseLanguage()) result = { ...result, preferences: await this.host.api.savePreferences({ baseLanguage: baseLanguage() }) };
        localStorage.setItem(`atlas.nameChosen.${result.player.id}`, 'true');
        if (this.fromZero) localStorage.setItem(`atlas.prologue.${result.player.id}`, 'true');
        if (await this.host.enterGame(result)) document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
      } catch (error) { this.host.access.showError(error); }
      finally {
        button.disabled = false; button.innerHTML = `${t('Start my adventure')} ${icon('arrow')}`;
        document.querySelector<HTMLButtonElement>('#entry-languages')!.disabled = false;
        document.querySelector<HTMLButtonElement>('#entry-login')!.disabled = false;
      }
    };
    sync();
  }
  showSaveAccount(required = this.host.clock.snapshot(performance.now())?.phase === 'login_required', subscribeAfter = false) {
    if (!this.host.started() || this.host.account().registered) return;
    const allowance = this.host.clock.snapshot(performance.now());
    if (allowance?.phase === 'free') required = false;
    this.host.access.showDialog(`<h2 id="account-title">${required ? 'Sign up to keep going.' : 'Save your adventure.'}</h2><p>${allowance?.phase === 'free' ? 'Keep your character and progress on every device. Playing is free with no time limit; creating an account is optional.' : required ? `Create a free account to keep your progress${(allowance?.playedSeconds ?? 0) < 7200 ? ` and play for ${Math.ceil((7200 - (allowance?.playedSeconds ?? 0)) / 60)} more minutes` : ', then choose a plan to continue'}. Or reset your game for another 2 free hours.` : `Keep your character and progress on every device. You get 2 free hours in total; ${formatAccessTime(Math.max(0, 7200 - (allowance?.playedSeconds ?? 0)))} remain in your trial.`}</p><div class="account-switch" role="group" aria-label="Account options"><button type="button" class="selected" aria-pressed="true">Sign up</button><button type="button" id="signup-login" aria-pressed="false">Log in</button></div><form id="save-account-form"><label class="form-label" for="account-email">${t('Email')}</label><input class="name-input" id="account-email" name="email" type="email" required maxlength="254" autocomplete="email"/><label class="form-label" for="account-password">${t('Choose a password')}</label><input class="name-input" id="account-password" name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password" aria-describedby="password-help"/><span id="password-help" class="caption">${t('Use 10–128 characters.')}</span><label class="form-label" for="account-password-confirm">${t('Confirm password')}</label><input class="name-input" id="account-password-confirm" type="password" required minlength="10" maxlength="128" autocomplete="new-password"/><p id="account-error" class="account-error" role="alert"></p><button class="primary-button" type="submit">Sign up &amp; keep my progress ${icon('check')}</button></form>${required ? '<p class="game-reset-note">Reset your game for 2 free hours as often as you like. Your progress is cleared and your character stays the same.</p><button type="button" class="text-button" id="guest-reset">Reset game &amp; play 2 hours free</button>' : '<button type="button" class="text-button" id="account-later">Back to my adventure</button>'}`, required);
    document.querySelector<HTMLButtonElement>('#signup-login')!.onclick = () => this.showLogin();
    if (allowance?.phase !== 'free' && pendingReferral(localStorage)) document.querySelector('#save-account-form')!.insertAdjacentHTML('beforebegin', '<p class="referral-status">Your signup gives the friend who invited you 90 extra minutes of free play.</p>');
    document.querySelector<HTMLButtonElement>('#guest-reset')?.addEventListener('click', this.host.access.showResetGame);

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
        const account = await this.host.api.register(document.querySelector<HTMLInputElement>('#account-email')!.value.trim(), password.value);
        this.host.accountChanged(account);
        password.value = ''; confirmation.value = '';
        if (!account.access) await this.host.api.access();
        if (!activeCourse) { location.reload(); return; }
        document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
        if (subscribeAfter) this.host.access.showPaywall();
        if (this.host.settingsOpen()) this.host.refresh();
        this.host.toast(t('Saved, {name}. Use your email and password to log in on another device.', { name: this.host.profile().name }));
      } catch (error) { this.host.access.showError(error); }
      finally { button.disabled = false; }
    };
  }
  showLogout() {
    this.host.access.showDialog(`<h2 id="account-title">${t('Log out?')}</h2><p>${this.host.account().registered ? t('Your adventure is saved. Log in with your email and password to continue later.') : t('This guest adventure has no email or password. If you log out, you cannot return to this character. Save your adventure first to keep your progress.')}</p><p id="account-error" class="account-error" role="alert"></p>${!this.host.account().registered ? `<button class="primary-button" id="logout-save">${t('Save my adventure')}</button>` : ''}<button class="${this.host.account().registered ? 'primary-button' : 'text-button'}" id="logout-confirm">${this.host.account().registered ? t('Log out') : t('Log out without saving')}</button><button class="text-button" id="logout-cancel">${t('Back to my adventure')}</button>`);
    document.querySelector<HTMLButtonElement>('#logout-save')?.addEventListener('click', () => this.showSaveAccount());
    const cancel = document.querySelector<HTMLButtonElement>('#logout-cancel')!;
    cancel.onclick = () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
    const button = document.querySelector<HTMLButtonElement>('#logout-confirm')!;
    button.onclick = async () => {
      button.disabled = true;
      cancel.disabled = true;
      try { await this.host.api.logout(); location.reload(); }
      catch { this.host.access.showError(new Error(t('Could not log out. Check your connection and try again.'))); button.disabled = false; cancel.disabled = false; }
    };
  }

  showLogin() {
    const required = this.host.started() && this.host.clock.snapshot(performance.now())?.phase === 'login_required';
    this.host.access.showDialog(`<h2 id="account-title">${t('Continue your adventure.')}</h2><p>${t('Use the email and password you saved to restore your name, character and progress.')}${this.host.started() ? ` ${t('Logging in opens the adventure linked to that email.')}` : ''}</p>${this.host.started() && !this.host.account().registered ? `<div class="account-switch" role="group" aria-label="Account options"><button type="button" id="login-signup" aria-pressed="false">Sign up</button><button type="button" class="selected" aria-pressed="true">Log in</button></div>` : ''}<form id="login-account-form"><label class="form-label" for="login-email">${t('Email')}</label><input class="name-input" id="login-email" type="email" required maxlength="254" autocomplete="username"/><label class="form-label" for="login-password">${t('Password')}</label><input class="name-input" id="login-password" type="password" required maxlength="128" autocomplete="current-password"/><p id="account-error" class="account-error" role="alert"></p><button class="primary-button" type="submit">${e(t('Log in & continue'))} ${icon('arrow')}</button></form>${required ? '<p class="game-reset-note">Signing up keeps this guest adventure. Logging in restores the adventure saved to that email.</p><button type="button" class="text-button" id="guest-reset">Reset game &amp; play 2 hours free</button>' : `<button class="text-button" id="login-back">${this.host.started() ? t('Back to my adventure') : this.language ? t('Back to choosing a name') : t('Back to choosing languages')}</button>`}`, required);
    document.querySelector<HTMLButtonElement>('#login-back')?.addEventListener('click', () => {
      if (this.host.started()) document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
      else if (this.language) this.showName(!!this.host.api.token);
      else this.showLanguages(!!this.host.api.token);
    });
    document.querySelector<HTMLButtonElement>('#login-signup')?.addEventListener('click', () => this.showSaveAccount(required));
    document.querySelector<HTMLButtonElement>('#guest-reset')?.addEventListener('click', this.host.access.showResetGame);
    const form = document.querySelector<HTMLFormElement>('#login-account-form')!;
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
      button.disabled = true;
      try {
        const result = await this.host.api.login(document.querySelector<HTMLInputElement>('#login-email')!.value.trim(), document.querySelector<HTMLInputElement>('#login-password')!.value);
        localStorage.setItem(`atlas.nameChosen.${result.player.id}`, 'true');
        if (this.fromZero) localStorage.setItem(`atlas.prologue.${result.player.id}`, 'true');
        // Restart the UI so in-flight learning responses cannot cross account owners.
        location.reload();
      } catch (error) { this.host.access.showError(error); button.disabled = false; }
    };
  }
}
