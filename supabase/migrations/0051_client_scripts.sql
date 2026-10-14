-- Script copilot spec 1: a client's reel scripts. See
-- docs/superpowers/specs/2026-10-08-script-copilot-1-library-and-script-design.md.
-- Purely additive: one new table, nothing existing is altered.

create table client_scripts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  stage       text not null default 'generate'
                check (stage in ('generate', 'visualise', 'in_review', 'approved')),
  -- The whole script (header, context card, cast, shots), validated by scriptDocSchema
  -- (src/lib/scripts/schema.ts) on every read. JSONB because it is always read and written
  -- whole; nothing filters on its fields in SQL.
  doc         jsonb not null,
  approved_at timestamptz,
  archived_at timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The library and the gallery's Scripts tab always read one client's live scripts.
create index client_scripts_client_idx on client_scripts (client_id, archived_at, stage);

-- Default-deny RLS with zero policies, as 0041_client_avatars.sql: the app reads and writes
-- through the service-role client; this only closes the direct-REST path the anon key opens.
alter table client_scripts enable row level security;
