# Who used what (billing piece 6, part 2)

**Date:** 2026-11-21 · **Branch:** `feat/razorpay-test` · **Migration:** 0097 · **Builds on:** the owner
screens (`2026-11-21-owner-billing-design.md`, D582)

## Goal

On Billing, the owner sees where the credits went: this month or last month, by member, client or
canvas, each row opening to its runs. Agreed on the 20 November call ("down to generations").

## Data

- Credits are `generations.credits_charged`, written when a run settles (the same amount as its
  ledger consumption), so the view shows real costs, not estimates, and failed runs (nothing
  charged) are left out.
- Months are calendar months in India time.
- A member is `generations.user_id`; a client is `client_id`; a canvas is the run's node's
  `canvas_id`. Runs with no canvas (avatars, scripts) form one row, "Outside a canvas". A run whose
  member has left shows as "Someone no longer in the agency".
- `org_credit_usage_by(org, from, to, by)` (0097) groups and sums in the database. A new index on
  `generations (org_id, created_at)` serves it and the runs list.

## Calls

One view: the grouped sums (one RPC) and the names for its keys (one query). Opening a row: one
page of 20 runs (one query, the canvas filter through an inner join on nodes) and the members'
names (one query). Read in the browser with TanStack Query (`usageKeys`), cached for a minute.

## Screen

A section on Billing under Top up: Members / Clients / Canvases and This month / Last month as
two segmented choices, the month's total, one row per group with its credits, runs and a share
bar; a row opens to its runs (kind in plain words, model, when, who) with Newer / Older pages.
