-- 0063: closes the owner-rights views to the public API (final review C2) and counts every invite
-- send, Resend included, towards the 50-a-day limit (final review I4). Apply after 0062.
-- Safe to run twice: every statement is guarded or idempotent.

-- ── 1. The three views read only by the server ────────────────────────────────
-- review_queue_items (0031, redefined in 0032), org_credit_usage (0019) and stuck_reservations
-- (0021, redefined in 0028 and 0055) were created as plain views. On Supabase a public-schema view
-- gets the default grants to anon and authenticated and runs with its owner's rights, so RLS on
-- the tables under it doesn't apply: the anon key from the browser bundle could read every
-- agency's review queue, credit spend and stuck reservations.
--
-- Every read of them goes through the service-role client (createServerSupabase), never the
-- browser's:
--   review_queue_items  src/lib/db/review.ts listCanvasPendingItems, listCanvasApprovalStatuses,
--                       listOrgReviewInbox (and, through org_review_counts below, getOrgReviewCounts)
--   org_credit_usage    src/lib/db/organizations.ts getOrgCreditUsage
--   stuck_reservations  trigger/reconcile-stuck-generations.ts (the 15-minute sweep)
-- so each one is revoked from anon and authenticated: service role only. security_invoker is set
-- as well, so if a later migration re-grants one by mistake it reads through the tables' own RLS
-- rather than the owner's rights. The service role bypasses RLS, so neither change alters a read.
revoke all on review_queue_items from anon, authenticated;
grant select on review_queue_items to service_role;
alter view review_queue_items set (security_invoker = true);

revoke all on org_credit_usage from anon, authenticated;
grant select on org_credit_usage to service_role;
alter view org_credit_usage set (security_invoker = true);

revoke all on stuck_reservations from anon, authenticated;
grant select on stuck_reservations to service_role;
alter view stuck_reservations set (security_invoker = true);

-- org_review_counts (0031) is the pending-count read over review_queue_items, called only by
-- getOrgReviewCounts (src/lib/db/review.ts) on the service-role client. It kept the default PUBLIC
-- execute; the view's revoke above already stops it for anon, and this closes it outright.
revoke all on function org_review_counts(uuid) from public, anon, authenticated;
grant execute on function org_review_counts(uuid) to service_role;

-- org_review_counts_for_types (0062) has no caller in src/ or trigger/ and had PUBLIC execute over
-- the same view. Dropped.
drop function if exists org_review_counts_for_types(uuid, text[]);

-- ── 2. Every invite send counts towards the daily limit (spec §6.7) ────────────
-- Resend replaces the token and moves org_invitations.created_at to now (the 60-second gap reads
-- it), so counting invitation rows saw an invite once however often it was resent. Instead each
-- agency keeps a fixed-window counter: the window starts at its first send and lasts 24 hours,
-- then the next send starts a new one. It is not a rolling 24 hours, which is fine for a limit
-- that only stops abuse. One row and one atomic update answer "how many sends today"; a log of
-- every send would only be worth it for per-send history, which the audit log already keeps for
-- Admin.
alter table organizations
  add column if not exists invite_window_start timestamptz,
  add column if not exists invite_window_count int not null default 0;

-- Takes one send from the agency's window: true when allowed (and counted), false when the limit
-- is reached. The check and the count are one update on the agency's row, so two concurrent sends
-- at 49 can't both pass. Called by the app (src/lib/db/people.ts takeInviteSend) right before a
-- new member invite, Admin's Invite an owner and every Resend. A new agency's owner invite
-- (create_agency_with_owner_invite) is its first send ever and is not counted.
create or replace function take_invite_send(p_org_id uuid, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update organizations
     set invite_window_start = case
           when invite_window_start is null or invite_window_start <= now() - interval '1 day' then now()
           else invite_window_start end,
         invite_window_count = case
           when invite_window_start is null or invite_window_start <= now() - interval '1 day' then 1
           else invite_window_count + 1 end
   where id = p_org_id
     and (invite_window_start is null
          or invite_window_start <= now() - interval '1 day'
          or invite_window_count < p_limit);
  return found;
end;
$$;
revoke all on function take_invite_send(uuid, int) from public, anon, authenticated;
grant execute on function take_invite_send(uuid, int) to service_role;

notify pgrst, 'reload schema';
