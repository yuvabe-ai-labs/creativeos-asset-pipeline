-- Stage 3 (Credit System) foundation. See docs/superpowers/specs/2026-07-24-credit-system-design.md.
--
-- generations.credits_consumed has always held raw USD, never credits, despite the name —
-- there is no production data yet (pre-launch MVP), so this is a direct rename, not a
-- backward-compatible migration.
alter table generations rename column credits_consumed to cost_usd;

-- Actual credits deducted at settlement — a denormalized copy of that generation's
-- `consumption` row in credit_transactions (below), written in the same settlement step so
-- the two always agree. Nullable and left unbackfilled: existing rows predate the credit
-- system, and this stays null for every row until sub-plan 3C wires up settlement.
alter table generations add column credits_charged numeric;

-- Append-only ledger. amount is credits: positive for reservation/consumption/adjustment-up,
-- negative for refund. Every generation reaches exactly one terminal state, and every
-- terminal state refunds its reservation exactly once (success: refund + consumption;
-- failure: refund only) — see design spec §4 — so a plain sum of every row is always correct.
create table credit_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  generation_id uuid not null references generations(id),
  amount numeric not null,
  type text not null check (type in ('reservation', 'consumption', 'refund', 'adjustment')),
  created_at timestamptz not null default now()
);

create index credit_transactions_org_id_idx on credit_transactions (org_id);
create index credit_transactions_generation_id_idx on credit_transactions (generation_id);
create index credit_transactions_org_id_created_at_idx on credit_transactions (org_id, created_at);

alter table credit_transactions enable row level security;

-- Backstop only (D78 pattern) — the app's real reads go through the service-role client,
-- which bypasses RLS entirely. This just denies direct anon/authenticated REST access to
-- other orgs' ledger rows.
create policy "org isolation" on credit_transactions for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- Sums every ledger row for the current UTC calendar month per org. Recomputed on every
-- query (a view, not a materialized snapshot) so "this month" always reflects query time.
create view org_credit_usage as
select
  org_id,
  sum(amount) as credits_used
from credit_transactions
where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
group by org_id;

-- monthly_credit_limit was entered before credits vs. USD was defined. 1 credit = $0.001 USD
-- (see design spec §2 — USD_TO_CREDITS), so an admin who typed "500" meaning "$500/month"
-- keeps the same real-world meaning after this one-time ×1000 conversion.
update organizations
  set monthly_credit_limit = monthly_credit_limit * 1000
  where monthly_credit_limit is not null;
