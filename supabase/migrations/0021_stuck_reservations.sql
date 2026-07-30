-- Stage 3 (Credit System) reconciliation sweep. See
-- docs/superpowers/specs/2026-07-24-credit-system-design.md §4, and the 3D scope note added
-- to docs/superpowers/plans/2026-07-24-credit-system-index.md after 3C's final review.
--
-- Every reservation row with no matching refund/consumption row for the same generation,
-- older than the 15-minute threshold (5-minute buffer above video-generate.ts's hard
-- maxDuration: 600). Covers two distinct real cases with one query: a generation still
-- stuck in `running` (the worker crashed or was force-killed, bypassing its own try/catch),
-- and a generation that's already `failed` but whose refund itself failed on a prior attempt
-- (found during 3C's Task 7 review — failGeneration succeeding while the immediately-
-- following refundReservation call throws). The reconciliation task (trigger/
-- reconcile-stuck-generations.ts) reads this and branches on the generation's current
-- status to decide whether failGeneration is still needed before refunding.
create view stuck_reservations as
select r.generation_id, r.org_id
from credit_transactions r
where r.type = 'reservation'
  and r.created_at < now() - interval '15 minutes'
  and not exists (
    select 1 from credit_transactions t
    where t.generation_id = r.generation_id
      and t.type in ('refund', 'consumption')
  );
