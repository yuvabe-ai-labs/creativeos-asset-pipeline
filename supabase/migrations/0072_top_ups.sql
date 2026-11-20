-- Billing piece 4: top-ups (spec 2026-11-21-top-ups-design.md, D522). record_razorpay_payment now
-- writes a top-up grant for a top-up payment; a test payment keeps its 0066 behaviour.

-- Called by the Razorpay webhook on order.paid. One transaction: lock the payment row; a missing or
-- already-paid order changes nothing (a repeated webhook adds no credits). A top-up writes a
-- 'topup' grant ending with the plan's paid month (or after the price's valid_days); if the plan
-- has no paid month left, the credits last 30 days so a paid top-up is never lost.
create or replace function record_razorpay_payment(p_order_id text, p_payment_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row billing_payments%rowtype;
  v_valid_days integer;
  v_period_end timestamptz;
  v_ends timestamptz;
begin
  select * into v_row from billing_payments bp where bp.razorpay_order_id = p_order_id for update;
  if not found or v_row.status = 'paid' then
    return false;
  end if;

  update billing_payments bp
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
   where bp.id = v_row.id;

  if v_row.kind = 'topup' then
    select pr.valid_days into v_valid_days from billing_prices pr where pr.id = v_row.price_id;
    select s.current_period_end into v_period_end from billing_subscriptions s where s.id = v_row.subscription_id;

    v_ends := case
      when v_valid_days is not null then now() + make_interval(days => v_valid_days)
      when v_period_end is not null and v_period_end > now() then v_period_end
      else now() + interval '30 days'
    end;

    insert into credit_grants (org_id, kind, credits, starts_at, ends_at, payment_id, price_id, subscription_id, created_by, reason)
    values (v_row.org_id, 'topup', v_row.credits, now(), v_ends, v_row.id, v_row.price_id, v_row.subscription_id,
            v_row.created_by, 'Top-up');
  else
    -- The test top-up (D514): minus its credits as an adjustment, as in 0066.
    insert into credit_transactions (org_id, amount, type)
    values (v_row.org_id, -v_row.credits, 'adjustment');
  end if;

  return true;
end;
$$;

revoke all on function record_razorpay_payment(text, text) from public, anon, authenticated;
grant execute on function record_razorpay_payment(text, text) to service_role;

notify pgrst, 'reload schema';
