-- 0003_kb_onboarding.sql
-- Replaces base64 logo + context_notes with proper storage URL + kb_status gate.
-- Adds client_brand_images table for image uploads separate from KB documents.

-- clients: drop legacy columns, add logo_url + kb_status
alter table clients drop column if exists logo;
alter table clients drop column if exists context_notes;
alter table clients add column logo_url text;
alter table clients add column kb_status text not null default 'pending'
  check (kb_status in ('pending', 'in_review', 'ready'));

-- brand images (separate from KB documents, analyzed by vision model)
create table client_brand_images (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  filename    text not null,
  file_ext    text not null,
  storage_url text not null,
  size_bytes  bigint,
  created_at  timestamptz not null default now()
);

create index client_brand_images_client_idx on client_brand_images (client_id);
