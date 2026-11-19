# Billing phase 1: agency onboarding to credit management

**Date:** 2026-11-19 · **Status:** draft, the journey is to be confirmed with Cyril (prototype:
`OneDrive/Documents/CreativeOS/Credits/shared/2026-11-19-billing-journey-prototype-v2.html`)
· **Builds on:** the plan agreed with Anupama (`Credits/shared/2026-11-18-credits-full-plan.html`),
the Razorpay architecture page, and the test top-up (D514, `2026-11-19-razorpay-test-top-up-design.md`).

This is the map for phase 1. Each piece below gets its own spec, plan and build, in the order given.

## What phase 1 makes possible

An agency is onboarded by Yuvabe, its owner picks a plan and pays by card, UPI or UPI Autopay,
the plan renews monthly, the owner can top up and see billing, a failed payment pauses AI runs,
and Yuvabe sees every agency's billing and can add credits.

### The journey

1. **Yuvabe adds the agency** in Admin: name, owner's email and **billing**: pays for a plan, or
   managed by Yuvabe (a monthly credit limit, as today, never charged). No plan or price is chosen
   here. The owner is invited as today.
2. **The owner signs up** as today and lands on **Yuvabe's plans**, the same for every paying
   agency. They can pick one, or look around first: clients, brand kits and inviting the team all
   work. **Any AI run needs a plan**: the owner sees "Pick a plan to start creating"; a member
   sees that the agency hasn't picked a plan. An owner of a managed agency lands in the workspace.
3. **The owner picks a plan and pays** through Razorpay. Monthly plans renew on the day of the first
   payment. The 7-day plan is bought once per agency unless Yuvabe allows it again.
4. **Credits arrive when Razorpay's signed webhook confirms the payment** (never from the browser).
5. **Runs** hold credits at the start and take only the real cost at the end (as today).
6. **At 80% used** the owner sees a warning. A **top-up** adds credits until the plan month ends.
   Top-ups need an active monthly plan. Members never see credits or billing; when blocked they are
   told to ask the owner.
7. **Every month** Razorpay charges the plan. New plan credits arrive; what was left last month,
   top-ups included, ends.
8. **Change plan** applies from the next payment. **Cancel** keeps the plan until the end of the
   paid month.
9. **A failed renewal pauses AI runs** at once. Razorpay retries for 3 days and emails the owner.
   Nothing is deleted; paying restores everything.
10. **Admin billing** lists every agency (payment due first) with plan, status, renewal date and
    credits left; Yuvabe can add credits with a reason, allow the 7-day plan again, send a payment
    link, and switch an agency between paying and managed.

Today's agencies become **managed by Yuvabe**: their monthly limit works as now; no payments.

### Later (not phase 1)

- Different prices or margins for one agency (every paying agency sees the same plans).
- Upgrading mid-month (credits from both plans); until then, top up and change from the next payment.
- Top-up packs with their own validity, or that don't expire.
- Model prices in the database with start dates (prices stay in code; a change needs a release).
- Emails at 80% and 100% used (phase 1 has the in-app warning).
- Yearly plans; Admin's paid-versus-cost report per agency.

### Still to think through: Yuvabe admin controls

Not worked out yet; piece 6 waits on it. The prototype's Admin billing screen is a first idea.

- Creating and changing plans, prices and top-up packs, and what happens to agencies already on a
  plan when a price changes.
- Moving an agency between paying for a plan and managed.
- Adding credits and taking them back; who at Yuvabe can, and whether a reason is needed.
- Pausing or closing an agency. Refunds.
- Failed payments: sending a payment link, giving extra days.
- Allowing the 7-day plan a second time.
- What Admin shows: payments, renewals due, credits used against what was paid.

### To confirm with Cyril

1. **Plans above ₹15,000 a month.** RBI's e-mandate rules stop automatic charges above ₹15,000
   without the customer approving each one; Studio and Agency are above it with GST. Owner approves
   each month's charge from a Razorpay message (as the prototype shows), or yearly or bank transfer
   for big plans?
2. **GST invoices.** Razorpay's invoice per payment with the agency's GSTIN, or our own numbering?
3. **Failed payment.** Pause at the first failed attempt (as agreed with Anupama: no grace period),
   or after Razorpay's 3 retry days?
