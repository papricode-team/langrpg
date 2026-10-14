# First-party analytics

Open `/admin.html`, or choose **Analytics** while signed in as an admin. The dashboard uses the existing `ADMIN_EMAILS` allowlist and remains available after an administrator's trial expires. It has its own sign-in screen and does not load the game engine. All analytics stays in Glotworld's database; no analytics SDK, external service, or additional infrastructure is required.

## Ship and operate

1. Build the frontend normally (`npm ci && npm run build`) and deploy the server and frontend together. The standard Docker build includes the new admin entry point.
2. Use the existing production `DATABASE_URL`. Startup creates the analytics tables and indexes idempotently; the database role needs the same schema-creation permissions as the other startup migrations. Back up the database with the rest of the application.
3. Provision the intended administrator's account before adding its email to `ADMIN_EMAILS`, following the existing admin setup instructions. Restart after changing the allowlist. No additional analytics credentials or environment variables are needed.
4. Open `/admin.html`. A clean installation displays empty states until real usage arrives. Existing account totals are available immediately; historical registration, learning, and payment milestone dates are not invented.

The development JSON store also persists analytics, but it rewrites a local state file and is only suitable for one development process. Production uses indexed PostgreSQL events, database-side daily aggregation, and bounded report date ranges. The dashboard never makes billing-provider requests; it reads existing verified billing snapshots.

## Dashboard scope

- Overview: browser visitors and sessions, new adventures, new saved accounts, active learners, first observed learners, first observed customers, daily charts, previous-period comparisons, and progress toward 1,000 observed customers.
- Conversion: an ordered new-player funnel (adventure → graded answer → checkout → paid access), exercise accuracy, completed learning activities, paywall reach, checkout reach, and issue reports.
- Retention: exact UTC day 1, 7, and 30 return rates, plus weekly activation cohorts. Unfinished observation windows are excluded from denominators.
- Acquisition: source/referrer, UTM campaign, and device, with visitors and the new-player cohort's activation/payment outcomes.
- Customers: current monthly, yearly, and lifetime entitlements, stale billing snapshots, and ended subscription periods. Sandbox billing is labeled. Ended periods are not presented as churn; prices are not multiplied into fictional revenue.
- Product activity: event/context counts and up to 30 recent account milestones, using pseudonymous player references.
- Controls: 7/30/90 days, manual refresh, chart metric selection, acquisition dimension selection, accessible data tables, and daily CSV export.

Session replay, autocaptured clicks, heatmaps, IP geolocation, ad attribution, arbitrary event builders, raw error messages, and a revenue ledger are deliberately outside this release.

## Definitions and attribution

A visitor is a random browser identifier, not necessarily one human. Its stored identity expires after 180 days. A browser session is scoped to a tab and restarts after 30 minutes without tracked activity. Reloads reuse the session; account switches rotate it. Browser telemetry is approximate and can be blocked. Server learning and account metrics remain authoritative for actions the server accepts.

Activation is the first **observed** graded exercise answer, including an incorrect answer. Previews, failed requests, receipt recovery, and duplicate submissions do not count. Active learners answer at least one exercise in the period; idle tabs and world navigation do not count. Story quest completions, practice quests, course units, and activity runs are tracked after successful persistence. Loading a saved story does not create completion activity. Resets preserve account milestones and distinguish new learning attempts by the access generation.

Registration, activation, and first verified paid access are saved in the same account transaction as the corresponding action. First paid access means a successful existing Creem reconciliation, never a browser redirect or a client event. These milestones survive event retention and game resets. They begin when this feature is deployed; for an existing player, the first newly observed activity/payment is not necessarily their historical first one.

The funnel's denominator is players whose adventure was created in the selected period. Each subsequent step must occur after the previous step and before the end of the period. Someone who pays before learning remains in customer totals but does not complete this ordered funnel. Paywall and checkout summary counts include all players, so they are not used as an unrelated cohort's conversion denominator.

