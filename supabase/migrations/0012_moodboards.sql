-- Client-level moodboards: named reference collections (URL-first — rows hold
-- image URLs, never bytes; full-res is re-hosted to GCS only on use). D13/D14.

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
