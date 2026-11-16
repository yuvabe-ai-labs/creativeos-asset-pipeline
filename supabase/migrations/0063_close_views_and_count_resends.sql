-- 0063: closes the owner-rights views to the public API (final review C2) and counts every invite
-- send, Resend included, towards the 50-a-day limit (final review I4). It also takes uploads and
-- deletes in the node-files storage bucket away from the anon key, and indexes twelve foreign keys
-- that had no index. Apply after 0062.
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

-- ── 3. node-files uploads and deletes: service role only ───────────────────────
-- 0004 made the node-files bucket public and gave storage.objects an insert and a delete policy that
-- check only bucket_id. Despite their names ("Authenticated ...") they have no `to authenticated`,
-- so they apply to anon as well: the anon key from the browser bundle could upload any file into
-- the bucket or delete any file in it.
--
-- Nothing in the app writes to node-files any more. Every upload (File nodes, generations, brand
-- images, KB documents, logos, review assets, ...) goes to Google Cloud Storage through
-- src/lib/storage/index.ts (_put / _signPutUrl in src/lib/storage/gcs.ts): server-side puts, or
-- signed GCS PUT URLs the browser uploads to. NODE_FILE_BUCKET in src/lib/nodes/file-constants.ts is
-- a leftover constant with no reader. No code in src/ or trigger/ calls storage.from(...).upload,
-- createSignedUploadUrl, uploadToSignedUrl, getPublicUrl or createSignedUrl, and the browser
-- Supabase client is used only for Realtime. The one Supabase Storage call left is the delete in
-- removeObject (src/lib/storage/index.ts), for an old supabase.co public URL still held in a row,
-- and it runs on the service-role client (createServerSupabase), which bypasses RLS.
--
-- So both write policies are dropped and no new one is made: writes are the service role's only,
-- and anon and authenticated can't insert, update (there never was an update policy) or delete.
--
-- The "Public read node-files" policy and the bucket's public flag are left exactly as they are:
-- old rows can still hold supabase.co public URLs of files in this bucket, and the app shows them by
-- that URL (an image <img src>, a file link), so taking read away would break those images.
drop policy if exists "Authenticated insert node-files" on storage.objects;
drop policy if exists "Authenticated delete node-files" on storage.objects;

-- ── 4. Indexes for foreign keys that had none (performance rule 9) ──────────────
-- Each column is a foreign key with no index of its own and no composite index that leads with it
-- (docs/database-schema.md lists the existing ones). Deleting the parent row, or filtering by it,
-- scanned the table. org_invitations.org_id is not here: (org_id, created_at) already leads with it.
create index if not exists background_jobs_org_id_idx on background_jobs (org_id);
create index if not exists node_version_decisions_org_id_idx on node_version_decisions (org_id);
create index if not exists canvas_reviews_canvas_id_idx on canvas_reviews (canvas_id);
create index if not exists script_panel_takes_client_id_idx on script_panel_takes (client_id);
create index if not exists script_panel_picks_take_id_idx on script_panel_picks (take_id);
create index if not exists script_reviews_client_id_idx on script_reviews (client_id);
create index if not exists script_review_comments_version_id_idx on script_review_comments (version_id);
create index if not exists script_review_comments_parent_id_idx on script_review_comments (parent_id);
create index if not exists client_script_messages_client_id_idx on client_script_messages (client_id);
create index if not exists client_kb_jobs_version_id_idx on client_kb_jobs (version_id);
create index if not exists nodes_active_version_id_idx on nodes (active_version_id);
create index if not exists editor_edits_org_id_idx on editor_edits (org_id);

notify pgrst, 'reload schema';
