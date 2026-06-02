-- CreativeOS — initial schema (Stage 1 / increment 1D)
-- Mirrors docs/superpowers/specs/2026-05-30-creativeos-architecture.md §6.
-- Rows are identified by a stable uuid PK; clients/canvases also carry a human
-- `slug` used in URLs (e.g. /clients/acme-co/canvases/spring-reel).

-- 1. CLIENTS — top of the hierarchy; holds ambient client context
create table clients (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,                 -- URL handle
  name          text not null,
  logo          text,                                 -- storage path/URL (data-URL in 1B)
  context_notes text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2. CANVASES — one creative project
create table canvases (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  slug       text not null,                           -- unique within its client
  name       text not null,
  viewport   jsonb not null default '{"x":0,"y":0,"zoom":1}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, slug)
);

-- 3. NODES — uniform machinery columns; type-specific stuff in `data`
create table nodes (
  id                uuid primary key default gen_random_uuid(),
  canvas_id         uuid not null references canvases(id) on delete cascade,
  type              text not null,            -- 'brief' | 'text' | ... (one type so far)
  position          jsonb not null default '{"x":0,"y":0}',
  data              jsonb not null default '{}',
  active_version_id uuid,                     -- -> node_versions.id (set below)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 4. NODE_VERSIONS — append-only log (the "learning" backbone)
create table node_versions (
  id          uuid primary key default gen_random_uuid(),
  node_id     uuid not null references nodes(id) on delete cascade,
  inputs_used jsonb not null default '{}',
  params_used jsonb not null default '{}',
  model_used  text,
  output      jsonb,
  error       text,
  decision    text,                           -- 'approved' | 'rejected' | null
  note        text,
  operator    text,
  created_at  timestamptz not null default now()
);

-- the active-output pointer (added after both tables exist; nullable back-pointer)
alter table nodes
  add constraint nodes_active_version_fk
  foreign key (active_version_id) references node_versions(id) on delete set null;

-- 5. EDGES — designed now, used from increment 1E/Stage 2. Point to NODES.
create table edges (
  id             uuid primary key default gen_random_uuid(),
  canvas_id      uuid not null references canvases(id) on delete cascade,
  source_node_id uuid not null references nodes(id) on delete cascade,
  target_node_id uuid not null references nodes(id) on delete cascade,
  source_handle  text,
  target_handle  text,
  created_at     timestamptz not null default now()
);

-- helpful indexes for the reads we'll do
create index nodes_canvas_id_idx        on nodes (canvas_id);
create index node_versions_node_id_idx  on node_versions (node_id);
create index edges_canvas_id_idx        on edges (canvas_id);
create index canvases_client_id_idx     on canvases (client_id);
