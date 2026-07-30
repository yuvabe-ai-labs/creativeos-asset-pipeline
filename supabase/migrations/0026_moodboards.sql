-- Client-level moodboards: named reference collections (URL-first — rows hold
-- image URLs, never bytes; full-res is re-hosted to GCS only on use). D13/D92.
--
-- Renumbered from 0012 during the 2026-07-30 integration: this feature was built on a
-- branch cut when main topped out at 0011, and 0012 was taken by 0012_auth_multi_tenancy
-- in the meantime. Two differently-named 0012_*.sql files merge cleanly in git and only
-- break at apply time, so the collision had to be caught by hand.
--
-- ⚠️ DESTRUCTIVE — DROP AND RECREATE. This is a reset, not an additive migration.
-- Written this way because an earlier draft of this file was already hand-applied (as
-- 0012_moodboards.sql) WITHOUT the RLS lines below, so the tables exist but are
-- unprotected. Dropping is the simplest way to land the corrected shape; the only cost
-- is the collected references, which are cheap to re-collect by design (an item is a
-- row of URLs, D92 — no bytes are lost, nothing in GCS is touched).
--
-- Pre-flight count recorded before applying (project udxnhxferhiqjvnztyhm, 2026-07-30):
-- 1 moodboard, 9 moodboard_items. Both are discarded by this migration.
--
-- Note the ordering: moodboard_items is dropped first because it FKs to moodboards.
-- Re-running this file on any database is safe and always yields the same end state.

drop table if exists moodboard_items;
drop table if exists moodboards;

create table moodboards (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table moodboard_items (
  id           uuid primary key default gen_random_uuid(),
  moodboard_id uuid not null references moodboards(id) on delete cascade,
  image_url    text not null,          -- original image src (e.g. i.pinimg.com/…)
  source_url   text,                   -- provenance page the image was found on
  position     int  not null default 0,
  added_at     timestamptz not null default now()
);

create index moodboards_client_id_idx     on moodboards(client_id);
create index moodboard_items_board_id_idx on moodboard_items(moodboard_id);

-- Default-deny RLS, matching 0017_default_deny_rls.sql. That migration enabled RLS on
-- every table then in existence, to close a live exposure: with RLS off, Supabase's
-- default anon/authenticated grants let anyone holding the public anon key (shipped in
-- every page) read and write rows straight through the REST API, bypassing the DAL and
-- withClient entirely. These two tables are created AFTER 0017 ran, so they are not
-- covered by it and would reopen exactly that hole.
--
-- Zero policies is deliberate, not an omission: the app's own access goes through the
-- service-role client (createServerSupabase()), which bypasses RLS regardless. This only
-- removes the direct-REST path nothing was ever meant to use.
alter table moodboards      enable row level security;
alter table moodboard_items enable row level security;
