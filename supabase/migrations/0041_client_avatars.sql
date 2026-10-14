-- Client avatars (D287, D288). See docs/superpowers/specs/2026-09-29-client-avatars-design.md.
-- Purely additive: one new table, nothing existing is altered.

create table client_avatars (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null default '',
  story       text not null default '',
  -- Derived from the front image's source: 'specific' for an upload, 'generic' for a
  -- generated image. Null until there is a front image.
  person_type text check (person_type in ('generic', 'specific')),
  -- Consent for a real person's likeness (an uploaded front): who confirmed, and when.
  -- Null for a generated front, and cleared whenever the front image is replaced.
  likeness_consent_by uuid references auth.users(id) on delete set null,
  likeness_consent_at timestamptz,
  -- AvatarImage JSON: { url, width, height, sizeBytes, source }. JSONB rather than columns
  -- because `source` is a tagged union read whole; nothing filters on its fields in SQL.
  front       jsonb,
  sheet       jsonb,
  sheet_stale boolean not null default false,
  -- Written by plan 3 (voices). Present now so that plan needs no alter on this table.
  voice        jsonb,
  voice_sample jsonb,
  status      text not null default 'draft' check (status in ('draft', 'ready')),
  archived_at timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The library always reads one client's live avatars.
create index client_avatars_client_idx on client_avatars (client_id, archived_at);

-- Default-deny RLS with zero policies, as 0027_brand_kit.sql: the app reads and writes through
-- the service-role client; this only closes the direct-REST path the anon key would open.
alter table client_avatars enable row level security;
