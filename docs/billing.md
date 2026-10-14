# Trials and Creem billing

The game permits five minutes of anonymous play. At expiry, signup keeps the
character and progress and unlocks the remainder of fifteen total free minutes.
Logging into an existing account restores that account's own allowance. An
explicit guest restart clears progress and moves the same character back to the
beginning. The server persists elapsed play and enforces access on HTTP and
WebSocket mutations across devices, reloads and tabs.

## Products

Both live products belong to the SGK Consulting Creem store. Tax is included;
there is no provider subscription trial (the game manages its own play clock).

| Plan | Price | Product ID |
| --- | --- | --- |
| Monthly | €2.99 every month | `prod_1cFiyLX3dyjxxWvFPxoOui` |
| Lifetime | €29.99 once | `prod_4XfWawwYu4GzlIacB6FFBd` |

## Production configuration

Finish Creem's business details, identity verification, payout setup and store
review before accepting live payments. Configure a server-only API key with
`checkouts:read`, `checkouts:write`, `subscriptions:read`, and `transactions:read`. Do not grant refunds, product
editing, subscription editing or full access to the runtime key.

Create a live webhook at:
`https://langrpg.papricode.com/api/billing/webhook`
Subscribe to `checkout.completed`, every `subscription.*` event,
`refund.created` and `dispute.created`. Save the full signing secret.

Set these in Dokploy's compose environment (never in `VITE_*` variables):

```dotenv
PUBLIC_URL=https://langrpg.papricode.com
CREEM_SERVER=production
CREEM_API_KEY=YOUR_LIVE_SCOPED_KEY
CREEM_WEBHOOK_SECRET=YOUR_FULL_SIGNING_SECRET
CREEM_MONTHLY_PRODUCT_ID=prod_1cFiyLX3dyjxxWvFPxoOui
CREEM_LIFETIME_PRODUCT_ID=prod_4XfWawwYu4GzlIacB6FFBd
```

Remove old `POLAR_*` environment entries. Deploy the compose update and verify
webhook deliveries in Creem. No schema migration or progress reset is required.

## Payment verification

The server creates allowlisted checkouts, binds them to the immutable game
account and a private billing reference, and persists the returned session ID.
Neither customer email nor browser redirect parameters establish payment
ownership. The billing portal uses Creem’s email-authenticated My Orders login;
the game does not issue a customer-wide magic link based on an unverified email. Sync retrieves pending sessions from Creem; a signed webhook can
recover a completed checkout that was pruned from the pending list.

Paid access requires an authoritative unrefunded EUR transaction. Monthly
access also requires a matching subscription and payment covering its current
period. Scheduled cancellation preserves the already-paid period. Refunds,
disputes and expiration remove access at reconciliation; the character and
progress remain saved. VAT-inclusive subtotals can vary by billing country.

Creem signatures use HMAC-SHA256 of the exact raw body in `creem-signature`.
The handler checks signed event age within the 24-hour retry window and stores
bounded event receipts. Reconciliation runs inside the account transaction so
late or duplicate events cannot overwrite current refunded state. References
are looked up by subscription/transaction IDs, never by matching email.

Payment state refreshes at most once per minute during play, and immediately
on payment sync, portal access, checkout and webhooks. During a provider outage,
previously verified access has at most 24 hours of grace; monthly access never
extends beyond its verified paid period. Unverified payments never gain access.

## Test mode

Use separate test products, a scoped test key and test webhook secret, with
`CREEM_SERVER=sandbox`. The API base becomes `https://test-api.creem.io` and
HTTP localhost is permitted for `PUBLIC_URL`. Production rejects test-mode
payment objects. Exercise initial payment, renewal, cancellation, partial/full
refunds, disputes, duplicate events and out-of-order delivery. Do not run test
purchases against live products.

Server tests use fake authenticated Creem HTTP responses and signed webhook
fixtures. PostgreSQL tests require a disposable `TEST_DATABASE_URL`. Frontend
access and account tests verify clocks, redirects, registration and stale
response handling.

References: [checkout API](https://docs.creem.io/api-reference/endpoint/create-checkout),
[webhooks](https://docs.creem.io/code/webhooks),
[subscriptions](https://docs.creem.io/api-reference/endpoint/get-subscription),
[transactions](https://docs.creem.io/api-reference/endpoint/get-transaction).
