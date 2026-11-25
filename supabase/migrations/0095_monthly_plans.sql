-- Billing piece 5: monthly plans through Razorpay Subscriptions (spec
-- 2026-11-21-monthly-plans-design.md, D580). A charge records the payment, sets the paid period and
-- writes the month's plan grant in one transaction; a failed or unapproved payment stops AI runs.

-- Razorpay's subscription.charged. False for an unknown subscription or a payment already recorded
-- (a repeated webhook adds nothing). The plan Razorpay charged decides the price, so a change
-- scheduled for the cycle end lands with the first charge on the new plan.
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
begin
  select * into v_sub from billing_subscriptions s
   where s.razorpay_subscription_id = p_razorpay_subscription_id for update;
  if not found then
    return false;
  end if;

  if exists (select 1 from billing_payments bp where bp.razorpay_payment_id = p_payment_id) then
    return false;
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

  update billing_subscriptions s
     set status = case when s.status = 'cancelling' then 'cancelling' else 'active' end,
         price_id = v_price.id,
         next_price_id = case when s.next_price_id = v_price.id then null else s.next_price_id end,
         current_period_start = p_period_start,
         current_period_end = p_period_end,
         updated_at = now()
   where s.id = v_sub.id;

  insert into credit_grants (org_id, kind, credits, starts_at, ends_at, payment_id, price_id, subscription_id, reason)
  values (v_sub.org_id, 'plan', v_price.credits, now(), p_period_end, v_payment, v_price.id, v_sub.id,
          case when v_kind = 'plan' then 'First payment' else 'Monthly renewal' end);

  return true;
end;
$$;

-- Razorpay's other subscription events: activated, resumed, pending, halted, cancelled, completed.
-- The paid period is updated only when the event carries one.
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
begin
  update billing_subscriptions s
     set status = p_status,
         current_period_start = coalesce(p_period_start, s.current_period_start),
         current_period_end = coalesce(p_period_end, s.current_period_end),
         ended_at = case when p_status = 'ended' then coalesce(s.ended_at, now()) else s.ended_at end,
         updated_at = now()
   where s.razorpay_subscription_id = p_razorpay_subscription_id;
  return found;
end;
$$;

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
    -- A failed or unapproved payment stops AI runs at once, whatever credits are left (20 Nov).
    if exists (
      select 1 from billing_subscriptions s
       where s.org_id = p_org_id and s.status = 'payment_due'
    ) then
      return 'payment_due';
    end if;

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

revoke all on function record_subscription_charge(text, text, text, text, bigint, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function record_subscription_charge(text, text, text, text, bigint, timestamptz, timestamptz) to service_role;
revoke all on function set_subscription_status(text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function set_subscription_status(text, text, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
