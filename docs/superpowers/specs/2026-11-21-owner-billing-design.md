# Billing piece 6: the owner's screens

**Date:** 2026-11-21 · **Branch:** `feat/razorpay-test` · **Map:** `2026-11-19-billing-phase-1-design.md`
(piece 6) · **No migration**

## Goal

The owner of an agency that pays for a plan sees and manages billing in the product: a line at the
top of the workspace, a Billing page, a Plans page, credits left in the profile popover, and a
plain reason whenever an AI run is refused. Members never see credits or billing; when runs are
paused they are told to ask the owner. Managed agencies see what they see today.

## Screens

- **Header:** a Billing link beside Team, for owners of paying agencies, with a dot when a payment
  is due, credits are used up, or there is no plan.
- **Workspace bar** (under the header, not on sign-in, Admin, Billing or review links), one line:

  | State | Owner | Member |
  |---|---|---|
  | Free credits, no plan | "You have 48,000 free credits until 3 Dec 2026." · See plans | nothing |
  | No credits, no plan | "Pick a plan to start generating." · See plans | "AI runs are paused for your agency. Ask your agency owner." |
  | Payment due | "Your payment didn't go through, so AI runs are paused. Nothing is lost." · Open billing | same as above |
  | Used up | "You've used this month's credits, so AI runs are paused." · Top up | same as above |
  | 80% used | "You've used 80% of this month's credits. 20,000 left." · Top up | nothing |

- **Billing** (`/billing`, owners of paying agencies; 404 for others): one card with the plan
  (name, price, credits, renews or ends, Payment due as the only warning, Change plan, Cancel plan
  with a confirmation that says there is no refund and when it ends) and the credits (left in all,
  then each kind with its end, the first-ending first); top-up packs with Buy (only on a running
  plan); payments with the total including GST.
- **Plans** (`/billing/plans`): the same card face as Admin › Plans and prices. No plan: "Pick
  Starter" pays now. On a plan: Current plan, or "Change to Studio" from the next payment, after a
  confirmation.
- **Profile popover:** a paying owner sees credits left of what they have, with a link to Billing;
  it moves live as runs use credits. Managed agencies keep used / limit.

## One look per concept

- `PlanCardFace` is the plan and pack face in Admin and on the owner's pages.
- `CreditGrantList` is the credits list on Billing and in Admin (Admin passes row actions).
- `useBillingCheckout` is the one place that runs Checkout for plans and top-ups.

## Refused runs

`reserveCredits` already returns a reason. Every route now throws `creditLimitError(reason)`, whose
message is the members' wording for that reason, safe to show anyone (some screens show the
server's text as is). The browser's 402 handlers call `creditRefusalMessage(serverMessage)`, which
recognises the wording and swaps in the owners' wording when the viewer owns the agency
(`setViewerOwnsAgency`, set by the always-mounted profile popover). An unknown message falls back
to today's limit message. Image starts store the same wording on the failed row, and the canvas
feed counts it as already reported.

## /api/me

Gains `billing`: for owners, a summary (mode, state, left, total, free left and end, plan end); for
members, only mode and whether runs are paused. Read in the existing parallel batch (open grants
and the live plan: two more small reads), so the header, bar and popover make no requests of
their own. A failed read leaves `billing` null.

## Not in this piece

Who used what by member, client and canvas (needs new reads; next), invoices to download,
emails, removing `/billing-test` (kept for the test top-up until the end-to-end test).
