# Billing piece 1: credit grants and the paying-agency balance

**Date:** 2026-11-20 · **Branch:** `feat/razorpay-test` · **Map:** `2026-11-19-billing-phase-1-design.md`
(piece 1) · **Migration:** 0067

## Goal

Give paying agencies a balance made of credits that end, used in end-date order, without
changing anything for managed agencies. Nothing in this piece is visible to owners yet; pieces 2
to 6 write grants and show them.

## Out of scope

Screens (pieces 2, 6), plans and prices (3), payments (4, 5), the failed-payment stop (5).

## Schema (migration 0067)

```
organizations
  + billing_mode  text not null default 'managed' check in ('managed', 'plans')
  + plan_type     text not null default 'standard' check in ('standard', 'custom')

credit_grants
  id          uuid pk
  org_id      uuid not null → organizations on delete cascade
  kind        text not null check in ('free', 'plan', 'topup', 'admin')
  credits     numeric not null check (credits >= 0)
  used        numeric not null default 0        -- running total of credit_grant_uses
  starts_at   timestamptz not null default now()
  ends_at     timestamptz not null, check (ends_at > starts_at)
  payment_id  uuid → billing_payments on delete set null   -- set by pieces 4 and 5
  created_by  uuid → auth.users on delete set null
  reason      text
  created_at  timestamptz not null default now()
  index (org_id, ends_at)

credit_grant_uses
  generation_id  uuid not null → generations on delete cascade
  grant_id       uuid not null → credit_grants on delete cascade
  credits        numeric not null check (credits >= 0)
  primary key (generation_id, grant_id), index (grant_id)

billing_log
  id, org_id (indexed), actor_id → auth.users, action text, before jsonb, after jsonb,
  reason text, created_at
```

RLS on for all three new tables. Owners of the agency read `credit_grants` (the owner-only rule
of 0065); `credit_grant_uses` and `billing_log` have no policies (server only). No insert, update
or delete policies anywhere: only the service role writes.

Existing agencies get `billing_mode = 'managed'` from the default. Nothing else changes for them.

## Functions

All `security definer`, `set search_path = public`, executable by `service_role` only. Each locks
the agency's `organizations` row first, so reservations and settlements for one agency run one at
a time (as `reserve_credits` does today).

### `reserve_credits_v2(p_org_id, p_generation_id, p_amount) returns text`

- **Managed:** exactly today's check (this month's ledger sum against `monthly_credit_limit`, null
  means no limit). Refused: `'limit'`.
- **Paying:** the agency's open grants (`starts_at <= now() < ends_at`) ordered by `ends_at`, then
  `created_at`. If the credits left on them (`credits - used`, never below 0) add up to less than
  `p_amount`, refuse with a reason:
  - `'used_up'` when there is at least one open grant;
  - `'free_ended'` when there is none, and every grant the agency ever had is `free`;
  - `'no_credits'` otherwise (never had a grant, or the plan month ended).
  Otherwise take `p_amount` from the grants in that order, writing one `credit_grant_uses` row per
  grant touched and adding to each grant's `used`.
- **Both:** on success insert the `reservation` row in `credit_transactions` as today and return
  `'ok'`.

A new name, not a changed `reserve_credits`: the old function returns boolean and the code that
calls it keeps working until this release is live. 0068 drops the old one.

### `settle_credits(p_org_id, p_generation_id, p_actual) returns boolean`

One transaction, replacing the three queries in `settleGeneration`:

1. Lock the agency. If a `refund` or `consumption` row for the generation
   already exists, return false (repeat call; nothing changes).
2. Insert `refund` (minus the reservation) and `consumption` (`p_actual`) as today.
3. Move the hold to the real cost on the same grants: walk this generation's uses in the grants'
   end order and set each to its share of `p_actual` (fill the first, then the next), adjusting
   each grant's `used` by the difference; a use that drops to 0 is deleted. If `p_actual` is more
   than was held, the extra goes to the agency's open grants with credits left, in end order; any
   rest stays on the last grant the run used (that grant shows more used than it had; the balance
   counts it as 0 left).
4. Return true.

A run that holds no uses (a managed agency) only gets step 2.

### `refund_credits(p_org_id, p_generation_id) returns boolean`

Same guard as step 1; insert the `refund` row; subtract each use from its grant's `used`, delete
the uses. Returns true when it refunded.

### `credit_balance(p_org_id) returns table (grant_id, kind, credits, used, left_credits, ends_at)`

The open grants, for screens (pieces 2, 6). Executable by `service_role`.

## Code

- `src/lib/db/credit-transactions.ts`:
  - `reserveCredits` calls `reserve_credits_v2` and returns `{ ok: boolean; reason?: CreditRefusal }`
    (`CreditRefusal = 'limit' | 'used_up' | 'free_ended' | 'no_credits'`). Callers read `ok` as
    today, so the 19 call sites don't change. The reason reaches the screens in piece 6.
  - `settleGeneration` calls `settle_credits`; `refundReservation` calls `refund_credits`. Same
    signatures. `getReservedAmount` and `alreadySettled` go (the guard is in SQL).
- `src/lib/billing/grants.ts`: the `CreditRefusal` and `GrantKind` types and `CREDIT_REFUSALS`.
- `src/lib/db/credit-grants.ts`: `listOpenGrants(orgId)` (calls `credit_balance`), used from piece 2.

## Rollout

The migration must be applied before the code that calls the new functions. The old
`reserve_credits` stays until 0068, so code from before this release keeps working while the
migration is applied first.

## Checking the SQL

Text tests pin: the defaults, the grants' order (`order by g.ends_at, g.created_at`), the org lock
in each function, the repeat guard, the grants to `service_role` only.

By hand on staging after applying (a paying test agency; write grants with SQL):

1. No grants: a run is refused with `no_credits`.
2. Free 1,000 ending tomorrow: a 300 run holds 300 on it; settled at 250, the grant shows 250 used.
3. Free 1,000 (ends in 2 days) and plan 5,000 (ends in 30): a 1,200 run takes 1,000 from free
   (or what is left on it) and the rest from plan.
4. Refund: the uses go and `used` drops back.
5. The same settle sent twice changes nothing the second time.
6. Free grant's end moved to yesterday, no other grant: refused with `free_ended`.
7. A managed agency with a limit behaves as before (limit reached: `limit`).
