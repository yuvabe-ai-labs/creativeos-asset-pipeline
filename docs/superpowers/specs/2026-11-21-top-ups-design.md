# Billing piece 4: top-ups

**Date:** 2026-11-21 · **Branch:** `feat/razorpay-test` · **Map:** `2026-11-19-billing-phase-1-design.md`
(piece 4, after monthly plans, D580) · **Migration:** 0096

## Goal

The owner of an agency on a plan buys a top-up pack in one payment. Its credits arrive when
Razorpay confirms the payment and end when the plan's paid month ends.

## Rules

- **Needs a plan:** the agency pays for a plan and its plan is `active` or `cancelling` with a paid
  month still running. Not while a payment is due (runs are stopped then; paying the plan comes
  first). Refusal: "Top-ups need an active plan."
- **The pack:** a top-up product and price, both shown (Admin › Plans and prices).
- **Charged with GST**, like plans. The payment row keeps the amount before tax, the tax, the total,
  the rate, the price and the plan it was bought on.
- **Ends with the plan month:** the grant ends at the subscription's `current_period_end`. A price
  with `valid_days` (not offered yet) ends that many days after payment instead. If the plan has
  no paid month left by the time the payment is confirmed (rare: cancelled and ended in between),
  the credits last 30 days, so a paid top-up is never lost.

## Flow

1. `POST /api/billing/topup` (owner): checks the rules, creates a Razorpay order for the total
   with GST, saves a `created` payment row (`kind = 'topup'`), answers the order for Checkout.
2. Checkout; `POST /api/billing/topup/confirm` checks the order signature and answers "received".
   It never adds credits.
3. `order.paid` webhook → `record_razorpay_payment` (replaced in 0096): one transaction marks the
   payment paid once; a `topup` payment writes a `topup` grant as above; a `test` payment keeps
   the old behaviour (the negative adjustment) until the test top-up is removed.

## Code

- `src/lib/billing/top-ups.ts`: `startTopUp(orgId, userId, priceId)`.
- `src/lib/db/billing-payments.ts`: `insertCreatedPayment` gains the top-up fields.
- Routes under `/api/billing/topup`, owner only (`view_credits`).
- `/billing-test`: the packs with Buy, enabled only on an active plan.

## Testing

Unit: the refusals (managed, no plan, payment due, hidden pack, a plan price instead of a pack),
the order amount with GST and the row saved. Migration text tests: once only, the grant's end
(valid days, then the plan month, then 30 days), test payments unchanged.
