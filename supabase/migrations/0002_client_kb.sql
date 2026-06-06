-- CreativeOS — Client Knowledge Base (Increment KB/1)
-- Adds KB documents storage tracking and versioned extraction log.

-- 1. KB DOCUMENTS — one row per uploaded file per client
create table client_kb_documents (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  filename    text not null,
  file_ext    text not null,    -- 'pdf' | 'docx' | 'pptx' | 'md' | 'txt'
  storage_url text not null,    -- Supabase Storage public URL
  size_bytes  bigint,
  created_at  timestamptz not null default now()
);

-- 2. KB VERSIONS — append-only extraction log
create table client_kb_versions (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  output       jsonb not null,       -- full BrandKB JSON
  model_used   text not null,
  doc_ids_used uuid[] not null,      -- document IDs that fed this extraction
  fill_rate    float,                -- fraction of fields filled (0.0–1.0)
  note         text,
  created_at   timestamptz not null default now()
);

-- 3. Active KB pointer on client (nullable back-pointer, same pattern as nodes)
alter table clients
  add column active_kb_version_id uuid
  references client_kb_versions(id) on delete set null;

-- Indexes for the reads we'll do
create index client_kb_documents_client_idx on client_kb_documents (client_id);
create index client_kb_versions_client_idx  on client_kb_versions (client_id);
