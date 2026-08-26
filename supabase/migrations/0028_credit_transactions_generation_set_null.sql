-- Fixes a gap between migration 0007 (generations.node_id references nodes(id) on delete
-- cascade) and 0019 (credit_transactions.generation_id, added later, with no ON DELETE
-- action — defaults to RESTRICT). Deleting any node with a billed generation blocked the
-- whole delete with a 23503 foreign key violation: Postgres couldn't cascade
-- nodes -> generations while credit_transactions still pointed at that generation. Seen in
-- production as an autosave request (saveCanvasNodes) retrying the same delete forever.
--
-- credit_transactions is an append-only ledger and the source of truth for org_credit_usage
-- sums — rows must never be destroyed. So instead of cascading the delete into
-- credit_transactions, orphaned rows keep their amount/type/org_id and just lose the
-- now-dangling generation_id.
alter table credit_transactions alter column generation_id drop not null;
alter table credit_transactions drop constraint credit_transactions_generation_id_fkey;
alter table credit_transactions
  add constraint credit_transactions_generation_id_fkey
  foreign key (generation_id) references generations(id) on delete set null;

-- stuck_reservations (migration 0021) self-joins on generation_id to find reservations with
-- no matching refund/consumption row. NULL = NULL is never true in SQL, so without this an
-- orphaned row (generation deleted, including any already-settled refund/consumption rows
-- orphaned by the same delete) would look like a fresh unmatched reservation, and
-- reconcile-stuck-generations would retry it every 15 minutes forever — failing each time on
-- getGeneration(null), since there is no generation left to reconcile against.
create or replace view stuck_reservations as
select r.generation_id, r.org_id
from credit_transactions r
where r.type = 'reservation'
  and r.generation_id is not null
  and r.created_at < now() - interval '15 minutes'
  and not exists (
    select 1 from credit_transactions t
    where t.generation_id = r.generation_id
      and t.type in ('refund', 'consumption')
  );
