# Trials and Creem billing

Without Creem credentials (`CREEM_API_KEY` and `CREEM_WEBHOOK_SECRET` both empty or
unset), the game is free to play with no time limit, signup wall or payment wall.
Account creation remains optional for saving progress across devices. Product IDs
and `CREEM_SERVER` alone do not enable billing. Free play does not consume the
saved trial allowance. Set `FREE_TO_PLAY=true` to force this mode even when Creem
credentials are present; this also disables checkout. With `FREE_TO_PLAY=false`
(the default), Creem configuration controls whether trials apply. Partial credential
configuration remains a startup error unless free play is explicitly enabled.

With Creem configured and free play disabled, the game permits ten minutes of
anonymous play. At expiry, signup keeps the character and progress and unlocks the remainder of two total free hours.
Logging into an existing account restores that account's own allowance. An
explicit game restart is available to guests and registered accounts. It clears
progress, moves the same character back to the beginning and grants a fresh
two hours. Players can repeat this as often as they like; credentials,
preferences and paid access are preserved. The server persists elapsed play and enforces access on HTTP and
WebSocket mutations across devices, reloads and tabs.

During registered free play, **Invite a friend** creates a public link at
`https://glotworld.com/?ref=PLAYER_ID`. Each new account that signs up through
that link grants the inviter another 90 minutes of play, for up to three
signups in any 24 hours and ten in total. Signup does not verify email
addresses, so without these caps throwaway signups through one's own link
would replace the paywall. Signups beyond a cap still succeed; they earn nothing. The friend receives
the normal trial. Issued links remain valid after the inviter's trial expires;
a later signup reopens free play without resetting progress. Existing-account
logins, self-referrals and repeated signup requests award no extra time.
Attribution survives reloads until signup or login succeeds. Registration and
the inviter's credit are saved in one transaction, including concurrent signups.
An explicit game reset discards remaining referral time along with progress;
issued links still work and future new signups can earn further bonuses.

## Products

The monthly and lifetime live products belong to the SGK Consulting Creem store. Tax is included;
there is no provider subscription trial (the game manages its own play clock).

| Plan | Price | Product ID |
| --- | --- | --- |
| Monthly | €2.99 every month | `prod_1cFiyLX3dyjxxWvFPxoOui` |
| Lifetime | €29.99 once | `prod_4XfWawwYu4GzlIacB6FFBd` |

The active sandbox also includes Yearly at **€9.99/year**. Its test product is
`prod_10t4ufdUqzos08ORT5v7WD`. Yearly is optional: without
`CREEM_YEARLY_PRODUCT_ID` the paywall offers only monthly and lifetime, so
production can start before the yearly live product exists. Monthly test: `prod_JGpN2YOTJn2QPgOt1xN62`; lifetime
test: `prod_6AQXBsKXG0L85hP4UMZipq`. All three plans include tax.

The paywall reads each plan's price from Creem (`GET /v1/products`, cached for
an hour, retried after a minute when a read fails) through
`GET /api/billing/offers`, so prices are changed in Creem only. If a price
cannot be read the plan is still offered and the checkout page shows the price.

Each purchase records its plan when the checkout is created. Changing a
product ID later (a new price, a recreated product) never revokes what
existing customers bought; only new checkouts use the new product.

## Production configuration

Finish Creem's business details, identity verification, payout setup and store
review before accepting live payments. Configure a server-only API key with
`checkouts:read`, `checkouts:write`, `products:read`, `subscriptions:read`, and `transactions:read`. Do not grant refunds, product
editing, subscription editing or full access to the runtime key.

Create a live webhook at:
`https://glotworld.com/api/billing/webhook`
Subscribe to `checkout.completed`, every `subscription.*` event,
`refund.created` and `dispute.created`. Save the full signing secret.

Set these in Dokploy's compose environment (never in `VITE_*` variables):

```dotenv
PUBLIC_URL=https://glotworld.com
ALLOWED_ORIGINS=https://glotworld.com
FREE_TO_PLAY=false
CREEM_SERVER=production
CREEM_API_KEY=YOUR_LIVE_SCOPED_KEY
CREEM_WEBHOOK_SECRET=YOUR_FULL_SIGNING_SECRET
CREEM_MONTHLY_PRODUCT_ID=prod_1cFiyLX3dyjxxWvFPxoOui
# Optional; leave unset until the yearly live product exists.
CREEM_YEARLY_PRODUCT_ID=YOUR_YEARLY_LIVE_PRODUCT
CREEM_LIFETIME_PRODUCT_ID=prod_4XfWawwYu4GzlIacB6FFBd
```

Remove old `POLAR_*` environment entries. Deploy the compose update and verify
webhook deliveries in Creem. No schema migration or progress reset is required.

## Payment verification

The server creates allowlisted checkouts, binds them to the immutable game
account and a private billing reference, and persists the returned session ID.
Neither customer email nor browser redirect parameters establish payment
ownership. A first checkout does not prefill the game account's email, which
is unverified; the payer enters their billing email on Creem's page, so
receipts never go to an unproven address. Later checkouts reuse the Creem
customer ID. The billing portal uses Creem’s email-authenticated My Orders login;
the game does not issue a customer-wide magic link based on an unverified email. Sync retrieves pending sessions from Creem; a signed webhook can
recover a completed checkout that was pruned from the pending list. An unpaid
checkout is rechecked for 24 hours and then dropped, as is one Creem no longer
knows (404) or whose identity does not match. Such a purchase never blocks the
verification of the others; only a transient Creem failure aborts a snapshot.

Paid access requires an authoritative unrefunded EUR transaction. Monthly and yearly
access also requires a matching subscription and payment covering its current
period. Scheduled cancellation preserves the already-paid period. Refunds,
disputes and expiration remove access at reconciliation. A signed
`dispute.created` webhook records the disputed transaction, which then grants
nothing even while Creem still reports it as paid, including after the merchant
wins the dispute (grant complimentary access from Admin in that case); the character and
progress remain saved. VAT-inclusive subtotals can vary by billing country.

Creem signatures use HMAC-SHA256 of the exact raw body in `creem-signature`.
The handler checks signed event age within the 24-hour retry window and stores
bounded event receipts. Reconciliation runs inside the account transaction so
late or duplicate events cannot overwrite current refunded state. References
are looked up by subscription/transaction IDs, never by matching email.

Two checkouts opened in two tabs can both be paid. When more than one purchase
grants access, the server logs a warning and Admin shows **Charged twice** on
the user, so support can refund the extra purchase in Creem.

Payment state refreshes at most once per minute during play, and immediately
on payment sync, portal access, checkout and webhooks. Accounts that never
started a checkout are not reconciled at all. After a failed Creem call, play
refreshes skip Creem for 30 seconds. During a provider outage,
previously verified access has at most 24 hours of grace; subscription access never
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
