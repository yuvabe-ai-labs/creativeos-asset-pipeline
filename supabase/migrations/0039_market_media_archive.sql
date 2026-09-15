-- 0039_market_media_archive.sql
-- Market media archive (D257-D265).
--
-- Clips currently store a permalink plus one re-hosted JPEG (D92, D185): the media
-- itself has never been downloaded, so a board dies with the post and there are no
-- bytes for later AI processing. These columns hold the real media and the state of
-- getting it.
--
-- State lives here rather than in a jobs table: one item has at most one archive, and
-- `generations` is unusable for it (node_id NOT NULL references nodes — a market item
-- is not a node).

alter table moodboard_items
  add column if not exists media_url          text,
  add column if not exists media_bytes        bigint,
  add column if not exists media_type         text,
  add column if not exists archive_status     text not null default 'pending',
  add column if not exists archive_error      text,
  add column if not exists archive_attempts   int  not null default 0,
  add column if not exists archive_started_at timestamptz,
  add column if not exists archived_at        timestamptz;

-- text + CHECK rather than a Postgres enum, matching the `kind` column directly below
-- it. Unlike generations.status (0007, a comment with no constraint), this is enforced.
alter table moodboard_items
  drop constraint if exists moodboard_items_archive_status_check;
alter table moodboard_items
  add  constraint moodboard_items_archive_status_check
  check (archive_status in ('pending','downloading','ready','failed','skipped'));

-- Pinterest becomes a first-class kind (D260). The extension has clipped pins
-- correctly since v0.3.0 while the storage layer filed them as generic links.
--
-- The 0034 CHECK was created inline (`add column ... check (...)`), so Postgres
-- auto-named it — presumably moodboard_items_kind_check, but that is a GUESS: the
-- auto-namer appends 1, 2, ... on collision. Dropping by a guessed name fails
-- silently and destructively here: the drop matches nothing, the add succeeds under
-- a new name, and the table is left with TWO check constraints on `kind` — the old
-- one still rejecting 'pinterest'. The migration would report success and every pin
-- clip would then fail at INSERT.
--
-- So drop by DEFINITION instead of by name. Any check constraint on this table whose
-- body mentions 'tiktok' is the kind constraint and nothing else.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'moodboard_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%tiktok%'
  loop
    execute format('alter table moodboard_items drop constraint %I', c.conname);
  end loop;
end $$;

alter table moodboard_items
  add  constraint moodboard_items_kind_check
  check (kind in ('image','gif','video','youtube','instagram','tiktok','link','pinterest'));

-- The sweep's selection query, and only that. Partial so it stays small as `ready`
-- grows to dominate the table. 'downloading' is included so a row abandoned by a
-- crashed run is findable — without it those are invisible and stay stuck forever.
create index if not exists moodboard_items_archive_pending_idx
  on moodboard_items(archive_status)
  where archive_status in ('pending','failed','downloading');

-- Every pre-existing row now reads `pending`, which is what makes the nightly sweep a
-- backfill of the whole existing corpus with no separate migration script (D264).

-- ── Verify after running ──────────────────────────────────────────────────────
-- Exactly ONE check constraint should mention tiktok, and it must include pinterest:
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'moodboard_items'::regclass
--     and contype = 'c'
--     and pg_get_constraintdef(oid) like '%tiktok%';
--
-- And every existing row should be queued for the backfill:
--
--   select archive_status, count(*) from moodboard_items group by 1;
--   -- expect: pending | <all rows>
