import { escapeHtml as escape } from './icons';

export interface Metrics {
  visitors: number; sessions: number; newPlayers: number; registrations: number; activated: number; activeLearners: number;
  attempts: number; correct: number; completions: number; paywallViewers: number; checkoutUsers: number; newCustomers: number; errors: number;
}
interface Retention { day: number; eligible: number; returned: number; rate: number | null; }
interface Breakdown { label: string; visitors: number; players: number; activated: number; customers: number; }
export interface AnalyticsReport {
  generatedAt: string; from: string; to: string; previousFrom: string; days: number; retentionDays: number; firstEventAt: string | null; billingMode: string;
  current: Metrics; previous: Metrics; daily: (Metrics & { date: string })[];
  sources: Breakdown[]; campaigns: Breakdown[]; devices: Breakdown[];
  funnel: { label: string; users: number; rate: number | null }[]; retention: Retention[];
  cohorts: { week: string; learners: number; retention: Retention[] }[];
  events: { name: string; detail: string; count: number; users: number; correct: number }[];
  recent: { player: string; event: string; at: string }[];
  customers: { registered: number; everPaid: number; monthly: number; yearly: number; lifetime: number; stale: number; expired: number };
}
const number = (value: number) => new Intl.NumberFormat('en').format(value);
const rate = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
const date = (value: string) => new Date(value).toLocaleDateString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const labels: Record<string, string> = {
  session_started: 'Browser sessions', page_view: 'Page views', game_started: 'Adventure sessions', learning_attempt: 'Exercise answers',
  unit_completed: 'Units completed', quest_completed: 'Quests completed', activity_completed: 'Activities completed',
  paywall_viewed: 'Paywall views', checkout_started: 'Checkout created', checkout_failed: 'Checkout failures', client_error: 'Browser issues',
};
export function metricChange(current: number, previous: number): string {
  if (!previous) return current ? 'New in this period' : 'No change';
  const change = (current - previous) / previous * 100;
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs previous period`;
}
function card(label: string, value: number, previous: number, note: string): string {
  return `<article class="metric-card"><span>${label}</span><strong>${number(value)}</strong><p class="metric-change">${metricChange(value, previous)}</p><span class="secondary-value">${note}</span></article>`;
}
function table(headers: string[], rows: string[][], empty: string): string {
  return `<div class="table-scroll"><table><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map((cell, i) => i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="empty-cell">${empty}</td></tr>`}</tbody></table></div>`;
}
function breakdown(rows: Breakdown[]): string {
  return table(['Source', 'Visitors', 'New players', 'Activated', 'Customers'], rows.map(row => [escape(row.label), number(row.visitors), number(row.players), number(row.activated), number(row.customers)]), 'Acquisition data will appear after the first visit.');
}
export type ChartMetric = 'activeLearners' | 'visitors' | 'newCustomers' | 'attempts';
export function chartMarkup(report: AnalyticsReport, metric: ChartMetric): string {
  const max = Math.max(1, ...report.daily.map(day => day[metric]));
  const width = 960, height = 200, step = width / Math.max(1, report.daily.length);
  return `<div class="trend-chart"><div class="chart-scale"><span>${number(max)}</span><span>${number(Math.round(max / 2))}</span><span>0</span></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily ${metric.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)}; exact values in the table below"><path d="M0 1H960 M0 100H960 M0 199H960" class="chart-grid"/>${report.daily.map((day, i) => {
    const bar = day[metric] / max * 180;
    return `<rect x="${i * step + step * .18}" y="${height - bar}" width="${step * .64}" height="${bar}" rx="3"><title>${date(day.date)}: ${number(day[metric])}</title></rect>`;
  }).join('')}</svg></div><div class="chart-dates"><span>${date(report.daily[0]?.date ?? report.from)}</span><span>${date(report.to)} · today is partial</span></div>`;
}
export function renderAnalytics(report: AnalyticsReport): string {
  const c = report.current, p = report.previous, customers = report.customers;
  const activePaid = customers.monthly + customers.yearly + customers.lifetime;
  const goal = Math.min(100, customers.everPaid / 10);
  const coverage = report.firstEventAt ? `Earliest retained event: ${date(report.firstEventAt)}. Browser metrics can be lower when tracking is blocked.` : 'No activity recorded yet. Your first real visitor will start filling this dashboard.';
  return `<section class="overview" id="overview"><div class="section-heading"><div><h1>Know what makes learners stay.</h1><p>From a first visit to a lasting learning habit.</p></div><span class="environment">${report.billingMode === 'production' ? 'Live billing' : report.billingMode === 'sandbox' ? 'Sandbox billing · test payments' : 'Billing not configured'}</span></div>
    <div class="goal-card"><div><span>Customers acquired since analytics began</span><strong>${number(customers.everPaid)} <span class="secondary-value">/ 1,000</span></strong></div><div class="goal-track"><progress value="${Math.min(1000, customers.everPaid)}" max="1000" aria-label="Progress toward 1,000 customers"></progress><span>${goal.toFixed(1)}% of the first chapter · ${number(Math.max(0, 1000 - customers.everPaid))} to go</span></div><div class="goal-aside"><b>${number(customers.registered)}</b><span>saved accounts · all time</span></div></div>
    <div class="metric-grid">${card('Unique visitors', c.visitors, p.visitors, `${number(c.sessions)} browser sessions`)}${card('New adventures', c.newPlayers, p.newPlayers, `${number(c.registrations)} accounts saved`)}${card('Active learners', c.activeLearners, p.activeLearners, `${number(c.activated)} first observed learners`)}${card('New customers', c.newCustomers, p.newCustomers, 'First server-verified paid access')}</div>
    <p class="data-note">${escape(coverage)} All dates use UTC. Previous period includes full days.</p>
    <article class="panel"><div class="panel-heading"><div><h2>Activity over time</h2><p>Are more people arriving, learning, and paying?</p></div><label class="select-label">Show <select id="chart-metric"><option value="activeLearners">Active learners</option><option value="visitors">Visitors</option><option value="newCustomers">New customers</option><option value="attempts">Exercise answers</option></select></label></div><div id="trend">${chartMarkup(report, 'activeLearners')}</div><details><summary>View daily numbers</summary>${table(['Date (UTC)', 'Visitors', 'Sessions', 'New players', 'Learners', 'Answers', 'New customers'], report.daily.map(day => [escape(day.date), number(day.visitors), number(day.sessions), number(day.newPlayers), number(day.activeLearners), number(day.attempts), number(day.newCustomers)]), 'No daily data yet.')}</details></article></section>
    <section id="conversion"><div class="section-heading"><div><h2>Where the journey slows down</h2></div></div><div class="two-columns"><article class="panel"><div class="panel-heading"><div><h3>New-player funnel</h3><p>Players created in this period. Steps must occur in this order, before the period ends.</p></div></div><ol class="funnel">${report.funnel.map((step, i) => `<li><div><span><b>${i + 1}</b>${escape(step.label)}</span><strong>${number(step.users)} <span class="secondary-value">${rate(step.rate)}</span></strong></div><div class="funnel-track"><span style="width:${Math.min(100, step.rate ?? 0)}%"></span></div>${i > 0 ? `<span class="secondary-value">${number(Math.max(0, report.funnel[i - 1].users - step.users))} have not reached this step</span>` : ''}</li>`).join('')}</ol><p class="data-note">A player who pays before learning is counted in customer totals, but not in this ordered funnel.</p></article>
    <article class="panel"><div class="panel-heading"><div><h3>Learning & checkout health</h3><p>Activity from all players in the selected period.</p></div></div><dl class="health-list"><div><dt>Exercise answers</dt><dd>${number(c.attempts)}</dd></div><div><dt>Answer accuracy</dt><dd>${rate(c.attempts ? c.correct / c.attempts * 100 : null)}</dd></div><div><dt>Units, quests & activities completed</dt><dd>${number(c.completions)}</dd></div><div><dt>People who saw a paywall</dt><dd>${number(c.paywallViewers)}</dd></div><div><dt>Players who opened checkout</dt><dd>${number(c.checkoutUsers)}</dd></div><div><dt>Reported browser & checkout issues</dt><dd>${number(c.errors)}</dd></div></dl><p class="data-note">Browser issues are counted once per issue category per session; the event table shows the breakdown.</p></article></div></section>
    <section id="retention"><div class="section-heading"><div><h2>Do learners come back?</h2><p>Return means answering another exercise on exactly day 1, 7, or 30 after first observed learning.</p></div></div><div class="retention-grid">${report.retention.map(row => `<article class="panel retention-card"><span>Day ${row.day} return rate</span><strong>${rate(row.rate)}</strong><p>${row.eligible ? `${number(row.returned)} of ${number(row.eligible)} eligible learners` : 'Waiting for this cohort to mature'}</p></article>`).join('')}</div><article class="panel"><h3>Weekly learning cohorts</h3><p class="data-note">Only learners activated in the selected period. Today’s incomplete return window is excluded. A dash means no eligible learners.</p>${table(['Week of (UTC)', 'Learners', 'Day 1', 'Day 7', 'Day 30'], report.cohorts.map(row => [escape(row.week), number(row.learners), ...row.retention.map(ret => `<span class="retention-cell" style="--retention:${(ret.rate ?? 0) / 100}">${rate(ret.rate)}<span class="secondary-value">${ret.returned} / ${ret.eligible}</span></span>`)]), 'Cohorts appear after the first exercise is answered.')}</article></section>
    <section id="acquisition"><div class="section-heading"><div><h2>Find your best starting points</h2><p>Visitor counts by session source. New-player outcomes use the first observed session at account creation.</p></div></div><article class="panel"><div class="panel-heading"><h3>Traffic & customer sources</h3><label class="select-label">Group by <select id="acquisition-dimension"><option value="sources">Source / referrer</option><option value="campaigns">UTM campaign</option><option value="devices">Device</option></select></label></div><div id="acquisition-table">${breakdown(report.sources)}</div><p class="data-note">A visitor can appear in multiple sources. “Unknown” means there is no attributable browser session.</p></article></section>
    <section id="customers"><div class="section-heading"><div><h2>A clear view of paid access</h2><p>Current server-verified access, independent of the selected date range.</p></div></div><div class="customer-grid"><article class="panel"><span>Verified paid customers</span><strong class="big-number">${number(activePaid)}</strong><p class="data-note">Verified within 24 hours and still entitled to play.</p></article><article class="panel"><h3>Plans</h3><dl class="health-list"><div><dt>Monthly</dt><dd>${number(customers.monthly)}</dd></div><div><dt>Yearly</dt><dd>${number(customers.yearly)}</dd></div><div><dt>Lifetime</dt><dd>${number(customers.lifetime)}</dd></div></dl></article><article class="panel"><h3>Billing visibility</h3><dl class="health-list"><div><dt>Awaiting fresh verification</dt><dd>${number(customers.stale)}</dd></div><div><dt>Stored subscription period ended</dt><dd>${number(customers.expired)}</dd></div></dl><p class="data-note">These are not churn or refund counts. Dashboard reads never trigger billing-provider calls. Revenue is omitted until a complete payment ledger exists.</p></article></div></section>
    <section id="events"><div class="section-heading"><div><h2>The useful details</h2></div></div><article class="panel"><h3>Event breakdown</h3>${table(['Event', 'Context', 'Events', 'People', 'Accuracy'], report.events.map(row => [escape(labels[row.name] ?? row.name), escape(row.detail || '—'), number(row.count), number(row.users), row.name === 'learning_attempt' ? rate(row.count ? row.correct / row.count * 100 : null) : '—']), 'Events will appear as visitors use Glotworld.')}</article><article class="panel"><h3>Recent milestones</h3><p class="data-note">Latest 30 milestones in this period. Player references are pseudonymous; no emails or answers are shown.</p>${table(['Player', 'Milestone', 'When (UTC)'], report.recent.map(row => [`<code>${escape(row.player)}</code>`, escape(row.event), escape(new Date(row.at).toISOString().slice(0, 16).replace('T', ' '))]), 'No milestones in this period yet.')}</article></section>
    <details class="panel definitions" id="definitions"><summary>Metric definitions & data coverage</summary><dl><dt>Visitors and sessions</dt><dd>A visitor is a random browser identifier, not a verified person. Sessions restart after 30 minutes without tracked activity. Browser privacy preferences and local opt-out are honored; admin accounts are excluded.</dd><dt>Activation and active learning</dt><dd>Activation is the first observed server-graded answer, whether correct or incorrect. Active learners have at least one graded answer in the period. Viewing the world or leaving a tab open does not count.</dd><dt>Milestones and history</dt><dd>Milestones begin when this system is installed; historical registration, activation, and payment dates are not guessed. Existing accounts remain in the all-time saved-account total. Raw events are retained for ${report.retentionDays} days; account milestones survive resets and retention.</dd><dt>Conversions and retention</dt><dd>The funnel uses one cohort of new players and ordered steps in the selected window. Return rates use fully elapsed UTC days only. Rates with no denominator are shown as a dash, never as zero.</dd><dt>Attribution</dt><dd>UTM source and campaign use short labels; otherwise source is the referring hostname, referral, or direct. No full URLs, IP addresses, email addresses, text input, or lesson answers are stored in events. Acquisition is directional because devices and blocked tracking cannot be perfectly linked.</dd><dt>Delivery</dt><dd>Collection is best effort and cannot block play. Retry IDs prevent duplicate events; server logs report failed writes. Account milestones are saved in the same transaction as the verified action.</dd></dl></details>`;
}

export function analyticsCSV(report: AnalyticsReport): string {
  const cell = (value: string | number) => {
    const text = String(value); return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
  };
  const fields: (keyof Metrics)[] = ['visitors', 'sessions', 'newPlayers', 'registrations', 'activated', 'activeLearners', 'attempts', 'correct', 'completions', 'paywallViewers', 'checkoutUsers', 'newCustomers', 'errors'];
  return [['date_utc', ...fields], ...report.daily.map(day => [day.date, ...fields.map(field => day[field])])].map(row => row.map(cell).join(',')).join('\r\n');
}

export function bindAnalyticsControls(host: HTMLElement, report: AnalyticsReport): void {
  host.querySelector<HTMLSelectElement>('#chart-metric')!.onchange = event => {
    host.querySelector('#trend')!.innerHTML = chartMarkup(report, (event.target as HTMLSelectElement).value as ChartMetric);
  };
  host.querySelector<HTMLSelectElement>('#acquisition-dimension')!.onchange = event => {
    const dimension = (event.target as HTMLSelectElement).value as 'sources' | 'campaigns' | 'devices';
    host.querySelector('#acquisition-table')!.innerHTML = breakdown(report[dimension]);
  };
}
