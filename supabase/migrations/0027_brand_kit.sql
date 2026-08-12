-- Brand Kit: client-level logos, backgrounds and product shots, plus the contact
-- details that let footer components fill themselves in. See
-- docs/superpowers/specs/2026-08-05-brand-kit-design.md and ADR D129-D135.
--
-- Purely additive. Nothing is dropped and no existing row is rewritten.

-- Assets get their OWN table rather than joining client_brand_images (D129). That table
-- is the KB's vision-analysis corpus — every reference photo uploaded to teach the
-- extraction model what the brand looks like. Those rows are pipeline inputs, not
-- material anyone chose to design with, and mixing them would bury three usable logos
-- among forty analysis photos.
create table client_brand_assets (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  category    text not null check (category in ('logo', 'background', 'product')),
  name        text not null,
  storage_url text not null,
  -- Reserved for reordering the panel later without a migration. Nothing writes anything
  -- but the default today.
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

-- The panel always reads one client's assets, usually filtered to one section.
create index client_brand_assets_client_idx on client_brand_assets (client_id, category);

-- Contact and social details (D130). JSONB rather than a column each because the set will
-- grow — a second number, a fourth social — and nothing queries or filters on these
-- fields; they are read whole and rendered. Not the KB: that is model-extracted and
-- versioned, so a re-extraction could silently rewrite a phone number an operator typed.
alter table clients add column if not exists brand_details jsonb not null default '{}';

-- Default-deny RLS, matching 0017_default_deny_rls.sql. That migration enabled RLS on
-- every table then in existence, to close a live exposure: with RLS off, Supabase's
-- default anon/authenticated grants let anyone holding the public anon key (shipped in
-- every page) read and write rows straight through the REST API, bypassing the DAL and
-- withClient entirely. This table is created AFTER 0017 ran, so it is not covered by it
-- and would reopen exactly that hole.
--
-- Zero policies is deliberate, not an omission: the app's own access goes through the
-- service-role client (createServerSupabase()), which bypasses RLS regardless. This only
-- removes the direct-REST path nothing was ever meant to use.
alter table client_brand_assets enable row level security;
