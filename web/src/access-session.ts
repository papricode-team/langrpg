import type { Api, AccountStatus, ConnectionStatus } from './api';
import { trackAnalytics } from './analytics-client';
import { brandMarkup } from './branding';
import type { ContentCourse } from './content-api';
import { accessBlocked, billingURL, clearGameProgress, formatAccessTime, formatOfferPrice, type AccessClock, type BillingOffer, type BillingPlan, type GameAccess } from './game-access';
import { t } from './i18n';
import { escapeHtml as e, icon } from './icons';
import { referralAvailable } from './referrals';

/** Paywall wording for each plan; the price comes from the server. */
const planCopy: Record<BillingPlan, { name: string; per: string; detail: string; action: string }> = {
  monthly: { name: 'Monthly', per: '/ month', detail: 'Billed monthly. Cancel anytime.', action: 'Subscribe monthly' },
  yearly: { name: 'Yearly', per: '/ year', detail: 'Billed yearly. Cancel anytime.', action: 'Subscribe yearly' },
  lifetime: { name: 'Lifetime', per: 'once', detail: 'One payment. Unlimited play.', action: 'Get lifetime access' },
};

/** What the access, billing and account dialogs need from the page; main.ts provides it. */
export interface AccessHost {
  api: Api;
  clock: AccessClock;
  /** Development UI previews never meter play or talk to billing. */
  uiCheck: boolean;
  started(): boolean;
  connection(): ConnectionStatus;
  account(): AccountStatus;
  activeCourse(): Pick<ContentCourse, 'target'> | undefined;
  toast(message: string, bad?: boolean): void;
  syncWorldMode(): void;
  showSaveAccount(required?: boolean, subscribeAfter?: boolean): void;
  /** The account dialog is about to cover play: pause activities, rounds and speech. */
  pauseForAccount(): void;
  /** The account dialog was shown or replaced. */
  accountShown(): void;
  /** A game reset is committed: dispose every running activity before progress is cleared. */
  discardPlay(): void;
}

/**
 * Metered play and billing: the active-play heartbeat, the access HUD, the access wall, the paywall, payment
 * confirmation, invites and the shared account dialog. Moved out of main.ts unchanged in behaviour.
 */
export class AccessSession {
  private heartbeatBusy = false;
  private heartbeatAt = 0;
  private pendingHeartbeat: boolean | undefined;
  private wasActive = false;
  /** A closed world socket releases the server's active-play lease; play opens it again. */
  connectionPaused = false;
  private resetting = false;
  private billingTimer: number | undefined;
  private billingRevision = 0;
  private referralRevision = 0;
  private offersRevision = 0;

  constructor(private readonly host: AccessHost) {}

  /** A course in another target language meters play without the German world's connection lease. */
  private otherCourse(): boolean { const target = this.host.activeCourse()?.target; return !!target && target !== 'de'; }
  /** Ten seconds since the last heartbeat: time for the next one. */
  heartbeatDue(now: number): boolean { return now - this.heartbeatAt >= 10000; }
  destroy(): void { if (this.billingTimer !== undefined) clearTimeout(this.billingTimer); }

