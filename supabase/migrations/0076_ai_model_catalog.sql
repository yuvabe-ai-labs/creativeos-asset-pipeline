-- D529–D533: the AI model catalog. docs/superpowers/specs/2026-11-21-model-catalog-design.md
-- Every model the app runs is a row in ai_models; its prices are dated rows in ai_model_prices
-- that are never edited. generations gains the price row a run used, the provider's bill, and a
-- flag for calls that record their cost without charging credits.

create table if not exists ai_models (
  id                text primary key,
  provider          text not null,
  kind              text not null check (kind in
                      ('image','video','edit','voice','dub','lipsync','transcribe','text','scrape')),
  label             text not null,
  picker_label      text,
  provider_label    text not null,
  description       text,
  status            text not null default 'draft' check (status in ('draft','live','hidden','retired')),
  replaced_by       text references ai_models(id),
  sort_order        integer not null default 0,
  adapter_key       text not null,
  provider_model_id text,
  params            jsonb not null default '[]'::jsonb check (jsonb_typeof(params) = 'array'),
  rules             jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  capabilities      jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null,
  check (replaced_by is null or replaced_by <> id)
);

create index if not exists ai_models_replaced_by_idx on ai_models (replaced_by);

-- Default-deny: only the service role touches it.
alter table ai_models enable row level security;

-- D530: one row per model per start date, never edited. A run uses the row with the latest
-- effective_from at or before its start.
create table if not exists ai_model_prices (
  id              uuid primary key default gen_random_uuid(),
  model_id        text not null references ai_models(id),
  effective_from  timestamptz not null,
  lines           jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  estimate        jsonb not null default '{}'::jsonb check (jsonb_typeof(estimate) = 'object'),
  source_url      text,
  note            text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- Also serves every lookup by model_id (its leading column), so no separate FK index.
  unique (model_id, effective_from)
);

alter table ai_model_prices enable row level security;

-- A price row is never edited; one that has not started yet may be deleted (cancelled).
create or replace function ai_model_prices_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'ai_model_prices rows are never edited; add a new row';
  end if;
  if old.effective_from <= now() then
    raise exception 'a price that has started cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists ai_model_prices_guard on ai_model_prices;
create trigger ai_model_prices_guard
  before update or delete on ai_model_prices
  for each row execute function ai_model_prices_guard();

-- D531, D532.
alter table generations
  add column if not exists model_price_id uuid references ai_model_prices(id),
  add column if not exists provider_bill  jsonb,
  add column if not exists record_only    boolean not null default false;

create index if not exists generations_model_price_id_idx on generations (model_price_id);
-- Usage reports read record-only rows by org and month; canvas and history queries go by node.
create index if not exists generations_org_record_only_created_idx
  on generations (org_id, record_only, created_at);
