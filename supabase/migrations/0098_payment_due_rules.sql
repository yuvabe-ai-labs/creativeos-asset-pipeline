-- Failed payments, done the way subscription products do it (spec 2026-11-21-failed-payments-design.md,
-- D585): when a payment became due, and plan states that only move forward. Razorpay may send
-- events late, twice or out of order; a late "pending" must never undo a later charge.

alter table billing_subscriptions add column payment_due_since timestamptz;

-- The due plans the nightly check ends after 30 days.
create index billing_subscriptions_payment_due_since_idx on billing_subscriptions (payment_due_since)
  where payment_due_since is not null;

-- Subscription events other than charges. Forward only:
--   an ended plan stays ended;
--   "payment due" for a period older than the one already paid is a late event and is ignored.
-- payment_due_since starts when a payment first becomes due and clears when it no longer is.
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

-- subscription.charged (and the nightly check, for charges whose webhook never came). Records the
-- payment once and writes its month's plan grant. Only a charge for the latest period moves the plan
-- forward (active, paid period, no payment due); an older charge found late adds its payment and
-- grant but never moves the period back.
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

  -- The month's credits. A charge for a month already over writes a grant that has already ended
  -- (kept for the record; it never counts).
  insert into credit_grants (org_id, kind, credits, starts_at, ends_at, payment_id, price_id, subscription_id, reason)
  values (v_sub.org_id, 'plan', v_price.credits, least(now(), p_period_end - interval '1 second'), p_period_end,
          v_payment, v_price.id, v_sub.id,
          case when v_kind = 'plan' then 'First payment' else 'Monthly renewal' end);

  return true;
end;
$$;

revoke all on function set_subscription_status(text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function set_subscription_status(text, text, timestamptz, timestamptz) to service_role;
revoke all on function record_subscription_charge(text, text, text, text, bigint, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function record_subscription_charge(text, text, text, text, bigint, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
