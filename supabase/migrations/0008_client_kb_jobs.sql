-- 1. Persist optional brand website URL on the client
alter table clients add column website_url text;

-- 2. KB job execution-scratchpad table (mirrors `generations` per D25)
create type client_kb_job_status as enum (
  'queued',
  'researching',
  'extracting',
  'finalizing',
  'succeeded',
  'failed'
);

create table client_kb_jobs (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  status          client_kb_job_status not null default 'queued',
  phase_message   text,
  website_url     text,
  doc_ids_used    uuid[] not null default '{}',
  trigger_run_id  text,
  version_id      uuid references client_kb_versions(id) on delete set null,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index client_kb_jobs_client_status_idx
  on client_kb_jobs(client_id, status);

-- 3. One running job per client — partial unique index
create unique index client_kb_jobs_one_running_idx
  on client_kb_jobs(client_id)
  where status in ('queued','researching','extracting','finalizing');

-- 4. Realtime publication
alter publication supabase_realtime add table client_kb_jobs;
