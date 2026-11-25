-- Razorpay test top-up (spec 2026-11-19-razorpay-test-top-up-design.md, D573).
-- One row per Razorpay order. Only the server writes (service role); an agency's owners read
-- their own rows, like credit_transactions since 0065.
create table billing_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  amount_paise integer not null check (amount_paise > 0),
  credits integer not null check (credits > 0),
  status text not null default 'created' check (status in ('created', 'paid')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index billing_payments_org_id_idx on billing_payments (org_id);

alter table billing_payments enable row level security;

create policy "owners read" on billing_payments for select
  using (exists (
    select 1 from org_memberships m
     where m.user_id = auth.uid() and m.org_id = billing_payments.org_id and m.is_owner
  ));

-- Called by the Razorpay webhook on order.paid. One transaction: lock the order's row; a
-- missing or already-paid order changes nothing (a repeated webhook adds no credits). Else mark
-- it paid and write minus its credits as an adjustment: reserve_credits sums this month's rows,
-- so the agency can use that many more credits until the month ends. True when credits were added.
create or replace function record_razorpay_payment(p_order_id text, p_payment_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row billing_payments%rowtype;
begin
  select * into v_row from billing_payments where razorpay_order_id = p_order_id for update;
  if not found or v_row.status = 'paid' then
    return false;
  end if;

  update billing_payments
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
   where id = v_row.id;

  insert into credit_transactions (org_id, amount, type)
  values (v_row.org_id, -v_row.credits, 'adjustment');

  return true;
end;
$$;

revoke all on function record_razorpay_payment(text, text) from public, anon, authenticated;
grant execute on function record_razorpay_payment(text, text) to service_role;

notify pgrst, 'reload schema';
