-- D548: how a run's cost becomes credits, as dated rows the super admin changes like prices.
-- The credit rate (1 credit = $0.001) and rounding up stay in code. Apply before the 5a code deploys.
create table if not exists credit_settings (
  id              uuid primary key default gen_random_uuid(),
  effective_from  timestamptz not null unique,
  margin_percent  numeric(5,2) not null check (margin_percent >= 0 and margin_percent <= 200),
  round_step      integer not null check (round_step in (1, 5, 10)),
  note            text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create or replace function credit_settings_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'credit_settings rows are never edited; add a new row';
  end if;
  if old.effective_from <= now() then
    raise exception 'credit settings that have started cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists credit_settings_guard on credit_settings;
create trigger credit_settings_guard
  before update or delete on credit_settings
  for each row execute function credit_settings_guard();

-- Default-deny, as ai_model_prices (0076): only the service role touches it.
alter table credit_settings enable row level security;

-- Today's behaviour: no margin, round up to the next 5 credits.
insert into credit_settings (effective_from, margin_percent, round_step, note)
values ('2026-01-01T00:00:00Z', 0, 5, 'Starting settings')
on conflict (effective_from) do nothing;
