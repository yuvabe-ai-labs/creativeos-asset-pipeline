# Billing piece 7: Admin › Payments

**Date:** 2026-11-21 · **Branch:** `feat/razorpay-test` · **Map:** `2026-11-19-billing-phase-1-design.md`
(piece 7) · **No migration**

## Goal

One Admin page for money across every agency: what was paid this month, which plans need a look,
and the latest payments. Each agency links to its Billing tab, where everything about it can be
changed.

## Screen (`/admin/payments`, in the Admin section nav)

- **Totals:** paid this month (India-time calendar month, GST included, test top-ups left out),
  payments due (AI runs paused for those agencies), plans renewing in the next 7 days, and how many
  recent payments failed.
- **Needs a look:** plans with a payment due first, then plans ending (cancelled) within 7 days,
  soonest first. Plans that simply renew need nothing, so they are only counted in the totals
  (D529).
- **All payments:** every payment that went through, failed or was refunded, newest first, 25 a
  page with Newer / Older (D529).

## Calls

Four bounded reads in parallel (a sum of this month's paid rows, up to 100 plans that need a look,
an exact count of plans renewing within 7 days, one page of payments with its total), whatever the
number of agencies. Older pages come from `GET /api/admin/payments?page=N`.

## Later

Sending a payment link from Admin after a failed payment (Razorpay already retries the charge and
asks the owner to pay); the nightly check against Razorpay for missed webhooks; refunds from Admin.
