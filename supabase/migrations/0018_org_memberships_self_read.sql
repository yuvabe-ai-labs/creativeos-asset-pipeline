-- 0017 enabled RLS on org_memberships with zero policies (default-deny), but the
-- generations/canvases/client_kb_jobs policies from 0014 all subquery org_memberships
-- to find the caller's org_id. RLS applies across that subquery too — with no policy
-- allowing org_memberships to be read at all, the subquery returns nothing, so
-- `org_id = NULL` is never true, and every one of those tables' policies silently deny
-- everyone, including same-org reads. Confirmed live: the Generation Tray stopped
-- rendering immediately after 0017.
--
-- Fix: a user can read their OWN membership row. Narrow, correct, and exactly what the
-- subquery needs — not "see everyone's membership," just "see yourself."
create policy "own membership" on org_memberships for select
  using (user_id = auth.uid());
