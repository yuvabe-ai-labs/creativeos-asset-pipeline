# Billing piece 5: monthly plans through Razorpay Subscriptions

**Date:** 2026-11-21 · **Branch:** `feat/razorpay-test` · **Map:** `2026-11-19-billing-phase-1-design.md`
(piece 5, built before piece 4 because top-ups need a plan) · **Migration:** 0071

## Goal

An owner of a paying agency subscribes to a monthly plan, pays in Razorpay Checkout, and gets the
plan's credits every month while the payments go through. A failed or unapproved payment stops AI
runs; paying starts them again. The owner can cancel (works until the paid month ends) or change
plan (from the next payment). Razorpay's test mode with test cards proves it end to end now; UPI
Autopay follows when Razorpay turns UPI on.

## Out of scope

The owner's real plans and billing pages (piece 6; until then the hidden `/billing-test` page
drives it), top-ups (piece 4), the nightly check against Razorpay (piece 7), emails.

## Money

- Razorpay charges the price **with GST**: a Razorpay plan's amount is
  `round(amount_minor × 1.18)`. The payment row keeps the amount before tax, the tax and the total,
  and the rate in force.
- One Razorpay plan per price row, made on the first subscription to it and saved in
  `billing_prices.razorpay_plan_id` (prices are fixed, so the Razorpay plan never needs to change).

## Flow

1. **Subscribe** (`POST /api/billing/subscribe`, owner only): the agency pays for a plan, the
   price is active, monthly, and its plan is visible. A live subscription refuses ("You already
   have a plan"), except one still `created` (Checkout was closed before paying), which is
   cancelled in Razorpay and ended first. The server makes the Razorpay plan if needed, creates a
   Razorpay subscription (`total_count` 120 monthly charges, notes: agency and our row), saves our
   row as `created`, and answers the Razorpay subscription id and the key id for Checkout.
2. **Checkout** opens with the subscription id. On success the browser sends the payment id,
   subscription id and signature to `POST /api/billing/subscribe/confirm`, which checks the
   signature (HMAC of `payment_id|subscription_id`) and answers. It never adds credits.
3. **Webhooks** (`/api/webhooks/razorpay`, signed): every event is first stored in
   `razorpay_events` by its `x-razorpay-event-id`; one already processed is answered 200 and
   skipped. Then:
   - `subscription.charged` → `record_subscription_charge`: one transaction records the payment
     (once per Razorpay payment id), sets the subscription `active` with the paid period, moves it
     to the plan Razorpay charged (a scheduled change lands here), and writes a `plan` grant of the
     price's credits ending when the paid period ends.
   - `subscription.activated`, `subscription.resumed` → `active`.
   - `subscription.pending`, `subscription.halted` → `payment_due`. AI runs stop at once (decided
     20 Nov), whatever credits are left. Plans above ₹15,000 that wait for the owner's approval
     arrive here too.
   - `subscription.cancelled`, `subscription.completed` → `ended`.
   - `order.paid` → the test top-up, as today.
   - Anything else is stored and answered 200.
   A failure is stored on the event (`error`) and answered 500 so Razorpay sends it again.
4. **Cancel** (`POST /api/billing/cancel`, owner only): Razorpay cancels at the cycle end; our row
   becomes `cancelling` until `subscription.cancelled` ends it. Plan credits last until the paid
   month ends, as they already do (the grant ends then).
5. **Change plan** (`POST /api/billing/change`, owner only): Razorpay moves the subscription to
   the new price's plan at the cycle end; our row keeps `next_price_id` until the next charge
   lands on the new plan.

## Database (migration 0071)

- `record_subscription_charge(p_razorpay_subscription_id, p_razorpay_plan_id, p_payment_id,
  p_order_id, p_total_minor, p_period_start, p_period_end) returns boolean`: false for an unknown
  subscription or a payment already recorded.
- `set_subscription_status(p_razorpay_subscription_id, p_status, p_period_start, p_period_end)
  returns boolean`.
- `reserve_credits_v2` gains one refusal: a paying agency whose live subscription is
  `payment_due` is refused with `payment_due` before its grants are looked at.
- All `security definer`, `set search_path = public`, `service_role` only.

## Code

- `src/lib/billing/razorpay.ts`: `createPlan`, `createSubscription`, `cancelSubscription`,
  `changeSubscriptionPlan`, `verifySubscriptionSignature`.
- `src/lib/billing/gst.ts`: `withGst(amountMinor)`.
- `src/lib/db/billing-subscriptions.ts`: reads and writes of our rows, the two RPCs, events.
- `src/lib/billing/subscriptions.ts`: the subscribe, cancel and change steps (server only).
- `src/lib/billing/webhook.ts`: the event dispatcher used by the route.
- Routes: `/api/billing/subscribe`, `/api/billing/subscribe/confirm`, `/api/billing/cancel`,
  `/api/billing/change`; all `withAccess(... need: "view_credits")` (owners), under `withTryCatch`.
- `CreditRefusal` gains `payment_due`.
- `/billing-test` lists the plans with Subscribe, and shows the subscription with Cancel.
- Admin's Billing tab shows the plan line: plan name, status, renews or ends on.

## Rollout

0071 changes `reserve_credits_v2`, which the live code calls. Until the release that knows
`payment_due` is out, the old code treats that answer as unknown and fails the run (an error, not
a charge); no agency has a subscription before the release, so the answer can't occur. Apply 0071,
then release.

## Testing

Unit: the GST amount; signatures; the dispatcher (each event type → the right call; a repeat
event skipped; a failure stored and answered 500); subscribe refusals (managed agency, hidden or
non-monthly price, live plan) and the stale `created` cleanup; cancel and change. Migration text
tests. End to end in test mode: subscribe with a test card through the tunnel or the dev
deployment, see the grant; Razorpay's test tools charge again and fail a charge.