4. **Before paying.** Can the owner look around first (AI runs blocked), or must a plan be picked
   first?
5. **7-day plan.** Once per agency by default; Yuvabe can allow it again.
6. **Final prices and credit amounts** (all current figures are examples).

### Needed from Razorpay before pieces 3 and 4

UPI is off on the account (`/v1/methods` reports `upi: false`) and recurring payments are not set.
Ask support to enable UPI (collect, intent, QR), Subscriptions, UPI Autopay and card e-mandates in
test and live mode; finish account activation (KYC) for live.

## A simplification that shapes the ledger

Every credit grant in a billing period ends at the same moment: plan credits, top-ups and
Yuvabe's added credits all end when the plan month ends (the 7-day plan when its 7 days end). So
the order "plan credits first, then top-ups" never changes what an agency can do or what it loses,
and **one balance per period** is enough: credits granted in the current period minus credits used
in it. No per-bucket accounting. The billing page still shows plan credits and top-ups separately,
which is derived from the grants. If top-ups with their own validity arrive later, buckets come
with them.

## Pieces, in build order

| # | Piece | Depends on | Delivers |
|---|---|---|---|
| 1 | **Plans and agency billing settings** | – | `billing_plans`, `topup_packs`; per agency: billing mode (plans / managed), 7-day allowed; Admin's add-agency popup gains Billing (the credit limit shows only for managed); existing agencies set to managed |
| 2 | **Credit periods and balance** | 1 | `credit_transactions` gains `grant` rows tied to a period; `billing_periods` (agency, start, end, source); `reserve_credits` v2: managed agencies keep the monthly limit; paying agencies need an active period and a positive balance; reasons returned (no plan, paused, not enough) so the UI can say which |
| 3 | **One-time payments** | 2 | 7-day plan and top-ups through Razorpay Orders, built on the test top-up (`billing_payments`, the webhook, signatures); grants a period (7-day) or credits into the current period (top-up) |
| 4 | **Monthly subscriptions** | 2 | One Razorpay Plan per plan and price, created on demand when a price changes; subscribe; webhooks `subscription.activated`, `.charged`, `.pending`, `.halted`, `.cancelled` stored once by event id; renewal opens the next period; change plan at the cycle end; cancel at the cycle end; payment due pauses runs; nightly check against Razorpay |
| 5 | **Owner screens** | 3 (4 for monthly) | Plans page (shown right after sign-up), Razorpay Checkout, billing page (plan, credits, top up, payments and invoices, change, cancel), header credits pill states, banners and blocked-run dialogs for owner and member, 80% warning |
| 6 | **Admin billing** | 2 and the admin controls above | First idea: billing list across agencies; add credits with a reason (audit-logged); allow 7-day again; send a payment link; switch paying / managed. Scope set once the admin controls are thought through |

Pieces 3 and 6 can run alongside 4. The test top-up page (`/billing-test`) is removed when piece 5
ships.

## Data model sketch (detailed in each piece's spec)

- `organizations`: `billing_mode` (`managed` | `plans`, default `managed`), `trial_allowed`
  (default true, false after first purchase).
- `billing_plans`: name, kind (`monthly` | `trial`), credits, price (paise, before GST), days
  (trial), active. Yuvabe's margin is in the price; it is not stored per agency. `topup_packs`: credits, price, active.
- `billing_subscriptions`: agency, plan, Razorpay subscription id, status (`created`, `active`,
  `payment_due`, `cancelling`, `ended`), current period start and end, next plan.
- `billing_periods`: agency, starts, ends, source (subscription charge, 7-day order, admin).
- `billing_payments` (from 0066): gains kind (plan, renewal, trial, top-up), plan or pack, invoice.
- `razorpay_events`: event id (unique), type, payload, processed at.
- `credit_transactions`: new type `grant` (positive amount) with `period_id`; usage rows gain
  `period_id`, so a balance is one sum over one period.

## Testing approach

- Unit and route tests per piece, as in the test top-up (signatures, idempotency, refusals).
- The replay script grows to send subscription events, so renewals, failures and repeats are
  tested locally without waiting a month.
- Concurrency test before launch (agreed with Anupama): many runs at once against a small balance;
  the balance never goes below zero and every hold is released.
- End to end in Razorpay test mode through the tunnel, once UPI and Subscriptions are enabled.
