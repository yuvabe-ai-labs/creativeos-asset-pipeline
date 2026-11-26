-- A plan paid by UPI or a bank mandate can't be moved to a new price (D593), so the owner approves
-- the new price or the plan ends (D595). Approving makes a second subscription at the new price that
-- starts on the day the old one ends; it waits beside the live plan as 'scheduled' and becomes the
-- plan when its first charge comes. Safe to re-run.

-- On the live plan (the one asked):
--   ends_unless_approved_at  the renewal the plan ends at unless the new price is approved: the first
--                            renewal at least 7 days after the owner was asked. Kept after approval
--                            (the old subscription still ends that day; the approved one starts).
--   approval_reminded_at     when the owners were reminded, 3 days before; once per ask.
-- On the approval subscription (status 'scheduled'):
--   approved_at              when the owner authorised it; null while the checkout isn't finished.
--   starts_at                its first charge; null when it starts at once.
alter table billing_subscriptions add column if not exists ends_unless_approved_at timestamptz;
alter table billing_subscriptions add column if not exists approval_reminded_at timestamptz;
alter table billing_subscriptions add column if not exists approved_at timestamptz;
alter table billing_subscriptions add column if not exists starts_at timestamptz;

alter table billing_subscriptions drop constraint if exists billing_subscriptions_status_check;
alter table billing_subscriptions add constraint billing_subscriptions_status_check
  check (status in ('created', 'scheduled', 'active', 'payment_due', 'cancelling', 'ended'));

-- One live plan per agency, as before, and at most one approval waiting beside it.
drop index if exists billing_subscriptions_one_live_idx;
create unique index if not exists billing_subscriptions_one_live_idx on billing_subscriptions (org_id)
  where status not in ('ended', 'scheduled');
create unique index if not exists billing_subscriptions_one_scheduled_idx on billing_subscriptions (org_id)
  where status = 'scheduled';

-- The plans asked to approve, for the nightly check (final cycle, reminders).
create index if not exists billing_subscriptions_ends_unless_approved_idx on billing_subscriptions (ends_unless_approved_at)
  where ends_unless_approved_at is not null and status <> 'ended';

-- 0103's reset, now also clearing the reminder: a new price to approve gets its own reminder.
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
    new.approval_reminded_at := null;
  end if;
  return new;
end;
$$;

