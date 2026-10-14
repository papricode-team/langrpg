/** Small, first-party telemetry. Never observes clicks, text fields, lesson answers or URL paths. */
type BrowserEventName = 'session_started' | 'page_view' | 'paywall_viewed' | 'client_error';
interface BrowserEvent { id: string; name: BrowserEventName; visitor: string; session: string; source: string; campaign: string; device: string; detail: string; }
const VISITOR_KEY = 'glotworld.analytics.visitor';
const SESSION_KEY = 'glotworld.analytics.session';
const OPT_OUT_KEY = 'glotworld.analytics.disabled';
let memoryOptOut = false;
const SESSION_MS = 30 * 60 * 1000;
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const idValid = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(value);

export function acquisitionContext(href: string, referrer: string): { source: string; campaign: string } {
  const safe = (value: string | null) => value && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(value) ? value.toLowerCase() : '';
  try {
    const url = new URL(href);
    let source = safe(url.searchParams.get('utm_source'));
    if (!source && url.searchParams.has('ref')) source = 'referral';
    if (!source && referrer) {
      const origin = new URL(referrer);
      if (origin.hostname !== url.hostname) source = safe(origin.hostname.replace(/^www\./, ''));
    }
    return { source: source || 'direct', campaign: safe(url.searchParams.get('utm_campaign')) };
  } catch { return { source: 'direct', campaign: '' }; }
}

export class AnalyticsClient {
  private visitor = '';
  private session = '';
  private touched = 0;
  private queue: BrowserEvent[] = [];
  private sending = false;
  private disabled = false;
  private retryCount = 0;
  private generation = 0;
  private dedupe = new Set<string>();
  private acquisition: { source: string; campaign: string };
  private device: string;
  constructor(private readonly token: () => string) {
    this.acquisition = acquisitionContext(location.href, document.referrer);
    this.device = /iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
    try {
      const stored = JSON.parse(localStorage.getItem(VISITOR_KEY) ?? 'null');
      if (idValid(stored?.id) && Date.now() - stored.at < RETENTION_MS) this.visitor = stored.id;
    } catch { /* Storage is optional. */ }
  }
  private allowed(): boolean {
    if (this.disabled || memoryOptOut || navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return false;
    try { return localStorage.getItem(OPT_OUT_KEY) !== 'true'; } catch { return true; }
  }
  private identity(): boolean {
    if (!this.allowed()) return false;
    const now = Date.now();
    if (!this.visitor) {
      this.visitor = crypto.randomUUID();
      try { localStorage.setItem(VISITOR_KEY, JSON.stringify({ id: this.visitor, at: now })); } catch { /* Use an in-memory visitor. */ }
    }
    if (!this.session) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
        if (idValid(stored?.id) && now - stored.at < SESSION_MS) {
          this.session = stored.id; this.touched = stored.at;
          if (typeof stored.source === 'string' && typeof stored.campaign === 'string') this.acquisition = { source: stored.source, campaign: stored.campaign };
        }
      } catch { /* Private browsing still works. */ }
    }
    if (!this.session || now - this.touched >= SESSION_MS) {
      this.session = crypto.randomUUID(); this.dedupe.clear(); this.retryCount = 0;
      this.queue.push(this.event('session_started', ''));
    }
    this.touched = now;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: this.session, at: now, ...this.acquisition })); } catch { /* In-memory fallback. */ }
    return true;
  }
  private event(name: BrowserEventName, detail: string): BrowserEvent {
    return { id: crypto.randomUUID(), name, visitor: this.visitor, session: this.session, ...this.acquisition, device: this.device, detail };
  }
  headers(): Record<string, string> {
    if (!this.identity()) return {};
    return { 'X-Analytics-Visitor': this.visitor, 'X-Analytics-Session': this.session };
  }
  track(name: BrowserEventName, detail = ''): void {
    if (!this.identity()) return;
    const key = `${name}:${detail}`;
    if (this.dedupe.has(key)) return;
    this.dedupe.add(key);
    if (this.queue.length < 24) this.queue.push(this.event(name, detail));
  }
  setAdmin(admin: boolean): void {
    this.disabled = admin;
    if (admin) this.queue = [];
  }
  rotate(): void {
    // Never send an old account's pending events under a new login.
    this.generation++;
    this.queue = []; this.session = ''; this.dedupe.clear(); this.disabled = false;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Optional storage. */ }
  }
  forgetIdentity(): void {
    const admin = this.disabled; this.rotate(); this.visitor = ''; this.disabled = admin;
  }
  async flush(): Promise<void> {
    if (this.sending || !this.queue.length || !this.allowed()) return;
    this.sending = true;
    const events = this.queue.splice(0, 12), token = this.token(), generation = this.generation;
    try {
      const response = await fetch('/api/analytics/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ events }), keepalive: true, signal: AbortSignal.timeout(5000),
      });
      if (response.status === 429 || response.status >= 500) throw new Error('Retry telemetry');
      this.retryCount = 0;
    } catch {
      // Same IDs make a retry safe after a response is lost. Bound retries and memory.
      if (++this.retryCount <= 3 && this.token() === token && generation === this.generation) this.queue = [...events, ...this.queue].slice(0, 24);
    } finally { this.sending = false; }
  }
}

let client: AnalyticsClient | undefined;
export const analyticsHeaders = (): Record<string, string> => {
  try { return client?.headers() ?? {}; } catch { return {}; }
};
export const trackAnalytics = (name: BrowserEventName, detail = ''): void => {
  try { client?.track(name, detail); } catch { /* Telemetry cannot prevent play. */ }
};
export const analyticsAdmin = (admin: boolean): void => client?.setAdmin(admin);
export const rotateAnalytics = (): void => client?.rotate();
export function startAnalytics(token: () => string): () => void {
  let instance: AnalyticsClient;
  try { instance = new AnalyticsClient(token); client = instance; instance.track('page_view', 'entry'); }
  catch { client = undefined; return () => {}; }
  const flush = () => { void instance.flush(); };
  const timer = window.setInterval(flush, 5000);
  const hide = () => { if (document.hidden) flush(); };
  const error = () => instance.track('client_error', 'runtime');
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('pagehide', flush);
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', error);
  return () => {
    window.clearInterval(timer); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', flush);
    window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', error); client = undefined;
  };
}

export function browserAnalyticsEnabled(): boolean {
  try { return !memoryOptOut && localStorage.getItem(OPT_OUT_KEY) !== 'true'; } catch { return !memoryOptOut; }
}
export function setBrowserAnalyticsEnabled(enabled: boolean): void {
  memoryOptOut = !enabled;
  try {
    localStorage.setItem(OPT_OUT_KEY, String(!enabled));
    if (!enabled) { localStorage.removeItem(VISITOR_KEY); sessionStorage.removeItem(SESSION_KEY); }
  } catch { /* Browsers may restrict persistence. */ }
  client?.forgetIdentity();
}
