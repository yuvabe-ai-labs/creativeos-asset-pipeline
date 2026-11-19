# Razorpay test top-up (bare minimum)

**Date:** 2026-11-19 · **Branch:** `feat/razorpay-test` (from `feat/permission-access-browser`) · **ADR:** D514

## Goal

Prove the payment chain end to end in Razorpay test mode before the real billing work: an
agency owner pays for a credit pack in Razorpay Checkout, Razorpay's signed webhook reaches our
server, the payment is recorded once, and the agency's credits go up. Nothing here is the
product's billing page; it is thrown away when that is built.

Out of scope: subscriptions and plans, invoices, the nightly check against Razorpay, the
owner's real billing page, the admin billing dashboard, live keys.

## Where it runs

A test-mode payment is not real money, so the page and its routes exist only where
`RAZORPAY_TEST_PAGE=1` is set: a developer's machine and the dev deployment. Never staging or
production. Without the setting the page and both billing routes answer 404. The webhook route
always exists (Razorpay must reach it) but does nothing without `RAZORPAY_WEBHOOK_SECRET`.

## Settings

| Name | Value |
|---|---|
| `RAZORPAY_KEY_ID` | Test key id (today's `RAZOR_PAY_TEST_API_KEY`) |
| `RAZORPAY_KEY_SECRET` | Test key secret (today's `RAZOR_PAY_TEST_API_SECRET`) |
| `RAZORPAY_WEBHOOK_SECRET` | The secret typed when the webhook is added in the Razorpay Dashboard (test mode) |
| `RAZORPAY_TEST_PAGE` | `1` only on a developer's machine and the dev deployment |

The names carry no "test": production later gets live values under the same names, so the
code never asks which mode it is in.

## How credits go up

`reserve_credits` refuses a run when this month's ledger rows add up past the agency's
`monthly_credit_limit`. A paid pack writes one `adjustment` row of **minus** the pack's credits,
so this month's total drops and that many more credits can be used. Like the planned top-ups,
it counts only until the month ends. No change to `reserve_credits`. `generation_id` is
nullable since 0028, and nothing else reads `adjustment` rows.

An agency with no limit (`monthly_credit_limit` null) sees no change: test with a capped one.

The pack is one constant in `src/lib/billing/constants.ts`: **₹100 for 1,000 credits**.

## Migration 0066 `billing_payments`

```
billing_payments
  id                   uuid pk
  org_id               uuid not null → organizations, indexed
  razorpay_order_id    text not null unique
  razorpay_payment_id  text unique          -- set when paid
  amount_paise         integer not null
  credits              integer not null
  status               text not null check in ('created', 'paid')
  created_by           uuid → auth.users
  created_at, paid_at  timestamptz
```

RLS on; owners of the agency may read their rows (the same owner-only rule as
`credit_transactions` in 0065). No insert or update policy: only the server (service role)
writes.

`record_razorpay_payment(p_order_id text, p_payment_id text) returns boolean`, security
definer, executable by `service_role` only. In one transaction: lock the row by order id; if it
is missing or already `paid`, return false; else set `paid`, the payment id and `paid_at`, and
insert the `adjustment` row (`org_id`, `amount = -credits`, no generation). Returns true when it
added credits. A repeated or late duplicate webhook therefore never adds credits twice.

## Code

No Razorpay SDK: `fetch` against the REST API, as email does with Resend.

- **`src/lib/billing/razorpay.ts`** (server only)
  - `createOrder({ amountPaise, receipt, notes })`: `POST https://api.razorpay.com/v1/orders`
    with basic auth (key id, key secret), currency INR.
  - `verifyCheckoutSignature(orderId, paymentId, signature)`: HMAC-SHA256 of
    `orderId|paymentId` with the key secret.
  - `verifyWebhookSignature(rawBody, signature)`: HMAC-SHA256 of the raw body with the webhook
    secret.
  - Both compare with `crypto.timingSafeEqual` and return false on a missing or malformed value.
- **`src/lib/billing/constants.ts`**: the test pack.
- **`src/lib/db/billing-payments.ts`**: insert a `created` row; call `record_razorpay_payment`.
- **`POST /api/billing/test-order`**: 404 without the setting. `withAccess(req, { need:
  "view_credits" })` (owner only). Creates the order (notes: org id), saves the `created` row,
  answers `{ orderId, amountPaise, keyId }`. Under `withTryCatch`.
- **`POST /api/billing/test-confirm`**: 404 without the setting; owner only. Checks the
  Checkout signature and answers `{ received: true }`, or 400. It never adds credits: a closed
  tab or a forged call can't change a balance.
- **`POST /api/webhooks/razorpay`**: reads the body with `req.text()` before any parsing; a
  bad or missing signature is 401. On `order.paid` it calls `record_razorpay_payment` with the
  order and payment ids from the payload. Every other event, and a duplicate, answers 200 and
  is ignored. It answers within Razorpay's 5 seconds (two database calls).
- **`/billing-test` page**: server component; `notFound()` without the setting or when the
  caller isn't the owner. A client component shows the pack and a Pay button: the button
  creates the order, loads `https://checkout.razorpay.com/v1/checkout.js` once, opens Checkout,
  and on success calls confirm and shows "Payment received. Credits are added when Razorpay
  confirms it." The credits in the profile popover then move live through the existing
  realtime channel. Data goes service → query hook → component
  (`src/services/billing.service.ts`, `src/hooks/queries/billing.ts`). Controls are shadcn
  primitives.

## Errors

- Order creation fails: the route answers 502 with plain words; nothing is saved.
- Checkout closed or the payment fails: the page says so; the `created` row stays and is
  harmless.
- Webhook for an order we don't have: 200, ignored (logged).
- The webhook is the only path to credits; if it never arrives, no credits are added. Fixing
  missed events is the later nightly check.

## Testing

- Unit: both signature checks (good, tampered, missing); the webhook route (bad signature 401,
  `order.paid` records, a second identical event adds nothing, other events 200); both billing
  routes 404 without the setting and refuse a non-owner.
- `scripts/razorpay-replay.mjs`: signs a sample `order.paid` for a given order id with
  `RAZORPAY_WEBHOOK_SECRET` and posts it to `localhost:3000/api/webhooks/razorpay`; run it twice
  to see the duplicate ignored. No tunnel needed.
- End to end: the webhook added in the Razorpay Dashboard (test mode) pointing at the tunnel or
  the dev deployment; pay with `success@razorpay`; the credits in the popover go up by 1,000;
  `failure@razorpay` adds nothing.

## Docs

ADR D514 in the roadmap §7; migration 0066 in `docs/database-schema.md` and
`docs/auth-production-migration.md`.
