-- Billing piece 1: credit grants (spec 2026-11-20-credit-grants-design.md, D515).
-- A paying agency's credits are grants that end (free credits, plan months, top-ups, Yuvabe's
-- added credits). A run's hold is taken from the grant that ends first, and settling moves the
-- real cost onto the same grants. Managed agencies (every agency today) have no grants and keep
-- the monthly limit unchanged. Only the server writes; owners read their own grants.

alter table organizations
  add column billing_mode text not null default 'managed' check (billing_mode in ('managed', 'plans')),
  add column plan_type text not null default 'standard' check (plan_type in ('standard', 'custom'));

create table credit_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('free', 'plan', 'topup', 'admin')),
  credits numeric not null check (credits >= 0),
  -- Running total of this grant's rows in credit_grant_uses, kept by the functions below.
  used numeric not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  payment_id uuid references billing_payments(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index credit_grants_org_id_ends_at_idx on credit_grants (org_id, ends_at);
create index credit_grants_payment_id_idx on credit_grants (payment_id);

-- How much of each grant a run holds (before it ends) or used (after).
create table credit_grant_uses (
  generation_id uuid not null references generations(id) on delete cascade,
  grant_id uuid not null references credit_grants(id) on delete cascade,
  credits numeric not null check (credits >= 0),
  primary key (generation_id, grant_id)
);

create index credit_grant_uses_grant_id_idx on credit_grant_uses (grant_id);

-- Every billing change Yuvabe makes to an agency: who, what, before and after, why.
create table billing_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index billing_log_org_id_idx on billing_log (org_id);

alter table credit_grants enable row level security;
alter table credit_grant_uses enable row level security;
alter table billing_log enable row level security;

create policy "owners read" on credit_grants for select
  using (exists (
    select 1 from org_memberships m
     where m.user_id = auth.uid() and m.org_id = credit_grants.org_id and m.is_owner
  ));

-- Replaces reserve_credits (which stays until 0068 so the code from before this release keeps
-- working while the migration goes first). 'ok', or why the run was refused.
create or replace function reserve_credits_v2(
  p_org_id uuid,
  p_generation_id uuid,
  p_amount numeric
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_limit numeric;
  v_used numeric;
  v_left numeric;
  v_open integer;
  v_any integer;
  v_not_free integer;
  v_need numeric;
  v_take numeric;
  rec record;
begin
  select billing_mode, monthly_credit_limit into v_mode, v_limit
    from organizations where id = p_org_id for update;
  if not found then
    return 'no_credits';
  end if;

  if v_mode = 'managed' then
    -- Today's check: a null limit always proceeds.
    if v_limit is not null then
      select coalesce(sum(amount), 0) into v_used
        from credit_transactions
       where org_id = p_org_id
         and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
      if v_used + p_amount > v_limit then
        return 'limit';
      end if;
    end if;
  else
    select coalesce(sum(greatest(g.credits - g.used, 0)), 0), count(*) into v_left, v_open
      from credit_grants g
     where g.org_id = p_org_id and g.starts_at <= now() and g.ends_at > now();

    if v_left < p_amount then
      if v_open > 0 then
        return 'used_up';
      end if;
      select count(*), count(*) filter (where g.kind <> 'free') into v_any, v_not_free
        from credit_grants g where g.org_id = p_org_id;
      if v_any > 0 and v_not_free = 0 then
        return 'free_ended';
      end if;
      return 'no_credits';
    end if;

    v_need := p_amount;
    for rec in
      select g.id, greatest(g.credits - g.used, 0) as left_now
        from credit_grants g
       where g.org_id = p_org_id and g.starts_at <= now() and g.ends_at > now()
       order by g.ends_at, g.created_at
    loop
      exit when v_need <= 0;
      v_take := least(rec.left_now, v_need);
      if v_take > 0 then
        insert into credit_grant_uses (generation_id, grant_id, credits)
        values (p_generation_id, rec.id, v_take);
        update credit_grants set used = used + v_take where id = rec.id;
        v_need := v_need - v_take;
      end if;
    end loop;
  end if;

  insert into credit_transactions (org_id, generation_id, amount, type)
  values (p_org_id, p_generation_id, p_amount, 'reservation');

  return 'ok';
end;
$$;

-- A run ended well: refund the hold and record the real cost (as settleGeneration did), and move
-- the cost onto the grants the run held, first-ending first. Cost above the hold goes to open
-- grants with credits left, in end order; any rest stays on the last grant the run used. False
-- when the run was already settled or refunded.
create or replace function settle_credits(
  p_org_id uuid,
  p_generation_id uuid,
  p_actual numeric
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved numeric;
  v_rest numeric;
  v_share numeric;
  v_last uuid;
  held record;
  rec record;
begin
  perform 1 from organizations where id = p_org_id for update;

  if exists (
    select 1 from credit_transactions
     where generation_id = p_generation_id and type in ('refund', 'consumption')
  ) then
    return false;
  end if;

  select coalesce(sum(amount), 0) into v_reserved
    from credit_transactions
   where generation_id = p_generation_id and type = 'reservation';

  insert into credit_transactions (org_id, generation_id, amount, type) values
    (p_org_id, p_generation_id, -v_reserved, 'refund'),
    (p_org_id, p_generation_id, p_actual, 'consumption');

  v_rest := p_actual;
  for held in
    select cu.grant_id, cu.credits
      from credit_grant_uses cu
      join credit_grants g on g.id = cu.grant_id
     where cu.generation_id = p_generation_id
     order by g.ends_at, g.created_at
  loop
    v_share := least(held.credits, v_rest);
    v_rest := v_rest - v_share;
    v_last := held.grant_id;
    update credit_grants set used = used - held.credits + v_share where id = held.grant_id;
    if v_share > 0 then
      update credit_grant_uses set credits = v_share
       where generation_id = p_generation_id and grant_id = held.grant_id;
    else
      delete from credit_grant_uses
       where generation_id = p_generation_id and grant_id = held.grant_id;
    end if;
  end loop;

  if v_last is not null and v_rest > 0 then
    for rec in
      select g.id, g.credits - g.used as left_now
        from credit_grants g
       where g.org_id = p_org_id and g.starts_at <= now() and g.ends_at > now()
         and g.credits > g.used
       order by g.ends_at, g.created_at
    loop
      exit when v_rest <= 0;
      v_share := least(rec.left_now, v_rest);
      insert into credit_grant_uses (generation_id, grant_id, credits)
      values (p_generation_id, rec.id, v_share)
      on conflict (generation_id, grant_id)
        do update set credits = credit_grant_uses.credits + excluded.credits;
      update credit_grants set used = used + v_share where id = rec.id;
      v_rest := v_rest - v_share;
    end loop;

    if v_rest > 0 then
      insert into credit_grant_uses (generation_id, grant_id, credits)
      values (p_generation_id, v_last, v_rest)
      on conflict (generation_id, grant_id)
        do update set credits = credit_grant_uses.credits + excluded.credits;
      update credit_grants set used = used + v_rest where id = v_last;
    end if;
  end if;

  return true;
end;
$$;

-- A run failed or was cancelled: refund the hold (as refundReservation did) and give the held
-- credits back to their grants. False when the run was already settled or refunded.
create or replace function refund_credits(
  p_org_id uuid,
  p_generation_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved numeric;
begin
  perform 1 from organizations where id = p_org_id for update;

  if exists (
    select 1 from credit_transactions
     where generation_id = p_generation_id and type in ('refund', 'consumption')
  ) then
    return false;
  end if;

  select coalesce(sum(amount), 0) into v_reserved
    from credit_transactions
   where generation_id = p_generation_id and type = 'reservation';

  insert into credit_transactions (org_id, generation_id, amount, type)
  values (p_org_id, p_generation_id, -v_reserved, 'refund');

  update credit_grants g set used = g.used - cu.credits
    from credit_grant_uses cu
   where cu.grant_id = g.id and cu.generation_id = p_generation_id;

  delete from credit_grant_uses where generation_id = p_generation_id;

  return true;
end;
$$;

-- The agency's open grants, first-ending first, for the billing screens.
create or replace function credit_balance(p_org_id uuid)
returns table (
  grant_id uuid,
  kind text,
  credits numeric,
  used numeric,
  left_credits numeric,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.kind, g.credits, g.used, greatest(g.credits - g.used, 0), g.ends_at
    from credit_grants g
   where g.org_id = p_org_id and g.starts_at <= now() and g.ends_at > now()
   order by g.ends_at, g.created_at;
$$;

-- Yuvabe's billing changes from Admin (piece 2, spec 2026-11-20-admin-agency-billing-design.md).
-- Each locks the agency, makes the change and writes its billing_log row in one transaction.

create or replace function admin_set_billing_mode(
  p_org_id uuid,
  p_mode text,
  p_actor uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  select billing_mode into v_old from organizations where id = p_org_id for update;
  if not found or v_old = p_mode then
    return false;
  end if;

  update organizations set billing_mode = p_mode where id = p_org_id;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (p_org_id, p_actor, 'billing_mode',
          jsonb_build_object('billing_mode', v_old), jsonb_build_object('billing_mode', p_mode), p_reason);
  return true;
end;
$$;

-- Free credits or credits Yuvabe adds. Plan and top-up grants come only from payments.
create or replace function admin_grant_credits(
  p_org_id uuid,
  p_kind text,
  p_credits numeric,
  p_ends_at timestamptz,
  p_actor uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_kind not in ('free', 'admin') then
    raise exception 'admin_grant_credits: kind % is not allowed', p_kind;
  end if;

  perform 1 from organizations where id = p_org_id for update;
  if not found then
    return null;
  end if;

  insert into credit_grants (org_id, kind, credits, ends_at, created_by, reason)
  values (p_org_id, p_kind, p_credits, p_ends_at, p_actor, p_reason)
  returning id into v_id;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (p_org_id, p_actor, 'grant', null,
          jsonb_build_object('grant_id', v_id, 'kind', p_kind, 'credits', p_credits, 'ends_at', p_ends_at), p_reason);
  return v_id;
end;
$$;

-- Take back unused credits from one grant: never more than is left on it.
create or replace function admin_take_back_credits(
  p_grant_id uuid,
  p_credits numeric,
  p_actor uuid,
  p_reason text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_grant credit_grants%rowtype;
begin
  select org_id into v_org from credit_grants where id = p_grant_id;
  if not found then
    return 'not_found';
  end if;
  perform 1 from organizations where id = v_org for update;

  select * into v_grant from credit_grants where id = p_grant_id for update;
  if p_credits <= 0 or p_credits > greatest(v_grant.credits - v_grant.used, 0) then
    return 'too_many';
  end if;

  update credit_grants set credits = credits - p_credits where id = p_grant_id;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (v_org, p_actor, 'take_back',
          jsonb_build_object('grant_id', p_grant_id, 'kind', v_grant.kind, 'credits', v_grant.credits),
          jsonb_build_object('grant_id', p_grant_id, 'kind', v_grant.kind, 'credits', v_grant.credits - p_credits),
          p_reason);
  return 'ok';
end;
$$;

-- Move a grant's end date, or end it now (p_ends_at = now()).
create or replace function admin_set_grant_end(
  p_grant_id uuid,
  p_ends_at timestamptz,
  p_actor uuid,
  p_reason text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_grant credit_grants%rowtype;
  v_end timestamptz;
begin
  select org_id into v_org from credit_grants where id = p_grant_id;
  if not found then
    return 'not_found';
  end if;
  perform 1 from organizations where id = v_org for update;

  select * into v_grant from credit_grants where id = p_grant_id for update;
  v_end := greatest(p_ends_at, v_grant.starts_at + interval '1 second');
  update credit_grants set ends_at = v_end where id = p_grant_id;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (v_org, p_actor, 'grant_end',
          jsonb_build_object('grant_id', p_grant_id, 'kind', v_grant.kind, 'ends_at', v_grant.ends_at),
          jsonb_build_object('grant_id', p_grant_id, 'kind', v_grant.kind, 'ends_at', v_end),
          p_reason);
  return 'ok';
end;
$$;

revoke all on function reserve_credits_v2(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function reserve_credits_v2(uuid, uuid, numeric) to service_role;
revoke all on function settle_credits(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function settle_credits(uuid, uuid, numeric) to service_role;
revoke all on function refund_credits(uuid, uuid) from public, anon, authenticated;
grant execute on function refund_credits(uuid, uuid) to service_role;
revoke all on function credit_balance(uuid) from public, anon, authenticated;
grant execute on function credit_balance(uuid) to service_role;

revoke all on function admin_set_billing_mode(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function admin_set_billing_mode(uuid, text, uuid, text) to service_role;
revoke all on function admin_grant_credits(uuid, text, numeric, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function admin_grant_credits(uuid, text, numeric, timestamptz, uuid, text) to service_role;
revoke all on function admin_take_back_credits(uuid, numeric, uuid, text) from public, anon, authenticated;
grant execute on function admin_take_back_credits(uuid, numeric, uuid, text) to service_role;
revoke all on function admin_set_grant_end(uuid, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function admin_set_grant_end(uuid, timestamptz, uuid, text) to service_role;

notify pgrst, 'reload schema';
