-- Market Signals V1 (D184–D189): the evidence layer extends moodboards; Signals are a
-- link-set over items. Additive only — every existing row is already valid
-- (board_type defaults 'custom', kind defaults 'image').

alter table moodboards
  add column board_type text not null default 'custom'
    check (board_type in ('custom', 'direct', 'adjacent'));

-- One Direct and one Adjacent board per client, no duplicates. Partial index so
-- 'custom' boards stay unlimited.
create unique index moodboards_client_system_board_uq
  on moodboards(client_id, board_type)
  where board_type <> 'custom';

alter table moodboard_items
  add column kind text not null default 'image'
    check (kind in ('image', 'gif', 'video', 'youtube', 'instagram', 'tiktok', 'link')),
  add column note          text,
  add column added_by      uuid references auth.users(id) on delete set null,
  add column thumbnail_url text;

-- A Signal is a designer-authored interpretation over evidence (D187). It LINKS items —
-- an item stays in its bucket and can back many signals. Deleting an item cascades it
-- out of every signal; a signal with zero items survives (deleting it is a human act).
create table signals (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  tags        text[] not null default '{}',
  description text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table signal_items (
  signal_id uuid not null references signals(id) on delete cascade,
  item_id   uuid not null references moodboard_items(id) on delete cascade,
  position  int not null default 0,
  primary key (signal_id, item_id)
);

create index signals_client_id_idx    on signals(client_id);
create index signal_items_item_id_idx on signal_items(item_id);

-- Default-deny RLS, same rationale as 0026: app access uses the service-role client;
-- zero policies closes the anon-key direct-REST path.
alter table signals      enable row level security;
alter table signal_items enable row level security;
