-- A changed plan price moves the agencies on it for real (D593). admin_save_offer still marks each
-- plan on the old price (next_price_id); a background task then asks Razorpay to charge the new
-- plan from the next renewal and records here whether it could. Safe to re-run.

-- Where a marked plan's move stands. Both are about next_price_id and mean nothing without it:
--   next_price_scheduled_at  when Razorpay agreed to charge next_price_id from the next renewal
--                            (an admin move, or the owner's own change). Null: not set up yet.
--   next_price_refused       why Razorpay can't move it: 'upi' or 'emandate' (a plan paid that way
--                            can't be changed) or 'other'. The agency keeps its price until it
--                            changes plan. Null: not refused.
alter table billing_subscriptions add column if not exists next_price_scheduled_at timestamptz;
alter table billing_subscriptions add column if not exists next_price_refused text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billing_subscriptions_next_price_refused_check') then
    alter table billing_subscriptions
      add constraint billing_subscriptions_next_price_refused_check
      check (next_price_refused is null or next_price_refused in ('upi', 'emandate', 'other'));
  end if;
end $$;

-- A new next_price_id (or none) starts with no answer from Razorpay, unless the same update says
-- what Razorpay answered (the owner's own change is scheduled before it is saved). So a renewal
-- that clears next_price_id (record_subscription_charge) clears these too.
create or replace function billing_subscriptions_next_price_reset()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.next_price_id is distinct from old.next_price_id then
    if new.next_price_scheduled_at is not distinct from old.next_price_scheduled_at then
      new.next_price_scheduled_at := null;
    end if;
    if new.next_price_refused is not distinct from old.next_price_refused then
      new.next_price_refused := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists billing_subscriptions_next_price_reset on billing_subscriptions;
create trigger billing_subscriptions_next_price_reset
  before update of next_price_id on billing_subscriptions
  for each row execute function billing_subscriptions_next_price_reset();

-- The moves still to set up on Razorpay: what the task and the nightly check read.
create index if not exists billing_subscriptions_pending_move_idx on billing_subscriptions (updated_at)
  where next_price_id is not null and next_price_scheduled_at is null and next_price_refused is null
    and status <> 'ended';

-- 0094's one-step save, with who moves made exact: plans that are running (active, payment due)
-- and checkouts not yet paid ('created', moved once they are). A cancelled plan ends at its period
-- end, so it is left alone. A plan whose owner chose another price keeps that choice. moved_count
-- counts the running plans, the ones Admin sees on the price.
create or replace function admin_save_offer(
  p_product_id uuid,
  p_kind text,
  p_name text,
  p_description text,
  p_active boolean,
  p_amount_minor bigint,
  p_credits numeric,
  p_interval_months integer,
  p_actor uuid,
  p_reason text
) returns table (product_id uuid, price_changed boolean, moved_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product billing_products%rowtype;
  v_price billing_prices%rowtype;
  v_product_id uuid;
  v_new_price uuid;
  v_changed boolean := false;
  v_moved integer := 0;
begin
  if p_product_id is null then
    insert into billing_products (kind, name, description, active)
    values (p_kind, p_name, p_description, coalesce(p_active, true))
    returning id into v_product_id;

    insert into billing_prices (product_id, amount_minor, interval_months, credits, credits_every_months)
    values (v_product_id, p_amount_minor, p_interval_months, p_credits,
            case when p_interval_months is null then null else 1 end)
    returning id into v_new_price;

    insert into billing_log (org_id, actor_id, action, before, after, reason)
    values (null, p_actor, 'offer', null,
            jsonb_build_object('product_id', v_product_id, 'kind', p_kind, 'name', p_name, 'price_id', v_new_price,
                               'amount_minor', p_amount_minor, 'credits', p_credits, 'interval_months', p_interval_months),
            p_reason);
    return query select v_product_id, true, 0;
    return;
  end if;

  select * into v_product from billing_products bp where bp.id = p_product_id for update;
  if not found then
    raise exception 'admin_save_offer: product % not found', p_product_id;
  end if;

  update billing_products bp
     set name = p_name, description = p_description, active = coalesce(p_active, bp.active), updated_at = now()
   where bp.id = p_product_id;

  -- The price in force for this interval: the newest active one.
  select * into v_price
    from billing_prices pr
   where pr.product_id = p_product_id and pr.active
     and pr.interval_months is not distinct from p_interval_months
   order by pr.created_at desc
   limit 1
   for update;

  if not found or v_price.amount_minor <> p_amount_minor or v_price.credits <> p_credits then
    v_changed := true;
    insert into billing_prices (product_id, amount_minor, interval_months, credits, credits_every_months)
    values (p_product_id, p_amount_minor, p_interval_months, p_credits,
            case when p_interval_months is null then null else 1 end)
    returning id into v_new_price;

    if v_price.id is not null then
      update billing_prices pr set active = false where pr.id = v_price.id;
      with moved as (
        update billing_subscriptions s
           set next_price_id = v_new_price, next_price_scheduled_at = null, next_price_refused = null, updated_at = now()
         where s.status in ('created', 'active', 'payment_due')
           and ((s.price_id = v_price.id and s.next_price_id is null) or s.next_price_id = v_price.id)
        returning s.status
      )
      select count(*) filter (where moved.status in ('active', 'payment_due'))::integer into v_moved from moved;
    end if;
  end if;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (null, p_actor, 'offer',
          jsonb_build_object('product_id', p_product_id, 'name', v_product.name, 'active', v_product.active,
                             'price_id', v_price.id, 'amount_minor', v_price.amount_minor, 'credits', v_price.credits),
          jsonb_build_object('product_id', p_product_id, 'name', p_name, 'active', coalesce(p_active, v_product.active),
                             'price_id', coalesce(v_new_price, v_price.id), 'amount_minor', p_amount_minor,
                             'credits', p_credits, 'moved', v_moved),
          p_reason);

  return query select p_product_id, v_changed, v_moved;
end;
$$;

-- What Razorpay answered for one plan's move to p_price_id: scheduled (p_refused null) or refused
-- (why). Only while the plan is still meant to move there, and only when the answer is new, so a
-- re-run writes nothing twice. One billing_log row on the agency for each answer. False: nothing
-- changed (the plan moved on, or this answer was already saved).
create or replace function record_plan_move(
  p_subscription_id uuid,
  p_price_id uuid,
  p_refused text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub billing_subscriptions%rowtype;
  v_from billing_prices%rowtype;
  v_to billing_prices%rowtype;
begin
  if p_refused is not null and p_refused not in ('upi', 'emandate', 'other') then
    raise exception 'record_plan_move: unknown refusal %', p_refused;
  end if;

  select * into v_sub from billing_subscriptions s where s.id = p_subscription_id for update;
  if not found or v_sub.status = 'ended' or v_sub.next_price_id is distinct from p_price_id then
    return false;
  end if;
  if (p_refused is null and v_sub.next_price_scheduled_at is not null and v_sub.next_price_refused is null)
     or (p_refused is not null and v_sub.next_price_refused = p_refused) then
    return false;
  end if;

  update billing_subscriptions s
     set next_price_scheduled_at = case when p_refused is null then now() else null end,
         next_price_refused = p_refused,
         updated_at = now()
   where s.id = p_subscription_id;

  select * into v_from from billing_prices pr where pr.id = v_sub.price_id;
  select * into v_to from billing_prices pr where pr.id = p_price_id;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (v_sub.org_id, null, 'plan_move',
          jsonb_build_object('price_id', v_from.id, 'amount_minor', v_from.amount_minor, 'credits', v_from.credits),
          jsonb_build_object('price_id', v_to.id, 'amount_minor', v_to.amount_minor, 'credits', v_to.credits,
                             'starts_at', v_sub.current_period_end, 'refused', p_refused),
          null);
  return true;
end;
$$;

-- Plans marked to move, grouped for Admin › Plans and prices: per price they are on and price they
-- move to, how many are set up on Razorpay, waiting (not set up yet: a payment due, a checkout not
-- yet paid, or the task hasn't reached them) or refused (by reason), their first and last renewal,
-- and the agencies that were refused (they need a look). Running plans only (active, payment due).
create or replace function admin_price_moves()
returns table (
  price_id uuid,
  next_price_id uuid,
  state text,
  refused text,
  agencies integer,
  first_renewal timestamptz,
  last_renewal timestamptz,
  orgs jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select s.price_id,
         s.next_price_id,
         case when s.next_price_refused is not null then 'refused'
              when s.next_price_scheduled_at is not null then 'scheduled'
              else 'waiting' end as state,
         s.next_price_refused,
         count(*)::integer,
         min(s.current_period_end),
         max(s.current_period_end),
         case when s.next_price_refused is null then '[]'::jsonb
              else jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name) end
    from billing_subscriptions s
    join organizations o on o.id = s.org_id
   where s.status in ('active', 'payment_due')
     and s.next_price_id is not null
   group by s.price_id, s.next_price_id, 3, s.next_price_refused;
$$;

revoke all on function admin_save_offer(uuid, text, text, text, boolean, bigint, numeric, integer, uuid, text) from public, anon, authenticated;
grant execute on function admin_save_offer(uuid, text, text, text, boolean, bigint, numeric, integer, uuid, text) to service_role;
revoke all on function record_plan_move(uuid, uuid, text) from public, anon, authenticated;
grant execute on function record_plan_move(uuid, uuid, text) to service_role;
revoke all on function admin_price_moves() from public, anon, authenticated;
grant execute on function admin_price_moves() to service_role;
revoke all on function billing_subscriptions_next_price_reset() from public, anon, authenticated;

notify pgrst, 'reload schema';