  readonly isActive = (): boolean => {
    return this.host.started() && !document.hidden && this.host.connection() === 'online' && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open && !accessBlocked(this.host.clock.snapshot(performance.now()));
  };
  readonly sendHeartbeat = async (active: boolean): Promise<void> => {
    if (this.host.uiCheck || !this.host.started() || this.otherCourse()) return;
    if (this.heartbeatBusy) { this.pendingHeartbeat = active; return; }
    this.heartbeatBusy = true;
    this.heartbeatAt = performance.now();
    try { await this.host.api.accessHeartbeat(active); }
    catch { /* Keep the last server allowance; the local boundary still blocks play. */ }
    finally {
      this.heartbeatBusy = false;
      const pending = this.pendingHeartbeat;
      this.pendingHeartbeat = undefined;
      if (pending !== undefined && pending !== active) void this.sendHeartbeat(pending);
    }
  };
  readonly syncActivity = (): void => {
    if (this.host.uiCheck || !this.host.started() || this.resetting) return;
    if (this.otherCourse()) {
      this.host.clock.setActive(!document.hidden && !document.querySelector<HTMLDialogElement>('#account-dialog')!.open && !accessBlocked(this.host.clock.snapshot(performance.now())), performance.now());
      return;
    }
    const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
    const paused = document.hidden || dialog.open || accessBlocked(this.host.clock.snapshot(performance.now()));
    // A closed world socket releases the server's active-play lease.
    if (paused && !this.connectionPaused) { this.connectionPaused = true; this.host.api.destroy(); }
    else if (!paused && this.connectionPaused) { this.connectionPaused = false; this.host.api.connect(); }
    const active = this.isActive();
    this.host.clock.setActive(active, performance.now());
    if (active !== this.wasActive) { this.wasActive = active; void this.sendHeartbeat(active); }
  };
  readonly updateHud = (): void => {
    const hud = document.querySelector<HTMLElement>('#access-hud');
    if (!hud) return;
    const access = this.host.clock.snapshot(performance.now());
    const paid = access?.phase === 'paid';
    hud.hidden = !this.host.started() || !access || paid || access.phase === 'free' || (!referralAvailable(access) && access.remainingSeconds > 60);
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
  };
  readonly apply = (access: GameAccess): void => {
    const previousBonus = this.host.clock.snapshot(performance.now())?.referralBonusSeconds ?? 0;
    this.host.clock.update(access, performance.now());
    this.updateHud();
    if (this.host.uiCheck || !this.host.started() || this.resetting) return;
    if ((access.referralBonusSeconds ?? 0) > previousBonus) this.host.toast(`${Math.floor(((access.referralBonusSeconds ?? 0) - previousBonus) / 60)} extra minutes added. Your friend signed up!`);

    const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
    if (!accessBlocked(access) && dialog.open && dialog.dataset.accessWall === 'required') dialog.close();
    this.enforceWall(); this.syncActivity(); this.host.syncWorldMode();
  };
  readonly enforceWall = (): void => {
    if (!this.host.started()) return;
    const access = this.host.clock.snapshot(performance.now());
    if (!accessBlocked(access)) return;
    const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
    if (dialog.open && dialog.dataset.accessWall === 'required' && dialog.dataset.accessPhase === (access?.phase ?? 'checking')) return;
    if (access?.phase === 'payment_required') this.showPaywall(true);
    else if (access?.phase === 'login_required') this.host.showSaveAccount(true);
    else {
      this.showDialog(`<h2 id="account-title">Checking your play time…</h2><p>Your adventure will continue when your saved allowance is confirmed.</p><p id="account-error" class="account-error" role="alert"></p><button type="button" class="primary-button" id="access-retry">Try again</button>`, true);
      document.querySelector<HTMLButtonElement>('#access-retry')!.onclick = () => { void this.host.api.access().catch(this.showError); };
      void this.host.api.access().catch(this.showError);
    }
  };
  readonly showResetGame = (): void => {
    const access = this.host.clock.snapshot(performance.now());
    const required = accessBlocked(access);
    const free = access?.phase === 'free';
    this.showDialog(`<h2 id="account-title">Reset your game?</h2><p>Starting over deletes all quests, XP, learned words, practice results and story saves. Your character, account and any paid access stay the same. ${free ? 'You return to the beginning with unlimited free play.' : 'You return to the beginning with 2 free hours.'}</p>${free ? '' : '<p>You can start over for another 2 hours as often as you like.</p>'}<p id="account-error" class="account-error" role="alert"></p><button type="button" class="primary-button reset-progress-button" id="game-reset-confirm">${free ? 'Reset game' : 'Reset game &amp; play 2 hours'}</button><button type="button" class="text-button" id="game-reset-back">Keep my progress</button>`, required);
    document.querySelector<HTMLButtonElement>('#game-reset-back')!.onclick = () => {
      if (!required) document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
      else if (this.host.account().registered) this.showPaywall(true);
      else this.host.showSaveAccount(true);
    };
    document.querySelector<HTMLButtonElement>('#game-reset-confirm')!.onclick = async event => {
      const button = event.currentTarget as HTMLButtonElement;
      const back = document.querySelector<HTMLButtonElement>('#game-reset-back')!;
      button.disabled = true; back.disabled = true;
      try {
        this.resetting = true;
        this.host.api.destroy();
        const result = await this.host.api.resetGame();
        // Activity destruction persists its draft, so dispose it before clearing.
        this.host.discardPlay();
        clearGameProgress(localStorage, result.player.id, result.player.name);
        location.reload();
      } catch (error) { this.resetting = false; this.showError(error); button.disabled = false; back.disabled = false; }
    };
  };
  readonly showInviteFriend = async (): Promise<void> => {
    if (!referralAvailable(this.host.clock.snapshot(performance.now()))) return;
    const owner = this.host.api.selfId;
    const revision = ++this.referralRevision;
    const back = '<button type="button" class="billing-secondary-button" id="referral-back">Back to my adventure</button>';
    this.showDialog(`<div id="referral-panel"><h2 id="account-title">Invite a friend. Get 90 minutes.</h2><p>When a new friend signs up through your link, you get 90 extra minutes of free play. Up to 3 friends a day and 10 in total count, and the bonus adds to your remaining time.</p><p role="status">Getting your invite link…</p><p id="account-error" class="account-error" role="alert"></p>${back}</div>`);
    const bindBack = () => { document.querySelector<HTMLButtonElement>('#referral-back')!.onclick = () => { this.referralRevision++; document.querySelector<HTMLDialogElement>('#account-dialog')!.close(); }; };
    bindBack();
    try {
      const result = await this.host.api.referralLink();
      const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
      if (revision !== this.referralRevision || owner !== this.host.api.selfId || !dialog.open || !dialog.querySelector('#referral-panel')) return;
      const url = new URL(result.url);
      if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Your invite link could not load. Please try again.');
      this.showDialog(`<div id="referral-panel"><h2 id="account-title">Invite a friend. Get 90 minutes.</h2><p>Send your link to a friend. When they create a new account, you get 90 extra minutes of free play—even if your trial has ended by then. Up to 3 friends a day and 10 in total count.</p><label class="form-label" for="referral-url">Your invite link</label><input class="name-input referral-url" id="referral-url" readonly value="${e(url.href)}"/><button type="button" class="primary-button" id="referral-copy">Copy invite link ${icon('check')}</button><p class="referral-status" id="referral-count" role="status"></p><p class="referral-status" id="referral-copy-status" role="status"></p><p id="account-error" class="account-error" role="alert"></p>${back}</div>`);
      bindBack(); this.updateHud();
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
      if (revision === this.referralRevision && owner === this.host.api.selfId && document.querySelector('#referral-panel')) this.showError(error);
    }
  };
  readonly showFreeAccess = (): void => {
    this.showDialog(`<h2 id="account-title">Enjoy unlimited free play.</h2><p>Your adventure is free to play. There are no time limits or subscriptions.</p><button type="button" class="primary-button" id="free-access-back">Back to my adventure</button>`);
    document.querySelector<HTMLButtonElement>('#free-access-back')!.onclick = () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
  };
  readonly showPaywall = (required = this.host.clock.snapshot(performance.now())?.phase === 'payment_required', notice = ''): void => {
    const access = this.host.clock.snapshot(performance.now());
    if (access?.phase === 'free') { this.showFreeAccess(); return; }
    if (!access?.registered) { this.host.showSaveAccount(access?.phase === 'login_required', true); return; }
    if (access.phase === 'paid') { this.showBillingAccount(); return; }
    trackAnalytics('paywall_viewed', required ? 'required' : 'optional');
    const revision = ++this.offersRevision;
    this.showDialog(`<h2 id="account-title">${required ? 'Your free trial is complete.' : 'Keep your adventure going.'}</h2><p>${required ? 'Your free play time is used up. Choose a plan to continue from exactly where you left off, or reset your game for another 2 free hours.' : 'Subscribe now for unlimited play and keep every step of your adventure.'}</p><div class="billing-plans" id="billing-plans" aria-busy="true"><p role="status">Loading plans…</p></div><span class="billing-note">Prices include tax. Secure checkout with Creem.</span>${!access.billingAvailable ? '<p class="billing-unavailable">Payments are being set up. Your progress is saved; check again shortly.</p>' : ''}<p class="game-reset-note">Start fresh as often as you like. Resetting clears your game progress.</p><button type="button" class="billing-secondary-button" id="billing-reset">Reset game &amp; play 2 hours free</button><p id="account-error" class="account-error" role="alert">${e(notice)}</p><button type="button" class="billing-secondary-button" id="billing-check">Already paid? Check payment status</button>${required ? '' : '<button type="button" class="billing-secondary-button" id="billing-back">Back to my free trial</button>'}`, required);

    document.querySelector('#account-dialog')!.classList.add('billing-dialog');
    document.querySelector<HTMLButtonElement>('#billing-reset')!.addEventListener('click', this.showResetGame);
    document.querySelector<HTMLButtonElement>('#billing-back')?.addEventListener('click', () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close());
    document.querySelector<HTMLButtonElement>('#billing-check')!.onclick = () => void this.verifyBilling();
    void this.loadOffers(revision, access.billingAvailable);
  };
  /** Fill the paywall with the plans and prices the server reads from Creem. */
  private readonly loadOffers = async (revision: number, available: boolean): Promise<void> => {
    let offers: BillingOffer[] | undefined;
    try { offers = available ? (await this.host.api.billingOffers()).offers : []; } catch { offers = undefined; }
    const container = document.querySelector<HTMLElement>('#billing-plans');
    if (revision !== this.offersRevision || !container) return;
    container.removeAttribute('aria-busy');
    if (!offers) {
      container.innerHTML = '<p role="status">Plans could not load.</p><button type="button" class="billing-secondary-button" id="billing-offers-retry">Try again</button>';
      document.querySelector<HTMLButtonElement>('#billing-offers-retry')!.onclick = () => { container.innerHTML = '<p role="status">Loading plans…</p>'; void this.loadOffers(revision, available); };
      return;
    }
    if (!offers.length) { container.innerHTML = ''; return; }
    container.innerHTML = offers.filter(offer => planCopy[offer.plan]).map(offer => {
      const copy = planCopy[offer.plan], price = formatOfferPrice(offer);
      return `<button type="button" class="billing-plan${offer.plan === 'lifetime' ? ' billing-plan-lifetime' : ''}" data-billing-plan="${e(offer.plan)}"><span>${copy.name}</span><strong>${price ? `${e(price)}<span class="caption">${copy.per}</span>` : '<span class="caption">Price shown at checkout</span>'}</strong><p>${copy.detail}</p><b>${copy.action} ${icon('arrow')}</b></button>`;
    }).join('');
    container.querySelectorAll<HTMLButtonElement>('[data-billing-plan]').forEach(button => { button.onclick = async () => {
      const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-billing-plan]')];
      buttons.forEach(item => { item.disabled = true; });
      try { const result = await this.host.api.checkout(button.dataset.billingPlan as BillingPlan); location.assign(billingURL(result.url)); }
      catch (error) { this.showError(error); buttons.forEach(item => { item.disabled = false; }); }
    }; });
  };
  readonly verifyBilling = async (attempt = 0, revision = ++this.billingRevision): Promise<void> => {
    if (this.billingTimer !== undefined) clearTimeout(this.billingTimer);
    const access = this.host.clock.snapshot(performance.now());
    if (access?.phase === 'free') { this.showFreeAccess(); return; }
    if (attempt === 0) this.showDialog(`<h2 id="account-title">Confirming your payment…</h2><p role="status">We’re checking your payment with Creem. Your progress is saved.</p><p id="account-error" class="account-error" role="alert"></p><button type="button" class="billing-secondary-button" id="billing-verification-back">${accessBlocked(access) ? 'Back to plans' : 'Back to my adventure'}</button>`, accessBlocked(access));
    document.querySelector<HTMLButtonElement>('#billing-verification-back')!.onclick = () => {
      this.billingRevision++;
      if (this.billingTimer !== undefined) clearTimeout(this.billingTimer);
      this.billingTimer = undefined;
      if (accessBlocked(this.host.clock.snapshot(performance.now()))) this.showPaywall();
      else document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
    };
    try {
      const result = await this.host.api.syncBilling();
      if (revision !== this.billingRevision) return;
      if (result.access.phase === 'paid') {
        document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
        this.host.toast('Payment confirmed. Your adventure is ready to continue.');
        if (!this.host.activeCourse()) location.reload();
        return;
      }
      if (attempt < 11) { this.billingTimer = window.setTimeout(() => void this.verifyBilling(attempt + 1, revision), 2500); return; }
      this.showPaywall(undefined, 'Your payment is still processing. Check payment status again in a moment.');
    } catch (error) { if (revision === this.billingRevision) this.showPaywall(undefined, error instanceof Error ? error.message : 'Could not check payment. Please try again.'); }
  };
  readonly showBillingAccount = (): void => {
    const access = this.host.clock.snapshot(performance.now());
    if (access?.plan === 'complimentary') {
      this.showDialog('<h2 id="account-title">Complimentary access is active.</h2><p>Your account has unlimited play through a support grant. Contact support for details about its duration.</p><button type="button" class="primary-button" id="complimentary-back">Back to my adventure</button>');
      document.querySelector<HTMLButtonElement>('#complimentary-back')!.onclick = () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
      return;
    }
    this.showDialog(`<h2 id="account-title">${access?.plan === 'lifetime' ? 'Lifetime access is yours.' : 'Your subscription is active.'}</h2><p>Enjoy unlimited play. Manage your ${access?.plan === 'lifetime' ? 'purchase and receipts' : 'subscription, payment details and cancellation'} securely with Creem.</p><p id="account-error" class="account-error" role="alert"></p><button type="button" class="primary-button" id="billing-portal">Open billing portal ${icon('arrow')}</button><button type="button" class="billing-secondary-button" id="billing-account-back">Back to my adventure</button>`);
    document.querySelector<HTMLButtonElement>('#billing-account-back')!.onclick = () => document.querySelector<HTMLDialogElement>('#account-dialog')!.close();
    document.querySelector<HTMLButtonElement>('#billing-portal')!.onclick = async event => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try { const result = await this.host.api.billingPortal(); location.assign(billingURL(result.url)); }
      catch (error) { this.showError(error); button.disabled = false; }
    };
  };
  readonly showDialog = (html: string, required = false) => {
    if (this.host.account().admin) html += '<a class="text-button" href="/admin.html" target="_blank" rel="noopener">Open Admin</a>';
    const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
    if(!dialog.open)this.host.pauseForAccount();
    dialog.innerHTML = brandMarkup + html;
    dialog.dataset.accessWall = required ? 'required' : '';
    dialog.dataset.accessPhase = required ? this.host.clock.snapshot(performance.now())?.phase ?? 'checking' : '';
    dialog.classList.remove('billing-dialog');
    if (!dialog.open) dialog.showModal();
    this.syncActivity();
    this.host.syncWorldMode();
    this.host.accountShown();
  };
  readonly showError = (error: unknown) => {
    if (import.meta.env.DEV) console.error(error);
    document.querySelector<HTMLElement>('#account-error')!.textContent = error instanceof Error ? error.message : t('Please try again.');
  };
}
