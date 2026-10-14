# Trials and Polar billing

Players can play anonymously for five minutes. At the account wall they can
create an account to retain progress, log into an existing account, or explicitly
restart their guest adventure. A guest restart deletes all learning and story
progress, saved slots, rewards and receipts while keeping the same character,
name and preferences. Registered accounts share a fifteen-minute total free
allowance across devices, including time played before registration. Free time
does not reset on page reload, login, story-slot load or backend restart.

The countdown starts with gameplay. Background tabs and account/payment forms
pause by disconnecting from the world and reporting inactive play. The server
measures elapsed time using persisted bounded leases and enforces the wall on
REST gameplay and WebSockets. Browser elapsed-time claims cannot increase the
allowance. Overlapping tabs do not multiply free time. Paid accounts have
unlimited play while their verified entitlement remains valid.

## Products created in Polar

The following production products were created on October 14, 2026 in the
`sgk-consulting` organization (`05cd934b-93ee-4ee7-bff7-8fb57708b9e5`). Both are EUR:

| Plan | Price | Product ID |
| --- | --- | --- |
| [The Lantern Atlas — Monthly](https://polar.sh/dashboard/sgk-consulting/products/a84e62e5-d902-43d9-a659-c00d65bf6209) | €2.99, recurring every month | `a84e62e5-d902-43d9-a659-c00d65bf6209` |
| [The Lantern Atlas — Lifetime](https://polar.sh/dashboard/sgk-consulting/products/7e211030-d059-4bbc-b5a0-9c575c30b42c) | €29.99, one-time purchase | `7e211030-d059-4bbc-b5a0-9c575c30b42c` |

Polar's organization default currency is EUR. No Polar subscription trial is
needed: the game's five/fifteen-minute allowance is implemented by the server.
The game grants access from verified orders/subscriptions, so these products do
not need a separate Polar benefit.

## Enable production checkout

1. Finish Polar's business onboarding/review if requested in **Finance → Account**.
2. Create an organization access token for the game backend with only
   `checkouts:write`, `customers:read`, `orders:read`, and
   `customer_sessions:write` scopes. Keep it in the deployment's secret
   environment, never source control, browser code, chat or a screenshot.
3. Create a **raw JSON** webhook endpoint for
   `https://langrpg.papricode.com/api/billing/webhook`, with API version **2026-10**.
   Select `customer.state_changed`, `customer.deleted`, `order.paid`,
   `order.refunded`, `order.updated`, `subscription.created`,
   `subscription.updated`, `subscription.active`, `subscription.canceled`,
   `subscription.revoked`, and `subscription.uncanceled`.
   Store the full endpoint secret, including its `whsec_` prefix.
4. Set the following in Dokploy's environment and deploy the updated source:

   ```dotenv
   PUBLIC_URL=https://langrpg.papricode.com
   POLAR_SERVER=production
   POLAR_ACCESS_TOKEN=YOUR_ORGANIZATION_TOKEN
   POLAR_WEBHOOK_SECRET=YOUR_FULL_WEBHOOK_SECRET
   POLAR_MONTHLY_PRODUCT_ID=a84e62e5-d902-43d9-a659-c00d65bf6209
   POLAR_LIFETIME_PRODUCT_ID=7e211030-d059-4bbc-b5a0-9c575c30b42c
   ```

   Keep `ALLOWED_ORIGINS` set to the exact game origin. The checkout return URL
   comes from `PUBLIC_URL`, never an untrusted request header or browser input.
   Billing remains unavailable if both credentials are blank; configuring only
   part of the credential set fails startup rather than accepting insecure
   notifications. Trial walls remain enforced when billing is unavailable.
5. Verify the webhook succeeds in Polar's delivery log after deployment.

The integration pins `Polar-Version: 2026-10` on every API request. The server
chooses the product from its allowlist and binds checkout/customer-portal
sessions to the player's immutable ID using `external_customer_id`. Redirects
to `?billing=success` prompt verification; they do not grant access. No payment
card data passes through this application.

Monthly access requires the configured EUR subscription and a paid order for
the current period. Cancellation retains access through the paid period;
revocation, expired periods, and refunded orders remove access. Lifetime access
requires a paid EUR lifetime order that has not been refunded. Signed webhook
notifications trigger reconciliation with Polar rather than trusting event
deltas, so old notifications cannot re-grant revoked access. Duplicate deliveries
are persisted and handled idempotently. Billing checks refresh periodically;
previously verified access has a bounded grace period during a Polar outage.
Payment expiry preserves player progress behind the paywall.

## Sandbox verification

Create separate EUR monthly and one-time products in the Polar sandbox, using
their own IDs, token and webhook secret. Set `POLAR_SERVER=sandbox` and use an
HTTPS development origin or `http://localhost:5187` as `PUBLIC_URL`. A local
webhook requires a public HTTPS forwarding endpoint. Production IDs cannot be
used with sandbox credentials.

Test both purchases using Polar sandbox payment methods, then verify reload and
login on another device preserve paid access. Verify a canceled monthly plan
remains usable until its paid end, a refunded lifetime order becomes paywalled,
and an unpaid checkout or manually typed success URL never unlocks play. Test
guest expiry, registration at the wall, and guest restart separately. The Go
tests use fake Polar HTTP responses and signed webhook fixtures, with no real
charges.

See Polar's [checkout API](https://polar.sh/docs/features/checkout/session),
[customer state](https://polar.sh/docs/integrate/customer-state), and
[webhook validation](https://polar.sh/docs/integrate/webhooks/delivery) guides.
