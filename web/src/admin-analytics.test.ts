// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { analyticsCSV, bindAnalyticsControls, metricChange, renderAnalytics, type AnalyticsReport, type Metrics } from './admin-analytics';
const metrics: Metrics = { visitors: 0, sessions: 0, newPlayers: 0, registrations: 0, activated: 0, activeLearners: 0, attempts: 0, correct: 0, completions: 0, paywallViewers: 0, checkoutUsers: 0, newCustomers: 0, errors: 0 };
const fixture = (): AnalyticsReport => ({
  generatedAt: '2026-10-14T12:00:00Z', from: '2026-10-08T00:00:00Z', to: '2026-10-14T12:00:00Z', previousFrom: '2026-10-01T00:00:00Z', days: 7, retentionDays: 180, firstEventAt: null, billingMode: 'disabled',
  current: { ...metrics }, previous: { ...metrics }, daily: [{ ...metrics, date: '2026-10-14' }], sources: [], campaigns: [], devices: [],
  funnel: [{ label: 'Started an adventure', users: 0, rate: null }], retention: [1, 7, 30].map(day => ({ day, eligible: 0, returned: 0, rate: null })), cohorts: [], events: [], recent: [],
  customers: { registered: 0, everPaid: 0, monthly: 0, yearly: 0, lifetime: 0, stale: 0, expired: 0 },
});
describe('admin analytics presentation', () => {
  it('distinguishes absent data and immature cohorts from zero performance', () => {
    const host = document.createElement('main'); host.innerHTML = renderAnalytics(fixture());
    expect(host.textContent).toContain('No activity recorded yet');
    expect(host.textContent).toContain('Waiting for this cohort to mature');
    expect(host.textContent).not.toContain('NaN'); expect(host.textContent).not.toContain('Infinity');
    expect(host.querySelectorAll('.retention-card strong')[0].textContent).toBe('—');
    expect(host.querySelector('svg')!.getAttribute('aria-label')).toContain('exact values');
  });
  it('escapes acquisition data and allows switching breakdowns and chart metrics', () => {
    const report = fixture(); report.sources = [{ label: '<img src=x onerror=alert(1)>', visitors: 2, players: 1, activated: 1, customers: 0 }];
    report.devices = [{ label: 'mobile', visitors: 2, players: 1, activated: 1, customers: 0 }];
    report.daily[0].attempts = 42;
    const host = document.createElement('main'); host.innerHTML = renderAnalytics(report); bindAnalyticsControls(host, report);
    expect(host.querySelector('img')).toBeNull(); expect(host.textContent).toContain('<img');
    const dimension = host.querySelector<HTMLSelectElement>('#acquisition-dimension')!; dimension.value = 'devices'; dimension.dispatchEvent(new Event('change'));
    expect(host.querySelector('#acquisition-table')!.textContent).toContain('mobile');
    const metric = host.querySelector<HTMLSelectElement>('#chart-metric')!; metric.value = 'attempts'; metric.dispatchEvent(new Event('change'));
    expect(host.querySelector('svg title')!.textContent).toContain('42');
  });
  it('exports real daily data with safe cells and handles zero-baseline comparisons', () => {
    const report = fixture(); report.daily[0].visitors = 23;
    const csv = analyticsCSV(report); expect(csv).toContain('"date_utc","visitors"'); expect(csv).toContain('"2026-10-14","23"');
    report.daily[0].date = '=HYPERLINK("bad")'; expect(analyticsCSV(report)).toContain(`"'=HYPERLINK(""bad"")"`);
    expect(metricChange(4, 0)).toBe('New in this period'); expect(metricChange(0, 0)).toBe('No change'); expect(metricChange(5, 10)).toBe('-50.0% vs previous period');
  });
});
