# Failed payments and the check against Razorpay

**Date:** 2026-11-21 · **Branch:** `feat/razorpay-test` · **Migration:** 0074 · **Builds on:** monthly
plans (D521), the owner screens (D523)

## What subscription products do, and what we take from it

Researched on 21 November (Stripe, Paddle, Chargebee and dunning guides; Razorpay's own docs):

| Common practice | Here |
|---|---|
| Retry the charge several times over about two weeks | Razorpay retries (pending), then stops (halted) |
| Let the customer pay or change card from the product | **Pay now** on Billing opens Razorpay's page for the subscription: same card, a new card, UPI or a bank mandate |
| Grace period of 7 to 14 days with access kept (Paddle: 30) | **Not taken:** runs stop at the first failure (decided 20 Nov, D516). Flagged for Cyril |
| A final notice before cancelling | Billing shows the date the plan ends if unpaid |
| End the subscription after the recovery window | Plans unpaid for **30 days** are ended by the nightly check (a halted Razorpay subscription keeps raising invoices otherwise) |
| States only move forward; events are deduplicated | A late "pending" never undoes a later charge; an ended plan stays ended; events stored once (D521) |
| Reconcile, don't trust webhooks alone | Hourly check of unpaid top-ups (after 15 minutes), nightly check of every plan |

## Rules

- **Payment due** (Razorpay pending or halted): AI runs stop; the owner sees Pay now, the end date
  (due since + 30 days), and the bar says "Pay now". Members see that runs are paused.
- **Paying** on Razorpay's page sends `subscription.charged`: the payment is recorded once, the plan
  is active again and the month's credits are added.
- **Cancel while due:** the plan ends now (no paid month is left to use).
- **Change plan while due:** refused until paid.
- **Top-up while due:** refused (unchanged).
- **Late or repeated events:** a payment-due event for a period older than the one paid is
  ignored; an ended plan never comes back from an event; a charge found late for an older month is
  recorded with its (already ended) grant but never moves the paid period back.

## The check against Razorpay (`src/lib/billing/reconcile.ts`, `trigger/reconcile-billing.ts`)

- **Hourly** (`reconcile-billing-orders`): top-up orders still unpaid 15 minutes to 3 days after they
  started; a captured payment is recorded through `record_razorpay_payment` (once only).
- **Nightly**, 02:00 India time (`reconcile-billing-plans`): each live plan (up to 200 a run, least
  recently updated first): its paid invoices oldest first through `record_subscription_charge`,
  then its status, then the 30-day end.
- One agency's failure is logged and the rest go on. Running either twice changes nothing.

## Database (0074)

`billing_subscriptions.payment_due_since` (indexed where set); `set_subscription_status` and
`record_subscription_charge` replaced with the forward-only rules above.

## Known limit

Razorpay can't change the plan of a subscription authorised by UPI or a bank mandate. Until a
cancel-and-resubscribe flow exists, Change plan works for card subscriptions; for the others it
answers "Could not change the plan." To do when UPI is enabled.
