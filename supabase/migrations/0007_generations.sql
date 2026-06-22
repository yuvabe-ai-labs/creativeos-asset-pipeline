-- Async generation job log. Tracks every video (and future image/prompt) attempt
-- with operational status and billing metadata. node_versions is unchanged.

create table generations (
  id               uuid primary key default gen_random_uuid(),
  node_id          uuid not null references nodes(id) on delete cascade,
  type             text not null,         -- 'image' | 'video' | 'prompt'
  status           text not null,         -- 'running' | 'succeeded' | 'failed'
  provider_job_id  text,
  model_used       text,
  params_snapshot  jsonb,
  inputs_snapshot  jsonb,
  tokens_used      jsonb,
  credits_consumed numeric,
  version_id       uuid references node_versions(id),
  user_id          uuid,
  error            text,
  meta             jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index generations_node_id_idx    on generations(node_id);
create index generations_status_idx     on generations(status);
create index generations_version_id_idx on generations(version_id);