-- Ends the agency's live plan when its approved subscription starts, so there is still one live
-- plan. Used by set_subscription_status and record_subscription_charge.
create or replace function billing_end_replaced_subscription(p_org_id uuid, p_keep uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update billing_subscriptions s
     set status = 'ended', cancel_at_period_end = false, ended_at = coalesce(s.ended_at, now()), updated_at = now()
   where s.org_id = p_org_id and s.id <> p_keep and s.status not in ('ended', 'scheduled');
$$;

-- 0098's forward-only status, plus an approval subscription: 'created' (authorised or not) changes
-- nothing; starting (active, or payment due when its first charge fails) makes it the plan.
create or replace function set_subscription_status(
  p_razorpay_subscription_id text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub billing_subscriptions%rowtype;
begin
  select * into v_sub from billing_subscriptions s
   where s.razorpay_subscription_id = p_razorpay_subscription_id for update;
  if not found or v_sub.status = 'ended' then
    return false;
  end if;
  if p_status = 'payment_due' and p_period_end is not null and v_sub.current_period_end is not null
     and p_period_end < v_sub.current_period_end then
    return false;
  end if;
  if v_sub.status = 'scheduled' then
    if p_status not in ('active', 'payment_due', 'ended') then
      return false;
    end if;
    if p_status <> 'ended' then
      update billing_subscriptions s set approved_at = coalesce(s.approved_at, now()) where s.id = v_sub.id;
      perform billing_end_replaced_subscription(v_sub.org_id, v_sub.id);
    end if;
  end if;

  update billing_subscriptions s
     set status = case when p_status = 'active' and s.status = 'cancelling' then 'cancelling' else p_status end,
         current_period_start = case when p_period_end is not null and (s.current_period_end is null or p_period_end >= s.current_period_end)
                                     then coalesce(p_period_start, s.current_period_start) else s.current_period_start end,
         current_period_end = greatest(s.current_period_end, p_period_end),
         payment_due_since = case when p_status = 'payment_due' then coalesce(s.payment_due_since, now()) else null end,
         ended_at = case when p_status = 'ended' then coalesce(s.ended_at, now()) else s.ended_at end,
         updated_at = now()
   where s.id = v_sub.id;
  return true;
end;
$$;

-- 0098's charge, plus an approval subscription's first charge: it becomes the plan (the one it
-- replaces ends) and counts as approved even if the authorisation webhook never came.
create or replace function record_subscription_charge(
  p_razorpay_subscription_id text,
  p_razorpay_plan_id text,
  p_payment_id text,
  p_order_id text,
  p_total_minor bigint,
  p_period_start timestamptz,
  p_period_end timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub billing_subscriptions%rowtype;
  v_price billing_prices%rowtype;
  v_rate numeric;
  v_kind text;
  v_payment uuid;
  v_latest boolean;
begin
  select * into v_sub from billing_subscriptions s
   where s.razorpay_subscription_id = p_razorpay_subscription_id for update;
  if not found then
    return false;
  end if;

  if exists (select 1 from billing_payments bp where bp.razorpay_payment_id = p_payment_id) then
    return false;
  end if;

  if v_sub.status = 'scheduled' then
    update billing_subscriptions s set approved_at = coalesce(s.approved_at, now()) where s.id = v_sub.id;
    perform billing_end_replaced_subscription(v_sub.org_id, v_sub.id);
  end if;

  select * into v_price from billing_prices pr where pr.razorpay_plan_id = p_razorpay_plan_id;
  if not found then
    select * into v_price from billing_prices pr where pr.id = v_sub.price_id;
  end if;

  select bs.inr_per_usd into v_rate from billing_settings bs
   where bs.effective_from <= now() order by bs.effective_from desc limit 1;

  v_kind := case when exists (
    select 1 from billing_payments bp
     where bp.subscription_id = v_sub.id and bp.status = 'paid'
  ) then 'renewal' else 'plan' end;

  insert into billing_payments (org_id, razorpay_order_id, razorpay_payment_id, amount_paise, credits, status,
                                kind, price_id, subscription_id, currency, tax_minor, total_minor, inr_per_usd, paid_at)
  values (v_sub.org_id, coalesce(p_order_id, 'sub_' || p_payment_id), p_payment_id, v_price.amount_minor,
          ceil(v_price.credits)::integer, 'paid', v_kind, v_price.id, v_sub.id, v_price.currency,
          greatest(p_total_minor - v_price.amount_minor, 0), p_total_minor, v_rate, now())
  returning id into v_payment;

  v_latest := v_sub.current_period_end is null or p_period_end >= v_sub.current_period_end;

  if v_latest and v_sub.status <> 'ended' then
    update billing_subscriptions s
       set status = case when s.status = 'cancelling' then 'cancelling' else 'active' end,
           price_id = v_price.id,
           next_price_id = case when s.next_price_id = v_price.id then null else s.next_price_id end,
           current_period_start = p_period_start,
           current_period_end = p_period_end,
           payment_due_since = null,
           updated_at = now()
     where s.id = v_sub.id;
  end if;

  insert into credit_grants (org_id, kind, credits, starts_at, ends_at, payment_id, price_id, subscription_id, reason)
  values (v_sub.org_id, 'plan', v_price.credits, least(now(), p_period_end - interval '1 second'), p_period_end,
          v_payment, v_price.id, v_sub.id,
          case when v_kind = 'plan' then 'First payment' else 'Monthly renewal' end);

  return true;
end;
$$;

-- 0103's record_plan_move, plus the end date when the refusal is UPI or a bank mandate: the first
-- renewal at least 7 days from now (the owner is asked now), never earlier than a date given before.
-- Any other answer clears it.
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
  v_ends timestamptz;
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

  if p_refused in ('upi', 'emandate') then
    v_ends := coalesce(v_sub.current_period_end, now());
    while v_ends < now() + interval '7 days' loop
      v_ends := v_ends + interval '1 month';
    end loop;
    v_ends := greatest(v_ends, v_sub.ends_unless_approved_at);
  end if;

  update billing_subscriptions s
     set next_price_scheduled_at = case when p_refused is null then now() else null end,
         next_price_refused = p_refused,
         ends_unless_approved_at = v_ends,
         updated_at = now()
   where s.id = p_subscription_id;

  select * into v_from from billing_prices pr where pr.id = v_sub.price_id;
  select * into v_to from billing_prices pr where pr.id = p_price_id;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (v_sub.org_id, null, 'plan_move',
          jsonb_build_object('price_id', v_from.id, 'amount_minor', v_from.amount_minor, 'credits', v_from.credits),
          jsonb_build_object('price_id', v_to.id, 'amount_minor', v_to.amount_minor, 'credits', v_to.credits,
                             'starts_at', v_sub.current_period_end, 'refused', p_refused, 'ends_at', v_ends),
          null);
  return true;
end;
$$;

-- The owner authorised the approval subscription (subscription.authenticated, or the nightly check).
-- Once: the live plan no longer waits for an answer (its next price is cleared; it still ends on its
-- date, when the approved one starts). One billing_log row. False: not an approval waiting, or
-- already recorded.
create or replace function record_price_approval(p_razorpay_subscription_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new billing_subscriptions%rowtype;
  v_old billing_subscriptions%rowtype;
  v_from billing_prices%rowtype;
  v_to billing_prices%rowtype;
begin
  select * into v_new from billing_subscriptions s
   where s.razorpay_subscription_id = p_razorpay_subscription_id for update;
  if not found or v_new.status <> 'scheduled' or v_new.approved_at is not null then
    return false;
  end if;

  update billing_subscriptions s set approved_at = now(), updated_at = now() where s.id = v_new.id;

  select * into v_old from billing_subscriptions s
   where s.org_id = v_new.org_id and s.status not in ('ended', 'scheduled') for update;
  if found then
    update billing_subscriptions s set next_price_id = null, updated_at = now() where s.id = v_old.id;
    select * into v_from from billing_prices pr where pr.id = v_old.price_id;
  end if;
  select * into v_to from billing_prices pr where pr.id = v_new.price_id;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (v_new.org_id, null, 'price_approved',
          case when v_from.id is null then null
               else jsonb_build_object('price_id', v_from.id, 'amount_minor', v_from.amount_minor, 'credits', v_from.credits) end,
          jsonb_build_object('price_id', v_to.id, 'amount_minor', v_to.amount_minor, 'credits', v_to.credits,
                             'starts_at', coalesce(v_new.starts_at, now())),
          null);
  return true;
end;
$$;

-- A plan asked to approve has ended. Without an approved subscription to follow it, the approvals
-- never authorised end with it, and when it ended on its date (not earlier, e.g. unpaid) the agency's
-- log says the new price wasn't approved. Fires for every way a plan ends (webhook, nightly, owner).
create or replace function billing_subscriptions_on_end()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_price billing_prices%rowtype;
begin
  if new.ends_unless_approved_at is null or old.status = 'scheduled' then
    return null;
  end if;
  if exists (select 1 from billing_subscriptions x
              where x.org_id = new.org_id and x.id <> new.id and x.approved_at is not null and x.status <> 'ended') then
    return null;
  end if;

  update billing_subscriptions x
     set status = 'ended', ended_at = coalesce(x.ended_at, now()), updated_at = now()
   where x.org_id = new.org_id and x.status = 'scheduled' and x.approved_at is null;

  if now() < new.ends_unless_approved_at - interval '12 hours' then
    return null;
  end if;
  select * into v_price from billing_prices pr where pr.id = new.next_price_id;
  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (new.org_id, null, 'price_not_approved',
          jsonb_build_object('price_id', new.price_id),
          jsonb_build_object('price_id', v_price.id, 'amount_minor', v_price.amount_minor, 'credits', v_price.credits,
                             'ends_at', new.ends_unless_approved_at),
          null);
  return null;
end;
$$;

drop trigger if exists billing_subscriptions_on_end on billing_subscriptions;
create trigger billing_subscriptions_on_end
  after update of status on billing_subscriptions
  for each row when (new.status = 'ended' and old.status <> 'ended')
  execute function billing_subscriptions_on_end();

-- 0103's save, plus approval subscriptions on the old price: they move from their own first
-- renewal (and, paid the same way, are asked again then).
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
         where s.status in ('created', 'scheduled', 'active', 'payment_due')
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

-- 0103's grouping, plus plans in their final cycle that still wait for approval (cancelling with an
-- end date) and when the asked plans end. The return type changes, so it is dropped first.
drop function if exists admin_price_moves();
create function admin_price_moves()
returns table (
  price_id uuid,
  next_price_id uuid,
  state text,
  refused text,
  agencies integer,
  first_renewal timestamptz,
  last_renewal timestamptz,
  first_end timestamptz,
  last_end timestamptz,
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
         min(s.ends_unless_approved_at),
         max(s.ends_unless_approved_at),
         case when s.next_price_refused is null then '[]'::jsonb
              else jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'ends_at', s.ends_unless_approved_at) order by o.name) end
    from billing_subscriptions s
    join organizations o on o.id = s.org_id
   where (s.status in ('active', 'payment_due') or (s.status = 'cancelling' and s.ends_unless_approved_at is not null))
     and s.next_price_id is not null
   group by s.price_id, s.next_price_id, 3, s.next_price_refused;
$$;

-- Plans refused as UPI or a bank mandate under 0103 kept their price. Under D595 their owners are
-- asked: clearing the refusal puts them back in the moves to set up, and the next run refuses them
-- again with an end date and the email.
update billing_subscriptions s
   set next_price_refused = null, updated_at = now()
 where s.next_price_refused in ('upi', 'emandate')
   and s.next_price_id is not null
   and s.ends_unless_approved_at is null
   and s.status in ('active', 'payment_due');

revoke all on function billing_end_replaced_subscription(uuid, uuid) from public, anon, authenticated;
grant execute on function billing_end_replaced_subscription(uuid, uuid) to service_role;
revoke all on function set_subscription_status(text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function set_subscription_status(text, text, timestamptz, timestamptz) to service_role;
revoke all on function record_subscription_charge(text, text, text, text, bigint, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function record_subscription_charge(text, text, text, text, bigint, timestamptz, timestamptz) to service_role;
revoke all on function record_plan_move(uuid, uuid, text) from public, anon, authenticated;
grant execute on function record_plan_move(uuid, uuid, text) to service_role;
revoke all on function record_price_approval(text) from public, anon, authenticated;
grant execute on function record_price_approval(text) to service_role;
revoke all on function admin_save_offer(uuid, text, text, text, boolean, bigint, numeric, integer, uuid, text) from public, anon, authenticated;
grant execute on function admin_save_offer(uuid, text, text, text, boolean, bigint, numeric, integer, uuid, text) to service_role;
revoke all on function admin_price_moves() from public, anon, authenticated;
grant execute on function admin_price_moves() to service_role;
revoke all on function billing_subscriptions_next_price_reset() from public, anon, authenticated;
revoke all on function billing_subscriptions_on_end() from public, anon, authenticated;

notify pgrst, 'reload schema';