Retention cohorts use first observed learning in the selected period. A return requires another graded answer on exactly the target UTC calendar day. Only days ending before today are eligible. Day 30 retention will therefore be blank for a seven-day activation cohort. Weekly cohorts start on Monday and can be partial at the selected date boundary. Empty denominators display a dash.

Current date ranges include today, which is partial. Comparisons use the preceding full 7/30/90 days, so they are not adjusted for today's elapsed hours. Dates, charts, CSVs, and cohort boundaries use UTC.

Sources use `utm_source`, then a referral link marker, then the external referring hostname, otherwise `direct`. Campaigns use `utm_campaign`. Only short labels are accepted. New-player outcomes are linked to the first observed browser session at account creation; later visits do not retroactively acquire older players. Unattributed players are `unknown`. One browser can appear under multiple source rows. Anonymous events join authenticated events within a session, and ambiguous shared-account sessions are not merged.

## Collection and safeguards

`POST /api/analytics/events` accepts 1–12 events in the existing 8 KiB request envelope. The public event names are `session_started`, `page_view`, `paywall_viewed`, and `client_error`, with fixed detail enums. The server replaces timestamps and account identity and discards client correctness/identity claims. Requests are origin checked and rate limited; malformed authenticated sessions do not fall back to anonymous collection. Server event names cannot be submitted through this endpoint.

Browser events carry stable IDs for retries, and session starts have a session-specific deduplication key. Learning events use account/course/generation/action identifiers and are emitted only for newly committed actions. The collector queues at most 24 browser events, retries delivery failures at most three times, and flushes when a page is hidden. It never captures text fields, lesson answers, email addresses, full URLs, click targets, raw user agents, or error messages/stacks. IPs are used only by the existing in-memory rate limiter, not written to analytics events.

The game has a **Usage analytics** control in Account settings. `Do Not Track`, Global Privacy Control, and local opt-out suppress browser collection. These preferences do not erase required account, learning, and billing records. Admin accounts and their attributable browser sessions are excluded from reports using the current server allowlist; report responses contain no emails or billing identifiers.

Raw events are retained for 180 days. PostgreSQL claims pruning at most once daily across instances, during an event write; an idle database may retain older rows until the next write. JSON prunes on each write. Persistent account milestones are not pruned. Historical raw events cannot be reconstructed from the current progress snapshot.

Analytics writes are best effort and bounded by a short timeout: an event-storage failure must not undo learning or payment. Milestones remain transactional, but event counts can be incomplete during outages. Failed server-side event writes log `analytics event was not saved`; monitor the existing application logs. Retrying a previously committed gameplay action does not recreate missing/pruned events as fresh activity.

`GET /api/admin/analytics?days=30` requires a persisted admin account, permits only 7/30/90 days, has a report timeout and per-admin refresh limit, and returns `Cache-Control: no-store`. No admin data is embedded in the public HTML. The UI handles expired sessions, revoked roles, request failures, stale views, empty datasets, and incomplete cohorts. Failed refreshes disable CSV export until fresh data loads.

## Verification

```sh
npm run check --workspace web
npm run lint --workspace web
npm run test --workspace web -- src/analytics-client.test.ts src/admin-analytics.test.ts src/account-api.test.ts
npm run build
(cd server && go test -race ./... && go vet ./...)
```

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database to include migration, deduplication, aggregation, and JSON/PostgreSQL parity checks. Existing integration tests also use this database; never point it at production.

For browser verification, run Vite and then:

```sh
ADMIN_UI_URL=http://127.0.0.1:5187 node scripts/check-admin-analytics.mjs
```

The browser smoke test uses explicitly synthetic API fixtures, exercises login/role revocation, date/chart/source controls, downloads CSV, checks the font floor and mobile overflow, and writes screenshots under `/tmp/glotworld-admin-qa` (override `ADMIN_UI_OUTPUT`). These fixtures are never included in the application bundle.
