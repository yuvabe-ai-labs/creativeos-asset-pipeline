-- Brand images imported from the website, Instagram and Facebook (D302-D305), and the generic
-- background_jobs table that tracks the imports (D306). See
-- docs/superpowers/specs/2026-10-05-brand-kb-social-asset-import-design.md §3.

-- ── client_brand_images: where each image came from ──────────────────────────
-- Additive: every existing row is an upload of an image, which is exactly what the defaults say.

alter table client_brand_images
  add column source        text not null default 'upload'
    check (source in ('upload', 'website', 'instagram', 'facebook')),
  add column media_type    text not null default 'image'
    check (media_type in ('image', 'video')),
  -- A video's poster still, re-hosted like the video itself (D304).
  add column thumbnail_url text,
  -- The post permalink or page the asset was found on.
  add column source_url    text,
  -- When the brand posted it (social sources only).
  add column posted_at     timestamptz,
  -- Dedupe key (D305): the Meta CDN filename for Instagram/Facebook, the query-less URL for the
  -- website. Null for uploads.
  add column source_ref    text;

-- One copy of each imported asset per client — a cross-post or a Refresh never adds it twice.
create unique index client_brand_images_source_ref_idx
  on client_brand_images (client_id, source_ref)
  where source_ref is not null;

-- The Brand assets grid's order: newest post first; a website asset (no post date) by when it
-- was imported. Stored so keyset pagination can seek on it with an index rather than sort the
-- client's whole library on every page.
alter table client_brand_images
  add column sort_at timestamptz generated always as (coalesce(posted_at, created_at)) stored;

create index client_brand_images_imported_page_idx
  on client_brand_images (client_id, sort_at desc, id desc)
  where source <> 'upload';

-- ── background_jobs: the lifecycle of any long-running job (D306) ────────────
-- Holds only what every job has — status, progress, input, result, error, run id, times. What a
-- job PRODUCES belongs in its own domain table (imported assets → client_brand_images). `kind`
-- has no check constraint on purpose: the TypeScript union in src/lib/jobs/types.ts is the
-- registry, so a new kind of job needs no migration.

create table background_jobs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  -- Null for a job that belongs to the org rather than one client.
  client_id      uuid references clients(id) on delete cascade,
  kind           text not null,
  status         text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  -- Human-readable progress ("Importing from Instagram…").
  phase_message  text,
  input          jsonb not null default '{}'::jsonb,
  result         jsonb,
  error          text,
  -- What may not run twice at once, e.g. "asset-import:<clientId>:instagram". Null = no lock.
  lock_key       text,
  trigger_run_id text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  updated_at     timestamptz not null default now()
);

create index background_jobs_client_kind_idx on background_jobs (client_id, kind, created_at desc);

-- One live job per lock key: a second Refresh while one runs is refused by the database.
create unique index background_jobs_one_live_idx
  on background_jobs (lock_key)
  where lock_key is not null and status in ('queued', 'running');

-- Default-deny RLS with zero policies, as 0041/0043: the app goes through the service-role client.
alter table background_jobs enable row level security;
