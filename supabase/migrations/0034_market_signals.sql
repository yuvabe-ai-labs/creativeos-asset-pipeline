-- Market Signals V1 (D184–D189): the evidence layer extends moodboards; Signals are a
-- link-set over items. Additive only — every existing row is already valid
-- (board_type defaults 'custom', kind defaults 'image').
--
-- IDEMPOTENT: every statement is guarded, so re-running this file on any database is
-- safe and always yields the same end state. This matters because the file is applied
-- by hand in the Supabase SQL editor: a run that fails partway (or a second run against
-- an already-migrated database) must not error out, or the operator is left hand-editing
-- SQL to find the resume point.
--
-- NOT written with DROP statements on purpose. Dropping the moodboard_items columns to
-- force a clean re-run would discard captured notes and added_by attribution — the very
-- data that answers "does MR maintain the shelf?" (PRD §16). A deliberate hard reset is
-- the commented block at the foot of this file.

alter table moodboards
  add column if not exists board_type text not null default 'custom'
    check (board_type in ('custom', 'direct', 'adjacent'));

-- One Direct and one Adjacent board per client, no duplicates. Partial index so
-- 'custom' boards stay unlimited.
create unique index if not exists moodboards_client_system_board_uq
  on moodboards(client_id, board_type)
  where board_type <> 'custom';

alter table moodboard_items
  add column if not exists kind text not null default 'image'
    check (kind in ('image', 'gif', 'video', 'youtube', 'instagram', 'tiktok', 'link')),
  add column if not exists note          text,
  add column if not exists added_by      uuid references auth.users(id) on delete set null,
  add column if not exists thumbnail_url text;

-- A Signal is a designer-authored interpretation over evidence (D187). It LINKS items —
-- an item stays in its bucket and can back many signals. Deleting an item cascades it
-- out of every signal; a signal with zero items survives (deleting it is a human act).
create table if not exists signals (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  tags        text[] not null default '{}',
  description text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists signal_items (
  signal_id uuid not null references signals(id) on delete cascade,
  item_id   uuid not null references moodboard_items(id) on delete cascade,
  position  int not null default 0,
  primary key (signal_id, item_id)
);

create index if not exists signals_client_id_idx    on signals(client_id);
create index if not exists signal_items_item_id_idx on signal_items(item_id);

-- Default-deny RLS, same rationale as 0026: app access uses the service-role client;
-- zero policies closes the anon-key direct-REST path. (enable ... is idempotent.)
alter table signals      enable row level security;
alter table signal_items enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- DELIBERATE HARD RESET — commented out. Uncomment and run ONLY when you want to
-- discard Market Signals data and rebuild the schema from scratch. Order matters:
-- signal_items FKs signals, and both FK moodboard_items.
--
-- drop table if exists signal_items;
-- drop table if exists signals;
-- alter table moodboard_items
--   drop column if exists kind,
--   drop column if exists note,
--   drop column if exists added_by,
--   drop column if exists thumbnail_url;
-- drop index if exists moodboards_client_system_board_uq;
-- alter table moodboards drop column if exists board_type;
-- ─────────────────────────────────────────────────────────────────────────────
